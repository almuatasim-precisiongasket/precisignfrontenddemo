# Deploy the frontend demo to Vercel

The included vercel.json selects Vite, npm run build:vercel and dist. Import the repository into Vercel, use the repository root, and select Node 24.x. Install using npm ci. No API key or database credentials are needed for this demo. Do not add secrets with VITE_ prefixes: Vite exposes those values to browsers.

The build script explicitly selects demo mode and displays a demo notice. This is a browser-local prototype with sample personas; it is not authenticated multi-user company storage. Data belongs to the visitor's browser/origin. Use synthetic information only. This command is separate from npm run build, so existing local API builds retain their behavior. SPA navigation falls back to index.html; /api paths are excluded and have no hosted API in this configuration.

The existing Express + node:sqlite backend needs persistent local disk. Vercel Functions do not provide durable local filesystem storage for that SQLite database. Do not deploy server/index.ts as a function or put its database under /tmp and treat it as persistent. A real multi-user deployment needs a separately hosted persistent API behind a reviewed same-origin proxy, or a separately authorized storage migration. No such infrastructure is created by this change.

Official references: https://vercel.com/docs/frameworks/frontend/vite and https://vercel.com/kb/guide/is-sqlite-supported-in-vercel.

Verification before release: npm run lint; required AGENTS business tests; npm run test:server; npm run build:vercel. Actual Vercel build, deep-link routing, browser-local saves and response headers require a deployed preview and remain unverified until deployment. This task prepares the source; it does not publish a deployment or push a commit.
