// Demo setup — plays `resilient-three-tier` for real against a running Torollo
// backend + Docker, through the same REST API the canvas UI uses. Nothing is
// mocked: every step is graded by POST /api/learning/validate against the live
// containers. It deliberately leaves ONE step unvalidated — "Lock the vault"
// (lock-down-the-db) — whose own text says "press Validate before touching
// anything, and watch it fail". The recording (record.mjs) then performs that
// step live: real ✗, real fix, real ✓, real completion screen.
//
// Usage:  TOROLLO_API=http://localhost:23233 node setup.mjs
// Writes: out/demo-state.json (project id, node ids) for record.mjs.

import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { mkdirSync, writeFileSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const pexecFile = promisify(execFile);
const HERE = dirname(fileURLToPath(import.meta.url));
const API = process.env.TOROLLO_API ?? 'http://localhost:23233';
const ROADMAP_ID = 'resilient-three-tier';
const PROJECT_NAME = process.env.TOROLLO_DEMO_PROJECT ?? 'Nimbus Books';
const SUBNET_ID = 'subnet-public-1';
const SETTLE_MS = 2500; // async policy re-apply after lifecycle ops

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const log = (line) => console.log(`[setup] ${line}`);

async function http(method, path, body) {
  const res = await fetch(`${API}${path}`, {
    method,
    headers: { 'Content-Type': 'application/json', Connection: 'close' },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await res.text();
  let json;
  try { json = text ? JSON.parse(text) : undefined; } catch { json = text; }
  if (!res.ok) throw new Error(`${method} ${path} -> ${res.status}: ${typeof json === 'string' ? json : JSON.stringify(json)}`);
  return json;
}

const rid = () => Math.random().toString(36).slice(2, 10);
const defaultSecurityGroup = () => [
  { id: `sg-deny-in-${rid()}`, type: 'inbound', action: 'DENY', protocol: 'ALL', port: 'ALL', source: '0.0.0.0/0' },
  { id: `sg-allow-out-${rid()}`, type: 'outbound', action: 'ALLOW', protocol: 'ALL', port: 'ALL', source: '0.0.0.0/0' },
];

// Pull the code blocks out of the roadmap file itself so the demo runs exactly
// what the learner is told to run (never retyped here).
function codeBlocks(step, lang) {
  const re = new RegExp('```' + lang + '\\n([\\s\\S]*?)```', 'g');
  return [...step.instruction.matchAll(re)].map((m) => m[1]);
}

// `--rearm`: between takes, put the project back into the demo's starting state
// through the same API — db accepts 5432 from Anywhere again, and "Lock the
// vault" holds a real ✗ verdict (latest-wins progress), so the recording's
// final ✓ is once more the one that completes the roadmap.
async function rearm() {
  const state = JSON.parse(readFileSync(join(HERE, 'out', 'demo-state.json'), 'utf8'));
  const { projectId, nodes } = state;
  const config = await http('GET', `/api/projects/${projectId}/network-config`);
  const kept = (config.nodeSecurityGroups[nodes.db] ?? []).filter((r) => !(r.type === 'inbound' && r.action === 'ALLOW' && r.port === '5432'));
  config.nodeSecurityGroups[nodes.db] = [
    { id: `sg-${rid()}`, type: 'inbound', action: 'ALLOW', protocol: 'TCP', port: '5432', source: '0.0.0.0/0' },
    ...kept,
  ];
  await http('POST', `/api/projects/${projectId}/network-config`, { networkConfig: config });
  const v = await http('POST', '/api/learning/validate', { projectId, roadmapId: ROADMAP_ID, stepId: 'lock-down-the-db' });
  log(`rearmed — lock-down-the-db now ${v.stepPassed ? 'PASSES (unexpected!)' : 'fails'}: ${v.results[0].message}`);
  if (v.stepPassed) process.exit(1);
}

async function main() {
  if (process.argv.includes('--rearm')) return rearm();
  const health = await http('GET', '/health');
  if (health?.checks?.docker?.status !== 'ok') throw new Error(`Docker not ok: ${JSON.stringify(health)}`);

  const roadmap = await http('GET', `/api/learning/roadmaps/${ROADMAP_ID}`);
  const step = (id) => {
    const s = roadmap.steps.find((x) => x.id === id);
    if (!s) throw new Error(`step ${id} missing from roadmap`);
    return s;
  };

  // Fresh project every run (a previous demo project with the same name is removed).
  for (const p of (await http('GET', '/api/projects')).projects ?? []) {
    if (p.name === PROJECT_NAME) { log(`removing previous project ${p.id}`); await http('DELETE', `/api/projects/${p.id}`); }
  }
  const project = await http('POST', '/api/projects', { name: PROJECT_NAME });
  const projectId = project.id;
  log(`project ${projectId}`);

  let config = {
    vpcConfig: { name: 'nimbus-vpc', cidr: '10.0.0.0/16', dnsEnabled: true, igwEnabled: true, description: 'Nimbus Books' },
    subnets: [],
    nodeSubnetMap: {},
    nodeSecurityGroups: {},
    nodeIpMap: {},
  };
  const save = async () => { config = await http('POST', `/api/projects/${projectId}/network-config`, { networkConfig: config }); };
  const refetch = async () => { config = await http('GET', `/api/projects/${projectId}/network-config`); };

  // Same shape the canvas produces when a Public Subnet is dropped (3 columns × 2 rows).
  config.subnets.push({
    id: SUBNET_ID, name: 'Public Subnet', type: 'public', cidr: '10.0.1.0/24', vpcId: 'root-vpc',
    position: { x: 80, y: 80 }, width: 3 * 340, height: 70 + 2 * 190, columns: 3, rows: 2,
    routes: [
      { destination: '10.0.0.0/16', target: 'local', description: 'Local VPC route' },
      { destination: '0.0.0.0/0', target: 'igw', description: 'Internet gateway' },
    ],
  });
  await save();

  const nodes = {};
  async function createNode(name, type) {
    const info = await http('POST', `/api/projects/${projectId}/containers`, { name, type, subnetId: SUBNET_ID });
    nodes[name] = info.id;
    config.nodeSubnetMap[info.id] = SUBNET_ID;
    config.nodeSecurityGroups[info.id] = defaultSecurityGroup();
    await save();
    await sleep(SETTLE_MS);
    log(`created ${type} "${name}" (${info.id.slice(0, 12)})`);
    return info;
  }
  // Learner rules are prepended (first match wins, ahead of the default DENY ALL).
  async function addInboundAllow(nodeName, port, source) {
    const src = source === '0.0.0.0/0' ? source : nodes[source];
    config.nodeSecurityGroups[nodes[nodeName]].unshift({ id: `sg-${rid()}`, type: 'inbound', action: 'ALLOW', protocol: 'TCP', port: String(port), source: src });
    await save();
  }
  const containerName = (name) => `akal-lab-${projectId}-${name}`;
  async function execIn(name, script) {
    const { stdout } = await pexecFile('docker', ['exec', containerName(name), 'bash', '-lc', script], { timeout: 600_000, maxBuffer: 16 * 1024 * 1024 });
    return stdout;
  }
  async function validate(stepId) {
    const v = await http('POST', '/api/learning/validate', { projectId, roadmapId: ROADMAP_ID, stepId });
    const detail = v.results.map((r) => `      [${r.status}] ${r.type}: ${r.message}`).join('\n');
    log(`${v.stepPassed ? '✓' : '✗'} ${stepId}\n${detail}`);
    return v;
  }
  async function mustPass(stepId, { retries = 10, waitMs = 3000 } = {}) {
    for (let i = 0; i < retries; i++) {
      const v = await validate(stepId);
      if (v.stepPassed) return v;
      await sleep(waitMs);
    }
    throw new Error(`step ${stepId} never passed`);
  }

  // ── Step 1 · Your first server ──────────────────────────────────────────────
  await createNode('web-1', 'ubuntu');
  await mustPass('first-server');

  // ── Step 2 · The data tier ──────────────────────────────────────────────────
  await createNode('db', 'postgres');
  const [sql] = codeBlocks(step('database-tier'), 'sql');
  for (let i = 0; i < 20; i++) { // postgres needs a moment to accept connections
    try { await http('POST', `/api/projects/${projectId}/containers/${nodes.db}/postgres/query`, { query: sql }); break; }
    catch (err) { if (i === 19) throw err; await sleep(2000); }
  }
  await mustPass('database-tier');

  // ── Step 3 · Wire the app to its database (the "plausible but wrong" rule the demo fixes) ──
  await addInboundAllow('db', 5432, '0.0.0.0/0');
  await mustPass('open-the-db');

  // ── Step 4 · Ship the bookstore ─────────────────────────────────────────────
  const bootstrap = codeBlocks(step('run-the-bookstore'), 'bash').join('\n');
  log('provisioning web-1 (apt-get + server.py)…');
  await execIn('web-1', bootstrap);
  await addInboundAllow('web-1', 80, '0.0.0.0/0');
  await mustPass('run-the-bookstore');

  // ── Step 5 · Two of everything ──────────────────────────────────────────────
  await createNode('web-2', 'ubuntu');
  log('provisioning web-2…');
  await execIn('web-2', bootstrap);
  await addInboundAllow('web-2', 80, '0.0.0.0/0');
  await mustPass('second-server');

  // ── Step 6 · One front door ─────────────────────────────────────────────────
  await createNode('lb', 'loadbalancer');
  config.loadBalancerAlgorithms = { [nodes.lb]: 'round_robin' };
  config.loadBalancerTargets = { [nodes.lb]: [nodes['web-1'], nodes['web-2']] };
  config.loadBalancerTargetPorts = { [nodes.lb]: 80 };
  config.loadBalancerRoutingRules = { [nodes.lb]: [] };
  await save();
  await addInboundAllow('lb', 80, '0.0.0.0/0');
  await mustPass('load-balancer');

  // ── Step 7 · Lock the vault — INTENTIONALLY LEFT UNVALIDATED (performed live in the recording) ──
  log('skipping lock-down-the-db on purpose: the recording performs it live');

  // ── Step 8 · Pull the plug ──────────────────────────────────────────────────
  await http('POST', `/api/projects/${projectId}/containers/${nodes['web-1']}/stop`);
  await sleep(SETTLE_MS);
  await mustPass('pull-the-plug');
  await http('POST', `/api/projects/${projectId}/containers/${nodes['web-1']}/start`);
  await sleep(SETTLE_MS + 3000); // .bashrc boot line revives server.py

  // ── Step 9 · The clone factory ──────────────────────────────────────────────
  await createNode('web-asg', 'autoscalinggroup');
  const asgId = nodes['web-asg'];
  const asgConfig = (desired) => ({ desiredCapacity: desired, minCapacity: 1, maxCapacity: 4, parentId: nodes['web-1'], subnetIds: [SUBNET_ID] });
  config.asgs = { [asgId]: asgConfig(2) };
  await save();
  log('deploying ASG (commits web-1 into a golden image, boots 2 replicas)…');
  await http('POST', `/api/projects/${projectId}/containers/asg/${asgId}/deploy`, { parentNodeId: nodes['web-1'], desiredCapacity: 2, subnetIds: [SUBNET_ID] });
  await refetch(); // the server wrote the replicas' subnet mappings
  await mustPass('auto-scaling-group', { retries: 20 });

  // ── Step 10 · Launch day ────────────────────────────────────────────────────
  config.asgs[asgId] = asgConfig(4);
  await save();
  await http('POST', `/api/projects/${projectId}/containers/asg/${asgId}/scale`, { desiredCapacity: 4, subnetIds: [SUBNET_ID] });
  await refetch();
  await addInboundAllow('web-asg', 80, '0.0.0.0/0');
  config.loadBalancerTargets[nodes.lb] = [asgId];
  await save();
  await mustPass('traffic-spike', { retries: 30 });

  // Every step except "Lock the vault" now holds a real ✓ in ~/.torollo/progress.json.
  const progress = await http('GET', `/api/learning/progress/${projectId}/${ROADMAP_ID}`);
  const passed = Object.entries(progress.steps).filter(([, s]) => s.passed).map(([id]) => id);
  log(`progress: ${passed.length}/${roadmap.steps.length} steps passed (${passed.join(', ')})`);
  if (passed.length !== roadmap.steps.length - 1 || progress.steps['lock-down-the-db']) {
    throw new Error('unexpected progress state — expected every step but lock-down-the-db to be passed');
  }

  mkdirSync(join(HERE, 'out'), { recursive: true });
  const state = { api: API, projectId, projectName: PROJECT_NAME, roadmapId: ROADMAP_ID, subnetId: SUBNET_ID, nodes };
  writeFileSync(join(HERE, 'out', 'demo-state.json'), JSON.stringify(state, null, 2));
  log(`state written to out/demo-state.json`);
}

main().catch((err) => { console.error(err); process.exit(1); });
