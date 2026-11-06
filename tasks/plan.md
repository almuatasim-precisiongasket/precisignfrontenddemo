# PreciSign execution plan — Admin Request pilot

**Earlier Admin Request pilot plan.** For the next phase across the four current forms, use the [pre-production handoff](../docs/PRE_PRODUCTION.md).

Prepared 4 November 2026. Local source is authoritative. Read with `AGENTS.md` and `tasks/todo.md`.

## Purpose and authorization

Turn the existing Admin Work Request prototype into a reliable local, multi-user pilot. Preserve its document renderer, existing layouts, styling and approval banner. This document is a plan, not authorization to deploy or use real employee data. The current turn authorizes planning only. When the user authorizes implementation, execute the checklist in order. Do not start backend work merely because this file exists.

## Execution rules for the next model

1. Read this file, AGENTS.md and the first unchecked task in todo.md. Inspect the named files before editing. Check current filesystem state; do not assume this handoff is still current.
2. Complete one task at a time. Each task should normally touch at most five implementation/test files. If it needs more, write smaller subtasks in todo.md first. Work sequentially; no sub-agents are needed.
3. Reuse current functions and components. No UI rebuild, new workflow framework, ORM, hosted database, Odoo, email system or speculative features.
4. Add regression tests for business-rule fixes. Run the task's focused tests. Run the complete verification at checkpoints. A passing existing suite does not prove a new case works.
5. Mark a task done only after its acceptance criteria pass. Record files changed, commands/results and remaining limitations immediately below the task. If a check cannot run, record why and leave its checkpoint unchecked.
6. If blocked, record the exact failure and continue only independent tasks. Never weaken permissions, drop tests or silently change a business rule to make a check pass.
7. Do not change AdminWorkRequestDocument.tsx or its printed text, dimensions, signature placement or print CSS in this scope. Report any print defect for separate authorization.
8. Do not automatically install new dependency majors to resolve an install error. Check supported versions and official documentation, make the smallest justified correction, record it, and preserve the resulting lockfile.
9. Existing local backend handoffs describe alternatives, not selected infrastructure. This plan selects a simple pilot direction; do not implement their PostgreSQL/JWT/cloud assumptions automatically.

## Known baseline

- React/TypeScript/Vite/Tailwind frontend. No implemented server or login. Express is already declared.
- LocalStoragePreciSignRepository implements IPreciSignRepository. AppContext currently calculates transitions and issues unawaited writes.
- All 26 existing unit tests passed during assessment. Local dependencies were absent; lint/build were not verified. No browser or print validation was completed.
- Folder had no .git metadata. Do not claim commits or create a remote. Before code edits, make a dated source backup outside this folder, excluding node_modules, build outputs and secrets. If Git has since been established, preserve existing changes and use its normal workflow.
- Admin is the only real document editor/renderer. Seed records also include Payment, IT and Undertaking types; review incorrectly renders these through the Admin document.
- ICCL/FSG have no seeded Admin workflows. Missing-workflow fallback produces records whose company differs from the form company.
- Reproduced in memory: disabled return allowed; v2 pending journey shows v1 approval comments/date; bypassed stage reports signed; approve accepts actor name with no signature image.

## Scope and decisions

### Preserve

Current Admin form, bilingual preview, signature capture approach, dashboard/list structures, group selector, journey components and repository boundary. Refactor behavior beneath them and make small functional changes in existing screens only.

### Pilot backend

