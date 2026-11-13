import { randomUUID } from 'node:crypto';
import type { DatabaseSync } from 'node:sqlite';
import type { AsyncDatabase } from '../asyncDatabase';
import { renderEmailContent } from './emailTemplates';
import type { EmailPayload, EmailSendResult, IEmailTransport, OutboxRecord, OutboxStatus } from './types';

export interface OutboxProcessorOptions {
  batchSize?: number;
  leaseDurationMs?: number;
  backoffBaseMs?: number;
  maxBackoffMs?: number;
  now?: () => number;
}

export class OutboxProcessor {
  private db: DatabaseSync | AsyncDatabase;
  private transport: IEmailTransport;
  private workerToken: string;
  private batchSize: number;
  private leaseDurationMs: number;
  private backoffBaseMs: number;
  private maxBackoffMs: number;
  private now: () => number;
  private intervalTimer?: NodeJS.Timeout;
  private isProcessing: boolean = false;

  constructor(
    db: DatabaseSync | AsyncDatabase,
    transport: IEmailTransport,
    options: OutboxProcessorOptions = {}
  ) {
    this.db = db;
    this.transport = transport;
    this.workerToken = randomUUID();
    this.batchSize = options.batchSize ?? 10;
    this.leaseDurationMs = options.leaseDurationMs ?? 120_000; // 2 minutes
    this.backoffBaseMs = options.backoffBaseMs ?? 1_000;
    this.maxBackoffMs = options.maxBackoffMs ?? 60_000;
    this.now = options.now ?? Date.now;
  }

  getWorkerToken(): string {
    return this.workerToken;
  }

  private calculateBackoff(attempts: number): number {
    return Math.min(this.backoffBaseMs * Math.pow(2, attempts), this.maxBackoffMs);
  }

