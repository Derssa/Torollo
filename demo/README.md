# Product demo recording

Reproducible recording of the README / website demo: a roadmap step validated
against **real** Docker containers through the **real** backend — the ✗ and ✓ on
screen are Torollo's own verdicts, nothing is mocked or injected.

Scenario: `resilient-three-tier`, step 7 *Lock the vault*. Every other step is
played for real first, then the recording performs step 7 live: the database
still accepts 5432 from Anywhere → **Validate** → ✗ → the rule is replaced by two
per-server rules → **Validate** → ✓ → completion screen.

## Run

Requirements: Docker running, both packages built, Playwright's Chromium
(`chromium-1234`, found in `~/.cache/ms-playwright`; or set `TOROLLO_CHROMIUM`),
Python 3 with Pillow, `bc`.

```bash
# 1. Build and serve Torollo the way users run it, on an isolated HOME
(cd backend && npm run build) && (cd frontend && npm run build)
HOME=$(mktemp -d) node ./bin/cli.js start          # :23232 UI, :23233 API

# 2. Play the roadmap for real (≈ 5 min: apt-get ×2, ASG image commit)
cd demo && npm install
node setup.mjs                                     # writes out/demo-state.json

# 3. Capture, then derive every asset
node record.mjs                                    # CDP screencast → out/frames/
bash encode.sh                                     # master WebM, WebM, MP4, GIF, poster

# Between takes: restore the starting state (real rule change + real ✗ verdict)
node setup.mjs --rearm
```

`node record.mjs --probe` takes a screenshot at each stage without recording.

## Outputs (`out/`, git-ignored)

| file | use |
| --- | --- |
| `torollo-demo-master.webm` | lossless VP9 master, archival |
| `torollo-demo.webm` / `torollo-demo.mp4` | website hero (`torollo-site/public/media/`) |
| `torollo-demo-poster.jpg` | `<video poster>` |
| `torollo-demo.gif` | README (`docs/media/torollo-demo.gif`), < 5 MB |

## Authenticity rules

`record.mjs` only moves the mouse and presses keys. It does not intercept
requests, seed fixtures, inject DOM or touch the validators; the only browser
state it pre-sets is UI preference (`localStorage`: dark theme, language, active
project, node positions). The pointer seen in the video is composited in
post-production by `compose.py` from the recorded click log.
