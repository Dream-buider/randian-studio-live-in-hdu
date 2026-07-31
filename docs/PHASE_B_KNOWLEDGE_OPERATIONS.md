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
