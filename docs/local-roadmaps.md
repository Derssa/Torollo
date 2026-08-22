# Importing local roadmaps

Roadmaps don't have to live in Torollo's own `roadmaps/` directory. Any roadmap file at the [open format](./roadmap-format.md) — one you wrote, one someone shared with you, a pack you downloaded — can be installed locally and played exactly like a shipped roadmap: same briefing page, same player, same validation against your real containers, same progression and completion screen.

## Two ways to install

**The import button.** On the Learning page, next to the roadmap list, **Import roadmaps** accepts one or more `.json` roadmap files or a `.zip` archive of them. Every file is validated against the format schema before anything is installed, and you get a per-file report: what was installed, and — for any refused file — the exact field-level reasons, so a typo in a hand-written roadmap is a ten-second fix, not a silent failure.

**The folder.** Imported roadmaps are just files in `~/.torollo/roadmaps/` (next to Torollo's other local state). You can drop a valid roadmap file there yourself; the catalogue re-reads the folder on every request, so it appears immediately — no restart. Invalid files are skipped and logged on the backend, never served. To uninstall a roadmap, delete its file.

The equivalent of the button, from a terminal:

```bash
curl -X POST --data-binary @my-pack.zip \
  -H 'Content-Type: application/octet-stream' \
  'http://localhost:23233/api/learning/roadmaps/import?filename=my-pack.zip'
```

## Rules worth knowing

- **Imported roadmaps are marked in the catalogue** and, unlike shipped ones, are shown whatever your UI language is — you installed them on purpose, so they never silently disappear when the languages don't match. The card shows the roadmap's language.
- **A local file can never shadow a shipped roadmap.** Your progression is keyed on the roadmap `id`; an import whose `(id, language)` collides with the shipped catalogue is refused with a clear message. Give your roadmap its own id.
- **Re-importing updates in place.** Installed files are named `<id>.<language>.json`, so importing a fixed or newer version of the same roadmap replaces the previous one (the report says `updated`). Your progression on it is untouched — it lives in `~/.torollo/progress.json`, keyed by id.
- **Roadmaps are data, not code.** Validators are declarative JSON interpreted by the engine — importing a roadmap never executes anything from the file.

## Writing your own

The format is documented in the [Roadmap Authoring Reference](./roadmap-format.md), and `backend`'s `npm run roadmap:validate <file>` checks a file from the command line. Share the `.json` (or zip several files together, translations included — one language per file, same `id`); anyone can import it with the button above.
