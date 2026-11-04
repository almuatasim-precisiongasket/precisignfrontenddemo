# PreciSign Architecture Specification

## 1. System Overview

PreciSign is structured as a modular React and TypeScript Single Page Application (SPA) designed to transition seamlessly from a client-side prototype to a full-stack enterprise platform implemented by Codex.

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                             PRESENTATION LAYER                              │
│  ┌─────────────────────────┐ ┌──────────────────────┐ ┌──────────────────┐  │
│  │ Dashboard & Inbox Views │ │ DocuSign Banner &    │ │ A4 Document      │  │
│  │                         │ │ Stepper Journey      │ │ Canvas & Print   │  │
│  └────────────┬────────────┘ └──────────┬───────────┘ └────────┬─────────┘  │
└───────────────┼─────────────────────────┼──────────────────────┼────────────┘
                │                         │                      │
┌───────────────▼─────────────────────────▼──────────────────────▼────────────┐
│                             APPLICATION CONTEXT                             │
│                           AppContext & Custom Hooks                         │
└───────────────┬─────────────────────────┬──────────────────────┬────────────┘
                │                         │                      │
┌───────────────▼─────────────┐ ┌─────────▼──────────────┐ ┌─────▼────────────┐
│   WORKFLOW STATE MACHINE    │ │ MULTI-COMPANY ACCESS   │ │ DOMAIN MODELS    │
│   src/utils/workflowEngine  │ │ src/utils/companyAccess│ │ src/types/index  │
└───────────────┬─────────────┘ └─────────┬──────────────┘ └─────┬────────────┘
                │                         │                      │
┌───────────────▼─────────────────────────▼──────────────────────▼────────────┐
│                            REPOSITORY ABSTRACTION                           │
│                          interface IPreciSignRepository                     │
└───────────────┬─────────────────────────────────────────────────────────────┘
                │
     ┌──────────┴────────────────────────┐
     │                                   │
┌────▼───────────────────────────┐ ┌─────▼──────────────────────────────┐
│ LocalStoragePreciSignRepository│ │ ApiPreciSignRepository (Future)     │
│ (Browser Prototype Storage)    │ │ (Codex REST / GraphQL API Client)   │
└────────────────────────────────┘ └─────────────────────────────────────┘
```

---

## 2. Decoupled Repository Architecture

To ensure backend readiness without adding live infrastructure dependencies, data persistence is decoupled from UI presentation components through the `IPreciSignRepository` interface:

```typescript
export interface IPreciSignRepository {
  getCompanies(): Promise<Company[]>;
  getUsers(): Promise<UserProfile[]>;
  getWorkflows(scope?: ViewingScope): Promise<WorkflowConfig[]>;
  getRequests(scope?: ViewingScope): Promise<RequestRecord[]>;
  getRequestById(id: string): Promise<RequestRecord | null>;
  createRequest(record: RequestRecord): Promise<RequestRecord>;
  updateRequest(record: RequestRecord): Promise<RequestRecord>;
  getDraft(scope: ViewingScope, requesterId: string, formType: string): Promise<Partial<AdminWorkFormData> | null>;
  saveDraft(scope: ViewingScope, requesterId: string, formType: string, draft: Partial<AdminWorkFormData>): Promise<void>;
  resetToSeedData(): Promise<void>;
}
```

### Handoff Strategy for Codex:
When building the backend API, Codex will create `ApiPreciSignRepository` implementing `IPreciSignRepository` using `fetch`/`axios` to communicate with backend REST endpoints. Components will consume `dataService` with zero refactoring required.

---

## 3. Viewing Scope vs Permission Authorization

The system cleanly separates the **User's Active Viewing Scope** from the **User's Permission Authorization**:

- **Viewing Scope (`ViewingScope`)**:
  - `PEG` (`PRECISION ENGINEERING GROUP`): Aggregates requests across all authorized group subsidiaries.
  - `PEW` / `ICCL` / `FSG`: Restricts view to that specific operating entity.
- **Authorization (`canUserAccessCompany`)**:
  - Directors, General Managers, and Group Admins have group-level authorization across all subsidiaries.
  - Single-company employees are restricted to their authorized subsidiary entities.

---

## 4. Workflow Engine & Immutable Request Snapshots

- **State Transitions**: Handled by pure functions in `src/utils/workflowEngine.ts`.
- **Preserved Snapshots**: When a request is created, it saves a snapshot of the active `WorkflowConfig`. Subsequent changes to the global workflow configuration do not mutate active or archived request snapshots.
- **Audit History**: Every submission, approval, return, rejection, or override appends an immutable entry to `request.approvalHistory`.
