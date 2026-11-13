import test from 'node:test';
import assert from 'node:assert/strict';
import {
  assertDisposableTursoTestEnv,
  assertDisposableTargetClean,
  normalizeDatabaseIdentity,
  initRemoteTursoTestDb,
} from './tursoTestSafety';
import type { AsyncDatabase } from './asyncDatabase';

test('normalizeDatabaseIdentity produces canonical URLs for equivalent spellings', () => {
  const canonical = 'https://precisign-test-muatasim.aws-ap-south-1.turso.io';

  assert.equal(
    normalizeDatabaseIdentity('libsql://precisign-test-muatasim.aws-ap-south-1.turso.io'),
    canonical
  );
  assert.equal(
    normalizeDatabaseIdentity('https://precisign-test-muatasim.aws-ap-south-1.turso.io:443/'),
    canonical
  );
  assert.equal(
    normalizeDatabaseIdentity('libsql://PRECISIGN-TEST-MUATASIM.AWS-AP-SOUTH-1.TURSO.IO/'),
    canonical
  );
  assert.equal(
    normalizeDatabaseIdentity('wss://precisign-test-muatasim.aws-ap-south-1.turso.io:443'),
    canonical
  );
});

test('Turso safety safeguards reject unsafe configurations before connection', () => {
  const origTestUrl = process.env.PRECISIGN_TURSO_TEST_URL;
  const origTestToken = process.env.PRECISIGN_TURSO_TEST_TOKEN;
  const origAppUrl = process.env.TURSO_DATABASE_URL;
  const origAppToken = process.env.TURSO_AUTH_TOKEN;

  try {
    // 1. Missing test credentials throws immediately
    delete process.env.PRECISIGN_TURSO_TEST_URL;
    delete process.env.PRECISIGN_TURSO_TEST_TOKEN;
    assert.throws(
      () => assertDisposableTursoTestEnv(),
      /Set PRECISIGN_TURSO_TEST_URL and PRECISIGN_TURSO_TEST_TOKEN/
    );

    // 2. Fallback to application database credentials is not permitted
    process.env.TURSO_DATABASE_URL = 'libsql://precisign-app.turso.io';
    process.env.TURSO_AUTH_TOKEN = 'secret-app-token';
    assert.throws(
      () => assertDisposableTursoTestEnv(),
      /Fallback to application database credentials is not permitted/
    );

    // 3. Equivalent URL spellings cannot bypass the application-database check
    const equivalentPairs = [
      ['libsql://precisign-app.turso.io', 'https://precisign-app.turso.io'],
      ['libsql://precisign-app.turso.io:443/', 'https://precisign-app.turso.io'],
      ['libsql://PRECISIGN-APP.TURSO.IO/', 'https://precisign-app.turso.io'],
      ['wss://precisign-app.turso.io', 'https://precisign-app.turso.io:443/'],
      ['http://precisign-app.turso.io:80/', 'http://precisign-app.turso.io'],
    ];

    for (const [testUrl, appUrl] of equivalentPairs) {
      process.env.PRECISIGN_TURSO_TEST_URL = testUrl;
      process.env.PRECISIGN_TURSO_TEST_TOKEN = 'test-token';
      process.env.TURSO_DATABASE_URL = appUrl;
      assert.throws(
        () => assertDisposableTursoTestEnv(),
        /matches configured application database/,
        `Expected rejection when testUrl (${testUrl}) matches appUrl (${appUrl})`
      );
    }

    // 4. Non-disposable hostname without 'test', 'disposable', or 'tmp' is rejected
    process.env.TURSO_DATABASE_URL = 'libsql://precisign-prod.turso.io';
    process.env.PRECISIGN_TURSO_TEST_URL = 'libsql://precisign-production.turso.io';
    process.env.PRECISIGN_TURSO_TEST_TOKEN = 'test-token';
    assert.throws(
      () => assertDisposableTursoTestEnv(),
      /does not clearly indicate a disposable test database/
    );

    // 5. Valid disposable test URL passes
    process.env.TURSO_DATABASE_URL = 'libsql://precisign-prod.turso.io';
    process.env.PRECISIGN_TURSO_TEST_URL = 'libsql://precisign-test-muatasim.aws-ap-south-1.turso.io';
    process.env.PRECISIGN_TURSO_TEST_TOKEN = 'valid-token';
    const result = assertDisposableTursoTestEnv();
    assert.equal(result.testUrl, 'libsql://precisign-test-muatasim.aws-ap-south-1.turso.io');
    assert.equal(result.testToken, 'valid-token');
  } finally {
    if (origTestUrl !== undefined) process.env.PRECISIGN_TURSO_TEST_URL = origTestUrl; else delete process.env.PRECISIGN_TURSO_TEST_URL;
    if (origTestToken !== undefined) process.env.PRECISIGN_TURSO_TEST_TOKEN = origTestToken; else delete process.env.PRECISIGN_TURSO_TEST_TOKEN;
    if (origAppUrl !== undefined) process.env.TURSO_DATABASE_URL = origAppUrl; else delete process.env.TURSO_DATABASE_URL;
    if (origAppToken !== undefined) process.env.TURSO_AUTH_TOKEN = origAppToken; else delete process.env.TURSO_AUTH_TOKEN;
  }
});

