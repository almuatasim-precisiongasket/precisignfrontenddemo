# Batch 2 contract (version 1)

`src/services/apiTypes.ts` defines the action inputs and versioned request output. Revision tracks persistence conflicts separately from documentVersion and workflowVersion. Existing demo records normalize missing revision to 1 on action; new records begin at revision 1. AppContext invokes LocalActionRepository's action methods; the API adapter implements the same RequestActions contract. The default singleton used for reads/settings/drafts remains local until T16.

ApiPreciSignRepository uses same-origin cookies and never falls back to localStorage. `login`, `getCurrentUser`, `logout` and `bootstrap` are available. List/detail paths match the server. Create/approve/return/reject/resubmit/override methods transport intents and expectedRevision; those server mutation routes are not implemented until T17–T20 and will currently fail. Legacy createRequest/updateRequest throw without sending an HTTP request. Unsupported draft/profile/settings/demo operations fail explicitly until their batches. No code silently substitutes local data.

ApiError contains status and a stable client code: INVALID_DATA, UNAUTHENTICATED, FORBIDDEN, NOT_FOUND, STALE_REVISION, PAYLOAD_TOO_LARGE, RATE_LIMITED or PERSISTENCE_FAILURE. Network rejection is NETWORK_ERROR; malformed success data is INVALID_RESPONSE. Error JSON on the wire is `{error: string}`; the client maps HTTP status to the stable code. There is no automatic retry for mutations, including 409.

Implemented server reads:

- GET /api/bootstrap: current safe user, authorized company metadata, eligible user directory (no password hashes/session tokens or saved signature images), and accessible workflow configurations.
- GET /api/requests?scope=PEG|PEW|ICCL|FSG: all authorized companies when omitted or PEG; one authorized company for subsidiary scope. Invalid scopes return 400, unauthorized company scopes return an empty list.
- GET /api/requests/:id: 404 for both missing and inaccessible records. Revision comes from the database column, overriding the JSON value.

Every request read applies allowed-company predicates in parameterized SQL before serializing records. Directors, General Managers and group admins have group access; standard employees use primary/explicitly allowed companies. Bootstrap does not create workflows or infer new permissions.

Verification: `npm run test:server` exercises actual HTTP requests for primary-company employees, explicitly permitted companies, GM, Director and group admin; also unauthenticated access, invalid scope, inaccessible/missing IDs and redaction. `npm run test:api` covers HTTP/network/malformed responses, action payloads, forbidden raw mutations, and demo lifecycle/conflict/save failure. Interactive frontend integration remains T16.

Demo action serialization is scoped to the adapter instance, not a multi-browser transaction guarantee. SQLite transaction/revision enforcement is required for the real API actions in T18. No multi-browser correctness claim is made for localStorage.


## Upload validation (Batch 4)

PNG/JPEG content is decoded through sharp with a 16-million-pixel limit and strict failure handling. PDFs are parsed through pdf-lib with invalid-object rejection, an EOF requirement and 1–1000 valid-sized pages; encrypted PDFs are rejected. Files must still satisfy canonical base64, allowed MIME/magic and decoded byte/count limits. Validation precedes the write transaction, and accepted original bytes are retained. This validates format; it is not antivirus scanning or exhaustive PDF rendering validation.

Implementation references: [sharp constructor](https://sharp.pixelplumbing.com/api-constructor/), [sharp output](https://sharp.pixelplumbing.com/api-output/), [PDF load options](https://pdf-lib.js.org/docs/api/interfaces/loadoptions).


## Private drafts (T21)

`GET /api/drafts/:companyId/Admin%20Work%20Request` returns `{revision, data}`. A missing draft is `{revision:0,data:null}`. PUT accepts `{expectedRevision,data}` (partial editable Admin fields, optional companyId matching path and validated attachments). DELETE accepts `{expectedRevision}`. No requester ID is accepted; session owns the key. PEG and other form types are invalid.

PUT/DELETE increment revisions. Cleared data is retained only as a JSON-null revision marker; old snapshots are not retained in drafts. A delayed save with the previous revision gets 409. Drafts do not require an approval route merely to be saved; actual request submission remains limited to configured PEW Admin pilot.

Connected submission sends `expectedDraftRevision`. Request insertion and clearing that exact actor/company draft run in one transaction. A stale draft or failed cleanup means no new request. Legacy action clients that omit it do not clear any draft.

The frontend uses revision-aware `readPrivateDraft`, `writePrivateDraft`, `clearPrivateDraft` and DraftCoordinator. Legacy API getDraft/saveDraft/clearDraft methods intentionally remain unavailable to prevent unversioned writes; local demo drafts retain their existing implementation.

X-PreciSign-User pins a connected editor to its authenticated identity. The server only compares it with the session user and rejects mismatch with 401; it never uses that header as authority. This protects against login-cookie changes in another tab.

Queued writes are scoped to user/company; outdated responses do not update a different editor. Failed edits stay in the current signed-in memory cache. Only confirmed server saves are labelled saved. Unsaved edits can be lost on reload/logout, while last confirmed server drafts survive. A 409 never retries or overwrites automatically; loading the server draft requires confirmation that local entries will be replaced.


## Signature profile (T22)

Schema version 2 stores private signature profiles in user_signatures. PATCH /api/me/signature accepts signatureDataUrl (validated PNG/JPEG, maximum 2 MiB) and signatureStyleText (authenticated account name). Ownership comes from the session; other fields are rejected. Only the owning user's bootstrap/auth-me response includes its saved mark. Directory entries exclude signature images. Profile updates never modify stored requests, approval history or document version snapshots. Saved marks still require explicit confirmation for each request action.


## Workflow administration (T23)

PUT /api/workflows/PEW/Admin%20Work%20Request accepts {expectedVersion, workflow}. Director or isGroupAdmin is required; Admin employee and General Manager alone are insufficient. The pilot enables PEW Admin only. Expected version is the last loaded server version (0 for absent config); stale saves return 409 without changing stored settings. Server assigns version+1 and resolves role-only stages only when exactly one eligible account matches. Explicit IDs must match an eligible provisioned user and any declared role. Only the last stage is final and maps to the paper authority slot. Return policy must restart. Existing request snapshots remain unchanged. Local workflow import uses the same validator.

Workflow settings do not deliver reminders/escalations by themselves. Real administrators and routes require business confirmation before operational use.
