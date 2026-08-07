/**
 * The 1200x630 share card: a completed roadmap rendered as a standalone PNG,
 * the standard social-image size so it drops straight into an X/LinkedIn/
 * Reddit post. Drawn on a plain <canvas> instead of a DOM screenshot library —
 * the content is text-only, so hand-drawing it is both the simplest and the
 * only dependency-free way to get pixel-identical output everywhere.
 *
 * The card sizes itself to its content (steps/checks/skills/topology all vary
 * per roadmap) rather than stretching to fill a fixed box. Two entry points
 * share the same layout logic but use different `CardScale`s:
 * `drawShareCard` paints the full 1200x630 social image at DOWNLOAD_SCALE
 * (card centered on a page background — this is what gets downloaded), while
 * `drawShareCardPreview` paints only the card at PREVIEW_SCALE, a distinct,
 * deliberately larger font-to-width ratio so the in-app preview stays legible
 * at the small size it's actually displayed at — simply shrinking the download
 * design to fit a few hundred pixels makes every secondary line unreadable.
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

interface CardScale {
  cardWidth: number;
  cardPad: number;
  cardRadius: number;
  titleSize: number;
  discR: number;
  titleDiscGap: number;
  statsSize: number;
  statsGap: number;
  columnsGap: number;
  rightColWidth: number;
  columnGap: number;
  chipFontSize: number;
  chipHeight: number;
  chipRowGap: number;
  chipGapX: number;
  chipPaddingX: number;
  topoLabelSize: number;
  topoLabelGap: number;
  topoRowHeight: number;
  topoFontSize: number;
  topoMoreFontSize: number;
  glyphR: number;
  glyphTextGap: number;
  footerGap: number;
  footerDividerGap: number;
  footerTextSize: number;
}

/** The design the downloaded 1200x630 PNG is drawn at. */
const DOWNLOAD_SCALE: CardScale = {
  cardWidth: SHARE_CARD_WIDTH - CARD_MARGIN_X * 2,
  cardPad: 40,
  cardRadius: 20,
  titleSize: 30,
  discR: 13,
  titleDiscGap: 16,
  statsSize: 18,
  statsGap: 12,
  columnsGap: 28,
  rightColWidth: 260,
  columnGap: 40,
  chipFontSize: 15,
  chipHeight: 34,
  chipRowGap: 10,
  chipGapX: 10,
  chipPaddingX: 16,
  topoLabelSize: 12,
  topoLabelGap: 14,
  topoRowHeight: 32,
  topoFontSize: 15,
  topoMoreFontSize: 14,
  glyphR: 7,
  glyphTextGap: 12,
  footerGap: 28,
  footerDividerGap: 18,
  footerTextSize: 16,
};

/**
 * The design the in-app preview is drawn at. Not a linear scale-down of
 * DOWNLOAD_SCALE — a 460px-wide card needs a much higher font-to-width ratio
 * than a 1152px-wide one to stay readable, so every size here was picked for
 * legibility at this card's own width, not derived by proportion.
 */
const PREVIEW_SCALE: CardScale = {
  cardWidth: 460,
  cardPad: 20,
  cardRadius: 12,
  titleSize: 17,
  discR: 8,
  titleDiscGap: 8,
  statsSize: 12,
  statsGap: 8,
  columnsGap: 16,
  rightColWidth: 150,
  columnGap: 18,
  chipFontSize: 11,
  chipHeight: 22,
  chipRowGap: 6,
  chipGapX: 6,
  chipPaddingX: 9,
  topoLabelSize: 9,
  topoLabelGap: 8,
  topoRowHeight: 20,
  topoFontSize: 11,
  topoMoreFontSize: 10,
  glyphR: 5,
  glyphTextGap: 6,
  footerGap: 14,
  footerDividerGap: 10,
  footerTextSize: 11,
};

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
function layoutChips(
  ctx: CanvasRenderingContext2D,
  labels: string[],
  maxWidth: number,
  gap: number,
  paddingX: number
): ChipEntry[][] {
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
  scale: CardScale;
  cardHeight: number;
  title: string;
  contentX0: number;
  contentWidth: number;
  statsY: number;
  columnsY: number;
  columnsBottom: number;
  dividerX: number;
  rightColX: number;
  chipRows: ChipEntry[][];
  topoRows: ShareCardTopologyEntry[];
  listTop: number;
  footerDividerY: number;
  footerY: number;
}