test('assertDisposableTargetClean detects populated targets across all sensitive tables', async () => {
  const createMockDb = (tableRows: Record<string, number>): AsyncDatabase => {
    return {
      execute: async (stmt: any) => {
        const sql = typeof stmt === 'string' ? stmt : stmt.sql;
        if (sql.includes('sqlite_master')) {
          return {
            columns: ['name'],
            columnTypes: ['TEXT'],
            rows: Object.keys(tableRows).map(name => ({ name })),
            rowsAffected: 0,
            lastInsertRowid: undefined,
            toJSON: () => ({}),
          };
        }
        for (const [table, count] of Object.entries(tableRows)) {
          if (sql.includes(`FROM ${table}`)) {
            return {
              columns: ['c'],
              columnTypes: ['INTEGER'],
              rows: [{ c: count }],
              rowsAffected: 0,
              lastInsertRowid: undefined,
              toJSON: () => ({}),
            };
          }
        }
        return {
          columns: [],
          columnTypes: [],
          rows: [],
          rowsAffected: 0,
          lastInsertRowid: undefined,
          toJSON: () => ({}),
        };
      },
      transaction: async () => {},
      close: () => {},
    } as unknown as AsyncDatabase;
  };

  // Rejects pre-existing accounts
  await assert.rejects(
    assertDisposableTargetClean(createMockDb({ users: 2 }), 'Mock Accounts Check'),
    /found 2 pre-existing account\(s\) in 'users'/
  );

  // Rejects pre-existing workflows
  await assert.rejects(
    assertDisposableTargetClean(createMockDb({ workflows: 1 }), 'Mock Workflows Check'),
    /found 1 pre-existing workflow\(s\) in 'workflows'/
  );

  // Rejects pre-existing requests
  await assert.rejects(
    assertDisposableTargetClean(createMockDb({ requests: 5 }), 'Mock Requests Check'),
    /found 5 pre-existing request\(s\) in 'requests'/
  );

  // Rejects pre-existing company logos (including empty logo rows)
  await assert.rejects(
    assertDisposableTargetClean(createMockDb({ company_logos: 1 }), 'Mock Logos Check'),
    /found 1 pre-existing logo row\(s\) in 'company_logos'/
  );

  // Rejects pre-existing drafts
  await assert.rejects(
    assertDisposableTargetClean(createMockDb({ drafts: 3 }), 'Mock Drafts Check'),
    /found 3 pre-existing draft\(s\) in 'drafts'/
  );

  // Completely clean mock target passes
  await assert.doesNotReject(
    assertDisposableTargetClean(
      createMockDb({ users: 0, workflows: 0, requests: 0, company_logos: 0, drafts: 0 }),
      'Clean Target Check'
    )
  );
});

test('rejected preflight prevents migration or fixture writes', async () => {
  const executedStatements: string[] = [];

  const populatedMockDb: AsyncDatabase = {
    execute: async (stmt: any) => {
      const sql = typeof stmt === 'string' ? stmt : stmt.sql;
      executedStatements.push(sql);
      if (sql.includes('sqlite_master')) {
        return {
          columns: ['name'],
          columnTypes: ['TEXT'],
          rows: [{ name: 'users' }, { name: 'requests' }],
          rowsAffected: 0,
          lastInsertRowid: undefined,
          toJSON: () => ({}),
        };
      }
      if (sql.includes('FROM users')) {
        return {
          columns: ['c'],
          columnTypes: ['INTEGER'],
          rows: [{ c: 1 }],
          rowsAffected: 0,
          lastInsertRowid: undefined,
          toJSON: () => ({}),
        };
      }
      return {
        columns: [],
        columnTypes: [],
        rows: [],
        rowsAffected: 0,
        lastInsertRowid: undefined,
        toJSON: () => ({}),
      };
    },
    transaction: async (work: any) => {
      executedStatements.push('TRANSACTION_BEGIN');
      return work(populatedMockDb);
    },
    close: () => {},
  } as unknown as AsyncDatabase;

  // Attempting preflight check on populated DB must reject
  await assert.rejects(
    assertDisposableTargetClean(populatedMockDb, 'Populated Preflight Check'),
    /found 1 pre-existing account\(s\) in 'users'/
  );

  // Assert that only read-only SELECT queries were executed: NO INSERT, UPDATE, DELETE, or CREATE
  const writeKeywords = ['INSERT', 'UPDATE', 'DELETE', 'CREATE', 'DROP', 'ALTER'];
  const writeStatements = executedStatements.filter(sql =>
    writeKeywords.some(keyword => new RegExp(`\\b${keyword}\\b`, 'i').test(sql))
  );

  assert.equal(
    writeStatements.length,
    0,
    `No write statements should be executed during rejected preflight, but found: ${JSON.stringify(writeStatements)}`
  );
  assert.equal(
    executedStatements.includes('TRANSACTION_BEGIN'),
    false,
    'No transaction or migration should begin on rejected preflight'
  );
});
