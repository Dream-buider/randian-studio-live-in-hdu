# Phase B knowledge operations

Current local state (2026-07-31): the business gateway is running with PostgreSQL,
WeKnora 0.7.0, Ollama `nomic-embed-text:latest`, SearXNG and TokenDance are connected,
and both least-privilege knowledge bases are configured. No raw answer or document was
automatically published. See `docs/SESSION_CHECKPOINT_CURRENT.md` for the authoritative
runtime and content status.

Run `scripts/start-knowledge-stack.ps1 -ValidateOnly` before a real start. The live path checks the pinned vendor baseline, D-drive Docker/Ollama storage, preflight report, local secrets, then starts PostgreSQL, WeKnora/SearXNG, and the gateway in that order.

`scripts/test-knowledge-stack.ps1 -StaticOnly` is safe in CI. A live check is opt-in and reports unavailable components without exposing credentials.

`scripts/backup-knowledge-stack.ps1 -StaticOnly` performs no I/O. Its live path writes a timestamped backup under `D:\Star\LIVE_IN_HDU_RUNTIME\backups`, including both PostgreSQL dumps, WeKnora data files, redacted configuration and SHA-256 manifest. It retains 14 backups and uses `stop`/`up`; it never uses `down -v`.

Normal restart:

```powershell
.\scripts\start-knowledge-stack.ps1
```

Safe stop:

```powershell
.\scripts\stop-knowledge-stack.ps1
```

The machine, Docker Desktop, Ollama and the local proxy must remain available. TokenDance
does not replace the local server.

## Approved guide snapshot workflow

> WeKnora compatibility note: the locally deployed API accepts manual-knowledge
> status values `draft` and `publish`. Use `publish` for both create and same-ID
> draft recovery. Some bundled API prose shows `published`; that value is rejected
> by the running service, so the importer follows the verified runtime contract.

The approved `杭电新生指北` import is deliberately manual. The normalized Markdown
snapshot and its approval manifest live under
`D:\Star\LIVE_IN_HDU_RUNTIME\approved-knowledge`; neither file is committed to Git.
The manifest is the allow-list: the importer never scans the workspace or the D-drive for
additional documents.

For every update:

1. Read the approved Feishu page from top to bottom with a logged-in, read-only browser
   session. Remove Feishu navigation, view counts, comments, uploader logs and editor
   contact details. Do not infer text from collapsed or unloaded sections.
2. Save the normalized snapshot as
   `D:\Star\LIVE_IN_HDU_RUNTIME\approved-knowledge\hdu-freshman-guide-2026.md`.
   Compare it with the previous snapshot and record the material changes for the reviewer.
3. Obtain a fresh human approval for any changed content. Update `approvedBy` and
   `approvedAt` in `knowledge-manifest.json`; never reuse an earlier approval timestamp for
   changed bytes.
4. Validate before any network or database mutation:

   ```powershell
   npm exec -- tsx scripts/import-approved-knowledge.mts `
     --manifest 'D:\Star\LIVE_IN_HDU_RUNTIME\approved-knowledge\knowledge-manifest.json' `
     --approved-root 'D:\Star\LIVE_IN_HDU_RUNTIME\approved-knowledge' `
     --dry-run
   ```

   Continue only when the output reports `valid: true`, one expected item and a
   64-character SHA-256 for the approved snapshot.
5. Import through the configured local WeKnora and PostgreSQL services, then wait for the
   parser:

   ```powershell
   npm exec -- tsx scripts/import-approved-knowledge.mts `
     --manifest 'D:\Star\LIVE_IN_HDU_RUNTIME\approved-knowledge\knowledge-manifest.json' `
     --approved-root 'D:\Star\LIVE_IN_HDU_RUNTIME\approved-knowledge' `
     --wait --timeout-minutes 30
   ```

   The first run must create one completed item with zero failures. Run the same command a
   second time; it must report `created: 0` and `skipped: 1`. Any other result requires
   investigation before publishing or retrying.
6. Run `scripts\backup-knowledge-stack.ps1` after the verified import. Keep the generated
   database dumps, D-drive data, redacted configuration and SHA-256 manifest together; do
   not use `docker compose down -v` during backup or recovery.

Only this operating procedure and its contract tests belong in Git. The D-drive snapshot,
manifest, secrets, browser export artifacts and WeKnora data remain local runtime assets.
