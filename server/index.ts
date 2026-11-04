import 'dotenv/config';
import { mkdirSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { openDatabase } from './db';
import { createApp } from './app';
import express from 'express';
import { existsSync } from 'node:fs';

const production = process.env.NODE_ENV === 'production';
const port = Number(process.env.API_PORT || 3001);
if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('Invalid API_PORT.');
const origin = process.env.APP_ORIGIN || 'http://127.0.0.1:3000';
if (production && !origin.startsWith('https://')) throw new Error('Set APP_ORIGIN to the HTTPS application origin.');
const path = resolve(process.env.DATABASE_PATH || 'data/precisign.sqlite');
mkdirSync(dirname(path), { recursive: true });
const db = openDatabase(path);
const app = await createApp(db, { origin, secureCookies: production });
if (production) {
  if (process.env.VITE_DATA_MODE !== 'api') throw new Error('Production requires VITE_DATA_MODE=api at build and start.');
  const dist = resolve('dist');
  if (!existsSync(resolve(dist,'index.html'))) throw new Error('Build the frontend first.');
  // API factory installs a terminal 404; serve the frontend before its routes.
  const site = express();
  site.use('/api', (req,res,next) => { req.url = '/api' + req.url; app(req,res,next); });
  site.use(express.static(dist));
  site.get('*', (_req,res) => res.sendFile(resolve(dist,'index.html')));
  const server = site.listen(port,'127.0.0.1',()=>console.log(`PreciSign listening on http://127.0.0.1:${port}`));
  for (const signal of ['SIGINT','SIGTERM'] as const) process.on(signal,()=>server.close(()=>{db.close();process.exit(0);}));
} else {
const server = app.listen(port, '127.0.0.1', () => console.log(`PreciSign API listening on http://127.0.0.1:${port}`));
for (const signal of ['SIGINT', 'SIGTERM'] as const) process.on(signal, () => server.close(() => { db.close(); process.exit(0); }));
}
