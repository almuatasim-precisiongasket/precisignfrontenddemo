import type { UserProfile, WorkflowConfig } from '../../types';
import { applySignerChoices, isOptionalSigner, signerOptions, type SignerChoices as Choices } from '../../utils/signingSelection';
import { resolveConfiguredSigner } from '../../utils/workflowAdministration';

export function SignerChoices({ workflow, users, requester, value, onChange }: {
  workflow?: WorkflowConfig;
  users: UserProfile[];
  requester: UserProfile;
  value: Choices;
  onChange: (value: Choices) => void;
}) {
  const selection = workflow && applySignerChoices(workflow, users, requester.id, value);
  return (
    <section className="no-print space-y-3 rounded-lg border border-workspace-line bg-workspace/60 p-4 text-sm" aria-label="Review signers">
      <h2 className="font-bold">Review signers</h2>
      <p className="text-slate-600">You sign when you send the request. PreciSign then sends it to the first approver.</p>
      <p className="font-medium">{requester.name} · Requester (you)</p>
      {!workflow && <p>No signing route configured for this company.</p>}
      {workflow?.stages.map(stage => {
        const optional = isOptionalSigner(workflow, stage);
        const options = signerOptions(workflow, stage, users, requester.id);
        const primary = resolveConfiguredSigner(stage, users, workflow.companyId);
        const selected = Object.hasOwn(value, stage.id) ? value[stage.id] : optional ? null : primary?.id;
        return <label key={stage.id} className="block">
          {stage.isFinalApproval ? 'Final Approver' : 'Department Head'}{optional && ' (optional)'}
          <select className="workspace-control mt-1 block min-h-10 w-full px-2" value={selected ?? ''} onChange={event => onChange({ ...value, [stage.id]: event.target.value || null })}>
            <option value="" disabled={!optional}>{optional ? 'Not requested' : 'Choose a signer'}</option>
            {options.map(person => <option key={person.id} value={person.id}>{person.name}</option>)}
          </select>
        </label>;
      })}
      {selection?.error && <p className="text-rose-700">{selection.error}</p>}
      {selection?.workflow && <div className="rounded-lg border border-workspace-line bg-white px-3 py-2">
        <p className="font-medium text-slate-800">Signing order</p>
        <ol className="mt-1 list-decimal space-y-1 pl-5 text-slate-700">
          <li>{requester.name} · You</li>
          {selection.workflow.stages.map(stage => <li key={stage.id}>
            {users.find(person => person.id === stage.assignedUserId)?.name} · {stage.isFinalApproval ? 'Final approver' : stage.name}
          </li>)}
        </ol>
      </div>}
      {!!selection?.omittedSigningSteps?.length && <p className="text-slate-600">Blank signature boxes: {selection.omittedSigningSteps.join(', ')}</p>}
    </section>
  );
}
