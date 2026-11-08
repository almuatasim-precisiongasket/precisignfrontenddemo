# Frontend URL routing

Start with `src/navigation/pageRoutes.ts`: `pagePaths`, `formPaths`, `parsePageRoute`, `pageRouteHref`. `src/navigation/usePageNavigation.ts` owns History API integration and navigation blocking. No router dependency was added.

## URL contract

| Page | URL |
| --- | --- |
| Overview | /dashboard (also /) |
| Forms Library | /forms |
| New request | /forms/:form/new |
| Review | /requests/:id |
| Lists | /requests?filter=pending, my, all, or approved (one value) |
| Archive | /archive |
| Profile | /settings/profile (also /settings) |
| Signing routes | /settings/signing-routes |
| User directory | /settings/users |
| Branding | /settings/branding |

Form slugs: administrative-payment, it-request, cash-voucher, expense-claim, rnd. Legacy admin-work remains available where already authorized. `/rnd` remains a compatible R&D editor entry in every mode; canonical new navigation uses /forms/rnd/new. Unknown paths render Page not found. Route paths/parameters are not an authorization policy.

## Ownership and integration

`AppContext` delegates existing setActiveView, setSelectedRequestFormType, setRequestsFilter and openReviewRequest to the navigation hook. Active view, request ID, form and list filter derive from its one URL-derived page state. The form/filter refs stage existing compound caller operations before navigation; they are not a second active page state. Existing sidebar/dashboard callers reuse this boundary. Table search/sort and company scope are not encoded in URLs.

Request deep links: after bootstrap/demo initialization, AppContext fetches through the current action repository, checks canReadPreciRoute, adds the permitted record to loaded data, selects its legal company and mounts ReviewSignView. Cancellation ignores late responses. Missing/denied reads share Request unavailable. API authorization remains authoritative; network failure also uses this neutral unavailable presentation (reload to retry). A request link does not require the record to have been present in the initial list.

`App.tsx` keeps connected authentication in front of workspace mounting. The destination URL remains unchanged through sign-in and mandatory password change. No external redirect parameter is accepted. Page guards reuse existing super-admin/workflow/form-start predicates and preserve the no-company empty state. They do not replace server checks.

Existing `/#reset=...` handling and `/document-export?request=...&version=...` remain in App.tsx, outside ordinary workspace routing. Do not replace these with hash routing. Existing Vercel/Express SPA fallback configuration already serves non-API deep paths; no hosting configuration was changed or deployed.

## Unsaved work

`useUnsavedWork` in AppContext registers editable-state snapshots for the four editor components (FinancialRequestView serves two forms) and review remarks/corrections. UI-only zoom/tabs are excluded. Attachments use IDs rather than duplicating base64 bytes in snapshots. In-app changes use Stay/Leave; browser Back restores the original history entry while asking. Refresh/close use the browser's native warning. Scope and demo-user changes also use the guard. Successful submission clears the guard before opening the saved request. Existing persistence is unchanged; this guard is conservative and may still warn about an edited legacy form whose draft was autosaved. It does not add draft persistence to other forms or restore discarded input when navigating Forward.

## Verification (8 November 2026)

Actually passed:
- `npm run lint` (TypeScript, not ESLint).
- `node --import tsx --test src/navigation/pageRoutes.test.ts src/context/AppContext.runAction.test.ts src/components/review/ReviewSignView.confirmation.test.ts src/utils/approvalJourney.test.ts src/utils/workflowEngine.test.ts src/services/repository.test.ts src/utils/companyAccess.test.ts src/services/apiSession.test.ts src/utils/routeAccess.test.ts` — 71 pass, 0 fail/skip.
- `node scripts/verify-navigation.mjs` — isolated showcase at localhost:3198; direct/refresh/list/detail routes, Back/Forward, repeat navigation, sidebar/Back/refresh guards, admin pages, unavailable pages, 390px layout.
- `node --import tsx scripts/verify-navigation-connected.mjs` — API-mode frontend at localhost:3199; all /api requests intercepted with synthetic fixtures. Login + mandatory password change retain target, detail not in initial list opens in its company, 403 neutral page, zero grants, PDF denial. No real backend or DB used.
- `node scripts/verify-review-ui.mjs` — existing synthetic signing/remarks journey remains working.
- Ordinary demo browser smoke at localhost:3200: direct forms, /rnd and archive.
- Production build to a unique temporary output folder; existing dist preserved. Existing Vite __dirname/future-loader and chunk-size warnings remain.

Run browser scripts only against verified isolated local frontends. Connected fixture testing is not a live deployment or end-to-end real-server certification. No production/pilot data accessed; no migration, commit, merge, push or deploy. A fresh clone still needs the pre-existing uncommitted source and these new navigation files.
