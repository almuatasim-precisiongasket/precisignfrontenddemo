# PreciSign ordered work checklist

Read plan.md first. All items start unimplemented. Do not mark a task done merely because code exists. After implementation append evidence under the task. Dependencies are sequential unless stated. S = 1–2 files; M = 3–5 files. Split any larger task before coding.

## Phase 1 — reliable existing prototype

- [x] T01 — Reproduce the local baseline (M; no dependency)
  - Files: package.json, package-lock.json, optional minimal config correction; external source backup.
  - Acceptance: backup or existing Git state recorded; dependencies installed with exact resolved lockfile; baseline tests/lint/build outcomes recorded separately. Resolve install issues using official docs, not guessed upgrades.
  - Verify: all four commands in plan.md. Do not use `clean`: its command is Unix-specific and deletes server.js.
  - Evidence (2026-11-04): source backup `C:\Users\HP\Desktop\precisign demo\precisign-backup-20261104-133302`; no Git repository. Initial `npm install` failed on Vite's optional esbuild peer; removed the unused direct esbuild dependency (Vite 8 migration documentation says it is optional), then install succeeded and produced package-lock.json. Original 26 tests passed, `npm run lint` passed, `npm run build` passed with a Vite `__dirname` future-compatibility warning. Changed package.json, package-lock.json.

- [x] T02 — Enforce company ownership at creation (M; T01)
  - Files: companyAccess.ts/.test.ts, workflowEngine.ts/.test.ts, AppContext.tsx.
  - Acceptance: unauthorized subsidiary rejected; missing/mismatched company/form workflow rejected with readable error; created record/form/workflow all have same legal company. Empty/unresolvable workflow cannot create orphan pending request.
  - Verify: regression tests for ICCL data + PEW workflow, unauthorized employee, absent workflow; existing engine/access tests.
  - Evidence (2026-11-04): regression first failed for ICCL form/PEW workflow. Engine now rejects mismatched company/form, unauthorized requester, absent/empty workflow and unresolved/ineligible approvers; context no longer falls back to another company's workflow and returns a readable error. Updated the four-stage journey fixture to include real assigned test users. All 27 tests passed. Changed workflowEngine.ts, workflowEngine.test.ts, approvalJourney.test.ts and AppContext.tsx. Ambiguous role assignment is deferred to T04.

- [ ] T03 — Repair archive visibility and review selection (S; T02)
  - Files: ArchiveRegisterView.tsx, ReviewSignView.tsx.
  - Acceptance: archive list/export/history use authorized scoped collection; unavailable selected ID shows empty/unavailable state rather than first record; switching scope cannot show another record under old selection.
  - Verify: browser persona/company matrix; wrong-company row/history/export absent; lint.
  - Progress (2026-11-04): archive list and CSV use companyRequests; history modal is gated by current authorized scope; review no longer falls back to another request. Browser: Director PEW archive 7 records, Director group 8 including ICCL, PEW employee group 7 excluding ICCL, employee ICCL scope 0; opening ICCL as Director then switching to PEW shows unavailable state. `npm run lint` and `npm run build` pass. CSV contents and history modal during scope/persona change were not independently exercised in browser; leave task unchecked until those checks and remaining persona/company matrix are completed. Changed ArchiveRegisterView.tsx and ReviewSignView.tsx.

- [ ] T04 — Repair workflow assignment and save state (M; T02)
  - Files: WorkflowSettingsView.tsx, AppContext.tsx, workflowEngine.ts/.test.ts; optional shared validation utility if split needed.
  - Acceptance: changing role clears explicit user; new saved config appears immediately; missing/ambiguous role assignment fails clearly. Existing submitted workflow snapshots stay unchanged.
  - Verify: focused regression tests plus save new company workflow/reload/manual check. Do not invent actual ICCL/FSG approvers.
  - Progress (2026-11-04): changing role clears explicit assignee; context appends new workflows; role-only resolution rejects zero or multiple eligible approvers. Regression test passed. Manual save/reload remains unverified; keep unchecked.

- [x] T05 — Enforce stage action flags (S; T04)
  - Files: workflowEngine.ts/.test.ts.
  - Acceptance: assigned approver cannot use disabled reject/return; Director return exception preserved; self-approval and normal stage assignment unchanged.
  - Verify: each enabled/disabled action, Director exception, existing tests. Handle unsupported resume setting in T06.
  - Evidence (2026-11-04): new failing-then-passing regression checks enabled/disabled reject/return and Director return exception; full suite 29/29 passed. Changed workflowEngine.ts and workflowEngine.test.ts.

- [ ] T06 — Repair journey history semantics (M; T05)
  - Files: approvalJourney.ts/.test.ts, ApprovalJourneyPanel.tsx, WorkflowSettingsView.tsx; optional ReviewSignView.tsx.
  - Acceptance: current milestones match current document version while full history retains all events; bypassed participants never signed/certified; latest return reason shown, restart-only policy reflected in settings.
  - Verify: approve v1 → return → resubmit v2 has no stale approval comment/date; repeated return displays latest reason; override identifies actual actor. Keep banner structure/styles.
  - Progress (2026-11-04): history matching now filters document version; bypassed milestones are not marked signed; latest return feedback selected; settings show restart-only routing. Full suite 29/29, lint and build pass. Still needed: dedicated regression tests, override actor attribution and browser verification. Changed approvalJourney.ts, ReviewSignView.tsx and WorkflowSettingsView.tsx.
  - Additional progress: added regression tests for v1 approval followed by v2 resubmission and an override by a different Director. The journey now shows the actual overriding Director without changing the configured assignment. All 31 tests and lint passed. Browser verification of repeated returns and settings remains outstanding; keep unchecked.

