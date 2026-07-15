import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ArrowLeft, ChevronLeft, ChevronRight, Globe, Copy, Check } from 'lucide-react';
import StepValidationResults from './StepValidationResults';
import type { useLearningPlayer } from '../hooks/useLearningPlayer';
import type { ContainerData } from '../../../shared/types';
import type { NetworkConfig } from '../../../shared/types/network';

interface RoadmapPlayerProps {
  player: ReturnType<typeof useLearningPlayer>;
  containers: ContainerData[];
  networkConfig: NetworkConfig;
}

function CodeBlock({ code }: { code: string }) {
  const [copied, setCopied] = useState(false);
  const [isHovered, setIsHovered] = useState(false);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      console.error('Failed to copy text: ', err);
    }
  };

  return (
    <div style={styles.codeBlockContainer}>
      <div style={styles.codeBlockHeader}>
        <button
          onClick={handleCopy}
          onMouseEnter={() => setIsHovered(true)}
          onMouseLeave={() => setIsHovered(false)}
          style={{
            ...styles.copyBtn,
            backgroundColor: isHovered ? 'rgba(255, 255, 255, 0.08)' : 'transparent',
          }}
          title="Copy code"
        >
          {copied ? <Check size={12} color="#10B981" /> : <Copy size={12} color="#94A3B8" />}
        </button>
      </div>
      <pre style={styles.pre}>
        <code style={styles.codeBlock}>{code}</code>
      </pre>
    </div>
  );
}

function renderInstruction(text: string) {
  if (!text) return null;

  const blocks: React.ReactNode[] = [];
  const lines = text.split('\n');
  let inCodeBlock = false;
  let codeBlockLines: string[] = [];

  const parseInline = (inlineText: string): React.ReactNode => {
    const inlineRegex = /(\*\*.*?\*\*|`.*?`)/g;
    const parts = inlineText.split(inlineRegex);
    return parts.map((part, index) => {
      if (part.startsWith('**') && part.endsWith('**')) {
        return <strong key={index} style={{ fontWeight: 700, color: 'var(--color-text-primary)' }}>{part.slice(2, -2)}</strong>;
      }
      if (part.startsWith('`') && part.endsWith('`')) {
        return (
          <code
            key={index}
            style={{
              fontFamily: 'monospace',
              backgroundColor: 'rgba(255, 255, 255, 0.08)',
              padding: '2px 4px',
              borderRadius: '4px',
              fontSize: '11px',
              color: 'var(--color-text-primary)',
            }}
          >
            {part.slice(1, -1)}
          </code>
        );
      }
      return part;
    });
  };

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    if (line.startsWith('```')) {
      if (inCodeBlock) {
        const codeContent = codeBlockLines.join('\n');
        blocks.push(<CodeBlock key={`code-${i}`} code={codeContent} />);
        inCodeBlock = false;
        codeBlockLines = [];
      } else {
        inCodeBlock = true;
      }
      continue;
    }

    if (inCodeBlock) {
      codeBlockLines.push(line);
      continue;
    }

    if (line.trim() === '') {
      blocks.push(<div key={`empty-${i}`} style={{ height: '8px' }} />);
      continue;
    }

    const listMatch = line.match(/^(\d+\.|\-|\*)\s+(.*)$/);
    if (listMatch) {
      const marker = listMatch[1];
      const content = listMatch[2];
      blocks.push(
        <div key={`list-${i}`} style={styles.listItem}>
          <span style={styles.listMarker}>{marker}</span>
          <span style={styles.listContent}>{parseInline(content)}</span>
        </div>
      );
    } else {
      blocks.push(
        <p key={`p-${i}`} style={styles.instructionLine}>
          {parseInline(line)}
        </p>
      );
    }
  }

  return <div style={styles.markdownWrapper}>{blocks}</div>;
}

