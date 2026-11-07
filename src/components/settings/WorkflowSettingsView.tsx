import { useRef, useState } from 'react';
import { ArrowDown, ArrowUp, Plus, Save, Trash2 } from 'lucide-react';
import { useApp } from '../../context/AppContext';
import type { CompanyId, UserProfile, WorkflowConfig, WorkflowStageConfig } from '../../types';
import { canUserAccessCompany } from '../../utils/companyAccess';
import { canConfigureSigningRoutes } from '../../utils/workflowAdministration';
import { canJoinProcessingTeam } from '../../utils/routeProcessing';
import { newSigningStep, routeDraft, routeForms, type RouteForm } from '../../utils/routeForms';
import { LegacyWorkflowSettingsView } from './LegacyWorkflowSettingsView';

function PeoplePicker({ label, people, selected, onChange, exclude = [] }: {
  label: string; people: UserProfile[]; selected: string[]; exclude?: string[]; onChange: (ids: string[]) => void;
}) {
  const [query, setQuery] = useState('');
  return <fieldset className="min-w-0 space-y-2">
    <legend className="text-sm font-semibold">{label} <span className="text-xs font-normal text-workspace-muted">· Optional</span></legend>
    {people.length > 5 && <input type="search" aria-label={`Search ${label.toLowerCase()}`} placeholder="Find an employee…" className="workspace-control min-h-10 w-full px-3 text-sm"
      value={query} onChange={event => setQuery(event.target.value)} />}
    <div className="max-h-40 space-y-1 overflow-y-auto rounded-lg border border-workspace-line p-1.5">
      {people.filter(person => !exclude.includes(person.id) && person.name.toLowerCase().includes(query.trim().toLowerCase())).map(person =>
        <label key={person.id} className="preci-form-option">
          <input className="preci-check" type="checkbox" checked={selected.includes(person.id)}
            onChange={event => onChange(event.target.checked ? [...selected, person.id] : selected.filter(id => id !== person.id))} />
          <span className="min-w-0 break-words">{person.name}</span>
        </label>)}
      {people.filter(person => !exclude.includes(person.id) && person.name.toLowerCase().includes(query.trim().toLowerCase())).length === 0 &&
        <p className="p-2 text-xs text-workspace-muted">No eligible employees match.</p>}
    </div>
    {selected.some(id => !people.some(person => person.id === id) || exclude.includes(id)) && <p className="text-xs text-rose-700">A saved selection is no longer available. <button type="button" className="preci-link" onClick={() => onChange(selected.filter(id => people.some(person => person.id === id) && !exclude.includes(id)))}>Remove unavailable selections</button></p>}
    <p className="text-xs text-workspace-muted">{selected.length} selected</p>
  </fieldset>;
}

