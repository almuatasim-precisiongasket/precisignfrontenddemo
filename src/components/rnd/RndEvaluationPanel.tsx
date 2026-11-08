import { useState } from 'react';
import type { RequestRecord, RndFormData } from '../../types';
import { useApp } from '../../context/AppContext';
import { isEvaluationField, rndEvaluationComplete } from '../../utils/rndWorkflow';
import { RndFields } from './RndFields';
import { RndRequestDocument } from './RndRequestDocument';

export function RndEvaluationPanel({ request }: { request: RequestRecord }) {
  const { currentUser, saveRndEvaluation, directorOverrideAction } = useApp();
  const base = request.formData.rnd!;
  const [value, setValue] = useState<RndFormData>({ fields: Object.fromEntries(Object.entries(base.fields).filter(([id]) => isEvaluationField(id))), choices: Object.fromEntries(Object.entries(base.choices).filter(([id]) => isEvaluationField(id))), marketRows: [] });
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');
  const [reason, setReason] = useState('');
  const canEdit = request.status === 'Pending Approval' && request.approvalSteps.at(-1)?.assignedUserId === currentUser.id;
  return <section className="workspace-panel space-y-3 p-4">
    <h2 className="font-bold">R&amp;D evaluation</h2>
    <p className="text-xs text-workspace-muted">{canEdit ? 'You are the assigned final approver. Save Section H before signing, or record a separate evaluation update afterward. Decision and next action are required to complete the route.' : 'Section H is maintained by the assigned final approver. Completed evaluations are locked.'}</p>
    {request.status === 'Pending Approval' && !rndEvaluationComplete(base) && <p className="rounded-md bg-amber-50 p-2 text-xs font-semibold text-amber-900">Evaluation needed before completion</p>}
    {!!request.rndSignedStates?.some(state => state.version === request.documentVersion) && <p className="text-xs text-workspace-muted">A signature confirms the document at signing time. Later evaluation updates are separate review records; use the signed copies below to see exactly what was signed.</p>}
    <details open={canEdit}><summary className="cursor-pointer text-sm font-semibold">Section H · Internal evaluation</summary><RndFields value={value} onChange={setValue} evaluation disabled={!canEdit || saving} /></details>
    {canEdit && <button disabled={saving} className="workspace-primary min-h-10 px-4 text-sm" onClick={async () => { setSaving(true); setMessage(''); try { const result = await saveRndEvaluation(request.id, value); setMessage(result.success ? 'Evaluation saved. Earlier signatures are unchanged.' : result.error ?? 'Could not save evaluation.'); } finally { setSaving(false); } }}>{saving ? 'Saving…' : 'Save evaluation'}</button>}
    {message && <p role="status" className="text-xs">{message}</p>}
    {canEdit && request.approvalSteps.at(-1)?.status === 'Approved' && <div className="space-y-2 border-t border-workspace-line pt-3">
      <label className="block text-sm font-medium">Completion / bypass reason<textarea className="workspace-control mt-1 block w-full p-2" maxLength={2000} value={reason} onChange={e => setReason(e.target.value)} /></label>
      <p className="text-xs text-workspace-muted">Completing now bypasses any remaining optional signers. The reason is recorded in history.</p>
      <button className="workspace-primary min-h-10 px-3 text-sm" disabled={saving || !reason.trim() || !rndEvaluationComplete(base)} onClick={async () => { setSaving(true); try { const result = await directorOverrideAction(request.id, reason); setMessage(result.success ? 'Route completed.' : result.error ?? 'Could not complete.'); } finally { setSaving(false); } }}>Complete after signing</button>
    </div>}
    {!!request.rndSignedStates?.length && <details><summary className="text-xs font-semibold">Document copies captured at signing ({request.rndSignedStates.length})</summary>{request.rndSignedStates.map((state, i) => <details key={i} className="mt-2"><summary className="text-xs">v{state.version} · {request.approvalHistory.find(event => event.actionByUserId === state.actorId)?.actionByName ?? state.actorId} · {new Date(state.at).toLocaleString()}</summary><div className="mt-2 overflow-auto"><RndRequestDocument data={state.formData} /></div></details>)}</details>}
    {!!request.rndEvaluationHistory?.length && <details><summary className="text-xs font-semibold">Evaluation updates ({request.rndEvaluationHistory.length})</summary><ul className="mt-2 space-y-2 text-xs">{request.rndEvaluationHistory.map((item, i) => <li key={i}>{item.actorName} · v{item.version} · {new Date(item.at).toLocaleString()}<p>{item.evaluation.choices.hDecision?.join(', ')} · {item.evaluation.fields.inpHNextAction}</p></li>)}</ul></details>}
  </section>;
}
