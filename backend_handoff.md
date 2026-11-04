# PreciSign — Backend Handoff & Architecture Guide

## 1. Scope & System Profile
- **Target Organization**: Precision Engineering Group (Saudi Arabia) — Operating across subsidiaries PEW, ICCL, and FSG.
- **Scale**: Internal operational tool for approximately 20 to 50 active users (requesters, department heads, GM, and Director).
- **Hosting Strategy**: Free-tier-first. Fully deployable on Google Cloud Run (Node.js/Express or Python FastAPI) with Cloud SQL (PostgreSQL free tier / scale-to-zero) or Supabase/Neon PostgreSQL free tier.
- **Architectural Boundary**: The frontend is completely decoupled. UI components communicate with the data layer via the `IPreciSignRepository` interface (`src/services/repository.ts`), currently backed by `LocalStoragePreciSignRepository`.

---

## 2. Server-Authoritative Workflow Security

> **CRITICAL SECURITY RULE**: The server MUST calculate and enforce all workflow state transitions, timestamps, and history records. The backend must NEVER expose generic `PUT /api/requests/:id` endpoints that accept a client-supplied approval history or state payload.

Client applications submit action intents with user credentials. The server:
1. Loads the current request record from the database.
2. Validates user session, tenant company context, and stage authorization.
3. Computes the next stage, updates status, generates chronological `ApprovalHistoryItem` records with server timestamps (`now()`).
4. Atomically commits the transition.

---

## 3. Server-Side REST Endpoints

### 3.1 Authentication & Profile
- `POST /api/auth/login`
  - Body: `{ email, password }`
  - Returns: JWT session token and `UserProfile`.
- `GET /api/users`
  - Query: `companyId`
  - Returns: `UserProfile[]`
- `PATCH /api/users/:id/signature`
  - Body: `{ signatureDataUrl?: string, signatureStyleText?: string }`
  - Updates saved user e-signature graphic and cursive representation.

### 3.2 Discrete Workflow Operations (Server State Machine)
- `POST /api/requests/submit`
  - **Body**: `{ companyId, formType, formData, attachments, comment, signatureDataUrl }`
  - **Server Logic**: Resolves active `WorkflowConfig` version for `(companyId, formType)`. Generates collision-resistant ID (`{COMPANY}-AW-{YEAR}-{SEQUENCE}-{ENTROPY}`). Sets `status = 'Pending Approval'`, `currentStageIndex = 0`. Adds initial `Submitted` history event. Stores Snapshot V1.
  - **Returns**: `201 Created` with created `RequestRecord`.

- `POST /api/requests/:id/approve`
  - **Body**: `{ comment?: string, signatureDataUrl?: string }`
  - **Server Verification**:
    - Request must be in `Pending Approval` state.
    - Authenticated user ID must match `request.approvalSteps[currentStageIndex].assignedUserId` (or assigned role within company).
    - If `workflowConfig.preventSelfApproval === true`, reject if `user.id === request.requesterId` (`403 Forbidden`).
    - Verify signer name is non-empty.
  - **Server Transition**: Sets current step status to `'Approved'`. Appends approval history item with server timestamp. If final stage or stage maps to signature, records `approvalAuthoritySignatureName` and timestamp on document. Advances to next stage or marks `status = 'Approved'`.

- `POST /api/requests/:id/return`
  - **Body**: `{ reason: string }`
  - **Server Verification**: Requires non-empty reason (`400 Bad Request`). User must be current approver or Director. Request must be in `Pending Approval`.
  - **Server Transition**: Appends `Returned for Correction` history event. Sets `status = 'Returned for Correction'`.

- `POST /api/requests/:id/resubmit`
  - **Body**: `{ formData: AdminWorkFormData, changeNote?: string, signatureDataUrl?: string }`
  - **Server Verification**: User must be the original requester. Request must be in `Returned for Correction` state.
  - **Server Transition**: Increments `documentVersion` (e.g. V1 -> V2). Saves new version snapshot into `versionSnapshots`. Resets approval steps according to workflow policy (`restart_workflow` -> stage 0). Sets `status = 'Pending Approval'`.

- `POST /api/requests/:id/reject`
  - **Body**: `{ reason: string }`
  - **Server Verification**: Non-empty reason required. User must be current approver or Director.
  - **Server Transition**: Appends `Rejected` history item. Sets `status = 'Rejected'`.

- `POST /api/requests/:id/director-override`
  - **Body**: `{ reason: string, signatureDataUrl?: string }`
  - **Server Verification**:
    - Policy check: `request.workflowConfig.allowDirectorOverride` must be `true`.
    - Request must be in `Pending Approval` state.
    - Authenticated user role must be `'Director'`.
    - Mandatory non-empty justification `reason` required.
    - Requester company must match Director company context.
  - **Server Transition**: Marks skipped intermediate stages as `'Bypassed'`. Marks Director stage as `'Approved'`. Sets `status = 'Approved'`. Records Director signature on document. Appends `Director Override` history item.

### 3.3 Request Queries & Drafts
- `GET /api/requests`
  - Query params: `companyId`, `status`, `filter` (`'pending' | 'my' | 'all' | 'approved'`)
  - Server applies tenant filtering (`WHERE company_id = :companyId`).
