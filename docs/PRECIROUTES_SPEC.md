# PreciRoutes — confirmed product requirements

Confirmed by the product owner on 4 November 2026 after the Q1–Q32 interview. This document records the agreed target behavior; it does not claim that it is implemented. Read with tasks/preciroutes.md. Existing T01–T26 evidence remains historical and must not be relabelled as verification of these requirements.

## Purpose and evidence

Employees need to submit predefined company forms, obtain signatures from the right users and retrieve a clear record of the outcome. PreciRoutes groups each submission and its signing journey into one record. The original paper forms and owner decisions establish the requirement; time savings and employee satisfaction have not been measured. Validate usefulness with actual pilot participants before claiming operational success.

PreciRoutes is the feature name; an individual submission is a PreciRoute. A draft becomes active on submission and receives a reference number.

## Scope and constraints

Start with the PEW Admin Work Request. A route contains one completed predefined form, its supporting attachments, company, requester, named approval participants, signatures, status, document versions and action history. Supporting attachments do not automatically require signatures.

Preserve the existing UI structure and protected bilingual Admin document, including text, dimensions, print CSS and paper signature positions. Use the existing repository boundary and simple Node/Express/SQLite stack. Extend existing components only where agreed behavior requires it.

Excluded: arbitrary document upload for signing, arbitrary signature-field placement, cryptographic/certified signing, department work-completion tracking, and implementation of other forms or company routes in this slice. Completion refers to the signing process, not fulfillment of the requested work.

## Users and value

- Requester: submit and sign a company form, track progress, correct a returned form, or cancel unfinished requests.
- Assigned signer: review the current document and act within the assigned sequence.
- Final approver: sign normally or explicitly close the route with outstanding signatures bypassed.
- Processing team: read and download relevant records for subsequent work.
- Authorized route administrator: replace unavailable unsigned participants with accountable history.
- Authorized group leader: retain visibility across permitted companies.

## Testable requirements and acceptance

| ID | Requirement | Acceptance condition |
| --- | --- | --- |
| PR01 | Submission identifies the legal company, requester and a snapshot of the configured route. Every signer resolves to a named system user before submission. | Missing/unauthorized company, unresolved signer or missing required requester signature is rejected without creating an active route. The requester sees names, order and final designation before submitting. |
| PR02 | Requester submission is a signature, not an approval stage. Requester cannot also be an approval-stage signer on that route. | Requester signature appears in its existing paper slot; assigning the requester as an approver fails validation. |
| PR03 | Intermediate signers act sequentially. The assigned final approver can review and act immediately after submission. | An out-of-turn intermediate action fails; assigned final approver can sign, return or reject before their normal turn. Job title alone grants no early-completion authority. |
| PR04 | Final approver has separate Sign and Sign & Complete actions. Sign keeps the route open while required signatures remain. | An early final signature is saved exactly once without bypassing others; remaining intermediate stages can proceed. |
| PR05 | Collecting all required current-version signatures completes the route automatically, including when the final approver signed early. | The last outstanding signature closes the route without requiring the final approver to sign twice. |
| PR06 | Sign & Complete closes early. A final approver who signed earlier may instead use Complete Route. | Both early-close paths require a reason and confirmation listing outstanding signers. Preserve collected signatures; mark outstanding participants Bypassed, never signed/approved. Record actor, time, reason and affected participants. Complete Route uses the existing current-version final signature. |
| PR07 | Current assigned approver or final approver may return/reject with a reason. | Empty reasons fail. Return pauses all signing; rejection closes the route. A rejected request can only be pursued through a new route. |
| PR08 | Only the original requester corrects/resubmits a returned route. | Resubmission creates a new document version, preserves the previous snapshot/history, obtains a fresh requester signature and resets every approval signature, including an early final signature. |
| PR09 | Requester may cancel any unfinished route with a reason. | Cancellation retains record and collected signatures, records actor/reason/time and prevents subsequent signing. |
| PR10 | Settings changes apply to future submissions; submitted assignments remain fixed except for explicit replacement. | Changing a configured route does not mutate an active route. An authorized administrator can replace only unsigned participants, with a reason and recorded old/new users. |
| PR11 | Final-approver replacement requires specific route-administration authority and acceptance by the replacement. | Ordinary workflow-administration access alone does not implicitly transfer final authority. Replacement must accept before gaining early-completion authority. Signed participants cannot be replaced. |
| PR12 | Access requires company authorization and route visibility. | Requester, assigned participants, former replaced participants, responsible processing team and authorized group leaders can read as applicable. Former participants cannot act. An unrelated same-company employee cannot read merely by company membership. Enforce this on API, lists/counts, history and downloads. |
| PR13 | Terminal records are locked. | Completed, Rejected and Cancelled routes reject form, attachment, assignment and signature mutations. Completion prevents further signing. Subsequent business changes require a new route. |
| PR14 | Reads and downloads respect current authorization. | Authorized readers can retrieve the completed original company form and separate route summary, with supporting attachments separately. Summary identifies signatures, dates, bypasses and version; it does not alter the original paper layout. |
| PR15 | Mutations use current revision and document version. | In competing actions only the first valid mutation commits. Stale action receives a conflict, retains entered comments and requires review of the latest state; never silently reapply a signature to a changed version. Failed saves retain entered data and do not show success. |

