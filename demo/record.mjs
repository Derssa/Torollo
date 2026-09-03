// Demo recorder — drives the REAL Torollo UI (served by `node bin/cli.js start`)
// with Playwright and captures a lossless frame sequence through the Chrome
// DevTools screencast. Playwright is only used for mouse/keyboard input: no
// request is intercepted, no DOM is injected, nothing is mocked — the ✗ and
// ✓ on screen are produced by the backend inspecting the Docker containers
// that setup.mjs created.
//
// Usage:  node record.mjs            # full recording → out/frames/, out/frames.json, out/cursor.json
//         node record.mjs --probe    # screenshots of each stage → out/probe-*.png (no frames)
// Env:    TOROLLO_UI (default http://localhost:23232), TOROLLO_CHROMIUM (executable path)

import { chromium } from 'playwright-core';
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { homedir } from 'node:os';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const OUT = join(HERE, 'out');
const UI = process.env.TOROLLO_UI ?? 'http://localhost:23232';
const PROBE = process.argv.includes('--probe');
const VIEWPORT = { width: 1280, height: 720 };

const state = JSON.parse(readFileSync(join(OUT, 'demo-state.json'), 'utf8'));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function findChromium() {
  if (process.env.TOROLLO_CHROMIUM) return process.env.TOROLLO_CHROMIUM;
  const candidates = [
    join(homedir(), '.cache/ms-playwright/chromium-1234/chrome-linux64/chrome'),
    join(homedir(), '.cache/ms-playwright/chromium-1234/chrome-linux/chrome'),
  ];
  return candidates.find(existsSync);
}

// Deterministic canvas layout (subnet-relative cell positions, same grid the
// canvas uses: pad 60, cell 340×190). Pure UI layout state — not Docker state.
const cell = (col, row) => ({ x: 60 + col * 340, y: 60 + row * 190 });
const layout = {
  [state.nodes.lb]: cell(0, 0),
  [state.nodes['web-1']]: cell(1, 0),
  [state.nodes['web-2']]: cell(2, 0),
  [state.nodes['web-asg']]: cell(0, 1),
  [state.nodes.db]: cell(1, 1),
};

