# Separate PreciSign showcase

Branch: `Demo-build`. This is a public, browser-only demonstration with fictional data, not employee sign-in or a connected pilot.

## Included

- Nine requests covering Administrative & Payment Request, IT Request, Cash Voucher, Expense Claim and R&D Initiative.
- Pending signatures, a returned request, completed routes, an explicit bypass, a completed R&D evaluation and a replacement waiting for acceptance.
- Fifteen signing routes: all five forms for PEW, ICCL and FSG.
- Six sample employees with `example.test` email addresses and synthetic signature marks and supporting attachments.
- Start as **Afzal Kazi**, the final approver, in Group View. Use **Try as** to switch employees without passwords.
- **Anzar** submits requests and handles corrections. **Shekhar** performs department review. **Farida** handles finance and can accept the pending backup assignment. **Muatasim** is the sample administrator. **Taqvi** handles IT work.
- The sample administrator can manage directory grants, account status and company logos. All changes affect only this visitor's browser. Password resets, real account sessions and email delivery are excluded.

## Local review

```powershell
npm run dev:showcase
```

Open `http://127.0.0.1:3195/`. The ordinary local app can remain on its existing port.

**Reset demo** restores the samples and clears only showcase drafts. Changes survive a refresh. A fresh browser profile starts independently. Do not enter real employee or document data.

## Storage and build isolation

Showcase storage keys start with `precisign_showcase_v1_`. The existing `precisign_repo_*` keys are preserved, including when the demo is reset. No SQLite database is used.

`.env.showcase` contains public flags only. It is deliberately tracked and must never contain credentials. Showcase builds replace older employee seed fixtures with `showcaseBase.ts`; reusable company definitions remain in `companies.ts`.

```powershell
npm run build:showcase
node scripts/verify-showcase-build.mjs
```

## Publish to a separate Vercel project

1. Review and commit the intended source on `Demo-build`, including the R&D files this showcase depends on. Exclude databases, credentials, generated PDFs and screenshots.
2. Push `Demo-build` to the repository.
3. Create a **new Vercel project**, such as `precisign-showcase`, importing the same repository. Choose `Demo-build` as its Production Branch. Do not repoint the existing MVP project.
4. Use the repository's `vercel.json`: build command `npm run build:vercel`, output `dist`.
5. Set `PRECISIGN_SHOWCASE=true` for Production and Preview in the new project. No backend URL, database credentials or email keys are required.
6. Deploy and check the generated project's URL in a fresh browser. Confirm the showcase banner, Afzal Kazi, nine requests and all five forms. Check that the link is accessible to the intended viewers under that project's deployment-protection settings.

`build:vercel` keeps the ordinary demo configuration unless `PRECISIGN_SHOWCASE` is explicitly `true`. Showcase builds run the output check that rejects the older employee fixtures. A separate hostname also keeps browser storage separate from the existing MVP.

The showcase code does not provision infrastructure, enable paid products or deploy itself. Publishing is a separate operation.

## Focused verification

```powershell
npm run lint
npm run test:showcase
node --import tsx --test src/utils/approvalJourney.test.ts src/utils/workflowEngine.test.ts src/services/repository.test.ts src/utils/companyAccess.test.ts src/services/apiRepository.test.ts server/rnd.test.ts
node scripts/verify-showcase.mjs
```

The browser smoke test uses an isolated Edge context against localhost. It covers signing and refresh persistence, the admin access editor, all five library entries, a 390px viewport, a two-page R&D PDF, a separate visitor, and resetting. Screenshots and the synthetic PDF go to the operating-system temporary directory, not the repository. Visually inspect both PDF pages after changing the renderer.

All account administration and session controls in this showcase are demonstrations. Connected-mode authorization remains server-side; this static showcase does not provide that security boundary.
