import { useState } from 'react';

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
  const [cpuLimit, setCpuLimit] = useState(1);
  const [memoryLimit, setMemoryLimit] = useState(512);
  const [storageLimit, setStorageLimit] = useState(50);
  const [appliedCpu, setAppliedCpu] = useState(1);
  const [appliedMemory, setAppliedMemory] = useState(512);
  const [appliedStorage, setAppliedStorage] = useState(50);
  const [scalingLoading, setScalingLoading] = useState(false);
  const [feedbackMessage, setFeedbackMessage] = useState<string | null>(
    "Database operating at baseline resources: 1 vCPU, 512MB RAM, 50GB storage. Handles standard query throughput."
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
        customMsg = "now the database can handle more concurrent requests/transactions and store more data (expanded persistent disk).";
      } else if (throughputDecreased && storageDecreased) {
        customMsg = "now the database will handle fewer requests (higher risk of CPU/RAM throttling) and store less data (reduced storage space).";
      } else if (throughputIncreased && storageDecreased) {
        customMsg = "now the database can handle more requests (faster query performance) but will store less data due to reduced storage limit.";
      } else if (throughputDecreased && storageIncreased) {
        customMsg = "now the database server will handle fewer requests (slower processing capacity) but can store more persistent data.";
      } else if (throughputIncreased) {
        customMsg = "now the database can handle more requests and process queries faster.";
      } else if (throughputDecreased) {
        customMsg = "now the database will handle fewer requests and experience increased latency under query loads.";
      } else if (storageIncreased) {
        customMsg = "now the database can store more data with expanded disk capacity.";
      } else if (storageDecreased) {
        customMsg = "now the database storage capacity is reduced.";
      } else {
        customMsg = "no resource limits were changed.";
      }

      onScalingLog(`RESOURCE SCALING UPDATE: Vertical limits applied. Configured: CPU=${cpuLimit} Cores, RAM=${memoryLimit}MB, Storage=${storageLimit}GB. Impact: ${customMsg}`);
      setFeedbackMessage(`Limits Applied! Impact: ${customMsg}`);

      setAppliedCpu(cpuLimit);
      setAppliedMemory(memoryLimit);
      setAppliedStorage(storageLimit);
    }, 1200);
  };

  return (
    <div style={{ border: '1px solid #E2E8F0', borderRadius: '8px', padding: '16px' }}>
      <h4 style={{ margin: '0 0 16px 0', fontSize: '14px', color: '#334155' }}>{labels.title}</h4>

      <div style={{ marginBottom: '16px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '6px' }}>
          <span style={{ fontSize: '12px', fontWeight: 600 }}>{labels.cpu}</span>
          <span style={{ fontSize: '12px', color: '#2563EB', fontWeight: 'bold' }}>{cpuLimit} vCPU</span>
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
          <span style={{ fontSize: '12px', color: '#2563EB', fontWeight: 'bold' }}>{memoryLimit} MB</span>
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
          <span style={{ fontSize: '12px', color: '#2563EB', fontWeight: 'bold' }}>{storageLimit} GB</span>
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
          backgroundColor: '#2563EB',
          color: 'white',
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
          backgroundColor: '#F0F9FF',
          border: '1px solid #BAE6FD',
          fontSize: '12px',
          color: '#0369A1',
          lineHeight: '1.4'
        }}>
          <div style={{ fontWeight: 600, marginBottom: '2px' }}>{labels.sysStatus}</div>
          {feedbackMessage}
        </div>
      )}
    </div>
  );
}
