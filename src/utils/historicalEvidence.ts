import type { ApprovalStepState, FrozenVersionPresentation, RequestRecord, UserProfile } from '../types';

function revision(request: RequestRecord) {
  return (request as RequestRecord & { revision?: number }).revision ?? 1;
}

// Reuse bytes only when the complete attachment set is identical. Never edit a referenced set.
function attachmentSet(request: RequestRecord) {
  const existing = request.versionAttachmentSets?.find(set => set.documentVersion === request.documentVersion
    && JSON.stringify(set.attachments) === JSON.stringify(request.attachments));
  const set = existing ?? { id: crypto.randomUUID(), documentVersion: request.documentVersion, attachments: structuredClone(request.attachments) };
  return { set, sets: existing ? request.versionAttachmentSets! : [...(request.versionAttachmentSets ?? []), set] };
}

export function captureApproval(before: RequestRecord, after: RequestRecord, actor: UserProfile, step: ApprovalStepState, signatureDataUrl: string, recordedAt: string): RequestRecord {
  const { set, sets } = attachmentSet(before);
  const state = { id: crypto.randomUUID(), documentVersion: before.documentVersion, requestRevision: revision(before),
    formData: structuredClone(before.formData), attachmentSetId: set.id, approvalSteps: structuredClone(before.approvalSteps) };
  return { ...after, versionAttachmentSets: sets,
    signedDocumentStates: [...(before.signedDocumentStates ?? []), state],
    approvalEvidence: [...(before.approvalEvidence ?? []), {
      id: crypto.randomUUID(), requestId: before.id, documentVersion: before.documentVersion, requestRevision: revision(before),
      stepId: step.stageId, stepNumber: step.stageNumber, decision: 'approved', actorId: actor.id, actorName: actor.name,
      actorRole: actor.role, recordedAt, signatureDataUrl, documentStateId: state.id,
    }],
  };
}

export function freezeVersion(request: RequestRecord, disposition: FrozenVersionPresentation['disposition']): RequestRecord {
  const { set, sets } = attachmentSet(request);
  const presentation: FrozenVersionPresentation = {
    documentVersion: request.documentVersion, frozenAtRevision: revision(request), frozenAt: request.updatedAt,
    disposition, formData: structuredClone(request.formData), attachmentSetId: set.id,
    approvalSteps: structuredClone(request.approvalSteps), processing: structuredClone(request.processing),
  };
  return { ...request, versionAttachmentSets: sets,
    frozenVersionPresentations: [...(request.frozenVersionPresentations ?? []), presentation],
    versionSnapshots: request.versionSnapshots.map(snapshot => snapshot.version === request.documentVersion
      ? { ...snapshot, formData: structuredClone(request.formData) } : snapshot),
  };
}
