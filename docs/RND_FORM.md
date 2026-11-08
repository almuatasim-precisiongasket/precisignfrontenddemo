# R&D Initiative — PR#26-RND01

Implemented on `R-and-D-form` in a separate worktree. No existing runtime database is needed or changed.

## Enable for a company

1. In **User directory → Manage access**, grant **R&D Initiative** for the legal company.
2. In **Signing routes**, select that company and **R&D Initiative**. Save a company-directory route with a mandatory final approver and any optional review steps or backups.
3. Open **Forms Library → R&D Initiative**. In Group View, choose the legal company before sending.

The four original forms and their official documents are unchanged. The new form uses the existing repository, access checks, signature dialog, replacement rules and expected-revision transaction handling.

## Field inventory and rendering

- `src/utils/rndFields.ts` holds every input and all 19 option groups from the supplied reference. Its seven editor groups cover all eight printed sections A–H; F and G share an editor group.
- Sections A–G belong to submission. Section H belongs to the assigned final approver, including an accepted replacement.
- `src/components/rnd/documentTemplate.ts` contains the static document markup. Prototype scripts, editable document controls, sample buttons, style switches and section jumps are excluded.
- `RndRequestDocument` escapes text and accepts embedded PNG/JPEG image bytes only. Company name and optional logo come from the request's stored branding.
- Desktop uses editor left, fitted preview right. Narrow screens use the existing editor/preview switch.
- The executive navy headings, form text, fields, checklists and signature spaces are retained. Spacing is compacted to prevent the reference's first-page clipping. Ordinary entries use two A4 pages; lengthy responses expand instead of being hidden. Demo PDF export paginates expanded content.

## Evaluation and signatures

- `POST /api/requests/:id/rnd-evaluation` accepts `expectedRevision` and an H-only evaluation object. Submission and correction cannot inject H.
- Evaluation saves require company access, an open route and the currently assigned final approver. Saves use the existing SQLite transaction and revision check.
- Decision plus recommended next action are required for completion. Collecting all signatures without these keeps the request open, assigned to the final approver, with **Evaluation needed**.
- The final approver may sign early, then save evaluation separately and complete later with a recorded reason. Existing bypass permissions still apply.
- R&D approvals capture exact signature bytes and an approval-time form state in `rndSignedStates`. Subsequent evaluation updates are journaled in `rndEvaluationHistory`; they do not alter those signed copies.
- Current documents explicitly identify evaluation updates made after the final signature. Signed copies remain accessible in the evaluation panel.
- Correction preserves the outgoing R&D version and its signatures, then starts a new version with fresh signatures and evaluation. Historical attachments remain in the existing attachment-version records.
- These are application-level evidence records, not cryptographic or tamper-proof signatures. They do not replace the separately staged historical-integrity repair for other forms.

## Verification

`server/rnd.test.ts` uses SQLite `:memory:` and synthetic users only. It covers the field inventory, H injection, authority transfer on replacement acceptance, explicit form grants, company isolation, completion gating, stale concurrent saves, byte preservation, outgoing versions, attachments and branding.

Required checks:

```powershell
npm run lint
npm run build
node --import tsx --test server/rnd.test.ts server/requests.test.ts server/workflows.test.ts server/pilotAccess.test.ts src/services/apiRepository.test.ts src/utils/approvalJourney.test.ts src/utils/workflowEngine.test.ts src/services/repository.test.ts src/utils/companyAccess.test.ts
```

Browser verification used a fresh synthetic browser context: library entry, desktop editor, 390px editor/preview, actual submission, reviewer evaluation, final signature and two-page PDF export. No production deployment was performed.
