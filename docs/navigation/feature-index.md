# PreciSign codebase map

Single feature/navigation map for the Antigravity handoff. Source verified for this handoff: `R-and-D-form`, HEAD `6c372e6ee58fe8a00af48868eb1f47f8040440c4`, **plus substantial tracked and untracked local work**. Paths below are repository-relative; symbols identify functions, classes or local bindings, not stable line numbers. Verify a row before editing. This document records static code evidence; no application tests or runtime/deployment checks were executed for this documentation update.

## Discover progressively

Pick a feature row -> locate the named symbol with `rg -n` in that file -> read its callers/imports and related test setup -> expand one dependency at a time. For mutations inspect both adapters and the shared rule; for authorization also inspect the Express handler. Full files are unnecessary starting context for most changes.

## Folder responsibilities

```text
src/main.tsx                     React root; loads index.css and workspace-ui.css
src/App.tsx                      mode/auth shell, MainLayout page dispatch, PDF entry
src/navigation/                  centralized URL contract and History API integration
src/context/                     AppContext orchestration, scoped data, actions, drafts
src/services/                    repository/adapters, action contracts, API session/drafts
src/types/                       RequestRecord, form/user/workflow/history models
src/utils/                       shared workflow/access/selection/processing rules, filters
src/components/layout/           sidebar/header/account menu, auth shell, showcase controls
src/components/dashboard/        inbox/list UI, activity and expanded request summary
src/components/create/           Admin/IT/financial editors, signer choices, attachments
src/components/library/          five current form entries and editor selection
src/components/review/           review/actions, progress banner, processing/finance panels
src/components/journey/          progress view model and request history presentation
src/components/document/         official form renderers, version resolver and PDF view/export
src/components/rnd/              R&D editor, fields, evaluation, template and preview
src/components/settings/         accounts, company branding, signing routes (+ legacy editor)
src/components/profile/          employee signature/profile management
src/components/archive/          archive/register UI
src/components/common/, src/components/modals/  dialogs, approval journey and signature confirmation
src/data/, config/               legacy/demo/showcase fixtures, company display, build flags
server/                          Express routes, validation/auth, SQLite, PDF, CLI tools
scripts/                         Vercel build and isolated browser verification scripts
docs/, tasks/                    guidance/specifications and historical verification notes
```

`src/theme/tokens.ts` also exists; inspect actual CSS imports before assuming it owns a styling rule. Tests live next to source (`*.test.ts`), including server suites; browser scripts live in scripts/. Runtime DB defaults to data/precisign.sqlite and backups to backups/; those ignored runtime locations are not source fixtures.

## Modes and contracts

| Mode | Entry and storage | Important distinction |
| --- | --- | --- |
| Connected (`VITE_DATA_MODE=api`) | App: ApiApp -> ApiSession -> ApiPreciSignRepository; Express + SQLite | No demo fallback. Login/session/password-change gate workspace mounting. API authenticates actor and rechecks permissions/revisions. |
| Ordinary demo (unset mode or demo without showcase flag) | AppProvider -> LocalActionRepository + LocalStoragePreciSignRepository | Legacy seed dataset/persona; browser storage. Same shared transition functions, not equivalent server security. |
| Showcase (`VITE_DATA_MODE=demo`, `VITE_SHOWCASE=true`) | config/demo.ts: isShowcaseBuild; data/demoDataset.ts: activeDemoDataset -> createShowcaseDataset | Isolated browser storage namespace, sample requests, persona switch/reset; ShowcaseAdministration simulates accounts/branding. No real signup/backend required. |

`IPreciSignRepository` is the base contract; `IAccountAdministrationRepository` extends it. `ApiPreciSignRepository` implements the administration contract plus `RequestActions`, but some direct persistence methods intentionally reject as unavailable. AppContext uses supported intent methods rather than assuming API/local CRUD methods are interchangeable. `apiTypes.ts` owns SubmitInput, ApprovalInput, VersionedRequest and RequestActions. Components must not bypass these boundaries.

## Feature -> entry symbol -> direct dependencies -> tests

