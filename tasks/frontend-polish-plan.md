# PreciSign frontend implementation plan

Baseline: local `Pre-Production`, HEAD `819d59e` at inspection. The working tree already contains edits to roles, signer selection, priority, and other areas. Build on the working tree. Use `git status --short --branch` and inspect the diff for each file before changing it. Keep work in three slices.

Read [AGENTS.md](../AGENTS.md) and [PreciRoutes rules](../docs/PRECIROUTES_SPEC.md). Keep components on the existing AppContext/repository paths. Preserve backend authorization, signing and replacement rules, historical records, the review screen's `DocuSignProgressBanner`, and the official documents, including text, print layout and signature positions. No new dependency is needed.

Use the existing navy/teal `workspace-panel`, `workspace-control`, and `workspace-primary` styles. Put new shared screen styles in `src/workspace-ui.css`, where `preci-press` and reduced-motion rules already live. Use the installed better-layout and better-ui guidance. Keep tab switches, row disclosures, and ring values immediate. If confirmation dialogs need an entrance, use a brief opacity transition (150 ms or less), with instant display under reduced motion. Retain visible keyboard focus and use labels and counts alongside color.

## 1. Dashboard density, rings, and responsive request list

**Result.** Expanding one request shows the next action and signing steps without taking over the list. Full history stays one click away. The Activity overview replaces Quick actions and At a glance.

**Files.** Change `src/components/dashboard/DashboardView.tsx` and `src/workspace-ui.css`. Reference `src/utils/approvalJourney.ts` (`buildApprovalJourney`), `src/utils/actionQueue.ts` (`needsMyAction`), `src/components/common/ApprovalJourneyModal.tsx`, and `src/components/journey/ApprovalJourneyPanel.tsx`. Leave the detailed journey and `src/components/review/DocuSignProgressBanner.tsx` in their existing review paths.

1. Replace only the expanded row's full `ApprovalJourneyPanel` with a compact summary. Use `actionFor(req)` for the action and `buildApprovalJourney(req, currentUser.id)` for milestones and stage counts. Use one summary strip with status, action when applicable, and signed/total approval steps. List each signer on a short line with name, role, and text status. Distinguish bypassed steps from signed steps and keep processing separate from signing. Use modest padding and wrapping for names. Put comments, timestamps, and the full Audit History behind **View journey & history**, using the existing `selectedJourneyRequest` modal. Keep the existing `openReviewRequest` action. Give the disclosure an accurate name and `aria-expanded`. If reusing the journey modal from a new trigger, ensure Escape closes it and focus returns to that trigger; reuse the existing native-dialog pattern from the account editor if needed.
2. Replace both bottom panels with one **Request activity** panel. Use three concentric SVG rings for **Needs my action**, **Returned**, and **Signing completed**, backed by `pendingForMeRequests`, `returnedRequests`, and `approvedRequests`. Arc length = count / `companyRequests.length`, or zero if empty. All numbers use the active company or Group View, before list search/filters. Show exact counts and label the denominator **Requests in this view**. State that categories can overlap. Put labeled buttons beside the decorative SVG, using `selectTab` and `aria-pressed`; return the user to the filtered list heading without forced smooth scrolling. Keep **My requests** available in the existing tabs. Do not use targets, streaks, or a stacked total.
3. Wrap the request-view buttons and filter controls. The table currently has a fixed 1120px minimum. Use a content-width breakpoint so the open sidebar also triggers the compact layout. Keep the table and Columns controls at wider widths. At compact widths render a stacked list from the same `displayedRequests` and shared summary/actions, with subject/ID, company, status, next action, and an expansion button. Hide the unused presentation from focus and assistive technology, and use unique disclosure IDs per layout. Hide table-only controls in the compact view.

**Check.** In the desktop browser pass, expand a pending sample row, open/close full history by keyboard, then activate one ring and verify the list and count agree. In the narrow pass, check tabs wrap and the row action stays visible without page-level horizontal scrolling. Run the shared checks below. **Dependency:** one visible pending fixture; seeded demo records are sufficient for this slice alone.

## 2. Consistent request editors and signer validation

**Result.** All four current forms follow the same flow: company and fields, supporting files where already supported, signers, and send. Employees can find and fix the first error and switch between editing and preview without losing entries.

**Files.** Change `src/components/create/CreateRequestView.tsx` (Administrative & Payment branch), `ITRequestPreviewView.tsx`, `FinancialRequestView.tsx` (Cash Voucher and Expense Claim), `SignerChoices.tsx`, `RequestCompanyField.tsx`, and `src/workspace-ui.css`. Trace entry via `MainLayout.renderRequestEditor` in `src/App.tsx` and `FormsLibraryView.tsx`. Reference `src/utils/signingSelection.ts`, `expenseEvidence.ts`, and the print selectors in `src/index.css` and `src/components/document/ITRequestDocument.css`.

