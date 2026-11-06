# Local API — Batch 1

**Batch 1 baseline.** See the [local pilot guide](LOCAL_PILOT.md) for the connected runtime and the [pre-production handoff](PRE_PRODUCTION.md) for planned account and access work.

The frontend remains a browser demo. This batch supplies the isolated API foundation and authentication; it does not connect the interface, provide request endpoints or deploy anything.

## Runtime and startup

Use Node 24.11 or newer within Node 24. `node:sqlite` is experimental on 24.11 and emits a warning. The server uses built-in SQLite, crypto and the existing Express dependency; no ORM or database service is required.

```powershell
npm install
npm run test:server
npm run provision:user
npm run dev:server
```

Provisioning requires an interactive terminal. It asks for email, name, department, company, role and a hidden password twice (12–1024 characters). Do not put passwords on the command line. There is no shared default login or automatic demo account import. Provisioned users have only their primary company unless a later reviewed administration process grants more. Director/GM roles follow the established group-access business rules, so assign roles deliberately. Local filesystem access controls access to the provisioning command and database.

The database defaults to `data/precisign.sqlite` and is created on first startup/provisioning. Configure DATABASE_PATH for a different local disk location. Keep the SQLite file and its WAL/SHM files out of source control. Schema version 1 seeds only PEW/ICCL/FSG company definitions. It does not seed users, requests or workflows.

API listens on loopback `127.0.0.1:3001`. APP_ORIGIN defaults to `http://127.0.0.1:3000`; callers must send that exact Origin on POST requests. Later Vite integration will proxy /api to this server. NODE_ENV=production requires an HTTPS APP_ORIGIN and sets Secure cookies. The production proxy/hosting arrangement is not implemented in this batch. Do not expose the development API publicly.

## Endpoints

- GET /api/health: public startup check.
- POST /api/auth/login: JSON email/password; generic failures and IP rate limiting (10 attempts per 15 minutes, including successes). No forwarded IP headers are trusted.
- GET /api/auth/me: safe current UserProfile only.
- POST /api/auth/logout: revoke the current session and expire its cookie.

Except health/login, /api routes require a valid session. Unimplemented endpoints return 404 for authenticated callers. Mutation origin checking runs before authentication. Sessions have a fixed 12-hour expiry and persist across process restarts; raw random tokens exist only in the HttpOnly/SameSite cookie, with SHA-256 hashes stored in SQLite. Separate sessions are independent. Login rotates the caller's existing token. Passwords use Node scrypt with random salts; credential/session columns never appear in profile responses. Rate limits are local to this process and reset on restart; that is acceptable for the local pilot, not a distributed deployment.

## Verification

`npm run test:server` uses temporary/in-memory databases and real HTTP calls to isolated loopback servers. Covers schema/reopen, rollback, duplicate email, invalid company, salted passwords, incorrect password, missing/malformed/expired sessions, logout, independent sessions, origin rejection, rate limits, redaction and production cookie settings. It does not use real employee credentials. Run the existing business tests, lint and build alongside this suite.

Interactive password-entry rendering and real browser cookie behavior still require local manual verification. No real employee account has been provisioned by this implementation. Browser integration belongs to T16; workflow provisioning belongs before T17.