Paths are exact. Semicolon-separated files in Dependencies are direct call/import boundaries to inspect next, not an instruction to load everything.

| Feature | Entry file and symbol | Dependencies / behavior | Related tests |
| --- | --- | --- | --- |
| URL routes | `src/navigation/pageRoutes.ts`: `pagePaths`, `formPaths`, `parsePageRoute`, `pageRouteHref` | `src/navigation/usePageNavigation.ts`: usePageNavigation -> AppContext navigation aliases -> App.MainLayout | src/navigation/pageRoutes.test.ts; scripts/verify-navigation.mjs; scripts/verify-navigation-connected.mjs |
| Context action/refresh | `src/context/AppContext.tsx`: `AppProvider`, `runAction`, `refreshRequests` | apiRepository/localActionRepository; apiTypes.ApiError; 409 refreshes latest record without retrying the action | src/context/AppContext.runAction.test.ts; src/services/apiRepository.test.ts |
| Sign-in/signup/session/recovery | `src/App.tsx`: `ApiApp`; `src/services/apiSession.ts`: `ApiSession` | apiRepository.login/getCurrentUser; server/app.ts: createApp; server/auth.ts: registerAccount, signIn, sessionUser, changePassword, resetPassword | src/services/apiSession.test.ts; server/server.test.ts; scripts/verify-navigation-connected.mjs |
| Account directory/grants | `src/components/settings/AccountDirectoryView.tsx`: `AccountDirectoryView` | repository.IAccountAdministrationRepository -> server/accountAdmin.ts: accountAdminRoutes; server/auth.ts: safeProfile; showcaseAdministration.ShowcaseAdministration in showcase | server/accountAdmin.test.ts; server/pilotAccess.test.ts |
| Signature/profile | `src/components/profile/UserProfileView.tsx`: `UserProfileView` | AppContext.updateUserSignature -> adapter -> server/profile.ts: profileRoutes, ownSignature; SignatureModal | server/profile.test.ts; src/services/repository.test.ts |
| Company/form access | `src/utils/companyAccess.ts`: `canUserAccessCompany`, `canUserStartForm`, `filterRequestsByScopeAndUser` | explicit companyGrants/formGrants first; absent explicit grants use legacy company/title fallbacks; used by context and server reads/mutations | src/utils/companyAccess.test.ts; server/pilotAccess.test.ts |
| Record access | `src/utils/routeAccess.ts`: `canReadPreciRoute` | canUserAccessCompany plus participants/former signers/pending replacement/processing/leadership; server/reads.ts: readRoutes and server/requestRoutes.ts enforce it | src/utils/routeAccess.test.ts; server/reads.test.ts |
| Dashboard/list filters | `src/components/dashboard/DashboardView.tsx`: `filteredRequests`; `src/utils/dashboardFilters.ts`: `filterDashboardRequests` | context.companyRequests -> pure filter with existing precomputed tab lists; actionQueue.needsMyAction supplies responsibility | src/utils/dashboardFilters.test.ts; src/utils/actionQueue.test.ts |
| Form selection/company | `src/components/library/FormsLibraryView.tsx`: `companyForms`, `FormsLibraryView`, `launch` | MainLayout.renderRequestEditor; RequestCompanyField; context.setSelectedRequestFormType/setActiveView | scripts/verify-navigation.mjs; server/multiCompanySubmission.test.ts |
| Create/Admin form | `src/components/create/CreateRequestView.tsx`: `CreateRequestView`, `handleTriggerSubmit`, `handleConfirmedSubmit` | AppContext.submitNewRequest; SignerChoices; SignatureModal; official preview. Administrative & Payment differs from legacy Admin Work Request. | server/requests.test.ts; server/requests.boundaries.test.ts |
| IT / financial creation | `src/components/create/ITRequestPreviewView.tsx`: `ITRequestPreviewView`; `src/components/create/FinancialRequestView.tsx`: `FinancialRequestView` | context.submitNewRequest; applySignerChoices; SupportingFiles/expenseEvidence; ITRequestDocument/FinancialRequestDocument | server/requests.test.ts; server/multiCompanySubmission.test.ts |
| Signer choices/configuration | `src/components/create/SignerChoices.tsx`: `SignerChoices`; `src/utils/signingSelection.ts`: `signerOptions`, `applySignerChoices` | routeForms.routeDraft/newSigningStep; settings/WorkflowSettingsView.WorkflowSettingsView -> server/workflows.ts: validateWorkflow, saveWorkflowConfig, workflowRoutes | src/utils/directoryRoutes.test.ts; server/workflows.test.ts |
| Drafts / unsaved work | `src/context/AppContext.tsx`: `saveDraft`, `useUnsavedWork` | services/draftCoordinator.ts: DraftCoordinator -> server/drafts.ts: readDraft, writeDraft, draftRoutes; usePageNavigation blocks leaving | src/services/draftCoordinator.test.ts; server/drafts.test.ts; scripts/verify-navigation.mjs |
| Ordinary/early final signing | `src/components/review/ReviewSignView.tsx`: `handleSignatureConfirmation`, `handleConfirmedApproval` | SignatureModal -> AppContext.approveRequest/runAction -> adapter.approve -> workflowEngine.approveRequestStage | src/components/review/ReviewSignView.confirmation.test.ts; src/utils/workflowEngine.test.ts; scripts/verify-review-ui.mjs |
| Completion/bypass | `src/components/review/ReviewSignView.tsx`: `handleFinalRouteCompletionSubmit` | context.directorOverrideAction -> adapter.override -> workflowEngine.completePreciRoute; routeReplacement.canCompleteWithOutstandingSteps | src/utils/workflowEngine.test.ts; src/components/review/ReviewSignView.confirmation.test.ts |
| Return/reject/correct/cancel | `src/utils/workflowEngine.ts`: `returnRequestForCorrection`, `rejectRequest`, `resubmitCorrectedRequest`, `cancelPreciRoute` | ReviewSignView handlers -> context.runAction -> adapters/server.requestRoutes; revised form/attachments and new documentVersion | src/utils/workflowEngine.test.ts; server/requests.test.ts |
| Replacement/backups | `src/utils/routeReplacement.ts`: `proposeSignerReplacement`, `acceptSignerReplacement`, `configuredReplacementIds`, `canProposeFinalReplacement` | workflowAdministration predicates; current assignment/config/history; adapters + server.requestRoutes | src/utils/directoryRoutes.test.ts; src/utils/routeAccess.test.ts; server/requests.test.ts |
| Remarks/history/progress | `src/components/journey/ApprovalJourneyPanel.tsx`: `ApprovalJourneyPanel`, `commentLabels` | utils/approvalJourney.ts: buildApprovalJourney; journey/RouteProgress.ts: signingProgress; review/DocuSignProgressBanner.tsx: DocuSignProgressBanner | src/components/review/ReviewProgress.test.ts; src/utils/approvalJourney.test.ts |
| Attachments | `src/components/review/ReviewSupportingFiles.tsx`: `ReviewSupportingFiles`; ReviewSignView: `visibleAttachments`, `handleDownloadAttachment` | Parent selects version and verifies access; create/SupportingFiles; server/reads.ts: readRoutes | src/components/review/ReviewSupportingFiles.test.ts; server/reads.test.ts |
| Processing / finance hold | `src/utils/routeProcessing.ts`: `canRecordProcessing`, `canRecordFinanceHold`, `recordProcessing`, `pendingProcessing` | review/RouteProcessingPanel, FinanceHoldPanel -> context.recordRouteProcessing -> adapters/server.requestRoutes | server/requests.test.ts |
| Document/history selection | `src/components/document/RequestDocument.tsx`: `getRequestDocumentVersion`, `RequestDocument` | ReviewSignView.selectedVersion; versionSnapshots/formData and attachmentVersions; dispatches official Admin/AdministrativePayment/IT/Financial/R&D renderers | server/reads.test.ts (access, not historical visual fidelity); src/components/document/AdminWorkRequestDocument.test.ts |
| Connected PDF | `server/documentPdf.ts`: `renderDocumentPdf` | reads.readRoutes -> /document-export -> RequestPdfView -> getRequestDocumentVersion -> RequestDocument; cookie and revision checks | server/reads.test.ts; scripts/verify-navigation-connected.mjs (denial only) |
| Demo PDF | `src/components/document/downloadDemoPdf.tsx`: `createDemoDocumentPdf` | getRequestDocumentVersion + RequestDocument; browser raster export; distinct from server PDF | scripts/verify-showcase.mjs |
| Company branding | `src/components/settings/CompanyBrandingView.tsx`: `CompanyBrandingView` | admin adapter -> server/companyBranding.ts: companyBrandingRoutes; CompanyLogoSlot; submission copies company name/logo into formData | server/multiCompanySubmission.test.ts; server/rnd.test.ts |
| R&D form/evaluation | `src/components/rnd/RndRequestView.tsx`: `RndRequestView`; `src/utils/rndWorkflow.ts`: `validateRnd`, `saveRndEvaluation`, `rndEvaluationComplete` | RndFields; RndEvaluationPanel; RndRequestDocument/documentTemplate; AppContext.saveRndEvaluation -> adapters/server.requestRoutes; workflowEngine checks evaluation | server/rnd.test.ts; src/data/showcaseData.test.ts |
| Backend/validation/storage | `server/app.ts`: `createApp`; `server/requestRoutes.ts`: `requestRoutes` | auth middleware -> requestValidation (fields/form/bytes/attachments) -> shared rules -> db.transaction; terminal errors handled by createApp | server/server.test.ts; server/requests.test.ts; server/requests.boundaries.test.ts |
| SQLite / backup | `server/db.ts`: `openDatabase`, `transaction`; `server/backup.ts`: `copyDatabase` | built-in node:sqlite; startup server/index.ts supplies DATABASE_PATH. openDatabase can migrate immediately. | server/backup.test.ts; server/startup.test.ts |

