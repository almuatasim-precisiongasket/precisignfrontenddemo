# PreciRoutes implementation checklist

Keep this checklist as evidence for route behavior. The [pre-production handoff](../docs/PRE_PRODUCTION.md) tracks pilot accounts, access, and rollout decisions.

Planning record — 4 November 2026. Product agreement is recorded in docs/PRECIROUTES_SPEC.md. All implementation below remains pending. Preserve T01–T26 history and its deferred browser gates.

For each task record changed files, requirement IDs, exact checks/results and unresolved acceptance. Work sequentially in small slices through IPreciSignRepository. Preserve AdminWorkRequestDocument.tsx and src/index.css. Before code changes follow the existing source-backup requirement in tasks/plan.md. Do not import real employee data or deploy during implementation without that scope being authorized.

- [ ] R01 — Inspect current model, authorization, API and stored-state compatibility. Map PR01–PR15 to existing behavior and propose migration/status mappings. Resolve actual team/admin authority inputs with owner before enabling permissions. Output a concrete technical plan and focused regression cases.
- [ ] R02 — Named route snapshot and requester separation (PR01–PR02, PR10). Validate named eligible users and final designation; prohibit self-approval; show the actual route before submission. Verify settings edits leave submitted snapshots unchanged.
- [ ] R03 — Early final signing and completion state (PR03–PR05). Replace role-based authority with assigned-final-user checks, permit early signing, advance intermediate stages past already signed stages and complete when all signatures exist. Test multiple route lengths and early final signature followed by last intermediate signature.
- [ ] R04 — Explicit bypass completion (PR06). Add Sign & Complete and Complete Route through server/repository/context/UI. Require reason, affected-signer confirmation and current final signature; preserve truthful bypass history. Test duplicate/conflicting attempts and failed writes.
- [ ] R05 — Return, correction, rejection and cancellation (PR07–PR09, PR13). Reset early signatures on new versions, pause returned signing, close terminal records and enforce requester-only cancellation. Test late/stale actions after closure and historical version preservation.
- [ ] R06 — Participant replacement and final acceptance (PR10–PR11). Add specific authority, unsigned-only replacement, acceptance before final powers, reason/history and removed action access. Resolve refusal/pending behavior before implementing it.
- [ ] R07 — Route visibility (PR12, PR14). Apply company plus participant/team/leader authorization consistently to detail, lists, counts, histories, attachments and exports. Test unrelated employees, former signers, replacement users and unauthorized companies.
- [ ] R08 — Final output (PR14). Reuse the official form and add a separate downloadable summary showing signatures, versions, completion and bypasses. Keep attachments separate. Check authorization and actual output; preserve protected paper layout.
- [ ] R09 — Conflict and recovery review across all new actions (PR15). Test concurrent sign/complete/return/cancel/replace, failed-save retention, reload, expired sessions and restart persistence. No blind retries or success display after failures.
- [ ] R10 — Acceptance and pilot handoff. Run the required AGENTS business suite plus affected server/API/document tests, type check and build. Execute agreed scenario matrix; record browser/print/download checks separately until performed. Record operational prerequisites and owner acceptance; do not equate automated green checks with rollout readiness.

Required business command from AGENTS.md:

```powershell
npx tsx --test src/utils/approvalJourney.test.ts src/utils/workflowEngine.test.ts src/services/repository.test.ts src/utils/companyAccess.test.ts
```

Evidence for new behavior must be added when implemented. No tests were run for this documentation-only planning step.

## Implementation started — 4 November 2026

- R01 compatibility inspection recorded in docs/PRECIROUTES_IMPLEMENTATION.md. Real roster/team/replacement-authority inputs and detailed migration mapping remain open; R01 is not fully closed.
- R02 partial: workflowEngine rejects requester-as-approver even when preventSelfApproval is false; validates only-last-stage final designation; deep-clones the submitted workflow snapshot. HTTP submission rejects self-assignment and malformed final designation with 400. No existing records changed.
- Files: src/utils/workflowEngine.ts and its test; server/requestRoutes.ts; server/requests.boundaries.test.ts. Legacy self-assigned security tests now explicitly construct legacy records and retain action rejection coverage.
- Regression evidence: two new tests failed before the changes and pass afterward. Required AGENTS business suite: 38/38 passing. Server suite: 12/12 passing. npm run lint passes. Build result recorded separately once complete.
- UI pre-submission route presentation, final-approver early signing/completion, cancellation, replacement, narrowed read access and summary downloads remain pending. No browser verification performed. Admin renderer and print CSS were not edited.
- npm run build passed (1688 modules); existing Vite future-config warning remains.

