# PreciSign — Enterprise Approval Journey & Workflow Management System

PreciSign is a digital request, multi-company workflow approval, and electronic signature platform engineered for **Precision Engineering Group** (Saudi Arabia) and its operating subsidiaries:

- **Precision Engineering Works (PEW)**
- **Industrial Chemical & Contracting Ltd (ICCL)**
- **Flexi Seal Gasket Co. (FSG)**

---

## Key Features

1. **DocuSign-Inspired Approval Journey Banner**:
   - Visual progress stepper with recipient avatars, role indicators, and completion percentage.
   - Interactive guided signature tags ("Start", "Next") with 1-click signing.

2. **Parent Organization & Multi-Company Group View**:
   - **Viewing Scope**: Switch between `🏢 PRECISION ENGINEERING GROUP (Group View)` (`PEG`) and individual operating entity views (`PEW`, `ICCL`, `FSG`).
   - **Permission Authorization**: Single-company workers see only their authorized entity; Directors, General Managers, and Group Admins see aggregated cross-subsidiary requests.
   - **Originating Legal Entity Enforcement**: Requests created in Group View require selecting an explicit originating subsidiary.

3. **Authentic Bilingual A4 Document Engine**:
   - High-fidelity pixel-accurate preview of official Saudi Arabian company administrative request forms (PR#21-001FA).
   - Dynamic signature placement on paper document surfaces and print-ready layout.

4. **Decoupled Architecture & Backend-Readiness**:
   - Clean abstraction (`IPreciSignRepository`) isolating UI components from storage.
   - `LocalStoragePreciSignRepository` handles prototype browser storage, structured for seamless replacement by `ApiPreciSignRepository` (Codex backend implementation).

5. **Pure Workflow Engine & Version Control**:
   - Supports returns for correction with automatic version bump (v1 → v2).
   - Preserves historical request workflow snapshots even if global template configurations change.
   - Director Override policy enforcement, self-approval prevention, and full audit trail history.

---

## Technical Stack

- **Frontend**: React 18, TypeScript, Vite
- **Styling**: Tailwind CSS
- **Icons**: Lucide React
- **Testing**: Node.js Native Test Runner (`npx tsx --test`)

---

## Running the Application & Tests

```bash
# Start development server on port 3000
npm run dev

# Run TypeScript build validation
npm run build

# Run unit test suite
npx tsx --test src/utils/approvalJourney.test.ts src/utils/workflowEngine.test.ts src/services/repository.test.ts src/utils/companyAccess.test.ts
```

---

## Documentation Index

- [`AGENTS.md`](./AGENTS.md) — AI Agent coding guidelines & domain rules
- [`docs/ARCHITECTURE.md`](./docs/ARCHITECTURE.md) — System architecture, data flow, and decoupled repository interface
- [`docs/BUSINESS_RULES.md`](./docs/BUSINESS_RULES.md) — Workflow state machine, permission matrix, and multi-company rules
- [`docs/BACKEND_HANDOFF.md`](./docs/BACKEND_HANDOFF.md) — Codex backend implementation specifications, DB schema, and API contracts
