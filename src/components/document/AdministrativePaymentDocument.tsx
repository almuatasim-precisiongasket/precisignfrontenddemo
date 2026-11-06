import type { AdminWorkFormData } from '../../types';
import { CompanyLogoSlot } from './CompanyLogoSlot';
import './AdministrativePaymentDocument.css';

const notes = [
  'Urgent-Priority requests will be processed within the same hour/immediately.',
  'Medium-Priority requests will be processed within 3 days.',
  'Low-Priority requests will be processed within 7 days.',
  'Payment will be processed in three – Four Working days after submission of request, If Urgent Payment, please mention in the form to process urgently.',
  'Supporting documents must be appropriate otherwise requested will be returned and payment will not be processed, and finance will not be responsible for such delays.',
  'Supporting documents must have company name; vat Number of both the parties',
  'Advance Cash must be closed / Petty cash claim should be submitted within 2 weeks.',
];

function Label({ english, arabic }: { english: string; arabic: string }) {
  return <div className="admin-payment-label">{english}<span lang="ar" dir="rtl">{arabic}</span></div>;
}

export function AdministrativePaymentDocument({ data }: { data: AdminWorkFormData }) {
  const details = data.administrativePayment;
  const payment = details?.payment;
  const signatures = [
    { english: 'Requester Signature', arabic: 'توقيع صاحب الطلب', name: data.requesterSignatureName, url: data.requesterSignatureDataUrl },
    { english: 'Department Head Signature', arabic: 'توقيع رئيس القسم', name: details?.departmentHeadSignature?.name, url: details?.departmentHeadSignature?.dataUrl },
    { english: 'Approver Signature', arabic: 'توقيع المخول بالاعتماد', name: data.approvalAuthoritySignatureName, url: data.approvalAuthoritySignatureDataUrl },
  ];
  const fields = [
    { english: 'Date of Request', arabic: 'تاريخ الطلب', value: data.dateOfRequest },
    { english: 'Department', arabic: 'القسم', value: data.department },
    { english: 'Name of the Requester', arabic: 'اسم صاحب الطلب', value: data.requesterName },
    { english: 'Documents', arabic: 'المستندات', value: details?.documentDescription },
  ];

  return (
    <article className="admin-payment-document" aria-label="Administrative and Payment Request document">
      <header className="admin-payment-header">
        <CompanyLogoSlot className="admin-payment-logo" />
        <div>
          <p>{data.companyName}</p>
          <h2>Administrative &amp; Payment Request Form</h2>
        </div>
      </header>
      <div className="admin-payment-grid">
        {fields.map(field => (
          <section key={field.english}>
            <Label english={field.english} arabic={field.arabic} />
            <p dir="auto">{field.value}</p>
          </section>
        ))}
      </div>
      <section>
        <Label english="Priority" arabic="الأهمية" />
        <p>{data.priority}</p>
      </section>
      <section className="admin-payment-description">
        <Label english="Work Description" arabic="وصف الطلب" />
        <p dir="auto">{data.workDescription}</p>
      </section>
      <section className="avoid-page-break">
        <Label english="Administrative Team Use Only" arabic="للاستخدام من قبل الفريق الإداري فقط" />
        <dl className="admin-payment-completion">
          <div><dt><Label english="Work Completion Status" arabic="حالة إتمام الطلب" /></dt><dd>{data.adminUseOnly?.status}</dd></div>
          <div><dt><Label english="Work Completion Date" arabic="تاريخ إتمام الطلب" /></dt><dd>{data.adminUseOnly?.completionDate}</dd></div>
          <div><dt><Label english="Work Completed by Name" arabic="اسم منفذ الطلب" /></dt><dd>{data.adminUseOnly?.completedByName}</dd></div>
        </dl>
      </section>
      <section className="avoid-page-break">
        <Label english="Payment Section" arabic="قسم الدفع" />
        <dl className="admin-payment-completion">
          <div><dt><Label english="Amount" arabic="القيمة" /></dt><dd>{payment && `${payment.amount} SAR`}</dd></div>
          <div><dt><Label english="Mode of Transfer" arabic="طريقة التحويل" /></dt><dd>{payment?.transferMode}</dd></div>
          {payment?.transferDetails?.trim() && <div><dt><Label english="Transfer details" arabic="تفاصيل التحويل" /></dt><dd>{payment.transferDetails}</dd></div>}
          <div><dt><Label english="Purpose" arabic="الغرض" /></dt><dd>{payment?.purpose === 'Other' ? payment.otherPurpose : payment?.purpose}</dd></div>
        </dl>
      </section>
      <div className="admin-payment-signatures avoid-page-break">
        {signatures.map(signature => (
          <section key={signature.english}>
            <Label english={signature.english} arabic={signature.arabic} />
            <div className="admin-payment-signature">
              {signature.url && <img src={signature.url} alt={`${signature.name || signature.english} signature`} />}
            </div>
            {signature.name && <p>{signature.name}</p>}
          </section>
        ))}
      </div>
      <section className="admin-payment-notes avoid-page-break">
        <strong>Notes</strong>
        <ul>{notes.map(note => <li key={note}>{note}</li>)}</ul>
      </section>
    </article>
  );
}