- [ ] T07 — Make local persistence failures observable (M; T06)
  - Files: repository.ts/.test.ts, AppContext.tsx plus split caller tasks below.
  - Acceptance: storage quota/unavailable write errors reject; context awaits writes before state success/draft clearing; failures preserve input. Reset uses injected Storage consistently, not window.localStorage directly.
  - Verify: throwing fake Storage tests, reset in Node, failed submit preserves draft. Finish caller adaptations in T08/T09; temporary type failures must be resolved before checkpoint.
  - Progress (2026-11-04): reset now uses injected storage; failing-then-passing Node test covers clearing drafts. Write failures are still swallowed and async callers still need adaptation; this task remains incomplete.
  - Further progress: storage writes/removes now reject on error; request actions await writes before updating state and failed submit retains its draft. Signature profile and workflow saves await and report errors. Regression covers failed draft write. Remaining: integration test for failed submission and error handling for all session/reset paths.

- [ ] T08 — Adapt submit/drafts to asynchronous saves (S; T07)
  - Files: CreateRequestView.tsx, AppContext.tsx if required.
  - Acceptance: pending/errors shown accurately; loaded draft restores company/fields/attachments without autosave overwriting it; changing persona/scope cannot write stale fields to another draft. Request is not duplicated by repeat clicks.
  - Verify: delayed/failed repository, restore after reload, switch user/scope; clear behavior. Draft stores editable data and attachments, not approval signatures.
  - Progress: draft data includes attachments and company; editor mounts after draft load and is keyed by user and scope; save failures appear in editor and duplicate submission is guarded. Browser showed Admin editor rendering. Delayed save/switch, attachment restore and failure integration tests remain.
  - Follow-up: draft writes are queued per user/scope, clear waits for pending saves, and completion from an old scope no longer updates the active draft state. Loads wait for pending writes for the same key. Automated delayed-write and browser verification remain outstanding.
  - Batch 3 prerequisite: storage read errors and corrupt JSON now reject instead of becoming empty drafts; draft editor stays closed and shows a retryable error. Regression test covers failed reads and preserved draft. Initial application load also reports a storage error. Full T07–T10 verification remains open.

- [ ] T09 — Repair correction and signing flow (M; T08)
  - Files: ReviewSignView.tsx, SignatureModal.tsx, UserProfileView.tsx, workflowEngine.ts/.test.ts.
  - Acceptance: one signature modal; submit/approve/resubmit/override require explicit confirmed mark; correction edits date/department/priority/description/checklist/attachments while company/requester immutable. Buttons await action results and retain input on failure.
  - Verify: full return/correct/re-sign flow; blank/empty-draw/upload-tab-without-file does not silently sign; signature canvas coordinates account for rendered canvas scale; stored upload is not replaced by typing on save. Split correction editor into its own task if over five files.
  - Progress (2026-11-04): removed duplicate approval modal; modal now rejects missing mark for selected method and scales drawing coordinates. Correction fields, resubmission/override confirmation, persistence handling and browser verification remain.
  - Further progress: correction editor now includes date, department, priority, checklist and attachments; requester/company changes are rejected. Resubmission and override use signature modal; async actions report write failures. Regression covers ownership and updated attachments. Full end-to-end signing and upload checks remain.
  - Review follow-up: profile now rejects blank typed/drawn signatures and scales drawing coordinates. Review/profile components remount on actor/scope/request changes so prior request/version/correction state cannot carry into another selection. Type checking passed. Full browser and delayed/failure integration verification remain pending; task is not complete.

- [ ] T10 — Label unsupported forms and signature claims accurately (M; T09)
  - Files: FormsLibraryView.tsx, ReviewSignView.tsx, SignatureModal.tsx, ApprovalJourneyPanel.tsx, WorkflowSettingsView.tsx.
  - Acceptance: non-Admin sample records never render/sign as Admin documents; correct Payment catalog code; remove unsupported certification/cryptographic claims outside protected paper renderer. No invented approval defaults for unfinished forms.
  - Verify: open Payment/IT/Undertaking seeds; Admin still previews/signs unchanged. Audit remaining claims and split small follow-up if additional files need correction.
  - Progress (2026-11-04): non-Admin sample records now show unavailable instead of Admin document; payment code corrected in catalog and settings; removed cryptographic/certified wording in signature modal. Remaining unsupported claims, workflow defaults and browser verification still need work. Full suite 32/32, lint and build pass.
  - Further progress: additional unsupported certification wording removed; unfinished catalog entries display workflow as unconfirmed and Admin is labelled prototype. Browser confirmed Payment sample is unavailable and Admin editor renders. IT/Undertaking and full signing verification remain.

