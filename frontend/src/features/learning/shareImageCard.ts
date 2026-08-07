/**
 * The 1200x630 share card: a completed roadmap rendered as a standalone PNG,
 * the standard social-image size so it drops straight into an X/LinkedIn/
 * Reddit post. Drawn on a plain <canvas> instead of a DOM screenshot library —
 * the content is text-only, so hand-drawing it is both the simplest and the
 * only dependency-free way to get pixel-identical output everywhere.
 *
 * The card sizes itself to its content (steps/checks/skills/topology all vary
 * per roadmap) rather than stretching to fill a fixed box. Two entry points
 * share that same geometry: `drawShareCard` paints the full 1200x630 social
 * image (card centered on a page background — this is what gets downloaded),
 * while `drawShareCardPreview` paints only the card itself, sized exactly to
 * its content, for a compact in-app preview that doesn't reserve a big empty
 * box for a short roadmap's card.
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
  pageBg: '#EEF1F4',
  cardBg: '#FFFFFF',
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
const MAX_TOPOLOGY_ROWS = 6;

// The full social image centers the (content-sized) card on a fixed 1200x630
// canvas — CARD_MARGIN_X is the horizontal margin around it, CARD_MIN_MARGIN_Y
// the minimum vertical one once centering is clamped for a tall card.
const CARD_MARGIN_X = 24;
const CARD_MIN_MARGIN_Y = 24;
const CARD_PAD = 40;
const CARD_RADIUS = 20;

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

interface CardLayout {
  cardWidth: number;
  cardHeight: number;
  title: string;
  titleSize: number;
  discR: number;
  contentX0: number;
  contentWidth: number;
  statsY: number;
  statsSize: number;
  columnsY: number;
  columnsBottom: number;
  dividerX: number;
  rightColX: number;
  rightColWidth: number;
  chipRows: ChipEntry[][];
  chipHeight: number;
  chipRowGap: number;
  topoRows: ShareCardTopologyEntry[];
  topoRowHeight: number;
  listTop: number;
  footerDividerY: number;
  footerY: number;
  footerTextSize: number;
}

/**
 * Measures everything the card needs to draw itself, in card-local
 * coordinates (0,0 is the card's own top-left corner) — independent of
 * where that card then gets painted on the canvas.
 */
function computeLayout(ctx: CanvasRenderingContext2D, data: ShareCardData, cardWidth: number): CardLayout {
  const contentX0 = CARD_PAD;
  const contentWidth = cardWidth - CARD_PAD * 2;
  ctx.textBaseline = 'top';

  const titleSize = 30;
  const discR = 13;
  ctx.font = font(titleSize, 700);
  const title = fitText(ctx, data.title, contentWidth - discR * 2 - 16);

  const statsSize = 18;
  const statsGap = 12;
  const columnsGap = 28;

  const rightColWidth = 260;
  const columnGap = 40;
  const leftColWidth = contentWidth - rightColWidth - columnGap;
  const dividerX = contentX0 + leftColWidth + columnGap / 2;
  const rightColX = dividerX + columnGap / 2;

  ctx.font = font(15, 600);
  const chipRows = layoutChips(ctx, data.skills, leftColWidth);
  const chipHeight = 34;
  const chipRowGap = 10;
  const chipsHeight =
    chipRows.length > 0 ? chipRows.length * chipHeight + (chipRows.length - 1) * chipRowGap : 0;

  const topoLabelHeight = 12 * 1.3;
  const topoLabelGap = 14;
  const topoRowHeight = 32;
  const topoRows = data.topology.slice(0, MAX_TOPOLOGY_ROWS);
  const topoRowCount = topoRows.length + (data.moreTopologyLabel ? 1 : 0);
  const topologyHeight = topoLabelHeight + topoLabelGap + topoRowCount * topoRowHeight;

  const columnsHeight = Math.max(chipsHeight, topologyHeight);

  const footerGap = 28;
  const footerTextSize = 16;

  const contentY0 = CARD_PAD;
  const statsY = contentY0 + titleSize * 1.3 + statsGap;
  const columnsY = statsY + statsSize * 1.3 + columnsGap;
  const columnsBottom = columnsY + columnsHeight;
  const listTop = columnsY + topoLabelHeight + topoLabelGap;
  const footerDividerY = columnsBottom + footerGap;
  const footerY = footerDividerY + 18;

  const cardHeight = footerY + footerTextSize + CARD_PAD;

  return {
    cardWidth,
    cardHeight,
    title,
    titleSize,
    discR,
    contentX0,
    contentWidth,
    statsY,
    statsSize,
    columnsY,
    columnsBottom,
    dividerX,
    rightColX,
    rightColWidth,
    chipRows,
    chipHeight,
    chipRowGap,
    topoRows,
    topoRowHeight,
    listTop,
    footerDividerY,
    footerY,
    footerTextSize,
  };
}

