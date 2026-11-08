# Navigation baseline — Checkpoint 8.1

Model-productivity baseline: **NOT MEASURED**. This is source verification by the already-informed session, not an independent model benchmark. Token savings, independent search latency, model comparison and usage metrics are unavailable. No tests were executed for this documentation task.

Initial commands: `git branch --show-current`, `git log -1 --oneline`, `git status --short`, `rg --files docs`, targeted `rg -n` symbol searches, and `rg --files src server -g "*.test.ts"`. No equivalent navigation index was found by the docs filename search. Existing audit prose was not re-investigated.

## B1

Starting search: `rg -n "approveRequestStage" src/utils/workflowEngine.ts`. Correct symbols, downstream paths and tests: see the corresponding index rows.

Reference corpus: 3 unique files, 785 total source lines, 37242 bytes. These are reproducible whole-file corpus sizes, **not measured human/model lines consumed**. Files: `src/utils/workflowEngine.ts`, `src/utils/companyAccess.ts`, `src/utils/routeReplacement.ts`.

Navigation detour: none recorded in the targeted searches; prior session knowledge biases this result. Unresolved: runtime protections and test coverage were not re-executed. Search calls per independent task: NOT MEASURED; searches were batched and shared.

## B2

Starting search: `rg -n "filteredRequests|companyRequests" src/components/dashboard/DashboardView.tsx src/context/AppContext.tsx`. Correct symbols, downstream paths and tests: see the corresponding index rows.

Reference corpus: 4 unique files, 1395 total source lines, 72533 bytes. These are reproducible whole-file corpus sizes, **not measured human/model lines consumed**. Files: `src/components/dashboard/DashboardView.tsx`, `src/context/AppContext.tsx`, `src/utils/companyAccess.ts`, `src/utils/routeAccess.ts`.

Navigation detour: none recorded in the targeted searches; prior session knowledge biases this result. Unresolved: runtime protections and test coverage were not re-executed. Search calls per independent task: NOT MEASURED; searches were batched and shared.

## B3

Starting search: `rg -n "handleConfirmedApproval|approveRequest|runAction|transaction" src server`. Correct symbols, downstream paths and tests: see the corresponding index rows.

Reference corpus: 6 unique files, 2073 total source lines, 127039 bytes. These are reproducible whole-file corpus sizes, **not measured human/model lines consumed**. Files: `src/components/review/ReviewSignView.tsx`, `src/context/AppContext.tsx`, `src/services/apiRepository.ts`, `src/services/localActionRepository.ts`, `server/requestRoutes.ts`, `server/db.ts`.

Navigation detour: none recorded in the targeted searches; prior session knowledge biases this result. Unresolved: runtime protections and test coverage were not re-executed. Search calls per independent task: NOT MEASURED; searches were batched and shared.

## B4

Starting search: `rg -n "canRecordFinanceHold|canRecordProcessing" src/utils/routeProcessing.ts`. Correct symbols, downstream paths and tests: see the corresponding index rows.

Reference corpus: 2 unique files, 259 total source lines, 20405 bytes. These are reproducible whole-file corpus sizes, **not measured human/model lines consumed**. Files: `src/utils/routeProcessing.ts`, `server/requestRoutes.ts`.

Navigation detour: none recorded in the targeted searches; prior session knowledge biases this result. Unresolved: runtime protections and test coverage were not re-executed. Search calls per independent task: NOT MEASURED; searches were batched and shared.

## B5

Starting search: `rg -n "getRequestDocumentVersion|renderDocumentPdf" src server`. Correct symbols, downstream paths and tests: see the corresponding index rows.

Reference corpus: 5 unique files, 1179 total source lines, 68147 bytes. These are reproducible whole-file corpus sizes, **not measured human/model lines consumed**. Files: `src/components/document/RequestDocument.tsx`, `src/components/review/ReviewSignView.tsx`, `src/components/document/RequestPdfView.tsx`, `server/reads.ts`, `server/documentPdf.ts`.