## Current behavior that changes how you edit

- Legal companies are PEW/ICCL/FSG; PEG aggregates authorized company records. Company display names come through `src/data/companies.ts`; do not copy an older document's names as authoritative branding.
- Form-start grants do not grant signing and are not required merely to sign an assigned route. Ordinary signing requires current assignment; final assignee can act early. Job titles still affect legacy company access/leadership reads, but do not substitute for assignment. Super-admin account management is separate.
- Final completion requires open status, non-requester final assignment, company access, reason and a recorded final signature. Outstanding mustSign stages block completion; other outstanding signatures require configured bypass authority and become Bypassed. Internal Approved means signing complete; processing/payment is separate.
- Backup modes differ: supported configured-backup routes outside company-directory selection activate allowed replacements immediately using canReplaceFinalApprover; company-directory/legacy final replacement creates a pending transfer requiring acceptance. Directory mode also allows the qualifying previous signer/requester path in canProposeFinalReplacement. Inspect the actual branch; do not assume every backup always requires acceptance.
- Review signing remarks live in the Request Actions textarea. Confirmation has no second remarks field; exact saved signature can be selected alongside Type/Draw/Upload. Ordinary approval sends comment into step/history with the document version. An omitted comment currently receives the workflowEngine default "Checked and approved."; this is application-generated stored text, not necessarily words typed by the signer. Cancel/failure retain the typed remark. Sign & Complete sends its required reason; a separate optional signing remark is NOT currently persisted by that action.
- The review history is newest-first, with full visible comments and action-specific labels; stored history is not reversed. It spans versions. Selecting an old document does not turn the progress banner into that version's frozen historical journey. Missing image labels do not repair evidence.
- General historical-signature preservation is incomplete here. getRequestDocumentVersion reads existing snapshots/attachmentVersions; ordinary approval/return/resubmission can lose an old approval image in the document snapshot. Never reconstruct it from the user's current signature. R&D has its own rndSignedStates/evaluation behavior, not the general repair.
- RequestRecord, form data, history and attachment data URLs are serialized in the SQLite requests.record JSON (with indexed/scalar metadata and revision). User signatures, company logos, accounts/access, sessions, workflows and drafts have separate tables. There is no external attachment-object-storage integration. Current schemaVersion is 9; inspect migrations rather than issuing schema guesses. Transactions use BEGIN IMMEDIATE and rollback on error.

