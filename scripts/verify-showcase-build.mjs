import { readdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';

const files = (await readdir('dist/assets')).filter(name => name.endsWith('.js'));
const bundle = (await Promise.all(files.map(name => readFile(join('dist/assets', name), 'utf8')))).join('\n');
if (!bundle.includes('precisign_showcase_v1')) throw new Error('This is not a showcase build.');
const forbidden = ['@precision-eg.com', 'user-afzal', 'user-anzar', 'muatasim@test.com'];
for (const value of forbidden) if (bundle.includes(value)) throw new Error(`Older employee/demo fixture found in showcase output: ${value}`);
console.log('Showcase build verified: isolated dataset present; older employee fixtures excluded.');
