import type { AdminWorkFormData, AttachmentItem } from '../types';

export function expenseEvidenceError(claim: NonNullable<AdminWorkFormData['expenseClaim']>, attachments: AttachmentItem[]) {
  for (const [index, line] of claim.lines.entries()) {
    const hasReason = !!line.noBillReason?.trim();
    if (line.receiptIndex === undefined && hasReason) continue;
    if (!hasReason && Number.isSafeInteger(line.receiptIndex) && attachments[line.receiptIndex!]) continue;
    return `Expense ${index + 1}: select a receipt or give a no-bill reason.`;
  }
}

export function preservesExpenseReceipts(claim: NonNullable<AdminWorkFormData['expenseClaim']>, before: AttachmentItem[], after: AttachmentItem[]) {
  return claim.lines.every(({ receiptIndex }) => receiptIndex === undefined
    || (!!before[receiptIndex] && before[receiptIndex].dataUrl === after[receiptIndex]?.dataUrl
      && before[receiptIndex].name === after[receiptIndex]?.name));
}