## Three actual execution paths

### 1. Create and submit

Dashboard shortcut/FormsLibraryView.launch -> context form/view setters -> usePageNavigation -> /forms/:form/new -> App.MainLayout.renderRequestEditor -> appropriate editor and SignerChoices -> SignatureModal confirmation -> AppContext.submitNewRequest.

Connected: ApiPreciSignRepository.submit -> POST /api/requests -> createApp authentication/origin checks -> requestRoutes validates form, grants, files, workflow version and signer choices -> transaction rechecks actor/access, calls createNewRequestRecord, inserts JSON/revision -> returns record -> context stores it, clears navigation guard -> editor openReviewRequest -> request URL.

Demo/showcase: LocalActionRepository.submit serializes work, resolves demo actor, applies selection and the same createNewRequestRecord -> LocalStoragePreciSignRepository.createRequest -> same context/UI continuation. Existing draft coordination applies to the legacy Admin Work Request; do not assume every modern editor autosaves.

### 2. Sign and record remarks

ReviewSignView.canSign/onLatestVersion -> handleApproveClick captures request.updatedAt -> SignatureModal selects/confirms image -> onConfirm passes signingRemark -> handleSignatureConfirmation rejects stale confirmation -> handleConfirmedApproval -> AppContext.approveRequest -> runAction adds expectedRevision -> adapter.approve.