const browser = await chromium.launch({
  executablePath: findChromium(),
  headless: true,
  args: ['--force-device-scale-factor=1', '--hide-scrollbars', '--font-render-hinting=none'],
});
const context = await browser.newContext({
  viewport: VIEWPORT,
  deviceScaleFactor: 1,
  colorScheme: 'dark',
  locale: 'en-US',
  reducedMotion: 'no-preference',
});
await context.addInitScript(
  ({ project, layoutKey, layout }) => {
    localStorage.setItem('torollo_theme', 'dark');
    localStorage.setItem('torollo_lang', 'en');
    localStorage.setItem('torollo-learning-pitch-seen', 'true');
    localStorage.setItem('akal-active-project', JSON.stringify(project));
    localStorage.setItem(layoutKey, JSON.stringify(layout));
  },
  {
    project: { id: state.projectId, name: state.projectName },
    layoutKey: `akal-lab-graph-layout-${state.projectId}`,
    layout,
  }
);
const page = await context.newPage();
async function scene() {

// ── capture ──────────────────────────────────────────────────────────────────
const frames = []; // { index, timestamp }
const cursor = []; // { t, x, y, kind }
const pendingWrites = [];
let frameIndex = 0;
let recording = false;
const cdp = await context.newCDPSession(page);
cdp.on('Page.screencastFrame', ({ data, metadata, sessionId }) => {
  // Ack first, write asynchronously: a blocking write here would stretch every
  // timed pause of the choreography.
  cdp.send('Page.screencastFrameAck', { sessionId }).catch(() => {});
  if (!recording) return;
  const index = frameIndex++;
  frames.push({ index, timestamp: metadata.timestamp });
  pendingWrites.push(writeFile(join(OUT, 'frames', `${String(index).padStart(5, '0')}.png`), Buffer.from(data, 'base64')));
});
async function startRecording() {
  if (PROBE) return;
  rmSync(join(OUT, 'frames'), { recursive: true, force: true });
  mkdirSync(join(OUT, 'frames'), { recursive: true });
  recording = true;
  await cdp.send('Page.startScreencast', { format: 'png', maxWidth: VIEWPORT.width, maxHeight: VIEWPORT.height, everyNthFrame: 2 });
}
async function stopRecording() {
  if (PROBE) return;
  await cdp.send('Page.stopScreencast');
  recording = false;
  await Promise.all(pendingWrites);
  writeFileSync(join(OUT, 'frames.json'), JSON.stringify(frames));
  writeFileSync(join(OUT, 'cursor.json'), JSON.stringify(cursor));
}
const now = () => Date.now() / 1000;
let probeCount = 0;
async function probe(label) {
  if (!PROBE) return;
  await page.screenshot({ path: join(OUT, `probe-${String(++probeCount).padStart(2, '0')}-${label}.png`) });
}

// ── humane pointer: eased moves, logged for the post-production cursor overlay ──
let pos = { x: 640, y: 400 };
async function moveTo(x, y, ms = 450) {
  const start = { ...pos };
  const t0 = now();
  cursor.push({ t: t0, x: start.x, y: start.y, kind: 'move' });
  // Time-based, not step-based: each mouse.move is a CDP round-trip that gets
  // slow under screencast load, so the position is derived from elapsed time
  // and the move always lasts `ms` regardless of how many updates land.
  for (;;) {
    const k = Math.min(1, (now() - t0) * 1000 / ms);
    const e = k < 0.5 ? 2 * k * k : 1 - Math.pow(-2 * k + 2, 2) / 2; // ease in-out
    await page.mouse.move(start.x + (x - start.x) * e, start.y + (y - start.y) * e);
    if (k >= 1) break;
    await sleep(16);
  }
  pos = { x, y };
  cursor.push({ t: now(), x, y, kind: 'move' });
}
async function center(locator) {
  await locator.waitFor({ state: 'visible' });
  let box = await locator.boundingBox();
  // Bring the target into the viewport with the wheel (visible, natural scrolling)
  // instead of an instant scrollIntoView jump.
  for (let i = 0; i < 30 && box && (box.y + box.height > VIEWPORT.height - 24 || box.y < 72); i++) {
    const dir = box.y + box.height > VIEWPORT.height - 24 ? 1 : -1;
    await page.mouse.move(box.x + box.width / 2, Math.min(VIEWPORT.height - 40, Math.max(80, box.y)));
    await page.mouse.wheel(0, dir * 90);
    await sleep(45);
    box = await locator.boundingBox();
  }
  if (!box) throw new Error('element has no box');
  return { x: box.x + box.width / 2, y: box.y + box.height / 2 };
}
async function click(locator, { settle = 200, ms = 450 } = {}) {
  const { x, y } = await center(locator);
  await moveTo(x, y, ms);
  await sleep(120);
  cursor.push({ t: now(), x, y, kind: 'down' });
  await page.mouse.down();
  await sleep(90);
  await page.mouse.up();
  cursor.push({ t: now(), x, y, kind: 'up' });
  await sleep(settle);
}
async function selectOption(selectLocator, value) {
  // A native <select> popup is not part of the page surface: move to it, click
  // to focus, then set the value through the keyboard-equivalent path.
  await click(selectLocator, { settle: 80 });
  await selectLocator.selectOption(value);
  await sleep(150);
}

// ── scene ────────────────────────────────────────────────────────────────────
await page.goto(UI, { waitUntil: 'networkidle' });
await page.getByText('web-1', { exact: true }).first().waitFor();
await page.getByText('db', { exact: true }).first().waitFor();
await sleep(1500); // canvas fitView + first container poll

// Before capture: the scene a learner mid-roadmap sees — the player open on
// step 7, node library folded, canvas fitted to the remaining room.
await page.locator('button', { has: page.locator('svg.lucide-chevron-right') }).first().click();
await page.getByRole('button', { name: 'Learning', exact: true }).click();
await page.getByRole('button', { name: /Deploy a resilient three-tier app/ }).click();
await page.getByText('Step 7 of 10').waitFor();
await sleep(400);
await page.locator('.react-flow__controls-fitview').click();
await page.mouse.move(640, 420);
await sleep(1500);
await probe('start');

const dbNode = page.locator('.react-flow__node', { has: page.getByText('db', { exact: true }) }).first();
const dbShield = dbNode.getByTitle('Configure Security Group (Firewall)');
// The modal's own close button (header = grandparent of the title) — never the
// toast's dismiss X, which is also the last lucide-x on the page.
const sgModalClose = () => page.getByText('Security Group: db (postgres)').locator('..').locator('..').locator('button');

await startRecording();
await sleep(2200); // the canvas and the step "Lock the vault", as the learner left them

// 1 · Validate → real ✗ from the backend (db still accepts 5432 from Anywhere).
const validateBtn = page.getByRole('button', { name: 'Validate', exact: true });
await click(validateBtn, { ms: 600 });
await page.getByRole('status').getByText('Not yet').waitFor({ timeout: 30_000 });
await probe('fail');
await sleep(3000); // readable ✗ (plus the second or so it already sat on screen)

// 2 · the real correction: replace the Anywhere rule by two per-server rules.
await click(dbShield, { ms: 650 });
await page.getByText('Security Group: db').waitFor();
await sleep(250);
const anywhereRow = page.locator('tr', { hasText: 'ALLOW' }).filter({ hasText: '5432' }).first();
await click(anywhereRow.getByTitle('Delete Rule'), { ms: 500 });
await sleep(400);
const form = page.locator('form');
// The port field already defaults to 5432 for a PostgreSQL node.
for (const server of ['web-1', 'web-2']) {
  await selectOption(form.locator('select[name="protocol"]'), 'TCP');
  await selectOption(form.locator('select[name="source"]'), state.nodes[server]);
  await click(form.getByRole('button', { name: 'Add Rule' }), { ms: 450 });
  await page.locator('tr', { hasText: `Node: ${server}` }).waitFor();
  await sleep(350);
}
await probe('sg-after');
await sleep(450);
await click(sgModalClose(), { ms: 450 });
await sleep(900); // edges web-1→db / web-2→db now on the canvas
await probe('canvas-fixed');

// 3 · Validate → real ✓ → the roadmap is complete: completion screen.
await click(validateBtn, { ms: 600 });
await page.getByText('Roadmap complete', { exact: true }).first().waitFor({ timeout: 30_000 });
await probe('completion');
await sleep(3000);

await stopRecording();
if (!PROBE) console.log(`[record] ${frames.length} frames, ${(frames.at(-1).timestamp - frames[0].timestamp).toFixed(1)}s`);
}

try {
  await scene();
} catch (err) {
  console.error(err);
  await page.screenshot({ path: join(OUT, 'error.png') }).catch(() => {});
  process.exitCode = 1;
} finally {
  await browser.close();
}
