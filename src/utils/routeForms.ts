import type { CompanyId, WorkflowConfig, WorkflowStageConfig } from '../types';

export const routeForms = {
  'Administrative & Payment Request': { requester: 'Requester Signature', department: 'Department Head Signature', final: 'Approver Signature', processing: '' },
  'IT Request': { requester: 'Requester Signature', department: undefined, final: 'Approval Authority Signature', processing: '' },
  'Cash Voucher': { requester: 'Requester (you)', department: undefined, final: 'Approved by', processing: "Receiver's Signature and Cashier Signature are collected during cash processing." },
  'Expense Claim': { requester: 'Claimed by', department: 'Department Head', final: 'Approval Authority', processing: 'Finance signs during settlement.' },
} as const;
export type RouteForm = keyof typeof routeForms;

export function newSigningStep(name: string, final: boolean, slot?: 'department-head'): WorkflowStageConfig {
  return {
    id: crypto.randomUUID(), stageNumber: 1, name, isFinalApproval: final,
    mapsToDocumentSignature: final, documentSlot: slot, canReject: true, canReturnForCorrection: true,
    requiredOnSubmit: final, mustSign: false, backupSignerIds: [],
  };
}

export function routeDraft(companyId: CompanyId, form: RouteForm, existing?: WorkflowConfig): WorkflowConfig {
  const labels = routeForms[form];
  const old = existing && structuredClone(existing);
  const stages = old?.stages.length ? old.stages : [
    ...(labels.department ? [newSigningStep(labels.department, false, 'department-head')] : []),
    newSigningStep(labels.final, true),
  ];
  return {
    id: old?.id ?? crypto.randomUUID(), companyId, formType: form, version: old?.version ?? 0,
    ...old, signerSelection: 'company-directory', allowFinalBypass: old?.allowFinalBypass ?? true,
    preventSelfApproval: true, allowDirectorOverride: false, reminderDays: 0, escalationDays: 0,
    rejectionBehavior: 'archive', returnBehavior: 'restart_workflow',
    stages: stages.map((stage, index) => ({
      ...stage, stageNumber: index + 1, isFinalApproval: index === stages.length - 1,
      mapsToDocumentSignature: index === stages.length - 1, requiredOnSubmit: index === stages.length - 1,
      mustSign: false,
      documentSlot: stage.documentSlot ?? (old?.signerSelection !== 'company-directory' && index === 0 && index < stages.length - 1 && labels.department ? 'department-head' : undefined),
    })),
  };
}