## PreciRoutes continuation — current implementation status

Owner clarified: separate explicit final-replacement permission; original signer remains until acceptance; processing team is explicitly selected per workflow. These details supersede the previously open policy questions. Implementation is complete for the described PEW Admin slice, with manual acceptance gates below still open.

- [x] R01 technical compatibility: JSON additions plus schema v3 route_administrators; Approved retained as completed-signing storage value; legacy override history untouched. Real roster/host configuration remains operational work.
- [x] R02 implementation/non-browser verification: submission invariants, deep workflow snapshot, named route preview before submission. Browser preview interaction remains unchecked.
- [x] R03 implementation/non-browser verification: final user signs early regardless of title; pending intermediate remains current; automatic closure after all signatures; final paper signature is retained when intermediate signs last.
- [x] R04 implementation/non-browser verification: existing revisioned override transport now invokes assigned-final completion, independent of allowDirectorOverride. Sign & Complete requires signature; Complete Route reuses the existing current-version final signature. Required reason, affected-signer confirmation, truthful bypass history, no repeated final signature.
- [x] R05 implementation/non-browser verification: correction resets all signatures, including early final signature; final approver can return/reject early; cancellation closes unfinished requester-owned routes. Terminal mutation matrix passes. Prior rejection tests adapted to the confirmed final-user policy; legacy helper tests retained.
- [x] R06 implementation/non-browser verification: explicit SQL-backed permission, local grant/revoke CLI, unsigned-only replacements, final acceptance/decline, former-reader history and revisioned actions. Pending proposals clear if route leaves pending state or old signer signs the proposed stage. Old final remains authorized until acceptance; acceptance conflicts with any intervening write.
- [x] R07 implementation/non-browser verification: company plus route authorization for API list/detail and mutations; UI lists/counts consume filtered records. Processing-team selection saved with workflow. Same-company unrelated HTTP reader denied; company access still required. Fresh authorization before attachment downloads, summary downloads and print.
- [x] R08 implementation: completed route summary is a separate UTF-8 text download with stage outcomes and full versioned history. Original form retains its existing print/PDF path and attachments download separately. Actual browser-generated output remains unchecked.
- [x] R09 automated regression: early final signing/open continuation, no-resign completion, correction reset, final actor independent of title, bypass identity, blank reason, duplicate completion, stale action 409, update failure rollback, cancellation terminal matrix, final replacement permission/acceptance and decline. Signature dialog refuses confirmation after a locally loaded route update; user must reopen after reviewing. Browser recovery interaction remains unchecked.
- [ ] R10 full acceptance: automated checks complete; browser/print/download gates and product-owner real pilot acceptance remain open.

Verification: required business suite plus routeAccess tests 42/42; server suite 12/12; API/session/draft coordinator 15/15; backup 1/1 (including preservation of explicit replacement permission); protected document 1/1; production startup 1/1. Total 72 passing. npm run lint and npm run build pass. Existing Node SQLite experimental and Vite future-config warnings remain. A Windows-encoding build failure in three edited UI files was corrected to UTF-8; final build succeeds.

Protected hashes unchanged: AdminWorkRequestDocument.tsx B2C2F09983EA66B0354E03AF51CED451D6EB213F1DBF0449829EB9C161601C51; src/index.css 6C6CCBE2CC4B16551AFA63C1CF6F5FB0B92D41D6981D9F857905BBFB9B46EB8D.

Remaining manual matrix: use Sign and Sign & Complete, complete after earlier signing, return/re-sign corrected version, cancel, propose/accept/decline final replacement, save/reload processing users, conflict/failure retention in the new dialogs, original PDF/summary/attachment downloads, print zoom/pagination/signature positioning. No browser checks performed in this continuation, preserving the earlier browser-deferral instruction. No real users, grants, routes or deployment were configured.
