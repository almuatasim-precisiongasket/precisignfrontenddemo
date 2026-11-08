import { EditorSelect } from './RequestEditorControls';
import { useId, useState } from 'react';
import { useApp } from '../../context/AppContext';
import { routeForms, type RouteForm } from '../../utils/routeForms';
import { canConfigureSigningRoutes } from '../../utils/workflowAdministration';
import type { UserProfile, WorkflowConfig } from '../../types';
import { suggestedSignerChoices, applySignerChoices, noEligibleSigners, isOptionalSigner, secondarySignerOptions, signerOptions, type SignerChoices as Choices } from '../../utils/signingSelection';

const signatureLabels = {
  'R&D Initiative': { requester: 'Submitter Signature (Requester)', intermediate: undefined, final: 'Reviewer Signature (Final Approver)' },
  'Administrative & Payment Request': { requester: 'Requester Signature (Requester)', intermediate: 'Department Head Signature (Department Head)', final: 'Approver Signature (Final Approver)' },
  'IT Request': { requester: 'Requester Signature (Requester)', intermediate: undefined, final: 'Approval Authority Signature (Final Approver)' },
  'Cash Voucher': { requester: 'Requester (you)', intermediate: undefined, final: 'Approved by (Final Approver)' },
  'Expense Claim': { requester: 'Claimed by (Requester)', intermediate: 'Department Head', final: 'Approval Authority (Final Approver)' },
};

function orderUsers(a: UserProfile, b: UserProfile) {
  const admin = (person: UserProfile) => person.role === 'Admin' || person.isGroupAdmin || person.isSuperAdmin;
  return Number(!!admin(b)) - Number(!!admin(a)) || a.name.localeCompare(b.name);
}

