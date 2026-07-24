import { useTranslation } from 'react-i18next';
import { ArrowRight, Ban } from 'lucide-react';
import { ROLE_VISUALS } from './nodeRoleVisual';
import type { RoadmapTopology } from '../../../../../features/learning/roadmapTopology';

interface ArchitecturePreviewProps {
  topology: RoadmapTopology;
}

/**
 * "What you'll build", read off the roadmap's own checks rather than a
 * declared diagram: the nodes it asserts, and the connections it requires
 * open or blocked. Names and ports are the real ones the learner must use, so
 * they render in mono.
 */
export default function ArchitecturePreview({ topology }: ArchitecturePreviewProps) {
  const { t } = useTranslation();
  const { nodes, links } = topology;

  if (nodes.length === 0) return null;

  return (
    <section style={styles.panel}>
      <h2 style={styles.title}>{t('learning.detail.build.title')}</h2>
      <p style={styles.subtitle}>{t('learning.detail.build.subtitle')}</p>

      <ul style={styles.nodes}>
        {nodes.map(node => {
          const { Icon, color } = ROLE_VISUALS[node.role];
          return (
            <li key={node.name} style={styles.node}>
              <span
                style={{
                  ...styles.nodeIcon,
                  color,
                  background: `color-mix(in srgb, ${color} 12%, transparent)`,
                }}
                aria-hidden
              >
                <Icon size={18} />
              </span>
              <span style={styles.nodeText}>
                <span style={styles.nodeName}>{node.name}</span>
                <span style={styles.nodeRole}>{t(`learning.detail.role.${node.role}`)}</span>
              </span>
            </li>
          );
        })}
      </ul>

      {links.length > 0 && (
        <>
          <span style={styles.linksTitle}>{t('learning.detail.build.linksTitle')}</span>
          <ul style={styles.links}>
            {links.map(link => {
              const denied = link.mode === 'deny';
              const color = denied ? 'var(--color-danger)' : 'var(--color-success)';
              return (
                <li key={`${link.source}-${link.target}-${link.port ?? 'any'}-${link.mode}`} style={styles.link}>
                  {denied ? (
                    <Ban size={13} color={color} style={styles.linkIcon} />
                  ) : (
                    <ArrowRight size={13} color={color} style={styles.linkIcon} />
                  )}
                  <span style={styles.linkEndpoints}>
                    {link.source} → {link.target}
                  </span>
                  <span style={styles.linkPort}>
                    {link.port != null ? `:${link.port}` : t('learning.detail.build.anyPort')}
                  </span>
                  <span style={{ ...styles.linkMode, color }}>
                    {denied ? t('learning.detail.build.denied') : t('learning.detail.build.allowed')}
                  </span>
                </li>
              );
            })}
          </ul>
        </>
      )}
    </section>
  );
}

const styles: Record<string, React.CSSProperties> = {
  panel: {
    padding: 'var(--space-5)',
    background: 'var(--bg-surface-solid)',
    border: '1px solid var(--border-color)',
    borderRadius: 'var(--radius-lg)',
    boxShadow: 'var(--shadow-sm)',
  },
  title: {
    fontSize: 'var(--text-lg)',
    fontWeight: 700,
    color: 'var(--color-text-primary)',
    margin: 0,
  },
  subtitle: {
    fontSize: 'var(--text-sm)',
    color: 'var(--color-text-secondary)',
    margin: 'var(--space-1) 0 var(--space-4) 0',
  },
  nodes: {
    // Grid, not flex: a lone node on the last row must keep the column width
    // of the others rather than stretching across the panel.
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))',
    gap: 'var(--space-3)',
    listStyle: 'none',
    margin: 0,
    padding: 0,
  },
  node: {
    display: 'flex',
    alignItems: 'center',
    gap: 'var(--space-3)',
    minWidth: 0,
    padding: 'var(--space-3)',
    background: 'var(--bg-subtle)',
    border: '1px solid var(--border-color)',
    borderRadius: 'var(--radius-md)',
  },
  nodeIcon: {
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    width: '32px',
    height: '32px',
    flexShrink: 0,
    borderRadius: 'var(--radius-sm)',
  },
  nodeText: {
    display: 'flex',
    flexDirection: 'column',
    minWidth: 0,
  },
  nodeName: {
    fontFamily: 'var(--font-mono)',
    fontSize: 'var(--text-md)',
    fontWeight: 600,
    color: 'var(--color-text-primary)',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
  },
  nodeRole: {
    fontSize: 'var(--text-xs)',
    color: 'var(--color-text-muted)',
  },
  linksTitle: {
    display: 'block',
    fontSize: 'var(--text-xs)',
    fontWeight: 500,
    textTransform: 'uppercase',
    letterSpacing: '0.5px',
    color: 'var(--color-text-muted)',
    margin: 'var(--space-4) 0 var(--space-2) 0',
  },
  links: {
    display: 'flex',
    flexDirection: 'column',
    gap: 'var(--space-2)',
    listStyle: 'none',
    margin: 0,
    padding: 0,
  },
  link: {
    display: 'flex',
    alignItems: 'center',
    gap: 'var(--space-2)',
    flexWrap: 'wrap',
  },
  linkIcon: {
    flexShrink: 0,
  },
  linkEndpoints: {
    fontFamily: 'var(--font-mono)',
    fontSize: 'var(--text-sm)',
    color: 'var(--color-text-primary)',
  },
  linkPort: {
    fontFamily: 'var(--font-mono)',
    fontSize: 'var(--text-xs)',
    color: 'var(--color-text-secondary)',
    background: 'var(--bg-subtle)',
    border: '1px solid var(--border-color)',
    borderRadius: 'var(--radius-sm)',
    padding: '1px var(--space-2)',
  },
  linkMode: {
    fontSize: 'var(--text-xs)',
    fontWeight: 600,
  },
};
