# Desktop UI proposal — implementation checklist

Planning only. Preview docs/desktop-mockups.html by double-clicking it. Synthetic examples and in-memory interactions; no API or saved records. Review #dashboard and #review. Compact-table toggle tests density. The questions are whether the action hierarchy is understandable and whether the highlighted form/table patterns fit daily use.

The official A4 renderer and finalized approval banner are intentionally represented as placeholders. Reuse the existing real components during approved implementation. This preview does not authorize production UI changes.

- [ ] Review dashboard: enabled-form shortcut, form library, company scope, request columns and next actions.
- [ ] Review final-approver screen: Sign versus Sign & Complete, then Complete Route after signing. Confirm bypass explanation is clear.
- [ ] Decide mandatory versus optional early-action counts. Prototype counts represent mandatory signature/assignment tasks; final review remains available but needs a settled counting rule.
- [ ] Confirm user-facing completion terminology and exceptions to AGENTS styling safeguards. No exception assumed for A4 or approval banner.
- [ ] Batch 1: unify queue predicate/counts; remove legacy override text; hide empty replacement choices; improve dialog focus/dismissal. Verify normal/final/replacement personas and conflict retention.
- [ ] Batch 2: reuse DashboardView, FormsLibraryView and existing table structures for enabled-form access, shared filters, explicit responsibility and row actions. No personalized usage ranking without supporting data.
- [ ] Batch 3: field-linked errors and draft feedback; all-version selector; completed form/summary/attachment retrieval. Preserve repository boundary and version-specific files.
- [ ] Verify desktop at agreed company resolutions with synthetic connected data; test keyboard/focus/error states, permission boundaries and stale saves; run required AGENTS tests, type check and build after implementation.

Priority defaults remain a separate business decision. Forms beyond the PEW Admin pilot are excluded. This artifact is a design exploration, not browser validation of the actual product or a functioning replacement screen.

## Live implementation — 4 November 2026

Owner authorized selected navy dashboard direction, sidebar/header/dashboard scope and signer stepper. Added actionQueue shared by dashboard/sidebar/header, excluding an already signed final approver from optional-action counts; regression test added. Sidebar Signature & Profile is outside the Administration collapse and opens the existing signature configuration screen. Dashboard adds metrics strip, action spotlight, form/draft shortcuts, form/status filters and signer names alongside existing compact stepper/detail modal. No repository bypass or backend changes.

Checks: required AGENTS suite plus actionQueue test 41/41; type check and production build pass. Browser on isolated demo origin verified updated dashboard, matching displayed counts, named signer chains and successful Signature & Profile navigation. Connected API interactions and wide-desktop visual comparison remain unverified. Protected renderer and src/index.css hashes match baseline. Source backup: C:/Users/HP/Desktop/precisign demo/ui-backup-20261104-213735.

## Table and stepper refinement

Owner requested clearer columns and signer progress. CompactApprovalChain now uses a native keyboard-operable button with individually named nodes and concise states, separate approval signature/bypass counts and explicit journey link. Requester submission remains separate from approval count. Dashboard uses shorter headers, readable spacing, nonwrapping action buttons/status pills, version/company metadata, description tooltip and dynamic colSpan respecting column visibility. Minimum table width preserves columns with horizontal scrolling at narrower desktop sizes. Stored statuses unchanged; display labels simplified. Replacement and correction rows receive appropriate action labels.

Verification: required business suite plus actionQueue 41/41 pass; type check/build pass. Browser demo at 127.0.0.1:3000 confirmed named stages and signature counts; clicking the stepper opened the existing complete journey/history modal. No real records changed. Source backup: C:/Users/HP/Desktop/precisign demo/table-backup-20261104-214424. No protected document, banner or print CSS edited.

## Copy polish, company metadata and Vercel preparation

Removed tenant-isolation footer and inflated archive label; shortened profile/settings/library labels and company-selector guidance. Added greeting, teal form icon/accent, calmer hover treatments and larger heading. Protected renderer, approval banner and index.css untouched. Before/after demo screenshots: tasks/evidence/ui-polish/before.png and after.png. Browser confirmed new dashboard copy and exact Insturmental Control Co Ltd selector name. Latest selector help-text simplification passed type/build checks but was not re-inspected after that wording-only edit.

Current company display is normalized in the repository and API, including cached demo companies. Schema v4 updates only companies.name, never request JSON or signed snapshots. Regression checks cached metadata normalization with historical form wording retained. Required business suite plus actionQueue/companyDisplay tests: 42/42; server suite: 12/12; lint and build:vercel pass; diff whitespace check passes. No hosted build or connected-user visual session claimed.

Vercel static demo config, explicit demo build/notice and deployment guide docs/VERCEL.md added. Persistent SQLite API remains outside Vercel; full multi-user hosting requires separate infrastructure decision. Fixed overbroad data/ ignore to /data/ so required src/data/seedData.ts can be included in Git; verified it had been omitted from the earlier repository upload. No commit, push or deployment performed for this batch. Source backup: C:/Users/HP/Desktop/precisign demo/polish-backup-20261104-215805.
