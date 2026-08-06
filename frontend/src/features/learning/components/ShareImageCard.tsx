import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Check, Download } from 'lucide-react';
import {
  drawShareCard,
  renderShareCardBlob,
  SHARE_CARD_HEIGHT,
  SHARE_CARD_WIDTH,
  type ShareCardData,
} from '../shareImageCard';

interface ShareImageCardProps {
  data: ShareCardData;
  alt: string;
  fileName: string;
}

/**
 * The downloadable 1200x630 image preview: a real <canvas>, drawn once and
 * redrawn when web fonts finish loading so the on-brand typeface has a chance
 * to land before the export. `toBlob` on that same element is the download —
 * no offscreen buffer needed since the canvas already holds the full-resolution
 * pixels regardless of how small its CSS display size is.
 */
export default function ShareImageCard({ data, alt, fileName }: ShareImageCardProps) {
  const { t } = useTranslation();
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [downloaded, setDownloaded] = useState(false);
  const resetRef = useRef<number | undefined>(undefined);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    drawShareCard(canvas, data);
    let cancelled = false;
    document.fonts?.ready
      ?.then(() => {
        if (!cancelled) drawShareCard(canvas, data);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [data]);

  useEffect(() => () => window.clearTimeout(resetRef.current), []);

  const handleDownload = async () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const blob = await renderShareCardBlob(canvas, data);
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
      <canvas
        ref={canvasRef}
        width={SHARE_CARD_WIDTH}
        height={SHARE_CARD_HEIGHT}
        role="img"
        aria-label={alt}
        style={styles.canvas}
      />
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
    borderRadius: 'var(--radius-md)',
    overflow: 'hidden',
    border: '1px solid var(--border-color)',
    lineHeight: 0,
  },
  canvas: {
    display: 'block',
    width: '100%',
    height: 'auto',
    aspectRatio: `${SHARE_CARD_WIDTH} / ${SHARE_CARD_HEIGHT}`,
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