  private validateMessagePayload(record: OutboxRecord, payload: unknown): { valid: boolean; reason?: string } {
    const validEventTypes = [
      'REQUEST_SUBMITTED',
      'ACTION_REQUIRED',
      'UPCOMING_FINAL_APPROVER_NOTICE',
      'UPCOMING_SIGNER_NOTICE',
      'ROUTE_COMPLETED',
    ];
    if (!validEventTypes.includes(record.event_type)) {
      return { valid: false, reason: 'Unsupported event type.' };
    }
    if (!record.recipient_email || typeof record.recipient_email !== 'string' || !record.recipient_email.includes('@')) {
      return { valid: false, reason: 'Invalid recipient email.' };
    }
    if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
      return { valid: false, reason: 'Payload must be an object.' };
    }
    const p = payload as Record<string, unknown>;
    if (!p.requestId || typeof p.requestId !== 'string') {
      return { valid: false, reason: 'Missing requestId in payload.' };
    }
    if (!p.formType || typeof p.formType !== 'string') {
      return { valid: false, reason: 'Missing formType in payload.' };
    }
    return { valid: true };
  }

  async processBatch(customWorkerToken?: string): Promise<{ processed: number; accepted: number; failed: number }> {
    const token = customWorkerToken || this.workerToken;
    const nowMs = this.now();
    let processed = 0;
    let accepted = 0;
    let failed = 0;

    // 1. Fetch eligible candidate IDs (pending due for retry, or expired leases from crashed workers)
    const findCandidatesSql = `
      SELECT id FROM email_outbox
      WHERE (status = 'pending' AND next_attempt_at <= ?)
         OR (status = 'processing' AND lease_expires_at <= ?)
      ORDER BY created_at ASC
      LIMIT ?
    `;

    let candidateIds: string[] = [];
    if ('prepare' in this.db) {
      const rows = this.db.prepare(findCandidatesSql).all(nowMs, nowMs, this.batchSize) as { id: string }[];
      candidateIds = rows.map(r => r.id);
    } else {
      const res = await this.db.execute(findCandidatesSql, [nowMs, nowMs, this.batchSize]);
      candidateIds = res.rows.map(r => String(r.id));
    }

    if (!candidateIds.length) {
      return { processed: 0, accepted: 0, failed: 0 };
    }

    // 2. Claim candidate rows atomically with worker lease
    const leaseExpires = nowMs + this.leaseDurationMs;
    const claimSql = `
      UPDATE email_outbox
      SET status = 'processing',
          lease_token = ?,
          lease_expires_at = ?
      WHERE id = ?
        AND ((status = 'pending' AND next_attempt_at <= ?)
          OR (status = 'processing' AND lease_expires_at <= ?))
    `;

    const claimedRecords: OutboxRecord[] = [];
    const selectSql = 'SELECT * FROM email_outbox WHERE id = ?';

    for (const id of candidateIds) {
      if ('prepare' in this.db) {
        const result = this.db.prepare(claimSql).run(token, leaseExpires, id, nowMs, nowMs);
        if (result.changes === 1) {
          const rec = this.db.prepare(selectSql).get(id) as OutboxRecord | undefined;
          if (rec) claimedRecords.push(rec);
        }
      } else {
        const result = await this.db.execute(claimSql, [token, leaseExpires, id, nowMs, nowMs]);
        if (result.rowsAffected === 1) {
          const res = await this.db.execute(selectSql, [id]);
          if (res.rows.length) claimedRecords.push(res.rows[0] as unknown as OutboxRecord);
        }
      }
    }

    // 3. Process each claimed row
    for (const record of claimedRecords) {
      processed++;
      const firstAttempt = record.first_attempt_at || record.created_at;
      const elapsedSinceFirst = nowMs - firstAttempt;

      // 24-Hour Idempotency Window Guard:
      // If previous attempts were made and more than 24 hours elapsed since first attempt,
      // Resend's 24-hour idempotency cache has expired. Retrying could cause duplicate sends.
      // We flag the outcome as failed_unconfirmed and halt automatic retries.
      if (record.attempts > 0 && elapsedSinceFirst > 24 * 60 * 60 * 1000) {
        failed++;
        await this.updateRecordStatus(record.id, token, {
          status: 'failed_unconfirmed',
          lastError: 'Idempotency window (24 hours) expired with unconfirmed delivery outcome.',
          clearLease: true,
        });
        continue;
      }

      let payload: EmailPayload;
      try {
        payload = JSON.parse(record.payload_json);
      } catch (err) {
        failed++;
        await this.updateRecordStatus(record.id, token, {
          status: 'failed',
          lastError: 'Invalid payload JSON.',
          clearLease: true,
        });
        continue;
      }

      // 1. Validate payload structure
      const validation = this.validateMessagePayload(record, payload);
      if (!validation.valid) {
        failed++;
        await this.updateRecordStatus(record.id, token, {
          status: 'failed',
          lastError: `Invalid message payload: ${validation.reason}`,
          clearLease: true,
        });
        continue;
      }

      // 2. Safely render email content before touching transport or recording attempt
      let rendered: { html: string; text: string };
      try {
        rendered = renderEmailContent(record.event_type, payload);
        if (!rendered.html || !rendered.text) {
          throw new Error('Email template generated empty content.');
        }
      } catch (err: any) {
        failed++;
        const safeError = err instanceof Error ? err.name : 'RenderError';
        await this.updateRecordStatus(record.id, token, {
          status: 'failed',
          lastError: `Email rendering failed (${safeError}).`,
          clearLease: true,
        });
        continue;
      }

      // CRUCIAL: Record attempt and first-attempt timestamp BEFORE calling Resend
      const recordAttemptSql = `
        UPDATE email_outbox
        SET attempts = attempts + 1,
            first_attempt_at = COALESCE(first_attempt_at, ?),
            last_attempt_at = ?
        WHERE id = ? AND lease_token = ?
      `;

      let attemptRecorded = false;
      if ('prepare' in this.db) {
        const attRes = this.db.prepare(recordAttemptSql).run(nowMs, nowMs, record.id, token);
        attemptRecorded = attRes.changes === 1;
      } else {
        const attRes = await this.db.execute(recordAttemptSql, [nowMs, nowMs, record.id, token]);
        attemptRecorded = attRes.rowsAffected === 1;
      }

      if (!attemptRecorded) {
        console.warn(`[OutboxProcessor] Lease lost for record ${record.id} before calling Resend; skipped.`);
        continue;
      }

      const currentAttempts = record.attempts + 1;

      let sendResult: EmailSendResult;
      try {
        sendResult = await this.transport.send({
          to: record.recipient_email,
          toName: record.recipient_name,
          subject: record.subject,
          html: rendered.html,
          text: rendered.text,
          idempotencyKey: record.idempotency_key,
        });
      } catch (err: any) {
        sendResult = {
          accepted: false,
          delivered: false,
          error: err?.message || 'Network error communicating with email transport',
          retryable: true,
          uncertain: true,
        };
      }

      if (sendResult.accepted) {
        // API acceptance recorded separately from confirmed delivery
        const isDelivered = sendResult.delivered ?? false;
        const updated = await this.updateRecordStatus(record.id, token, {
          status: isDelivered ? 'delivered' : 'accepted',
          resendId: sendResult.resendId,
          acceptedAt: nowMs,
          deliveredAt: isDelivered ? nowMs : undefined,
          clearLease: true,
        });

        if (updated) {
          accepted++;
        }
      } else {
        const isRetryable = sendResult.retryable ?? false;
        const maxAttemptsReached = currentAttempts >= record.max_attempts;

        const hadPriorUncertainAttempt = this.isUncertainAttempt(undefined, record.last_error);
        const currentAttemptUncertain = this.isUncertainAttempt(sendResult);
        const hasUncertainOutcome = hadPriorUncertainAttempt || currentAttemptUncertain;

        const is24HoursExpired = elapsedSinceFirst > 24 * 60 * 60 * 1000;

        if (!isRetryable || maxAttemptsReached) {
          // When retries end:
          // Use 'failed_unconfirmed' if Resend may have accepted it and PreciSign cannot confirm the outcome,
          // even if the retry limit is reached before 24 hours. A later rejection does not resolve an earlier
          // timeout with an unknown outcome.
          // Use 'failed' if Resend definitively rejected the send (and no prior attempt was uncertain).
          const finalStatus: OutboxStatus = (hasUncertainOutcome || is24HoursExpired)
            ? 'failed_unconfirmed'
            : 'failed';

          const baseError = sendResult.error || (maxAttemptsReached ? 'Max delivery attempts exceeded.' : 'Delivery rejected.');
          const formattedLastError = hasUncertainOutcome && !baseError.includes('[UNCERTAIN]')
            ? `[UNCERTAIN] ${baseError}`
            : baseError;

          const updated = await this.updateRecordStatus(record.id, token, {
            status: finalStatus,
            lastError: formattedLastError,
            clearLease: true,
          });
          if (updated) failed++;
        } else {
          const backoff = this.calculateBackoff(currentAttempts);
          const baseError = sendResult.error || 'Transient delivery error.';
          const formattedLastError = hasUncertainOutcome && !baseError.includes('[UNCERTAIN]')
            ? `[UNCERTAIN] ${baseError}`
            : baseError;

          const updated = await this.updateRecordStatus(record.id, token, {
            status: 'pending',
            nextAttemptAt: nowMs + backoff,
            lastError: formattedLastError,
            clearLease: true,
          });
          if (updated) failed++;
        }
      }
    }

    return { processed, accepted, failed };
  }

  /**
   * Determines whether an attempt's failure represents an uncertain outcome
   * where Resend may have received and accepted the email, but PreciSign cannot confirm it.
   *
   * Definitive rejections (e.g. 400 validation, 401 auth, 403 domain, 409 conflict, 422 unprocessable, 429 rate limit)
   * explicitly indicate the email was NOT accepted.
   *
   * Uncertain outcomes (e.g. timeouts, network drops, socket hangups, 5xx server errors, crash during send)
   * mean the send might have succeeded on Resend's side while the client received no confirmation.
   */
  private isUncertainAttempt(result?: EmailSendResult, errorText?: string | null): boolean {
    if (result?.uncertain === true) return true;
    if (result?.uncertain === false) return false;

    const text = (errorText || result?.error || '').toLowerCase();
    if (!text) return false;

    // Explicit tag from prior attempts
    if (text.includes('[uncertain]')) return true;

    // Timeouts of any kind
    if (text.includes('timeout') || text.includes('timed out') || text.includes('etimedout') || text.includes('esockettimedout')) {
      return true;
    }

    // Network drops, socket hangups, connection resets where bytes may have reached Resend
    if (
      text.includes('socket hang up') ||
      text.includes('econnreset') ||
      text.includes('network error') ||
      text.includes('fetch failed') ||
      text.includes('connection reset') ||
      text.includes('broken pipe')
    ) {
      return true;
    }

    // 5xx Server errors (500, 502, 503, 504) from Resend where email may have been queued
    if (
      text.includes('internal_server_error') ||
      text.includes('application_error') ||
      text.includes('500') ||
      text.includes('502') ||
      text.includes('503') ||
      text.includes('504') ||
      text.includes('bad gateway') ||
      text.includes('gateway timeout') ||
      text.includes('service unavailable')
    ) {
      return true;
    }

    return false;
  }

  /**
   * Updates an outbox record requiring the exact current lease token.
   * If another worker claimed the record after lease expiration, changes will be 0
   * and the stale outcome is safely discarded without overwriting newer state.
   */
  private async updateRecordStatus(
    id: string,
    leaseToken: string,
    updates: {
      status: string;
      resendId?: string;
      acceptedAt?: number;
      deliveredAt?: number;
      nextAttemptAt?: number;
      lastError?: string;
      clearLease?: boolean;
    }
  ): Promise<boolean> {
    const parts: string[] = ['status = ?'];
    const args: any[] = [updates.status];

    if (updates.resendId !== undefined) {
      parts.push('resend_id = ?');
      args.push(updates.resendId);
    }
    if (updates.acceptedAt !== undefined) {
      parts.push('accepted_at = ?');
      args.push(updates.acceptedAt);
    }
    if (updates.deliveredAt !== undefined) {
      parts.push('delivered_at = ?');
      args.push(updates.deliveredAt);
    }
    if (updates.nextAttemptAt !== undefined) {
      parts.push('next_attempt_at = ?');
      args.push(updates.nextAttemptAt);
    }
    if (updates.lastError !== undefined) {
      parts.push('last_error = ?');
      args.push(updates.lastError);
    }
    if (updates.clearLease) {
      parts.push('lease_token = NULL');
      parts.push('lease_expires_at = NULL');
    }

    args.push(id);
    args.push(leaseToken);

    const sql = `UPDATE email_outbox SET ${parts.join(', ')} WHERE id = ? AND lease_token = ?`;

    if ('prepare' in this.db) {
      const res = this.db.prepare(sql).run(...args);
      if (res.changes === 0) {
        console.warn(`[OutboxProcessor] Lease lost for record ${id}; outcome was not overwritten.`);
        return false;
      }
      return true;
    } else {
      const res = await this.db.execute(sql, args);
      if (res.rowsAffected === 0) {
        console.warn(`[OutboxProcessor] Lease lost for record ${id}; outcome was not overwritten.`);
        return false;
      }
      return true;
    }
  }

  /**
   * Non-blocking trigger invoked after database transactions commit.
   * Catches all errors internally so caller request flow is never interrupted.
   */
  async trigger(): Promise<void> {
    if (this.isProcessing) return;
    this.isProcessing = true;
    try {
      await this.processBatch();
    } catch (err) {
      console.error('[PreciSign Outbox Processor] Background dispatch error:', err);
    } finally {
      this.isProcessing = false;
    }
  }

  /**
   * Starts the worker: immediately runs a batch to recover any pending/expired leases,
   * then schedules the background interval.
   */
  start(intervalMs: number = 10_000): void {
    this.trigger().catch(() => {});
    this.startInterval(intervalMs);
  }

  startInterval(intervalMs: number = 10_000): void {
    if (this.intervalTimer) return;
    this.intervalTimer = setInterval(() => {
      this.trigger().catch(() => {});
    }, intervalMs);
    if (this.intervalTimer.unref) {
      this.intervalTimer.unref();
    }
  }

  stop(): void {
    this.stopInterval();
  }

  stopInterval(): void {
    if (this.intervalTimer) {
      clearInterval(this.intervalTimer);
      this.intervalTimer = undefined;
    }
  }
}
