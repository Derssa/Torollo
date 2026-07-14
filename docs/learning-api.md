# The learning API (validation engine)

The learning module is the auto-corrector behind guided roadmaps: it runs the declarative validators of a roadmap step against the **real** state of your project (Docker containers, databases, network topology) and returns one structured result per validator.

This document is the contract for API consumers (the roadmap player in the frontend). If you are writing roadmap *content*, read [`roadmap-format.md`](./roadmap-format.md) instead.

- Backend module: `backend/src/modules/learning/`
- Roadmap files are loaded from the `roadmaps/` directory at the repository root (shipped in the published npm package). Files that fail the format schema are logged on the server and excluded — they are never served.

## Endpoints

### `GET /api/learning/roadmaps`

Lists the available roadmaps as summaries.

```json
[
  {
    "id": "example-first-architecture",
    "title": "Your first architecture: a web server and its database",
    "description": "Build a minimal two-tier architecture…",
    "language": "en",
    "difficulty": "beginner",
    "estimatedMinutes": 30,
    "stepCount": 4
  }
]
```

### `GET /api/learning/roadmaps/:id`

Returns the full roadmap file (format v1, see [`roadmap-format.md`](./roadmap-format.md)) — steps, instructions, hints, solutions, validators.

- `404 { "error": "...", "code": "ROADMAP_NOT_FOUND" }` if no valid roadmap has this id.

### `POST /api/learning/validate`

Runs every validator of one step against the real state of one project. The engine is **stateless**: it evaluates, it never records progression.

Request body:

```json
{
  "projectId": "project-1751883322290",
  "roadmapId": "example-first-architecture",
  "stepId": "create-web-server"
}
```

`stepId` is the step's stable slug id, never its position — step ids are unique within a roadmap, which is why `roadmapId` is also required.

Error responses (request problems only, see [status semantics](#http-status-semantics)):

- `400 { "error": "\"stepId\" is required and must be a string" }` — missing or non-string field.
- `404 { "error": "...", "code": "PROJECT_NOT_FOUND" | "ROADMAP_NOT_FOUND" | "STEP_NOT_FOUND" }`.
- `500 { "error": "..." }` — unexpected server crash.

Success response (`200`):

```json
{
  "roadmapId": "example-first-architecture",
  "stepId": "create-web-server",
  "stepPassed": false,
  "checkedAt": "2026-07-14T14:03:21.402Z",
  "results": [
    {
      "index": 0,
      "type": "container_running",
      "status": "fail",
      "message": "No container named \"web\" exists in this project yet. Create the node on the canvas, name it \"web\" and start it.",
      "expected": "a running container named \"web\"",
      "observed": "no container with that name"
    }
  ]
}
```

- `results` is in the same order as `step.validators`; `index` is the validator's position there — use it as the stable key.
- `stepPassed` is `true` iff **every** result has `status: "pass"`. An `error` result never validates a step (⚠ is not ✓).
- `expected` / `observed` are short human-readable snapshots, present when the check can express them.

## Result semantics: `pass` / `fail` / `error`

| `status` | Meaning | Suggested UI |
|---|---|---|
| `pass` | The check succeeded. | ✓ |
| `fail` | **Pedagogical failure** — the learner has not completed this part yet. `message` explains what was observed vs expected. This is a normal, frequent state, not an error. | ✗ |
| `error` | **The check itself could not run.** Never the learner's fault, and the UI must not let them believe it is. `errorCode` is set. | ⚠ |

`errorCode` values (present iff `status === "error"`):

| `errorCode` | Meaning |
|---|---|
| `DOCKER_UNAVAILABLE` | The Docker daemon is unreachable (503-class infrastructure problem). |
| `CONTAINER_NOT_FOUND`, `IMAGE_NOT_FOUND`, `PORT_IN_USE`, `NAME_CONFLICT`, `DOCKER_ERROR` | Other Docker-level failures, same taxonomy as the container API (`dockerErrors.ts`). |
| `UNKNOWN_VALIDATOR` | The validator `type` is not implemented by this Torollo version (e.g. a newer community roadmap). |
| `INVALID_PARAMS` | The roadmap file's `params` are unusable for this type — an authoring bug in the roadmap. |

Two policies worth spelling out:

- **A broken validator never blocks the others.** An unknown type, bad params or a Docker failure produce an `error` result for that validator and the remaining validators of the step still run.
- **Infrastructure failures are `200`, not `5xx`.** The product of this endpoint *is* the per-validator report: if Docker is down, you still get one result per validator (each Docker-backed check reports `DOCKER_UNAVAILABLE`), and validators that don't need Docker still return their verdict. Do **not** treat `5xx` as a nominal case in the player — `4xx`/`5xx` mean the *request* was wrong or the server crashed, never "the learner hasn't finished".

## HTTP status semantics

- `200` — the evaluation ran; read `results`.
- `400` / `404` — the request itself is wrong (missing field, unknown project/roadmap/step).
- `500` — unexpected server error.

## Try it with curl

With the backend running (`cd backend && npm run dev`) and Docker started:

```bash
# 1. Create a project and note its id
curl -s -X POST localhost:23233/api/projects -H 'Content-Type: application/json' \
  -d '{"name": "learning-demo"}'

# 2. Validate step 1 before doing anything → "fail" with a pedagogical message
curl -s -X POST localhost:23233/api/learning/validate -H 'Content-Type: application/json' \
  -d '{"projectId": "<id>", "roadmapId": "example-first-architecture", "stepId": "create-web-server"}'

# 3. Create and start the "web" node, as the step instructs
curl -s -X POST 'localhost:23233/api/projects/<id>/containers' -H 'Content-Type: application/json' \
  -d '{"name": "web", "type": "ubuntu"}'

# 4. Re-validate → "pass", stepPassed: true
curl -s -X POST localhost:23233/api/learning/validate -H 'Content-Type: application/json' \
  -d '{"projectId": "<id>", "roadmapId": "example-first-architecture", "stepId": "create-web-server"}'

# 5. Stop the Docker daemon and re-validate → 200 with status "error", errorCode "DOCKER_UNAVAILABLE"
```

## Adding a validator type

The engine dispatches on `validator.type` through a single extension point. To add a type:

1. Create `backend/src/modules/learning/engine/validators/<yourType>.ts` exporting a `ValidatorHandler`: it receives the raw `params` (validate them with the helpers in `engine/params.ts` — throw `InvalidParamsError` on bad shapes) and a `ValidatorContext` (project id + memoized access to the project's containers). Return `{ status: 'pass' | 'fail', message, expected?, observed? }`; on infrastructure problems just let the error propagate — the engine classifies it.
2. Register it: one line in `engine/registry.ts`.
3. Add pass/fail/degraded unit tests next to it (see `containerRunning.test.ts`).
4. Document its `params` in the validator table of [`roadmap-format.md`](./roadmap-format.md). New types are **not** format changes — no `schemaVersion` bump.

Failure messages are half the product: always say what was observed and what was expected, in plain human language, never a raw Docker id.

## Known limitation: message language

Engine messages (`message`, `expected`, `observed`) are produced in **English**, regardless of the roadmap's `language` field. A French roadmap currently gets English correction messages. This is a known v1 limitation, to be revisited with the full validator palette (V-3) — options include message keys translated by the frontend.