### Checkpoint A — before backend
- [ ] All 26 original tests plus regressions pass; lint/build pass. Browser Admin lifecycle and company matrix checked. Document renderer untouched. Record checks and changed-file list; report checkpoint progress without requesting redundant approval if user already authorized full implementation.

## Phase 2 — one-server local pilot

Planning update (4 November 2026): follow the revised T11–T21 batch section in plan.md. Isolated server work T11–T15 may proceed before the remaining frontend checks; T16 integration requires them. API mode stays explicit during development, and unavailable mutations are disabled until implemented. Provision reviewed workflows with a local import command before T17; do not invent company routes. Include draft concurrency and atomic submit/cleanup in T21. All backend tasks below remain unchecked and unimplemented.

- [x] T11 — Add isolated server/database foundation (M; Checkpoint A)
  - Files: server/db.ts, server/app.ts, server/index.ts, package.json, .gitignore. Add tests in a follow-up subtask if needed.
  - Acceptance: explicit Node runtime/SQLite choice documented; separate createApp/listen; database data directory ignored, no secret defaults; versioned schema initializes empty test DB and survives reopen. No automatic import of demo requests.
  - Verify: temporary DB schema/reopen tests; /api/health basic response; build/lint scripts cover server.
  - Evidence (2026-11-04): server/db.ts initializes schema version 1 with companies only, foreign keys/WAL/timeout, rollback helper and no import-side effects; server/app.ts factory separate from index startup. Tests prove empty initialization, transaction rollback, account/session persistence after reopen and version. Actual `dev:server` startup with temporary disk DB answered /api/health. Node 24.11 SQLite experimental warning documented. Added npm server/test/provision scripts, runtime bound and ignored DB files; updated lockfile. Original 34 tests, 4 server tests, lint/build pass. Admin renderer hash remains B2C2F09983EA66B0354E03AF51CED451D6EB213F1DBF0449829EB9C161601C51.

- [ ] T12 — Add account provisioning (M; T11)
  - Files: server/auth/passwords.ts, server/provision-user.ts, server/auth/passwords.test.ts, package.json, server/db.ts if needed.
  - Acceptance: interactive hidden password input; unique emails, salted scrypt hashes, constant-time verification; no plaintext stored/logged. Synthetic test accounts only in tests.
  - Verify: correct/wrong password, duplicate user, hash redaction; provisioning usable locally.
  - Progress (2026-11-04): implemented salted scrypt, normalized unique email, known role/company validation and local hidden-password terminal command in server/provision-user.ts. Tests verify salt uniqueness, valid/invalid password, bounds, duplicate normalized email and invalid company. Interactive terminal password rendering/entry not yet manually exercised; no real accounts provisioned. Keep unchecked until this verification is complete.

- [ ] T13 — Add session login/logout (M; T12)
  - Files: server/auth/sessions.ts, server/routes/auth.ts, server/auth/auth.test.ts, server/app.ts, optional db migration.
  - Acceptance: authenticated me endpoint; token hashes/expiry/revocation, cookie settings and same-origin mutation checks; rate-limited login and generic failures. No password/hash/token leaks.
  - Verify: unauthenticated/expired/logged-out access; cross-origin mutation rejected; independent browser sessions. Use separate test DB per test suite.
  - Progress (2026-11-04): auth routes implemented with 12-hour hashed-token sessions, logout revocation, fixed-origin mutation checks, IP rate limits and safe profile responses. Real HTTP tests verify login failure/success, independent sessions, expiry, logout, malformed cookies, cross-origin rejection, rate limiting, secure cookie configuration and redaction. Security headers included. Actual separate-browser cookie/login test remains for T16; keep unchecked. API is not connected to frontend. Local instructions: docs/LOCAL_API.md. Node-native SQLite experimental warning and existing Vite __dirname warning remain documented.

- [x] T14 — Define repository action contract (M; T13)
  - Files: src/services/repository.ts, src/types/index.ts, src/services/repository.test.ts, src/services/apiRepository.ts plus contract tests if needed.
  - Acceptance: async submit/approve/return/reject/resubmit/override methods carry intents + expectedRevision; local implementation retains demo behavior; HTTP client handles JSON errors, 401, 409 and network failures. No generic record mutation in API mode.
  - Verify: mocked transport contract tests, existing repository tests. Do not switch application mode yet.
  - Evidence (2026-11-04): apiTypes.ts defines RequestActions, DTOs, revisioned output and ApiError. ApiPreciSignRepository implements session/read/action methods; rejects generic record writes and unimplemented operations explicitly. LocalActionRepository wraps existing engine and persists revision; AppContext delegates actions to it. Tests cover status 400/401/403/404/409/413/500, network failure, malformed responses, intent body, raw-write rejection, demo lifecycle/stale revision and unchanged record after failed write. `test:api` 4/4, lint/build pass. API adapter not selected as frontend data source; integration T16. docs/API_CONTRACT.md records limitations.

