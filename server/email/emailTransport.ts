import { Resend } from 'resend';
import type { DeliveryMode, EmailSendOptions, EmailSendResult, IEmailTransport } from './types';

export const APPROVED_RESEND_TEST_RECIPIENTS = new Set([
  'delivered@resend.dev',
  'bounced@resend.dev',
  'complained@resend.dev',
]);

export class MockEmailTransport implements IEmailTransport {
  public sent: EmailSendOptions[] = [];
  public failNextWith?: { message: string; retryable: boolean; uncertain?: boolean };
  public delayMs: number = 0;

  async send(options: EmailSendOptions): Promise<EmailSendResult> {
    if (this.delayMs > 0) {
      await new Promise(r => setTimeout(r, this.delayMs));
    }
    if (this.failNextWith) {
      const failure = this.failNextWith;
      this.failNextWith = undefined;
      return {
        accepted: false,
        delivered: false,
        error: failure.message,
        retryable: failure.retryable,
        uncertain: failure.uncertain,
      };
    }
    this.sent.push({ ...options });
    return {
      accepted: true,
      delivered: true,
      resendId: `mock_resend_${Date.now()}_${Math.random().toString(36).substring(7)}`,
    };
  }

  clear() {
    this.sent = [];
    this.failNextWith = undefined;
  }
}

export interface ResendTransportConfig {
  mode?: DeliveryMode;
  apiKey?: string;
  sender?: string;
  testRecipient?: string;
}

export class ResendEmailTransport implements IEmailTransport {
  private mode: DeliveryMode;
  private resend?: Resend;
  private apiKey?: string;
  private sender: string;
  private testRecipient: string;

  constructor(config: ResendTransportConfig = {}) {
    const rawMode = config.mode || process.env.PRECISIGN_EMAIL_MODE || 'sandbox';
    if (!['disabled', 'sandbox', 'live'].includes(rawMode)) {
      throw new Error(`Invalid PRECISIGN_EMAIL_MODE '${rawMode}'. Must be 'disabled', 'sandbox', or 'live'.`);
    }
    this.mode = rawMode as DeliveryMode;
    this.apiKey = config.apiKey || process.env.RESEND_API_KEY;
    this.sender = config.sender || process.env.PRECISIGN_EMAIL_SENDER || 'PreciSign <onboarding@resend.dev>';
    this.testRecipient = config.testRecipient || process.env.PRECISIGN_TEST_RECIPIENT || 'delivered@resend.dev';

    if (this.apiKey) {
      this.resend = new Resend(this.apiKey);
    }
  }

  getMode(): DeliveryMode {
    return this.mode;
  }

  async send(options: EmailSendOptions): Promise<EmailSendResult> {
    // 1. Explicit 'disabled' mode
    if (this.mode === 'disabled') {
      return {
        accepted: false,
        delivered: false,
        error: 'Email delivery is disabled (mode=disabled).',
        retryable: false,
        uncertain: false,
      };
    }

    // 2. Missing configuration check
    if (!this.apiKey || !this.resend) {
      return {
        accepted: false,
        delivered: false,
        error: 'Missing RESEND_API_KEY configuration for email delivery.',
        retryable: false,
        uncertain: false,
      };
    }

    let targetEmail = options.to;
    let targetSubject = options.subject;

    // 3. Explicit 'sandbox' mode: Must use approved Resend test recipients
    if (this.mode === 'sandbox') {
      if (APPROVED_RESEND_TEST_RECIPIENTS.has(targetEmail)) {
        // Direct test address already provided
      } else {
        // Safely redirect to approved test recipient
        targetSubject = `[Sandbox -> ${options.to}] ${options.subject}`;
        targetEmail = APPROVED_RESEND_TEST_RECIPIENTS.has(this.testRecipient)
          ? this.testRecipient
          : 'delivered@resend.dev';
      }
    } else if (this.mode === 'live') {
      // 4. Explicit 'live' mode: Must have a verified custom domain sender (not resend.dev)
      if (this.sender.includes('resend.dev')) {
        return {
          accepted: false,
          delivered: false,
          error: 'Live delivery mode requires a verified custom sender domain (cannot send from resend.dev).',
          retryable: false,
          uncertain: false,
        };
      }
    }

    try {
      const { data, error } = await this.resend.emails.send(
        {
          from: this.sender,
          to: [targetEmail],
          subject: targetSubject,
          html: options.html,
          text: options.text,
        },
        {
          idempotencyKey: options.idempotencyKey,
        }
      );

      if (error) {
        const errorName = error.name as string;
        const isRetryable =
          errorName === 'rate_limit_exceeded' ||
          errorName === 'internal_server_error' ||
          errorName === 'application_error' ||
          (error as any).statusCode === 429 ||
          (error as any).statusCode >= 500;

        const isUncertain =
          errorName === 'internal_server_error' ||
          errorName === 'application_error' ||
          (error as any).statusCode >= 500;

        return {
          accepted: false,
          delivered: false,
          error: `[${error.name}] ${error.message}`,
          retryable: isRetryable,
          uncertain: isUncertain,
        };
      }

      // API acceptance is recorded separately from confirmed delivery
      const isConfirmedDelivered = targetEmail === 'delivered@resend.dev';

      return {
        accepted: true,
        resendId: data?.id,
        delivered: isConfirmedDelivered,
      };
    } catch (err: any) {
      return {
        accepted: false,
        delivered: false,
        error: err?.message || 'Network error communicating with Resend',
        retryable: true,
        uncertain: true,
      };
    }
  }
}
