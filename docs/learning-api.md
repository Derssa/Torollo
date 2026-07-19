# The learning API (validation engine)

The learning module is the auto-corrector behind guided roadmaps: it runs the declarative validators of a roadmap step against the **real** state of your project (Docker containers, databases, network topology) and returns one structured result per validator.

This document is the contract for API consumers (the roadmap player in the frontend). If you are writing roadmap *content*, read [`roadmap-format.md`](./roadmap-format.md) instead.

- Backend module: `backend/src/modules/learning/`
- Roadmap files are loaded from the `roadmaps/` directory at the repository root (shipped in the published npm package). Files that fail the format schema are logged on the server and excluded — they are never served.

## Endpoints

### `GET /api/learning/roadmaps`

Lists the available roadmaps as summaries — **one entry per file**. Translations of the same roadmap share an `id` and differ by `language` (see the format's language model), so they appear as separate catalogue entries; a selection UI should surface the `language` field.

```json
[
  {
    "id": "resilient-three-tier",
    "title": "Deploy a resilient three-tier app",
    "description": "You are the first engineer at Nimbus Books, an online bookstore about to launch…",
    "language": "en",
    "difficulty": "intermediate",
    "estimatedMinutes": 40,
    "stepCount": 10
  }
]
```

### `GET /api/learning/roadmaps/:id`

Returns the full roadmap file (format v1, see [`roadmap-format.md`](./roadmap-format.md)) — steps, instructions, hints, solutions, validators.

Because translations share an `id`, the real key is `(id, language)`:

- `?language=<code>` (optional) — return exactly the translation with that `language`, or `404`. **No fallback**: the player only requests pairs the catalogue advertised.
- Without `language`, the pick among translations is deterministic (sorted by language code), so repeated calls always return the same file.
- `404 { "error": "...", "code": "ROADMAP_NOT_FOUND" }` if no valid roadmap matches.

### `POST /api/learning/validate`

Runs every validator of one step against the real state of one project. The engine itself is **stateless** — it evaluates, it never records — but the API layer records the attempt: each call that reaches evaluation increments the step's `attempts` and stores the verdict in the [local progress store](#local-progression-no-account) (a storage failure is logged and never blocks the verdict).

Request body:

```json
{
  "projectId": "project-1751883322290",
  "roadmapId": "resilient-three-tier",
  "stepId": "first-server"
}
```

`stepId` is the step's stable slug id, never its position — step ids are unique within a roadmap, which is why `roadmapId` is also required.

There is no `language` field: step ids and validators are language-neutral by format contract, so validating against any translation of the roadmap is equivalent (the server uses the deterministic language-less pick).

Error responses (request problems only, see [status semantics](#http-status-semantics)):

- `400 { "error": "\"stepId\" is required and must be a string" }` — missing or non-string field.
- `404 { "error": "...", "code": "PROJECT_NOT_FOUND" | "ROADMAP_NOT_FOUND" | "STEP_NOT_FOUND" }`.
- `500 { "error": "..." }` — unexpected server crash.

Success response (`200`):

```json
{
  "roadmapId": "resilient-three-tier",
  "stepId": "first-server",
  "stepPassed": false,
  "checkedAt": "2026-07-14T14:03:21.402Z",
  "results": [
    {
      "index": 0,
      "type": "container_running",
      "status": "fail",
      "message": "No container named \"web-1\" exists in this project yet. Create the node on the canvas, name it \"web-1\" and start it.",
      "expected": "a running container named \"web-1\"",
      "observed": "no container with that name"
    }
  ]
}
```

- `results` is in the same order as `step.validators`; `index` is the validator's position there — use it as the stable key.
- `stepPassed` is `true` iff **every** result has `status: "pass"`. An `error` result never validates a step (⚠ is not ✓).
- `expected` / `observed` are short human-readable snapshots, present when the check can express them.

## Local progression (no account)

Roadmap progression is persisted locally in `~/.torollo/progress.json`, next to `projects.json` — no account, no auth, nothing leaves the machine. One entry per `(projectId, roadmapId)` pair (a step's ✓ describes the containers of the project it was validated in), holding per step — keyed by the step's **stable id**, so re-editing or reordering a roadmap file never corrupts progress, and translations (which share ids) share progress:

```json
{
  "version": 1,
  "entries": [
    {
      "projectId": "project-1751883322290",
      "roadmapId": "resilient-three-tier",
      "updatedAt": "2026-07-16T20:11:00.000Z",
      "steps": {
        "first-server": {
          "passed": true,
          "attempts": 3,
          "revealedHints": 1,
          "lastCheckedAt": "2026-07-16T20:10:58.000Z"
        }
      }
    }
  ]
}
```

`passed` is the verdict of the **latest** validation (same semantics as the player's in-session display); `attempts` counts the validation runs that reached evaluation; `revealedHints` is the absolute number of revealed rungs on the step's hint ladder `[...hints, solution?]`. Validator results are deliberately **not** persisted — they describe a past container state; only the verdict survives. The top-level `version` is the migration contract: a reader that finds an unknown version (or an unparseable file) must not guess — the server moves the file aside as `progress.json.corrupt`, starts fresh, and reports it once via `storeRecovered` on the next progress read so the UI can tell the user. Writes are write-then-rename, so a crash mid-write cannot truncate the store. Deleting a project deletes its progress entries.

### `GET /api/learning/progress/:projectId/:roadmapId`

Returns `{ projectId, roadmapId, steps }` — `steps` is the per-step record above, `{}` when nothing was ever recorded. `storeRecovered: true` is present once after a corrupt/unknown-version store was discarded. The player calls this when opening a roadmap and resumes on the first step whose `passed` is not true.

### `PUT /api/learning/progress/:projectId/:roadmapId/hints`

Body `{ "stepId": "first-server", "revealedHints": 2 }` → `204`. Stores the absolute revealed count (idempotent — a lost write self-heals on the next reveal). `400` when `stepId` is not a non-empty string or `revealedHints` is not a non-negative integer. No existence check against the roadmap: progress is local, non-sensitive data, and hint reveals are cheap fire-and-forget writes.

### `DELETE /api/learning/progress/:projectId/:roadmapId`

Forgets that pair's progress (the player's "Restart roadmap" action) → `204`. Other roadmaps and projects are untouched.

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
  -d '{"projectId": "<id>", "roadmapId": "resilient-three-tier", "stepId": "first-server"}'

# 3. Create and start the "web-1" node, as the step instructs
curl -s -X POST 'localhost:23233/api/projects/<id>/containers' -H 'Content-Type: application/json' \
  -d '{"name": "web-1", "type": "ubuntu"}'

# 4. Re-validate → "pass", stepPassed: true
curl -s -X POST localhost:23233/api/learning/validate -H 'Content-Type: application/json' \
  -d '{"projectId": "<id>", "roadmapId": "resilient-three-tier", "stepId": "first-server"}'

# 5. Stop the Docker daemon and re-validate → 200 with status "error", errorCode "DOCKER_UNAVAILABLE"
```

## Adding a validator type

The engine dispatches on `validator.type` through a single extension point. To add a type:

1. Create `backend/src/modules/learning/engine/validators/<yourType>.ts` exporting a `ValidatorHandler`: it receives the raw `params` (validate them with the helpers in `engine/params.ts` — throw `InvalidParamsError` on bad shapes) and a `ValidatorContext` (project id + memoized access to the project's containers). Return `{ status: 'pass' | 'fail', message, expected?, observed? }`; on infrastructure problems just let the error propagate — the engine classifies it.
2. Register it: one line in `engine/registry.ts`.
3. Add pass/fail/degraded unit tests next to it (see `containerRunning.test.ts`).
4. Document its `params` in the validator table of [`roadmap-format.md`](./roadmap-format.md). New types are **not** format changes — no `schemaVersion` bump.

Failure messages are half the product: always say what was observed and what was expected, in plain human language, never a raw Docker id.

## Integration tests against real containers

The engine's unit tests (co-located `*.test.ts` next to each validator) mock every Docker/DB call — they prove the logic, not the contact with reality. `backend/src/modules/learning/engine/engine.itest.ts` covers that gap: it stands up one disposable project with real containers (Postgres/Redis/Mongo seeded with real data, a load balancer, a running auto-scaling group) and runs all 8 validators, pass **and** fail, through `runStepValidators` with its default (real) dependencies.

Run it locally with Docker started:

```bash
cd backend && npm run test:integration
```

Kept out of the default `npm test` run (see `jest.integration.config.js`) and off the main CI job — it runs in the dedicated `Integration` GitHub Actions workflow instead. Anti-flakiness choices worth knowing if you touch this suite:

- Every pass/fail pair reads the **same static fixture** with different `params` — nothing is mutated between assertions, so ordering and retries can't corrupt state.
- Setup polls Postgres/Redis/Mongo until they actually accept connections before seeding (DB startup lag is the classic source of flaky integration tests).

## Known limitation: message language

Engine messages (`message`, `expected`, `observed`) are produced in **English**, regardless of the roadmap's `language` field. A French roadmap currently gets English correction messages. This is a known v1 limitation, to be revisited with the full validator palette (V-3) — options include message keys translated by the frontend.
