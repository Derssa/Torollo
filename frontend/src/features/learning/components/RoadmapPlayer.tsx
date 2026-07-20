import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { AlertTriangle, ArrowLeft, ChevronLeft, ChevronRight, Globe, RotateCcw, X } from 'lucide-react';
import StepValidationResults from './StepValidationResults';
import StepHints from './StepHints';
import { renderInstruction } from './InstructionMarkdown';
import { outcomePreset, STATUS_PRESETS } from '../validationStatus';
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

/**
 * ✓ for a step whose recorded validation passed in a previous session. Only
 * the verdict is persisted — validator results describe a past container
 * state — so there is no response object and no results card behind it.
 */
function RestoredStepMarker() {
  const { t } = useTranslation();
  const { icon: Icon, color, labelKey } = STATUS_PRESETS.pass;
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
    completedStepIds,
    progressNotice,
    dismissProgressNotice,
    resetProgress,
    resetting,
    resetError,
  } = player;

  // Restarting the roadmap forgets persisted progress, so it sits behind the
  // same light two-click brake as the solution reveal: first click arms a
  // confirmation label, second executes; leaving the button disarms.
  const [resetArmed, setResetArmed] = useState(false);
  const handleReset = () => {
    if (!resetArmed) {
      setResetArmed(true);
      return;
    }
    setResetArmed(false);
    resetProgress();
  };

  if (!roadmap || !currentStep) return null;

  const atFirstStep = currentStepIndex === 0;
  const atLastStep = currentStepIndex === roadmap.steps.length - 1;

  return (
    <div style={styles.container}>
      <div style={styles.headerRow}>
        <button onClick={closeRoadmap} style={styles.backLink}>
          <ArrowLeft size={13} style={{ marginRight: 5 }} />
          {t('learning.player.backToCatalog')}
        </button>
        <button
          onClick={handleReset}
          onBlur={() => setResetArmed(false)}
          disabled={resetting}
          style={{
            ...styles.resetBtn,
            ...(resetArmed ? styles.resetBtnArmed : {}),
            opacity: resetting ? 0.5 : 1,
          }}
        >
          <RotateCcw size={11} style={{ marginRight: 4, flexShrink: 0 }} />
          {resetArmed ? t('learning.player.resetProgressConfirm') : t('learning.player.resetProgress')}
        </button>
      </div>
      <span style={styles.roadmapTitle}>{roadmap.title}</span>

      {resetError !== null && (
        <div style={styles.errorBox}>
          <span>{resetError || t('learning.player.resetProgressError')}</span>
        </div>
      )}

      {progressNotice && (
        <div style={styles.noticeBox}>
          <AlertTriangle size={13} color="var(--color-warning-strong)" style={{ flexShrink: 0 }} />
          <span style={styles.noticeText}>{t('learning.player.progressRecovered')}</span>
          <button
            onClick={dismissProgressNotice}
            style={styles.noticeDismiss}
            aria-label={t('learning.player.dismissNotice')}
          >
            <X size={13} />
          </button>
        </div>
      )}

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
              {result ? (
                <StepMarker response={result} />
              ) : (
                completedStepIds[step.id] && <RestoredStepMarker />
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
                <Globe size={14} color="var(--color-success)" style={{ marginRight: 6, flexShrink: 0 }} />
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
  headerRow: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: '8px',
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
  resetBtn: {
    display: 'flex',
    alignItems: 'center',
    padding: '3px 8px',
    border: '1px dashed var(--border-color)',
    borderRadius: '6px',
    background: 'none',
    color: 'var(--color-text-muted)',
    fontSize: '10px',
    fontWeight: 600,
    cursor: 'pointer',
    fontFamily: 'var(--font-sans)',
  },
  resetBtnArmed: {
    border: '1px dashed var(--color-danger)',
    color: 'var(--color-danger)',
  },
  noticeBox: {
    display: 'flex',
    alignItems: 'flex-start',
    gap: '6px',
    padding: '8px 10px',
    border: '1px solid var(--color-warning)',
    borderRadius: '6px',
    backgroundColor: 'var(--color-warning-glow)',
  },
  noticeText: {
    flex: 1,
    fontSize: '11px',
    color: 'var(--color-warning-strong)',
    lineHeight: 1.5,
  },
  noticeDismiss: {
    display: 'flex',
    padding: 0,
    border: 'none',
    background: 'none',
    color: 'var(--color-warning-strong)',
    cursor: 'pointer',
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
    backgroundColor: 'color-mix(in srgb, var(--color-accent) 6%, transparent)',
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
    color: 'var(--color-white)',
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
    backgroundColor: 'color-mix(in srgb, var(--color-success) 8%, transparent)',
    border: '1px solid color-mix(in srgb, var(--color-success) 20%, transparent)',
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
