import React, { useState, useEffect, useRef } from 'react';
import { canAdministerWorkflows, resolveConfiguredSigner } from '../../utils/workflowAdministration';
import { canUserAccessCompany } from '../../utils/companyAccess';
import { useApp } from '../../context/AppContext';
import { WorkflowConfig, WorkflowStageConfig, CompanyId } from '../../types/index';
import {
  Sliders,
  Plus,
  Trash2,
  ArrowUp,
  ArrowDown,
  Check,
  Save,
  RotateCcw,
  CheckCircle2,
  AlertCircle,
  ShieldCheck,
  FileText,
  Clock,
  Layers,
} from 'lucide-react';

export const WorkflowSettingsView: React.FC = () => {
  const {
    companies,
    readOnly: connected,
    selectedCompanyId,
    setSelectedCompanyId,
    workflows,
    saveWorkflow,
    currentUser,
    users,
    selectedCompany,
  } = useApp();

  const saving = useRef(false);
  const [busy, setBusy] = useState(false);
  const [selectedFormName, setSelectedFormName] = useState<string>('Admin Work Request');
  const [saveFeedback, setSaveFeedback] = useState<string | null>(null);
  const [validationError, setValidationError] = useState<string | null>(null);

  // Active workflow for selected form and company
  const activeWf =
    workflows.find((w) => w.companyId === selectedCompanyId && w.formType === selectedFormName) ||
    workflows[0] || { id:'wf-pew-admin',companyId:'PEW' as CompanyId,formType:'Admin Work Request',version:0,stages:[],preventSelfApproval:true,allowDirectorOverride:false,reminderDays:2,escalationDays:5,rejectionBehavior:'archive' as const,returnBehavior:'restart_workflow' as const };

  // Local editing state for current workflow
  const [wfConfig, setWfConfig] = useState<WorkflowConfig>(activeWf);

  // Synchronize workflow state when changing company, form, or repository workflows
  useEffect(() => {
    if (connected && selectedCompanyId === 'PEG') return;
    const targetCompanyId: CompanyId = selectedCompanyId === 'PEG' ? 'PEW' : (selectedCompanyId as CompanyId);
    const found = workflows.find(
      (w) => w.companyId === targetCompanyId && w.formType === selectedFormName
    );
    if (found) {
      setWfConfig(found);
    } else {
      setWfConfig({
        id: `wf-${targetCompanyId.toLowerCase()}-${selectedFormName.toLowerCase().replace(/\s+/g, '-')}`,
        formType: selectedFormName,
        companyId: targetCompanyId,
        version: connected ? 0 : 1,
        stages: connected || ['IT Request', 'Cash Voucher', 'Expense Claim'].includes(selectedFormName) ? [] : [
          {
            id: `stg-${Date.now()}-1`,
            stageNumber: 1,
            name: 'Department Review',
            assignedRole: 'General Manager',
            isFinalApproval: false,
            canReject: true,
            canReturnForCorrection: true,
            mapsToDocumentSignature: false,
          },
          {
            id: `stg-${Date.now()}-2`,
            stageNumber: 2,
            name: 'Director Sign-off',
            assignedRole: 'Director',
            isFinalApproval: true,
            canReject: true,
            canReturnForCorrection: true,
            mapsToDocumentSignature: true,
          },
        ],
        preventSelfApproval: true,
        allowDirectorOverride: true,
        reminderDays: 2,
        escalationDays: 5,
        rejectionBehavior: 'archive',
        returnBehavior: 'restart_workflow',
      });
    }
  }, [selectedCompanyId, selectedFormName, workflows, connected]);

  const FORMS = [
    { name: 'Admin Work Request', code: 'PR#21-001FA', active: true },
    { name: 'Administrative & Payment Request', code: 'Admin & Payment', active: true },
    { name: 'Payment Request', code: 'PR#21-002FA', active: true },
    { name: 'IT Request', code: 'PR#21-003IT', active: true },
    { name: 'Cash Voucher', code: 'Cash Voucher', active: true },
    { name: 'Expense Claim', code: 'Expense Claim', active: true },
    { name: 'IT Asset Allocation', code: 'PR#21-004AA', active: true },
    { name: 'Undertaking Guarantee', code: 'PR#21-005UG', active: true },
  ];

  const eligibleSigners = users.filter(user => canUserAccessCompany(user, wfConfig.companyId));

  function resolveSigner(stage: WorkflowStageConfig) {
    return resolveConfiguredSigner(stage, users, wfConfig.companyId);
  }

  // Add stage
  const handleAddStage = () => {
    if (['IT Request', 'Cash Voucher'].includes(selectedFormName) && wfConfig.stages.length >= 1) {
      setValidationError('This form has one approval authority signature space.');
      return;
    }
    if (['Administrative & Payment Request', 'Expense Claim'].includes(selectedFormName) && wfConfig.stages.length >= 2) {
      setValidationError('This form has two approval spaces: Department Head and Final Approver.');
      return;
    }
    const nextNumber = wfConfig.stages.length + 1;
    const newStage: WorkflowStageConfig = {
      id: `stage-${Date.now()}-${nextNumber}`,
      stageNumber: nextNumber,
      name: `Tier ${nextNumber} Verification`,
      assignedRole: 'General Manager',
      isFinalApproval: false,
      canReject: true,
      canReturnForCorrection: true,
      mapsToDocumentSignature: false,
    };
    setWfConfig((prev) => ({
      ...prev,
      stages: [...prev.stages, newStage],
    }));
  };

  // Remove stage
  const handleRemoveStage = (id: string) => {
    if (wfConfig.stages.length <= 1) {
      setValidationError('A workflow must contain at least one approval stage.');
      return;
    }
    setWfConfig((prev) => ({
      ...prev,
      stages: prev.stages
        .filter((s) => s.id !== id)
        .map((s, idx) => ({ ...s, stageNumber: idx + 1 })),
    }));
  };

  // Move stage
  const handleMoveStage = (index: number, direction: 'up' | 'down') => {
    const targetIdx = direction === 'up' ? index - 1 : index + 1;
    if (targetIdx < 0 || targetIdx >= wfConfig.stages.length) return;
    const nextStages = [...wfConfig.stages];
    const temp = nextStages[index];
    nextStages[index] = nextStages[targetIdx];
    nextStages[targetIdx] = temp;
    setWfConfig((prev) => ({
      ...prev,
      stages: nextStages.map((s, idx) => ({ ...s, stageNumber: idx + 1 })),
    }));
  };

  // Change stage fields
  const handleStageChange = (id: string, updates: Partial<WorkflowStageConfig>) => {
    setWfConfig((prev) => ({
      ...prev,
      stages: prev.stages.map(stage => stage.id === id ? { ...stage, ...updates } : stage),
    }));
  };

  // Validate before saving
  const handleSave = async () => {
    if (saving.current) return;
    setValidationError(null); setSaveFeedback(null);
    if (connected && (selectedCompanyId === 'PEG' || wfConfig.companyId !== selectedCompanyId || wfConfig.formType !== selectedFormName || !canUserAccessCompany(currentUser, wfConfig.companyId))) {
      setValidationError('Select an authorized company and wait for its signing route to load.');
      return;
    }

    if (wfConfig.stages.length === 0) {
      setValidationError('Workflow configuration must have at least one stage.');
      return;
    }

    const hasEmptyName = wfConfig.stages.some((s) => !s.name.trim());
    if (hasEmptyName) {
      setValidationError('All workflow stages must have a valid descriptive name.');
      return;
    }

    const signers = wfConfig.stages.map(resolveSigner);
    const missing = signers.findIndex(signer => !signer);
    if (missing !== -1) {
      setValidationError(`Choose a signer for step ${missing + 1} (${wfConfig.stages[missing].name}).`);
      return;
    }

    const updated = {
      ...wfConfig,
      stages: wfConfig.stages.map((stage, index) => ({
        ...stage,
        assignedUserId: signers[index]?.id,
        assignedRole: signers[index]?.role,
        isFinalApproval: index === wfConfig.stages.length - 1,
        mapsToDocumentSignature: index === wfConfig.stages.length - 1,
        backupCompletionUserIds: index === wfConfig.stages.length - 1 ? stage.backupCompletionUserIds : undefined,
      })),
      returnBehavior: 'restart_workflow' as const,
      version: connected ? wfConfig.version : wfConfig.version + 1,
    };

    saving.current = true; setBusy(true);
    try {
      const saved = await saveWorkflow(updated);
      setSaveFeedback(`Workflow configuration saved successfully for ${saved.formType} (Version ${saved.version}).`);
    } catch (error) {
      setValidationError(error instanceof Error ? error.message : 'Could not save workflow.');
      return;
    } finally { saving.current = false; setBusy(false); }
    setTimeout(() => setSaveFeedback(null), 3500);
  };

  if (connected && !canAdministerWorkflows(currentUser)) return <div className="p-6 text-sm">Workflow administration requires Director or group administrator access.</div>;
  if (connected && selectedCompanyId === 'PEG') return <div className="p-6 text-sm space-y-3"><p>Select a legal company to configure its signing routes.</p><select aria-label="Company for signing routes" value="" onChange={event => setSelectedCompanyId(event.target.value as CompanyId)} className="border rounded p-2"><option value="" disabled>Select company</option>{companies.filter(company => canUserAccessCompany(currentUser, company.id)).map(company => <option key={company.id} value={company.id}>{company.fullName}</option>)}</select></div>;
  if (connected && !canUserAccessCompany(currentUser, selectedCompanyId as CompanyId)) return <div className="p-6 text-sm">You do not have access to this company.</div>;

  return (
    <div className="p-6 md:p-8 space-y-6 max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-[#E2E5E9]">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-xl font-bold tracking-tight text-[#192B3C] flex items-center gap-2">
              <Sliders className="w-5 h-5 text-[#365C78]" />
              <span>Signing routes</span>
            </h1>
            <span className="text-xs font-semibold px-2 py-0.5 rounded bg-[#EBF2F7] text-[#365C78] border border-[#C2D5E3]">
              {selectedCompany.code}
            </span>
          </div>
          <p className="text-xs text-slate-500 mt-1">
            Choose who signs each form and in what order.
          </p>
        </div>

        <button
          disabled={busy}
          onClick={handleSave}
          className="flex items-center gap-2 px-4 py-2 bg-[#365C78] hover:bg-[#2A4A62] text-white rounded-md text-xs font-semibold shadow-xs transition-colors shrink-0"
        >
          <Save className="w-3.5 h-3.5" />
          <span>Save signing route</span>
        </button>
      </div>

      {/* Validation feedback alerts */}
      {validationError && (
        <div className="p-3 bg-rose-50 border border-rose-200 rounded-md text-xs text-rose-800 flex items-center gap-2">
          <AlertCircle className="w-4 h-4 shrink-0 text-rose-600" />
          <span>{validationError}</span>
        </div>
      )}

      <fieldset disabled={busy} className="border rounded p-3 text-xs space-y-2"><legend>Processing team — read access</legend>
        {users.filter(user => canUserAccessCompany(user, wfConfig.companyId)).map(user => <label className="block" key={user.id}><input type="checkbox" checked={wfConfig.processingUserIds?.includes(user.id) || false} onChange={e => { const checked = e.target.checked; setWfConfig(previous => ({ ...previous, processingUserIds: checked ? [...(previous.processingUserIds || []),user.id] : (previous.processingUserIds || []).filter(id => id !== user.id) })); }} /> {user.name}</label>)}
      </fieldset>
      {selectedFormName === 'Cash Voucher' && <label className="block rounded border p-3 text-xs">
        <input type="checkbox" checked={wfConfig.allowCashReceiptWaiver ?? false}
          onChange={event => setWfConfig(previous => ({ ...previous, allowCashReceiptWaiver: event.target.checked }))} />
        {' '}Allow the voucher approver to waive receiver acknowledgment after payout
      </label>}
      {saveFeedback && (
        <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-md text-xs text-emerald-800 flex items-center gap-2">
          <CheckCircle2 className="w-4 h-4 shrink-0 text-emerald-600" />
          <span>{saveFeedback}</span>
        </div>
      )}

      {/* Form Selector Strip */}
      <div className="bg-white border border-[#E2E5E9] rounded-lg p-3 shadow-xs flex flex-wrap items-center gap-2">
        <span className="text-xs font-semibold text-slate-600 mr-2">Configuring Form:</span>
        {FORMS.filter(form => !connected || ['Admin Work Request', 'Administrative & Payment Request', 'IT Request', 'Cash Voucher', 'Expense Claim'].includes(form.name)).map((form) => (
          <button
            key={form.name}
            onClick={() => {
              setSelectedFormName(form.name);
              setValidationError(null);
            }}
            className={`px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${
              selectedFormName === form.name
                ? 'bg-[#365C78] text-white font-semibold shadow-xs'
                : 'text-slate-700 bg-slate-100 hover:bg-slate-200'
            }`}
          >
            <span>{form.name}</span>
            <span className="text-[10px] opacity-75 font-mono ml-1.5">({form.code})</span>
          </button>
        ))}
      </div>

      {/* Main Configuration Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* Left Column (8 cols): Sequential Stages in Execution Order */}
        <div className="lg:col-span-8 bg-white border border-[#E2E5E9] rounded-lg shadow-xs p-6 space-y-5">
          <div className="flex items-center justify-between border-b border-[#E2E5E9] pb-3">
            <div>
              <h2 className="text-xs font-bold uppercase tracking-wider text-[#192B3C]">
                Workflow Stages in Execution Order
              </h2>
              <p className="text-[11px] text-slate-500 mt-0.5">
                Each request moves sequentially from Stage 1 to final sign-off.
              </p>
            </div>
            <button
              onClick={handleAddStage}
              className="flex items-center gap-1.5 px-3 py-1.5 border border-[#CBD5E1] bg-white hover:bg-slate-50 text-slate-800 rounded-md text-xs font-semibold transition-colors shadow-xs"
            >
              <Plus className="w-3.5 h-3.5 text-[#365C78]" />
              <span>Add Stage</span>
            </button>
          </div>

          {/* Sequential Stages List */}
          <div className="space-y-3">
            {wfConfig.stages.map((stage, index) => {
              const isFirst = index === 0;
              const isLast = index === wfConfig.stages.length - 1;

              return (
                <div
                  key={stage.id}
                  className={`p-4 rounded-lg border transition-all ${
                    isLast
                      ? 'border-[#365C78] bg-[#EBF2F7]/30 ring-1 ring-[#365C78]/20'
                      : 'border-[#E2E5E9] bg-white'
                  }`}
                >
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-slate-100">
                    <div className="flex items-center gap-2.5">
                      <div className="w-6 h-6 rounded bg-[#192B3C] text-white flex items-center justify-center text-xs font-bold">
                        {stage.stageNumber}
                      </div>
                      <input
                        type="text"
                        value={stage.name}
                        onChange={(e) => handleStageChange(stage.id, { name: e.target.value })}
                        className="font-bold text-xs text-[#192B3C] border border-[#E2E5E9] rounded px-2.5 py-1 focus:outline-none focus:ring-1 focus:ring-[#365C78] w-56"
                      />
                    </div>

                    {/* Move & Delete controls */}
                    <div className="flex items-center gap-1">
                      <button
                        onClick={() => handleMoveStage(index, 'up')}
                        disabled={isFirst}
                        className="p-1 rounded text-slate-400 hover:text-slate-700 disabled:opacity-30 disabled:cursor-not-allowed hover:bg-slate-100"
                        title="Move Stage Earlier in Workflow"
                      >
                        <ArrowUp className="w-3.5 h-3.5" />
                      </button>
                      <button
                        onClick={() => handleMoveStage(index, 'down')}
                        disabled={isLast}
                        className="p-1 rounded text-slate-400 hover:text-slate-700 disabled:opacity-30 disabled:cursor-not-allowed hover:bg-slate-100"
                        title="Move Stage Later in Workflow"
                      >
                        <ArrowDown className="w-3.5 h-3.5" />
                      </button>
                      <button
                        onClick={() => handleRemoveStage(stage.id)}
                        className="p-1 rounded text-slate-400 hover:text-rose-600 hover:bg-slate-100"
                        title="Delete Stage"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>

                  {/* Stage Configuration Fields */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mt-3 text-xs">
                    {/* Assigned Role */}
                    <div>
                      <label htmlFor={`signer-${stage.id}`} className="block text-[11px] font-semibold text-slate-600 mb-1">
                        Signer
                      </label>
                      <select
                        id={`signer-${stage.id}`}
                        value={resolveSigner(stage)?.id ?? ''}
                        onChange={(event) => {
                          const signer = eligibleSigners.find(user => user.id === event.target.value);
                          if (signer) handleStageChange(stage.id, {
                            assignedUserId: signer.id, assignedRole: signer.role,
                            backupSignerIds: stage.backupSignerIds?.filter(id => id !== signer.id),
                            backupCompletionUserIds: stage.backupCompletionUserIds?.filter(id => id !== signer.id),
                          });
                        }}
                        className="w-full px-2.5 py-1.5 border border-[#E2E5E9] rounded focus:outline-none focus:ring-1 focus:ring-[#365C78] bg-white text-xs"
                      >
                        <option value="" disabled>Choose a signer</option>
                        {eligibleSigners.map((user) => (
                          <option key={user.id} value={user.id}>
                            {user.name} · {user.role}
                          </option>
                        ))}
                      </select>
                    </div>

                    {/* Document Field & Signature Mapping */}
                    <div>
                      <p className="text-[11px] font-semibold text-slate-600 mb-1">{isLast ? 'Final approver' : 'Approval step'}</p>
                      {isLast && <p>The last signer fills the Approval Authority signature box.</p>}
                    </div>
                  </div>

                  {selectedFormName !== 'Admin Work Request' && <fieldset className="mt-3 space-y-1 text-xs">
                    <legend className="font-semibold">Backup signers</legend>
                    {eligibleSigners.filter(person => person.id !== resolveSigner(stage)?.id).map(person => {
                      const selected = stage.backupSignerIds?.includes(person.id) ?? false;
                      return <div key={person.id} className="flex flex-wrap gap-3">
                        <label><input type="checkbox" checked={selected} onChange={event => handleStageChange(stage.id, {
                          backupSignerIds: event.target.checked ? [...(stage.backupSignerIds ?? []), person.id] : stage.backupSignerIds?.filter(id => id !== person.id),
                          backupCompletionUserIds: stage.backupCompletionUserIds?.filter(id => id !== person.id),
                          eligibleSignerIds: stage.eligibleSignerIds?.filter(id => id !== person.id),
                        })} /> {person.name}</label>
                        {!selected && <label><input type="checkbox" checked={stage.eligibleSignerIds?.includes(person.id) ?? false}
                          onChange={event => handleStageChange(stage.id, { eligibleSignerIds: event.target.checked
                            ? [...(stage.eligibleSignerIds ?? []), person.id] : stage.eligibleSignerIds?.filter(id => id !== person.id) })} /> Requester can select</label>}
                        {isLast && selected && <label><input type="checkbox" checked={stage.backupCompletionUserIds?.includes(person.id) ?? false}
                          onChange={event => handleStageChange(stage.id, { backupCompletionUserIds: event.target.checked
                            ? [...(stage.backupCompletionUserIds ?? []), person.id] : stage.backupCompletionUserIds?.filter(id => id !== person.id) })} /> Can complete early</label>}
                      </div>;
                    })}
                    {!isLast && <div className="flex flex-wrap gap-3">
                      <label><input type="checkbox" checked={stage.requiredOnSubmit ?? false} onChange={event => handleStageChange(stage.id, { requiredOnSubmit: event.target.checked })} /> Required on every request</label>
                      <label><input type="checkbox" checked={stage.mustSign ?? false} onChange={event => handleStageChange(stage.id, { mustSign: event.target.checked })} /> Cannot bypass if included</label>
                    </div>}
                  </fieldset>}

                  {/* Stage Permissions */}
                  <div className="mt-3 pt-2 border-t border-slate-100 flex items-center gap-4 text-xs text-slate-600">
                    <span className="text-[11px] font-semibold text-slate-500">Stage Permissions:</span>
                    <label className="flex items-center gap-1.5 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={stage.canReturnForCorrection}
                        onChange={(e) =>
                          handleStageChange(stage.id, { canReturnForCorrection: e.target.checked })
                        }
                        className="rounded text-[#365C78] focus:ring-[#365C78] w-3.5 h-3.5"
                      />
                      <span className="text-[11px]">Can Return for Correction</span>
                    </label>

                    <label className="flex items-center gap-1.5 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={stage.canReject}
                        onChange={(e) =>
                          handleStageChange(stage.id, { canReject: e.target.checked })
                        }
                        className="rounded text-[#365C78] focus:ring-[#365C78] w-3.5 h-3.5"
                      />
                      <span className="text-[11px]">Can Formally Reject</span>
                    </label>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Right Column (4 cols): Corporate Governance & Escalation Policies */}
        <div className="lg:col-span-4 space-y-4">
          <div className="bg-white border border-[#E2E5E9] rounded-lg shadow-xs p-5 space-y-4">
            <div className="border-b border-[#E2E5E9] pb-3">
              <h2 className="text-xs font-bold uppercase tracking-wider text-[#192B3C] flex items-center gap-1.5">
                <ShieldCheck className="w-4 h-4 text-[#365C78]" />
                <span>Governance &amp; Security Rules</span>
              </h2>
              <p className="text-[11px] text-slate-500 mt-0.5">
                Rules for signing requests.
              </p>
            </div>

            {/* Rule 1: Prevent Self-Approval */}
            <div className="space-y-1.5 p-3 rounded-md bg-[#F5F6F8] border border-[#E2E5E9]">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-[#192B3C]">Prevent Self-Approval</span>
                <input
                  type="checkbox"
                  checked={wfConfig.preventSelfApproval}
                  onChange={(e) =>
                    setWfConfig((prev) => ({ ...prev, preventSelfApproval: e.target.checked }))
                  }
                  className="rounded text-[#365C78] focus:ring-[#365C78] w-4 h-4 cursor-pointer"
                />
              </div>
              <p className="text-[11px] text-slate-600 leading-relaxed">
                Requesters are strictly prohibited from approving their own submitted requests, even if they hold the assigned approver role.
              </p>
            </div>

            <div className="space-y-1.5 p-3 rounded-md bg-[#F5F6F8] border border-[#E2E5E9]">
              <span className="text-xs font-bold text-[#192B3C]">Final approver completion authority</span>
              <p className="text-[11px] text-slate-600">The assigned final approver can Sign and wait, or Sign &amp; Complete with a reason to bypass outstanding signers. Job title does not grant this authority.</p>
            </div>

            {/* Rule 3: Reminders & Notification Thresholds */}
            <div className="space-y-3 pt-2">
              <div className="text-xs font-bold text-[#192B3C] flex items-center gap-1.5">
                <Clock className="w-3.5 h-3.5 text-[#365C78]" />
                <span>Turnaround &amp; Notification Thresholds</span>
              </div>

              <div className="grid grid-cols-2 gap-3 text-xs">
                <div>
                  <label className="block text-[11px] font-medium text-slate-600 mb-1">
                    Reminder Notice
                  </label>
                  <select
                    value={wfConfig.reminderDays}
                    onChange={(e) =>
                      setWfConfig((prev) => ({ ...prev, reminderDays: Number(e.target.value) }))
                    }
                    className="w-full px-2 py-1.5 border border-[#E2E5E9] rounded bg-white"
                  >
                    <option value={1}>After 24 hours</option>
                    <option value={2}>After 2 days</option>
                    <option value={3}>After 3 days</option>
                  </select>
                </div>

                <div>
                  <label className="block text-[11px] font-medium text-slate-600 mb-1">
                    Escalation Window
                  </label>
                  <select
                    value={wfConfig.escalationDays}
                    onChange={(e) =>
                      setWfConfig((prev) => ({ ...prev, escalationDays: Number(e.target.value) }))
                    }
                    className="w-full px-2 py-1.5 border border-[#E2E5E9] rounded bg-white"
                  >
                    <option value={3}>After 3 days</option>
                    <option value={5}>After 5 days</option>
                    <option value={7}>After 7 days</option>
                  </select>
                </div>
              </div>
            </div>

            {/* Rule 4: Re-routing Behavior on Resubmission */}
            <div className="space-y-1.5 pt-2">
              <label className="block text-xs font-bold text-[#192B3C]">
                Correction Resubmission Routing
              </label>
              <select
                value="restart_workflow"
                disabled
                className="w-full px-2.5 py-1.5 text-xs border border-[#E2E5E9] rounded bg-white"
              >
                <option value="restart_workflow">Restart sequentially from Stage 1 (Recommended)</option>
              </select>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
