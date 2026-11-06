import { useState } from 'react';
import { ArrowLeft, Printer } from 'lucide-react';
import { useApp } from '../../context/AppContext';
import type { CompanyId, PriorityLevel } from '../../types';
import { canUserAccessCompany } from '../../utils/companyAccess';
import { ITRequestDocument, type ITRequestFields } from '../document/ITRequestDocument';
import { SignatureModal } from '../modals/SignatureModal';
import { applySignerChoices, type SignerChoices as Choices } from '../../utils/signingSelection';
import { SignerChoices } from './SignerChoices';

const priorities = ['Urgent', 'Medium', 'Low'] as const;
const control = 'block w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-[#192B3C] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#365C78]';

export function ITRequestPreviewView({ onBack }: { onBack: () => void }) {
  const { currentUser, companies, selectedScope, workflows, users, submitNewRequest, openReviewRequest } = useApp();
  const [signing, setSigning] = useState(false);
  const [error, setError] = useState('');
  const groupView = selectedScope === 'PEG';
  const availableCompanies = companies.filter(company => canUserAccessCompany(currentUser, company.id));
  const [companyId, setCompanyId] = useState<CompanyId | ''>('');
  const organization = availableCompanies.find(company => company.id === (groupView ? companyId : selectedScope));
  const workflow = workflows.find(route => route.companyId === organization?.id && route.formType === 'IT Request');
  const [choices, setChoices] = useState<Choices>({});
  const [fields, setFields] = useState<ITRequestFields>(() => ({
    department: currentUser.department,
    requester: currentUser.name,
    date: new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kuwait', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date()),
    requestType: '',
    priority: '',
    details: '',
    justification: '',
  }));

  function update<K extends keyof ITRequestFields>(field: K, value: ITRequestFields[K]) {
    setFields(previous => ({ ...previous, [field]: value }));
  }

  function reviewAndSign() {
    const selection = workflow && applySignerChoices(workflow, users, currentUser.id, choices);
    if (!organization || !selection || selection.error) {
      setError(selection?.error ?? 'Select a company with a configured IT approver.');
    } else if (!fields.date || !fields.department.trim() || !fields.requestType.trim() || !fields.priority || !fields.details.trim() || !fields.justification.trim()) {
      setError('Complete the request fields and choose a priority before sending.');
    } else {
      setError('');
      setSigning(true);
    }
  }

  async function submit(signature: string) {
    if (!organization || !fields.priority) return { success: false, error: 'Review the organization and priority before sending.' };
    const result = await submitNewRequest({
      companyId: organization.id,
      companyName: organization.fullName,
      requesterId: currentUser.id,
      requesterName: currentUser.name,
      dateOfRequest: fields.date,
      department: fields.department,
      priority: fields.priority,
      workDescription: fields.details,
      documents: {
        onlineDocumentChamber: false, physicalDocumentChamber: false, companyDocumentAjeer: false,
        employeeSalaryCertificate: false, permanentEmploymentVisa: false, workVisitVisa: false,
        businessVisitVisa: false, agencyWakala: false, others: false, othersDescription: '',
      },
      itRequest: { requestType: fields.requestType, justification: fields.justification },
    }, [], undefined, signature, choices);
    if (result.success && result.newId) openReviewRequest(result.newId);
    if (result.routeChanged) { setSigning(false); setChoices({}); setError(result.error ?? 'Review the updated route.'); }
    return result;
  }

  return (
    <div className="it-request-preview mx-auto max-w-[1450px] space-y-5 p-4 md:p-6">
      <header className="no-print space-y-3">
        <button type="button" onClick={onBack} className="inline-flex items-center gap-2 rounded py-2 text-sm font-semibold text-[#365C78] hover:underline">
          <ArrowLeft aria-hidden="true" size={16} /> Back to forms
        </button>
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <div className="flex flex-wrap items-center gap-3">
              <h1 className="text-2xl font-semibold tracking-tight text-workspace-ink">IT Request Form</h1>
            </div>
            <p className="mt-1 text-sm text-slate-600">Fill in the form and review your approver before sending. Entries stay here until you leave.</p>
          </div>
          <button type="button" onClick={() => window.print()} className="workspace-control inline-flex min-h-10 items-center gap-2 px-4 text-sm font-semibold">
            <Printer aria-hidden="true" size={16} /> Print / Save as PDF
          </button>
        </div>
      </header>

      <div className="it-request-layout grid items-start gap-5 xl:grid-cols-[minmax(20rem,2fr)_minmax(0,3fr)]">
        <section aria-label="Request fields" className="no-print workspace-panel space-y-5 p-4 sm:p-5">
          <div className="space-y-4">
            <h2 className="text-base font-bold">Requester information</h2>
            {groupView ? (
              <label className="block space-y-1 text-sm font-medium">
                <span>Organization name</span>
                <select className={control} value={companyId} onChange={event => { setCompanyId(event.target.value as CompanyId | ''); setChoices({}); }}>
                  <option value="">Select a subsidiary</option>
                  {availableCompanies.map(company => <option key={company.id} value={company.id}>{company.fullName}</option>)}
                </select>
              </label>
            ) : (
              <div className="space-y-1 text-sm">
                <p className="font-medium">Organization name</p>
                <p className="rounded-md bg-slate-50 px-3 py-2">{organization?.fullName || 'Unavailable'}</p>
              </div>
            )}
            <label className="block space-y-1 text-sm font-medium">
              <span>Name of the requester</span>
              <input className={control} value={fields.requester} readOnly />
            </label>
            <label className="block space-y-1 text-sm font-medium">
              <span>Department</span>
              <input className={control} value={fields.department} onChange={event => update('department', event.target.value)} />
            </label>
            <label className="block space-y-1 text-sm font-medium">
              <span>Date of request</span>
              <input className={control} type="date" value={fields.date} onChange={event => update('date', event.target.value)} />
            </label>
          </div>
          <div className="space-y-4 border-t border-slate-200 pt-4">
            <h2 className="text-base font-bold">Request information</h2>
            <label className="block space-y-1 text-sm font-medium">
              <span>Type of request</span>
              <input className={control} maxLength={150} placeholder="e.g. Network access" value={fields.requestType} onChange={event => update('requestType', event.target.value)} />
            </label>
            <fieldset className="space-y-1">
              <legend className="text-sm font-medium">Priority</legend>
              <div className="flex flex-wrap gap-2">
                {priorities.map(priority => (
                  <label key={priority} className={`flex min-h-10 cursor-pointer items-center gap-2 rounded-md border px-3 text-sm ${fields.priority === priority ? 'border-workspace-teal bg-workspace-tint' : 'border-slate-200'}`}>
                    <input type="radio" name="it-priority" value={priority} checked={fields.priority === priority} onChange={event => update('priority', event.target.value as PriorityLevel)} className="accent-[#365C78]" />
                    {priority}
                  </label>
                ))}
              </div>
            </fieldset>
            <label className="block space-y-1 text-sm font-medium">
              <span>Request in detail</span>
              <textarea className={control} rows={4} maxLength={20000} placeholder="Describe what you need from IT." value={fields.details} onChange={event => update('details', event.target.value)} />
            </label>
            <label className="block space-y-1 text-sm font-medium">
              <span>Business justification</span>
              <textarea className={control} rows={4} maxLength={10000} placeholder="Explain what work this request will support." value={fields.justification} onChange={event => update('justification', event.target.value)} />
            </label>
          </div>
          <div className="space-y-2 border-t border-slate-200 pt-4 text-sm">
            <SignerChoices workflow={workflow} users={users} requester={currentUser} value={choices} onChange={setChoices} />
            {error && <p role="alert" className="text-rose-700">{error}</p>}
            <button type="button" onClick={reviewAndSign} className="workspace-primary min-h-10 px-4 py-2">Sign &amp; send</button>
          </div>
        </section>
        <section aria-labelledby="it-live-preview-heading" className="it-request-preview-panel min-w-0 rounded-lg border border-slate-200 bg-[#E8EDF1]">
          <div className="no-print flex items-center justify-between gap-3 border-b border-slate-200 bg-white px-4 py-3">
            <h2 id="it-live-preview-heading" className="flex items-center gap-2 text-sm font-bold">
              <span aria-hidden="true" className="size-2 rounded-full bg-teal-600" /> Live document preview
            </h2>
            <span className="text-xs font-medium text-slate-600">A4 portrait</span>
          </div>
          <div className="it-request-paper-wrap p-2 sm:p-5">
            <ITRequestDocument fields={fields} organization={organization?.fullName ?? ''} />
          </div>
        </section>
      </div>
      {signing && <SignatureModal isOpen onClose={() => setSigning(false)} user={currentUser} title="Sign IT Request" confirmLabel="Sign & send" onConfirm={submit} />}
    </div>
  );
}
