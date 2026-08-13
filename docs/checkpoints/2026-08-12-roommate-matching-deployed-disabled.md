# Roommate Matching Disabled Deployment Record

Date: 2026-08-12 (Asia/Shanghai)

Status: **deployed with roommate matching disabled**

## Release identity

- Reviewed roommate executable commit: `351a595da13c3ee322258704f2f4006dab1912e6`
- Final checkpoint commit before deployment: `bd6d6b64367eef9889989613f269a48b143f7fa6`
- Uploaded full-source archive SHA-256: `019dd95013715020d1ca1ee370ab0ae7ef35f3adbfb97ee2ff425b58c43753cf`
- Production application directory: `/srv/live-in-hdu/apps/freshman-mvp`
- systemd service: `live-in-hdu`

The uploaded archive was built from the current complete working tree so that the previously deployed FAQ and freshman-guide source files were retained. It excluded `.env*`, runtime databases, backups, `node_modules`, build output, private keys, and certificates.

## Recovery artifacts

- Database backup: `/srv/live-in-hdu/backups/roommate-predeploy-20260812-104840/live-in-hdu.db`
- Database backup SHA-256: `b901300ef19fcafafeb7ea4601df454e9a60633368c01620bb3c461fb75b6c8d`
- Environment backup: `/srv/live-in-hdu/backups/roommate-predeploy-20260812-104840/env.local`
- Previous-code archive: `/srv/live-in-hdu/releases/rollback/pre-roommates-20260812-104840.tar.gz`
- Previous-code archive SHA-256: `887035d205304a470cc9ff8df0dd738e996fdc5ec04c065cbb336307efd634d3`
- Backup and secret-bearing file modes: `600`
- SQLite backup integrity: `ok`

The first incremental-source deployment failed during compilation because the production tree did not contain all prerequisite freshman-guide source files. The rollback handler restored the previous code, environment, and database. The service and counts were rechecked before the full-source deployment proceeded.

## Production verification

- Service active and enabled; health endpoint returned HTTP 200.
- `roommateMatching.status` is `disabled` and `ROOMMATE_MATCHING_ENABLED=false`.
- Public `/`, `/questions`, `/guide`, `/chat`, `/roommates`, and `/admin` returned HTTP 200.
- Public `/api/reviews` and `/api/admin/roommates` returned HTTP 403.
- SSH-loopback `/api/reviews` returned HTTP 200.
- Disabled roommate registration returned HTTP 503.
- SQLite integrity returned `ok`; migration count is 4 and three roommate tables exist.
- Existing content remained intact: 25 canonical answers and 19 review tasks before the postdeployment live probe.
- Preset-answer probe returned HTTP 200 with route `preset` and trust state `approved`.
- Web fallback probe returned HTTP 200 with route `web`, trust state `web-unverified`, six sources, and the required disclaimer.
- TokenDance last call status became `ok`; SearXNG last search status became `available`.
- The web fallback probe intentionally added one review item, moving pending reviews from 18 to 19.
- Full Vue regression suite after deployment: 12 files, 105/105 tests passed.
- Nginx now owns public ports 80 and 3210 for the IP host; both keep the client reachable, while `/api/admin*` and `/api/reviews*` are denied at the proxy layer.
- Node now listens only on `127.0.0.1:3212`; the one-click administrator tunnel targets that loopback port.
- Nginx/environment rollback snapshot: `/srv/live-in-hdu/backups/nginx-boundary-20260812-112318`.
- `live-in-hdu-backup.timer` is enabled and generated a verified `600`-mode online SQLite backup; it runs daily and retains 30 snapshots.
- `live-in-hdu-healthcheck.timer` is enabled and passed its first probe; it checks every five minutes and performs at most one recovery restart per failed run.

`npm audit --omit=dev` reported 0 critical, 4 high, and 2 moderate dependency advisories. The advertised automatic fixes require semver-major changes (including `@fastify/static` and `exceljs`), so no blind `audit fix --force` was applied during this production deployment. These upgrades require a separate compatibility-tested security change.

## Remaining enablement gate

Roommate matching remains disabled because `liveinhdu.cn` does not currently resolve and the mainland deployment has no validated ICP/DNS/TLS path. Do not enable contact collection on the plain HTTP IP endpoint. Enablement still requires the approved domain, completed ICP filing, DNS, a valid certificate, HTTPS-only Nginx, Node bound to loopback, explicit public admin/review denial, generated server-only secrets, the readiness verifier, and phone acceptance testing.

## 2026-08-13 revalidation

- The Tencent Cloud access-provider review passed, but the filing is still waiting to be submitted to the communications administration because the domain real-name record is less than three days old. This is not the final ICP approval.
- No executable source, client, server, dependency, or package-lock change exists after this disabled deployment; later commits only changed operations and filing documentation.
- Fresh roommate backend verification passed 63/63 tests, the full Web suite passed 105/105 tests, and the production build completed successfully.
- The local and production `RoommateView-CSfxQAZ2.js` SHA-256 values both equal `895f8ed1bafad366ed854cd217e5cd8a77e4e732b1c0111afe080c55678f8dfe`.
- Production SQLite integrity is `ok`, migration count remains 4, canonical answers remain 25, pending reviews remain 19, and no roommate registration exists while the feature is disabled.
- The original database and code rollback artifacts remain present with mode `600`; the latest daily backup also passed SQLite integrity validation and both backup and health-check timers remain active.
- Public pages including `/roommates` return HTTP 200, public admin/review data remain HTTP 403, and the disabled roommate API remains HTTP 503.
- Because the deployed executable already matches the fresh verified build, no redundant code or database overwrite was performed. The release is ready for the existing post-ICP DNS, TLS, readiness, enablement, and phone-acceptance sequence.

## Source handoff

- Complete Git history bundle: `D:\Star\LIVE_IN_HDU_RUNTIME\releases\live-in-hdu-source-20260812.bundle`
- Bundle SHA-256: `3a22aeea0bd906e988edd9942daf9288a948da32a18f09abcd73795bc263cde9`
- `git bundle verify` confirmed that the bundle contains a complete history.
- No `.env.local` file is tracked. The history pattern scan found only documented placeholders and test-only fake secrets, not a production TokenDance key.
- GitHub repository permissions were confirmed for `Dream-buider/randian-studio-live-in-hdu`. After a temporary per-command DNS resolution override, branch `codex/member3-real-api-integration-20260808` was pushed and independently observed at commit `a3b0e9e5e2d7296c106335264751d409ce4ad312`. No pull request or merge was created.