Connected: POST /api/requests/:id/approve -> requestRoutes validates comment/image, transaction rechecks session, record visibility and revision -> approveRequestStage validates assignment/company/state and stores signature/comment/history -> revisioned JSON update. Demo: LocalActionRepository.approve -> change -> same shared rule -> local revision update. runAction replaces returned data; conflict refreshes without retrying. Success clears remark; ApprovalJourneyPanel renders the persisted history. Completion uses handleFinalRouteCompletionSubmit -> directorOverrideAction -> override -> completePreciRoute, not directorOverrideApprove.

### 3. Open a URL deep link

/requests/:id -> App chooses mode; connected ApiApp/ApiSession retains URL through login/password-change -> AppProvider/usePageNavigation parses route -> once initial data is ready, context resolves selectedRequestId through the action repository -> canReadPreciRoute -> stores permitted record and selects its legal company -> requestRouteStatus ready -> MainLayout mounts ReviewSignView. Missing/denied reads use the same Request unavailable page; connection/server failures offer a separate retry.

Sidebar handleNav and dashboard/archive request clicks reuse context navigation methods. pushState/popstate carry page identity; unsaved editable-state snapshots produce Stay/Leave, with native beforeunload on refresh/close. Company scope/table search/sort are not URL parameters. The guard is conservative and can still warn after a legacy draft autosaves; Forward does not restore discarded form inputs.

## URL contract

`/dashboard` (also `/`), `/forms`, `/forms/:form/new`, `/requests/:id`, `/requests?filter=pending|my|all|approved` (one filter value), `/archive`, `/settings/profile` (also `/settings`), `/settings/signing-routes`, `/settings/users`, `/settings/branding`.

Form slugs: administrative-payment, it-request, cash-voucher, expense-claim, rnd, legacy admin-work. `/rnd` remains an R&D editor alias in all modes. Unknown URLs show Page not found. Page guards use existing account/workflow/form predicates; they are not backend authorization.

Exceptions preserved in App.tsx: connected `/document-export?request=...&version=...` bypasses the workspace shell; reset tokens use `#reset=...` and are consumed/removed by ApiApp. Do not introduce competing hash routing. Vercel rewrites and Express production SPA fallback support deep paths in configuration; no live deployment was verified here.

## Verification: pick by task

Node engine: package.json requires >=24.11.0 <25. Existing dependencies only. `npm run lint` is tsc --noEmit, not ESLint. No global npm test script.

