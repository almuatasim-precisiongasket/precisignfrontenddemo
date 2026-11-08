import type { RequestRecord, RndFormData, UserProfile } from '../types';
import { canUserAccessCompany } from './companyAccess';
import { rndGroups, rndSections, RND_FORM } from './rndFields';

const textFields = rndSections.flatMap(section => section.items.filter(item => item.kind === 'text').map(item => item.id));
export const isEvaluationField = (id: string) => id.startsWith('inpH') || id.startsWith('h');

/** Shared strict allowlist for API and demo. Clients cannot write Section H at submission. */
export function validateRnd(value: unknown, evaluation: boolean): string | undefined {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return 'Complete the R&D form.';
  const data = value as RndFormData;
  if (Object.keys(data).some(key => !['fields', 'choices', 'marketRows'].includes(key))
    || !data.fields || typeof data.fields !== 'object' || Array.isArray(data.fields)
    || !data.choices || typeof data.choices !== 'object' || Array.isArray(data.choices)
    || !Array.isArray(data.marketRows) || data.marketRows.length > 5) return 'Invalid R&D fields.';
  for (const [id, text] of Object.entries(data.fields)) {
    if (!textFields.includes(id as never) || typeof text !== 'string' || text.length > 2000
      || (!evaluation && isEvaluationField(id) && text.trim())
      || (evaluation && !isEvaluationField(id))) return 'Invalid R&D text field or evaluation permission.';
  }
  for (const [id, selected] of Object.entries(data.choices)) {
    const group = rndGroups.find(group => group.id === id);
    if (!group || !Array.isArray(selected) || new Set(selected).size !== selected.length
      || (group.singleSelect && selected.length > 1)
      || selected.some(option => !(group.options as readonly string[]).includes(option))
      || (!evaluation && isEvaluationField(id) && selected.length)
      || (evaluation && !isEvaluationField(id))) return 'Invalid R&D selection or evaluation permission.';
  }
  for (const row of data.marketRows) {
    if (!row || typeof row !== 'object' || Object.keys(row).length !== 3
      || ['sol', 'sup', 'web'].some(key => typeof row[key as keyof typeof row] !== 'string' || row[key as keyof typeof row].length > 300)) return 'Invalid market solution row.';
  }
  if (evaluation && data.marketRows.length) return 'Evaluation cannot change market research.';
  if (!evaluation && (!data.fields.inpProbTitle?.trim() || !data.fields.inpQ1?.trim())) return 'Enter the problem title and description.';
}

export function rndEvaluationComplete(data?: RndFormData) {
  return !!data?.choices.hDecision?.length && !!data.fields.inpHNextAction?.trim();
}

export function saveRndEvaluation(request: RequestRecord, actor: UserProfile, evaluation: RndFormData) {
  if (!canUserAccessCompany(actor, request.companyId) || request.formType !== RND_FORM || request.status !== 'Pending Approval'
    || request.approvalSteps.at(-1)?.assignedUserId !== actor.id || !request.formData.rnd) {
    return { success: false, error: 'Only the assigned final approver can edit an open R&D evaluation.' };
  }
  const error = validateRnd(evaluation, true);
  if (error) return { success: false, error };
  const at = new Date().toISOString();
  // Replace H as a whole; preserve the submitted A–G fields. Earlier approval states stay frozen.
  const base = request.formData.rnd;
  const rnd: RndFormData = {
    fields: { ...Object.fromEntries(Object.entries(base.fields).filter(([key]) => !isEvaluationField(key))), ...evaluation.fields },
    choices: { ...Object.fromEntries(Object.entries(base.choices).filter(([key]) => !isEvaluationField(key))), ...evaluation.choices },
    marketRows: base.marketRows,
  };
  return { success: true, updatedRequest: {
    ...request, updatedAt: at, formData: { ...request.formData, rnd, rndEvaluationUpdatedAfterSigning: request.approvalSteps.at(-1)?.status === 'Approved' },
    rndEvaluationHistory: [...(request.rndEvaluationHistory ?? []), { version: request.documentVersion, at, actorId: actor.id, actorName: actor.name, evaluation: structuredClone(evaluation) }],
    approvalHistory: [...request.approvalHistory, { id: crypto.randomUUID(), stepNumber: request.approvalSteps.length, actionByUserId: actor.id, actionByName: actor.name, actionByRole: actor.role, action: 'Evaluation Updated' as const, dateTime: at, version: request.documentVersion, comments: 'Section H evaluation recorded separately from signatures.' }],
  } };
}