- One TypeScript Node application, Express API, same-origin production frontend, SQLite file on local server disk. No network-share database and no ephemeral hosting disk. Use a supported Node LTS; Node 24 is present in the assessed environment. Verify the selected SQLite driver/API against official docs before implementing.
- Prefer Node's built-in SQLite API if supported by the pinned runtime; otherwise document and select one maintained driver. Do not build two database adapters or add an ORM.
- Tables: companies; users including password hash and access data; sessions containing only hashed session tokens; workflows keyed by company/form; requests containing company, status, revision and JSON record; drafts keyed by user/company/form. Use migrations via SQLite user_version, foreign keys, indexes and transactions. Keep request history/steps/snapshots inside its JSON record initially; do not normalize every field.
- Use a monotonic integer revision for optimistic concurrency. Server reads and updates each request atomically with a revision check. Stale actions return 409 without additional history. IDs generated on server using company, AW, year and UUID-derived uniqueness; do not use list length as a counter.
- Opaque random cookie sessions, server-side expiry/revocation, scrypt password hashes with random salts. HttpOnly, SameSite cookies; Secure in HTTPS production. Reject cross-origin state changes; set a same-origin development proxy. No localStorage auth tokens.
- No registration page. Provision pilot accounts through a terminal command with password prompt; never seed usable shared passwords or show password material in logs. Seed company definitions only by default. Demo users/requests stay in explicitly separate demo storage, never imported as production records.
- Workflow administration uses a central predicate. Proposed pilot default: Director or isGroupAdmin only. Existing role `Admin` represents an administration employee, not automatically an application administrator. Confirm this before enabling account/workflow administration for real staff.
- Requests remain visible within authorized companies according to existing companyAccess rules. Do not invent department-level confidentiality rules.
- Store capped attachment bytes in the SQLite request/draft payload for this small pilot (proposed limits: 2 MiB signature, 5 MiB/file, 10 MiB total attachments; account for base64 overhead). Allow PDF/PNG/JPEG only initially. Enforce limits/types server-side, serve as downloads and do not execute content. No external object storage. Limits are technical defaults, not source-form requirements.

### API contract to implement

All /api routes except login require an authenticated session. Derive actor identity from session, not body. Validate request bodies at runtime and return sanitized errors.

| Method/path | Input or purpose |
| --- | --- |
| POST /api/auth/login | email/password; rate-limited; generic credential error |
| GET /api/auth/me | current safe UserProfile; 401 if absent/expired |
| POST /api/auth/logout | revoke session and expire cookie |
| GET /api/bootstrap | safe companies/users/workflows/preferences for actor; never password hashes or other users' signature images |
| GET /api/requests?scope= | companyAccess-filtered records; omitted scope still filtered |
| GET /api/requests/:id | same authorization as list |
| POST /api/requests | Admin form fields, company, signature, optional attachments; server resolves company workflow and builds record |
| POST /api/requests/:id/approve | expectedRevision, comment, confirmed signature |
| POST /api/requests/:id/return | expectedRevision, reason |
| POST /api/requests/:id/reject | expectedRevision, reason |
| POST /api/requests/:id/resubmit | expectedRevision, editable form fields, attachments, change note, newly confirmed signature |
| POST /api/requests/:id/override | expectedRevision, reason, newly confirmed Director signature |
| GET/PUT/DELETE /api/drafts/:companyId/:formType | actor-owned draft; validate company access; no PEG-owned drafts |
| PUT /api/workflows/:companyId/:formType | admin-only valid config; version incremented by server; existing request snapshots unchanged |
| PATCH /api/me/signature | update only current user's saved signature |

No generic endpoint accepting client-supplied status, actor, history, steps or workflow snapshots. Reject tampering with protected ownership/identity fields. Existing repository contract can be extended to expose action methods; components must not call fetch/storage directly. Keep LocalStorage implementation usable in explicit demo mode. Default API mode must never fall back to demo after an error.

## Workflow rules to preserve

- Submission is history step 0, not an approval stage. First configured stage starts pending; remaining stages wait.
- Explicit user assignment takes precedence. Changing a stage role in settings clears its old explicit user binding. Role-only stages resolve to an eligible user in the company/access context; zero or ambiguous matches produce a configuration error rather than selecting an arbitrary user.
- Only current assigned approver approves; enforce self-approval policy. General Manager/Director group visibility is not ordinary out-of-order approval permission.
- Assigned approver's reject/return permissions follow stage flags. Director return remains allowed by AGENTS.md. Preserve existing Director rejection behavior pending business confirmation; do not expand it.
- Returned requests can only be resubmitted by original requester. Company/requester remain immutable. Increment documentVersion and reset stages to zero; keep prior version/history. The resume-at-current-stage option must be disabled/removed from settings because current mandatory rule is restart.
- Require a confirmed nonempty signature payload for submission, approval, resubmission and override. Typed-name image is an accepted mark for the pilot. Do not claim cryptographic certification. Preserve snapshot signer identity/time.
- Director override uses explicit reason and confirmed Director signature. Prior approvals stay intact; bypassed approvers are not signed. History identifies actual Director actor, even if different from the configured final assignee.
- Approval completes authorization only. Administration work completion remains outside this pilot; retain displayed legacy completion fields and clearly document the limitation. Do not invent a completion process.

