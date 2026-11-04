# Codex Backend Implementation & Handoff Guide

This document provides complete instructions for **Codex** or backend engineers implementing persistent database storage, authentication, and REST API services for PreciSign.

---

## 1. Relational Database Schema Mapping

The domain models in `src/types/index.ts` map directly to the following relational PostgreSQL schema:

### `companies`
| Column | Type | Constraints | Description |
|---|---|---|---|
| `id` | `VARCHAR(10)` | `PRIMARY KEY` | Subsidiary code (`PEW`, `ICCL`, `FSG`) |
| `code` | `VARCHAR(10)` | `NOT NULL` | Short identifier |
| `name` | `VARCHAR(100)` | `NOT NULL` | Operating company name |
| `full_name` | `VARCHAR(200)` | `NOT NULL` | Full corporate entity name |
| `group_name` | `VARCHAR(200)` | `NOT NULL` | Parent group name (`PRECISION ENGINEERING GROUP`) |

### `users`
| Column | Type | Constraints | Description |
|---|---|---|---|
| `id` | `VARCHAR(50)` | `PRIMARY KEY` | User ID |
| `company_id` | `VARCHAR(10)` | `REFERENCES companies(id)` | Assigned subsidiary |
| `name` | `VARCHAR(100)` | `NOT NULL` | Full name |
| `email` | `VARCHAR(150)` | `UNIQUE, NOT NULL` | Corporate email |
| `role` | `VARCHAR(30)` | `NOT NULL` | Role (`Admin`, `General Manager`, `Director`, etc.) |
| `department` | `VARCHAR(100)` | `NOT NULL` | Department |
| `initials` | `VARCHAR(10)` | `NOT NULL` | Initials for avatars |
| `is_group_admin` | `BOOLEAN` | `DEFAULT FALSE` | Group-wide access flag |
| `signature_data_url` | `TEXT` | `NULLABLE` | Base64 PNG signature string |
| `signature_style_text` | `VARCHAR(100)` | `NULLABLE` | Typed signature text representation |

### `requests`
| Column | Type | Constraints | Description |
|---|---|---|---|
| `id` | `VARCHAR(60)` | `PRIMARY KEY` | Human-readable ID (e.g., `PEW-AW-2026-0018-X9A2`) |
| `form_type` | `VARCHAR(50)` | `NOT NULL` | Document form type |
| `company_id` | `VARCHAR(10)` | `REFERENCES companies(id)` | Legal entity owner |
| `title` | `VARCHAR(255)` | `NOT NULL` | Request subject/title |
| `requester_id` | `VARCHAR(50)` | `REFERENCES users(id)` | Request creator |
| `department` | `VARCHAR(100)` | `NOT NULL` | Department |
| `status` | `VARCHAR(30)` | `NOT NULL` | State (`Pending Approval`, `Approved`, etc.) |
| `current_stage_index` | `INT` | `DEFAULT 0` | Active approval stage pointer |
| `current_approver_id` | `VARCHAR(50)` | `NULLABLE` | User ID of active stage approver |
| `document_version` | `INT` | `DEFAULT 1` | Document version count |
| `workflow_snapshot` | `JSONB` | `NOT NULL` | Snapshot of WorkflowConfig at time of submission |
| `form_data` | `JSONB` | `NOT NULL` | Form inputs, checklist choices, and signature fields |
| `created_at` | `TIMESTAMPTZ` | `DEFAULT NOW()` | Submission timestamp |
| `updated_at` | `TIMESTAMPTZ` | `DEFAULT NOW()` | Last update timestamp |

### `approval_steps`
| Column | Type | Constraints | Description |
|---|---|---|---|
| `id` | `BIGSERIAL` | `PRIMARY KEY` | Step ID |
| `request_id` | `VARCHAR(60)` | `REFERENCES requests(id)` | Parent request |
| `stage_number` | `INT` | `NOT NULL` | Sequence number (1, 2, 3...) |
| `stage_name` | `VARCHAR(100)` | `NOT NULL` | Display name ("GM Approval") |
| `assigned_user_id` | `VARCHAR(50)` | `REFERENCES users(id)` | Assigned approver |
| `status` | `VARCHAR(20)` | `NOT NULL` | Step status (`Pending`, `Approved`, `Waiting`, `Rejected`) |
| `action_date` | `TIMESTAMPTZ` | `NULLABLE` | Timestamp when step was acted upon |
| `comments` | `TEXT` | `NULLABLE` | Approver notes |
| `signature_data_url` | `TEXT` | `NULLABLE` | Electronic signature captured at stage |

---

## 2. API Endpoint Contracts

### `GET /api/v1/requests`
- **Query Params**: `scope` (`PEG`, `PEW`, `ICCL`, `FSG`), `status` (`pending`, `my`, `approved`, `all`)
- **Headers**: `Authorization: Bearer <token>`
- **Response**: `200 OK` JSON array of `RequestRecord` objects filtered by scope and authenticated user permissions.

### `POST /api/v1/requests`
- **Body**: `{ formData: AdminWorkFormData, attachments: AttachmentItem[], comment?: string, signatureDataUrl?: string }`
- **Validation**: Enforces originating subsidiary company when `scope === 'PEG'`.
- **Response**: `201 Created` `{ success: true, newId: string, record: RequestRecord }`

### `POST /api/v1/requests/:id/approve`
- **Body**: `{ comment?: string, signatureDataUrl?: string }`
- **Response**: `200 OK` `{ success: true, updatedRequest: RequestRecord }`

### `POST /api/v1/requests/:id/return`
- **Body**: `{ reason: string }`
- **Response**: `200 OK` `{ success: true, updatedRequest: RequestRecord }`

### `POST /api/v1/requests/:id/resubmit`
- **Body**: `{ formData: AdminWorkFormData, changeNote?: string, signatureDataUrl?: string }`
- **Response**: `200 OK` `{ success: true, updatedRequest: RequestRecord }`

### `POST /api/v1/requests/:id/override`
- **Body**: `{ reason: string }`
- **Response**: `200 OK` `{ success: true, updatedRequest: RequestRecord }`

---

## 3. Implementation Steps for Codex

1. Provision database instance and run migrations matching the relational schema above.
2. Implement REST controller routes for Auth, Workflows, Requests, and User Signatures.
3. Create `ApiPreciSignRepository` in `src/services/apiRepository.ts` implementing `IPreciSignRepository`.
4. In `src/services/repository.ts`, swap the exported `dataService` instance from `LocalStoragePreciSignRepository` to `ApiPreciSignRepository`.
