# Roommate production deployment record (2026-08-30)

## Production layout

- Public site: `https://liveinhdu.cn`
- Server: `124.222.171.40`
- Application directory: `/srv/live-in-hdu/apps/freshman-mvp`
- systemd service: `live-in-hdu`
- Node listener: `127.0.0.1:3212` (loopback only)
- Application release source: Git HEAD `1048b3305125787fb69fbca10fd56ec556edad61`
- Later local security/operations commits: `0f7ef3057aa660c4ed83efe1a86c199e3b6a091b` and `da6cbd2dd022d0131a410ba28923cc5b70844bba`

## Release artifact and staging

- Release package: `/srv/live-in-hdu/releases/incoming/live-in-hdu-1048b33-20260830-170908.tar.gz`
- Staging application: `/srv/live-in-hdu/releases/staging/1048b33-20260830-170908/apps/freshman-mvp`
- Package SHA-256 (the source of the staging extraction): `7b20922a61243832ee34409ef8ebe003d7fa4f0e83962d78249fca186795231e`

## Rollback material

| Purpose | Path | SHA-256 |
| --- | --- | --- |
| Code | `/srv/live-in-hdu/releases/rollback/live-in-hdu-code-20260830-164728.tar.gz` | `c884011aafad96f871f120cd60b2547b5ffdeabe8494c869de5d95fc7b726beb` |
| SQLite | `/srv/live-in-hdu/apps/freshman-mvp/backups/live-in-hdu-20260830-164728.db` | `60bc2cc9820943eb0b0befd522aebf5d4a503958c5026ef751148b0f0757bf8f` |
| Environment | `/srv/live-in-hdu/releases/rollback/env/.env.local-20260830-164728` | `e61bc9850328c35c38a4e0deade48e2c2e059971b0986b535625bee18ff61b04` |
| Nginx | `/srv/live-in-hdu/releases/rollback/nginx/20260830-173059/liveinhdu.cn.conf` | `0e9e7c4470e880edd3917c1533d7e22cdd348c2ac59ab99a08789ed234361f5f` |
| Pre-enable environment | `/srv/live-in-hdu/releases/rollback/env/.env.local-pre-enable-20260830-175027` | `861e8fad996986b98f28f8a4ee90a1aade392196a51c023859890bab540b3e78` |

The active Nginx configuration SHA-256 after the public admin-page block was `6941344556b6b36d8c96eb2b31ad9fcbcc7d785893e17c6136385b32f24e89ad`.

## Final verified state

- SQLite `integrity_check`: `ok`
- Schema migration version: `6`
- Published canonical answers: `25`
- Review tasks: `21` (`20` pending)
- Roommate registrations: `2` (`2` active)
- Roommate sessions: `2`
- New-student building-group QR records: `0`
- `ROOMMATE_MATCHING_ENABLED=true`
- `npm run verify:roommates -- --base-url https://liveinhdu.cn`: passed
- Public `/`, `/guide`, `/questions`, and `/roommates`: HTTP `200`
- Public `/admin` and protected admin/review APIs: HTTP `403`
- HTTPS certificate, redirect, HSTS, Nginx, systemd service, and local health checks: passed

## Local admin access

The admin console remains available only through the SSH tunnel:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File .\apps\freshman-mvp\scripts\open-production-admin.ps1 -NoBrowser
```

Open `http://127.0.0.1:3211/admin` after the script reports a healthy tunnel. The public `/admin` route must remain blocked.

## Accepted test waivers and dependency status

- The release-gate legacy test run recorded `312` passing, `4` documented pre-existing failures, and `2` skipped tests. The four waivers were:
  - `backup accepts documented workspace junction paths only when they resolve to D`
  - `start recovers a partial database without a report and validates a dynamic report baseline`
  - `secret scan includes D-backed Playwright runtime artifacts`
  - `WeKnora source preparation adds an idempotent DuckDB 1.5.2 proxy bridge`
- The first three waivers are Windows D-drive/junction environment assertions. The fourth is a pre-existing WeKnora Dockerfile layout assertion. They are unrelated to the roommate release. The roommate server suite, complete web suite, staging build, and production readiness gates passed without failures.
- Dependency audit reported `2` moderate and `4` high findings. No automatic audit fix was applied during this deployment.

## Manual acceptance still required

- On a real phone, complete registration, same-room visibility, editing, and deletion checks.
- Upload the first new-student building-group QR image through the local admin tunnel, then verify its mobile display and a real scan.

Do not mark these two manual checks complete until they have been performed against production.
