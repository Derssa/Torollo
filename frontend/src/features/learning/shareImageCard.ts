/**
 * The 1200x630 share card: a completed roadmap rendered as a standalone PNG,
 * the standard social-image size so it drops straight into an X/LinkedIn/
 * Reddit post. Drawn on a plain <canvas> instead of a DOM screenshot library —
 * the layout is fixed and text-only, so hand-drawing it is both the simplest
 * and the only dependency-free way to get pixel-identical output everywhere.
 *
 * Kept translation-free like the rest of this feature's data layer: callers
 * pass already-translated strings in, so this module is just geometry.
 */

export const SHARE_CARD_WIDTH = 1200;
export const SHARE_CARD_HEIGHT = 630;

export interface ShareCardTopologyEntry {
  name: string;
  /** Already-translated role label, e.g. "Load balancer". */
  role: string;
}

export interface ShareCardData {
  title: string;
  /** e.g. "10 of 10 steps passing · 20 of 20 checks passed". */
  statsLine: string;
  /** Already-translated skill labels. */
  skills: string[];
  topologyLabel: string;
  topology: ShareCardTopologyEntry[];
  /** Set when `topology` was truncated, e.g. "+2 more". */
  moreTopologyLabel?: string;
  footerBrand: string;
  footerUrl: string;
}

const PALETTE = {
  background: '#FFFFFF',
  border: 'rgba(0, 0, 0, 0.10)',
  textPrimary: '#1F2937',
  textSecondary: '#4B5563',
  textMuted: '#9CA3AF',
  success: '#059669',
  accent: '#2563EB',
  chipBg: '#F9FAFB',
  chipBorder: 'rgba(0, 0, 0, 0.08)',
};

const FONT_FAMILY = "'Plus Jakarta Sans', system-ui, -apple-system, sans-serif";
const PAD = 64;
const MAX_TOPOLOGY_ROWS = 6;

function font(px: number, weight = 400): string {
  return `${weight} ${px}px ${FONT_FAMILY}`;
}

function roundedRectPath(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number
): void {
  if (typeof ctx.roundRect === 'function') {
    ctx.beginPath();
    ctx.roundRect(x, y, w, h, r);
    return;
  }
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

/** Truncates to fit `maxWidth`, appending an ellipsis — the font must already be set on `ctx`. */
function fitText(ctx: CanvasRenderingContext2D, text: string, maxWidth: number): string {
  if (ctx.measureText(text).width <= maxWidth) return text;
  const ellipsis = '…';
  let lo = 0;
  let hi = text.length;
  while (lo < hi) {
    const mid = Math.ceil((lo + hi) / 2);
    if (ctx.measureText(text.slice(0, mid) + ellipsis).width <= maxWidth) lo = mid;
    else hi = mid - 1;
  }
  return text.slice(0, lo) + ellipsis;
}

function drawCheckGlyph(ctx: CanvasRenderingContext2D, cx: number, cy: number, r: number, color: string): void {
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, Math.PI * 2);
  ctx.fillStyle = color;
  ctx.fill();
  ctx.strokeStyle = '#FFFFFF';
  ctx.lineWidth = Math.max(1.5, r * 0.22);
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.beginPath();
  ctx.moveTo(cx - r * 0.5, cy);
  ctx.lineTo(cx - r * 0.12, cy + r * 0.4);
  ctx.lineTo(cx + r * 0.55, cy - r * 0.4);
  ctx.stroke();
}

interface ChipEntry {
  label: string;
  width: number;
}

/** Wraps chip labels into rows that fit `maxWidth`, pill padding included. */
function layoutChips(ctx: CanvasRenderingContext2D, labels: string[], maxWidth: number): ChipEntry[][] {
  const gap = 10;
  const paddingX = 16;
  const rows: ChipEntry[][] = [];
  let row: ChipEntry[] = [];
  let rowWidth = 0;
  for (const label of labels) {
    const width = ctx.measureText(label).width + paddingX * 2;
    const needed = row.length === 0 ? width : rowWidth + gap + width;
    if (needed > maxWidth && row.length > 0) {
      rows.push(row);
      row = [{ label, width }];
      rowWidth = width;
    } else {
      row.push({ label, width });
      rowWidth = needed;
    }
  }
  if (row.length > 0) rows.push(row);
  return rows;
}

