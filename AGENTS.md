# AGENTS.md — Guidance for Future AI Coding Agents (Codex & Assistants)

Welcome to **PreciSign**! This document contains critical guidelines, architectural constraints, and business rules for AI coding agents maintaining or expanding this codebase.

---

## 1. Primary Mandates

- **Do Not Rebuild the Frontend UI**: The React + TypeScript presentation layer, bilingual A4 document renderer, and DocuSign-inspired approval banner are finalized. Preserve existing component structure and styling.
- **Maintain Repository Abstraction**: Decouple components from persistence using `IPreciSignRepository` defined in `src/services/repository.ts`. Do not write direct API calls or direct storage accesses inside React components.
- **Preserve Paper Document Fidelity**: The bilingual A4 administrative request form renderer in `src/components/document/AdminWorkRequestDocument.tsx` produces official company documents. Never alter form text, layout dimensions, or paper signature positioning without explicit business authorization.

---

## 2. Viewing Scope vs Permission Authorization

- **Viewing Scope**: Represented by `ViewingScope = 'PEG' | CompanyId`.
  - `'PEG'`: Parent Organization view (`PRECISION ENGINEERING GROUP`).
  - `'PEW' | 'ICCL' | 'FSG'`: Subsidiary legal entity view.
- **User Authorization**:
  - `role === 'Director' || role === 'General Manager' || isGroupAdmin`: Has cross-company group privileges to view and approve requests across all subsidiaries.
  - Standard employee: Authorized ONLY for their assigned `companyId` (or `allowedCompanyIds`).
- **Group View Request Creation**:
  - Requests MUST always belong to an explicit legal subsidiary company (`PEW`, `ICCL`, `FSG`).
  - Submitting a request while in Group View (`'PEG'`) requires specifying an `originatingCompanyId`.

---

## 3. Workflow State Machine Rules

**PreciRoutes update (4 November 2026):** For request actions, visibility, signer replacement, cancellation and completion, read `docs/PRECIROUTES_SPEC.md` and `tasks/preciroutes.md`. The confirmed PreciRoutes rules supersede conflicting legacy rules below: the assigned final user can sign early or complete with explicit bypass, regardless of job title. Cross-company visibility does not grant signing authority. Route reads require participation, configured processing-team membership or authorized leadership. The legacy Director Override helper remains for historical tests; live API/demo actions use `completePreciRoute`.

1. **Submission**:
   - Requester submission creates `status = 'Pending Approval'`, sets `currentStageIndex = 0`, and logs step 0 in `approvalHistory`.
   - Requester submission is **not** an approval stage.
2. **Stage Approval**:
   - Only the user matching `approvalSteps[currentStageIndex].assignedUserId` (or matching assigned role in company context) can approve.
   - Stage approval updates the step status to `'Approved'`, captures signature/comments, increments `currentStageIndex`, and advances `currentApproverId`.
   - When the final stage is approved, request status transitions to `'Approved'`.
3. **Return for Correction**:
   - Assigned approver or Director can return a request with a required reason.
   - Request status becomes `'Returned for Correction'`.
   - Only the original requester can resubmit.
   - Resubmission bumps `documentVersion` (v1 → v2), saves a version snapshot, and resets approval steps to stage index 0 (`'Pending'`).
4. **Director Override**:
   - Authorized when `workflowConfig.allowDirectorOverride === true` and `user.role === 'Director'`.
   - Instantly approves all remaining stages and marks request as `'Approved'`.

---

## 4. Test Execution

All business rules, repository operations, and workflow transitions are covered by Node.js native unit tests.

Before submitting changes, ensure all tests pass cleanly:

```bash
npx tsx --test src/utils/approvalJourney.test.ts src/utils/workflowEngine.test.ts src/services/repository.test.ts src/utils/companyAccess.test.ts
```