function LegacySignerChoices({ form, workflow, companySelected, users, requester, value, onChange }: {
  form: keyof typeof signatureLabels;
  workflow?: WorkflowConfig;
  companySelected: boolean;
  users: UserProfile[];
  requester: UserProfile;
  value: Choices;
  onChange: (value: Choices) => void;
}) {
  const { setActiveView } = useApp();
  const hint = useId();
  const [backupSearch, setBackupSearch] = useState('');
  const selection = workflow && applySignerChoices(workflow, users, requester.id, value);
  const labels = signatureLabels[form];
  const final = workflow?.stages.find(stage => stage.isFinalApproval);
  const finalChoice = final && value[final.id];
  const selectedSecondaryIds = finalChoice && typeof finalChoice === 'object' ? finalChoice.secondaryIds : undefined;
  const explicitPrimaries = Object.values(value).flatMap(choice => typeof choice === 'string' ? [choice] : choice?.primaryId ? [choice.primaryId] : []);
  const excluded = new Set([requester.id, ...explicitPrimaries]);
  const secondaryOptions = workflow && final ? secondarySignerOptions(workflow, final, users, excluded).sort(orderUsers) : [];
  const secondaryIds = selectedSecondaryIds ?? secondaryOptions.filter(option => workflow?.signerSelection !== 'company-directory' || final?.backupSignerIds?.includes(option.id)).map(option => option.id);
  const filteredBackups = secondaryOptions.filter(person => person.name.toLowerCase().includes(backupSearch.trim().toLowerCase()));
  const stages = workflow?.stages.map(stage => ({
    stage,
    optional: isOptionalSigner(workflow, stage),
    options: signerOptions(workflow, stage, users, requester.id).sort(orderUsers),
  })) ?? [];
  const missingSigner = stages.some(({ optional, options }) => !optional && !options.length);
  const routeIssue = !companySelected ? 'Choose a company to see who can sign.'
    : !workflow ? 'This company has no signing route for this form.'
    : missingSigner ? noEligibleSigners : selection?.error;
  return (
    <section id="signer-review" tabIndex={-1} className="editor-signer-panel no-print space-y-4 p-4 text-sm" aria-label="Review signers" aria-describedby={routeIssue ? hint : undefined}>
      <div>
        <h2 className="text-base font-bold">Review signers</h2>
        <p className="mt-1 text-workspace-muted">You sign when you send the request. Choose who should sign after you.</p>
      </div>
      {form === 'Cash Voucher' && <p className="text-slate-600">Receiver's Signature and Cashier Signature are recorded during cash processing.</p>}
      {form === 'Expense Claim' && <p className="text-slate-600">The Finance signature is recorded during settlement.</p>}
      {routeIssue && <p id={hint} role="status" className={companySelected ? 'text-rose-700' : 'text-workspace-muted'}>
        {routeIssue}
        {companySelected && !workflow && (canConfigureSigningRoutes(requester)
          ? <> <button type="button" className="preci-link" onClick={() => setActiveView('workflow-settings')}>Open signing routes</button></>
          : ' Ask a workflow administrator to set one up.')}
      </p>}
      <div className="grid gap-2 [grid-template-columns:repeat(auto-fit,minmax(min(100%,12rem),1fr))]">
      <div className="rounded-lg border border-workspace-line bg-workspace/50 px-3 py-2.5">
        <p className="text-xs font-semibold text-workspace-muted">{labels.requester}</p>
        <p className="mt-1 font-semibold">{requester.name} <span className="font-normal text-workspace-muted">(you)</span></p>
      </div>
      {stages.map(({ stage, optional, options }) => {
        const choice = value[stage.id];
        const chosenId = choice && typeof choice === 'object' ? choice.primaryId : choice;
        const selected = chosenId;
        const label = stage.isFinalApproval ? labels.final : workflow?.stages.filter(item => !item.isFinalApproval).indexOf(stage) === 0 && labels.intermediate ? labels.intermediate : stage.name;
        return <label key={stage.id} className="block min-w-0 rounded-lg border border-workspace-line bg-workspace/50 px-3 py-2.5">
          <span className="text-xs font-semibold text-workspace-muted">{label}{optional ? ' · Optional' : ''}</span>
          <EditorSelect className="workspace-control mt-1 block min-h-10 w-full px-2" disabled={options.length === 0} value={options.some(person => person.id === selected) ? selected ?? '' : ''} onChange={event => {
            const id = event.target.value || null;
            const next = { ...value, [stage.id]: id };
            if (final && selectedSecondaryIds) {
              const previousPrimary = finalChoice && typeof finalChoice === 'object' ? finalChoice.primaryId : null;
              next[final.id] = { primaryId: stage.id === final.id ? id : previousPrimary, secondaryIds: selectedSecondaryIds.filter(secondary => secondary !== id) };
            }
            onChange(next);
          }}>
            <option value="" disabled={!optional}>{optional ? 'Not requested' : stage.isFinalApproval ? 'Choose the primary approver' : 'Choose a signer'}</option>
            {options.map(person => <option key={person.id} value={person.id}>{person.name}</option>)}
          </EditorSelect>
        </label>;
      })}
      </div>
      {workflow && final && <fieldset className="min-w-0 space-y-2 border-t border-workspace-line pt-2">
        <legend className="pr-2 font-semibold">Backup Approvers <span className="font-normal text-workspace-muted">· Optional</span></legend>
        <p className="text-xs text-workspace-muted">Choose any eligible backups. They only act if an authorized route administrator assigns one as a replacement.</p>
        {secondaryOptions.length === 0 && !selectedSecondaryIds?.length && <p className="text-xs text-workspace-muted">No backups are available for this selection.</p>}
        {selectedSecondaryIds?.some(id => !secondaryOptions.some(person => person.id === id)) &&
          <button type="button" className="preci-link min-h-10" onClick={() => {
            if (finalChoice && typeof finalChoice === 'object') {
              onChange({ ...value, [final.id]: { ...finalChoice, secondaryIds: selectedSecondaryIds.filter(id => secondaryOptions.some(person => person.id === id)) } });
            }
          }}>Remove unavailable backups</button>}
        {secondaryOptions.length > 5 && <label className="block text-xs font-semibold">Find a backup
          <input type="search" className="workspace-control mt-1 block min-h-10 w-full px-3" value={backupSearch} onChange={event => setBackupSearch(event.target.value)} />
        </label>}
        {secondaryOptions.length > 0 && <p className="text-xs font-medium text-workspace-muted" aria-live="polite">{secondaryIds.length} selected</p>}
        {secondaryOptions.length > 0 && !filteredBackups.length && <p className="text-xs text-workspace-muted">No names match your search.</p>}
        <div className="grid gap-1.5 [grid-template-columns:repeat(auto-fit,minmax(min(100%,10rem),1fr))]">
          {filteredBackups.map(person => <label key={person.id} className="preci-form-option border border-workspace-line bg-white [overflow-wrap:anywhere]">
            <input className="preci-check" type="checkbox" checked={secondaryIds.includes(person.id)} onChange={event => {
              const primaryId = typeof finalChoice === 'string' ? finalChoice : finalChoice?.primaryId ?? null;
              onChange({ ...value, [final.id]: { primaryId, secondaryIds: event.target.checked
                ? [...secondaryIds, person.id] : secondaryIds.filter(id => id !== person.id) } });
            }} />
            {person.name}
          </label>)}
        </div>
      </fieldset>}
      {selection?.workflow && <div className="border-t border-workspace-line pt-3">
        <p className="text-xs font-bold text-workspace-muted">Signing order</p>
        {selection.workflow.stages.length > 1 && <p className="mt-1 text-xs text-workspace-muted">Other signers go in order. The final approver can sign early.</p>}
        <ol role="list" className="mt-2 flex flex-wrap gap-x-5 gap-y-2">
          {[{ id: requester.id, name: requester.name, role: 'Requester' },
            ...selection.workflow.stages.map(stage => ({ id: stage.id, name: users.find(person => person.id === stage.assignedUserId)?.name, role: stage.isFinalApproval ? 'Final approver' : stage.name })),
          ].map((step, index) => <li key={step.id} className="flex min-w-0 items-center gap-2">
            <span className="grid size-6 shrink-0 place-items-center rounded-full bg-workspace-tint text-xs font-bold text-workspace-teal">{index + 1}</span>
            <span className="min-w-0 break-words"><strong>{step.name}</strong><span className="block text-xs text-workspace-muted">{step.role}</span></span>
          </li>)}
        </ol>
      </div>}
      {!!selection?.omittedSigningSteps?.length && <p className="text-slate-600">Signatures not requested: {selection.omittedSigningSteps.join(', ')}</p>}
    </section>
  );
}


type Props = Parameters<typeof LegacySignerChoices>[0];

export function SignerChoices(props: Props) {
  if (props.workflow?.signerSelection === 'company-directory') return <DirectorySignerChoices {...props} workflow={props.workflow} />;
  return <LegacySignerChoices {...props} />;
}

function DirectorySignerChoices({ form, workflow, users, requester, value, onChange }: Props & { workflow: WorkflowConfig }) {
  const labels = routeForms[form as RouteForm];
  const effective = suggestedSignerChoices(workflow, users, requester.id, value);
  const selection = applySignerChoices(workflow, users, requester.id, value);
  const primaries = Object.values(effective).flatMap(choice => typeof choice === 'string' ? [choice] : choice?.primaryId ? [choice.primaryId] : []);
  const options = signerOptions(workflow, workflow.stages.at(-1)!, users, requester.id).sort(orderUsers);
  function updatePrimary(stageId: string, id: string | null) {
    const next: Choices = { ...effective, [stageId]: id ? { primaryId: id, secondaryIds: [] } : null };
    for (const [key, choice] of Object.entries(next)) {
      if (choice && typeof choice === 'object') next[key] = { ...choice, secondaryIds: choice.secondaryIds.filter(backup => backup !== id) };
    }
    onChange(next);
  }
  return <section id="signer-review" tabIndex={-1} className="editor-signer-panel no-print space-y-3 p-4 text-sm" aria-label="Review signers" aria-describedby={selection.error ? 'directory-signer-error' : undefined}>
    <h2 className="text-base font-bold">Who should sign?</h2>
    <p className="text-xs text-workspace-muted">Choose a final approver. Add other signers when needed. Suggestions come from this company’s signing route.</p>
    <div className="rounded-lg border border-workspace-line p-3"><p className="text-xs font-semibold text-workspace-muted">{labels.requester}</p><p className="mt-1 font-semibold">{requester.name} · You sign when sending</p></div>
    {workflow.stages.map(stage => {
      const raw = effective[stage.id];
      const id = typeof raw === 'string' ? raw : raw?.primaryId ?? '';
      const backups = typeof raw === 'object' && raw ? raw.secondaryIds : [];
      const final = stage.isFinalApproval;
      const included = final || !!id || (raw !== null && typeof raw === 'object');
      const title = final ? labels.final : stage.documentSlot ? labels.department : stage.name;
      const suggestion = options.find(person => person.id === stage.assignedUserId);
      const availableBackups = options.filter(person => !primaries.includes(person.id));
      return <div key={stage.id} className="space-y-2 rounded-lg border border-workspace-line p-3">
        <div className="flex flex-wrap items-center justify-between gap-2"><p className="font-semibold">{title} {final && <span className="text-xs text-workspace-teal">· Final approver required</span>}</p>
          {!final && <label className="flex min-h-10 items-center gap-2 text-xs">
            <input className="preci-check" type="checkbox" checked={included} onChange={event => {
              if (!event.target.checked) updatePrimary(stage.id, null);
              else onChange({...effective, [stage.id]: {primaryId: suggestion?.id ?? null, secondaryIds: []}});
            }} />Include this step
          </label>}
        </div>
        {!final && !included && <div className="text-xs text-workspace-muted">
          {suggestion ? `Suggested signer: ${suggestion.name}. Choose a signer to include this step.` : 'Choose a signer to include this optional step.'}
        </div>}
        <label className="block text-xs font-semibold">{final ? 'Final approver' : 'Signer (optional)'}
          <select className="workspace-control mt-1 block min-h-11 w-full px-2 text-sm font-normal" value={id}
            onChange={event => updatePrimary(stage.id, event.target.value || null)}>
            <option value="">{final ? 'Choose final approver' : 'Not needed for this request'}</option>
            {options.map(person => <option key={person.id} value={person.id}>{person.name}{person.id === stage.assignedUserId ? ' · Suggested' : ''}</option>)}
          </select>
        </label>
        {included && <details className="pt-1">
          <summary className="preci-link cursor-pointer py-1 text-xs font-semibold">{final ? 'Backup Approvers' : 'Backup signer'} · {backups.length} selected</summary>
          <p className="my-2 text-xs text-workspace-muted">A backup acts only after assignment. A replacement final approver must accept first.</p>
          <div className="max-h-40 overflow-y-auto space-y-1">
            {availableBackups.map(person => <label key={person.id} className="preci-form-option">
              <input type="checkbox" className="preci-check" checked={backups.includes(person.id)} onChange={event => onChange({...effective,[stage.id]:{primaryId:id || null,secondaryIds:event.target.checked ? [...backups,person.id] : backups.filter(backup=>backup!==person.id)}})} />
              {person.name}{stage.backupSignerIds?.includes(person.id) && <span className="text-xs text-workspace-muted">Suggested</span>}
            </label>)}
            {!availableBackups.length && <p className="text-xs text-workspace-muted">No other eligible employees.</p>}
          </div>
        </details>}
      </div>;
    })}
    {selection.error && <p id="directory-signer-error" role="status" className="text-xs text-rose-700">{selection.error}</p>}
    {selection.workflow && <div className="border-t border-workspace-line pt-3">
      <h3 className="text-xs font-bold">Signing order</h3>
      <ol className="route-peek-signers">
        <li className="route-step-chip text-xs">{requester.name} · On submission</li>
        {selection.workflow.stages.map(stage => <li className="route-step-chip text-xs" key={stage.id}><strong>{options.find(person=>person.id===stage.assignedUserId)?.name}</strong> · {stage.isFinalApproval ? 'Final approver' : stage.name}</li>)}
      </ol>
      <p className="mt-2 text-xs text-workspace-muted">The final approver can sign early.{workflow.allowFinalBypass ? ' They can also complete early with a reason.' : ' Completion waits for all selected signers.'}</p>
    </div>}
    {labels.processing && <p className="text-xs text-workspace-muted">{labels.processing}</p>}
  </section>;
}