Navigation detour: none recorded in the targeted searches; prior session knowledge biases this result. Unresolved: runtime protections and test coverage were not re-executed. Search calls per independent task: NOT MEASURED; searches were batched and shared.

## Validation and comparison protocol

All 19 primary index rows, their downstream file/symbol strings, and listed test/script paths passed a source existence/text check. This verifies symbol presence, not runtime correctness or test assertions. Historical helper symbols were separately located in the remediation worktree. Source hashes before/after documentation generation matched.

For a real comparison, use two fresh sessions per B1–B5 with identical model, reasoning setting, tool access, immutable source snapshot and prompt. One arm receives the index; the control does not. Disable inherited chat context and cross-task memory. Randomize order; record tool calls, bytes returned, unique files, elapsed time, correctness against this reference and actual provider token metrics if available. Repeat tasks across multiple sessions; report individual results, median and failures. Until then no efficiency gain is demonstrated.

## Proposed AGENTS.md addition (not applied)

Before searching: identify the task type; consult `docs/navigation/feature-index.md`; open and verify the exact entry symbol; read direct dependencies and relevant tests; expand search only when the map is incomplete or a boundary is crossed. The index never grants permission to change protected or high-risk files. Follow the explicit PreciRoutes precedence note for legacy-rule conflicts; raise unresolved product-policy differences rather than altering rules.

Existing authority wording is contradictory as detailed in the index. This proposal does not rewrite business policy.

## NEXT SAFE CODE REFACTOR

Extract the dashboard's existing `filteredRequests` calculation into one pure `filterDashboardRequests` function in `src/utils/dashboardFilters.ts`; keep DashboardView responsible for state and rendering. Affected: DashboardView, the new utility and focused tests. Benefit: B2 has a direct rule entry without loading the component. Preserve current filter order, sorting and counts; never move server permission decisions into this helper. Test combinations of search, company-scoped inputs, tabs, form/status filters and sorting against existing behavior, then run AGENTS.md checks and TypeScript. Roll back only the extraction commit. Stop if extraction changes access policy, requires repository changes or produces count/order differences. This is a candidate supported by the observed inline rule; the prior audit's exact recommendation was not reread or independently verified in this checkpoint. Do not implement yet.

## Pre-change working-tree inventory

Branch `Demo-build`, commit `8a601c3`. Existing dirty files below are outside this documentation change; no commit, merge or deployment performed.

```text
 M .gitignore
 M package.json
 M scripts/build-vercel.mjs
 M server/accountAdmin.ts
 M server/reads.ts
 M server/requestRoutes.ts
 M server/requestValidation.ts
 M server/workflows.ts
 M src/App.tsx
 M src/components/create/SignerChoices.tsx
 M src/components/dashboard/DashboardView.tsx
 M src/components/document/RequestDocument.tsx
 M src/components/document/downloadDemoPdf.tsx
 M src/components/layout/AppHeader.tsx
 M src/components/library/FormsLibraryView.tsx
 M src/components/modals/SignatureModal.tsx
 M src/components/review/ReviewSignView.tsx
 M src/components/settings/AccountDirectoryView.tsx
 M src/context/AppContext.tsx
 M src/data/seedData.ts
 M src/services/apiRepository.ts
 M src/services/apiTypes.ts
 M src/services/localActionRepository.ts
 M src/services/repository.ts
 M src/types/index.ts
 M src/utils/approvalJourney.ts
 M src/utils/routeForms.ts
 M src/utils/routeReplacement.ts
 M src/utils/workflowEngine.ts
 M vite.config.ts
?? .env.showcase
?? docs/RND_FORM.md
?? docs/SHOWCASE.md
?? docs/navigation/
?? scripts/verify-showcase-build.mjs
?? scripts/verify-showcase.mjs
?? server/rnd.test.ts
?? src/components/layout/ShowcaseBar.tsx
?? src/components/rnd/
?? src/config/
?? src/data/companies.ts
?? src/data/demoDataset.ts
?? src/data/showcaseAssets.json
?? src/data/showcaseBase.ts
?? src/data/showcaseData.test.ts
?? src/data/showcaseData.ts
?? src/services/showcaseAdministration.ts
?? src/utils/rndFields.ts
?? src/utils/rndWorkflow.ts
```

