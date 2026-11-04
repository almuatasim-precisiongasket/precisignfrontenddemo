import { spawnSync } from 'node:child_process';
// Vercel hosts the browser demo. The SQLite API remains on persistent local disk.
const result = spawnSync(process.execPath, ['node_modules/vite/bin/vite.js', 'build'], {
  stdio: 'inherit', env: { ...process.env, VITE_DATA_MODE: 'demo', VITE_DEMO_NOTICE: 'true' }
});
if (result.error) throw result.error;
process.exitCode = result.status ?? 1;
