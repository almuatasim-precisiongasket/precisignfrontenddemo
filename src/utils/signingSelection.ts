import type { UserProfile, WorkflowConfig, WorkflowStageConfig } from '../types';
import { canUserAccessCompany } from './companyAccess';
import { resolveConfiguredSigner } from './workflowAdministration';

export type FinalSignerChoice = { primaryId: string | null; secondaryIds: string[] };
export type SignerChoices = Record<string, string | null | FinalSignerChoice>;

export const noEligibleSigners = 'No eligible signers available. Ask a workflow administrator to update this signing route.';

export function isOptionalSigner(workflow: WorkflowConfig, stage: WorkflowStageConfig) {
  if (workflow.signerSelection === 'company-directory') return !stage.isFinalApproval;
  return (workflow.formType === 'Administrative & Payment Request' || workflow.formType === 'Expense Claim')
    && !stage.isFinalApproval && stage.requiredOnSubmit !== true;
}

export function signerOptions(workflow: WorkflowConfig, stage: WorkflowStageConfig, users: UserProfile[], requesterId: string) {
  if (workflow.signerSelection === 'company-directory') {
    return users.filter(person => person.id !== requesterId && canUserAccessCompany(person, workflow.companyId));
  }
  const primary = resolveConfiguredSigner(stage, users, workflow.companyId);
  const ids = new Set([primary?.id, ...(stage.eligibleSignerIds ?? [])]);
  return users.filter(person => person.id !== requesterId && ids.has(person.id) && canUserAccessCompany(person, workflow.companyId));
}

export function secondarySignerOptions(workflow: WorkflowConfig, stage: WorkflowStageConfig, users: UserProfile[], excludedIds: Set<string>) {
  return users.filter(person => !excludedIds.has(person.id) && (workflow.signerSelection === 'company-directory' || stage.backupSignerIds?.includes(person.id))
    && canUserAccessCompany(person, workflow.companyId));
}


export function suggestedSignerChoices(workflow: WorkflowConfig, users: UserProfile[], requesterId: string, choices: SignerChoices): SignerChoices {
  if (workflow.signerSelection !== 'company-directory') return choices;
  return Object.fromEntries(workflow.stages.map(stage => {
    if (Object.hasOwn(choices, stage.id)) return [stage.id, choices[stage.id]];
    const person = stage.isFinalApproval && signerOptions(workflow, stage, users, requesterId).find(user => user.id === stage.assignedUserId);
    return [stage.id, person ? { primaryId: person.id, secondaryIds: [] } : null];
  }));
}

export function applySignerChoices(workflow: WorkflowConfig, users: UserProfile[], requesterId: string, choices?: SignerChoices) {
  if (choices === undefined) {
    if (workflow.formType === 'Admin Work Request') return { workflow, omittedSigningSteps: [] as string[] };
    choices = {};
  }
  if (!choices || typeof choices !== 'object' || Array.isArray(choices) || Object.keys(choices).some(id => !workflow.stages.some(stage => stage.id === id))) {
    return { error: 'Review the signing steps before sending.' };
  }
  choices = suggestedSignerChoices(workflow, users, requesterId, choices);
  const directory = workflow.signerSelection === 'company-directory';
  const chosen: WorkflowStageConfig[] = [];
  const omittedSigningSteps: string[] = [];
  const backups = new Map<string, string[]>();
  for (const stage of workflow.stages) {
    let selection = Object.hasOwn(choices, stage.id) ? choices[stage.id] : undefined;
    if (selection !== null && typeof selection === 'object') {
      if ((!stage.isFinalApproval && !directory) || Array.isArray(selection)
        || Object.keys(selection).some(key => key !== 'primaryId' && key !== 'secondaryIds')
        || (selection.primaryId !== null && typeof selection.primaryId !== 'string')
        || !Array.isArray(selection.secondaryIds) || selection.secondaryIds.length > 20
        || selection.secondaryIds.some(id => typeof id !== 'string')
        || new Set(selection.secondaryIds).size !== selection.secondaryIds.length) {
        return { error: 'Review the secondary final approvers before sending.' };
      }
      if (directory && selection.primaryId === null && !stage.isFinalApproval) {
        return { error: `Choose a signer for ${stage.name}, or remove that optional step.` };
      }
      backups.set(stage.id, selection.secondaryIds);
      selection = selection.primaryId;
    }
    const options = signerOptions(workflow, stage, users, requesterId);
    if (selection === null || (selection === undefined && isOptionalSigner(workflow, stage))) {
      if (!isOptionalSigner(workflow, stage)) return { error: options.length ? `Choose an eligible signer for ${stage.name}.` : noEligibleSigners };
      omittedSigningSteps.push(stage.name);
      continue;
    }
    const id = selection;
    const person = options.find(candidate => candidate.id === id);
    if (!person) return { error: options.length ? `Choose an eligible signer for ${stage.name}.` : noEligibleSigners };
    chosen.push({ ...stage, assignedUserId: person.id, assignedRole: person.role });
  }
  const final = chosen.at(-1);
  const stages = chosen.filter(stage => {
    if (directory || stage === final || stage.assignedUserId !== final?.assignedUserId) return true;
    if (!isOptionalSigner(workflow, stage)) return true;
    omittedSigningSteps.push(stage.name);
    return false;
  }).map((stage, index) => ({ ...stage, stageNumber: index + 1 }));
  if (new Set(stages.map(stage => stage.assignedUserId)).size !== stages.length) {
    return { error: 'Choose a different person for each required signing step.' };
  }
  for (const stage of stages) {
    const selected = backups.get(stage.id) ?? (directory ? [] : stage.backupSignerIds);
    if (selected === undefined) continue;
    const excluded = new Set([requesterId, ...stages.map(item => item.assignedUserId!)]);
    const eligible = secondarySignerOptions(workflow, stage, users, excluded);
    if (selected.some(id => !eligible.some(person => person.id === id))) {
      return { error: 'Choose backups who can access this company and are not already signing this request.' };
    }
    stage.backupSignerIds = selected;
    stage.backupCompletionUserIds = stage.backupCompletionUserIds?.filter(id => selected.includes(id));
  }
  return { workflow: { ...workflow, stages }, omittedSigningSteps };
}
