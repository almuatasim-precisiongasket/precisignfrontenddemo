# PreciSign pre-production handoff

## Starting point

Use this repository as the source of truth. Confirm the branch and working tree, then read [AGENTS.md](../AGENTS.md), the [PreciRoutes spec](PRECIROUTES_SPEC.md), the [implementation checklist](../tasks/preciroutes.md), and the [local pilot guide](LOCAL_PILOT.md).

- `main` is the approved MVP baseline. `Pre-Production` was created from it at `07f48c0` for internal pilot work. `PRECISIGNDEMOAPPROVED` is an earlier recovery snapshot.
- The [public Vercel MVP](https://precisign-frontend-demo.vercel.app/) has been deployed in browser-local demo mode. See the [Vercel guide](VERCEL.md). Keep real employee data and credentials in the separate pilot environment.
- The connected code already includes Express, SQLite, password hashing, stored sessions, command-line account provisioning, and signature profile endpoints. Inspect the implementation and verify behavior before treating these as ready for employee rollout. See [server/auth.ts](../server/auth.ts), [server/provision-user.ts](../server/provision-user.ts), and [server/profile.ts](../server/profile.ts).

## Product and route rules

PreciSign handles predefined internal company forms. A PreciRoute contains one form, supporting attachments, assigned system-user signers, and history.

| Form | Printed signature spaces |
| --- | --- |
| Administrative & Payment Request | Requester, Department Head, Approver |
| IT Request | Requester, Approval Authority |
| Cash Voucher | Receiver, Approver, Cashier |
| Expense Claim | Claimant, Department Head, Approval Authority, Finance |

Printed spaces stay on the document even when a route uses fewer roles. The logged-in requester signs on submission. The assigned final approver can sign and leave the route open, or complete it with a reason when bypassing outstanding signers. They can also complete it later after signing. Signing completion is separate from department work or payment fulfillment. Backup signers should enter the signing inbox when assigned under the route rules. Follow the spec for replacement and acceptance.

## First priority: accounts and permissions

1. Assess existing sign-in, session handling, provisioning, role checks, and profile/signature settings. Reuse them where they fit the pilot.
2. Define first super admin setup, employee onboarding, account recovery and disabling. Decide between admin-created or invited accounts and self-registration.
3. Let a super admin assign one or more companies to each employee and choose which forms they can start in each company. Decide the default grants for new accounts. Explicit grants are the proposed pilot default.
4. Separate company scope, permission to start a form, permission to read a route, and permission to sign it. Group View is a viewing scope. Each request belongs to a specific legal company. Decide how assigned signers should access routes for forms they cannot start, and what happens to open assignments when access is revoked or an account is disabled.
5. Use the existing Signature & Profile experience where practical. Preserve signed document versions when someone updates their profile or signature.

Pilot checks should cover an admin onboarding an employee, a subsidiary employee with limited form access, a group employee creating a request for a selected legal company, an assigned signer, and a viewer who cannot sign. Verify denied access through direct API requests as well as the UI.

## Email and company branding

- Email after successful submission. The initial preference is to notify all assigned signers and distinguish who needs to act now from who is being informed. Link to the request behind sign-in. Choose a provider later. Design retries to avoid duplicate messages and keep the submitted route intact if delivery fails. Use synthetic recipients or a test delivery mode.
- In connected mode, super admins can upload, replace, or remove each legal company's logo under **Administration â†’ Company branding**. The four current forms use that company's name and optional logo in preview. On submission, the server saves both with the request so later branding changes do not affect its versions. The legacy Admin Work Request retains its original renderer.

## Pilot setup and first deliverable

Keep the existing stack where practical. Assess persistent storage for the database and attachments, HTTPS hosting, secrets, backup retention, and a restore rehearsal. Preserve the repository abstraction, approval banner, and official document layouts. Use synthetic records to verify access and signing before onboarding employees.

Start with a read-only assessment of implemented, simulated, and unverified behavior. Cite the relevant files. Propose the smallest accounts and permissions slice, its acceptance checks, and the decisions that affect it. Agree on the slice before editing application code.
