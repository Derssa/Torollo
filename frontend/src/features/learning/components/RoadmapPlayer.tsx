import { useTranslation } from 'react-i18next';
import { ArrowLeft, ChevronLeft, ChevronRight, Globe } from 'lucide-react';
import StepValidationResults from './StepValidationResults';
import StepHints from './StepHints';
import { renderInstruction } from './InstructionMarkdown';
import { outcomePreset } from '../validationStatus';
import type { StepValidationResponse } from '../../../shared/types/roadmap';
import type { useLearningPlayer } from '../hooks/useLearningPlayer';
import type { ContainerData } from '../../../shared/types';
import type { NetworkConfig } from '../../../shared/types/network';

interface RoadmapPlayerProps {
  player: ReturnType<typeof useLearningPlayer>;
  containers: ContainerData[];
  networkConfig: NetworkConfig;
}

function StepMarker({ response }: { response: StepValidationResponse }) {
  const { t } = useTranslation();
  const { icon: Icon, color, labelKey } = outcomePreset(response);
  return (
    <span style={styles.stepMarker} title={t(labelKey)}>
      <Icon size={13} color={color} role="img" aria-label={t(labelKey)} />
    </span>
  );
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
    revealedHintsByStepId,
    revealNextHint,
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
              {result && <StepMarker response={result} />}
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
            {/* key resets the solution-confirmation arming when the step changes. */}
            <StepHints
              key={currentStep.id}
              step={currentStep}
              revealedCount={revealedHintsByStepId[currentStep.id] ?? 0}
              onReveal={revealNextHint}
            />
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
        <StepValidationResults
          response={resultsByStepId[currentStep.id]}
          isLastStep={atLastStep}
          onNextStep={() => goToStep(currentStepIndex + 1)}
        />
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
    display: 'flex',
    alignItems: 'center',
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
};
