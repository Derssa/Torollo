# The Torollo roadmap format (schemaVersion 1)

A **roadmap** is a guided, auto-corrected learning path: an ordered list of steps, each with an instruction, optional progressive hints, and one or more **validators** that Torollo runs against your *real* Docker containers to check that the step is done.

This document is the reference for authoring roadmap files. You should be able to write a working roadmap from this page alone, without reading any code.

- JSON Schema: [`backend/src/modules/learning/format/roadmap.schema.json`](../backend/src/modules/learning/format/roadmap.schema.json)
- Reference example: [`roadmaps/example-first-architecture.json`](../roadmaps/example-first-architecture.json)
- API that loads and runs roadmaps: [`learning-api.md`](./learning-api.md)

## Philosophy

- **A roadmap is data, never code.** Validators are declarative `{ "type", "params" }` objects. The `params` are inert JSON interpreted by validator implementations shipped inside Torollo — nothing in a roadmap file is ever evaluated or executed. This is what makes community roadmaps safe to share and run.
- **The format is versioned and public.** It is the interface between the open-source player/engine (MIT, this repo) and any content written for it — community roadmaps and premium packs alike are files at this format.
- **Stable identifiers everywhere.** Roadmaps and steps carry slug ids. Your progression is keyed on them, so reordering or inserting steps in a later edit of a roadmap never corrupts anyone's progress. Never change a published id.

## Quick start

Create `my-roadmap.json`:

```json
{
  "$schema": "https://raw.githubusercontent.com/Derssa/Torollo/main/backend/src/modules/learning/format/roadmap.schema.json",
  "schemaVersion": 1,
  "id": "my-first-roadmap",
  "title": "My first roadmap",
  "description": "One step: start a web server.",
  "language": "en",
  "steps": [
    {
      "id": "start-web",
      "title": "Start a web server",
      "instruction": "Create an **Ubuntu** node named `web` and start it.",
      "hints": ["Drag it from the node library on the left."],
      "validators": [
        { "type": "container_running", "params": { "node": "web" } }
      ]
    }
  ]
}
```

Check it:

```bash
cd backend && npm run roadmap:validate -- ../my-roadmap.json
```

The validator either prints `OK` or a list of errors, each pointing at the faulty field (`/steps/0: missing required field "id"`). Unknown fields are rejected — that's deliberate, it catches typos like `titel`.

## Field reference

### Roadmap (root object)

| Field | Type | Required | Description |
|---|---|---|---|
| `$schema` | string | no | URL of the JSON Schema, for editor autocompletion. |
| `schemaVersion` | the integer `1` | **yes** | Format version. See [Versioning](#versioning--evolution-policy). |
| `id` | slug, ≤ 64 chars | **yes** | Stable roadmap identifier (e.g. `"scaling-basics"`). Progression is keyed on it — never change it once published. |
| `title` | non-empty string | **yes** | Shown in the catalog and player. |
| `description` | non-empty string | **yes** | Short summary of what the learner will build. |
| `language` | `en`, `fr`, `pt-BR`, … | **yes** | Language of every text in this file. See [Languages](#languages-i18n). |
| `estimatedMinutes` | integer ≥ 1 | no | Rough total completion time. |
| `difficulty` | `beginner` \| `intermediate` \| `advanced` | no | |
| `prerequisites` | array of non-empty strings | no | Free human text ("Docker installed"). Not machine-resolved references to other roadmaps. |
| `steps` | array of Step, ≥ 1 | **yes** | The ordered steps. |

A *slug* is lowercase letters/digits separated by single hyphens: `^[a-z0-9]+(-[a-z0-9]+)*$`.

### Step

| Field | Type | Required | Description |
|---|---|---|---|
| `id` | slug, ≤ 64 chars | **yes** | Stable step identifier, **unique within the roadmap** and independent of the step's position. Progression is keyed on it. |
| `title` | non-empty string | **yes** | Short step name shown in the step list. |
| `instruction` | non-empty string | **yes** | What the learner must do. **Markdown allowed.** |
| `hints` | array of non-empty strings | no | Progressive hints, revealed one at a time in array order (hint 1 first). Order them from a gentle nudge to nearly-the-answer. |
| `solution` | non-empty string | no | The full solution, revealed only after all hints. Always use this field — never encode the solution as the last hint. |
| `validators` | array of Validator, ≥ 1 | **yes** | Every step must be auto-checkable: a step is complete when **all** its validators pass. |

### Validator

| Field | Type | Required | Description |
|---|---|---|---|
| `type` | string, `^[a-z][a-z0-9_]*$` | **yes** | One of the validator types below. The schema deliberately does not hard-code the list: new types can appear without a format version bump. A type unknown to your Torollo version is reported by the engine at run time. |
| `params` | object | **yes** | Plain JSON data configuring the check. The shape depends on `type` (below) and is enforced by the engine, not by the schema. |

## Validators & the targeting convention

**Targeting convention (all validators):** nodes are designated by their **canvas node name** — the name your instruction tells the learner to use (`"node": "web"` matches the node the learner named `web`). Never target runtime identifiers: container and node ids are generated per-user at execution time and change when containers are recreated. Resolving a name to the learner's actual containers/rules is the engine's job.

The 8 validator types of format v1:

| `type` | Checks that… | `params` |
|---|---|---|
| `container_running` | the node's container exists and is running | `{ "node": string }` |
| `table_exists` | a table exists in the node's PostgreSQL (schema `public`) | `{ "node": string, "table": string }` |
| `redis_key_exists` | a key — or Redis glob pattern like `session:*` — exists in the node's Redis | `{ "node": string, "key": string }` |
| `mongo_collection_exists` | a collection exists in the node's MongoDB (`database` defaults to the engine's default DB) | `{ "node": string, "collection": string, "database"?: string }` |
| `edge_exists` | a connection edge exists from `source` to `target` (omit `port` to accept any port) | `{ "source": string, "target": string, "port"?: number }` |
| `lb_upstreams` | the load balancer node has **at least** `min` upstream targets | `{ "node": string, "min": number }` |
| `port_denied` | traffic from `source` to `target` on `port` is **blocked** | `{ "source": string, "target": string, "port": number }` |
| `asg_replicas` | the auto-scaling group node runs **exactly** `count` instances | `{ "node": string, "count": number }` |

Ports and counts are JSON numbers.

## Languages (i18n)

**One language per file.** Every text in a roadmap (title, instructions, hints, solutions) is written in the single language declared by the `language` field.

A translation is a **separate file with the same `id` and a different `language`**. Because progression is keyed on roadmap id + step ids (which are language-neutral slugs), a learner who switches language keeps their progress. There are no per-field translation maps in v1.

## Versioning & evolution policy

- `schemaVersion` is an integer **major** version. This document describes version **1**.
- **v1 is frozen.** Any field addition, removal, or change of meaning requires `schemaVersion: 2`. There are no minor or "silently additive" changes: the schema rejects unknown fields (typo safety for hand-written files), so an old player could not tolerate a new field anyway. What is published is committed.
- **Readers must reject unsupported versions explicitly** ("unsupported schemaVersion 2 — this version of Torollo reads schemaVersion 1"), never half-read a file.
- **Newer players keep reading older files:** a Torollo that understands v2 must still read every valid v1 roadmap.
- **New validator `type` values are *not* format changes.** The palette can grow within v1; an engine that meets a type it doesn't implement reports it as unknown at run time.

> Note: the `roadmaps/` directory at the repository root is where the engine loads roadmaps from, and it is shipped inside the published npm package. See [`learning-api.md`](./learning-api.md) for how roadmaps are listed and validated at run time.