- `GET /api/requests/:id`
  - Returns full `RequestRecord` including `approvalHistory`, `versionSnapshots`, and `approvalSteps`.
- `GET /api/drafts`
  - Query: `companyId`, `requesterId`, `formType`
  - Returns saved draft form data.
- `PUT /api/drafts`
  - Body: `{ companyId, requesterId, formType, formData }`
- `DELETE /api/drafts`
  - Query: `companyId`, `requesterId`, `formType`

### 3.4 Workflows Management
- `GET /api/workflows`
  - Query: `companyId`, `formType?`
- `PUT /api/workflows/:id`
  - **Server Verification**: User role must be `'Admin'`. Stages must have $\ge 1$ stage, exactly 1 final approval stage, and exactly 1 signature mapped stage.
  - **Server Transition**: Increments `version`. New version applies only to new requests. In-flight requests remain bound to their creation workflow version.

---

## 4. Database Schema (PostgreSQL DDL)

```sql
-- 1. Companies / Operating Subsidiaries
CREATE TABLE companies (
  id VARCHAR(10) PRIMARY KEY, -- 'PEW', 'ICCL', 'FSG'
  code VARCHAR(10) NOT NULL,
  name VARCHAR(100) NOT NULL,
  full_name VARCHAR(255) NOT NULL,
  group_name VARCHAR(100) DEFAULT 'PRECISION ENGINEERING GROUP'
);

-- 2. Users
CREATE TABLE users (
  id VARCHAR(50) PRIMARY KEY,
  name VARCHAR(100) NOT NULL,
  email VARCHAR(150) UNIQUE NOT NULL,
  role VARCHAR(50) NOT NULL, -- 'Admin', 'Director', 'General Manager', etc.
  department VARCHAR(100) NOT NULL,
  company_id VARCHAR(10) REFERENCES companies(id),
  initials VARCHAR(5),
  avatar_color VARCHAR(10),
  signature_style_text VARCHAR(100),
  signature_data_url TEXT
);

-- 3. Workflow Configurations
CREATE TABLE workflow_configs (
  id VARCHAR(50) PRIMARY KEY,
  company_id VARCHAR(10) REFERENCES companies(id),
  form_type VARCHAR(100) NOT NULL,
  version INT NOT NULL DEFAULT 1,
  prevent_self_approval BOOLEAN DEFAULT TRUE,
  allow_director_override BOOLEAN DEFAULT TRUE,
  reminder_days INT DEFAULT 2,
  escalation_days INT DEFAULT 5,
  rejection_behavior VARCHAR(50) DEFAULT 'archive',
  return_behavior VARCHAR(50) DEFAULT 'restart_workflow',
  stages JSONB NOT NULL, -- Array of WorkflowStageConfig
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 4. Requests
CREATE TABLE requests (
  id VARCHAR(60) PRIMARY KEY, -- E.g. 'PEW-AW-2026-0018-X4K2'
  form_type VARCHAR(100) NOT NULL,
  company_id VARCHAR(10) REFERENCES companies(id),
  title VARCHAR(255) NOT NULL,
  requester_id VARCHAR(50) REFERENCES users(id),
  requester_name VARCHAR(100) NOT NULL,
  requester_role VARCHAR(50) NOT NULL,
  department VARCHAR(100) NOT NULL,
  status VARCHAR(40) NOT NULL DEFAULT 'Pending Approval',
  current_stage_index INT DEFAULT 0,
  current_approver_id VARCHAR(50) REFERENCES users(id),
  workflow_version INT NOT NULL,
  document_version INT NOT NULL DEFAULT 1,
  form_data JSONB NOT NULL,
  approval_steps JSONB NOT NULL,
  approval_history JSONB NOT NULL, -- Immutable chronological array
  version_snapshots JSONB NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 5. Attachments
CREATE TABLE attachments (
  id VARCHAR(60) PRIMARY KEY,
  request_id VARCHAR(60) REFERENCES requests(id) ON DELETE CASCADE,
  name VARCHAR(255) NOT NULL,
  size_bytes BIGINT NOT NULL,
  size_formatted VARCHAR(20) NOT NULL,
  mime_type VARCHAR(100) NOT NULL,
  storage_path TEXT NOT NULL,
  uploaded_by VARCHAR(100) NOT NULL,
  uploaded_at TIMESTAMPTZ DEFAULT NOW()
);

-- 6. Drafts (Scoped by company, requester, and form)
CREATE TABLE drafts (
  company_id VARCHAR(10) REFERENCES companies(id),
  requester_id VARCHAR(50) REFERENCES users(id),
  form_type VARCHAR(100) NOT NULL,
  form_data JSONB NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  PRIMARY KEY (company_id, requester_id, form_type)
);
```

---

## 5. Frontend Integration Switch

When the backend is implemented:
1. Implement `src/services/apiRepository.ts` adhering to `IPreciSignRepository`.
2. In `src/services/repository.ts`:
   ```typescript
   export const dataService: IPreciSignRepository = new ApiPreciSignRepository();
   ```
3. Because all components consume `useApp()` and `dataService`, zero presentation component rewrites will be required.