/**
 * Measures everything the card needs to draw itself at the given `scale`, in
 * card-local coordinates (0,0 is the card's own top-left corner) — independent
 * of where that card then gets painted on the canvas.
 */
function computeLayout(ctx: CanvasRenderingContext2D, data: ShareCardData, scale: CardScale): CardLayout {
  const contentX0 = scale.cardPad;
  const contentWidth = scale.cardWidth - scale.cardPad * 2;
  ctx.textBaseline = 'top';

  ctx.font = font(scale.titleSize, 700);
  const title = fitText(ctx, data.title, contentWidth - scale.discR * 2 - scale.titleDiscGap);

  const leftColWidth = contentWidth - scale.rightColWidth - scale.columnGap;
  const dividerX = contentX0 + leftColWidth + scale.columnGap / 2;
  const rightColX = dividerX + scale.columnGap / 2;

  ctx.font = font(scale.chipFontSize, 600);
  const chipRows = layoutChips(ctx, data.skills, leftColWidth, scale.chipGapX, scale.chipPaddingX);
  const chipsHeight =
    chipRows.length > 0 ? chipRows.length * scale.chipHeight + (chipRows.length - 1) * scale.chipRowGap : 0;

  const topoLabelHeight = scale.topoLabelSize * 1.3;
  const topoRows = data.topology.slice(0, MAX_TOPOLOGY_ROWS);
  const topoRowCount = topoRows.length + (data.moreTopologyLabel ? 1 : 0);
  const topologyHeight = topoLabelHeight + scale.topoLabelGap + topoRowCount * scale.topoRowHeight;

  const columnsHeight = Math.max(chipsHeight, topologyHeight);

  const contentY0 = scale.cardPad;
  const statsY = contentY0 + scale.titleSize * 1.3 + scale.statsGap;
  const columnsY = statsY + scale.statsSize * 1.3 + scale.columnsGap;
  const columnsBottom = columnsY + columnsHeight;
  const listTop = columnsY + topoLabelHeight + scale.topoLabelGap;
  const footerDividerY = columnsBottom + scale.footerGap;
  const footerY = footerDividerY + scale.footerDividerGap;

  const cardHeight = footerY + scale.footerTextSize + scale.cardPad;

  return {
    scale,
    cardHeight,
    title,
    contentX0,
    contentWidth,
    statsY,
    columnsY,
    columnsBottom,
    dividerX,
    rightColX,
    chipRows,
    topoRows,
    listTop,
    footerDividerY,
    footerY,
  };
}

