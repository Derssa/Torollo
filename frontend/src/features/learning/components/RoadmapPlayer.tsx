import { useTranslation } from 'react-i18next';
import { ArrowLeft, ChevronLeft, ChevronRight } from 'lucide-react';
import StepValidationResults from './StepValidationResults';
import type { useLearningPlayer } from '../hooks/useLearningPlayer';

interface RoadmapPlayerProps {
  player: ReturnType<typeof useLearningPlayer>;
}

export default function RoadmapPlayer({ player }: RoadmapPlayerProps) {
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

      <div style={styles.currentStep}>
        <span style={styles.stepCounter}>
          {t('learning.player.stepCounter', {
            current: currentStepIndex + 1,
            total: roadmap.steps.length,
          })}
        </span>
        <span style={styles.stepTitle}>{currentStep.title}</span>
        <p style={styles.instruction}>{currentStep.instruction}</p>
      </div>

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
};