```powershell
# Locate only the relevant symbol/tests; replace the example symbol as needed.
rg -n 'handleConfirmedApproval' src/components/review/ReviewSignView.tsx
rg --files src server -g '*.test.ts'
# Required baseline for implementation changes:
node --import tsx --test src/utils/approvalJourney.test.ts src/utils/workflowEngine.test.ts src/services/repository.test.ts src/utils/companyAccess.test.ts
# Routing / local orchestration / review UI:
node --import tsx --test src/navigation/pageRoutes.test.ts src/context/AppContext.runAction.test.ts src/components/review/ReviewSignView.confirmation.test.ts src/components/review/ReviewProgress.test.ts src/components/review/ReviewSupportingFiles.test.ts
# Build without replacing an existing dist:
$buildDestination = Join-Path ([System.IO.Path]::GetTempPath()) ('precisign-check-' + [guid]::NewGuid())
npm run build -- --outDir $buildDestination
```

Adapter changes: npm run test:api. Server changes: inspect fixture isolation before npm run test:server; that explicit script omits separate startup/backup/R&D suites. Database/backup: npm run test:backup. Official byte integrity: npm run test:document (diagnose LF/CRLF before blaming layout). Tests may extract handler source text; a parser/harness error is not permission to weaken assertions.

Browser scripts: verify-navigation.mjs and verify-review-ui.mjs default to isolated showcase localhost:3198; launch `npm run dev:showcase -- --port=3198 --strictPort`. verify-navigation-connected.mjs requires API-mode Vite at localhost:3199 and intercepts all API requests with synthetic fixtures (run with `node --import tsx scripts/verify-navigation-connected.mjs`). Do not point scripts at real accounts. Existing browser tooling uses installed Edge on Windows; PDF rendering requires a compatible browser. These fixtures do not certify a real deployment. See [routing details](frontend-routing.md) or [verification guide](../testing/verification.md) only when needed; their recorded past results are not a fresh test run.

## Local handoff state, outdated guidance and gaps

- Confirmed branch/HEAD above; git status currently includes modified application/config/package files and untracked navigation, showcase adapters/data, refactor utilities/components/tests, browser scripts and docs. Routing, visible history/remarks, review polish and refactors 01-05 exist locally; they are not all in HEAD. A separate clone/push of HEAD alone omits these dependencies. No clean transfer was produced by this task.
- Refactors present: handleFinalRouteCompletionSubmit naming; dashboardFilters pure extraction; ReviewSupportingFiles with parent-owned download; runAction local clarity; handleSignatureConfirmation dispatch. Public directorOverrideAction/override names remain. Source search finds directorOverrideApprove only in its definition and legacy domain tests.
- Separate historical-integrity-stage1 worktree is dirty: requestRoutes, workflowEngine, routeProcessing, types and document/review renderers differ; historicalEvidence.ts and historicalRendering.test.ts exist there but not here. No repair guarantees transfer by mentioning that branch, and its files must not be copied automatically. Its tests were not executed/validated here.
- ARCHITECTURE.md still labels ApiPreciSignRepository future; it is implemented. BUSINESS_RULES.md retains title-based override descriptions and calls grants proposed. PRECIROUTES_SPEC.md is an agreed target with older scope/baseline statements, not an implementation checklist. Use the current source rules above; seek policy approval for conflicts rather than editing behavior to match stale prose.
- navigation/baseline.md is an older inspection corpus, not measured AI efficiency. handoff/stabilization*.json/md precede later routing/review edits: their hashes/status/next-task recommendations are historical, not the current baseline. Older expandable-remarks/state-only-navigation descriptions are superseded by this map/current source. Existing detailed docs are preserved, not silently rewritten.
- Historical image repair, optional remarks on final completion, real email delivery and hosting readiness must not be inferred from UI examples or plans. Current attachments are JSON data URLs, not Supabase/R2 storage. Runtime backups/restores, live deployments and employee onboarding were not verified in this documentation-only task. Source fingerprints and symbol/link checks are not behavioral tests.
