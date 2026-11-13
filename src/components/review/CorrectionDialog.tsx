import React from 'react';
import { WorkspaceDialog } from '../common/WorkspaceDialog';
import { FinancialCorrectionFields } from './FinancialCorrectionFields';
import { RndFields } from '../rnd/RndFields';
import type { AdminWorkFormData, AttachmentItem, RequestRecord, UserProfile } from '../../types';

export interface CorrectionDialogProps {
  request: RequestRecord;
  currentUser: UserProfile;
  saving: boolean;
  actionError: string | null;
  correctedForm: AdminWorkFormData;
  correctedAttachments: AttachmentItem[];
  resubmitChangeNote: string;
  onFormChange: React.Dispatch<React.SetStateAction<AdminWorkFormData>>;
  onAttachmentsChange: React.Dispatch<React.SetStateAction<AttachmentItem[]>>;
  onChangeNoteChange: (value: string) => void;
  onClose: () => void;
  onSubmit: () => void;
}

export const CorrectionDialog: React.FC<CorrectionDialogProps> = ({
  request,
  currentUser,
  saving,
  actionError,
  correctedForm,
  correctedAttachments,
  resubmitChangeNote,
  onFormChange,
  onAttachmentsChange,
  onChangeNoteChange,
  onClose,
  onSubmit,
}) => (
  <WorkspaceDialog titleId="correction-heading" busy={saving} onClose={onClose} className="max-w-lg p-5">
    <div className="w-full space-y-4">
      <div className="border-b border-[#E2E5E9] pb-3">
        <h3 id="correction-heading" className="text-base font-semibold text-[#192B3C]">
          Revise &amp; Resubmit Request (Version {request.documentVersion + 1})
        </h3>
        <p className="text-xs text-slate-500">
          Make the requested changes and sign the new version. It goes back to the first approver.
        </p>
      </div>

      {actionError && <p role="alert" className="text-xs text-rose-700">{actionError}</p>}
      <div className="space-y-3 text-xs">
        <div className="grid gap-3 sm:grid-cols-2">
          <label>Date of request
            <input className="w-full px-3 py-1.5 border rounded" value={correctedForm.dateOfRequest} onChange={(e) => onFormChange((prev) => ({ ...prev, dateOfRequest: e.target.value }))} />
          </label>
          <label>Department
            <input className="w-full px-3 py-1.5 border rounded" value={correctedForm.department} onChange={(e) => onFormChange((prev) => ({ ...prev, department: e.target.value }))} />
          </label>
          <label>Priority
            <select className="w-full px-3 py-1.5 border rounded" value={correctedForm.priority} onChange={(e) => onFormChange((prev) => ({ ...prev, priority: e.target.value as AdminWorkFormData['priority'] }))}>
              <option>Urgent</option><option>Medium</option><option>Low</option>
            </select>
          </label>
        </div>
        {correctedForm.rnd ? (
          <RndFields
            value={correctedForm.rnd}
            onChange={rnd => onFormChange(previous => ({
              ...previous,
              rnd,
              workDescription: rnd.fields.inpProbTitle ?? '',
              department: rnd.fields.inpDept ?? '',
              dateOfRequest: rnd.fields.inpSubDate ?? '',
            }))}
          />
        ) : correctedForm.administrativePayment || correctedForm.expenseClaim ? (
          <FinancialCorrectionFields data={correctedForm} attachments={correctedAttachments} onChange={onFormChange} />
        ) : request.formType === 'IT Request' ? (
          <fieldset className="space-y-2">
            <legend className="font-semibold">IT request details</legend>
            <label className="block">Type of request
              <input
                maxLength={150}
                className="w-full rounded border px-3 py-1.5"
                value={correctedForm.itRequest?.requestType ?? ''}
                onChange={event => onFormChange({
                  ...correctedForm,
                  itRequest: { requestType: event.target.value, justification: correctedForm.itRequest?.justification ?? '' },
                })}
              />
            </label>
            <label className="block">Business justification
              <textarea
                maxLength={10000}
                className="w-full rounded border px-3 py-1.5"
                value={correctedForm.itRequest?.justification ?? ''}
                onChange={event => onFormChange({
                  ...correctedForm,
                  itRequest: { requestType: correctedForm.itRequest?.requestType ?? '', justification: event.target.value },
                })}
              />
            </label>
          </fieldset>
        ) : (
          <fieldset className="space-y-1">
            <legend className="font-semibold">Documents</legend>
            {([
              ['onlineDocumentChamber', 'Online Document Chamber'], ['physicalDocumentChamber', 'Physical Document Chamber'],
              ['companyDocumentAjeer', 'Company document Ajeer'], ['employeeSalaryCertificate', 'Employee Salary Certificate'],
              ['permanentEmploymentVisa', 'Permanent Employment Visa'], ['workVisitVisa', 'Work Visit Visa'],
              ['businessVisitVisa', 'Business Visit Visa'], ['agencyWakala', 'Agency Wakala'], ['others', 'Others'],
            ] as const).map(([key, label]) => (
              <label key={key} className="flex gap-2 items-center">
                <input
                  type="checkbox"
                  checked={correctedForm.documents[key]}
                  onChange={(e) => onFormChange((prev) => ({
                    ...prev,
                    documents: { ...prev.documents, [key]: e.target.checked },
                  }))}
                />
                {label}
              </label>
            ))}
            {correctedForm.documents.others && (
              <input
                aria-label="Other documents"
                className="w-full px-3 py-1.5 border rounded"
                value={correctedForm.documents.othersDescription}
                onChange={(e) => onFormChange((prev) => ({
                  ...prev,
                  documents: { ...prev.documents, othersDescription: e.target.value },
                }))}
              />
            )}
          </fieldset>
        )}
        <div className="space-y-1">
          <label className="font-semibold">Attachments <input type="file" multiple onChange={(event) => {
            Array.from(event.target.files || []).forEach((file) => {
              const reader = new FileReader();
              reader.onload = () => onAttachmentsChange((prev) => [...prev, {
                id: `att-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
                name: file.name,
                sizeBytes: file.size,
                sizeFormatted: `${Math.ceil(file.size / 1024)} KB`,
                uploadedAt: new Date().toISOString(),
                uploadedBy: currentUser.name,
                mimeType: file.type || 'application/octet-stream',
                dataUrl: String(reader.result),
              }]);
              reader.readAsDataURL(file);
            });
            event.target.value = '';
          }} /></label>
          {correctedAttachments.map((attachment, index) => {
            const preservesReceiptOrder = [request.formData.expenseClaim, correctedForm.expenseClaim]
              .some(claim => claim?.lines.some(line => line.receiptIndex !== undefined && line.receiptIndex >= index));
            return (
              <div key={attachment.id} className="flex justify-between">
                <span>{attachment.name}</span>
                {preservesReceiptOrder ? (
                  <span className="text-slate-500">Kept for receipt links</span>
                ) : (
                  <button type="button" onClick={() => onAttachmentsChange(prev => prev.filter(item => item.id !== attachment.id))}>Remove</button>
                )}
              </div>
            );
          })}
        </div>
        <div>
          <label htmlFor="corrected-work-description" className="block font-semibold text-slate-700 mb-1">
            Updated work description
          </label>
          <textarea
            id="corrected-work-description"
            rows={3}
            value={correctedForm.workDescription}
            onChange={(e) =>
              onFormChange((prev) => ({ ...prev, workDescription: e.target.value }))
            }
            className="w-full px-3 py-2 border border-[#E2E5E9] rounded focus:outline-none focus:ring-1 focus:ring-[#365C78]"
          />
        </div>

        <div>
          <label htmlFor="resubmit-change-note" className="block font-semibold text-slate-700 mb-1">
            What changed? (optional)
          </label>
          <input
            id="resubmit-change-note"
            type="text"
            maxLength={2000}
            value={resubmitChangeNote}
            onChange={(e) => onChangeNoteChange(e.target.value)}
            placeholder="Summarize the changes you made"
            aria-describedby="resubmit-change-note-help"
            className="w-full px-3 py-1.5 border border-[#E2E5E9] rounded focus:outline-none focus:ring-1 focus:ring-[#365C78]"
          />
          <p id="resubmit-change-note-help" className="mt-1 text-slate-600">Your note will appear in the request history.</p>
        </div>
      </div>

      <div className="flex justify-end gap-2 pt-2 border-t border-[#E2E5E9]">
        <button
          type="button"
          disabled={saving}
          onClick={onClose}
          className="px-3 py-1.5 text-xs font-semibold text-slate-600 hover:bg-slate-100 rounded"
        >
          Cancel
        </button>
        <button
          type="button"
          disabled={saving}
          onClick={onSubmit}
          className="min-h-10 rounded-md bg-[#192B3C] px-4 text-xs font-semibold text-white enabled:hover:bg-[#2A4A62] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#365C78] disabled:opacity-60"
        >
          Review &amp; sign revision
        </button>
      </div>
    </div>
  </WorkspaceDialog>
);