## Deferred business decisions

Do useful local work without waiting for these, but do not enable the dependent real process:

1. Real employee/account roster and workflow administrator authority.
2. Actual Admin approvers for each company. Keep ICCL/FSG submission unavailable until configured; no PEW fallback.
3. Office hosting machine, access URL, HTTPS and backup destination before operational rollout.
4. Admin work-completion ownership/process, if needed after approval.
5. Other forms: correct Payment code is PR#21-002FA; IT branding is Precision Global (company mapping unknown); asset handover/receipt are acknowledgments, not assumed approvals; Undertaking image is cropped and signatories/process are unconfirmed.

## Verification commands

Run from repository root in PowerShell:

```powershell
npm install
npx tsx --test src/utils/approvalJourney.test.ts src/utils/workflowEngine.test.ts src/services/repository.test.ts src/utils/companyAccess.test.ts
npm run lint
npm run build
```

During backend tasks add `npm run test:server` using Node native tests through tsx, with explicit test file paths. Tests use temporary databases, synthetic accounts and isolated app instances. Importing the app must not bind a port or open a production database. Keep server listen/startup separate.

## Final acceptance

Two independent browser sessions can log in as requester/approver, submit, approve each stage, return, correct, re-sign, resubmit, reject and override with correct authorization. Restart preserves records. Wrong-company read/write fails on direct API calls. Duplicate/stale actions cannot append duplicate history. Logout/expired sessions cannot act. Save errors preserve form data and never show success. Admin preview remains unchanged and print checked at default and adjusted zoom. Backup restores into a separate test location. User receives local start instructions and an honest list of rollout decisions still outstanding.

The detailed ordered work and checkpoints are in todo.md. Complete the local pilot before proposing additional forms or deployment.

## T11–T21 implementation batches (revised 4 November 2026)

This section refines the earlier task order. Planning is authorized; backend implementation begins on the user's instruction. Keep existing task checkboxes/evidence. A batch is not complete until its listed tests pass. Do not describe server work as operational deployment.

### Batch 1 — T11–T13: database and accounts

Deliverable: an independently testable local API with persistent accounts and login/logout.

- T11a: pin Node 24 runtime expectations and verify `node:sqlite` on the installed version. Use DatabaseSync with parameterized SQL, foreign keys, WAL, busy timeout and user_version migration. Do not use SQLite features introduced after the pinned runtime. Match Node type definitions to runtime if necessary. Node 24.11's SQLite API is experimental; document this rather than claiming stable status.
- T11b: create database schema and tests for initialization, reopen persistence, rollback and schema version. `createApp({db, config})` has no production side effects. `server/index.ts` alone opens configured disk storage and listens on loopback by default. Add test:server script and ignore database, WAL/SHM files. Browser build must not import server modules.
- T12: implement scrypt password verification and interactive local account provisioning. Enforce unique normalized email and known company/role. Group access is explicit data. No credentials in arguments, fixtures, logs or source. Tests use synthetic accounts. No bulk import of existing demo users.
- T13: implement opaque session cookie with hashed token in SQLite, 12-hour fixed expiry, logout revocation and stale-session rejection. Cookie HttpOnly + SameSite=Lax, Secure in production HTTPS, Path=/. Enforce configured origin for mutations and use Vite proxy during development. Rate-limit login attempts; keep client errors generic. Use bounded password input and timing-safe password verification. Do not add JWT or external auth service.

