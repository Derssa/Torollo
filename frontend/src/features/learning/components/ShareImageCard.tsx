import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Check, Download } from 'lucide-react';
import { drawShareCardPreview, renderShareCardBlob, type ShareCardData } from '../shareImageCard';

interface ShareImageCardProps {
  data: ShareCardData;
  alt: string;
  fileName: string;
}

/**
 * The share card preview: a <canvas> sized to exactly the card's own content
 * (via `drawShareCardPreview`), so a short roadmap's card renders as a small
 * box instead of a mostly-empty 1200x630 one. The actual download is the full
 * social-sized image, rendered separately on an offscreen canvas at export
 * time — the two never need to share pixel dimensions.
 */
export default function ShareImageCard({ data, alt, fileName }: ShareImageCardProps) {
  const { t } = useTranslation();
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [downloaded, setDownloaded] = useState(false);
  const resetRef = useRef<number | undefined>(undefined);

  useLayoutEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    drawShareCardPreview(canvas, data);
    let cancelled = false;
    document.fonts?.ready
      ?.then(() => {
        if (!cancelled) drawShareCardPreview(canvas, data);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [data]);

  useEffect(() => () => window.clearTimeout(resetRef.current), []);

  const handleDownload = async () => {
    const exportCanvas = document.createElement('canvas');
    const blob = await renderShareCardBlob(exportCanvas, data);
    if (!blob) return;
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = fileName;
    link.click();
    URL.revokeObjectURL(url);
    setDownloaded(true);
    window.clearTimeout(resetRef.current);
    resetRef.current = window.setTimeout(() => setDownloaded(false), 1500);
  };

  const label = downloaded
    ? t('learning.player.completion.imageDownloaded')
    : t('learning.player.completion.downloadImage');

  return (
    <div style={styles.wrap}>
      <canvas ref={canvasRef} role="img" aria-label={alt} style={styles.canvas} />
      <button
        type="button"
        onClick={handleDownload}
        aria-label={label}
        title={label}
        style={styles.downloadBtn}
      >
        {downloaded ? <Check size={13} color="var(--color-success)" /> : <Download size={13} color="var(--color-text-muted)" />}
      </button>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  wrap: {
    position: 'relative',
    display: 'inline-block',
    maxWidth: '420px',
    borderRadius: 'var(--radius-md)',
    overflow: 'hidden',
    border: '1px solid var(--border-color)',
    lineHeight: 0,
  },
  canvas: {
    display: 'block',
    width: '100%',
    height: 'auto',
  },
  downloadBtn: {
    position: 'absolute',
    top: 'var(--space-2)',
    right: 'var(--space-2)',
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    width: '28px',
    height: '28px',
    background: 'var(--bg-surface-solid)',
    border: '1px solid var(--border-color)',
    borderRadius: 'var(--radius-sm)',
    cursor: 'pointer',
    padding: 0,
  },
};