- [x] T15 — Read authorized server records (M; T14)
  - Files: server/routes/bootstrap.ts, server/routes/requests.ts, server/requests.test.ts, server/app.ts, server/db.ts as needed.
  - Acceptance: bootstrap exposes only safe profile data and accessible configuration; every list/detail scope filtered by session actor; inaccessible IDs return unavailable response. No other user's saved signature image exposed through directory endpoint.
  - Verify: direct API company matrix for employee, allowedCompanyIds, GM, Director, group admin; no token/password fields.
  - Evidence (2026-11-04): server/reads.ts adds protected bootstrap and list/detail endpoints with SQL company filtering; validates scope and returns 404 for missing/inaccessible IDs. Actual HTTP tests cover all five access cases, explicit subsidiary scopes, omitted/PEG scope, unauthorized and invalid scope, redacted directory/configuration. `test:server` 5/5 pass. No production data or user accounts imported. Batch 2 server checks complete; browser API integration remains T16.

- [ ] T16 — Connect login and read-only UI (M; T15)
  - Implementation update: explicit VITE_DATA_MODE=api connects login/session/bootstrap to AppProvider using existing dashboard and archive; Vite proxies /api. API mode hides demo persona switchers, blocks local mutations and shows read-only Admin preview; logout unmounts session data. Invalid data mode fails closed. Browser verified synthetic account login, read-only creation, reload/session restoration and logout. 35 business, 8 API and 5 server tests pass; lint/build pass. Separate browser sessions and real UI server-down/401 checks remain unverified; T07–T10 prerequisite checks remain open. Keep T16 and Checkpoint B unchecked.
  - Browser verification (2026-11-04): synthetic Pilot One in in-app browser and Pilot Two in Chrome signed in independently against isolated local database. Signing out Chrome did not sign out the in-app browser. Reload restored Pilot One; deleting only synthetic test sessions caused reload to return to login. Stopping the API caused a retryable server error; retry after restart restored the session. Workflow editing showed the read-only unavailable message. Database contained no request records, so populated-record rendering was not exercised. T07–T10 prerequisite checks remain open; T16 and checkpoint remain unchecked.
  - Progress: ApiSession now handles restore/login/logout/expiration, distinguishes server failure from anonymous state, clears loaded data and rejects late responses after expiration. Three new tests pass; API suite 7/7 and lint pass. This service is not yet wired to React; login UI, mode selection, proxy, read-only screen guards and browser verification remain. T16 is incomplete.
  - Follow-up: Vite now proxies /api to the local server, preserving the browser Origin for server checks. Session logout completion is generation-guarded; regression confirms an old logout response cannot clear a newer session. API tests 8/8 pass. React login, API mode, read-only guards and browser verification remain incomplete.
  - Files: src/components/auth/LoginView.tsx, src/App.tsx, src/context/AppContext.tsx, src/services/apiRepository.ts, vite.config.ts.
  - Acceptance: API default mode restores session and loads authorized data; logout clears in-memory records/drafts; explicit demo flag required for persona/reset controls; errors never fall back to demo. Add auth/profile methods behind service boundary, no fetch in components.
  - Verify: two browser sessions; login/reload/logout/server-down; existing styles preserved. Split header/sidebar persona gating into its own small subtask if needed.

### Checkpoint B — identity and reads
- [ ] Core tests/server tests/lint/build pass. API starts against real empty local DB; provisioned account logs in; unauthorized direct reads fail; demo data remains separate.

- [ ] T17 — Submit Admin Requests on server (M; Checkpoint B)
  - Progress: server/requestRoutes.ts implements validated PEW Admin submit with session-derived identity, workflow snapshot and transactional insert. Added local reviewed-workflow import command. No real approvers configured. Server is still read-only in React until mutation integration; browser end-to-end and rollback fault tests outstanding.
  - Files: server/routes/requests.ts, server/requestService.ts, server/requests.test.ts, AppContext.tsx, apiRepository.ts.
  - Acceptance: server validates company/workflow/fields/signature/attachments; derives requester/time/ID/history; atomically persists v1 with revision; UI refresh displays it in another session.
  - Verify: tampered actor/status/history rejected, missing workflow rejected, payload limits enforced, restart persistence. No client-built record trusted.

- [ ] T18 — Approve stages transactionally (M; T17)
  - Progress: approve uses BEGIN IMMEDIATE and expectedRevision with atomic status/history update; HTTP test proves concurrent same-revision approvals yield one 200 and one 409. Frontend mutation connection and browser verification outstanding.
  - Files: server/requestService.ts, server/routes/requests.ts, server/requests.test.ts, AppContext.tsx, apiRepository.ts.
  - Acceptance: server reloads latest record, runs repaired engine with session actor, revision-checks atomic save; final signature mapping preserved; UI uses server result.
  - Verify: wrong actor/company, self approval, duplicate click and two simultaneous same-revision approvals; exactly one new event. Client receives 409 and refreshes safely.

- [ ] T19 — Return and reject (M; T18)
  - Progress: return/reject use the same transaction path and shared engine permissions; actual HTTP tests cover return, wrong requester resubmission, Director rejection and terminal-state rejection. Full boundary matrix/browser checks remain.
  - Files: same service/routes/test/context/client seam as T18.
  - Acceptance: reasons/flags/Director exception enforced server-side; terminal states immutable; correct requester responsibility displayed.
  - Verify: unauthorized/blank reason/disabled action/state cases; two-session return/rejection.

