import { useState, useMemo, useRef, useCallback } from 'react';
import type { ContainerData } from '../../../shared/types';
import { API_BASE } from '../../../shared/types';
import type { NetworkConfig } from '../../../shared/types/network';
import { validateArchitecture } from '../../../shared/utils/architectureValidator';
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
    .then(res => {
      if (!res.ok) {
        throw new Error(`Failed to save network config (HTTP ${res.status})`);
      }
      return res.json();
    })
    .then(data => {
      if (data && data.vpcConfig) {
        setNetworkConfig(data);
        localStorage.setItem(`akal-lab-network-config-${projectId}`, JSON.stringify(data));
      }
    })
    .catch(err => {
      console.error('Failed to sync network configuration to backend:', err);
      throw err;
    });
  }, [projectId]);

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
    const hasCacheWarning = warnings.some(w => w.includes('No caching tier'));

    if (hasCacheWarning) {
      if (hasShownCacheWarningRef.current) {
        // Filter it out so it doesn't toast again
        warnings = warnings.filter(w => !w.includes('No caching tier'));
      } else {
        // Mark as shown so subsequent non-add actions don't trigger it
        hasShownCacheWarningRef.current = true;
      }
    } else {
      if (currentDbCount === 0) {
        hasShownCacheWarningRef.current = false;
      }
    }

    if (result.errors.length > 0) {
      showNotification({ type: 'error', message: result.errors[0] });
    } else if (warnings.length > 0) {
      showNotification({ type: 'warning', message: warnings[0] });
    } else if (result.successes.length > 0) {
      showNotification({ type: 'success', message: result.successes[0] });
    }
  }, [containers, showNotification]);

  return { networkConfig, saveNetworkConfig, fetchNetworkConfig, triggerArchitectureAudit };
}