## Resumed checkpoint verification

Current branch is `R-and-D-form`, commit `8a601c3`; the earlier inventory above records the interrupted attempt on Demo-build. Both branches point to the same committed baseline; existing uncommitted work carried across the branch switch. No separate clean worktree was created: only these two new documentation files are changed by this checkpoint; existing source edits are preserved.

Five verified entry paths:

- B1: `workflowEngine.approveRequestStage` → assigned step versus final-index selection → `canUserAccessCompany`; HTTP caller is `requestRoutes`, which resolves the authenticated actor and expected revision.
- B2: `DashboardView.filteredRequests` → `AppContext.companyRequests` → `filterRequestsByScopeAndUser` and `canReadPreciRoute`.
- B3: `ReviewSignView.handleConfirmedApproval` → `AppContext.approveRequest` / `runAction` → `ApiPreciSignRepository.approve` → `requestRoutes` → `transaction` → `approveRequestStage` → SQL update. Demo branches into `LocalActionRepository.approve` / `change` and browser persistence instead.
- B4: `canRecordFinanceHold` / `isFinanceHeld` and `canRecordProcessing` / `pendingProcessing` / `canJoinProcessingTeam` → `recordProcessing` → API transaction or demo action adapter.
- B5: `getRequestDocumentVersion` selects screen/PDF data; `readRoutes` authenticates and authorizes the export → `renderDocumentPdf` loads `RequestPdfView` with the session cookie → resolver and renderer; read/revision checks run again before response.

No missing primary or downstream symbol was found in the 19-row index text validation. Test files exist; their coverage claims and runtime behavior were not retested. Historical remediation remains explicitly worktree-specific.

Current working-tree inventory (all application edits predate this resumed documentation-only checkpoint):

```text
 M .gitignore
 M package.json
 M scripts/build-vercel.mjs
 M server/accountAdmin.ts
 M server/reads.ts
 M server/requestRoutes.ts
 M server/requestValidation.ts
 M server/workflows.ts
 M src/App.tsx
 M src/components/create/SignerChoices.tsx
 M src/components/dashboard/DashboardView.tsx
 M src/components/document/RequestDocument.tsx
 M src/components/document/downloadDemoPdf.tsx
 M src/components/layout/AppHeader.tsx
 M src/components/library/FormsLibraryView.tsx
 M src/components/modals/SignatureModal.tsx
 M src/components/review/ReviewSignView.tsx
 M src/components/settings/AccountDirectoryView.tsx
 M src/context/AppContext.tsx
 M src/data/seedData.ts
 M src/services/apiRepository.ts
 M src/services/apiTypes.ts
 M src/services/localActionRepository.ts
 M src/services/repository.ts
 M src/types/index.ts
 M src/utils/approvalJourney.ts
 M src/utils/routeForms.ts
 M src/utils/routeReplacement.ts
 M src/utils/workflowEngine.ts
 M vite.config.ts
?? .env.showcase
?? docs/RND_FORM.md
?? docs/SHOWCASE.md
?? docs/navigation/
?? scripts/verify-showcase-build.mjs
?? scripts/verify-showcase.mjs
?? server/rnd.test.ts
?? src/components/layout/ShowcaseBar.tsx
?? src/components/rnd/
?? src/config/
?? src/data/companies.ts
?? src/data/demoDataset.ts
?? src/data/showcaseAssets.json
?? src/data/showcaseBase.ts
?? src/data/showcaseData.test.ts
?? src/data/showcaseData.ts
?? src/services/showcaseAdministration.ts
?? src/utils/rndFields.ts
?? src/utils/rndWorkflow.ts
```
