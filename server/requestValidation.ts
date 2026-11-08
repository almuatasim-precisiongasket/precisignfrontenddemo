import { validateRnd } from '../src/utils/rndWorkflow';
import sharp from 'sharp';
import { PDFDocument } from 'pdf-lib';
import { randomUUID } from 'node:crypto';
import type { AdminWorkFormData, AttachmentItem } from '../src/types/index';
import type { SubmitInput } from '../src/services/apiTypes';

export class RequestError extends Error { constructor(public status: number, message: string) { super(message); } }
export const fail = (message: string): never => { throw new RequestError(400, message); };
export function fields(value: any, allowed: string[]) {
  if (!value || typeof value !== 'object' || Array.isArray(value) || Object.keys(value).some(key => !allowed.includes(key))) fail('Invalid or protected fields.');
}
export function text(value: any, max: number, required = true): string {
  if (typeof value !== 'string' || value.length > max || (required && !value.trim())) fail('Invalid text field.');
  return value;
}
export async function bytes(value: unknown, signature = false): Promise<Buffer> {
  if (typeof value !== 'string') fail('File data is required.');
  const match = (value as string).match(/^data:(image\/png|image\/jpeg|application\/pdf);base64,([A-Za-z0-9+/]+={0,2})$/);
  if (!match || (signature && match[1] === 'application/pdf')) fail('Unsupported file type.');
  const data = Buffer.from(match![2], 'base64');
  if (!data.length || data.length > (signature ? 2 : 5) * 1024 * 1024 || data.toString('base64') !== match![2]) fail('Invalid file data or size.');
  const valid = match![1] === 'image/png' ? data.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10])) : match![1] === 'image/jpeg' ? data[0] === 255 && data[1] === 216 && data[2] === 255 : data.subarray(0,5).toString() === '%PDF-';
  if (!valid) fail('File content does not match its type.');
  try {
    if (match![1] === 'application/pdf') {
      if (!/%%EOF\s*$/.test(data.subarray(-1024).toString('latin1'))) fail('Incomplete PDF.');
      const document = await PDFDocument.load(data, { throwOnInvalidObject: true, updateMetadata: false });
      const pages = document.getPages();
      if (!pages.length || pages.length > 1000) fail('Invalid PDF page count.');
      for (const page of pages) {
        const { width, height } = page.getSize();
        if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) fail('Invalid PDF page.');
      }
    } else {
      // Metadata alone does not read image pixels: force a full bounded decode.
      const image = sharp(data, { failOn: 'warning', limitInputPixels: 16_000_000 });
      const metadata = await image.metadata();
      if (metadata.format !== (match![1] === 'image/png' ? 'png' : 'jpeg') || (metadata.pages ?? 1) !== 1) fail('Invalid image.');
      await image.raw().toBuffer();
    }
  } catch { fail('Unreadable or unsupported file content.'); }
  return data;
}
export async function attachments(value: any, actor: string): Promise<AttachmentItem[]> {
  if (value === undefined) return [];
  if (!Array.isArray(value) || value.length > 20) fail('Invalid attachments.');
  let total = 0;
  const result: AttachmentItem[] = [];
  for (const file of value) {
    fields(file, ['id','name','sizeBytes','sizeFormatted','uploadedAt','uploadedBy','mimeType','dataUrl']);
    const data = await bytes(file.dataUrl); total += data.length;
    if (total > 10 * 1024 * 1024) fail('Attachments exceed 10 MiB.');
    result.push({ id: randomUUID(), name: text(file.name, 200), sizeBytes: data.length, sizeFormatted: `${Math.ceil(data.length/1024)} KB`, uploadedAt: new Date().toISOString(), uploadedBy: actor, mimeType: file.dataUrl.slice(5, file.dataUrl.indexOf(';')), dataUrl: file.dataUrl });
  }
  return result;
}
export function form(value: any, partial = false, combined = false, it = false, financial?: 'cashVoucher' | 'expenseClaim', rnd = false): SubmitInput['formData'] {
  fields(value, ['dateOfRequest','department','priority','workDescription','documents', ...(combined ? ['administrativePayment'] : []), ...(it ? ['itRequest'] : []), ...(financial ? [financial] : []), ...(rnd ? ['rnd'] : [])]);
  if (rnd) { const error = validateRnd(value.rnd, false); if (error) fail(error); }
  function amount(value: unknown) {
    if (!/^\d{1,9}(\.\d{1,2})?$/.test(text(value, 12)) || Number(value) <= 0) fail('Enter a positive amount in SAR.');
  }
  if (financial === 'cashVoucher') {
    const voucher = value.cashVoucher;
    fields(voucher, ['payee', 'recipientUserId', 'amount', 'amountInWords', 'source']);
    text(voucher.payee, 200);
    text(voucher.recipientUserId, 150);
    text(voucher.amountInWords, 250);
    amount(voucher.amount);
    if (!['Admin petty cash', 'Accounts cash'].includes(voucher.source)) fail('Select a cash source.');
  }
  if (financial === 'expenseClaim') {
    const claim = value.expenseClaim;
    fields(claim, ['designation', 'project', 'lines']);
    text(claim.designation, 150);
    text(claim.project, 200);
    if (!Array.isArray(claim.lines) || claim.lines.length < 1 || claim.lines.length > 20) fail('Enter between 1 and 20 expense lines.');
    for (const line of claim.lines) {
      fields(line, ['date', 'particulars', 'amount', 'noBillReason', 'receiptIndex']);
      const date = text(line.date, 10);
      if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !Number.isFinite(Date.parse(date)) || new Date(date).toISOString().slice(0, 10) !== date) fail('Enter a valid expense date.');
      text(line.particulars, 1000);
      amount(line.amount);
      if (line.noBillReason !== undefined) text(line.noBillReason, 500);
      if (line.receiptIndex !== undefined && (!Number.isSafeInteger(line.receiptIndex) || line.receiptIndex < 0)) fail('Invalid receipt selection.');
    }
  }
  if (it && (!partial || value.itRequest !== undefined)) {
    fields(value.itRequest, ['requestType', 'justification']);
    text(value.itRequest.requestType, 150);
    text(value.itRequest.justification, 10000);
  }
  if (combined && (!partial || value.administrativePayment !== undefined)) {
    const details = value.administrativePayment;
    fields(details, ['documentDescription', 'payment']);
    text(details.documentDescription, 1000, false);
    if (details.payment !== undefined) {
      const payment = details.payment;
      fields(payment, ['amount', 'transferMode', 'transferDetails', 'purpose', 'otherPurpose']);
      amount(payment.amount);
      if (!['Bank','Cash','Cheque'].includes(payment.transferMode)) fail('Invalid transfer method.');
      if (payment.transferDetails !== undefined) text(payment.transferDetails, 200, false);
      if (!['Government Payment','Advance Cash','Other'].includes(payment.purpose)) fail('Invalid payment purpose.');
      if (payment.purpose === 'Other' || payment.otherPurpose !== undefined) text(payment.otherPurpose, 500, payment.purpose === 'Other');
    }
  }
  for (const [key, max] of [['dateOfRequest',50],['department',150],['workDescription',20000]] as const) {
    if (!partial || value[key] !== undefined) text(value[key], max, !partial);
  }
  if ((!partial || value.priority !== undefined) && !['Urgent','Medium','Low'].includes(value.priority)) fail('Invalid priority.');
  const keys = ['onlineDocumentChamber','physicalDocumentChamber','companyDocumentAjeer','employeeSalaryCertificate','permanentEmploymentVisa','workVisitVisa','businessVisitVisa','agencyWakala','others'];
  if (partial && value.documents === undefined) return value;
  fields(value.documents, [...keys, 'othersDescription']);
  if (keys.some(key => typeof value.documents[key] !== 'boolean')) fail('Invalid document checklist.');
  text(value.documents.othersDescription, 1000, false);
  return value as Pick<AdminWorkFormData,'dateOfRequest'|'department'|'priority'|'workDescription'|'documents'|'administrativePayment'|'itRequest'>;
}

