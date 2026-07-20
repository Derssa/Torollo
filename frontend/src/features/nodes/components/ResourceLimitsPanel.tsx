import { useState } from 'react';
import { useTranslation } from 'react-i18next';

interface ResourceLimitsPanelProps {
  labels: {
    title: string;
    cpu: string;
    ram: string;
    storage: string;
    apply: string;
    applying: string;
    sysStatus: string;
  };
  /** Receives the "RESOURCE SCALING UPDATE" line for the simulation logs. */
  onScalingLog: (message: string) => void;
}

/**
 * Vertical-scaling panel (CPU/RAM/Storage sliders) of the Postgres and Mongo
 * details tabs. Purely educational: applying limits only produces feedback,
 * it does not touch the real container.
 */
export default function ResourceLimitsPanel({ labels, onScalingLog }: ResourceLimitsPanelProps) {
  const { t } = useTranslation();
  const [cpuLimit, setCpuLimit] = useState(1);
  const [memoryLimit, setMemoryLimit] = useState(512);
  const [storageLimit, setStorageLimit] = useState(50);
  const [appliedCpu, setAppliedCpu] = useState(1);
  const [appliedMemory, setAppliedMemory] = useState(512);
  const [appliedStorage, setAppliedStorage] = useState(50);
  const [scalingLoading, setScalingLoading] = useState(false);
  const [feedbackMessage, setFeedbackMessage] = useState<string | null>(
    t('nodeshared.resources.baseline')
  );

  const handleUpdateLimits = () => {
    setScalingLoading(true);
    setTimeout(() => {
      setScalingLoading(false);

      const cpuIncreased = cpuLimit > appliedCpu;
      const cpuDecreased = cpuLimit < appliedCpu;
      const memIncreased = memoryLimit > appliedMemory;
      const memDecreased = memoryLimit < appliedMemory;
      const storageIncreased = storageLimit > appliedStorage;
      const storageDecreased = storageLimit < appliedStorage;

      const throughputIncreased = (cpuIncreased || memIncreased) && !cpuDecreased && !memDecreased;
      const throughputDecreased = (cpuDecreased || memDecreased) && !cpuIncreased && !memIncreased;

      let customMsg: string;
      if (throughputIncreased && storageIncreased) {
        customMsg = t('nodeshared.resources.impactUpStorageUp');
      } else if (throughputDecreased && storageDecreased) {
        customMsg = t('nodeshared.resources.impactDownStorageDown');
      } else if (throughputIncreased && storageDecreased) {
        customMsg = t('nodeshared.resources.impactUpStorageDown');
      } else if (throughputDecreased && storageIncreased) {
        customMsg = t('nodeshared.resources.impactDownStorageUp');
      } else if (throughputIncreased) {
        customMsg = t('nodeshared.resources.impactUp');
      } else if (throughputDecreased) {
        customMsg = t('nodeshared.resources.impactDown');
      } else if (storageIncreased) {
        customMsg = t('nodeshared.resources.impactStorageUp');
      } else if (storageDecreased) {
        customMsg = t('nodeshared.resources.impactStorageDown');
      } else {
        customMsg = t('nodeshared.resources.impactNone');
      }

      onScalingLog(t('nodeshared.resources.scalingLog', { cpu: cpuLimit, ram: memoryLimit, storage: storageLimit, impact: customMsg }));
      setFeedbackMessage(t('nodeshared.resources.limitsApplied', { impact: customMsg }));

      setAppliedCpu(cpuLimit);
      setAppliedMemory(memoryLimit);
      setAppliedStorage(storageLimit);
    }, 1200);
  };

  return (
    <div style={{ border: '1px solid var(--neutral-200)', borderRadius: '8px', padding: '16px' }}>
      <h4 style={{ margin: '0 0 16px 0', fontSize: '14px', color: 'var(--neutral-700)' }}>{labels.title}</h4>

      <div style={{ marginBottom: '16px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '6px' }}>
          <span style={{ fontSize: '12px', fontWeight: 600 }}>{labels.cpu}</span>
          <span style={{ fontSize: '12px', color: 'var(--color-accent)', fontWeight: 'bold' }}>{cpuLimit} vCPU</span>
        </div>
        <input
          type="range"
          min="0.2"
          max="4"
          step="0.2"
          value={cpuLimit}
          onChange={(e) => setCpuLimit(parseFloat(e.target.value))}
          style={{ width: '100%' }}
        />
      </div>

      <div style={{ marginBottom: '20px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '6px' }}>
          <span style={{ fontSize: '12px', fontWeight: 600 }}>{labels.ram}</span>
          <span style={{ fontSize: '12px', color: 'var(--color-accent)', fontWeight: 'bold' }}>{memoryLimit} MB</span>
        </div>
        <input
          type="range"
          min="128"
          max="2048"
          step="128"
          value={memoryLimit}
          onChange={(e) => setMemoryLimit(parseInt(e.target.value))}
          style={{ width: '100%' }}
        />
      </div>

      <div style={{ marginBottom: '20px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '6px' }}>
          <span style={{ fontSize: '12px', fontWeight: 600 }}>{labels.storage}</span>
          <span style={{ fontSize: '12px', color: 'var(--color-accent)', fontWeight: 'bold' }}>{storageLimit} GB</span>
        </div>
        <input
          type="range"
          min="10"
          max="500"
          step="10"
          value={storageLimit}
          onChange={(e) => setStorageLimit(parseInt(e.target.value))}
          style={{ width: '100%' }}
        />
      </div>

      <button
        onClick={handleUpdateLimits}
        disabled={scalingLoading}
        style={{
          width: '100%',
          backgroundColor: 'var(--color-accent)',
          color: 'var(--color-white)',
          border: 'none',
          padding: '8px',
          borderRadius: '6px',
          fontWeight: 600,
          cursor: 'pointer'
        }}
      >
        {scalingLoading ? labels.applying : labels.apply}
      </button>

      {feedbackMessage && (
        <div style={{
          marginTop: '12px',
          padding: '10px',
          borderRadius: '6px',
          backgroundColor: 'var(--color-info-subtle)',
          border: '1px solid var(--color-info-border)',
          fontSize: '12px',
          color: 'var(--color-info)',
          lineHeight: '1.4'
        }}>
          <div style={{ fontWeight: 600, marginBottom: '2px' }}>{labels.sysStatus}</div>
          {feedbackMessage}
        </div>
      )}
    </div>
  );
}
