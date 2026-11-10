import { Router } from 'express';
import type { DatabaseSync } from 'node:sqlite';
import { bytes, fields, text } from './requestValidation';
import { transaction } from './db';
import type { AsyncDatabase, AsyncQueryConnection } from './asyncDatabase';

export async function ownSignatureAsync(db: AsyncQueryConnection, userId: string) {
  const result = await db.execute('SELECT signature_data_url,signature_style_text FROM user_signatures WHERE user_id=?', [userId]);
  const row = result.rows[0];
  return row ? { signatureDataUrl: String(row.signature_data_url), signatureStyleText: String(row.signature_style_text) } : {};
}

/** The caller must revalidate the session inside the supplied transaction. */
export async function saveOwnSignatureAsync(db: AsyncDatabase, requireCurrentUser: (tx: AsyncQueryConnection) => Promise<{ id: string; name: string }>, signature: string, style: string) {
  return db.transaction(async tx => {
    const actor = await requireCurrentUser(tx);
    if (style !== actor.name) return null;
    await tx.execute('INSERT INTO user_signatures VALUES (?,?,?) ON CONFLICT(user_id) DO UPDATE SET signature_data_url=excluded.signature_data_url, signature_style_text=excluded.signature_style_text', [actor.id, signature, style]);
    return { ...actor, ...await ownSignatureAsync(tx, actor.id) };
  });
}

export function ownSignature(db: DatabaseSync, userId: string) {
  const row = db.prepare('SELECT signature_data_url,signature_style_text FROM user_signatures WHERE user_id=?').get(userId);
  return row ? { signatureDataUrl: String(row.signature_data_url), signatureStyleText: String(row.signature_style_text) } : {};
}

export function profileRoutes(db: DatabaseSync | AsyncDatabase) {
  const router = Router();
  router.patch('/me/signature', async (req, res, next) => {
    try {
      fields(req.body, ['signatureDataUrl', 'signatureStyleText']);
      await bytes(req.body.signatureDataUrl, true);
      const style = text(req.body.signatureStyleText, 150);
      const profile = 'prepare' in db ? transaction(db, () => {
        const actor = res.locals.requireCurrentUser();
        if (style !== actor.name) return null;
        db.prepare('INSERT INTO user_signatures VALUES (?,?,?) ON CONFLICT(user_id) DO UPDATE SET signature_data_url=excluded.signature_data_url, signature_style_text=excluded.signature_style_text')
          .run(actor.id, req.body.signatureDataUrl, style);
        return { ...actor, ...ownSignature(db, actor.id) };
      }) : await saveOwnSignatureAsync(db, async tx => {
        // Async authentication must re-read the session using this transaction.
        if (typeof res.locals.requireCurrentUserAsync !== 'function') throw new Error('Async session validation unavailable.');
        return res.locals.requireCurrentUserAsync(tx);
      }, req.body.signatureDataUrl, style);
      if (!profile) { res.status(400).json({error:'Signature name must match your account.'}); return; }
      res.json(profile);
    } catch (error) { next(error); }
  });
  return router;
}