- [ ] T20 — Resubmit and Director override (M; T19)
  - Progress: endpoints require new signature payload, preserve ownership, bump revision/document version, retain old attachment contents in attachmentVersions, and support authorized Director override. Actual HTTP lifecycle test covers correction through final approval, old snapshot retained, and override bypass. Signature validation checks bounded base64/type magic; full image decoding, failure rollback testing and browser lifecycle remain outstanding. Batch 4 remains incomplete.
  - Batch 4 start: enforced the user-confirmed Director self-approval prohibition for both normal approval and override, even if preventSelfApproval is disabled. Added a failing-then-passing regression. Server mutation endpoints and full Batch 4 lifecycle remain unimplemented.
  - Files: same service/routes/test/context/client seam as T18.
  - Acceptance: owner-only correction preserves company/requester, v2 snapshot/reset/new confirmed signature; override requires enabled policy, Director role, reason and signature with accurate actor history.
  - Verify: immutable-field tampering, stale revision, unchanged v1 history, no fake bypassed signatures. Split these two operations if implementation exceeds focused scope.

- [x] T21 — Persist actor-owned drafts (M; T20)
  - Files: server/routes/drafts.ts, server/drafts.test.ts, server/app.ts, apiRepository.ts, AppContext.tsx.
  - Acceptance: authorized subsidiary key, own drafts only, attachments restored, draft only removed after confirmed submit; failures visible and stale user/scope saves prevented.
  - Verify: reload, isolation, delayed response, failed save, successful submit clears correct draft.

- [x] T22 — Save own signature profile (M; T21)
  - Files: server/routes/profile.ts, server/profile.test.ts, server/app.ts, apiRepository.ts, AppContext.tsx.
  - Acceptance: only session user's profile writable, image limits validated; existing signed requests unchanged by profile updates.
  - Verify: cross-user attempt rejected; profile reload; old request signature preserved.

- [ ] T23 — Save workflow configuration securely (M; T22)
  - Files: server/routes/workflows.ts, server/workflows.test.ts, server/app.ts, apiRepository.ts, AppContext.tsx.
  - Acceptance: central admin permission, company-scoped validated stages, server version increment; new requests use new version, old requests keep snapshot. No reminder/escalation service implied by saved numbers.
  - Verify: employee forbidden; allowed admin saves; missing/ambiguous assignee and unsupported form rejected. Confirm real administrator authority before enabling outside local test.

### Checkpoint C — complete local pilot
- [ ] Original/regression/server tests, lint/build pass. Two-session create/approve/return/correct/reject/override matrix complete. Failed saves preserve input. Restart retains records. No browser storage contains authoritative API-mode records/auth tokens.

## Phase 3 — delivery verification

- [ ] T24 — Verify unchanged document behavior (S; Checkpoint C)
  - Files: tasks/todo.md evidence only; no renderer/style edits.
  - Acceptance: signed Admin requester/final authority positions match existing display; intermediate marks remain digital; v1/v2 selection correct; default/adjusted zoom printing inspected, long-description continuation checked.
  - Verify: browser screenshots and print-to-PDF if available. If defects found, report exact case; obtain explicit business authorization before protected document changes.

- [x] T25 — Package local start and backups (M; T24)
  - Implemented combined loopback production frontend/API startup, manual SQLite online backup and separate restore with restored sessions removed. Added docs/LOCAL_PILOT.md and test:backup. Backup/restore test, type check and API-mode production build pass. Fresh-process startup verification was blocked by execution policy; browser checks deferred by user. Expanded concurrent-write backup verification remains open. Do not mark T25 fully verified.
  - Files: package.json, server/backup.ts, server/backup.test.ts, docs/LOCAL_PILOT.md, .env.example.
  - Acceptance: documented development/production start commands, required environment/runtime/data paths; consistent SQLite online backup (not blind live-file copy), restore into separate DB tested; no data/secret files included in source.
  - Verify: fresh process production start, DB reopen, backup restore with sample request/history. Operational HTTPS/host/backup destination are recorded rollout questions; no deployment performed.

- [x] T26 — Final review against the plan (S; T25)
  - Files: tasks/todo.md, docs/LOCAL_PILOT.md.
  - Acceptance: final verification evidence and actual limitations recorded; distinguish local pilot completion from operational rollout; unfinished forms remain clearly unavailable.
  - Verify: rerun checks once after last implementation change; compare renderer/style files with baseline backup; report result and pending business decisions. Do not claim real-world readiness from unit tests alone.

## Connected mutation integration — 4 November 2026

