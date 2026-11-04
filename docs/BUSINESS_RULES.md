# PreciSign Business Rules & Specification Matrix

This document defines the official business logic, approval rules, and security constraints governing **PreciSign** for Precision Engineering Group.

---

## 1. Group Structure & Viewing Scopes

- **Parent Organization**: Precision Engineering Group (ID: `PEG`).
- **Operating Subsidiaries**:
  - Precision Engineering Works (`PEW`)
  - Industrial Chemical & Contracting Ltd (`ICCL`)
  - Flexi Seal Gasket Co. (`FSG`)

### Scope Rules:
1. **Viewing Scope Selection**:
   - Authorized users can select `🏢 PRECISION ENGINEERING GROUP (Group View)` to view requests across all subsidiaries they are authorized to access.
   - Selecting a specific operating entity (`PEW`) scopes the view exclusively to that company's records.
2. **Request Originating Subsidiary Assignment**:
   - Every request created in PreciSign belongs to a specific legal subsidiary company.
   - Submitting a request from Group View (`PEG`) requires selecting an explicit originating subsidiary entity.

---

## 2. Request Lifecycle & Status State Machine

```
              ┌─────────────┐
              │    Draft    │
              └──────┬──────┘
                     │ (Submit Request)
                     ▼
         ┌───────────────────────┐
         │   Pending Approval    │◄─────────────────┐
         └───────┬───────┬───────┘                  │
                 │       │                          │
 (All Stages     │       │ (Returned by Approver)   │ (Requester Resubmits
  Approved)      │       │                          │  Corrected Document v2)
                 │       ▼                          │
                 │ ┌───────────────────────────┐    │
                 │ │ Returned for Correction   ├────┘
                 │ └───────────────────────────┘
                 │
                 │ (Rejected by Approver)
                 ├─────────────────────────┐
                 │                         │
                 ▼                         ▼
          ┌─────────────┐           ┌─────────────┐
          │  Approved   │           │  Rejected   │
          └─────────────┘           └─────────────┘
```

### Status Definitions:
- **`Draft`**: Unsubmitted request saved by requester.
- **`Pending Approval`**: Request actively routing through sequential approval stages.
- **`Returned for Correction`**: Request returned to requester due to missing attachments, information, or errors.
- **`Rejected`**: Request terminated by an approver or Director.
- **`Approved`**: All workflow stages completed (or Director Override executed).

---

## 3. Approval Security Rules

1. **Sequential Action Requirement**:
   - Only the assigned approver for the active stage index (`approvalSteps[currentStageIndex]`) can take action.
   - Intermediate approvers cannot approve out of order unless a Director executes an authorized Override.
2. **Prevent Self-Approval Policy**:
   - When `workflowConfig.preventSelfApproval === true`, a user who submitted a request cannot approve their own stage if assigned.
3. **Director Override Policy**:
   - Directors can execute an Override ONLY when `workflowConfig.allowDirectorOverride === true`.
   - Override bypasses remaining intermediate stages and marks the document as fully `Approved`.
   - Non-Director roles are prohibited from executing an override.
4. **Duplicate Action Safeguard**:
   - Approvers cannot re-approve or re-reject a request that has already completed approval or terminated.
5. **Resubmission Ownership**:
   - Only the original requester (`request.requesterId`) can resubmit a request returned for correction. Resubmission increments `documentVersion` (v1 → v2).
