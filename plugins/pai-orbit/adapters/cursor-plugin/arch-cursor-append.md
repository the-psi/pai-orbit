
## Cursor output contract (all `/arch` sub-modes)

When checking for optional project files, use **only** these Cursor-native paths:

| File | Purpose |
|------|---------|
| `.cursor/pai-orbit-config.md` | board, git, deploy, docs, system-docs pointer |
| `AGENTS.md` | in-repo architecture summary (`## Architecture` section) |
| `.cursor/team.md` | team roster (optional for arch) |

**Never** report missing `.claude/pai-orbit-config.md`, `.claude/team.md`, or `CLAUDE.md` as required files in Cursor.

### `/arch view` warnings format

If optional files are missing, use this wording:

```
Warnings (read once):
- `.cursor/pai-orbit-config.md` is missing — no system-docs repo configured.
- `AGENTS.md` is missing — no in-repo architecture summary; use `docs/architecture/system.md` as the source of truth.
```

If legacy `.claude/*` or `CLAUDE.md` exist, mention once that migration to `.cursor/` + `AGENTS.md` is recommended — do not treat legacy paths as the primary contract.