/** Paints the card (background, border and all content) with its top-left corner at the current origin. */
function paintCard(ctx: CanvasRenderingContext2D, data: ShareCardData, layout: CardLayout): void {
  const { contentX0, contentWidth } = layout;

  roundedRectPath(ctx, 0, 0, layout.cardWidth, layout.cardHeight, CARD_RADIUS);
  ctx.fillStyle = PALETTE.cardBg;
  ctx.fill();
  ctx.strokeStyle = PALETTE.border;
  ctx.lineWidth = 1;
  ctx.stroke();

  // Title + status disc, full width.
  ctx.textBaseline = 'top';
  ctx.font = font(layout.titleSize, 700);
  ctx.fillStyle = PALETTE.textPrimary;
  ctx.fillText(layout.title, contentX0, CARD_PAD);
  const titleWidth = ctx.measureText(layout.title).width;
  drawCheckGlyph(
    ctx,
    contentX0 + titleWidth + 16 + layout.discR,
    CARD_PAD + layout.titleSize * 0.42,
    layout.discR,
    PALETTE.success
  );

  // Stats line.
  ctx.font = font(layout.statsSize, 600);
  ctx.fillStyle = PALETTE.success;
  ctx.fillText(data.statsLine, contentX0, layout.statsY);

  // Divider between the two columns.
  ctx.strokeStyle = PALETTE.border;
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(layout.dividerX, layout.columnsY);
  ctx.lineTo(layout.dividerX, layout.columnsBottom);
  ctx.stroke();

  // Skill chips, left column.
  ctx.font = font(15, 600);
  let chipY = layout.columnsY;
  for (const row of layout.chipRows) {
    let chipX = contentX0;
    for (const chip of row) {
      roundedRectPath(ctx, chipX, chipY, chip.width, layout.chipHeight, layout.chipHeight / 2);
      ctx.fillStyle = PALETTE.chipBg;
      ctx.fill();
      ctx.strokeStyle = PALETTE.chipBorder;
      ctx.lineWidth = 1;
      ctx.stroke();
      ctx.fillStyle = PALETTE.textSecondary;
      ctx.fillText(chip.label, chipX + 16, chipY + (layout.chipHeight - 15) / 2);
      chipX += chip.width + 10;
    }
    chipY += layout.chipHeight + layout.chipRowGap;
  }

  // Topology, right column.
  ctx.font = font(12, 600);
  ctx.fillStyle = PALETTE.textMuted;
  ctx.fillText(data.topologyLabel.toUpperCase(), layout.rightColX, layout.columnsY);

  const glyphR = 7;
  ctx.font = font(15, 500);
  layout.topoRows.forEach((entry, index) => {
    const rowY = layout.listTop + layout.topoRowHeight * index;
    drawCheckGlyph(ctx, layout.rightColX + glyphR, rowY + layout.topoRowHeight / 2 - 1, glyphR, PALETTE.success);
    const text = fitText(ctx, `${entry.name} (${entry.role})`, layout.rightColWidth - glyphR * 2 - 12);
    ctx.fillStyle = PALETTE.textPrimary;
    ctx.fillText(text, layout.rightColX + glyphR * 2 + 12, rowY + layout.topoRowHeight / 2 - 8);
  });
  if (data.moreTopologyLabel) {
    const rowY = layout.listTop + layout.topoRowHeight * layout.topoRows.length;
    ctx.font = font(14, 500);
    ctx.fillStyle = PALETTE.textMuted;
    ctx.fillText(data.moreTopologyLabel, layout.rightColX + glyphR * 2 + 12, rowY + layout.topoRowHeight / 2 - 7);
  }

  // Footer.
  ctx.strokeStyle = PALETTE.border;
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(contentX0, layout.footerDividerY);
  ctx.lineTo(contentX0 + contentWidth, layout.footerDividerY);
  ctx.stroke();

  ctx.font = font(layout.footerTextSize, 500);
  ctx.fillStyle = PALETTE.textMuted;
  ctx.fillText(data.footerBrand, contentX0, layout.footerY);
  const brandWidth = ctx.measureText(data.footerBrand).width;
  const sep = '  ·  ';
  ctx.fillText(sep, contentX0 + brandWidth, layout.footerY);
  const sepWidth = ctx.measureText(sep).width;
  ctx.font = font(layout.footerTextSize, 600);
  ctx.fillStyle = PALETTE.accent;
  ctx.fillText(data.footerUrl, contentX0 + brandWidth + sepWidth, layout.footerY);
}

/** Draws the full 1200x630 social image (card centered on a page background) — this is what gets downloaded. */
export function drawShareCard(canvas: HTMLCanvasElement, data: ShareCardData): void {
  const ctx = canvas.getContext('2d');
  if (!ctx) {
    canvas.width = SHARE_CARD_WIDTH;
    canvas.height = SHARE_CARD_HEIGHT;
    return;
  }

  const cardWidth = SHARE_CARD_WIDTH - CARD_MARGIN_X * 2;
  const layout = computeLayout(ctx, data, cardWidth);

  canvas.width = SHARE_CARD_WIDTH;
  canvas.height = SHARE_CARD_HEIGHT;

  const cardY = Math.max(CARD_MIN_MARGIN_Y, (SHARE_CARD_HEIGHT - layout.cardHeight) / 2);

  ctx.fillStyle = PALETTE.pageBg;
  ctx.fillRect(0, 0, SHARE_CARD_WIDTH, SHARE_CARD_HEIGHT);

  ctx.save();
  ctx.translate(CARD_MARGIN_X, cardY);
  paintCard(ctx, data, layout);
  ctx.restore();
}

/**
 * Draws just the card, sized exactly to its content (no page background or
 * margin) — used for the compact in-app preview, so a short roadmap's card
 * doesn't reserve the same box as a long one's. Returns the pixel size drawn.
 */
export function drawShareCardPreview(canvas: HTMLCanvasElement, data: ShareCardData): { width: number; height: number } {
  const previewCardWidth = SHARE_CARD_WIDTH - CARD_MARGIN_X * 2;
  const ctx = canvas.getContext('2d');
  if (!ctx) {
    canvas.width = previewCardWidth;
    canvas.height = CARD_PAD * 2;
    return { width: canvas.width, height: canvas.height };
  }

  const layout = computeLayout(ctx, data, previewCardWidth);
  canvas.width = layout.cardWidth;
  canvas.height = layout.cardHeight;
  paintCard(ctx, data, layout);
  return { width: layout.cardWidth, height: layout.cardHeight };
}

/** Draws the full social image then exports `canvas` as a PNG blob, or `null` if the canvas can't encode one. */
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