1. Align headings, field groups, attachment styling and submit labels with existing controls. Keep form-specific state and validation in the current editors. Preserve Expense Claim receipt links and removal behavior. Use the Admin editor's edit/preview switch as the shared pattern. Show both panes when the content area is wide enough; at narrow widths show one at a time, keeping both mounted so form values and files survive. Keep existing print ancestor classes and ensure the preview is visible in print even when Editor is selected. Scope responsive visibility to screen media. Avoid changing official renderers.
2. Put the single missing-route or no-eligible-signer explanation in the signer area. `RequestCompanyField` keeps company selection and company-access guidance; remove repeated selected-route warnings from it and the Admin editor banner. Give authorized workflow admins the existing route-settings shortcut when applicable. For a missing company, show company-selection guidance first. Keep one message for each blocker.
3. In `SignerChoices`, label required primary choices, optional steps, and secondary alternates. Keep dropdowns restricted to configured eligible users and require the current explicit selection. Show signing order from the validated route. Explain that a secondary acts only after an authorized replacement is accepted. Preserve current optional/backup defaults and clearing behavior. When excluding selected primaries from secondary options, derive exclusions from explicit selections even if another required dropdown is incomplete.
4. In each editor's current submit/review handler, collect field errors in screen order. Use stable IDs, `aria-invalid` and `aria-describedby`. Put messages under the affected controls and focus the first invalid control after revealing Editor; for a disabled or unavailable signer, focus its explanatory region. Keep network and revision errors at form level. Retain existing submit handlers and server checks.

**Check.** In the narrow browser pass, open Administrative & Payment with a configured route. Try sending with priority or signer missing, verify focus, select a primary and check signing order. Switch preview and back, verify entries remain, and check print preview once for intact A4 and signature placement. Use the same shared checks. If shared signer behavior or request payload changes, also run `npx tsx --test server/requests.test.ts server/multiCompanySubmission.test.ts`. **Dependency:** use connected synthetic data with form grants and a populated route. Demo may lack routes for current forms.

## 3. Staff roles, branding feedback, and draft dialogs

**Result.** Super admins can understand staff permissions and preview a logo before saving. Employees see exactly what clearing or reloading a draft will replace.

**Files.** Change `src/components/settings/AccountDirectoryView.tsx` (`AccountEditor`), `CompanyBrandingView.tsx` (`CompanyLogoEditor`), `src/components/create/CreateRequestView.tsx`, and shared screen styles if needed. Reference `src/utils/routeProcessing.ts`, `src/services/repository.ts`, and `AppContext.clearDraft/reloadDraft`. Keep repository calls and access checks intact.

1. In the directory, distinguish the **Super admin** badge from staff roles. In the role editor, explain that IT, Finance and Admin processing also require company access and workflow team assignment. Explain that a staff role does not by itself grant account administration or signing authority. Use current role options and the existing `updateAccount` call.
2. In branding, display PNG/JPEG and 2 MiB limits beside the input. Show the selected file as **Unsaved preview** with a filename and a discard action. Use a temporary object URL, revoking it on replacement, discard, successful save and unmount. Keep the saved logo visible again on discard, preserve the selected file on save failure, and use the repository response as the saved image. Announce success and errors accessibly.
3. Replace the two `confirm()` calls in `CreateRequestView` with one native dialog driven by `clear` or `reload` state. Explain that the current form entries will be cleared, or replaced by the saved draft. Preserve existing draft write/load calls and error handling. Focus Cancel first, restore focus when possible, and disable duplicate actions during a pending clear. Keep in-progress form fields if clearing fails. The legacy draft conflict path keeps its current loading and retry behavior.

**Check.** In the desktop pass, open the role editor and check its explanation. Select a synthetic logo, confirm unsaved preview and discard it. Open Clear Form and cancel, verifying a typed entry survives. Inspect the reload dialog via the same implementation; reproduce a draft conflict only if draft behavior changes. Run the shared checks. If draft coordination changes, also run `npx tsx --test src/services/draftCoordinator.test.ts server/drafts.test.ts`. **Dependency:** connected synthetic super admin for directory and branding.

## Execution and verification

Implement dashboard → editors → administration and recovery. Do quick local checks while editing. Run the following once after the final slice, and rerun only the relevant check after a failure or follow-up change:

```powershell
npm run lint
npm run build
npx tsx --test src/utils/approvalJourney.test.ts src/utils/workflowEngine.test.ts src/services/repository.test.ts src/utils/companyAccess.test.ts
```

Run `npm run test:document` if preview or print wrappers change. Use two consolidated browser passes: desktop around 1280px with the sidebar open, and narrow around 390px. Follow the per-slice checks above using a single synthetic setup from [Local pilot](../docs/LOCAL_PILOT.md). Check one keyboard path and reduced-motion behavior across those passes. Leave the existing local session running. Add automated tests only for a behavior change that existing tests would miss. Record skipped checks and why.

No decision is required to start. The proposed rings use the three categories above as shares of visible requests. Change the categories now only if you want a different dashboard emphasis.

