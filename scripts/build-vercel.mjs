import { spawnSync } from 'node:child_process';
// Vercel hosts the browser demo. The SQLite API remains on persistent local disk.
const result = spawnSync(process.execPath, ['node_modules/vite/bin/vite.js', 'build'], {
  stdio: 'inherit', env: { ...process.env, VITE_DATA_MODE: 'demo', VITE_DEMO_NOTICE: 'true', VITE_SHOWCASE: process.env.PRECISIGN_SHOWCASE === 'true' ? 'true' : 'false' }
});
if (result.error) throw result.error;
process.exitCode = result.status ?? 1;
if (result.status === 0 && process.env.PRECISIGN_SHOWCASE === 'true') {
  const verification = spawnSync(process.execPath, ['scripts/verify-showcase-build.mjs'], { stdio: 'inherit' });
  if (verification.error) throw verification.error;
  process.exitCode = verification.status ?? 1;
}
