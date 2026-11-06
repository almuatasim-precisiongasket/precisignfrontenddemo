# Local pilot

## Synthetic account bootstrap

Use a new, separate local database and a credentials file outside the repository. Create both parent directories first. The command accepts absolute paths:

```powershell
npm run provision:pilot -- "C:\absolute\pilot\precisign.sqlite" "C:\absolute\private\credentials.json"
```

The command creates six synthetic accounts, assigns the three company grants, leaves form grants empty, and requires a password change at first sign-in. Muatasim is the initial super admin. The credential file is created once with restricted permissions. Keep it private and never commit it. The tool refuses an unmarked existing database. Rerunning an initialized pilot does not reset passwords, email addresses, or access. These identities and assignments are test fixtures.

Run the connected app with `VITE_DATA_MODE=api`, `DATABASE_PATH` set to that pilot database, and `APP_ORIGIN=http://127.0.0.1:3000`. Run `npm run dev:server` and `npm run dev` in separate terminals. Public signup must remain inaccessible until the synthetic bootstrap is complete. Real pilot hosting needs an approved HTTPS origin and persistent storage.

The super admin can use User directory → Manage access to grant companies and forms. Changes take effect on the next server request; reload or sign in again to refresh the employee's displayed choices. Existing assigned signers still need company access, but do not need permission to start the form. An authorized workflow administrator with company access can configure signing routes separately for PEW, ICCL, and FSG. This authority is separate from account administration. Connected requests can be submitted for PEW, ICCL, or FSG when the employee has the form grant and the company has a configured signing route. Group View requires a legal company selection.

For synthetic testing, run `npm run seed:pilot-workflows -- "C:\absolute\pilot\precisign.sqlite"` against a database created by the pilot bootstrap. It adds missing configurations for the four current forms per company and preserves existing configurations. Test accounts keep their existing grants. Use Manage access to grant only the forms needed for the exercise. The sample signers and processing team are for synthetic testing.

For password recovery, choose Create reset link in the directory and share the displayed link privately. It expires after 30 minutes, is valid once, and is replaced by a newer link. The employee chooses a new password; sessions are revoked. Links are invalidated when an account is disabled or its sign-in email or password changes, and are cleared from restored databases. There is no email delivery in this phase. Use an HTTPS `APP_ORIGIN` for an actual pilot and keep links out of logs and tickets.

This guide covers the existing connected setup. The [pre-production handoff](PRE_PRODUCTION.md) tracks employee onboarding, per-company form access, and readiness for a real pilot. Dated verification below applies to the versions tested at the time.

## PreciRoutes implementation update — 4 November 2026

PreciRoutes supports early final signing, explicit final completion/bypass, requester cancellation, signer replacement and processing-team read access. Completed signing retains stored `Approved` for compatibility; it does not mean department work fulfillment. Review screens can download the selected document version as a PDF in connected mode. The completed route summary and supporting attachments are separate downloads.

PDF generation uses Chromium on the API host. Install it with `npx playwright-core install chromium`, or set `PRECISIGN_PDF_CHROMIUM` to a compatible executable. Windows also falls back to installed Microsoft Edge. The API host must be able to reach the configured `APP_ORIGIN`.

Schema version 3 adds `route_administrators`. Existing records and users are preserved. Final-replacement authority is an explicit local operational grant, independent of Director/workflow-admin status: `npx tsx server/route-admin.ts grant USER_ID` (or `revoke USER_ID`), using DATABASE_PATH. No real permission grant was performed. Intermediate replacement uses existing workflow-administration authority. Final replacements require acceptance; the original signer remains assigned until acceptance, and a decline leaves that assignment intact. Signed participants cannot be replaced.

Workflow settings now select processing-team users explicitly. Membership is snapshotted on submission, like the route. Same-company membership alone no longer exposes a route. Existing records without processingUserIds remain accessible to their participants and authorized leaders; real processing-team membership still needs configuration. Cross-company authorization remains a prerequisite. Signature/attachment printing and download handlers re-read the authorized API record before proceeding.

See tasks/preciroutes.md for evidence and deferred browser gates. The previous T26 status below is historical; its statement that work completion is excluded remains correct.

Use Node 24.11 within Node 24 and run npm ci. Provision accounts with npm run provision:user and import a reviewed workflow with npm run import:workflow -- reviewed.json.

Development: set VITE_DATA_MODE=api, APP_ORIGIN=http://127.0.0.1:3000 and DATABASE_PATH to local disk. Run npm run dev:server and npm run dev in separate terminals.

Production: set VITE_DATA_MODE=api before npm run build. Set NODE_ENV=production, APP_ORIGIN to the approved HTTPS origin, DATABASE_PATH to persistent local disk and API_PORT, then npm start. The combined frontend/API listens on loopback; an office HTTPS reverse proxy must forward the entire origin to it. Host, certificate and proxy setup remain rollout decisions.

Backup: set BACKUP_DIRECTORY (default backups), then npm run backup. Uses SQLite online backup with integrity checking and unique timestamped filenames. Do not blindly copy the live SQLite file. Protect backup files because they contain private business data and password hashes. Scheduling, retention and independent backup destination remain operational decisions.

Restore: npm run restore -- backup.sqlite NEW-destination.sqlite. The destination must not exist and must be separate from the source. Restored sessions are cleared; users sign in again. Point DATABASE_PATH at the restored copy for a rehearsal before cutover. Never overwrite a live database. Interrupted copies can leave .partial files; these are not completed backups.

Run npm run test:backup, test:server, test:api, test:document, lint and build. Browser and print checks remain deferred.

## Final verification and readiness — 4 November 2026

Automated checks pass for workflow state transitions, company authorization, private drafts, signature profiles, workflow versioning, file validation, failed writes, conflicts and database reopen. The combined production server was started in a fresh child process against a temporary database: frontend, deep-link fallback, health and unauthenticated API response were verified by HTTP. API-mode build and type check pass. Production dependency audit reports zero vulnerabilities.

Online backup was exercised while the source database changed. Separate restore retains request revision/history, draft, workflow and saved signature, clears sessions and leaves original sessions intact. Publishing uses an atomic no-overwrite hard link on the destination filesystem; select a local filesystem that supports hard links.

The protected Admin renderer and src/index.css match the baseline source backup byte for byte. No print or paper changes were made. The SQLite experimental warning and Vite future config-loader warning remain.

Still deferred by instruction: browser workflow-settings save interaction, default/adjusted zoom printing, PDF pagination/long-description visual review, signature positioning visual comparison and original/current browser download-byte comparison. Static renderer tests do not substitute for these checks. Earlier acceptance boxes remain open where they require these checks.

Operational prerequisites remain: actual employee/account roster, reviewed approvers and administrator authority, office host and URL, HTTPS reverse proxy/certificate, backup destination/retention/schedule. Only configured PEW Admin request submission is enabled; other company routes/forms require separate business confirmation. Admin work completion and reminder/escalation execution are not implemented. This is a locally tested pilot, not an operational deployment.
