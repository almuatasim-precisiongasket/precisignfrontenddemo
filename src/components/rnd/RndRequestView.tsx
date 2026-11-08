import { useState } from 'react';
import { ArrowLeft, FlaskConical } from 'lucide-react';
import { useApp } from '../../context/AppContext';
import type { AdminWorkFormData, AttachmentItem, CompanyId, RndFormData } from '../../types';
import { canUserStartForm } from '../../utils/companyAccess';
import { RND_FORM } from '../../utils/rndFields';
import { validateRnd } from '../../utils/rndWorkflow';
import { applySignerChoices, type SignerChoices as Choices } from '../../utils/signingSelection';
import { RequestCompanyField } from '../create/RequestCompanyField';
import { SignerChoices } from '../create/SignerChoices';
import { EditorViewToggle } from '../create/EditorViewToggle';
import { SupportingFiles, checkSupportingFiles } from '../create/SupportingFiles';
import { SignatureModal } from '../modals/SignatureModal';
import { RndFields } from './RndFields';
import { RndDocumentPreview } from './RndDocumentPreview';

export function RndRequestView({ onBack }: { onBack: () => void }) {
  const { currentUser, companies, selectedScope, workflows, users, submitNewRequest, openReviewRequest } = useApp();
  const [companyId, setCompanyId] = useState<CompanyId | ''>('');
  const [view, setView] = useState<'editor' | 'preview'>('editor');
  const [choices, setChoices] = useState<Choices>({});
  const [error, setError] = useState('');
  const [signing, setSigning] = useState(false);
  const [files, setFiles] = useState<AttachmentItem[]>([]);
  const [uploading, setUploading] = useState(false);
  const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kuwait', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
  const [rnd, setRnd] = useState<RndFormData>({ fields: { inpSubDate: today, inpDept: currentUser.department, inpEmpName: currentUser.name, inpContact: currentUser.email ?? '', inpGSubBy: currentUser.name, inpGDate: today }, choices: {}, marketRows: [{ sol: '', sup: '', web: '' }, { sol: '', sup: '', web: '' }] });
  const company = companies.find(company => company.id === (selectedScope === 'PEG' ? companyId : selectedScope) && canUserStartForm(currentUser, company.id, RND_FORM));
  const workflow = workflows.find(route => route.companyId === company?.id && route.formType === RND_FORM);
  const fields = { ...rnd, fields: { ...rnd.fields, inpCompany: company?.fullName ?? '' } };
  const data: AdminWorkFormData = {
    companyId: company?.id ?? 'PEW', companyName: company?.fullName ?? '', companyLogoDataUrl: company?.logoDataUrl,
    requesterId: currentUser.id, requesterName: currentUser.name, dateOfRequest: rnd.fields.inpSubDate,
    department: rnd.fields.inpDept, priority: 'Medium', workDescription: rnd.fields.inpProbTitle ?? '', rnd: fields,
    documents: { onlineDocumentChamber: false, physicalDocumentChamber: false, companyDocumentAjeer: false, employeeSalaryCertificate: false, permanentEmploymentVisa: false, workVisitVisa: false, businessVisitVisa: false, agencyWakala: false, others: false, othersDescription: '' },
  };
  async function addFiles(selected: FileList) {
    const selectedFiles = Array.from(selected);
    const problem = checkSupportingFiles(selectedFiles, files, 20);
    if (problem) { setError(problem); return; }
    setUploading(true); setError('');
    try {
      const loaded = await Promise.all(selectedFiles.map(async file => {
        const dataUrl = await new Promise<string>((resolve, reject) => { const reader = new FileReader(); reader.onload = () => resolve(String(reader.result)); reader.onerror = reject; reader.readAsDataURL(file); });
        return { id: crypto.randomUUID(), name: file.name, sizeBytes: file.size, sizeFormatted: `${Math.ceil(file.size / 1024)} KB`, mimeType: file.type, uploadedAt: new Date().toISOString(), uploadedBy: currentUser.name, dataUrl };
      }));
      setFiles(previous => [...previous, ...loaded]);
    } catch { setError('Could not read those files. Try again.'); }
    finally { setUploading(false); }
  }
  function review() {
    setView('editor');
    const problem = !company ? 'Choose a legal company.' : !rnd.fields.inpDept?.trim() || !rnd.fields.inpSubDate?.trim() ? 'Enter the submission date and department.' : validateRnd(fields, false);
    if (problem) { setError(problem); requestAnimationFrame(() => document.getElementById('rnd-error')?.focus()); return; }
    const selection = workflow && applySignerChoices(workflow, users, currentUser.id, choices);
    if (!selection || selection.error) { document.getElementById('signer-review')?.focus(); return; }
    setError(''); setSigning(true);
  }
  return <div data-editor-view={view} className="request-editor mx-auto max-w-[1500px] space-y-5 p-4 md:p-6">
    <header className="no-print space-y-3"><button className="inline-flex items-center gap-2 py-2 text-sm font-semibold text-workspace-teal" onClick={onBack}><ArrowLeft size={16} /> Back to forms</button>
      <div className="flex items-start gap-3"><span className="rounded-xl bg-teal-100 p-3 text-teal-800"><FlaskConical size={24} /></span><div><p className="text-xs font-semibold text-workspace-muted">PR#26-RND01 · Research &amp; Development</p><h1 className="text-2xl font-bold text-workspace-ink">R&amp;D Initiative</h1><p className="mt-1 text-sm text-workspace-muted">Describe the challenge, explore solutions and set a route for review.</p></div></div>
    </header>
    <EditorViewToggle value={view} onChange={setView} />
    <div className="editor-columns">
      <section className="editor-fields no-print workspace-panel min-w-0 space-y-5 p-4 sm:p-5" aria-label="R&D request fields">
        <RequestCompanyField form={RND_FORM} value={company?.id ?? ''} onChange={selectedScope === 'PEG' ? id => { setCompanyId(id); setChoices({}); } : undefined} />
        <p className="rounded-lg bg-slate-50 p-3 text-xs text-workspace-muted">Complete sections A–G. Section H is reserved for the assigned final approver. Entries stay here until you leave.</p>
        <RndFields value={fields} onChange={setRnd} />
        <SupportingFiles title="Supporting attachments" files={files} maxFiles={20} busy={uploading} onSelect={addFiles} onRemove={index => setFiles(files.filter((_, i) => i !== index))} />
        <SignerChoices form={RND_FORM} workflow={workflow} users={users} requester={currentUser} value={choices} onChange={setChoices} companySelected={!!company} />
        {error && <p id="rnd-error" tabIndex={-1} role="alert" className="rounded-lg bg-rose-50 p-3 text-sm text-rose-800">{error}</p>}
        <button type="button" className="workspace-primary min-h-11 w-full px-4" disabled={uploading} onClick={review}>Sign &amp; send R&amp;D request</button>
      </section>
      <section className="editor-preview min-w-0 overflow-auto rounded-xl bg-slate-200" aria-label="Live two-page document preview">
        <div className="no-print sticky top-0 z-10 flex justify-between bg-white px-4 py-3 text-sm font-semibold"><span>Live document preview</span><span className="text-xs text-workspace-muted">A4 · Sections A–H</span></div>
        <p className="no-print px-4 pt-2 text-xs text-workspace-muted">Two-page format. Long responses may continue onto additional pages.</p>
        <RndDocumentPreview data={data} />
      </section>
    </div>
    {signing && <SignatureModal isOpen user={currentUser} onClose={() => setSigning(false)} title="Sign R&D submission" confirmLabel="Sign & send" noteLabel="Note to signers" onConfirm={async (signature, note) => {
      const result = await submitNewRequest(data, files, note, signature, choices);
      if (result.success && result.newId) openReviewRequest(result.newId);
      if (result.routeChanged) { setSigning(false); setChoices({}); setError(result.error ?? 'Review the updated signing route.'); }
      return result;
    }} />}
  </div>;
}
