import type { UserProfile, WorkflowConfig, WorkflowStageConfig } from '../types';
import { canUserAccessCompany } from './companyAccess';
import { resolveConfiguredSigner } from './workflowAdministration';

export type SignerChoices = Record<string, string | null>;

export function isOptionalSigner(workflow: WorkflowConfig, stage: WorkflowStageConfig) {
  return (workflow.formType === 'Administrative & Payment Request' || workflow.formType === 'Expense Claim')
    && !stage.isFinalApproval && stage.requiredOnSubmit !== true;
}

export function signerOptions(workflow: WorkflowConfig, stage: WorkflowStageConfig, users: UserProfile[], requesterId: string) {
  const primary = resolveConfiguredSigner(stage, users, workflow.companyId);
  const ids = new Set([primary?.id, ...(stage.eligibleSignerIds ?? [])]);
  return users.filter(person => person.id !== requesterId && ids.has(person.id) && canUserAccessCompany(person, workflow.companyId));
}

export function applySignerChoices(workflow: WorkflowConfig, users: UserProfile[], requesterId: string, choices?: SignerChoices) {
  if (choices === undefined) {
    if (workflow.formType === 'Admin Work Request') return { workflow, omittedSigningSteps: [] as string[] };
    choices = {};
  }
  if (!choices || typeof choices !== 'object' || Array.isArray(choices) || Object.keys(choices).some(id => !workflow.stages.some(stage => stage.id === id))) {
    return { error: 'Review the signing steps before sending.' };
  }
  const chosen: WorkflowStageConfig[] = [];
  const omittedSigningSteps: string[] = [];
  for (const stage of workflow.stages) {
    const selection = Object.hasOwn(choices, stage.id) ? choices[stage.id] : undefined;
    if (selection === null || (selection === undefined && isOptionalSigner(workflow, stage))) {
      if (!isOptionalSigner(workflow, stage)) return { error: `${stage.name} is required.` };
      omittedSigningSteps.push(stage.name);
      continue;
    }
    const id = selection ?? resolveConfiguredSigner(stage, users, workflow.companyId)?.id;
    const person = signerOptions(workflow, stage, users, requesterId).find(candidate => candidate.id === id);
    if (!person) return { error: `Choose an eligible signer for ${stage.name}.` };
    chosen.push({ ...stage, assignedUserId: person.id, assignedRole: person.role });
  }
  const final = chosen.at(-1);
  const stages = chosen.filter(stage => {
    if (stage === final || stage.assignedUserId !== final?.assignedUserId) return true;
    if (!isOptionalSigner(workflow, stage)) return true;
    omittedSigningSteps.push(stage.name);
    return false;
  }).map((stage, index) => ({ ...stage, stageNumber: index + 1 }));
  if (new Set(stages.map(stage => stage.assignedUserId)).size !== stages.length) {
    return { error: 'Choose a different person for each required signing step.' };
  }
  return { workflow: { ...workflow, stages }, omittedSigningSteps };
}
