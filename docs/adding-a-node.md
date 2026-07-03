# Contributing Guide — Adding a New Node

> Everything in Torollo is a **node**: a draggable card on the canvas that maps 1:1 to a
> real Docker container running on the contributor's machine. A "PostgreSQL", a "Redis",
> a "NAT Gateway" — all nodes.

This guide walks you through adding a brand-new node type, end to end. By the end you'll
have a node you can drag from the library, drop on the canvas, start/stop, and (optionally)
inspect through a modal.

We deliberately keep this codebase **modular, readable, and boring** — the kind of code a
newcomer can follow on their first read. This guide is as much about *how we write code*
as it is about *where the code goes*. Please read the [Code Standards](#code-standards)
section before opening your PR.

---

## Table of Contents

1. [The mental model](#1-the-mental-model)
2. [The wiring map](#2-the-wiring-map-every-file-you-touch)
3. [Worked example: adding a "Memcached" cache node](#3-worked-example-adding-a-memcached-cache-node)
   - [Backend](#backend)
   - [Frontend](#frontend)
4. [Code standards](#code-standards)
5. [Testing & running locally](#testing--running-locally)
6. [Pull request checklist](#pull-request-checklist)

---

## 1. The mental model

Before writing code, understand the lifecycle of a node. Nothing here is magic:

```
  Library card        Drop on canvas         Backend                 Docker
 ┌────────────┐  drag  ┌──────────────┐  POST  ┌──────────────┐  run  ┌─────────────┐
 │ NodeLibrary│ ─────► │  CanvasPage  │ ─────► │ContainerMgr  │ ────► │ real         │
 │  (palette) │        │ (drop + name)│        │(image+config)│       │ container    │
 └────────────┘        └──────────────┘        └──────────────┘       └─────────────┘
                              │                                              │
                              │  render via nodeTypes                        │ poll status
                              ▼                                              ▼
                       ┌──────────────┐                             ┌─────────────┐
                       │  <Node>.tsx  │  ◄───── state (running/…) ── │  container  │
                       │  (BaseNode)  │                             │   info      │
                       └──────────────┘                             └─────────────┘
                              │ Inspect
                              ▼
                       ┌──────────────┐
                       │ <Node>Modal  │  (optional: shell / explorer)
                       └──────────────┘
```

Two rules follow directly from this diagram, and they drive the whole design:

- **A node is identified everywhere by a single lowercase string `type`** (`"redis"`,
  `"postgres"`, `"nat"`, …). That string is the contract between the palette, the canvas,
  the API, and the container labels. Pick it once, use it verbatim everywhere.
- **The backend owns Docker; the frontend owns the canvas.** They only ever talk through
  the `type` string and the container info the API returns. Keep that boundary clean.

---

## 2. The wiring map (every file you touch)

Adding a node is mostly **thin wiring across well-defined seams** — not deep new logic.
Here is the complete list. Nothing else needs to change.

### Backend

| File | What you add |
| --- | --- |
| `backend/src/infrastructure/docker/ContainerManager.ts` | The image tag, an `ensure<X>Image()` pull helper, the image-selection branch, any custom container options, and the port mapping. This is the **only** file that talks to Docker. |
| `backend/src/modules/containers/services/containerService.ts` | *(Optional)* An explorer/query method, if your node has an inspector modal (like `getRedisExplorer`). |

### Frontend

| File | What you add |
| --- | --- |
| `frontend/src/features/nodes/<X>Node/<X>Node.tsx` | The node card. **Reuses `BaseNode`** — usually ~40 lines. |
| `frontend/src/features/nodes/<X>Node/<X>Modal.tsx` | *(Optional)* The inspector modal. |
| `frontend/src/pages/CanvasPage/components/NodeLibrary.tsx` | One entry in the palette (category, `type`, icon, description). |
| `frontend/src/pages/CanvasPage/CanvasPage.tsx` | Register in `nodeTypes`; wire `onInspect` + modal state (only if you have a modal); add the drop-dialog placeholder text. |
| `frontend/src/shared/types/index.ts` | Add your `type` to the `ContainerData['type']` union. |

> **Tip:** The single fastest way to add a node is to copy the **Redis** node and
> find-and-replace. Redis is our cleanest, most recent reference and it exercises every
> layer (card, modal, explorer, dedicated image). We use it as the example below.

---

## 3. Worked example: adding a "Memcached" cache node

We'll add a **Memcached** node — an in-memory cache, conceptually a sibling of Redis. Its
`type` string is `memcached` and its default port is `11211`. Follow along; swap in your
own node's details as you go.

### Backend

Everything Docker-related lives in **one file**: `ContainerManager.ts`. That is by design —
the frontend never needs to know an image tag exists.

#### Step 1 — Declare the image tag

Alongside the other image constants (near the top of the class):

```ts
private static readonly MEMCACHED_IMAGE_TAG = 'derssa/backend-lab-memcached:v1';
```

#### Step 2 — Add an `ensure` helper

Each image has a small helper that pulls it from Docker Hub the first time it's needed.
Copy `ensureRedisImage()` verbatim and rename it — the shape is identical, only the tag and
the log label change:

```ts
/**
 * Ensures that the Memcached image exists locally.
 */
private static async ensureMemcachedImage(): Promise<void> {
  const images = await docker.listImages();
  const hasImage = images.some(img =>
    img.RepoTags && img.RepoTags.includes(this.MEMCACHED_IMAGE_TAG)
  );

  if (!hasImage) {
    console.log('Pulling Memcached image (first time only)...');
    await new Promise<void>((resolve, reject) => {
      docker.pull(this.MEMCACHED_IMAGE_TAG, {}, (err, stream) => {
        if (err) return reject(err);
        if (!stream) return reject(new Error('Pull stream is undefined'));

        docker.modem.followProgress(
          stream,
          (errFinished) => {
            if (errFinished) return reject(errFinished);
            resolve();
          },
          (event) => {
            if (event.status) {
              const progress = event.progress ? ` ${event.progress}` : '';
              console.log(`[Docker Hub Pull - Memcached] ${event.status}${progress}`);
            }
          }
        );
      });
    });
  }
}
```

#### Step 3 — Select the image in `createContainer`

In `createContainer`, add your branch to the type checks and the image selection. Follow
the exact pattern already there:

```ts
const isRedis = type === 'redis';
const isMemcached = type === 'memcached';   // ← add
// ...
let image = this.UBUNTU_IMAGE_TAG;
if (customImage) image = customImage;
else if (isPostgres) image = this.POSTGRES_IMAGE_TAG;
else if (isRedis) image = this.REDIS_IMAGE_TAG;
else if (isMemcached) image = this.MEMCACHED_IMAGE_TAG;   // ← add
// ...
} else if (isRedis) {
  await this.ensureRedisImage();
} else if (isMemcached) {                    // ← add
  await this.ensureMemcachedImage();
}
```

If your node needs special container options (env vars, entrypoint, published ports), add
a branch in the `if (isPostgres) { … } else if (…)` block. Memcached starts on its default
command with no extra config, exactly like Redis, so **no branch is needed**. Only add
configuration you actually need — resist copy-pasting Postgres' env vars "just in case".

#### Step 4 — Map the port for the status list

`listContainersByProject` reports the published port back to the UI. Add your private port
to the match list:

```ts
const matchedRedis = c.Ports.find(p => p.PrivatePort === 6379);
const matchedMemcached = c.Ports.find(p => p.PrivatePort === 11211);   // ← add
const matchedPort = matchedPostgres || matchedMongo || matchedRedis || matchedMemcached || matchedNginx;
```

#### Step 5 (optional) — An inspector backend

If your node has an interactive modal (a shell, an explorer), add:

1. A low-level command runner in `ContainerManager.ts` — copy `executeRedisCommand` and
   change the CLI binary (e.g. Redis uses `redis-cli`; yours might use a different client).
2. A service method in `containerService.ts` — e.g. `getMemcachedExplorer` /
   `executeMemcachedQuery` — that shapes the raw output into what the modal renders.

Keep the low-level "run a command in the container" concern in `ContainerManager` and the
"turn output into UI data" concern in `ContainerService`. Don't mix them.

That's the entire backend. **Type unions:** update the `ContainerInfo['type']` union in
`ContainerManager.ts` so the compiler keeps you honest.

---

### Frontend

#### Step 6 — The node card

Create `frontend/src/features/nodes/MemcachedNode/MemcachedNode.tsx`. **Do not** hand-roll
a card — compose `BaseNode`, which owns all the shared chrome (status dot, start/stop/delete
buttons, security-group shield, handles). A node component only declares *what's different*:
its icon, its accent color, its subtitle, and its primary action.

```tsx
import { Database, Search } from 'lucide-react';
import BaseNode from '../components/BaseNode';
import styles from '../ServiceNode.module.css';

interface MemcachedNodeProps {
  data: {
    id: string;
    name: string;
    state?: string;
    ip?: string;
    onSecurityGroupOpen?: (id: string, name: string) => void;
    onInspect: (id: string, name: string) => void;
    onStop: (id: string) => void;
    onStart: (id: string) => void;
    onDelete: (id: string) => void;
  };
}

export default function MemcachedNode({ data }: MemcachedNodeProps) {
  const isRunning = data.state === 'running';

  return (
    <BaseNode
      id={data.id}
      name={data.name}
      isRunning={isRunning}
      icon={<Database size={18} color={isRunning ? '#0EA5E9' : '#6B7280'} />}
      customBorder={isRunning ? '1px solid #0EA5E9' : undefined}
      subtitle={
        <>
          <span className={styles.label}>IP/Port:</span>
          <span className={styles.value} style={{ color: data.ip ? '#10B981' : undefined }}>
            {data.ip ? `${data.ip}:11211` : '11211'}
          </span>
        </>
      }
      onStart={data.onStart}
      onStop={data.onStop}
      onDelete={data.onDelete}
      onSecurityGroupOpen={data.onSecurityGroupOpen}
      primaryAction={{
        label: 'Inspect',
        icon: <Search size={14} />,
        color: '#0EA5E9',
        onClick: data.onInspect,
        title: 'Inspect Memcached',
      }}
    />
  );
}
```

> Notice how little this file says. That's the goal: **the shared behavior lives in
> `BaseNode`, the node only expresses its identity.** If you find yourself copying layout
> or button markup into a node, stop — it belongs in `BaseNode` instead.

#### Step 7 — Register it in `nodeTypes`

In `CanvasPage.tsx`, import your node and add it to the `nodeTypes` map:

```tsx
import MemcachedNode from '../../features/nodes/MemcachedNode/MemcachedNode';
// ...
const nodeTypes = useMemo(() => ({
  ubuntu: UbuntuNode,
  redis: RedisNode,
  memcached: MemcachedNode,   // ← add
  // ...
}), []);
```

#### Step 8 — Add it to the palette

In `NodeLibrary.tsx`, add an entry to the relevant category. The `type` **must** match the
backend/`nodeTypes` string exactly:

```tsx
{
  type: 'memcached',
  name: 'Memcached',
  desc: 'In-memory key-value cache',
  icon: <Database size={18} color="#0EA5E9" />,
  collapsedIcon: <Database size={20} color="#0EA5E9" />
}
```

#### Step 9 — Add it to the shared type

In `frontend/src/shared/types/index.ts`, extend the union so the rest of the app type-checks:

```ts
type?: 'ubuntu' | 'postgres' | 'redis' | 'memcached' | 'nat' | 'loadbalancer' | /* … */;
```

#### Step 10 — Name-on-drop placeholder

When a node is dropped, a small dialog asks for a name. Add your node's placeholder/prefix
alongside the existing `type === 'redis' ? …` branches in `CanvasPage.tsx` (search for
`redis-1`). This is cosmetic but expected for consistency.

#### Step 11 (optional) — The inspector modal

If you built a backend explorer (Step 5), create
`frontend/src/features/nodes/MemcachedNode/MemcachedModal.tsx` (model it on `RedisModal`),
then wire three small things in `CanvasPage.tsx`, following the Redis path exactly:

```tsx
// 1. state
const [inspectingMemcached, setInspectingMemcached] =
  useState<{ id: string; name: string } | null>(null);

// 2. inside onInspect
} else if (nodeType === 'memcached') {
  setInspectingMemcached({ id, name });
}

// 3. render near the other modals
{inspectingMemcached && (
  <MemcachedModal
    containerId={inspectingMemcached.id}
    nodeName={inspectingMemcached.name}
    onClose={() => setInspectingMemcached(null)}
  />
)}
```

If your node has **no** inspector (e.g. a pure networking primitive), skip Steps 5 and 11
entirely and don't pass a `primaryAction` to `BaseNode`.

**Done.** Update the README's "Supported Infrastructure Nodes" list and you're ready to
open a PR.

---

## Code standards

These aren't bureaucracy — they're *why* adding a node above was mostly copy-and-rename
instead of a rewrite. Please hold your contribution to the same bar.

**1. One node, one folder, one responsibility.**
Everything for a node lives under `features/nodes/<X>Node/`. The card renders; the modal
inspects; a `data/` file holds static content (like the cheat sheets). Don't scatter a
node's code across the tree.

**2. Compose, don't duplicate.**
Shared behavior belongs in a shared place — `BaseNode` for card chrome, `ContainerManager`
for Docker, `ContainerService` for output shaping. If you're pasting the same block into a
second file, that's a signal it should be lifted into the shared layer. Every node card in
this repo is small *because* the common parts were factored out. Keep it that way.

**3. Respect the layers.** Data flows in one direction:

```
  NodeLibrary → CanvasPage → useContainers (API) → controller → ContainerService → ContainerManager → Docker
```

The frontend never imports Docker concepts; the backend never imports React. The only thing
crossing the boundary is the `type` string and the container info returned by the API. If a
change makes you reach across a layer, reconsider the approach.

**4. The `type` string is a contract.** It appears in the palette, `nodeTypes`, the API
body, the Docker label (`akal.node.type`), and the type unions. It is always lowercase, has
no spaces, and is identical in every location. Choose it deliberately.

**5. Types are not optional.** This is a strict TypeScript codebase. When you add a node,
extend **both** union types (`ContainerData` on the frontend, `ContainerInfo` on the
backend). Let the compiler find every place you forgot — that's its job.

**6. Add only the configuration you need.** Postgres sets env vars and an entrypoint because
Postgres requires them. Redis and Memcached don't, so they add nothing. Don't copy
configuration defensively — every line you add is a line the next contributor must
understand.

**7. Comment the *why*, not the *what*.** Good code shows what it does. Save comments for
decisions that would otherwise be surprising — see the seeding comment in `getRedisExplorer`
explaining *why* the marker lives in logical DB 1. Match the tone and density of the
surrounding file.

**8. Naming mirrors the domain.** `MemcachedNode`, `ensureMemcachedImage`,
`getMemcachedExplorer`. Predictable names are what make "copy the Redis node and
find-and-replace" a viable workflow. Keep names boring and parallel.

**9. Conventional Commits.** e.g. `feat: add Memcached cache node`. See
[CONTRIBUTING.md](../CONTRIBUTING.md).

---

## Testing & running locally

See [CONTRIBUTING.md](../CONTRIBUTING.md) for full setup. In short, with Docker running:

```bash
# Terminal 1 — backend (port 23233)
cd backend && npm run dev

# Terminal 2 — frontend (port 23232)
cd frontend && npm run dev
```

Then manually verify the full lifecycle of your node:

- [ ] It appears in the correct library category, with its icon and description.
- [ ] Dragging it onto the canvas opens the name dialog and creates a real container
      (confirm with `docker ps`).
- [ ] The card reflects state correctly (Offline → **Start** → Online, and Stop).
- [ ] The IP/port subtitle shows once running.
- [ ] The Inspect modal opens and works (if applicable).
- [ ] Deleting the node removes the container (confirm with `docker ps -a`).

If your node adds backend logic worth testing, add coverage next to the existing tests
(e.g. `containerController.test.ts`, `virtualNetworkMapper.test.ts`) and make sure the
suite passes:

```bash
npm test --prefix backend
```

Finally, make sure everything builds cleanly — CI runs this too:

```bash
npm run build --prefix backend
npm run build --prefix frontend
```

---

## Pull request checklist

Copy this into your PR description and tick it off:

- [ ] `type` string is lowercase and identical across palette, `nodeTypes`, API, labels, and unions.
- [ ] Backend: image tag, `ensure<X>Image()`, image selection branch, port mapping, `ContainerInfo` union.
- [ ] Frontend: `<X>Node.tsx` (via `BaseNode`), `nodeTypes`, `NodeLibrary`, `ContainerData` union, drop placeholder.
- [ ] Inspector modal + backend explorer wired (or intentionally omitted).
- [ ] README "Supported Infrastructure Nodes" list updated.
- [ ] Both frontend and backend build; tests pass.
- [ ] Manually verified the full lifecycle checklist above.
- [ ] Conventional Commit message.

Thank you for making Torollo better. 🎛️