Verification owner: implementing agent supplies automated API/domain/repository evidence for each requirement; product owner/pilot participants validate the user journey and document output in the browser. Required visual checks must remain explicitly open until performed.

## Current baseline versus target

The existing pilot provides requester submission, sequential approvals, rejection/return/correction, revision conflicts, attachments, drafts, signature profiles, workflow settings and backup/restore. Prior recorded checks do not prove the new PreciRoutes behaviors.

Changes required: final-user authority replacing role-based Director override, early final signing with open-route continuation, explicit bypass semantics, cancellation, participant replacement/acceptance, narrower route visibility, and separate downloadable route summary. The existing Approved status must not be silently conflated with department work completion.

## Dependencies and implementation decisions still to resolve

Product behavior above is confirmed. Resolve these details before their affected implementation slice; do not invent employee assignments:

- Product owner supplies the real PEW pilot roster, final approver, processing-team membership and users granted final-replacement authority.
- Agent proposes a compatible stored-state model, including early signatures, bypasses, cancellation and final-replacement acceptance. Assess existing stored records before any migration; never discard history.
- Product owner confirms mapping of existing Approved records to user-facing Completed terminology. Legacy role-based override history must remain truthful.
- Agent defines replacement acceptance UI and handling of refusal/pending acceptance without silently granting authority; product owner resolves business ambiguities.
- Route access becomes stricter than existing company-wide visibility. Product owner supplies actual team membership; agent verifies every relevant read/download path.
- Existing browser/print/download gates and hosting/HTTPS/backup operational decisions remain separate prerequisites for real rollout.

## Proposed pilot success checks

Pass/fail: complete one ordinary route, one early-final-sign route that waits for all signers, one explicit bypass completion, one correction after early final signing, one cancellation and one accepted final replacement. Verify permitted readers can retrieve the record and unrelated users cannot. Confirm printed original and route summary against the approved form.

Operational sample size, acceptable completion time and employee feedback targets are not yet set. Product owner sets these before the real pilot; no measured efficiency benefit is claimed.

## Source precedence

For PreciRoutes target behavior, the owner's confirmed interview decisions recorded here supersede conflicting legacy rules (notably Director-only override and company-wide read visibility). AGENTS.md remains authoritative for repository/UI/document safeguards. Existing code describes the baseline, not proof of the target. Resolve uncertainty with the product owner before changing a business rule. No source changes are authorized merely by marking this specification confirmed.