/** Paints the card (background, border and all content) with its top-left corner at the current origin. */
function paintCard(ctx: CanvasRenderingContext2D, data: ShareCardData, layout: CardLayout): void {
  const { scale, contentX0, contentWidth } = layout;

  roundedRectPath(ctx, 0, 0, scale.cardWidth, layout.cardHeight, scale.cardRadius);
  ctx.fillStyle = PALETTE.cardBg;
  ctx.fill();
  ctx.strokeStyle = PALETTE.border;
  ctx.lineWidth = 1;
  ctx.stroke();

  // Title + status disc, full width.
  ctx.textBaseline = 'top';
  ctx.font = font(scale.titleSize, 700);
  ctx.fillStyle = PALETTE.textPrimary;
  ctx.fillText(layout.title, contentX0, scale.cardPad);
  const titleWidth = ctx.measureText(layout.title).width;
  drawCheckGlyph(
    ctx,
    contentX0 + titleWidth + scale.titleDiscGap + scale.discR,
    scale.cardPad + scale.titleSize * 0.42,
    scale.discR,
    PALETTE.success
  );

  // Stats line.
  ctx.font = font(scale.statsSize, 600);
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
  ctx.font = font(scale.chipFontSize, 600);
  let chipY = layout.columnsY;
  for (const row of layout.chipRows) {
    let chipX = contentX0;
    for (const chip of row) {
      roundedRectPath(ctx, chipX, chipY, chip.width, scale.chipHeight, scale.chipHeight / 2);
      ctx.fillStyle = PALETTE.chipBg;
      ctx.fill();
      ctx.strokeStyle = PALETTE.chipBorder;
      ctx.lineWidth = 1;
      ctx.stroke();
      ctx.fillStyle = PALETTE.textSecondary;
      ctx.fillText(chip.label, chipX + scale.chipPaddingX, chipY + (scale.chipHeight - scale.chipFontSize) / 2);
      chipX += chip.width + scale.chipGapX;
    }
    chipY += scale.chipHeight + scale.chipRowGap;
  }

  // Topology, right column.
  ctx.font = font(scale.topoLabelSize, 600);
  ctx.fillStyle = PALETTE.textMuted;
  ctx.fillText(data.topologyLabel.toUpperCase(), layout.rightColX, layout.columnsY);

  const glyphR = scale.glyphR;
  const textX = layout.rightColX + glyphR * 2 + scale.glyphTextGap;
  ctx.font = font(scale.topoFontSize, 500);
  layout.topoRows.forEach((entry, index) => {
    const rowY = layout.listTop + scale.topoRowHeight * index;
    drawCheckGlyph(ctx, layout.rightColX + glyphR, rowY + scale.topoRowHeight / 2 - 1, glyphR, PALETTE.success);
    const text = fitText(ctx, `${entry.name} (${entry.role})`, scale.rightColWidth - glyphR * 2 - scale.glyphTextGap);
    ctx.fillStyle = PALETTE.textPrimary;
    ctx.fillText(text, textX, rowY + scale.topoRowHeight / 2 - scale.topoFontSize * 0.5);
  });
  if (data.moreTopologyLabel) {
    const rowY = layout.listTop + scale.topoRowHeight * layout.topoRows.length;
    ctx.font = font(scale.topoMoreFontSize, 500);
    ctx.fillStyle = PALETTE.textMuted;
    ctx.fillText(data.moreTopologyLabel, textX, rowY + scale.topoRowHeight / 2 - scale.topoMoreFontSize * 0.47);
  }

  // Footer.
  ctx.strokeStyle = PALETTE.border;
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(contentX0, layout.footerDividerY);
  ctx.lineTo(contentX0 + contentWidth, layout.footerDividerY);
  ctx.stroke();

  ctx.font = font(scale.footerTextSize, 500);
  ctx.fillStyle = PALETTE.textMuted;
  ctx.fillText(data.footerBrand, contentX0, layout.footerY);
  const brandWidth = ctx.measureText(data.footerBrand).width;
  const sep = '  ·  ';
  ctx.fillText(sep, contentX0 + brandWidth, layout.footerY);
  const sepWidth = ctx.measureText(sep).width;
  ctx.font = font(scale.footerTextSize, 600);
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

  const layout = computeLayout(ctx, data, DOWNLOAD_SCALE);

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
 * Draws just the card at PREVIEW_SCALE — sized exactly to its content (no
 * page background or margin), with its own legible font sizes rather than a
 * shrunk copy of the download design. Renders at device pixel ratio for
 * sharpness while keeping its CSS size at the logical (unscaled) dimensions.
 * Used for the compact in-app preview. Returns the logical (CSS px) size.
 */
export function drawShareCardPreview(canvas: HTMLCanvasElement, data: ShareCardData): { width: number; height: number } {
  const ctx = canvas.getContext('2d');
  if (!ctx) {
    canvas.width = PREVIEW_SCALE.cardWidth;
    canvas.height = PREVIEW_SCALE.cardPad * 2;
    return { width: canvas.width, height: canvas.height };
  }

  const layout = computeLayout(ctx, data, PREVIEW_SCALE);
  const dpr = typeof window !== 'undefined' && window.devicePixelRatio ? window.devicePixelRatio : 1;

  canvas.width = Math.round(layout.scale.cardWidth * dpr);
  canvas.height = Math.round(layout.cardHeight * dpr);
  canvas.style.width = `${layout.scale.cardWidth}px`;
  canvas.style.height = `${layout.cardHeight}px`;

  const freshCtx = canvas.getContext('2d');
  if (!freshCtx) return { width: layout.scale.cardWidth, height: layout.cardHeight };
  freshCtx.setTransform(dpr, 0, 0, dpr, 0, 0);
  paintCard(freshCtx, data, layout);

  return { width: layout.scale.cardWidth, height: layout.cardHeight };
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