/** Draws the full share card into `canvas`, resizing it to the fixed 1200x630 buffer. */
export function drawShareCard(canvas: HTMLCanvasElement, data: ShareCardData): void {
  canvas.width = SHARE_CARD_WIDTH;
  canvas.height = SHARE_CARD_HEIGHT;
  const ctx = canvas.getContext('2d');
  if (!ctx) return;

  const contentX0 = PAD;
  const contentX1 = SHARE_CARD_WIDTH - PAD;
  const contentWidth = contentX1 - contentX0;

  ctx.fillStyle = PALETTE.background;
  ctx.fillRect(0, 0, SHARE_CARD_WIDTH, SHARE_CARD_HEIGHT);
  ctx.strokeStyle = PALETTE.border;
  ctx.lineWidth = 1;
  ctx.strokeRect(0.5, 0.5, SHARE_CARD_WIDTH - 1, SHARE_CARD_HEIGHT - 1);

  ctx.textBaseline = 'top';
  ctx.fillStyle = PALETTE.textPrimary;

  // Title + status disc, full width.
  const titleSize = 34;
  const discR = 15;
  ctx.font = font(titleSize, 700);
  const title = fitText(ctx, data.title, contentWidth - discR * 2 - 16);
  ctx.fillText(title, contentX0, PAD);
  const titleWidth = ctx.measureText(title).width;
  drawCheckGlyph(ctx, contentX0 + titleWidth + 16 + discR, PAD + titleSize * 0.42, discR, PALETTE.success);

  // Stats line.
  const statsY = PAD + titleSize * 1.3 + 12;
  ctx.font = font(20, 600);
  ctx.fillStyle = PALETTE.success;
  ctx.fillText(data.statsLine, contentX0, statsY);

  // Two columns: skill chips on the left, topology on the right.
  const columnsY = statsY + 20 * 1.3 + 36;
  const columnsBottom = SHARE_CARD_HEIGHT - PAD - 56;
  const rightColWidth = 340;
  const columnGap = 48;
  const leftColWidth = contentWidth - rightColWidth - columnGap;
  const dividerX = contentX0 + leftColWidth + columnGap / 2;

  ctx.strokeStyle = PALETTE.border;
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(dividerX, columnsY);
  ctx.lineTo(dividerX, columnsBottom);
  ctx.stroke();

  // Skill chips, left column.
  ctx.font = font(15, 600);
  const chipRows = layoutChips(ctx, data.skills, leftColWidth);
  const chipHeight = 34;
  const chipRowGap = 12;
  let chipY = columnsY;
  for (const row of chipRows) {
    let chipX = contentX0;
    for (const chip of row) {
      roundedRectPath(ctx, chipX, chipY, chip.width, chipHeight, chipHeight / 2);
      ctx.fillStyle = PALETTE.chipBg;
      ctx.fill();
      ctx.strokeStyle = PALETTE.chipBorder;
      ctx.lineWidth = 1;
      ctx.stroke();
      ctx.fillStyle = PALETTE.textSecondary;
      ctx.fillText(chip.label, chipX + 16, chipY + (chipHeight - 15) / 2);
      chipX += chip.width + 10;
    }
    chipY += chipHeight + chipRowGap;
  }

  // Topology, right column.
  const rightColX = dividerX + columnGap / 2;
  ctx.font = font(12, 600);
  ctx.fillStyle = PALETTE.textMuted;
  ctx.fillText(data.topologyLabel.toUpperCase(), rightColX, columnsY);

  const rows = data.topology.slice(0, MAX_TOPOLOGY_ROWS);
  const rowCount = rows.length + (data.moreTopologyLabel ? 1 : 0);
  const listTop = columnsY + 12 * 1.3 + 16;
  const rowHeight = rowCount > 0 ? Math.min(44, Math.max(28, (columnsBottom - listTop) / rowCount)) : 0;
  const glyphR = 7;
  ctx.font = font(15, 500);
  rows.forEach((entry, index) => {
    const rowY = listTop + rowHeight * index;
    drawCheckGlyph(ctx, rightColX + glyphR, rowY + rowHeight / 2 - 1, glyphR, PALETTE.success);
    const text = fitText(ctx, `${entry.name} (${entry.role})`, rightColWidth - glyphR * 2 - 12);
    ctx.fillStyle = PALETTE.textPrimary;
    ctx.fillText(text, rightColX + glyphR * 2 + 12, rowY + rowHeight / 2 - 8);
  });
  if (data.moreTopologyLabel) {
    const rowY = listTop + rowHeight * rows.length;
    ctx.font = font(14, 500);
    ctx.fillStyle = PALETTE.textMuted;
    ctx.fillText(data.moreTopologyLabel, rightColX + glyphR * 2 + 12, rowY + rowHeight / 2 - 7);
  }

  // Footer.
  const footerDividerY = SHARE_CARD_HEIGHT - PAD - 40;
  ctx.strokeStyle = PALETTE.border;
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(contentX0, footerDividerY);
  ctx.lineTo(contentX1, footerDividerY);
  ctx.stroke();

  const footerY = footerDividerY + 18;
  ctx.font = font(16, 500);
  ctx.fillStyle = PALETTE.textMuted;
  ctx.fillText(data.footerBrand, contentX0, footerY);
  const brandWidth = ctx.measureText(data.footerBrand).width;
  const sep = '  ·  ';
  ctx.fillText(sep, contentX0 + brandWidth, footerY);
  const sepWidth = ctx.measureText(sep).width;
  ctx.font = font(16, 600);
  ctx.fillStyle = PALETTE.accent;
  ctx.fillText(data.footerUrl, contentX0 + brandWidth + sepWidth, footerY);
}

/** Draws then exports `canvas` as a PNG blob, or `null` if the canvas can't encode one. */
export function renderShareCardBlob(canvas: HTMLCanvasElement, data: ShareCardData): Promise<Blob | null> {
  drawShareCard(canvas, data);
  return new Promise(resolve => {
    if (typeof canvas.toBlob !== 'function') {
      resolve(null);
      return;
    }
    canvas.toBlob(resolve, 'image/png');
  });
}
