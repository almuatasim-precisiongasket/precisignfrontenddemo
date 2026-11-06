import type { PriorityLevel } from '../../types';
import { CompanyLogoSlot } from './CompanyLogoSlot';
import './ITRequestDocument.css';

export interface ITRequestFields {
  department: string;
  requester: string;
  date: string;
  requestType: string;
  priority: PriorityLevel | '';
  details: string;
  justification: string;
}

interface ITSignature { name?: string; dataUrl?: string }

export function ITRequestDocument({ fields, organization, requesterSignature, approvalSignature, remarks }: {
  fields: ITRequestFields;
  organization: string;
  requesterSignature?: ITSignature;
  approvalSignature?: ITSignature;
  remarks?: string;
}) {
  const parsedDate = new Date(fields.date);
  const date = Number.isNaN(parsedDate.getTime()) ? fields.date : new Intl.DateTimeFormat('en-GB', { timeZone: 'UTC' }).format(parsedDate);
  const signatures = [
    { title: 'Requester Signature', signature: requesterSignature },
    { title: 'Approval Authority Signature', signature: approvalSignature },
  ];
  const metadata = [
    ['Organization Name', organization],
    ['Department', fields.department],
    ['Name of the Requester', fields.requester],
    ['Type of Request', fields.requestType],
    ['Date of Request', date],
    ['Priority', fields.priority],
  ];

  return (
    <article className="it-request-document" aria-label="IT Request Form document">
      <header className="it-document-header">
        <CompanyLogoSlot className="it-document-brand" />
        <h3>IT Request Form</h3>
      </header>
      <div className="it-document-body">
        <dl className="it-document-grid">
          {metadata.map(([label, value]) => (
            <div key={label} className="it-document-cell">
              <dt>{label}</dt>
              <dd dir="auto">{value || (label === 'Priority' ? '(Urgent, Medium, Low)' : '')}</dd>
            </div>
          ))}
        </dl>
        <section className="it-document-text">
          <h4>Request in Detail</h4>
          <p dir="auto">{fields.details}</p>
        </section>
        <section className="it-document-text">
          <h4>Purpose / Business Justification of Request</h4>
          <p dir="auto">{fields.justification}</p>
        </section>
        <div className="it-document-grid it-document-signatures">
          {signatures.map(({ title, signature }) => (
            <section key={title} className="it-document-cell">
              <h4>{title}</h4>
              <p>Name <span className="it-signature-line">{signature?.name}</span></p>
              <p>Signature <span className="it-signature-line">{signature?.dataUrl && <img className="max-h-10 w-auto" src={signature.dataUrl} alt={title} />}</span></p>
            </section>
          ))}
        </div>
        <section className="it-document-remarks">
          <h4>IT Remarks</h4>
          {remarks && <p className="whitespace-pre-wrap text-left" dir="auto">{remarks}</p>}
        </section>
      </div>
    </article>
  );
}
