import { useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { CheckCircle2, Upload, XCircle } from 'lucide-react';
import Button from '../../../shared/components/Button';
import Modal from '../../../shared/components/Modal';
import { API_BASE } from '../../../shared/types';
import type { ImportReport } from '../../../shared/types/roadmap';

interface ImportRoadmapsButtonProps {
  /** Called after at least one roadmap was installed — the catalogue should refetch. */
  onImported: () => void;
}

const EMPTY_REPORT: ImportReport = { imported: [], rejected: [], ignored: [] };

function mergeReports(into: ImportReport, from: ImportReport): ImportReport {
  return {
    imported: [...into.imported, ...from.imported],
    rejected: [...into.rejected, ...from.rejected],
    ignored: [...into.ignored, ...from.ignored],
  };
}

/**
 * "Import roadmaps" button of the Learning page: picks .json/.zip files,
 * uploads them to POST /api/learning/roadmaps/import and shows the per-file
 * report — what was installed, and for every refused file the exact reasons.
 */
export default function ImportRoadmapsButton({ onImported }: ImportRoadmapsButtonProps) {
  const { t } = useTranslation();
  const inputRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [report, setReport] = useState<ImportReport | null>(null);
  const [requestFailed, setRequestFailed] = useState(false);

  const handleFiles = async (files: FileList | null) => {
    if (!files || files.length === 0) return;
    setBusy(true);
    let merged = EMPTY_REPORT;
    let failed = false;
    for (const file of Array.from(files)) {
      try {
        // Raw bytes on purpose: an application/json Content-Type would get the
        // body parsed (and re-serialized) before the import endpoint sees it.
        const res = await fetch(
          `${API_BASE}/api/learning/roadmaps/import?filename=${encodeURIComponent(file.name)}`,
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/octet-stream' },
            body: await file.arrayBuffer(),
          }
        );
        // 200 = something installed, 422 = everything refused; both carry the report.
        if (res.status === 200 || res.status === 422) {
          merged = mergeReports(merged, (await res.json()) as ImportReport);
        } else {
          failed = true;
        }
      } catch (err) {
        console.error('Failed to import roadmaps:', err);
        failed = true;
      }
    }
    setBusy(false);
    setRequestFailed(failed);
    setReport(merged);
    if (merged.imported.length > 0) {
      onImported();
    }
  };

  return (
    <>
      <input
        ref={inputRef}
        type="file"
        accept=".json,.zip,application/json,application/zip"
        multiple
        style={{ display: 'none' }}
        onChange={e => {
          void handleFiles(e.target.files);
          // Same file re-selected later must fire change again (fix → retry).
          e.target.value = '';
        }}
      />
      <Button onClick={() => inputRef.current?.click()} disabled={busy}>
        <Upload size={14} style={{ marginRight: 6, verticalAlign: '-2px' }} />
        {busy ? t('learning.import.importing') : t('learning.import.button')}
      </Button>

      {report && (
        <Modal onClose={() => setReport(null)} width="520px">
          <h3 style={styles.title}>{t('learning.import.title')}</h3>

          {report.imported.length > 0 && (
            <div style={styles.section}>
              <div style={{ ...styles.sectionTitle, color: 'var(--color-success)' }}>
                <CheckCircle2 size={14} style={styles.sectionIcon} />
                {t('learning.import.importedTitle', { count: report.imported.length })}
              </div>
              <ul style={styles.list}>
                {report.imported.map(entry => (
                  <li key={`${entry.id}-${entry.language}`} style={styles.listItem}>
                    <span style={styles.itemTitle}>{entry.title}</span>
                    <span style={styles.itemMeta}>
                      {entry.language.toUpperCase()}
                      {entry.updated ? ` · ${t('learning.import.updated')}` : ''}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {report.rejected.length > 0 && (
            <div style={styles.section}>
              <div style={{ ...styles.sectionTitle, color: 'var(--color-danger)' }}>
                <XCircle size={14} style={styles.sectionIcon} />
                {t('learning.import.rejectedTitle', { count: report.rejected.length })}
              </div>
              <ul style={styles.list}>
                {report.rejected.map((entry, index) => (
                  <li key={`${entry.file}-${index}`} style={styles.listItem}>
                    <span style={styles.itemTitle}>{entry.file}</span>
                    <ul style={styles.errorList}>
                      {entry.errors.map((error, errorIndex) => (
                        <li key={errorIndex} style={styles.errorItem}>
                          {error}
                        </li>
                      ))}
                    </ul>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {report.ignored.length > 0 && (
            <p style={styles.ignored}>
              {t('learning.import.ignored', { files: report.ignored.join(', ') })}
            </p>
          )}

          {requestFailed && <p style={styles.requestFailed}>{t('learning.import.requestFailed')}</p>}

          <div style={styles.footer}>
            <Button variant="primary" onClick={() => setReport(null)}>
              {t('learning.import.close')}
            </Button>
          </div>
        </Modal>
      )}
    </>
  );
}

const styles: Record<string, React.CSSProperties> = {
  title: {
    fontSize: 'var(--text-lg)',
    fontWeight: 700,
    color: 'var(--color-text-primary)',
    margin: '0 0 var(--space-4) 0',
  },
  section: {
    marginBottom: 'var(--space-4)',
  },
  sectionTitle: {
    display: 'flex',
    alignItems: 'center',
    fontSize: 'var(--text-sm)',
    fontWeight: 600,
    marginBottom: 'var(--space-2)',
  },
  sectionIcon: {
    marginRight: 6,
    flexShrink: 0,
  },
  list: {
    listStyle: 'none',
    margin: 0,
    padding: 0,
    display: 'flex',
    flexDirection: 'column',
    gap: 'var(--space-2)',
  },
  listItem: {
    display: 'flex',
    flexDirection: 'column',
    gap: '2px',
  },
  itemTitle: {
    fontSize: 'var(--text-sm)',
    color: 'var(--color-text-primary)',
    fontWeight: 500,
  },
  itemMeta: {
    fontSize: 'var(--text-xs)',
    color: 'var(--color-text-muted)',
  },
  errorList: {
    margin: '2px 0 0 0',
    paddingLeft: 'var(--space-4)',
  },
  errorItem: {
    fontSize: 'var(--text-xs)',
    fontFamily: 'var(--font-mono)',
    color: 'var(--color-text-secondary)',
    lineHeight: 1.5,
    overflowWrap: 'anywhere',
  },
  ignored: {
    fontSize: 'var(--text-xs)',
    color: 'var(--color-text-muted)',
    margin: '0 0 var(--space-3) 0',
  },
  requestFailed: {
    fontSize: 'var(--text-sm)',
    color: 'var(--color-danger)',
    margin: '0 0 var(--space-3) 0',
  },
  footer: {
    display: 'flex',
    justifyContent: 'flex-end',
    marginTop: 'var(--space-2)',
  },
};
