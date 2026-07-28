# Phase B knowledge operations

Run `scripts/start-knowledge-stack.ps1 -ValidateOnly` before a real start. The live path checks the pinned vendor baseline, D-drive Docker/Ollama storage, preflight report, local secrets, then starts PostgreSQL, WeKnora/SearXNG, and the gateway in that order.

`scripts/test-knowledge-stack.ps1 -StaticOnly` is safe in CI. A live check is opt-in and reports unavailable components without exposing credentials.

`scripts/backup-knowledge-stack.ps1 -StaticOnly` performs no I/O. Its live path writes a timestamped backup under `D:\Star\LIVE_IN_HDU_RUNTIME\backups`, including both PostgreSQL dumps, WeKnora data files, redacted configuration and SHA-256 manifest. It retains 14 backups and uses `stop`/`up`; it never uses `down -v`.