Gate: temporary database tests pass; real local database survives restart; bad login, expired token, logout, malformed cookie and cross-origin mutation fail. No frontend switch yet. Unfinished T07–T10 browser checks do not prevent this isolated batch.

### Batch 2 — T14–T15: repository contract and protected reads

Deliverable: authenticated, company-filtered read API and an API repository tested without replacing the working demo.

- T14a: add a versioned API DTO module for action inputs/results and structured errors. Request revision is separate from documentVersion and workflowVersion. Add `revision` to server records; local demo records may be normalized to revision 1 in the adapter. Do not require hand-editing all seed data.
- T14b: extend repository with action-intent methods and session/bootstrap operations. Move local demo transition calls behind its adapter so AppContext can call the same operations in either mode. Keep presentation free of HTTP. API repository must never implement updateRequest by forwarding full client records; legacy raw mutations fail explicitly in API mode.
- T14c: define ApiError codes/statuses: 400 invalid data, 401 session missing/expired, 403 action forbidden, 404 missing/inaccessible record, 409 stale revision, 413 payload too large, 500 generic persistence failure. Decode responses safely. Never fall back to localStorage on API errors. Unit-test malformed responses, HTTP errors and network rejection.
- T15: bootstrap returns current user, authorized companies, safe user directory and workflow configurations. Directory omits other users' saved signatures and all credential/session fields. Request list/detail apply company authorization on every call; query scope never grants permission. SQL filters must precede returning records. Test employee, explicit multi-company employee, GM, Director and group-admin separately. No-company-match returns an empty list; inaccessible record IDs return 404.

Gate: direct HTTP tests prove all read boundaries and no secret fields. The demo continues to function. Every test owns and closes its app/database.

### Batch 3 — T16: login and read-only connection

Deliverable: login, logout and authorized lists using the existing screens in explicit API mode.

- T16a: finish outstanding frontend save/draft/signature checks from T07–T10 before wiring these flows to live data. Preserve the protected renderer and retain accurate incomplete flags for T03/T04/T06.
- T16b: add a small login screen using existing styles. API repository restores session through /auth/me; AppContext initializes from bootstrap only after authentication. Use an explicit `loading | anonymous | authenticated | failed` state. 401 clears records/drafts/signature modals before showing login. Server-unavailable has a retryable error, never a demo login.
- T16c: hide persona-switch/reset controls in API mode in header/sidebar/profile; provide logout. Draft, signature-profile and workflow-write controls are temporarily unavailable until their API operations exist. Request mutations are unavailable until T17–T20; show clear availability feedback instead of silently calling local persistence.
- T16d: keep demo as the default during staged development, with explicit VITE_DATA_MODE=demo/api selection. Switch default to API only after the writable pilot and T22/T23 are ready. This supersedes the earlier instruction to make API the immediate default at T16: otherwise unfinished profile/settings would appear usable while their endpoints do not exist. Production startup must explicitly require API mode.

Gate: browser tests with distinct login sessions show correct lists; reload restores session; logout/401 clears all data; server-down shows an error. No new request can be submitted from the read-only connection.

### Batch 4 — T17–T20: server-controlled request lifecycle

Business decisions confirmed by user: complete Batch 3 first; pilot PEW initially, with other companies enabled only after real routes are confirmed; Directors may reject any pending request with a required reason; Directors may not approve or override their own requests; rejection is final and correction uses Return; future approver reassignment requires history (pilot uses controlled administrator assistance); typed signatures use the authenticated person's name, with draw/upload available; preserve actual earlier-version attachment contents. No operational user names or company approvers have been supplied.

Deliverable: the full Admin Request workflow persists and behaves correctly across independent browsers.

