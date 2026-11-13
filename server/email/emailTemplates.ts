import type { EmailEventType, EmailPayload, FormBilingualPreview, SummaryRow, PreciRouteTrailItem } from './types';

export function escapeHtml(str: unknown): string {
  if (str === undefined || str === null) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

export function renderEmailSubject(eventType: EmailEventType, payload: EmailPayload): string {
  const code = payload.displayId || payload.requestId;
  const form = payload.formType;
  switch (eventType) {
    case 'REQUEST_SUBMITTED':
      return `Request submitted · ${form} · ${code}`;
    case 'ACTION_REQUIRED':
      return `Signature needed · ${form} · ${code}`;
    case 'UPCOMING_FINAL_APPROVER_NOTICE':
      return `Upcoming approval · ${form} · ${code}`;
    case 'UPCOMING_SIGNER_NOTICE':
      return `Upcoming review · ${form} · ${code}`;
    case 'ROUTE_COMPLETED':
      return `Request completed · ${form} · ${code}`;
  }
}

function renderPriorityPill(priority: string): string {
  const p = (priority || '').toLowerCase();
  let bg = '#FEF3C7';
  let color = '#92400E';
  if (p.includes('urgent')) {
    bg = '#FEE2E2';
    color = '#991B1B';
  } else if (p.includes('low')) {
    bg = '#F1F5F9';
    color = '#475569';
  }
  return `<span style="display: inline-block; padding: 2px 9px; background: ${bg}; color: ${color}; border-radius: 12px; font-size: 11px; font-weight: 700; letter-spacing: 0.3px;">${escapeHtml(priority)}</span>`;
}

function renderBilingualFormHtml(preview: FormBilingualPreview): string {
  return `
    <table cellpadding="0" cellspacing="0" border="0" width="100%" class="form-table" style="max-width: 100%; border: 1px solid #CBD5E1; border-radius: 8px; overflow: hidden; background-color: #FFFFFF; margin: 18px 0; border-collapse: separate; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;">
      <tr>
        <td colspan="2" style="background-color: #EAF0F6; border-bottom: 1px solid #CBD5E1; padding: 12px 14px;">
          <table cellpadding="0" cellspacing="0" border="0" width="100%">
            <tr>
              <td class="header-grid-col" style="vertical-align: top; text-align: left; width: 50%;">
                <div style="font-size: 13px; font-weight: 700; color: #0F172A; line-height: 1.3;">${escapeHtml(preview.companyName)}</div>
                <div style="font-size: 12px; font-weight: 600; color: #334155; margin-top: 2px;">${escapeHtml(preview.formTitleEnglish)}</div>
              </td>
              <td class="header-grid-col header-grid-col-right" dir="rtl" style="vertical-align: top; text-align: right; width: 50%;">
                ${preview.companyNameArabic ? `<div style="font-size: 13px; font-weight: 700; color: #0F172A; line-height: 1.3;">${escapeHtml(preview.companyNameArabic)}</div>` : ''}
                <div style="font-size: 12px; font-weight: 600; color: #334155; margin-top: 2px;">${escapeHtml(preview.formTitleArabic)}</div>
              </td>
            </tr>
          </table>
        </td>
      </tr>

      <tr>
        <td class="responsive-half" style="width: 50%; vertical-align: top; padding: 8px 12px; border-bottom: 1px solid #CBD5E1; border-right: 1px solid #CBD5E1;">
          <table cellpadding="0" cellspacing="0" border="0" width="100%">
            <tr>
              <td style="font-size: 11px; font-weight: 700; color: #334155;">Date of Request</td>
              <td dir="rtl" style="font-size: 11px; font-weight: 700; color: #334155; text-align: right;">تاريخ الطلب</td>
            </tr>
          </table>
          <div style="font-size: 13px; font-weight: 500; color: #0F172A; margin-top: 3px;">${escapeHtml(preview.dateOfRequest || '—')}</div>
        </td>
        <td class="responsive-half" style="width: 50%; vertical-align: top; padding: 8px 12px; border-bottom: 1px solid #CBD5E1;">
          <table cellpadding="0" cellspacing="0" border="0" width="100%">
            <tr>
              <td style="font-size: 11px; font-weight: 700; color: #334155;">Department</td>
              <td dir="rtl" style="font-size: 11px; font-weight: 700; color: #334155; text-align: right;">القسم</td>
            </tr>
          </table>
          <div style="font-size: 13px; font-weight: 500; color: #0F172A; margin-top: 3px;">${escapeHtml(preview.department || '—')}</div>
        </td>
      </tr>

      <tr>
        <td class="responsive-half" style="width: 50%; vertical-align: top; padding: 8px 12px; border-bottom: 1px solid #CBD5E1; border-right: 1px solid #CBD5E1;">
          <table cellpadding="0" cellspacing="0" border="0" width="100%">
            <tr>
              <td style="font-size: 11px; font-weight: 700; color: #334155;">Name of the Requester</td>
              <td dir="rtl" style="font-size: 11px; font-weight: 700; color: #334155; text-align: right;">اسم صاحب الطلب</td>
            </tr>
          </table>
          <div style="font-size: 13px; font-weight: 500; color: #0F172A; margin-top: 3px;">${escapeHtml(preview.requesterName || '—')}</div>
        </td>
        <td class="responsive-half" style="width: 50%; vertical-align: top; padding: 8px 12px; border-bottom: 1px solid #CBD5E1;">
          <table cellpadding="0" cellspacing="0" border="0" width="100%">
            <tr>
              <td style="font-size: 11px; font-weight: 700; color: #334155;">Documents</td>
              <td dir="rtl" style="font-size: 11px; font-weight: 700; color: #334155; text-align: right;">المستندات</td>
            </tr>
          </table>
          <div style="font-size: 13px; font-weight: 500; color: #0F172A; margin-top: 3px;">${escapeHtml(preview.documentsDescription || '—')}</div>
        </td>
      </tr>

      <tr>
        <td colspan="2" style="vertical-align: top; padding: 8px 12px; border-bottom: 1px solid #CBD5E1;">
          <table cellpadding="0" cellspacing="0" border="0" width="100%">
            <tr>
              <td style="font-size: 11px; font-weight: 700; color: #334155;">Priority</td>
              <td dir="rtl" style="font-size: 11px; font-weight: 700; color: #334155; text-align: right;">الأهمية</td>
            </tr>
          </table>
          <div style="font-size: 13px; font-weight: 500; color: #0F172A; margin-top: 3px;">${escapeHtml(preview.priority || '—')}</div>
        </td>
      </tr>

      <tr>
        <td colspan="2" style="vertical-align: top; padding: 8px 12px; border-bottom: 1px solid #CBD5E1;">
          <table cellpadding="0" cellspacing="0" border="0" width="100%">
            <tr>
              <td style="font-size: 11px; font-weight: 700; color: #334155;">Work Description</td>
              <td dir="rtl" style="font-size: 11px; font-weight: 700; color: #334155; text-align: right;">وصف الطلب</td>
            </tr>
          </table>
          <div style="font-size: 13px; color: #0F172A; margin-top: 4px; line-height: 1.5; white-space: pre-wrap;">${escapeHtml(preview.workDescription || '—')}</div>
        </td>
      </tr>

      <tr>
        <td colspan="2" style="padding: 0; border-bottom: 1px solid #CBD5E1;">
          <table cellpadding="0" cellspacing="0" border="0" width="100%">
            <tr>
              <td colspan="2" style="background-color: #F1F5F9; padding: 6px 12px; font-size: 11px; font-weight: 700; color: #1E293B; border-bottom: 1px solid #CBD5E1;">
                Administrative Team Use Only
              </td>
            </tr>
            <tr>
              <td style="width: 50%; padding: 6px 12px; font-size: 12px; color: #64748B; border-right: 1px solid #CBD5E1; border-bottom: 1px solid #E2E8F0;">Work Completion Status</td>
              <td style="width: 50%; padding: 6px 12px; font-size: 12px; color: #0F172A; border-bottom: 1px solid #E2E8F0;">${escapeHtml(preview.adminUseOnly.status || '')}</td>
            </tr>
            <tr>
              <td style="width: 50%; padding: 6px 12px; font-size: 12px; color: #64748B; border-right: 1px solid #CBD5E1; border-bottom: 1px solid #E2E8F0;">Work Completion Date</td>
              <td style="width: 50%; padding: 6px 12px; font-size: 12px; color: #0F172A; border-bottom: 1px solid #E2E8F0;">${escapeHtml(preview.adminUseOnly.completionDate || '')}</td>
            </tr>
            <tr>
              <td style="width: 50%; padding: 6px 12px; font-size: 12px; color: #64748B; border-right: 1px solid #CBD5E1;">Work Completed by Name</td>
              <td style="width: 50%; padding: 6px 12px; font-size: 12px; color: #0F172A;">${escapeHtml(preview.adminUseOnly.completedByName || '')}</td>
            </tr>
          </table>
        </td>
      </tr>

      <tr>
        <td colspan="2" style="padding: 0; border-bottom: 1px solid #CBD5E1;">
          <table cellpadding="0" cellspacing="0" border="0" width="100%">
            <tr>
              <td colspan="2" style="background-color: #F1F5F9; padding: 6px 12px; font-size: 11px; font-weight: 700; color: #1E293B; border-bottom: 1px solid #CBD5E1;">
                <table cellpadding="0" cellspacing="0" border="0" width="100%">
                  <tr>
                    <td>Payment Section</td>
                    <td dir="rtl" style="text-align: right;">قسم الدفع</td>
                  </tr>
                </table>
              </td>
            </tr>
            <tr>
              <td style="width: 50%; padding: 6px 12px; font-size: 12px; font-weight: 600; color: #334155; border-right: 1px solid #CBD5E1; border-bottom: 1px solid #E2E8F0;">Amount</td>
              <td style="width: 50%; padding: 6px 12px; font-size: 12px; font-weight: 700; color: #0F172A; border-bottom: 1px solid #E2E8F0;">${escapeHtml(preview.payment.amount || '')}</td>
            </tr>
            <tr>
              <td style="width: 50%; padding: 6px 12px; font-size: 12px; font-weight: 600; color: #334155; border-right: 1px solid #CBD5E1; border-bottom: 1px solid #E2E8F0;">Mode of Transfer</td>
              <td style="width: 50%; padding: 6px 12px; font-size: 12px; color: #0F172A; border-bottom: 1px solid #E2E8F0;">${escapeHtml(preview.payment.transferMode || '')}</td>
            </tr>
            <tr>
              <td style="width: 50%; padding: 6px 12px; font-size: 12px; font-weight: 600; color: #334155; border-right: 1px solid #CBD5E1;">Purpose</td>
              <td style="width: 50%; padding: 6px 12px; font-size: 12px; color: #0F172A;">${escapeHtml(preview.payment.purpose || '')}</td>
            </tr>
          </table>
        </td>
      </tr>

      <tr>
        <td colspan="2" style="padding: 0; border-bottom: 1px solid #CBD5E1;">
          <table cellpadding="0" cellspacing="0" border="0" width="100%">
            <tr>
              <td class="signature-col" style="width: 33.33%; padding: 8px 10px; border-right: 1px solid #CBD5E1; vertical-align: top; background-color: #F8FAFC;">
                <div style="font-size: 11px; font-weight: 700; color: #334155; text-align: center;">Requester Signature</div>
                <div dir="rtl" style="font-size: 10px; font-weight: 600; color: #475569; text-align: center; margin-top: 1px;">توقيع صاحب الطلب</div>
                <div style="height: 44px; display: table; width: 100%;">
                  <div style="display: table-cell; vertical-align: middle; text-align: center; font-size: 12px; font-weight: 600; color: #0F766E;">
                    ${escapeHtml(preview.signatures.requester.name || '')}${preview.signatures.requester.status ? ` <span style="font-size: 10px; color: #166534;">(${escapeHtml(preview.signatures.requester.status)})</span>` : ''}
                  </div>
                </div>
              </td>
              <td class="signature-col" style="width: 33.33%; padding: 8px 10px; border-right: 1px solid #CBD5E1; vertical-align: top; background-color: #F8FAFC;">
                <div style="font-size: 11px; font-weight: 700; color: #334155; text-align: center;">Department Head Signature</div>
                <div dir="rtl" style="font-size: 10px; font-weight: 600; color: #475569; text-align: center; margin-top: 1px;">توقيع رئيس القسم</div>
                <div style="height: 44px; display: table; width: 100%;">
                  <div style="display: table-cell; vertical-align: middle; text-align: center; font-size: 12px; font-weight: 600; color: #1E293B;">
                    ${preview.signatures.departmentHead.name ? `
                      ${escapeHtml(preview.signatures.departmentHead.name)}${preview.signatures.departmentHead.status ? ` <span style="font-size: 10px; color: ${preview.signatures.departmentHead.status === 'Signed' ? '#166534' : '#64748B'};">(${escapeHtml(preview.signatures.departmentHead.status)})</span>` : ''}
                    ` : '<span style="color: #94A3B8; font-style: italic; font-weight: 400; font-size: 11px;">—</span>'}
                  </div>
                </div>
              </td>
              <td class="signature-col" style="width: 33.33%; padding: 8px 10px; vertical-align: top; background-color: #F8FAFC;">
                <div style="font-size: 11px; font-weight: 700; color: #334155; text-align: center;">Approver Signature</div>
                <div dir="rtl" style="font-size: 10px; font-weight: 600; color: #475569; text-align: center; margin-top: 1px;">توقيع المخول بالاعتماد</div>
                <div style="height: 44px; display: table; width: 100%;">
                  <div style="display: table-cell; vertical-align: middle; text-align: center; font-size: 12px; font-weight: 600; color: #1E293B;">
                    ${preview.signatures.approver.name ? `
                      ${escapeHtml(preview.signatures.approver.name)}${preview.signatures.approver.status ? ` <span style="font-size: 10px; color: ${preview.signatures.approver.status === 'Signed' ? '#166534' : '#64748B'};">(${escapeHtml(preview.signatures.approver.status)})</span>` : ''}
                    ` : '<span style="color: #94A3B8; font-style: italic; font-weight: 400; font-size: 11px;">—</span>'}
                  </div>
                </div>
              </td>
            </tr>
          </table>
        </td>
      </tr>

      <tr>
        <td colspan="2" style="padding: 10px 14px; background-color: #FFFFFF; font-size: 11px;">
          <div style="font-weight: 700; color: #334155; margin-bottom: 6px;">Notes:</div>
          <ul style="margin: 0; padding-left: 16px; color: #475569; line-height: 1.5;">
            ${(Array.isArray(preview.notes) ? preview.notes : preview.notes.english).map(n => `<li style="margin-bottom: 4px;">${escapeHtml(n)}</li>`).join('')}
          </ul>
        </td>
      </tr>
    </table>
  `;
}

export function renderEmailContent(eventType: EmailEventType, payload: EmailPayload): { html: string; text: string } {
  const name = escapeHtml(payload.recipientName);
  const company = escapeHtml(payload.companyName || payload.companyId);
  const formType = escapeHtml(payload.formType);
  const displayCode = escapeHtml(payload.displayId || payload.requestId);
  const requester = escapeHtml(payload.requesterName);
  const link = escapeHtml(payload.portalUrl);
  const isLocal = link.includes('localhost') || link.includes('127.0.0.1');

  // Badge and headline resolution
  let badgeText = 'ACTION REQUIRED';
  let badgeBg = '#F1F5F9';
  let badgeColor = '#334155';
  let headline = 'Your signature is needed';
  let subhead = `Hi ${name}, ${requester} submitted this request for your review.`;
  let buttonText = (!payload.dynamicSummary && payload.formPreview) ? 'Review & sign' : 'Open in PreciSign';

  switch (eventType) {
    case 'REQUEST_SUBMITTED':
      badgeText = 'REQUEST SUBMITTED';
      badgeBg = '#EFF6FF';
      badgeColor = '#1D4ED8';
      headline = 'Request submission confirmed';
      subhead = `Hi ${name}, your request has been submitted for review.`;
      buttonText = 'View submitted form';
      break;

    case 'ACTION_REQUIRED':
      badgeText = 'ACTION REQUIRED';
      badgeBg = '#F1F5F9';
      badgeColor = '#334155';
      headline = 'Your signature is needed';
      subhead = `Hi ${name}, ${requester} submitted this request for your review.`;
      buttonText = (!payload.dynamicSummary && payload.formPreview) ? 'Review & sign' : 'Open in PreciSign';
      break;

    case 'UPCOMING_FINAL_APPROVER_NOTICE':
      badgeText = 'UPCOMING APPROVAL';
      badgeBg = '#F8FAFC';
      badgeColor = '#475569';
      headline = 'Upcoming final approver notice';
      subhead = `Hi ${name}, you are the designated final approver for this request.`;
      buttonText = 'View in PreciSign';
      break;

    case 'UPCOMING_SIGNER_NOTICE':
      badgeText = 'UPCOMING SIGNER';
      badgeBg = '#F8FAFC';
      badgeColor = '#475569';
      headline = 'Upcoming signature in route';
      subhead = `Hi ${name}, you are an assigned signer for an upcoming stage in this request route.`;
      buttonText = 'View in PreciSign';
      break;

    case 'ROUTE_COMPLETED':
      badgeText = 'ROUTE COMPLETED';
      badgeBg = '#ECFDF5';
      badgeColor = '#047857';
      headline = 'Signing route completed';
      subhead = `Hi ${name}, all required approvals have been completed for your request.`;
      buttonText = 'View completed form';
      break;
  }

  // Stage indicator badge on the top right of navy banner
  const stageHeaderBadge = payload.stageBadge || (payload.stageNumber && payload.totalStages ? `STAGE ${payload.stageNumber} OF ${payload.totalStages}` : (eventType === 'ROUTE_COMPLETED' ? 'COMPLETED' : ''));

  // 1. Amount Callout Box (when payment details are present)
  let amountBoxHtml = '';
  let topButtonHtml = '';
  const btnBg = (!payload.dynamicSummary && payload.formPreview) ? '#0D9488' : '#0A1E35';

  if (payload.amountHighlight) {
    amountBoxHtml = `
      <div style="background: #F8FAFC; border: 1px solid #E2E8F0; border-radius: 8px; padding: 16px 20px; margin-bottom: 22px;">
        <table cellpadding="0" cellspacing="0" border="0" width="100%">
          <tr>
            <td style="vertical-align: middle;">
              <div style="font-size: 11px; font-weight: 600; color: #64748B; text-transform: uppercase; letter-spacing: 0.5px;">${escapeHtml(payload.amountHighlight.label)}</div>
              <div style="font-size: 26px; font-weight: 700; color: #0F172A; margin-top: 2px; letter-spacing: -0.5px;">
                ${escapeHtml(payload.amountHighlight.amount)} <span style="font-size: 14px; font-weight: 600; color: #475569;">${escapeHtml(payload.amountHighlight.currency)}</span>
              </div>
            </td>
            <td style="vertical-align: middle; text-align: right;">
              <a href="${link}" style="background-color: ${btnBg}; color: #FFFFFF; text-decoration: none; font-size: 13px; font-weight: 600; padding: 11px 22px; border-radius: 6px; display: inline-block;">
                ${escapeHtml(buttonText)}
              </a>
            </td>
          </tr>
        </table>
        ${isLocal ? '<div style="font-size: 11px; color: #94A3B8; margin-top: 8px;">(Local-only link: opens only on the computer running PreciSign)</div>' : ''}
      </div>
    `;
  } else {
    topButtonHtml = `
      <div style="margin: 0 0 22px;">
        <a href="${link}" style="background-color: ${btnBg}; color: #FFFFFF; text-decoration: none; font-size: 14px; font-weight: 600; padding: 11px 26px; border-radius: 6px; display: inline-block;">
          ${escapeHtml(buttonText)}
        </a>
        ${isLocal ? '<div style="font-size: 11px; color: #94A3B8; margin-top: 6px;">(Local-only link: opens only on the computer running PreciSign)</div>' : ''}
      </div>
    `;
  }

  // 2. Dynamic Request Summary Card
  let summaryCardHtml = '';
  if (payload.dynamicSummary && payload.dynamicSummary.length > 0) {
    const rowsHtml = payload.dynamicSummary.map((r, idx) => {
      const isLast = idx === payload.dynamicSummary!.length - 1;
      const borderStyle = isLast ? '' : 'border-bottom: 1px solid #EDF2F7;';
      let valHtml = escapeHtml(r.value);
      if (r.isPriorityPill) {
        valHtml = renderPriorityPill(r.value);
      } else if (r.isMonospace) {
        valHtml = `<span style="font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace; font-weight: 600; color: #1E293B;">${escapeHtml(r.value)}</span>`;
      } else if (r.isAmount) {
        valHtml = `<strong style="font-size: 15px; color: #0F172A;">${escapeHtml(r.value)}</strong>`;
      }

      return `
        <tr style="${borderStyle}">
          <td style="padding: 7px 0; color: #64748B; width: 130px; font-weight: 500;">${escapeHtml(r.label)}</td>
          <td style="padding: 7px 0; color: #0F172A;">${valHtml}</td>
        </tr>
      `;
    }).join('');

    summaryCardHtml = `
      <div style="background: #F8FAFC; border: 1px solid #E2E8F0; border-radius: 8px; padding: 16px 18px; margin-bottom: 22px;">
        <div style="font-size: 14px; font-weight: 700; color: #0F172A; margin-bottom: 12px;">Request summary</div>
        <table cellpadding="0" cellspacing="0" border="0" width="100%" style="font-size: 13px;">
          ${rowsHtml}
        </table>
      </div>
    `;
  } else if (payload.formPreview) {
    // Backward compatibility for tests specifically asserting the bilingual table
    summaryCardHtml = renderBilingualFormHtml(payload.formPreview);
  } else {
    // Default fallback summary
    summaryCardHtml = `
      <div style="background: #F8FAFC; border: 1px solid #E2E8F0; border-radius: 8px; padding: 16px 18px; margin-bottom: 22px;">
        <div style="font-size: 14px; font-weight: 700; color: #0F172A; margin-bottom: 12px;">Request summary</div>
        <table cellpadding="0" cellspacing="0" border="0" width="100%" style="font-size: 13px;">
          <tr style="border-bottom: 1px solid #EDF2F7;"><td style="padding: 7px 0; color: #64748B; width: 130px;">Company</td><td style="padding: 7px 0; color: #0F172A;">${company}</td></tr>
          <tr style="border-bottom: 1px solid #EDF2F7;"><td style="padding: 7px 0; color: #64748B;">Form</td><td style="padding: 7px 0; color: #0F172A;">${formType}</td></tr>
          <tr style="border-bottom: 1px solid #EDF2F7;"><td style="padding: 7px 0; color: #64748B;">Reference</td><td style="padding: 7px 0; font-family: monospace; font-weight: 600; color: #1E293B;">${displayCode}</td></tr>
          <tr><td style="padding: 7px 0; color: #64748B;">Requester</td><td style="padding: 7px 0; color: #0F172A;">${requester}</td></tr>
        </table>
      </div>
    `;
  }

  // 3. PreciRoute Trail (Audit & Remarks Timeline)
  let precirouteTrailHtml = '';
  if (payload.precirouteTrail && payload.precirouteTrail.length > 0) {
    const itemsHtml = payload.precirouteTrail.map((item, idx) => {
      const isLast = idx === payload.precirouteTrail!.length - 1;
      const initial = escapeHtml(item.initial || item.name[0] || 'U');
      const actionColor = item.action === 'Signed' || item.action === 'Approved' ? '#15803d' : '#64748B';
      const speechBorderColor = item.roleTag.toLowerCase().includes('requester') ? '#0D9488' : '#6366F1';

      return `
        <div style="margin-bottom: ${isLast ? '0' : '14px'};">
          <table cellpadding="0" cellspacing="0" border="0" width="100%">
            <tr>
              <td style="width: 36px; vertical-align: top;">
                <div style="width: 32px; height: 32px; border-radius: 50%; background-color: ${escapeHtml(item.avatarBg || '#CCFBF1')}; color: ${escapeHtml(item.avatarColor || '#0F766E')}; text-align: center; line-height: 32px; font-weight: 700; font-size: 13px;">
                  ${initial}
                </div>
              </td>
              <td style="padding-left: 10px; vertical-align: top;">
                <div style="font-size: 13px; margin-bottom: 4px;">
                  <strong style="color: #0F172A;">${escapeHtml(item.name)} (${escapeHtml(item.roleTag)})</strong>
                  <span style="color: ${actionColor}; font-size: 12px; font-weight: 600;">&nbsp;&middot;&nbsp;${escapeHtml(item.action)}</span>
                  ${item.timestamp ? `<span style="color: #94A3B8; font-size: 11px; margin-left: 6px;">${escapeHtml(item.timestamp)}</span>` : ''}
                </div>
                ${item.comment ? `
                  <div style="background: #F8FAFC; border-left: 3px solid ${speechBorderColor}; padding: 8px 12px; border-radius: 0 6px 6px 0; font-size: 13px; color: #334155; line-height: 1.45;">
                    ${escapeHtml(item.comment)}
                  </div>
                ` : ''}
              </td>
            </tr>
          </table>
          ${isLast ? '' : '<div style="height: 1px; background: #F1F5F9; margin: 12px 0 12px 42px;"></div>'}
        </div>
      `;
    }).join('');

    precirouteTrailHtml = `
      <div style="background: #FFFFFF; border: 1px solid #E2E8F0; border-radius: 8px; padding: 16px 18px; margin-bottom: 22px;">
        <div style="font-size: 13px; font-weight: 700; color: #0F172A; margin-bottom: 14px; text-transform: uppercase; letter-spacing: 0.5px;">
          PreciRoute Trail
        </div>
        <div>
          ${itemsHtml}
        </div>
      </div>
    `;
  } else if (payload.emailNote && payload.emailNote.trim()) {
    precirouteTrailHtml = `
      <div style="margin: 18px 0; padding: 12px 16px; border-left: 3px solid #0D9488; background-color: #F8FAFC; border-radius: 0 6px 6px 0;">
        <div style="font-size: 13px; font-weight: 700; color: #334155; margin-bottom: 4px;">Note from ${requester}</div>
        <div style="font-size: 13px; color: #475569; line-height: 1.5; white-space: pre-wrap;">${escapeHtml(payload.emailNote)}</div>
      </div>
    `;
  }

  // 4. Completion Summary Table (for ROUTE_COMPLETED)
  let completionSummaryHtml = '';
  let completionSummaryText = '';
  if (payload.completionSummary?.steps?.length) {
    let rowsHtml = '';
    for (const step of payload.completionSummary.steps) {
      const statusColor = step.status === 'Signed' ? '#15803d' : '#b45309';
      rowsHtml += `
        <tr style="border-bottom: 1px solid #e2e8f0;">
          <td style="padding: 6px 10px; border: 1px solid #e2e8f0;">${escapeHtml(step.stageName)}</td>
          <td style="padding: 6px 10px; border: 1px solid #e2e8f0;">${escapeHtml(step.assignedUserName)}</td>
          <td style="padding: 6px 10px; border: 1px solid #e2e8f0; color: ${statusColor}; font-weight: bold;">${escapeHtml(step.status)}</td>
        </tr>
      `;
      completionSummaryText += `- ${step.stageName} (${step.assignedUserName}): ${step.status}\n`;
    }

    completionSummaryHtml = `
      <div style="background: #F8FAFC; border: 1px solid #E2E8F0; border-radius: 8px; padding: 16px 18px; margin-bottom: 22px;">
        <h4 style="margin: 0 0 10px; color: #1e293b; font-size: 14px; font-weight: 700;">Signer Action Summary</h4>
        <table cellpadding="0" cellspacing="0" border="0" width="100%" style="border-collapse: collapse; font-size: 13px;">
          <thead>
            <tr style="background: #f1f5f9; text-align: left;">
              <th style="padding: 6px 10px; border: 1px solid #e2e8f0;">Stage</th>
              <th style="padding: 6px 10px; border: 1px solid #e2e8f0;">Signer</th>
              <th style="padding: 6px 10px; border: 1px solid #e2e8f0;">Status</th>
            </tr>
          </thead>
          <tbody>
            ${rowsHtml}
          </tbody>
        </table>
        <p style="margin-top: 10px; margin-bottom: 0; font-size: 12px; color: #64748b; font-style: italic;">
          Note: Detailed bypass rationale, audit trails, and document signatures are kept securely inside PreciSign.
        </p>
      </div>
    `;
  }

  // Logo asset URL (public HTTPS CDN)
  const publicLogoUrl =
    process.env.PRECISIGN_PUBLIC_LOGO_URL ||
    (process.env.PRECISIGN_PUBLIC_ASSET_URL
      ? `${process.env.PRECISIGN_PUBLIC_ASSET_URL.replace(/\/+$/, '')}/assets/precisign-p-logo.png`
      : 'https://files.catbox.moe/3jnkzm.png');

  const html = `
<!DOCTYPE html>
<html lang="en" dir="ltr">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${renderEmailSubject(eventType, payload)}</title>
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap" rel="stylesheet">
  <style>
    body { margin: 0; padding: 0; background-color: #f8fafc; -webkit-text-size-adjust: 100%; -ms-text-size-adjust: 100%; }
    table { border-collapse: collapse; mso-table-lspace: 0pt; mso-table-rspace: 0pt; }
    td { padding: 0; }
    img { border: 0; outline: none; text-decoration: none; display: block; }
    @media only screen and (max-width: 600px) {
      .email-container { width: 100% !important; max-width: 100% !important; border-radius: 0 !important; }
      .email-content { padding: 16px !important; }
      .form-table td, .form-table th { padding: 6px 8px !important; font-size: 11px !important; }
      .signature-col { display: block !important; width: 100% !important; border-right: none !important; border-bottom: 1px solid #CBD5E1 !important; }
      .header-grid-col { display: block !important; width: 100% !important; text-align: left !important; }
      .header-grid-col-right { text-align: right !important; margin-top: 4px !important; }
      .responsive-half { display: block !important; width: 100% !important; border-right: none !important; }
    }
  </style>
</head>
<body style="font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; background-color: #f8fafc; margin: 0; padding: 20px 10px; color: #334155; -webkit-font-smoothing: antialiased;">
  <div class="email-container" style="max-width: 580px; margin: 0 auto; background: #ffffff; border-radius: 10px; border: 1px solid #e2e8f0; overflow: hidden; box-shadow: 0 2px 8px rgba(0,0,0,0.06);">
    
    <!-- Corporate Navy Header Banner with P Logo & Stage Indicator -->
    <div style="background-color: #0A1E35; padding: 16px 24px; border-bottom: 2px solid #0D9488;">
      <table cellpadding="0" cellspacing="0" border="0" width="100%">
        <tr>
          <td style="vertical-align: middle;">
            <table cellpadding="0" cellspacing="0" border="0">
              <tr>
                <td style="vertical-align: middle;">
                  <table cellpadding="0" cellspacing="0" border="0" style="width: 32px; height: 32px; background-color: #FFFFFF; border-radius: 7px; border-collapse: collapse;">
                    <tr>
                      <td align="center" valign="middle" style="text-align: center; vertical-align: middle; padding: 0;">
                        <img src="${publicLogoUrl}" alt="P" width="20" height="22" style="display: block; margin: 0 auto; border: 0; outline: none; text-decoration: none;" />
                      </td>
                    </tr>
                  </table>
                </td>
                <td style="vertical-align: middle; padding-left: 10px;">
                  <span style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; font-size: 20px; font-weight: 700; color: #FFFFFF; letter-spacing: -0.5px; text-decoration: none;">PreciSign</span>
                </td>
              </tr>
            </table>
          </td>
          ${stageHeaderBadge ? `
            <td style="vertical-align: middle; text-align: right;">
              <span style="background: rgba(13, 148, 136, 0.2); border: 1px solid #0D9488; color: #5EEAD4; font-size: 11px; font-weight: 700; padding: 4px 10px; border-radius: 20px; letter-spacing: 0.5px; text-transform: uppercase;">
                ${escapeHtml(stageHeaderBadge)}
              </span>
            </td>
          ` : ''}
        </tr>
      </table>
    </div>

    <!-- Body Content -->
    <div class="email-content" style="padding: 24px;">
      
      <!-- Action/Status Pill Badge -->
      <div style="display: inline-block; padding: 4px 10px; background-color: ${badgeBg}; border: 1px solid #CBD5E1; border-radius: 6px; font-size: 11px; font-weight: 700; color: ${badgeColor}; letter-spacing: 0.5px; text-transform: uppercase;">
        ${escapeHtml(badgeText)}
      </div>

      <!-- Heading & Subtitle -->
      <h1 style="margin: 12px 0 6px; color: #0F172A; font-size: 22px; font-weight: 700; line-height: 1.25; letter-spacing: -0.3px;">${escapeHtml(headline)}</h1>
      <p style="margin: 0 0 20px; font-size: 14px; line-height: 1.5; color: #475569;">${subhead}</p>

      <!-- Amount Callout Box (if present) OR Top CTA button -->
      ${amountBoxHtml || topButtonHtml}

      <!-- Main Body: Dynamic Request Summary Card or Form Preview -->
      ${summaryCardHtml}

      <!-- Completion Summary if Route Completed -->
      ${completionSummaryHtml}

      <!-- PreciRoute Trail (Audit & Remarks) -->
      ${precirouteTrailHtml}

      <!-- Footer & Confidentiality -->
      <div style="border-top: 1px solid #E2E8F0; padding-top: 16px; margin-top: 20px; text-align: center;">
        <div style="font-size: 12px; color: #475569;">
          View the full form and attachments in <a href="${link}" style="color: #0D9488; text-decoration: none; font-weight: 600;">PreciSign</a>.
        </div>
        <div style="font-size: 11px; color: #94A3B8; margin-top: 6px; line-height: 1.5;">
          This is an automated notification from PreciSign. Confidential form contents and attachments are protected.
        </div>
      </div>

    </div>
  </div>
</body>
</html>
  `.trim();

  // Plain-text representation
  let text = `${renderEmailSubject(eventType, payload)}\n\n`;
  text += `${headline}\n${subhead}\n\n`;

  if (payload.amountHighlight) {
    text += `[${payload.amountHighlight.label}: ${payload.amountHighlight.amount} ${payload.amountHighlight.currency}]\n\n`;
  }

  if (!payload.dynamicSummary && payload.formPreview) {
    const fp = payload.formPreview;
    text += `${fp.companyName}\n${fp.formTitleEnglish}\n${fp.payment.amount}\n`;
    text += `Action: ${buttonText}\n`;
    text += `Note from ${payload.requesterName}:\n${payload.emailNote || ''}\n\n`;
  }

  text += `Action link: ${payload.portalUrl}\n\n`;

  if (payload.dynamicSummary && payload.dynamicSummary.length > 0) {
    text += `Request Summary:\n`;
    for (const r of payload.dynamicSummary) {
      text += `- ${r.label}: ${r.value}\n`;
    }
    text += `\n`;
  }

  if (completionSummaryText) {
    text += `Signer Action Summary:\n${completionSummaryText}\n`;
  }

  if (payload.precirouteTrail && payload.precirouteTrail.length > 0) {
    text += `PreciRoute Trail:\n`;
    for (const item of payload.precirouteTrail) {
      text += `- ${item.name} (${item.roleTag}) - ${item.action}`;
      if (item.timestamp) text += ` [${item.timestamp}]`;
      text += `\n`;
      if (item.comment) {
        text += `  Remark: "${item.comment}"\n`;
      }
    }
    text += `\n`;
  } else if (payload.emailNote) {
    text += `Note from ${payload.requesterName}:\n${payload.emailNote}\n\n`;
  }

  text += `View full form: ${payload.portalUrl}\n`;
  text += `This is an automated notification from PreciSign. Confidential form contents and attachments are protected.\n`;

  return { html, text };
}
