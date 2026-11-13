import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { openAsyncDatabase, migrateAsyncDatabase, type AsyncDatabase } from '../server/asyncDatabase';
import { openDatabase, schemaVersion } from '../server/db';
import { hashPassword, tokenHash } from '../server/auth';
import { initRemoteTursoTestDb } from '../server/tursoTestSafety';
import type { RequestRecord } from '../src/types';

type AppDatabase = ReturnType<typeof openDatabase>;

async function main() {
  console.log('=== Starting SQLite-to-Turso Migration & Turso Backup/Restore Rehearsal ===');

  const tursoDb: AsyncDatabase = await initRemoteTursoTestDb('Migration Rehearsal');

  const runId = randomUUID().slice(0, 8);
  const tempDir = mkdtempSync(join(tmpdir(), `precisign-migration-${runId}-`));
  const sqliteSourcePath = join(tempDir, 'source.sqlite');
  const restorePath = join(tempDir, 'restored.sqlite');

  let sourceDb: AppDatabase | undefined;
  let restoredDb: AppDatabase | undefined;

  const userId = `mig-user-${runId}`;
  const requestId = `PEW-AW-2026-${runId}`;

  try {
    console.log(`1. Creating synthetic SQLite source database at: ${sqliteSourcePath}`);
    sourceDb = openDatabase(sqliteSourcePath);

    const passwordHash = await hashPassword('Synthetic-migration-pass-123');
    const sampleSignature = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAIAAAACCAIAAAD91JpzAAAACXBIWXMAAAPoAAAD6AG1e1JrAAAAEUlEQVR4nGMQMgkTMgljgFAAEA4CcUNrdOsAAAAASUVORK5CYII=';

    const syntheticAttachment = {
      id: `att-${runId}`,
      name: 'contract.png',
      sizeBytes: 85,
      sizeFormatted: '1 KB',
      uploadedAt: new Date().toISOString(),
      uploadedBy: 'Migration Tester',
      mimeType: 'image/png',
      dataUrl: sampleSignature,
    };

    const syntheticRequestRecord: RequestRecord = {
      id: requestId,
      companyId: 'PEW',
      formType: 'Admin Work Request',
      title: 'Synthetic migration work description with attachment',
      status: 'Approved',
      documentVersion: 2,
      workflowVersion: 1,
      currentApproverId: userId,
      currentStageIndex: 1,
      requesterId: userId,
      requesterName: 'Migration Tester',
      requesterRole: 'Director',
      department: 'Engineering',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      formData: {
        dateOfRequest: '2026-11-10',
        companyId: 'PEW',
        companyName: 'PEW - Precision Engineering Works',
        requesterId: userId,
        requesterName: 'Migration Tester',
        department: 'Engineering',
        priority: 'Urgent',
        workDescription: 'Synthetic migration work description with attachment (version 2)',
        documents: {
          onlineDocumentChamber: false,
          physicalDocumentChamber: false,
          companyDocumentAjeer: false,
          employeeSalaryCertificate: false,
          permanentEmploymentVisa: false,
          workVisitVisa: false,
          businessVisitVisa: false,
          agencyWakala: false,
          others: false,
          othersDescription: '',
        },
      },
      workflowConfig: {
        id: `wf-${runId}`,
        companyId: 'PEW',
        formType: 'Admin Work Request',
        version: 1,
        stages: [],
        preventSelfApproval: true,
        allowDirectorOverride: false,
        reminderDays: 3,
        escalationDays: 5,
        rejectionBehavior: 'archive',
        returnBehavior: 'restart_workflow',
      },
      approvalSteps: [],
      approvalHistory: [
        {
          id: `h1-${runId}`,
          stepNumber: 0,
          actionByUserId: userId,
          actionByName: 'Migration Tester',
          actionByRole: 'Director',
          action: 'Submitted',
          dateTime: new Date().toISOString(),
          comments: 'Initial submission',
          version: 1,
        },
        {
          id: `h2-${runId}`,
          stepNumber: 0,
          actionByUserId: userId,
          actionByName: 'Migration Tester',
          actionByRole: 'Director',
          action: 'Returned for Correction',
          dateTime: new Date().toISOString(),
          comments: 'Please elaborate',
          version: 1,
        },
        {
          id: `h3-${runId}`,
          stepNumber: 0,
          actionByUserId: userId,
          actionByName: 'Migration Tester',
          actionByRole: 'Director',
          action: 'Submitted',
          dateTime: new Date().toISOString(),
          comments: 'Resubmitted with elaboration',
          version: 2,
        },
        {
          id: `h4-${runId}`,
          stepNumber: 1,
          actionByUserId: userId,
          actionByName: 'Approver',
          actionByRole: 'Director',
          action: 'Approved',
          dateTime: new Date().toISOString(),
          comments: 'Approved in migration rehearsal',
          version: 2,
        },
      ],
      attachments: [syntheticAttachment],
      attachmentVersions: [
        { version: 1, attachments: [syntheticAttachment] },
        { version: 2, attachments: [syntheticAttachment] },
      ],
      versionSnapshots: [
        {
          version: 1,
          updatedAt: new Date().toISOString(),
          updatedBy: 'Migration Tester',
          formData: {
            dateOfRequest: '2026-11-10',
            companyId: 'PEW',
            companyName: 'PEW - Precision Engineering Works',
            requesterId: userId,
            requesterName: 'Migration Tester',
            department: 'Engineering',
            priority: 'Urgent',
            workDescription: 'Initial work description (version 1)',
            documents: {
              onlineDocumentChamber: false,
              physicalDocumentChamber: false,
              companyDocumentAjeer: false,
              employeeSalaryCertificate: false,
              permanentEmploymentVisa: false,
              workVisitVisa: false,
              businessVisitVisa: false,
              agencyWakala: false,
              others: false,
              othersDescription: '',
            },
          },
          changeNote: 'Initial version',
        },
        {
          version: 2,
          updatedAt: new Date().toISOString(),
          updatedBy: 'Migration Tester',
          formData: {
            dateOfRequest: '2026-11-10',
            companyId: 'PEW',
            companyName: 'PEW - Precision Engineering Works',
            requesterId: userId,
            requesterName: 'Migration Tester',
            department: 'Engineering',
            priority: 'Urgent',
            workDescription: 'Synthetic migration work description with attachment (version 2)',
            documents: {
              onlineDocumentChamber: false,
              physicalDocumentChamber: false,
              companyDocumentAjeer: false,
              employeeSalaryCertificate: false,
              permanentEmploymentVisa: false,
              workVisitVisa: false,
              businessVisitVisa: false,
              agencyWakala: false,
              others: false,
              othersDescription: '',
            },
          },
          changeNote: 'Elaborated description',
        },
      ],
    };

    // Populate synthetic SQLite source
    sourceDb.prepare(`
      INSERT INTO users (id, email, name, role, department, company_id, password_hash)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(userId, `mig-${runId}@example.test`, 'Migration Tester', 'Director', 'Engineering', 'PEW', passwordHash);

    sourceDb.prepare(`
      INSERT INTO account_access (user_id, company_grants, form_grants, is_super_admin, is_disabled)
      VALUES (?, ?, ?, ?, 0)
    `).run(
      userId,
      JSON.stringify(['PEW', 'ICCL']),
      JSON.stringify({ PEW: ['Admin Work Request'] }),
      1
    );

    sourceDb.prepare(`
      INSERT INTO user_signatures (user_id, signature_data_url, signature_style_text)
      VALUES (?, ?, ?)
    `).run(userId, sampleSignature, 'Migration Tester');

    sourceDb.prepare(`
      INSERT INTO requests (id, company_id, requester_id, status, revision, record)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(requestId, 'PEW', userId, 'Approved', 4, JSON.stringify(syntheticRequestRecord));

    // Sessions and password resets seeded in source SQLite that must be excluded during migration
    sourceDb.prepare(`
      INSERT INTO sessions (token_hash, user_id, expires_at)
      VALUES (?, ?, ?)
    `).run(tokenHash('sqlite-source-token'), userId, Date.now() + 3600000);

    sourceDb.prepare(`
      INSERT INTO password_resets (user_id, token_hash, expires_at)
      VALUES (?, ?, ?)
    `).run(userId, tokenHash('sqlite-source-reset'), Date.now() + 1800000);

    console.log('2. Seeded SQLite source with synthetic account, grants, signatures, attachment, request versions, and active sessions.');

    // ============================================================
    // Step A: Rehearse SQLite-to-Turso Import
    // ============================================================
    console.log('3. [Rehearsal A] Executing SQLite-to-Turso transactional import...');

    const sourceUsers = sourceDb.prepare('SELECT * FROM users WHERE id=?').all(userId) as any[];
    const sourceAccess = sourceDb.prepare('SELECT * FROM account_access WHERE user_id=?').all(userId) as any[];
    const sourceSignatures = sourceDb.prepare('SELECT * FROM user_signatures WHERE user_id=?').all(userId) as any[];
    const sourceRequests = sourceDb.prepare('SELECT * FROM requests WHERE id=?').all(requestId) as any[];

    await tursoDb.transaction(async tx => {
      for (const u of sourceUsers) {
        await tx.execute(
          'INSERT INTO users (id, email, name, role, department, company_id, allowed_companies, group_admin, password_hash) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
          [u.id, u.email, u.name, u.role, u.department, u.company_id, u.allowed_companies ?? '[]', u.group_admin ?? 0, u.password_hash]
        );
      }
      for (const a of sourceAccess) {
        await tx.execute(
          'INSERT INTO account_access (user_id, company_grants, form_grants, is_super_admin, is_disabled, must_change_password, role_override) VALUES (?, ?, ?, ?, ?, ?, ?)',
          [a.user_id, a.company_grants, a.form_grants, a.is_super_admin, a.is_disabled, a.must_change_password ?? 0, a.role_override ?? null]
        );
      }
      for (const s of sourceSignatures) {
        await tx.execute(
          'INSERT INTO user_signatures (user_id, signature_data_url, signature_style_text) VALUES (?, ?, ?)',
          [s.user_id, s.signature_data_url, s.signature_style_text]
        );
      }
      for (const r of sourceRequests) {
        await tx.execute(
          'INSERT INTO requests (id, company_id, requester_id, status, revision, record) VALUES (?, ?, ?, ?, ?, ?)',
          [r.id, r.company_id, r.requester_id, r.status, r.revision, r.record]
        );
      }
      // Sessions and password resets are strictly excluded from the migration import for security
    });

    console.log('4. [Rehearsal A] Verifying Turso records against SQLite source...');
    const tursoUser = (await tursoDb.execute('SELECT * FROM users WHERE id=?', [userId])).rows[0];
    const tursoAccess = (await tursoDb.execute('SELECT * FROM account_access WHERE user_id=?', [userId])).rows[0];
    const tursoSig = (await tursoDb.execute('SELECT * FROM user_signatures WHERE user_id=?', [userId])).rows[0];
    const tursoReq = (await tursoDb.execute('SELECT * FROM requests WHERE id=?', [requestId])).rows[0];

    assert.equal(tursoUser.email, sourceUsers[0].email);
    assert.equal(tursoUser.password_hash, sourceUsers[0].password_hash);
    assert.deepEqual(JSON.parse(String(tursoAccess.company_grants)), ['PEW', 'ICCL']);
    assert.equal(tursoSig.signature_data_url, sampleSignature);

    const importedRecord = JSON.parse(String(tursoReq.record)) as RequestRecord;
    assert.equal(importedRecord.id, requestId);
    assert.equal(importedRecord.documentVersion, 2);
    assert.equal(importedRecord.attachments.length, 1);
    assert.equal(importedRecord.attachments[0].name, 'contract.png');
    assert.equal(importedRecord.attachments[0].sizeBytes, 85);
    assert.equal(importedRecord.attachments[0].dataUrl, sampleSignature);
    assert.equal(importedRecord.approvalHistory.length, 4);
    assert.equal(importedRecord.versionSnapshots.length, 2);
    assert.equal(importedRecord.versionSnapshots[0].version, 1);
    assert.equal(importedRecord.versionSnapshots[1].version, 2);

    // Verify sessions and reset tokens were NOT migrated to Turso
    const tursoSessions = await tursoDb.execute('SELECT COUNT(*) as c FROM sessions WHERE user_id=?', [userId]);
    const tursoResets = await tursoDb.execute('SELECT COUNT(*) as c FROM password_resets WHERE user_id=?', [userId]);
    assert.equal(Number(tursoSessions.rows[0].c), 0, 'Sessions must be excluded from Turso migration');
    assert.equal(Number(tursoResets.rows[0].c), 0, 'Password resets must be excluded from Turso migration');

    console.log('5. [Rehearsal A] SQLite-to-Turso verification passed (Counts, IDs, grants, signatures, attachment bytes, history, versions match; legacy sessions/resets excluded).');

    // ============================================================
    // Step B: Rehearse Rollback Procedure
    // ============================================================
    console.log('6. [Rehearsal B] Testing migration transaction rollback on simulated error...');
    const badId = `bad-${runId}`;
    await assert.rejects(
      tursoDb.transaction(async tx => {
        await tx.execute('INSERT INTO users (id, email, name, role, department, company_id, password_hash) VALUES (?, ?, ?, ?, ?, ?, ?)',
          [badId, `bad-${runId}@example.test`, 'Bad User', 'Admin', 'Test', 'PEW', passwordHash]);
        throw new Error('Simulated network fault or disk error during migration');
      }),
      /Simulated network fault/
    );
    const badCheck = await tursoDb.execute('SELECT 1 FROM users WHERE id=?', [badId]);
    assert.equal(badCheck.rows.length, 0, 'Rollback must leave no orphaned records.');
    console.log('7. [Rehearsal B] Rollback verification passed.');

    // ============================================================
    // Step C: Rehearse Turso Backup & Restore to Disposable Destination
    // ============================================================
    console.log('8. [Rehearsal C] Simulating live sessions in Turso before backup snapshot...');
    // Seed an active session and password reset in Turso to verify backup extraction and subsequent restore hygiene
    await tursoDb.execute('INSERT INTO sessions (token_hash, user_id, expires_at) VALUES (?, ?, ?)', [
      tokenHash('turso-live-token'),
      userId,
      Date.now() + 3600000,
    ]);
    await tursoDb.execute('INSERT INTO password_resets (user_id, token_hash, expires_at) VALUES (?, ?, ?)', [
      userId,
      tokenHash('turso-live-reset'),
      Date.now() + 1800000,
    ]);

    console.log('9. [Rehearsal C] Executing consistent transactional snapshot for Turso backup extraction...');
    const tables = ['companies', 'users', 'account_access', 'workflows', 'requests', 'drafts', 'company_logos', 'user_signatures', 'sessions', 'password_resets'];
    const backupDump: Record<string, any[]> = {};

    // Consistent database snapshot using a single interactive transaction
    await tursoDb.transaction(async tx => {
      for (const t of tables) {
        const res = await tx.execute(`SELECT * FROM ${t}`);
        backupDump[t] = res.rows;
      }
    });

    console.log(`10. [Rehearsal C] Restoring Turso dump into disposable destination: ${restorePath}`);
    restoredDb = openDatabase(restorePath);

    // Restore data into fresh destination SQLite
    for (const t of tables) {
      const rows = backupDump[t] || [];
      for (const row of rows) {
        const keys = Object.keys(row);
        const placeholders = keys.map(() => '?').join(',');
        const sql = `INSERT OR REPLACE INTO ${t} (${keys.join(',')}) VALUES (${placeholders})`;
        const values = Object.values(row) as (string | number | null)[];
        restoredDb.prepare(sql).run(...values);
      }
    }

    // Verify seeded sessions and password resets were captured in the backup dump before hygiene
    const preHygieneSessions = (restoredDb.prepare('SELECT count(*) as c FROM sessions WHERE user_id=?').get(userId) as any).c;
    const preHygieneResets = (restoredDb.prepare('SELECT count(*) as c FROM password_resets WHERE user_id=?').get(userId) as any).c;
    assert.equal(preHygieneSessions, 1, 'Seeded Turso session must be present in raw backup dump');
    assert.equal(preHygieneResets, 1, 'Seeded Turso password reset must be present in raw backup dump');

    // Enforce restore hygiene: revoke active sessions and password reset tokens in restored database
    restoredDb.prepare('DELETE FROM sessions').run();
    restoredDb.prepare('DELETE FROM password_resets').run();

    // Validate restored database
    const restoredReq = restoredDb.prepare('SELECT * FROM requests WHERE id=?').get(requestId) as any;
    assert.ok(restoredReq, 'Request must exist in restored database');
    const restoredRecord = JSON.parse(String(restoredReq.record)) as RequestRecord;
    assert.equal(restoredRecord.id, requestId);
    assert.equal(restoredRecord.documentVersion, 2);
    assert.equal(restoredRecord.attachments.length, 1);
    assert.equal(restoredRecord.attachments[0].name, 'contract.png');
    assert.equal(restoredRecord.attachments[0].dataUrl, sampleSignature);
    assert.equal(restoredRecord.approvalHistory.length, 4);
    assert.equal(restoredRecord.versionSnapshots.length, 2);
    assert.equal(restoredRecord.versionSnapshots[0].version, 1);
    assert.equal(restoredRecord.versionSnapshots[1].version, 2);

    const restoredUser = restoredDb.prepare('SELECT * FROM users WHERE id=?').get(userId) as any;
    assert.equal(restoredUser.email, `mig-${runId}@example.test`);

    const restoredSig = restoredDb.prepare('SELECT * FROM user_signatures WHERE user_id=?').get(userId) as any;
    assert.equal(restoredSig.signature_data_url, sampleSignature);

    const postHygieneSessions = (restoredDb.prepare('SELECT count(*) as c FROM sessions WHERE user_id=?').get(userId) as any).c;
    const postHygieneResets = (restoredDb.prepare('SELECT count(*) as c FROM password_resets WHERE user_id=?').get(userId) as any).c;
    assert.equal(postHygieneSessions, 0, 'Sessions must be revoked on restore');
    assert.equal(postHygieneResets, 0, 'Password resets must be revoked on restore');

    console.log('11. [Rehearsal C] Turso Backup and Restore verification passed (Exact matching of accounts, grants, request versions, history, attachment bytes, signature bytes; active sessions and password resets revoked).');
    console.log('=== All Migration & Backup/Restore Rehearsals Passed Successfully! ===');
  } finally {
    console.log('Cleaning up synthetic rehearsal records in Turso...');
    try {
      await tursoDb.transaction(async tx => {
        await tx.execute('DELETE FROM requests WHERE id=?', [requestId]);
        await tx.execute('DELETE FROM user_signatures WHERE user_id=?', [userId]);
        await tx.execute('DELETE FROM account_access WHERE user_id=?', [userId]);
        await tx.execute('DELETE FROM sessions WHERE user_id=?', [userId]);
        await tx.execute('DELETE FROM password_resets WHERE user_id=?', [userId]);
        await tx.execute('DELETE FROM users WHERE id=?', [userId]);
      });
      console.log('Turso cleanup complete.');
    } catch (cleanupErr) {
      console.error('Failed to clean up rehearsal records in Turso:', cleanupErr);
      throw cleanupErr;
    } finally {
      if (sourceDb) {
        try { sourceDb.close(); } catch {}
      }
      if (restoredDb) {
        try { restoredDb.close(); } catch {}
      }
      tursoDb.close();
      try {
        rmSync(tempDir, { recursive: true, force: true });
      } catch (err) {
        console.error(`Failed to remove temp dir ${tempDir}:`, err);
      }
    }
  }
}

main().catch(err => {
  console.error('Rehearsal failed:', err);
  process.exit(1);
});
