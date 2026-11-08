import { RndRequestDocument } from '../rnd/RndRequestDocument';
import type { AdminWorkFormData, AttachmentItem, RequestRecord } from '../../types';
import { AdminWorkRequestDocument } from './AdminWorkRequestDocument';
import { AdministrativePaymentDocument } from './AdministrativePaymentDocument';
import { FinancialRequestDocument } from './FinancialRequestDocument';
import { ITRequestDocument } from './ITRequestDocument';

interface RequestDocumentProps {
  formType: RequestRecord['formType'];
  data: AdminWorkFormData;
  attachments?: AttachmentItem[];
  processing?: RequestRecord['processing'];
  print?: boolean;
}

export function getRequestDocumentVersion(request: RequestRecord, version: number): RequestDocumentProps | undefined {
  const current = version === request.documentVersion;
  const data = current ? request.formData : request.versionSnapshots?.find(snapshot => snapshot.version === version)?.formData;
  if (!data) return undefined;
  return {
    formType: request.formType,
    data,
    attachments: current ? request.attachments : request.attachmentVersions?.find(snapshot => snapshot.version === version)?.attachments,
    processing: current ? request.processing : undefined,
  };
}

export function RequestDocument({ formType, data, attachments, processing, print }: RequestDocumentProps) {
  switch (formType) {
    case 'R&D Initiative': return <RndRequestDocument data={data} />;
    case 'Cash Voucher':
    case 'Expense Claim':
      return <FinancialRequestDocument data={data} attachments={attachments} processing={processing} />;
    case 'Administrative & Payment Request': {
      const adminWork = processing?.adminWork;
      return <AdministrativePaymentDocument data={adminWork ? {
        ...data,
        adminUseOnly: {
          status: 'Completed',
          completionDate: adminWork.at.slice(0, 10),
          completedByName: adminWork.byName,
        },
      } : data} />;
    }
    case 'IT Request':
      return <ITRequestDocument organization={data.companyName} logoUrl={data.companyLogoDataUrl} fields={{
        department: data.department,
        requester: data.requesterName,
        date: data.dateOfRequest,
        priority: data.priority,
        details: data.workDescription,
        requestType: data.itRequest?.requestType ?? '',
        justification: data.itRequest?.justification ?? '',
      }} requesterSignature={{ name: data.requesterSignatureName, dataUrl: data.requesterSignatureDataUrl }}
        approvalSignature={{ name: data.approvalAuthoritySignatureName, dataUrl: data.approvalAuthoritySignatureDataUrl }}
        remarks={processing?.itWork?.note} />;
    case 'Admin Work Request':
      return <AdminWorkRequestDocument data={data} isPrintMode={print} />;
    default:
      return null;
  }
}
