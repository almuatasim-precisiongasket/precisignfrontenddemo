import type { AdminWorkFormData, AttachmentItem, RequestRecord } from '../../types';
import { CompanyLogoSlot } from './CompanyLogoSlot';
import './AdministrativePaymentDocument.css';

function SignatureBox({ label, name, image }: { label: string; name?: string; image?: string }) {
  return (
    <div className="min-w-0 border-t border-slate-700 p-2">
      <strong>{label}</strong>
      <div className="admin-payment-signature">{image && <img src={image} alt={`${label} signature`} />}</div>
      {name && <p>{name}</p>}
    </div>
  );
}

export function FinancialRequestDocument({ data, processing, attachments = [] }: { data: AdminWorkFormData; processing?: RequestRecord['processing']; attachments?: AttachmentItem[] }) {
  const voucher = data.cashVoucher;
  const claim = data.expenseClaim;
  if (!voucher && !claim) return null;
  const title = voucher ? 'Cash Voucher' : 'Expense Claim Form';
  const totalHalalas = claim?.lines.reduce((sum, line) => sum + Math.round(Number(line.amount) * 100), 0) ?? 0;

  return (
    <article className={`admin-payment-document${voucher ? ' cash-voucher-document' : ''}`} aria-label={title}>
      <header className="admin-payment-header">
        <CompanyLogoSlot className="admin-payment-logo" logoUrl={data.companyLogoDataUrl} />
        <p>{data.companyName}</p>
        <h2>{title}</h2>
      </header>
      {voucher ? (
        <>
          <section className="grid grid-cols-2 gap-2">
            <p><strong>Date</strong> {data.dateOfRequest}</p>
            <p><strong>SAR</strong> {voucher.amount}</p>
            <p><strong>To</strong> {voucher.payee}</p>
            <p><strong>Cash source</strong> {voucher.source}</p>
            <p className="col-span-2"><strong>Amount in words</strong> {voucher.amountInWords}</p>
          </section>
          <section className="min-h-28 whitespace-pre-wrap"><strong>Against</strong><p>{data.workDescription}</p></section>
          <div className="grid grid-cols-3 divide-x divide-slate-700 text-center avoid-page-break">
            <SignatureBox label="Receiver's Signature" name={processing?.cashReceiptWaiver ? `Waived by ${processing.cashReceiptWaiver.byName}` : processing?.cashReceipt?.byName} image={processing?.cashReceipt?.signatureDataUrl} />
            <SignatureBox label="Approved by" name={data.approvalAuthoritySignatureName} image={data.approvalAuthoritySignatureDataUrl} />
            <SignatureBox label="Cashier Signature" name={processing?.cashPayout?.byName} image={processing?.cashPayout?.signatureDataUrl} />
          </div>
        </>
      ) : claim && (
        <>
          <section className="grid grid-cols-2 gap-2">
            <p><strong>Claimed by</strong> {data.requesterName}</p>
            <p><strong>Designation</strong> {claim.designation}</p>
            <p><strong>Date</strong> {data.dateOfRequest}</p>
            <p><strong>Project</strong> {claim.project}</p>
          </section>
          <table className="w-full table-fixed border-collapse text-left [&_td]:border [&_td]:p-1.5 [&_th]:border [&_th]:p-1.5">
            <thead><tr><th className="w-[9%]">No.</th><th className="w-[19%]">Date</th><th>Particulars</th><th className="w-[20%]">Amount</th></tr></thead>
            <tbody>
              {claim.lines.map((line, index) => (
                <tr className="avoid-page-break" key={index}><td>{index + 1}</td><td>{line.date}</td>
                  <td>{line.particulars}{line.noBillReason && <p>No bill: {line.noBillReason}</p>}
                    {line.receiptIndex !== undefined && <p>Receipt {line.receiptIndex + 1}: {attachments[line.receiptIndex]?.name ?? 'Unavailable'}</p>}
                  </td>
                  <td className="text-right">{Number(line.amount).toFixed(2)}</td></tr>
              ))}
            </tbody>
            <tfoot><tr><th colSpan={3}>Total (SAR)</th><td className="text-right">{(totalHalalas / 100).toFixed(2)}</td></tr></tfoot>
          </table>
          <div className="grid grid-cols-4 divide-x divide-slate-700 text-center avoid-page-break">
            <SignatureBox label="Claimed by" name={data.requesterSignatureName} image={data.requesterSignatureDataUrl} />
            <SignatureBox label="Department Head" name={claim.departmentHeadSignature?.name} image={claim.departmentHeadSignature?.dataUrl} />
            <SignatureBox label="Approval Authority" name={data.approvalAuthoritySignatureName} image={data.approvalAuthoritySignatureDataUrl} />
            <SignatureBox label="Finance" name={processing?.expenseSettlement?.byName} image={processing?.expenseSettlement?.signatureDataUrl} />
          </div>
        </>
      )}
    </article>
  );
}
