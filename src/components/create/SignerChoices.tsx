import type { UserProfile, WorkflowConfig } from '../../types';
import { applySignerChoices, isOptionalSigner, secondarySignerOptions, signerOptions, type SignerChoices as Choices } from '../../utils/signingSelection';
import { resolveConfiguredSigner } from '../../utils/workflowAdministration';

const signatureLabels = {
  'Administrative & Payment Request': { requester: 'Requester Signature (Requester)', intermediate: 'Department Head Signature (Department Head)', final: 'Approver Signature (Final Approver)' },
  'IT Request': { requester: 'Requester Signature (Requester)', intermediate: undefined, final: 'Approval Authority Signature (Final Approver)' },
  'Cash Voucher': { requester: 'Requester (you)', intermediate: undefined, final: 'Approved by (Final Approver)' },
  'Expense Claim': { requester: 'Claimed by (Requester)', intermediate: 'Department Head', final: 'Approval Authority (Final Approver)' },
};

function orderUsers(a: UserProfile, b: UserProfile) {
  const admin = (person: UserProfile) => person.role === 'Admin' || person.isGroupAdmin || person.isSuperAdmin;
  return Number(!!admin(b)) - Number(!!admin(a)) || a.name.localeCompare(b.name);
}

export function SignerChoices({ form, workflow, users, requester, value, onChange }: {
  form: keyof typeof signatureLabels;
  workflow?: WorkflowConfig;
  users: UserProfile[];
  requester: UserProfile;
  value: Choices;
  onChange: (value: Choices) => void;
}) {
  const selection = workflow && applySignerChoices(workflow, users, requester.id, value);
  const labels = signatureLabels[form];
  const final = workflow?.stages.find(stage => stage.isFinalApproval);
  const finalChoice = final && value[final.id];
  const selectedSecondaryIds = finalChoice && typeof finalChoice === 'object' ? finalChoice.secondaryIds : undefined;
  const primarySelection = workflow && final && finalChoice && typeof finalChoice === 'object'
    ? applySignerChoices(workflow, users, requester.id, { ...value, [final.id]: finalChoice.primaryId })
    : selection;
  const excluded = new Set([requester.id, ...(primarySelection?.workflow?.stages ?? []).flatMap(stage => stage.assignedUserId ? [stage.assignedUserId] : [])]);
  const secondaryOptions = workflow && final ? secondarySignerOptions(workflow, final, users, excluded).sort(orderUsers) : [];
  return (
    <section className="workspace-panel no-print space-y-4 p-4 text-sm sm:p-5" aria-label="Review signers">
      <div>
        <h2 className="text-base font-bold">Review signers</h2>
        <p className="mt-1 text-workspace-muted">You sign when you submit. Approver options come from the selected company’s signing route.</p>
      </div>
      {form === 'Cash Voucher' && <p className="text-slate-600">Receiver's Signature and Cashier Signature are recorded during cash processing.</p>}
      {form === 'Expense Claim' && <p className="text-slate-600">The Finance signature is recorded during settlement.</p>}
      {!workflow && <p>No signing route configured for this company.</p>}
      <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
      <div className="rounded-lg border border-workspace-line bg-workspace/50 px-3 py-2.5">
        <p className="text-xs font-semibold text-workspace-muted">{labels.requester}</p>
        <p className="mt-1 font-semibold">{requester.name} <span className="font-normal text-workspace-muted">(you)</span></p>
      </div>
      {workflow?.stages.map(stage => {
        const optional = isOptionalSigner(workflow, stage);
        const options = signerOptions(workflow, stage, users, requester.id).sort(orderUsers);
        const primary = resolveConfiguredSigner(stage, users, workflow.companyId);
        const choice = value[stage.id];
        const chosenId = choice && typeof choice === 'object' ? choice.primaryId : choice;
        const selected = Object.hasOwn(value, stage.id) ? chosenId : optional ? null : primary?.id;
        const label = stage.isFinalApproval ? labels.final : labels.intermediate ?? stage.name;
        if (!optional && options.length === 1 && options[0].id === selected) {
          return <div key={stage.id} className="rounded-lg border border-workspace-line bg-workspace/50 px-3 py-2.5">
            <p className="text-xs font-semibold text-workspace-muted">{label}</p>
            <p className="mt-1 font-semibold">{options[0].name}</p>
            <p className="text-xs text-workspace-muted">Assigned by route</p>
          </div>;
        }
        return <label key={stage.id} className="block min-w-0 rounded-lg border border-workspace-line bg-workspace/50 px-3 py-2.5">
          <span className="text-xs font-semibold text-workspace-muted">{label}{optional && ' (optional)'}</span>
          <select className="workspace-control mt-1 block min-h-10 w-full px-2" disabled={options.length === 0} value={options.some(person => person.id === selected) ? selected ?? '' : ''} onChange={event => {
            const id = event.target.value || null;
            const next = { ...value, [stage.id]: id };
            if (final && selectedSecondaryIds) {
              const previousPrimary = finalChoice && typeof finalChoice === 'object' ? finalChoice.primaryId : null;
              next[final.id] = { primaryId: stage.id === final.id ? id : previousPrimary, secondaryIds: selectedSecondaryIds.filter(secondary => secondary !== id) };
            }
            onChange(next);
          }}>
            <option value="" disabled={!optional}>{optional ? 'Not requested' : 'Choose a signer'}</option>
            {options.map(person => <option key={person.id} value={person.id}>{person.name}</option>)}
          </select>
        </label>;
      })}
      </div>
      {workflow && final && (secondaryOptions.length > 0 || !!selectedSecondaryIds?.length) && <fieldset className="space-y-2">
        <legend className="font-medium">Secondary final approvers</legend>
        <p className="text-workspace-muted">A route administrator can activate a secondary approver if a replacement is needed.</p>
        {selectedSecondaryIds?.some(id => !secondaryOptions.some(person => person.id === id)) &&
          <button type="button" className="underline" onClick={() => {
            if (finalChoice && typeof finalChoice === 'object') {
              onChange({ ...value, [final.id]: { ...finalChoice, secondaryIds: selectedSecondaryIds.filter(id => secondaryOptions.some(person => person.id === id)) } });
            }
          }}>Remove unavailable selections</button>}
        {secondaryOptions.map(person => {
          const selectedIds = selectedSecondaryIds ?? secondaryOptions.map(option => option.id);
          const checked = selectedIds.includes(person.id);
          return <label key={person.id} className="flex items-center gap-2">
            <input type="checkbox" checked={checked} onChange={event => {
              const primaryId = typeof finalChoice === 'string' ? finalChoice
                : finalChoice && typeof finalChoice === 'object' ? finalChoice.primaryId
                : resolveConfiguredSigner(final, users, workflow.companyId)?.id ?? null;
              onChange({ ...value, [final.id]: { primaryId, secondaryIds: event.target.checked
                ? [...selectedIds, person.id] : selectedIds.filter(id => id !== person.id) } });
            }} />
            {person.name}
          </label>;
        })}
      </fieldset>}
      {selection?.error && <p className="text-rose-700" role="status">{selection.error}</p>}
      {selection?.workflow && <div className="border-t border-workspace-line pt-3">
        <p className="text-xs font-bold text-workspace-muted">Signing order</p>
        <ol role="list" className="mt-2 flex flex-wrap gap-x-5 gap-y-2">
          {[{ id: requester.id, name: requester.name, role: 'Requester' },
            ...selection.workflow.stages.map(stage => ({ id: stage.id, name: users.find(person => person.id === stage.assignedUserId)?.name, role: stage.isFinalApproval ? 'Final approver' : stage.name })),
          ].map((step, index) => <li key={step.id} className="flex min-w-0 items-center gap-2">
            <span className="grid size-6 shrink-0 place-items-center rounded-full bg-workspace-tint text-xs font-bold text-workspace-teal">{index + 1}</span>
            <span className="min-w-0 break-words"><strong>{step.name}</strong><span className="block text-xs text-workspace-muted">{step.role}</span></span>
          </li>)}
        </ol>
      </div>}
      {!!selection?.omittedSigningSteps?.length && <p className="text-slate-600">Blank signature boxes: {selection.omittedSigningSteps.join(', ')}</p>}
    </section>
  );
}
