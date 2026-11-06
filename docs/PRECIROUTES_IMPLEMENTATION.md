# PreciRoutes compatibility review — R01

**Historical compatibility review.** See the [implementation checklist](../tasks/preciroutes.md) for subsequent evidence and the [pre-production handoff](PRE_PRODUCTION.md) for the next phase.

4 November 2026. Current records are JSON in SQLite with integer revisions; no schema migration is needed for submission validation. Existing snapshots and legacy history must remain readable. No real users or permissions have been assigned.

Current seams: src/types/index.ts defines statuses/history/steps; src/utils/workflowEngine.ts computes transitions; server/requestRoutes.ts applies validated intents in revision-checked transactions; repository/context connect existing screens. server/reads.ts currently implements company-level visibility. Workflow settings already resolve roles to named users.

Sequence: first enforce submission invariants and independent workflow snapshots (R02 partial); next add explicit final-sign and complete intents through engine/API/repository/UI (R03–R04); then correction/cancellation, replacement, visibility and output. Keep legacy Director Override events unchanged. Replace its authority for new PreciRoutes only once all corresponding API/UI guards and tests are updated together. Do not expose a partially implemented early-sign path.

Stored Approved remains the existing terminal value until a compatible display mapping is implemented; department work completion is excluded. Cancellation needs a new status and updates to all status maps. Replacement needs durable participant history, acceptance state and specific authority; roster/team/administrator identities are business inputs still pending. Restrict visibility only after those membership semantics are defined, with API/list/count/download tests. No migration may infer these memberships from job titles.

Source backup before code edits: C:/Users/HP/Desktop/precisign demo/preciroutes-backup-20261104-203743. No Git metadata was present in the project baseline; no commit is claimed.
