# Roommate Matching Predeployment Checkpoint

Date: 2026-08-12 (Asia/Shanghai)

Status: **not deployed**

No production server, production database, Nginx configuration, DNS record, certificate, or feature flag was changed while producing this checkpoint.

## Reviewed code

- Release code and E2E commit: `ddf73509b945ec43e92c8601f9c274a56360ade4`
- Starting implementation commit: `9af0e41634b36961631fa92073a5ed3aca10278c`
- The E2E-driven production change is limited to an optional `ProductionRuntimeOptions.now` clock passed to `RoommateService`. Normal startup omits it and retains the real system clock.
- The existing health regression fixture now includes the intentional default state `roommateMatching.status = disabled`.

## Verification evidence

| Gate | Result |
| --- | --- |
| Roommate production-runtime E2E | PASS, 1/1 |
| Focused production composition plus roommate E2E | PASS, 8/8 |
| Node test runner | 309 total: 306 passed, 1 failed, 2 skipped |
| Web test runner | PASS, 12 files and 102/102 tests |
| Production build | PASS: Vue typecheck, server TypeScript, Vite production build, and preview-data assertion exited 0 |
| D-drive secret scan regression | PASS, 1/1 |
| `git diff --check` for release files | PASS |

The single Node failure is an external local-environment gate, not a roommate assertion: `start recovers a partial database without a report and validates a dynamic report baseline` tried the configured PostgreSQL endpoint and received `connect ECONNREFUSED 127.0.0.1:5433`. The real PostgreSQL contract test was also intentionally skipped because `PHASE_B_POSTGRES_TEST_URL` is not set. The live Phase B stack test was intentionally skipped because `PHASE_B_LIVE_E2E=1` is not set. These results are recorded as failures/skips, not described as a full Node pass.

The production-runtime E2E used a temporary SQLite database, generated test-only encryption/HMAC/cookie secrets, and trusted HTTPS forwarding. It verified:

- five registrations in one room and one in another room;
- a new client recovering a registration, then updating it;
- deletion through the public session;
- loopback-only administrator hide and restore;
- expiration after advancing beyond 90 days;
- unchanged question, canonical-answer, and review rows; and
- no plaintext nickname, room address, contact, management code, session token, or generated key in the SQLite main file or surviving sidecars.

The raw-byte inspection is performed after create, recovery, update, hide, and restore but before delete or retention can erase evidence, and is repeated after retention. It includes the recovered-client session token and both normalized room canonical/display/JSON forms. After retention, every expired or deleted row has contact ciphertext, contact digest, and consent time cleared, and pre-expiry cookies can no longer list room members.

## Configuration and migration boundary

- Default feature state: disabled. `ROOMMATE_MATCHING_ENABLED` must equal the exact string `true` before enablement is requested.
- Fail-closed requirements: HTTPS public origin plus valid server-only encryption, HMAC, and cookie secrets.
- SQLite schema migration version: `4`.
- The roommate migration is additive; existing Q&A and review rows were preserved by the E2E snapshot comparison.

## Mandatory deployment backup

Before any server build is replaced or the service is restarted, create an online, timestamped backup of the production SQLite database. Record its absolute server path, byte size, SHA-256, predeployment question count, canonical-answer count, pending-review count, and schema migration versions. Do not overwrite or reseed the production database. Keep the backup outside the release archive and verify it can be opened before deployment proceeds.

## HTTPS and ICP blocker

Roommate matching must remain disabled on the current plain-HTTP IP endpoint. Public enablement requires a controlled domain, completed ICP filing for the mainland China server, DNS pointing to the server, a valid TLS certificate, Nginx on ports 80/443, forced HTTPS, Node bound to `127.0.0.1:3210`, and explicit Nginx denial of public `/api/admin` and `/api/reviews` access. Until these gates are verified, the correct release state remains **not deployed**.