- [x] Connect existing submission, approval, return, rejection, correction and override controls to ApiPreciSignRepository. Correction sends only editable fields; authoritative returned records update context. Demo remains isolated.
- [x] Preserve inputs on rejected saves: signature dialog awaits result, remains open on error, prevents duplicate confirmation and preserves its mark across cancel/reopen. Return/reject reasons stay open on failure; correction fields are not reset when reopening.
- [x] Conflict handling: 409 loads authoritative record without retrying action, retains component edits and displays review instructions. Per-request in-flight guard prevents concurrent local actions.
- [x] Connection polling retains mounted editors on outage; expired-session overlay restores the same user without remounting drafts/editors. Inbox refresh available for other users' changes.
- [x] Automated verification: 50 business/repository/API/session/server tests passed; TypeScript check passed.
- [x] Browser failed-submit verification with synthetic SQLite BEFORE INSERT failure: no record persisted; form description and signature dialog remained open with error. Trigger removed afterward.
- [ ] Remaining browser matrix: retry restored submission, all six connected actions across users, stale-tab conflict, session restoration and attachment retention. Browser control interrupted with `browser.user is unavailable` before these checks finished. Do not claim full Batch 4 verified.
- Connected drafts are explicitly session-memory only pending T21; reload/sign-out loses unsubmitted drafts. No claim of server draft persistence.

### Browser follow-up — connected lifecycle verified

- [x] In isolated `precisign-batch4-ui.sqlite`, requester in IAB submitted; manager in independent Chrome returned with reason; requester edited description and re-signed v2; manager approved stage 1; Director signed final approval. All success states observed in DOM.
- [x] Separate manager-owned request approved by Director Override from UI. Another request rejected by Director from UI.
- [x] Competing Director tabs: one rejection committed; stale tab received 409, loaded Rejected record, retained `Preserved stale rejection reason`, displayed conflict in open dialog. History stayed at two events (submission and winning rejection); no automatic retry. Screenshot: tasks/evidence/api-conflict.png. Browser console reported no errors in checked tab.
- Full six-action connected UI path is verified. Additional earlier Batch 4 validation cases (full file decoding/boundaries, broad permissions matrix, attachment browser tests, expired-session restoration) remain outside this completed action-connection check; overall task checkboxes retain their stricter acceptance gates.

### Batch 4 verification follow-up — 4 November 2026

- [x] Added `server/requests.boundaries.test.ts` to `npm run test:server`: HTTP checks reject cross-company access/actions, wrong requester resubmission, protected form fields, blank reason, invalid signature/file magic, >5 MiB per file, >10 MiB total, >20 files and oversized description. A synthetic SQLite update failure returns 500 and leaves revision unchanged. After return/resubmission, original and replacement attachment bytes and v2 history/revision survive database close and reopen.
- [x] Fixed review attachment panel to select files for the selected version; browser checked synthetic v1 and v2 attachment names on the existing isolated test database. Missing legacy snapshots are labelled unavailable. Creation hint now lists supported formats.
- [x] Browser: revoked only a synthetic Director session while an unsaved form was open. The expiry overlay appeared; same-user sign-in restored the session and retained the entered description.
- [x] `npm run test:server` 7/7, required business plus API tests 44/44, `npm run lint` and `npm run build` pass.
- [ ] Remaining verification: browser upload and download of real synthetic files, payload size boundary at 18 MiB, full decoding of malformed PNG/JPEG/PDF beyond file-header checks, full action permission/state matrix and fault injection for resubmit/insert. File content validation currently checks base64, length, allowed MIME and magic prefix, not complete structural validity. Existing T17–T20 and Checkpoint B remain open pending their full criteria.

### Finish automated Batch 4 validation (authorized)
- [x] A: decode bounded PNG/JPEG and parse PDF before transaction; malformed-file regressions.
- [x] B: exact 18 MiB boundary, insert/correction fault rollback, permission/state HTTP matrix.
- [x] C: full tests, lint/build, dependency audit, document evidence. Browser file upload/download remains a separate manual check.

### Batch 4 automated completion — 4 November 2026 (current status)

This section supersedes older progress notes saying mutations or content decoding are not implemented. All requested non-browser Batch 4 gaps are complete; T17–T20 retain unchecked top-level boxes only because browser file upload/download has not been performed. No T21 draft endpoint is claimed.

- File validation now fully decodes PNG/JPEG pixels with sharp (16 million pixel cap, one page/frame, strict warning handling), and parses PDF objects/page structure with pdf-lib, rejecting encrypted/unreadable PDFs and missing EOF/page trees. Decoding happens before the synchronous write transaction. Original accepted bytes remain intact for historical attachment fidelity. This is format validation, not malware scanning or proof that every PDF content operator renders correctly.
- New decoder dependency sharp 0.35.5 selected after audit flagged vulnerabilities in initial 0.34 selection; Node requirement >=20.9 matches pinned Node 24.11. pdf-lib 1.17.1 added. package-lock.json updated, no existing framework major upgrades.
- HTTP checks: exact 18 MiB JSON reaches runtime validation (400); 18 MiB + 1 returns 413. Valid PDFs at 5 MiB each/10 MiB combined accepted; >5 MiB file, >10 MiB total, >20 attachments and oversized text/signature rejected. Valid PNG/JPEG/PDF accepted; truncated PNG/JPEG and header-only/malformed PDF rejected. Protected submission/correction ownership fields rejected. Missing workflow fails closed.
- Permission/state checks: unauthenticated mutations return 401; all five action routes reject wrong company; current-stage assignment, disabled return/reject, enabled/disabled Director override and non-Director override enforced. Director normal approval and override of own request rejected even with self-approval config disabled. Returned/Rejected/Approved requests reject pending-only actions. Director return/reject exceptions work. Alternate Director override records actual actor and no bypassed signature.
- SQLite failure injection: submit INSERT failure adds no request; approval failure changes no revision; correction UPDATE failure preserves complete request, attachments, versions and history. Existing synthetic draft row remains byte-for-byte unchanged on failed submit/correction. Prior and current file bytes, history and revision persist after DB reopen.
- Final checks: combined required business/repository/API/session/server tests 51/51 pass; npm run lint and npm run build pass; npm audit --omit=dev reports zero vulnerabilities. Protected Admin renderer SHA256 remains B2C2F09983EA66B0354E03AF51CED451D6EB213F1DBF0449829EB9C161601C51. Existing Node SQLite experimental and Vite future config-loader warnings remain.
- Only remaining Batch 4 manual check: real synthetic browser upload/download (including original-version download byte comparison). Previously completed six-action browser lifecycle, conflict, historical attachment display and session restoration evidence remains above.