export function WorkflowSettingsView() {
  const { companies, currentUser, selectedScope } = useApp();
  const [company, setCompany] = useState<CompanyId | ''>(selectedScope === 'PEG' ? '' : selectedScope);
  const [form, setForm] = useState<RouteForm>('Administrative & Payment Request');
  const [legacy, setLegacy] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [pending, setPending] = useState(false);
  const [change, setChange] = useState<{ company: CompanyId | ''; form: RouteForm; legacy: boolean } | null>(null);
  if (!canConfigureSigningRoutes(currentUser)) return <p role="alert" className="p-6">Ask a signing route administrator to configure this form.</p>;

  function navigate(next: { company: CompanyId | ''; form: RouteForm; legacy: boolean }) {
    if (dirty) { setChange(next); return; }
    setCompany(next.company); setForm(next.form); setLegacy(next.legacy);
  }

  return <div className="mx-auto max-w-7xl space-y-5 p-4 sm:p-6">
    <header><h1 className="text-2xl font-bold tracking-tight">Signing routes</h1>
      <p className="mt-1 text-sm text-workspace-muted">Set up a company’s suggested signers. Employees choose who signs each request.</p></header>
    <fieldset disabled={pending} className="workspace-panel grid gap-4 p-4 sm:grid-cols-2">
      <label className="text-sm font-semibold">Company
        <select className="workspace-control mt-1 block min-h-11 w-full px-3 font-normal" value={company} onChange={event => navigate({ company: event.target.value as CompanyId, form, legacy: false })}>
          <option value="" disabled>Choose a legal company</option>
          {companies.filter(item => canUserAccessCompany(currentUser, item.id)).map(item => <option key={item.id} value={item.id}>{item.fullName}</option>)}
        </select>
      </label>
      <label className="text-sm font-semibold">Form
        <select className="workspace-control mt-1 block min-h-11 w-full px-3 font-normal" value={form} onChange={event => navigate({company, form: event.target.value as RouteForm, legacy: false})}>
          {Object.keys(routeForms).map(name => <option key={name}>{name}</option>)}
        </select>
      </label>
    </fieldset>
    {change && <section role="alert" className="workspace-panel space-y-3 border-amber-300 p-4 text-sm">
      <p>Your signing route has unsaved changes. Discard them to switch?</p>
      <div className="flex gap-2"><button type="button" className="workspace-control min-h-10 px-3" onClick={() => setChange(null)}>Keep editing</button>
        <button type="button" className="workspace-primary min-h-10 px-3" onClick={() => {
          setDirty(false); setCompany(change.company); setForm(change.form); setLegacy(change.legacy); setChange(null);
        }}>Discard and switch</button></div>
    </section>}
    {legacy ? <LegacyWorkflowSettingsView /> : company && canUserAccessCompany(currentUser, company)
      ? <SigningRouteEditor key={company + form} companyId={company} form={form} onDirty={setDirty} onPending={setPending} />
      : <p className="workspace-panel p-5 text-sm">Choose a legal company to set up its signing route.</p>}
    <button type="button" disabled={pending} className="preci-link min-h-10 text-xs" onClick={() => navigate({company, form, legacy: !legacy})}>{legacy ? 'Back to current forms' : 'Legacy signing route settings'}</button>
  </div>;
}

