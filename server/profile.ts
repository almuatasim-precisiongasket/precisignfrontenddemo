import { Router } from 'express';
import type { DatabaseSync } from 'node:sqlite';
import { bytes, fields, text } from './requestValidation';

export function ownSignature(db: DatabaseSync, userId: string) {
  const row = db.prepare('SELECT signature_data_url,signature_style_text FROM user_signatures WHERE user_id=?').get(userId);
  return row ? { signatureDataUrl: String(row.signature_data_url), signatureStyleText: String(row.signature_style_text) } : {};
}

export function profileRoutes(db: DatabaseSync) {
  const router = Router();
  router.patch('/me/signature', async (req, res, next) => {
    try {
      fields(req.body, ['signatureDataUrl', 'signatureStyleText']);
      await bytes(req.body.signatureDataUrl, true);
      const style = text(req.body.signatureStyleText, 150);
      if (style !== res.locals.user.name) { res.status(400).json({error:'Signature name must match your account.'}); return; }
      db.prepare('INSERT INTO user_signatures VALUES (?,?,?) ON CONFLICT(user_id) DO UPDATE SET signature_data_url=excluded.signature_data_url, signature_style_text=excluded.signature_style_text')
        .run(res.locals.user.id, req.body.signatureDataUrl, style);
      res.json({ ...res.locals.user, ...ownSignature(db, res.locals.user.id) });
    } catch (error) { next(error); }
  });
  return router;
}