### Batch 5 / T21 implementation slices
- [x] T21a: shared editable/file validators; private revisioned draft HTTP routes; tests for isolation, stale writes and tombstones.
- [x] T21b: revision-aware repository/coordinator; atomic submit-and-clear; delayed/failure/conflict tests.
- [x] T21c: connect existing editor, explicit originating-company draft selection, load/error/retry/save status; browser and full checks.
Cleared drafts retain a JSON-null tombstone and monotonically increasing revision to reject delayed writes (no DB migration required).

### Batch 5 / T21 completion — 4 November 2026 (current status)

This section supersedes earlier notes that connected drafts exist only in session memory.

- Implemented private GET/PUT/DELETE draft routes keyed by authenticated user + legal subsidiary + Admin form. PEG and unsupported forms rejected; company access enforced. Drafts accept partial/empty editable text and validated attachments; ownership, signatures and approval fields rejected. Reuses server/requestValidation.ts extracted from request routes.
- Revisions protect PUT/DELETE and submission. Clear stores a JSON-null tombstone with incremented revision, preventing delayed writes from recreating an old draft. Request insert and matching revision cleanup execute inside one transaction. Stale revisions or cleanup failures roll back the request insert; unrelated drafts stay intact. Legacy submissions omitting expectedDraftRevision preserve drafts and never clear them. Connected UI always sends it.
- ApiPreciSignRepository exposes revision-aware private draft methods. DraftCoordinator queues per user/company, coalesces intermediate queued snapshots without retaining every attachment copy, blocks repeated saves after failure/conflict, and retains local edits. Network/server failures have explicit retry; stale drafts require explicit load of saved data with confirmation. No automatic conflict rebase.
- Existing create editor loads before autosaving, remounts by actual draft company, saves/restores attachments, preserves deliberately empty fields, reports saving/saved/error accurately, and blocks submission while reading files. Group View asks for a legal subsidiary; switching it loads that company's own draft. Failed initial load shows Retry without mounting an editor. Submission flushes current fields and guards duplicate clicks until navigation.
- Bound API requests to their signed-in editor identity with X-PreciSign-User; server rejects mismatches to prevent old tabs writing private draft data under a different account's shared cookie. Actor still comes only from session. Explicit login changes this binding. Expired sessions hide/inert the private interface; same-user restore preserves entered data. Logout unmounts its draft coordinator.
- Server tests: draft isolation by user/company/form, unauthorized/mismatched identity, unknown fields/files, concurrent PUT 200/409, failed save retention, stale clear/late-save tombstones; atomic stale submit/cleanup failure/invalid signature retention; successful cleanup and attachment bytes survive server/database reopen.
- Coordinator/API tests: delayed saves during company switch, queued coalescing, initial read failure cannot write, failed save/local restoration/explicit retry, second-tab conflict never overwrites winner, submit flush/double-submit/save exclusion, DTO validation/revision transport and account binding.
- Browser with isolated synthetic database: text restores after reload; uploaded precisign-draft-proof.png restores after reload and company switch; PEW/ICCL drafts remain separate; Group View requires selection; stale tab preserves local edits with error; forced SQLite update failure preserves text and explicit retry saves it; forced initial read failure blocks editor then Retry recovers; submit creates request with attachment and clears only PEW draft; logout/new requester sees no Director draft; Director login recovers ICCL draft; session expiry hides draft and same-user login restores it. Screenshot: tasks/evidence/server-draft-restored.png.
- Verification: full combined tests 59/59 pass (36 business/repository + 14 API/session/coordinator + 9 server); final coordinator memory/coalescing refinement retested 4/4. npm run lint and npm run build pass. npm audit --omit=dev reports zero vulnerabilities. Admin renderer hash remains B2C2F09983EA66B0354E03AF51CED451D6EB213F1DBF0449829EB9C161601C51. Existing SQLite experimental and Vite future config-loader warnings unchanged. No production database/accounts modified.
- Separate earlier Batch 4 limitation: browser attachment download-event wait timed out in IAB; byte comparison of browser-downloaded original/current files remains unverified. Browser upload, server persistence and versioned attachment display are verified. This does not block T21 draft persistence. T22–T26 remain undone.

### T22 completion — 4 November 2026

