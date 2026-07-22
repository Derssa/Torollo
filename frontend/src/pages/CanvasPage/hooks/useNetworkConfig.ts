import { useState, useMemo, useRef, useCallback, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import type { ContainerData } from '../../../shared/types';
import { API_BASE } from '../../../shared/types';
import type { NetworkConfig } from '../../../shared/types/network';
import { validateArchitecture } from '../../../shared/utils/architectureValidator';
import { readErrorMessage } from '../../../shared/utils/readErrorMessage';
import { autoGrowContainers } from '../utils/networkConfigOps';

interface UseNetworkConfigArgs {
  projectId: string;
  containers: ContainerData[];
  showNotification: (notification: { type: 'error' | 'warning' | 'success'; message: string }) => void;
}

/**
 * Owns the network config: state, backend fetch (with localStorage fallback),
 * the save path (localStorage + backend sync, applying the server's corrected
 * config from the response) and the architecture audit toasts.
 */
export function useNetworkConfig({ projectId, containers, showNotification }: UseNetworkConfigArgs) {
  const { t } = useTranslation();
  const prevDbCountRef = useRef(0);
  const hasShownCacheWarningRef = useRef(false);

  const defaultVpcConfig = useMemo(() => ({
    name: 'Main Network',
    cidr: '10.0.0.0/16',
    dnsEnabled: true,
    igwEnabled: true,
    description: 'Project-wide Virtual Private Cloud'
  }), []);

  const [networkConfig, setNetworkConfig] = useState<NetworkConfig>({
    vpcConfig: defaultVpcConfig,
    subnets: [],
    nodeSubnetMap: {},
    nodeSecurityGroups: {},
    nodeIpMap: {}
  });

  // True when the backend's real inter-subnet self-test found that this host
  // drops routed traffic between subnet networks (see the canvas warning
  // banner). Refreshed after every config fetch/save — the save applies
  // enforcement synchronously, so the verdict is fresh by the time it returns.
  const [interSubnetBlocked, setInterSubnetBlocked] = useState(false);

  const refreshNetworkHealth = useCallback(() => {
    fetch(`${API_BASE}/api/projects/${projectId}/network-health`)
      .then(res => (res.ok ? res.json() : null))
      .then(data => setInterSubnetBlocked(data?.interSubnet === 'blocked'))
      .catch(() => {});
  }, [projectId]);

  useEffect(() => {
    refreshNetworkHealth();
  }, [refreshNetworkHealth]);

  const saveNetworkConfig = useCallback((newConfig: NetworkConfig) => {
    const grownConfig = autoGrowContainers(newConfig);
    setNetworkConfig(grownConfig);
    localStorage.setItem(`akal-lab-network-config-${projectId}`, JSON.stringify(grownConfig));

    // Sync to backend to trigger runtime enforcement
    return fetch(`${API_BASE}/api/projects/${projectId}/network-config`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ networkConfig: grownConfig })
    })
    .then(async res => {
      if (!res.ok) {
        throw new Error(await readErrorMessage(res, `Failed to save network config (HTTP ${res.status})`));
      }
      return res.json();
    })
    .then(data => {
      if (data && data.vpcConfig) {
        setNetworkConfig(data);
        localStorage.setItem(`akal-lab-network-config-${projectId}`, JSON.stringify(data));
      }
      refreshNetworkHealth();
    })
    .catch(err => {
      console.error('Failed to sync network configuration to backend:', err);
      throw err;
    });
  }, [projectId, refreshNetworkHealth]);

  const fetchNetworkConfig = useCallback(() => {
    fetch(`${API_BASE}/api/projects/${projectId}/network-config`)
      .then(res => res.json())
      .then(data => {
        if (data && data.vpcConfig) {
          setNetworkConfig(data);
          localStorage.setItem(`akal-lab-network-config-${projectId}`, JSON.stringify(data));
        } else {
          const savedConfig = localStorage.getItem(`akal-lab-network-config-${projectId}`);
          if (savedConfig) {
            const parsed = JSON.parse(savedConfig);
            if (!parsed.vpcConfig) {
              parsed.vpcConfig = defaultVpcConfig;
            }
            setNetworkConfig(parsed);
          } else {
            setNetworkConfig({
              vpcConfig: defaultVpcConfig,
              subnets: [],
              nodeSubnetMap: {},
              nodeSecurityGroups: {},
              nodeIpMap: {}
            });
          }
        }
      })
      .catch(err => {
        console.error('Failed to fetch network config from backend, using localStorage:', err);
        const savedConfig = localStorage.getItem(`akal-lab-network-config-${projectId}`);
        if (savedConfig) {
          try {
            const parsed = JSON.parse(savedConfig);
            if (!parsed.vpcConfig) {
              parsed.vpcConfig = defaultVpcConfig;
            }
            setNetworkConfig(parsed);
          } catch (e) {
            console.error(e);
          }
        }
      });
  }, [projectId, defaultVpcConfig]);

  const triggerArchitectureAudit = useCallback((configToValidate: NetworkConfig) => {
    const result = validateArchitecture(configToValidate, containers);

    // Detect DB nodes count
    const currentDbCount = containers.filter(c => ['postgres', 'sql', 'nosql'].includes(c.type || '')).length;
    if (currentDbCount > prevDbCountRef.current) {
      hasShownCacheWarningRef.current = false;
    }
    prevDbCountRef.current = currentDbCount;

    let warnings = result.warnings;
    const hasCacheWarning = warnings.some(w => w.key === 'noCachingTier');

    if (hasCacheWarning) {
      if (hasShownCacheWarningRef.current) {
        // Filter it out so it doesn't toast again
        warnings = warnings.filter(w => w.key !== 'noCachingTier');
      } else {
        // Mark as shown so subsequent non-add actions don't trigger it
        hasShownCacheWarningRef.current = true;
      }
    } else {
      if (currentDbCount === 0) {
        hasShownCacheWarningRef.current = false;
      }
    }

    // Resolve the finding's translation key against the active UI language here,
    // at display time — the validator is language-neutral.
    if (result.errors.length > 0) {
      const m = result.errors[0];
      showNotification({ type: 'error', message: t(`audit.${m.key}`, m.params) });
    } else if (warnings.length > 0) {
      const m = warnings[0];
      showNotification({ type: 'warning', message: t(`audit.${m.key}`, m.params) });
    } else if (result.successes.length > 0) {
      const m = result.successes[0];
      showNotification({ type: 'success', message: t(`audit.${m.key}`, m.params) });
    }
  }, [containers, showNotification, t]);

  return { networkConfig, saveNetworkConfig, fetchNetworkConfig, triggerArchitectureAudit, interSubnetBlocked };
}
