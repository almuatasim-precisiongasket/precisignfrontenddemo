# Task-specific verification

Run commands from the repository root using existing installed dependencies. Node must satisfy package.json (`>=24.11.0 <25`); inspected runtime is 24.11.0. No installation is needed for this checkout. Commands below are PowerShell-compatible unless marked otherwise. `npm run lint` runs `tsc --noEmit`, NOT ESLint.

## Select the smallest relevant check

Common success criterion: exit 0, all applicable tests pass, no unexplained skips. Report counts and failures, not simply "verified". The checked-in tests use synthetic fixtures, mocked storage, in-memory SQLite or temporary directories. Before executing a newly selected integration test, inspect its database creation, child-process environment and cleanup. Never assume DATABASE_PATH overrides an explicitly opened database. Never run provisioning/restore as a test against runtime storage.

| Purpose / when | Exact command | Prerequisites / expected result |
|---|---|---|
| TypeScript: any TS/TSX change | `npm run lint` | Existing dependencies; no type errors; no ESLint analysis |
| One focused unit file | `node --import tsx --test src/utils/dashboardFilters.test.ts` | Replace path with source-verified test, not a guessed package script |
| Required domain/repository baseline | `node --import tsx --test src/utils/approvalJourney.test.ts src/utils/workflowEngine.test.ts src/services/repository.test.ts src/utils/companyAccess.test.ts` | Pure rules/mock storage; no real DB |
| Authorization changes | `node --import tsx --test src/utils/companyAccess.test.ts src/utils/routeAccess.test.ts server/pilotAccess.test.ts server/reads.test.ts` | Inspect API fixture setup first; server suites open isolated memory DBs; legacy title-based fixtures do not define new policy |
| Express/API changes | `npm run test:server` | Script lists explicit server test files; inspect their isolation before run. It is not every server test (R&D, startup and backup have separate coverage) |
| Client API/session/drafts | `npm run test:api` | Mock transport/client coordination; no live backend required |
| Frontend characterization refactors | `node --import tsx --test src/components/review/ReviewSignView.confirmation.test.ts src/components/review/ReviewSupportingFiles.test.ts src/context/AppContext.runAction.test.ts src/utils/dashboardFilters.test.ts` | Not browser E2E; some tests extract actual function source text. A parsing failure can be a harness failure, not permission to weaken behavior assertions |
| Dashboard filters | `node --import tsx --test src/utils/dashboardFilters.test.ts` | Pure list filtering; preserves ordering/search semantics |
| Supporting files | `node --import tsx --test src/components/review/ReviewSupportingFiles.test.ts` | Server-rendered markup and callback checks; does not prove authenticated file delivery |
| AppContext action refresh | `node --import tsx --test src/context/AppContext.runAction.test.ts` | Mock repository; success/failure/conflict/duplicate pending cases; named demo/connected cases use same extracted orchestration, not full adapters |
| R&D workflow | `node --import tsx --test server/rnd.test.ts` | Inspect isolated memory fixture first; separate from historical repair |
| Official document byte integrity | `npm run test:document` | Exact renderer bytes; Windows CRLF checkout can differ from Git LF blob. Compare Git blob/worktree SHA-256, LF/CRLF and attributes/config before diagnosing. Do not alter protected renderer or weaken check to pass |
| Database backup/restore implementation | `npm run test:backup` | Tests create temporary databases and restore destinations; never substitute live paths |
| Startup smoke | `npm run test:startup` | Opens child process on loopback with explicit temporary DATABASE_PATH; expects existing frontend build. Review dist provenance first; this is not a frontend visual check |

## Discovery and full execution

Discover tests and references without loading all source:

```powershell
rg --files src server -g '*.test.ts' -g '*.test.tsx'
rg -n 'runAction|handleSignatureConfirmation|filterDashboardRequests' src server -g '*test*'
```

Inspect selected test imports/setup. Full available TS test discovery/execution (not executed during this stabilization):

```powershell
$testFiles = @(rg --files src server -g '*.test.ts' -g '*.test.tsx')
if ($testFiles.Count -eq 0) { throw 'No tests discovered' }
node --import tsx --test @testFiles
```

Do not claim `test:server` or a focused run is the full suite. Full execution additionally includes startup, backup, protected document and showcase tests, with their prerequisites. No global `npm test` script exists.

## Production build without overwriting dist

The build script is `vite build`; default output is dist, which may already be in use. The Vite config has no application DB initialization. Use a unique temporary output to preserve existing artifacts:

```powershell
$buildDestination = Join-Path ([System.IO.Path]::GetTempPath()) ('precisign-stabilization-build-' + [guid]::NewGuid())
npm run build -- --outDir $buildDestination
```

Expected: exit 0 and emitted assets. Do not use `--emptyOutDir` on an existing directory. Current warnings: future Vite native config loader does not support __dirname; large bundles. These warnings are not TS errors and were not fixed here. Build reads existing environment configuration; do not publish temporary output or print secrets. `build:vercel` and `build:showcase` are distinct scripts; this ordinary build does not certify deployed/demo/connected behavior.

## Browser verification

Available showcase-specific automation:
1. `npm run dev:showcase` (localhost port 3195).
2. In another terminal: `npm run test:showcase:browser`.

Prerequisites: local showcase mode, playwright-core and a compatible installed browser (Windows script selects Edge), no real accounts. Script uses a new browser context, enforces loopback URL and writes temporary screenshots/PDF. It currently expects fifteen seed records; this is a showcase fixture assertion, not a general app contract. `SHOWCASE_URL` and `SHOWCASE_OUTPUT` can configure local address/output; inspect script before use. `npm run verify:showcase:build` is a separate build-artifact check, not browser coverage.

For ordinary frontend work, run one desktop and one narrow-screen synthetic journey on an explicitly verified local mode. No generic connected-mode browser suite was verified. A browser-local demo cannot verify API enforcement; connected checks require an isolated DB/server. Do not use the pilot session. No browser test was executed for this documentation-only task.

## Historical repair checkout only

The separate historical-integrity-stage1 worktree contains `src/utils/historicalEvidence.test.ts` and `server/historicalRendering.test.ts`. From THAT root only, after inspecting isolation and browser dependencies:

```powershell
node --import tsx --test src/utils/historicalEvidence.test.ts server/historicalRendering.test.ts
```

These tests/guarantees are absent here. Do not copy repair code into this branch. Actual PDF generation requires a functioning browser renderer; passing metadata tests is not visual verification. Historical tests were not rerun by stabilization.

## Stabilization execution evidence

- `npm run lint`: PASS, exit 0.
- Combined domain/repository/access + four refactor suites: 71 tests, 71 pass, 0 fail, 0 skipped, 1.639 seconds reported test duration. Command recorded in [readiness notes](../handoff/stabilization.md).
- Temporary-output production build: PASS, exit 0; Vite transform/build 2.58 seconds, existing dist preserved.
- Other commands above: documented, NOT RUN during this task. No claim of complete workflow verification.