- Schema migration to version 2 adds user_signatures keyed by session user. Existing version-one accounts and records preserved; reopen persistence tested. Migration errors roll back and close the database.
- PATCH /api/me/signature accepts only signatureDataUrl and signatureStyleText matching the authenticated name. Shared validator enforces bounded PNG/JPEG decoding. Client userId/unknown fields and malformed image rejected. No cross-user write route. Only own bootstrap/auth-me response contains saved signature; directory entries stay redacted.
- Existing profile screen connected through repository/context. API persona switch hidden; typed name fixed to account identity; uploads selected locally and saved explicitly. Duplicate-save guard and file-reading guard prevent premature or duplicate writes. Failed saves retain selected image/text; errors do not display a success check. Saved image preview restores after reload. Signature modal offers explicit Use saved signature in Upload tab; application still requires confirmation.
- Tests cover unauthenticated/cross-user attempts, image rejection, directory privacy, unchanged stored request snapshot after profile update, failed write retention, version-one migration/reopen and self-only API transport. Combined suite 61/61 plus added API transport regression (API suite 15/15), totaling 62 passing tests. Type check/build pass. Admin renderer SHA256 unchanged: B2C2F09983EA66B0354E03AF51CED451D6EB213F1DBF0449829EB9C161601C51.
- Browser: synthetic Pilot Director saved a typed signature, reloaded, reopened profile and observed Saved signature image. Screenshot tasks/evidence/signature-profile.png. Isolated test database only; no production accounts modified. T23 remains next.

### T23 and T24 — implementation and non-browser verification (4 November 2026)

- T23 implemented: shared canAdministerWorkflows predicate permits Director/group admin only. PUT workflow endpoint validates known fields, PEW/Admin-only pilot, sequential unique bounded stages, booleans/policy/intervals, unambiguous eligible provisioned approvers, final-only paper mapping, and expectedVersion. Server increments version transactionally; conflict/failure keeps stored config and existing request snapshots. Local import command reuses the same validation/save implementation.
- Existing settings screen connected to API; nonadministrators receive permission message, non-PEW/group view asks for PEW. Unsupported forms hidden in API mode. Missing route starts empty, never borrows an existing company route. Failed saves retain edits; success uses authoritative version; duplicate save guarded. Real operational administrator/account roster still requires confirmation before rollout. Reminder/escalation values are settings only; no service is implied.
- T24 non-browser checks: added test:document with static rendering tests for requester/final-authority image slots, long-description continuation retaining remainder, print mode and print transform reset. Renderer SHA256 exactly matches protected baseline. No renderer/print CSS edited. Existing journey/engine regressions verify current-version signatures and bypass semantics.
- Browser use deferred by explicit user request. T23 screen interaction and T24 pagination, default/adjusted zoom, print-to-PDF and visual signature position checks remain unchecked; therefore T24 overall acceptance is not claimed complete.

- Final verification: server 12/12, API/session/coordinator 15/15, document 1/1, required business/repository 36/36 (64 total) pass. Added group-admin positive case and reran workflow regression plus type check. Build passes with existing future Vite config-loader warning; Node SQLite experimental warning unchanged. T23 and T24 top-level checkboxes remain open solely for the explicitly deferred browser/print acceptance checks; implementation/non-browser checks are done.

### T26 final audit — 4 November 2026 (authoritative current status)

T26 review is complete; this does not close previously deferred browser/print acceptance gates or claim operational readiness. Older progress paragraphs are historical; this status and docs/LOCAL_PILOT.md summarize the final state.

- Closed T25 verification gaps: fresh child-process production startup serves frontend and /api on loopback, health succeeds, unauthenticated me is 401, frontend deep-link fallback is 200. Added test:startup. Production port is validated. Backup publication now atomically refuses existing destination using hard link. Expanded backup test performs a source update while online backup runs; restore retains workflow/signature/request/draft data and removes only restored sessions. Source remains intact.
- Final checks: required business/repository, API/session/coordinator, static document, server and backup tests pass (65 tests), plus separate production startup smoke test (1), total 66 passing checks. npm run lint, API-mode npm run build and npm audit --omit=dev pass (zero vulnerabilities).
- Baseline comparisons: AdminWorkRequestDocument.tsx SHA256 B2C2F09983EA66B0354E03AF51CED451D6EB213F1DBF0449829EB9C161601C51; src/index.css SHA256 6C6CCBE2CC4B16551AFA63C1CF6F5FB0B92D41D6981D9F857905BBFB9B46EB8D. Both match dated source backup exactly.
- Deferred manual checks: T23 settings screen save/reload browser interaction; T24 default/adjusted zoom printing, long-description pagination and visual paper signature positions; original/current browser attachment download byte comparison. Earlier T07–T10/T16 and Checkpoints A–C remain open where broader manual matrices are required. No browser used for T26, per user instruction.
- T21/T22/T25 implementation and documented automated verification complete. T23 implementation complete; browser gate deferred. T24 static checks complete; visual gate deferred. T26 final review complete with remaining limitations disclosed. No deployment, real employee provisioning or operational permission assignment performed.
- Rollout decisions: real roster/approved routes/admin authority, office host/HTTPS and approved independent backup destination/retention/schedule. Other forms/companies stay outside writable pilot; work completion/reminder services remain out of scope.