- Preparation: provide a LOCAL terminal workflow-import command accepting a reviewed JSON config and validating actual provisioned user IDs/company access. This is a provisioning tool, not a second administration system. It unblocks submission before the settings API in T23. Test fixtures may define synthetic routes; do not copy PEW approvers to ICCL/FSG or import production demo routes automatically. A real company without an approved route remains unable to submit.
- T17: runtime validate Admin form, legal company, priority, strings and checklist; ignore no protected fields silently. Build actor identity, workflow snapshot, timestamps, ID, history and v1 on server. Validate signature data URL and decoded bytes; do not trust the MIME string alone. Accept only bounded PNG/JPEG marks and PDF/PNG/JPEG attachments. Reject unknown/protected fields with 400. Use the limits in the pilot section, including a JSON body cap accounting for base64. Bound text lengths explicitly and test boundaries. Client-provided signature timestamps/authority fields are forbidden.
- T18: approve inside a short synchronous `BEGIN IMMEDIATE` transaction: load record → check revision/actor/state → compute using shared engine → increment revision → save → commit; rollback on any failure. Do not await network/files/password hashing inside a database transaction. Signing requires a newly confirmed mark, not an actor name or silently substituted saved profile. Test two HTTP actions using the same revision; only one commits. 409 returns a safe error and the client refreshes the authoritative record without auto-retrying the approval.
- T19: return and reject through the same transactional action helper. Require reason and enforce stage flags/Director exceptions. Do not duplicate authorization logic in each route or trust the button state. Test completed/rejected/returned requests cannot take a pending-only action.
- T20a: resubmit accepts only editable data and attachments from original owner; company/requester immutable. Preserve prior history and v1 content; increment documentVersion and revision, clear prior authority mark and restart stages. Snapshot old and new attachment metadata with version data before allowing replacement, so historical content remains inspectable. Only the current signature is newly confirmed.
- T20b: override requires Director, enabled policy, reason, current revision and confirmed signature. Preserve actual actor separately from route assignment. Bypassed stages never acquire the bypassed user's signature. Test an overriding Director different from configured final assignee.

Gate: submit → approve → final approve; return → correct → sign → resubmit; reject; override all pass direct HTTP and two-browser checks. Request/history/revision survive restart. Failed writes preserve the previous record and draft. Core business tests remain green. No generic record-update endpoint exists.

### Batch 5 — T21: persistent private drafts

Deliverable: employees can resume their own Admin draft, including attachments, across browser sessions.

- API draft key is actual subsidiary + authenticated user + form. PEG is a viewing scope only. In Group View, select an originating subsidiary before saving/loading; changing it loads that company's draft rather than moving another draft between companies. Never accept requesterId in the body as ownership authority.
- Save only editable fields/attachments. Strip/reject signature and approval fields. Apply the same payload limits as submission. Use draft revision/expectedRevision to reject stale writes from a second browser with 409. Do not overwrite a newer draft after a delayed autosave.
- Queue saves per key, ignore responses belonging to inactive user/company, cancel pending debounce on switch/unmount and prevent obsolete callbacks from changing the current editor. Keep unsaved input on failure and show an accurate save status. A failed initial draft read displays an error/retry and must never autosave a blank replacement.
- Submit request and delete the matching submitted draft revision in one transaction. If the draft was edited elsewhere, reject stale submission or preserve the newer draft; never delete another draft merely because its company matches. Return authoritative result; double-submit guard remains active until completion/navigation.

Gate: own-draft reload, attachments, company/user isolation, two-browser conflict, delayed response after switch, quota/API failure, failed submit retention, successful submit cleanup and server restart are tested. A 401 clears draft UI. Browser data can remain unsaved on failure, but it must not appear saved.

### Exit from T21

T11–T21 deliver a local authenticated Admin Request pilot, not a deployed production system. Signature-profile writes (T22), native workflow settings writes (T23), print verification and backup/restore delivery (T24–T26) remain separate tasks. Before deployment, confirm the actual accounts, company routes, office host, HTTPS and backup destination. Backend configuration/import should fail clearly when a real process is missing.

For every task: record changed files, focused regression tests, full test/lint/build result at its gate, browser evidence when relevant and any unverified item. Do not mark a whole batch complete based only on implementation or unit tests. Stop at a task boundary only when the user requests a batch stop, a real dependency needs their answer, or the authorized scope is complete.
