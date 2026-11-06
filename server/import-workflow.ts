import 'dotenv/config';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { openDatabase } from './db';
import { saveWorkflowConfig } from './workflows';
import type { WorkflowConfig } from '../src/types/index';

const file = process.argv[2];
if (!file) throw new Error('Usage: npm run import:workflow -- path-to-reviewed-workflow.json');
const config = JSON.parse(readFileSync(resolve(file), 'utf8')) as WorkflowConfig;
const db = openDatabase(resolve(process.env.DATABASE_PATH || 'data/precisign.sqlite'));
try {
  const saved = saveWorkflowConfig(db, config);
  console.log(`Workflow imported as version ${saved.version}. Existing request snapshots remain unchanged.`);
} finally { db.close(); }
