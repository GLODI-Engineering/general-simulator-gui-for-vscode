# Claude Code — Project Notes

The canonical agent guidance is in [`AGENTS.md`](./AGENTS.md). Read it
first. This file holds only Claude-Code-specific addenda.

## Claude-Code-specific addenda

- **`/init`.** Do **not** re-run init in this repo — `CLAUDE.md` and
  `AGENTS.md` are already authored.
- **Hooks.** If a pre-commit hook blocks you, do not pass `--no-verify`.
  Fix the underlying issue.
- **Rendering work is visual.** Never claim a schematic renders well
  without having rendered it to a PNG and *looked* at the image. See
  `docs/specs/schematic-rendering-spec.md`.

For everything else: [`AGENTS.md`](./AGENTS.md).