function SigningRouteEditor({ companyId, form, onDirty, onPending }: {
  companyId: CompanyId; form: RouteForm; onDirty: (dirty: boolean) => void; onPending: (busy: boolean) => void;
}) {
  const { workflows, users, companies, saveWorkflow, readOnly: connected } = useApp();
  const [config, setConfig] = useState(() => routeDraft(companyId, form, workflows.find(route => route.companyId === companyId && route.formType === form)));
  const [busy, setBusy] = useState(false);
  const [feedback, setFeedback] = useState('');
  const [error, setError] = useState('');
  const errorRef = useRef<HTMLParagraphElement>(null);
  const saving = useRef(false);
  const labels = routeForms[form];
  const eligible = users.filter(person => canUserAccessCompany(person, companyId)).sort((a, b) =>
    Number(!!(b.isSuperAdmin || b.isGroupAdmin || b.role === 'Admin')) - Number(!!(a.isSuperAdmin || a.isGroupAdmin || a.role === 'Admin')) || a.name.localeCompare(b.name));
  const savedVersion = workflows.find(route => route.companyId === companyId && route.formType === form)?.version ?? 0;
  const company = companies.find(item => item.id === companyId);
  const changedElsewhere = savedVersion !== config.version;
  function update(next: WorkflowConfig) { setConfig(next); onDirty(true); setFeedback(''); setError(''); }
  function updateStep(id: string, fields: Partial<WorkflowStageConfig>) {
    update({...config, stages: config.stages.map(step => step.id === id ? {...step, ...fields} : step)});
  }
  function move(index: number, offset: number) {
    const steps = [...config.stages];
    const target = index + offset;
    if (target < 0 || target >= steps.length - 1) return;
    [steps[index], steps[target]] = [steps[target], steps[index]];
    update({...config, stages: steps});
  }
  async function save() {
    if (saving.current) return;
    const invalid = config.stages.some(step => !step.name.trim() || (step.assignedUserId && !eligible.some(person => person.id === step.assignedUserId))
      || step.backupSignerIds?.some(id => id === step.assignedUserId || !eligible.some(person => person.id === id)));
    if (invalid || !eligible.length || changedElsewhere) {
      setError(changedElsewhere ? 'This route changed elsewhere. Reload the saved route before saving.' : !eligible.length ? 'Assign company access to employees before setting up this route.' : 'Check the step names, suggested signers and backups.');
      requestAnimationFrame(() => errorRef.current?.focus()); return;
    }
    saving.current = true; setBusy(true); onPending(true); setError('');
    try {
      const saved = await saveWorkflow({...config, version: connected ? config.version : config.version + 1,
        stages: config.stages.map((step, index) => ({...step, stageNumber: index + 1}))});
      setConfig(routeDraft(companyId, form, saved)); onDirty(false); setFeedback('Signing route saved. Future requests will use these suggestions.');
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : 'Could not save. Your changes are still here.');
    } finally { saving.current = false; setBusy(false); onPending(false); }
  }
  return <div className="space-y-4">
    <section className="workspace-panel p-4" aria-label="Route preview">
      <div className="flex flex-wrap items-center justify-between gap-2"><h2 className="text-sm font-bold">Route preview</h2><span className="text-xs text-workspace-muted">{company?.fullName} · {form}</span></div>
      <ol className="route-peek-signers" aria-label="Signing order">
        <li className="route-step-chip"><span className="route-step-number">1</span><span><strong>{labels.requester}</strong><small>Requester · Signs on submission</small></span></li>
        {config.stages.map((step, index) => <li key={step.id} className="route-step-chip">
          <span className="route-step-number">{index + 2}</span><span><strong>{step.documentSlot ? labels.department : step.isFinalApproval ? labels.final : step.name}</strong>
          <small>{eligible.find(person => person.id === step.assignedUserId)?.name ?? 'Requester chooses'} · {step.isFinalApproval ? 'Required final approver' : 'Optional'}</small></span>
        </li>)}
      </ol>
    </section>
    {feedback && <p role="status" className="rounded-lg border border-teal-200 bg-workspace-tint p-3 text-sm">{feedback}</p>}
    {error && <p ref={errorRef} tabIndex={-1} role="alert" className="rounded-lg border border-rose-200 p-3 text-sm text-rose-800">{error}</p>}
    {changedElsewhere && <button type="button" className="preci-link min-h-10 text-sm" onClick={() => {
      setConfig(routeDraft(companyId, form, workflows.find(route => route.companyId === companyId && route.formType === form))); onDirty(false); setError('');
    }}>Reload saved route (discards these edits)</button>}
    <fieldset disabled={busy} className="space-y-4">
      <section className="workspace-panel p-4"><h2 className="font-bold">{labels.requester}</h2>
        <p className="mt-1 text-sm text-workspace-muted">The employee signs when submitting. This is assigned automatically.</p></section>
      {config.stages.map((step, index) => {
        const final = step.isFinalApproval;
        const label = step.documentSlot ? labels.department : final ? labels.final : 'Review step';
        return <section key={step.id} className="workspace-panel space-y-4 p-4" aria-label={label}>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 className="font-bold">{label} <span className="ml-1 text-xs font-medium text-workspace-muted">{final ? 'Final approver · Required' : 'Requester may include this step'}</span></h2>
            {!final && <div className="flex gap-1">
              <button type="button" aria-label={`Move ${step.name} up`} disabled={index === 0} className="workspace-control grid size-10 place-items-center" onClick={() => move(index, -1)}><ArrowUp aria-hidden="true" className="size-4" /></button>
              <button type="button" aria-label={`Move ${step.name} down`} disabled={index === config.stages.length - 2} className="workspace-control grid size-10 place-items-center" onClick={() => move(index, 1)}><ArrowDown aria-hidden="true" className="size-4" /></button>
              <button type="button" aria-label={`Remove ${step.name}`} className="workspace-control grid size-10 place-items-center" onClick={() => update({...config, stages: config.stages.filter(item => item.id !== step.id)})}><Trash2 aria-hidden="true" className="size-4" /></button>
            </div>}
          </div>
          {!final && !step.documentSlot && <label className="block text-sm font-semibold">Review step name
            <input className="workspace-control mt-1 block min-h-10 w-full px-3" maxLength={150} value={step.name} onChange={event => updateStep(step.id,{name:event.target.value})} /></label>}
          <label className="block text-sm font-semibold">{final ? 'Suggested final approver' : 'Suggested signer'}
            <select className="workspace-control mt-1 block min-h-11 w-full px-3 font-normal" value={step.assignedUserId ?? ''} onChange={event => {
              const person = eligible.find(item => item.id === event.target.value);
              updateStep(step.id,{assignedUserId:person?.id,assignedRole:person?.role,backupSignerIds:step.backupSignerIds?.filter(id=>id!==person?.id)});
            }}>
              <option value="">Requester chooses</option>
              {step.assignedUserId && !eligible.some(person => person.id === step.assignedUserId) && <option value={step.assignedUserId}>Unavailable employee — choose another</option>}
              {eligible.map(person => <option key={person.id} value={person.id}>{person.name}</option>)}
            </select>
          </label>
          <PeoplePicker label={final ? 'Backup Approvers' : 'Backup signer'} people={eligible} selected={step.backupSignerIds ?? []} exclude={step.assignedUserId ? [step.assignedUserId] : []} onChange={ids => updateStep(step.id,{backupSignerIds:ids,backupCompletionUserIds:undefined})} />
          <p className="text-xs text-workspace-muted">Employees can choose other eligible company users for their request. Backups act only after assignment.</p>
          {final && <label className="flex items-start gap-3 rounded-lg bg-workspace-tint p-3 text-sm">
            <input type="checkbox" className="preci-check mt-0.5" checked={config.allowFinalBypass === true} onChange={event=>update({...config,allowFinalBypass:event.target.checked})} />
            <span><strong>Allow bypass</strong><span className="mt-1 block text-xs text-workspace-muted">The assigned final approver can complete early with a reason. Their own signature is required.</span></span>
          </label>}
          {step.documentSlot && <p className="text-xs text-workspace-muted">Uses the form’s Department Head signature space.</p>}
          {!step.documentSlot && !final && <p className="text-xs text-workspace-muted">Recorded in signing history. No signature space is added to the printed form.</p>}
        </section>;
      })}
      <div className="flex flex-wrap gap-2">
        <button type="button" disabled={config.stages.length >= 20} className="workspace-control inline-flex min-h-10 items-center gap-2 px-3 text-sm" onClick={()=>update({...config,stages:[...config.stages.slice(0,-1),newSigningStep('Additional review',false),config.stages.at(-1)!]})}><Plus aria-hidden="true" className="size-4" />Add review step</button>
        {labels.department && !config.stages.some(step=>step.documentSlot==='department-head') && <button type="button" className="workspace-control min-h-10 px-3 text-sm" onClick={()=>update({...config,stages:[newSigningStep(labels.department!,false,'department-head'),...config.stages]})}>Add {labels.department}</button>}
      </div>
      {labels.processing && <p className="workspace-panel p-4 text-sm text-workspace-muted">{labels.processing}</p>}
      <details className="workspace-panel p-4">
        <summary className="preci-link cursor-pointer text-sm font-semibold">Processing team and read access</summary>
        <p className="my-3 text-xs text-workspace-muted">Choose employees who handle the work or payment after signing. Their existing staff role determines processing actions.</p>
        <PeoplePicker label="Processing team" people={eligible.filter(person=>canJoinProcessingTeam(form,person.role))} selected={config.processingUserIds??[]} onChange={ids=>update({...config,processingUserIds:ids})} />
        {form==='Cash Voucher' && <label className="mt-3 flex gap-2 text-sm"><input type="checkbox" className="preci-check" checked={config.allowCashReceiptWaiver??false} onChange={event=>update({...config,allowCashReceiptWaiver:event.target.checked})} />Allow authorized cash receipt waivers</label>}
      </details>
      <div className="flex flex-wrap items-center justify-between gap-3 border-t border-workspace-line pt-4">
        <p className="text-xs text-workspace-muted">Submitted requests keep their existing signing route and history.</p>
        <button type="button" onClick={()=>void save()} className="workspace-primary inline-flex min-h-11 items-center gap-2 px-4 text-sm font-semibold"><Save aria-hidden="true" className="size-4" />{busy?'Saving…':'Save signing route'}</button>
      </div>
    </fieldset>
  </div>;
}
