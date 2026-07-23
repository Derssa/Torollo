import Skeleton from '../../../shared/components/Skeleton';

/** Same 190px frame as ProjectCard, sketched with placeholder blocks. */
export default function ProjectCardSkeleton() {
  return (
    <div style={styles.card} aria-hidden="true">
      <Skeleton width="40px" height="40px" />
      <div style={styles.body}>
        <Skeleton width="60%" height="16px" />
        <Skeleton width="40%" height="12px" />
      </div>
      <Skeleton width="35%" height="13px" />
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  card: {
    padding: 'var(--space-6)',
    borderRadius: 'var(--radius-lg)',
    display: 'flex',
    flexDirection: 'column',
    height: '190px',
    justifyContent: 'space-between',
    backgroundColor: 'var(--bg-surface-solid)',
    border: '1px solid var(--border-color)',
    boxSizing: 'border-box',
  },
  body: {
    display: 'flex',
    flexDirection: 'column',
    gap: 'var(--space-2)',
  },
};