export default function RoadmapPlayer({
  player,
  containers = [],
  networkConfig = {
    vpcConfig: { name: '', cidr: '' },
    subnets: [],
    nodeSubnetMap: {},
    nodeSecurityGroups: {}
  } as unknown as NetworkConfig
}: RoadmapPlayerProps) {
  const { t } = useTranslation();
  const {
    roadmap,
    currentStepIndex,
    currentStep,
    goToStep,
    validating,
    validationError,
    resultsByStepId,
    validateCurrentStep,
    closeRoadmap,
  } = player;

  if (!roadmap || !currentStep) return null;

  const atFirstStep = currentStepIndex === 0;
  const atLastStep = currentStepIndex === roadmap.steps.length - 1;

  return (
    <div style={styles.container}>
      <button onClick={closeRoadmap} style={styles.backLink}>
        <ArrowLeft size={13} style={{ marginRight: 5 }} />
        {t('learning.player.backToCatalog')}
      </button>
      <span style={styles.roadmapTitle}>{roadmap.title}</span>

      <div style={styles.stepList}>
        {roadmap.steps.map((step, index) => {
          const result = resultsByStepId[step.id];
          const isCurrent = index === currentStepIndex;
          return (
            <button
              key={step.id}
              onClick={() => goToStep(index)}
              style={{
                ...styles.stepItem,
                ...(isCurrent ? styles.stepItemCurrent : {}),
              }}
            >
              <span style={styles.stepIndex}>{index + 1}.</span>
              <span style={styles.stepItemTitle}>{step.title}</span>
              {result && (
                <span
                  style={{
                    ...styles.stepMarker,
                    color: result.stepPassed ? 'var(--color-success)' : 'var(--color-danger)',
                  }}
                >
                  {result.stepPassed ? '✓' : '✗'}
                </span>
              )}
            </button>
          );
        })}
      </div>

      {/* Determine if we should show a localhost link to the container. */}
      {(() => {
        let localhostLink: string | null = null;
        const firstValidator = currentStep.validators[0];
        if (firstValidator && firstValidator.params) {
          const nodeName = (firstValidator.params.node || firstValidator.params.source) as string | undefined;
          if (nodeName) {
            const container = containers.find(c => c.name === nodeName);
            if (container && container.state === 'running') {
              const subnetId = networkConfig.nodeSubnetMap?.[container.id];
              const subnet = networkConfig.subnets?.find(s => s.id === subnetId);
              const isPublicSubnet = subnet?.type === 'public';

              const sgRules = networkConfig.nodeSecurityGroups?.[container.id] || [];
              const allowsPort80 = sgRules.some(
                (r: any) =>
                  r.type === 'inbound' &&
                  r.action === 'ALLOW' &&
                  (r.port === '80' || r.port === 'ALL') &&
                  r.source === '0.0.0.0/0'
              );

              if (isPublicSubnet && allowsPort80 && container.port) {
                localhostLink = `http://localhost:${container.port}`;
              }
            }
          }
        }

        return (
          <div style={styles.currentStep}>
            <span style={styles.stepCounter}>
              {t('learning.player.stepCounter', {
                current: currentStepIndex + 1,
                total: roadmap.steps.length,
              })}
            </span>
            <span style={styles.stepTitle}>{currentStep.title}</span>
            <div style={styles.instructionContainer}>
              {renderInstruction(currentStep.instruction)}
            </div>
            {localhostLink && (
              <div style={styles.linkBox}>
                <Globe size={14} color="#10B981" style={{ marginRight: 6, flexShrink: 0 }} />
                <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
                  <span style={styles.linkLabel}>Visit your web server:</span>
                  <a href={localhostLink} target="_blank" rel="noopener noreferrer" style={styles.link}>
                    {localhostLink}
                  </a>
                </div>
              </div>
            )}
          </div>
        );
      })()}

      <div style={styles.navRow}>
        <button
          onClick={() => goToStep(currentStepIndex - 1)}
          disabled={atFirstStep}
          style={{ ...styles.navBtn, opacity: atFirstStep ? 0.4 : 1 }}
        >
          <ChevronLeft size={13} />
          {t('learning.player.previous')}
        </button>
        <button
          onClick={() => goToStep(currentStepIndex + 1)}
          disabled={atLastStep}
          style={{ ...styles.navBtn, opacity: atLastStep ? 0.4 : 1 }}
        >
          {t('learning.player.next')}
          <ChevronRight size={13} />
        </button>
      </div>

      <button
        onClick={validateCurrentStep}
        disabled={validating}
        style={{ ...styles.validateBtn, opacity: validating ? 0.6 : 1 }}
      >
        {validating ? t('learning.player.validating') : t('learning.player.validate')}
      </button>

      {validationError !== null && (
        <div style={styles.errorBox}>
          <span>{validationError || t('learning.player.validationError')}</span>
          <button onClick={validateCurrentStep} style={styles.retryBtn}>
            {t('learning.player.retry')}
          </button>
        </div>
      )}

      {resultsByStepId[currentStep.id] && (
        <StepValidationResults response={resultsByStepId[currentStep.id]} />
      )}
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  container: {
    display: 'flex',
    flexDirection: 'column',
    gap: '14px',
  },
  backLink: {
    display: 'flex',
    alignItems: 'center',
    alignSelf: 'flex-start',
    padding: 0,
    border: 'none',
    background: 'none',
    color: 'var(--color-text-muted)',
    fontSize: '11px',
    fontWeight: 600,
    cursor: 'pointer',
    fontFamily: 'var(--font-sans)',
  },
  roadmapTitle: {
    fontSize: '14px',
    fontWeight: 700,
    color: 'var(--color-text-primary)',
    lineHeight: 1.4,
  },
  stepList: {
    display: 'flex',
    flexDirection: 'column',
    gap: '4px',
  },
  stepItem: {
    display: 'flex',
    alignItems: 'center',
    gap: '6px',
    padding: '7px 10px',
    border: '1px solid transparent',
    borderRadius: '6px',
    background: 'none',
    cursor: 'pointer',
    textAlign: 'left',
    fontFamily: 'var(--font-sans)',
    color: 'var(--color-text-secondary)',
  },
  stepItemCurrent: {
    border: '1px solid var(--color-accent)',
    backgroundColor: 'rgba(59, 130, 246, 0.06)',
    color: 'var(--color-text-primary)',
  },
  stepIndex: {
    fontSize: '11px',
    fontWeight: 700,
    color: 'var(--color-text-muted)',
  },
  stepItemTitle: {
    fontSize: '12px',
    fontWeight: 500,
    flex: 1,
  },
  stepMarker: {
    fontSize: '12px',
    fontWeight: 700,
  },
  currentStep: {
    display: 'flex',
    flexDirection: 'column',
    gap: '6px',
    borderTop: '1px solid var(--border-color)',
    paddingTop: '12px',
  },
  stepCounter: {
    fontSize: '10px',
    fontWeight: 700,
    color: 'var(--color-text-muted)',
    textTransform: 'uppercase',
    letterSpacing: '0.5px',
  },
  stepTitle: {
    fontSize: '13px',
    fontWeight: 600,
    color: 'var(--color-text-primary)',
  },
  instruction: {
    margin: 0,
    fontSize: '12px',
    color: 'var(--color-text-secondary)',
    lineHeight: 1.6,
    whiteSpace: 'pre-wrap',
  },
  navRow: {
    display: 'flex',
    justifyContent: 'space-between',
    gap: '8px',
  },
  navBtn: {
    display: 'flex',
    alignItems: 'center',
    gap: '2px',
    padding: '5px 10px',
    border: '1px solid var(--border-color)',
    borderRadius: '6px',
    background: 'none',
    color: 'var(--color-text-primary)',
    fontSize: '11px',
    fontWeight: 600,
    cursor: 'pointer',
    fontFamily: 'var(--font-sans)',
  },
  validateBtn: {
    padding: '9px 12px',
    border: 'none',
    borderRadius: '6px',
    backgroundColor: 'var(--color-accent)',
    color: '#FFFFFF',
    fontSize: '13px',
    fontWeight: 600,
    cursor: 'pointer',
    fontFamily: 'var(--font-sans)',
  },
  errorBox: {
    display: 'flex',
    flexDirection: 'column',
    gap: '8px',
    padding: '10px',
    border: '1px solid var(--color-danger)',
    borderRadius: '6px',
    fontSize: '12px',
    color: 'var(--color-danger)',
    lineHeight: 1.5,
  },
  retryBtn: {
    alignSelf: 'flex-start',
    padding: '5px 12px',
    border: '1px solid var(--border-color)',
    borderRadius: '6px',
    background: 'none',
    color: 'var(--color-text-primary)',
    fontSize: '11px',
    fontWeight: 600,
    cursor: 'pointer',
    fontFamily: 'var(--font-sans)',
  },
  linkBox: {
    display: 'flex',
    alignItems: 'center',
    marginTop: '10px',
    padding: '8px 12px',
    backgroundColor: 'rgba(16, 185, 129, 0.08)',
    border: '1px solid rgba(16, 185, 129, 0.2)',
    borderRadius: '6px',
  },
  linkLabel: {
    fontSize: '11px',
    fontWeight: 600,
    color: 'var(--color-text-secondary)',
  },
  link: {
    fontSize: '11px',
    fontWeight: 700,
    color: 'var(--color-accent)',
    textDecoration: 'underline',
    wordBreak: 'break-all',
  },
  instructionContainer: {
    marginTop: '4px',
  },
  markdownWrapper: {
    display: 'flex',
    flexDirection: 'column',
    gap: '6px',
  },
  instructionLine: {
    margin: 0,
    fontSize: '12px',
    color: 'var(--color-text-secondary)',
    lineHeight: 1.6,
  },
  codeBlockContainer: {
    margin: '8px 0',
    backgroundColor: '#0F172A',
    borderRadius: '6px',
    border: '1px solid rgba(255, 255, 255, 0.05)',
    overflow: 'hidden',
  },
  pre: {
    margin: 0,
    padding: '12px',
    overflowX: 'auto',
  },
  codeBlock: {
    fontFamily: 'monospace',
    fontSize: '11px',
    color: '#E2E8F0',
    lineHeight: 1.5,
    whiteSpace: 'pre',
  },
  listItem: {
    display: 'flex',
    gap: '6px',
    fontSize: '12px',
    color: 'var(--color-text-secondary)',
    lineHeight: 1.6,
    paddingLeft: '4px',
  },
  listMarker: {
    fontWeight: 700,
    color: 'var(--color-text-muted)',
    flexShrink: 0,
  },
  listContent: {
    flex: 1,
  },
  codeBlockHeader: {
    display: 'flex',
    justifyContent: 'flex-end',
    padding: '6px 8px 0 8px',
    backgroundColor: '#0F172A',
  },
  copyBtn: {
    background: 'none',
    border: 'none',
    cursor: 'pointer',
    padding: '4px',
    borderRadius: '4px',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    transition: 'background-color 0.2s',
  },
};
