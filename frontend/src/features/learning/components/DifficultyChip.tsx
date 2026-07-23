import { useTranslation } from 'react-i18next';
import type { RoadmapDifficulty } from '../../../shared/types/roadmap';

interface DifficultyChipProps {
  difficulty: RoadmapDifficulty;
}

const DIFFICULTY_COLORS: Record<RoadmapDifficulty, string> = {
  beginner: 'var(--color-success)',
  intermediate: 'var(--color-warning)',
  advanced: 'var(--color-danger)',
};

/** Small colored pill for a roadmap's difficulty — green/amber/red semantics. */
export default function DifficultyChip({ difficulty }: DifficultyChipProps) {
  const { t } = useTranslation();
  const color = DIFFICULTY_COLORS[difficulty];
  return (
    <span
      style={{
        ...styles.chip,
        color,
        background: `color-mix(in srgb, ${color} 12%, transparent)`,
      }}
    >
      {t(`learning.catalog.difficulty.${difficulty}`)}
    </span>
  );
}

const styles: Record<string, React.CSSProperties> = {
  chip: {
    display: 'inline-flex',
    alignItems: 'center',
    padding: '2px var(--space-2)',
    borderRadius: 'var(--radius-sm)',
    fontSize: 'var(--text-xs)',
    fontWeight: 600,
    whiteSpace: 'nowrap',
  },
};
