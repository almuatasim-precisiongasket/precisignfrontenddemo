import { canReadPreciRoute } from '../utils/routeAccess';
import React, { createContext, useContext, useState, useEffect, useRef, useMemo } from 'react';
import {
  Company,
  UserProfile,
  WorkflowConfig,
  RequestRecord,
  CompanyId,
  ViewingScope,
  PARENT_ORGANIZATION_ID,
  AdminWorkFormData,
  AdminWorkDraft,
  AttachmentItem,
} from '../types/index';
import { dataService } from '../services/repository';
import {
  filterRequestsByScopeAndUser,
  validateOriginatingCompany,
  canUserStartForm,
} from '../utils/companyAccess';
import { DraftCoordinator } from '../services/draftCoordinator';
import { LocalActionRepository } from '../services/localActionRepository';
import type { BootstrapData, SubmitInput, VersionedRequest } from '../services/apiTypes';
import { ApiError } from '../services/apiTypes';
import type { ApiPreciSignRepository } from '../services/apiRepository';

interface AppContextType {
  readOnly: boolean;
  companies: Company[];
  selectedScope: ViewingScope;
  selectedCompanyId: ViewingScope;
  selectedCompany: Company;
  setSelectedScope: (scope: ViewingScope) => void;
  setSelectedCompanyId: (id: ViewingScope) => void;
  users: UserProfile[];
  currentUser: UserProfile;
  setCurrentUserId: (id: string) => void;
  updateUserSignature: (userId: string, signatureDataUrl?: string, signatureStyleText?: string) => Promise<void>;
  requests: RequestRecord[];
  refreshRequests: () => Promise<void>;
  companyRequests: RequestRecord[];
  workflows: WorkflowConfig[];
  currentWorkflow: WorkflowConfig;
  saveWorkflow: (updated: WorkflowConfig) => Promise<WorkflowConfig>;
  
  // Navigation
  activeView:
    | 'dashboard'
    | 'create-request'
    | 'review-sign'
    | 'requests'
    | 'workflow-settings'
    | 'user-profile'
    | 'user-directory'
    | 'company-branding'
    | 'forms-library'
    | 'archive';
  setActiveView: (
    view:
      | 'dashboard'
      | 'create-request'
      | 'review-sign'
      | 'requests'
      | 'workflow-settings'
      | 'user-profile'
      | 'user-directory'
      | 'company-branding'
      | 'forms-library'
      | 'archive'
  ) => void;
  isMobileSidebarOpen: boolean;
  setIsMobileSidebarOpen: (open: boolean) => void;
  requestsFilter: 'pending' | 'my' | 'all' | 'approved';
  setRequestsFilter: (filter: 'pending' | 'my' | 'all' | 'approved') => void;
  selectedRequestId: string | null;
  openReviewRequest: (requestId: string) => void;
  selectedRequestFormType: string;
  setSelectedRequestFormType: (formType: string) => void;
  
  // Draft persistence via repository
  draftFormData: AdminWorkDraft | null;
  draftReady: boolean;
  draftError: string | null;
  retryDraft: () => void;
  saveDraft: (data: AdminWorkDraft, retry?: boolean) => Promise<void>;
  draftCompanyId: CompanyId | null;
  selectDraftCompany: (company: CompanyId) => void;
  reloadDraft: () => void;
  clearDraft: () => Promise<void>;
  
  // Workflow actions
  submitNewRequest: (
    formData: AdminWorkFormData,
    attachments?: AttachmentItem[],
    comment?: string,
    signatureDataUrl?: string,
    signerChoices?: SubmitInput['signerChoices']
  ) => Promise<{ success: boolean; newId?: string; error?: string; routeChanged?: boolean }>;
  approveRequest: (
    requestId: string,
    comment?: string,
    signatureDataUrl?: string
  ) => Promise<{ success: boolean; error?: string }>;
  returnRequest: (
    requestId: string,
    reason: string
  ) => Promise<{ success: boolean; error?: string }>;
  resubmitRequest: (
    requestId: string,
    formData: AdminWorkFormData,
    changeNote?: string,
    signatureDataUrl?: string,
    attachments?: AttachmentItem[]
  ) => Promise<{ success: boolean; error?: string }>;
  rejectRequestAction: (
    requestId: string,
    reason: string
  ) => Promise<{ success: boolean; error?: string }>;
  replaceSigner: (id: string, stageId: string, newUserId: string, reason: string) => Promise<{ success: boolean; error?: string }>;
  acceptReplacement: (id: string, accept: boolean) => Promise<{ success: boolean; error?: string }>;
  readLatestRoute: (id: string) => Promise<RequestRecord | null>;
  downloadDocumentPdf?: (id: string, version: number, updatedAt: string) => Promise<Blob>;
  cancelRoute: (id: string, reason: string) => Promise<{ success: boolean; error?: string }>;
  recordRouteProcessing: (id: string, action: import('../utils/routeProcessing').ProcessingCommand, note: string, signatureDataUrl?: string, attachment?: AttachmentItem) => Promise<{ success: boolean; error?: string }>;
  directorOverrideAction: (
    requestId: string,
    reason: string,
    signatureDataUrl?: string
  ) => Promise<{ success: boolean; error?: string }>;
  
  // Reset
  resetDemoData: () => void;
}

const AppContext = createContext<AppContextType | undefined>(undefined);

export const AppProvider: React.FC<{ children: React.ReactNode; apiData?: { bootstrap: BootstrapData; requests: VersionedRequest[] }; apiRepository?: ApiPreciSignRepository }> = ({ children, apiData, apiRepository }) => {
  const readOnly = Boolean(apiData);
  const [companies, setCompanies] = useState<Company[]>(apiData?.bootstrap.companies || []);
  const [selectedScope, setSelectedScopeState] = useState<ViewingScope>(apiData ? (apiData.bootstrap.companies.find(c => c.id === apiData.bootstrap.user.companyId)?.id || apiData.bootstrap.companies[0]?.id || 'PEG') : 'PEW');
  const [users, setUsers] = useState<UserProfile[]>(apiData ? [apiData.bootstrap.user, ...apiData.bootstrap.users.filter(u => u.id !== apiData.bootstrap.user.id)] : []);
  const [currentUserId, setCurrentUserIdState] = useState<string>(apiData?.bootstrap.user.id || 'user-afzal');
  const [workflows, setWorkflows] = useState<WorkflowConfig[]>(apiData?.bootstrap.workflows || []);
  const [requests, setRequests] = useState<RequestRecord[]>(apiData?.requests || []);
  const [draftFormData, setDraftFormData] = useState<AdminWorkDraft | null>(null);
  const [loadedDraftKey, setLoadedDraftKey] = useState('');
  const [draftError, setDraftError] = useState<string | null>(null);
  const [draftRetry, setDraftRetry] = useState(0);
  const draftWrites = useRef(new Map<string, Promise<void>>());
  const draftCoordinator = useMemo(() => apiRepository ? new DraftCoordinator(apiRepository) : null, [apiRepository]);
  const [groupDraftCompany, setGroupDraftCompany] = useState<CompanyId | null>(null);
  const reloadDraftKeys = useRef(new Set<string>());
  const [initialLoaded, setInitialLoaded] = useState(readOnly);
  const [initialError, setInitialError] = useState<string | null>(null);

  const [activeView, setActiveView] = useState<
    | 'dashboard'
    | 'create-request'
    | 'review-sign'
    | 'requests'
    | 'workflow-settings'
    | 'user-profile'
    | 'user-directory'
    | 'company-branding'
    | 'forms-library'
    | 'archive'
  >('dashboard');
  const [isMobileSidebarOpen, setIsMobileSidebarOpen] = useState(false);
  const [requestsFilter, setRequestsFilter] = useState<'pending' | 'my' | 'all' | 'approved'>('pending');

  const [selectedRequestId, setSelectedRequestId] = useState<string | null>('PEW-AW-2026-0018');
  const [selectedRequestFormType, setSelectedRequestFormType] = useState<string>('Admin Work Request');
  useEffect(() => { if (selectedScope === 'PEG') setGroupDraftCompany(null); }, [selectedRequestFormType, selectedScope]);

  // The directory reads live grants. Refresh the workspace snapshot on browsing
  // screens so those same grants drive form visibility without a new sign-in.
  useEffect(() => {
    if (!apiRepository || !['dashboard', 'requests', 'archive', 'forms-library', 'create-request'].includes(activeView)) return;
    let cancelled = false;
    let pending = false;
    async function refreshAccess() {
      if (pending || !apiRepository) return;
      pending = true;
      try {
        const snapshot = await apiRepository.bootstrap();
        if (cancelled || snapshot.user.id !== currentUserId) return;
        const roster = [snapshot.user, ...snapshot.users.filter(user => user.id !== currentUserId)];
        setUsers(previous => JSON.stringify(previous) === JSON.stringify(roster) ? previous : roster);
        setCompanies(previous => JSON.stringify(previous) === JSON.stringify(snapshot.companies) ? previous : snapshot.companies);
        setWorkflows(previous => JSON.stringify(previous) === JSON.stringify(snapshot.workflows) ? previous : snapshot.workflows);
        setSelectedScopeState(scope => scope === 'PEG' || snapshot.companies.some(company => company.id === scope)
          ? scope : snapshot.companies[0]?.id ?? 'PEG');
      } catch {
        // Retain the current view through transient failures. The API still checks every action.
      } finally {
        pending = false;
      }
    }
    void refreshAccess();
    const timer = window.setInterval(refreshAccess, 30000);
    window.addEventListener('focus', refreshAccess);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
      window.removeEventListener('focus', refreshAccess);
    };
  }, [activeView, apiRepository, currentUserId]);

  // Load initial data through repository abstraction
  useEffect(() => {
    if (readOnly) return;
    let mounted = true;
    async function loadInitialData() {
      const [allCompanies, allUsers, allWorkflows, allRequests, session] = await Promise.all([
        dataService.getCompanies(),
        dataService.getUsers(),
        dataService.getWorkflows(),
        dataService.getRequests(),
        dataService.getDemoSession(),
      ]);

      if (!mounted) return;
      setCompanies(allCompanies);
      setUsers(allUsers);
      setWorkflows(allWorkflows);
      setRequests(allRequests);
      setSelectedScopeState(session.companyId || 'PEW');
      setCurrentUserIdState(session.userId);

      setInitialLoaded(true);
    }
    loadInitialData().catch(() => { if (mounted) setInitialError('Could not load application data. Check browser storage and reload.'); });
    return () => {
      mounted = false;
    };
  }, []);

  const draftCompanyId = readOnly && companies.length === 0 ? null : selectedScope === 'PEG' ? groupDraftCompany : selectedScope;
  const draftKey = `${apiRepository ? draftCompanyId : selectedScope}:${currentUserId}`;
  const activeDraftKey = useRef(draftKey);
  activeDraftKey.current = draftKey;
  useEffect(() => {
    if (!initialLoaded) return;
    let cancelled = false;
    setLoadedDraftKey('');
    setDraftError(null);
    const draftUser = users.find(user => user.id === currentUserId);
    if (draftCoordinator && (!draftCompanyId || !draftUser || !canUserStartForm(draftUser, draftCompanyId, 'Admin Work Request'))) return;
    const force = reloadDraftKeys.current.delete(draftKey);
    const loading = draftCoordinator
      ? draftCoordinator.load(draftCompanyId!, currentUserId, force)
      : (draftWrites.current.get(draftKey) || Promise.resolve()).catch(() => {}).then(() => dataService.getDraft(selectedScope, currentUserId, 'Admin Work Request'));
    loading.then((draft) => {
      if (!cancelled) { setDraftFormData(draft); setLoadedDraftKey(draftKey); }
    }).catch(() => { if (!cancelled) setDraftError('Could not load your draft. Your saved data was not changed.'); });
    return () => { cancelled = true; };
  }, [initialLoaded, selectedScope, currentUserId, draftRetry, draftCompanyId, draftCoordinator, users]);

  const setSelectedScope = (scope: ViewingScope) => {
    setSelectedScopeState(scope);
    if (scope === 'PEG') setGroupDraftCompany(null);
    if (!readOnly) void dataService.saveDemoSession(scope, currentUserId).catch(console.error);

  };

  const setSelectedCompanyId = (id: ViewingScope) => {
    setSelectedScope(id);
  };

  const setCurrentUserId = (id: string) => {
    if (readOnly) return;
    setCurrentUserIdState(id);
    void dataService.saveDemoSession(selectedScope, id).catch(console.error);

  };

  const updateUserSignature = async (
    userId: string,
    signatureDataUrl?: string,
    signatureStyleText?: string
  ) => {
    if (userId !== currentUserId) throw new Error('Only your own signature can be updated.');
    const updated = await (apiRepository || dataService).updateUserSignature(userId, signatureDataUrl, signatureStyleText);
    setUsers((prev) => prev.map((u) => (u.id === userId ? updated : u)));
  };

  const currentUser = users.find((u) => u.id === currentUserId) || users[0] || {
    id: 'user-afzal',
    name: 'Afzal Kazi',
    email: 'afzal.kazi@precision-eg.com',
    role: 'Director' as const,
    department: 'Management',
    initials: 'AK',
    avatarColor: '#6366f1',
    companyId: 'PEW' as CompanyId,
  };

  const selectedCompany: Company = selectedScope === PARENT_ORGANIZATION_ID
    ? {
        id: 'PEW' as CompanyId, // Primary reference for group view
        code: 'PEG',
        name: 'Precision Engineering Group',
        fullName: 'PRECISION ENGINEERING GROUP (Group View)',
        groupName: 'PRECISION ENGINEERING GROUP',
      }
    : companies.find((c) => c.id === selectedScope) || companies[0] || {
        id: 'PEW' as CompanyId,
        code: 'PEW',
        name: 'Precision Engineering Works',
        fullName: 'PEW - Precision Engineering Works',
        groupName: 'PRECISION ENGINEERING GROUP',
      };

  // Filter requests according to Viewing Scope and User Authorization
  const companyRequests = filterRequestsByScopeAndUser(requests, selectedScope, currentUser).filter(request => canReadPreciRoute(currentUser,request));

  // Active workflow for Admin Work Request in current scope (or PEW fallback if in Group View)
  const targetCompanyIdForWf = selectedScope === PARENT_ORGANIZATION_ID ? 'PEW' : (selectedScope as CompanyId);
  const currentWorkflow =
    workflows.find((w) => w.companyId === targetCompanyIdForWf && w.formType === 'Admin Work Request') ||
    workflows[0] || {
      id: 'wf-pew-admin-work',
      formType: 'Admin Work Request',
      companyId: targetCompanyIdForWf,
      version: 1,
      stages: [],
      preventSelfApproval: true,
      allowDirectorOverride: true,
      reminderDays: 2,
      escalationDays: 5,
      rejectionBehavior: 'archive' as const,
      returnBehavior: 'restart_workflow' as const,
    };

  const saveWorkflow = async (updated: WorkflowConfig) => {
    const saved = await (apiRepository || dataService).saveWorkflow(updated);
    setWorkflows((prev) => [...prev.filter((w) => !(w.companyId === saved.companyId && w.formType === saved.formType)), saved]);
    return saved;
  };

  const saveDraft = async (data: AdminWorkDraft, retry = false) => {
    if (draftCoordinator) {
      if (!draftCompanyId || loadedDraftKey !== draftKey) throw new Error('Select a company and load its draft first.');
      await draftCoordinator.save(draftCompanyId, currentUserId, data, retry);
      if (activeDraftKey.current === draftKey) setDraftFormData(data);
      return;
    }
    const key = `${selectedScope}:${currentUser.id}`;
    const previous = draftWrites.current.get(key) || Promise.resolve();
    const write = previous.catch(() => {}).then(() => dataService.saveDraft(selectedScope, currentUser.id, 'Admin Work Request', data));
    draftWrites.current.set(key, write);
    await write;
    if (activeDraftKey.current === key) setDraftFormData(data);
  };

  const clearDraft = async () => {
    if (draftCoordinator) {
      if (!draftCompanyId) throw new Error('Select a company first.');
      await draftCoordinator.clear(draftCompanyId, currentUserId);
      if (activeDraftKey.current === draftKey) setDraftFormData(null);
      return;
    }
    const key = `${selectedScope}:${currentUser.id}`;
    await (draftWrites.current.get(key) || Promise.resolve()).catch(() => {});
    await dataService.clearDraft(selectedScope, currentUser.id, 'Admin Work Request');
    if (activeDraftKey.current === key) setDraftFormData(null);
  };

  const openReviewRequest = (requestId: string) => {
    setSelectedRequestId(requestId);
    setActiveView('review-sign');
  };
  const refreshRequests = async () => {
    const latest = await (apiRepository || dataService).getRequests();
    setRequests(latest);
  };

  // Refresh when returning to an inbox; never replace an editor while typing.
  useEffect(() => {
    if (!apiRepository || !['dashboard', 'requests', 'archive'].includes(activeView)) return;
    let cancelled = false;
    void apiRepository.getRequests().then(latest => { if (!cancelled) setRequests(latest); }).catch(() => {});
    return () => { cancelled = true; };
  }, [activeView, apiRepository]);

  // Demo actions use the same intent contract as the API adapter.
  const actionRepository = useMemo(() => apiRepository || new LocalActionRepository(currentUserId), [currentUserId, apiRepository]);
  const actionFailure = (error: unknown) => ({ success: false, error: error instanceof Error ? error.message : 'Could not save request.' });
  const submitNewRequest = async (formData: AdminWorkFormData, attachments: AttachmentItem[] = [], comment?: string, signatureDataUrl?: string, signerChoices?: SubmitInput['signerChoices']) => {
    const validation = validateOriginatingCompany(selectedScope, formData.companyId, currentUser.companyId);
    if (!validation.isValid || !validation.companyId) return { success: false, error: validation.error };
    try {
      const formType = formData.cashVoucher ? 'Cash Voucher'
        : formData.expenseClaim ? 'Expense Claim'
        : formData.itRequest ? 'IT Request'
        : formData.administrativePayment ? 'Administrative & Payment Request' : 'Admin Work Request';
      const legacy = formType === 'Admin Work Request';
      const workflow = workflows.find(route => route.companyId === validation.companyId && route.formType === formType);
      if (apiRepository && !canUserStartForm(currentUser, validation.companyId, formType)) {
        return { success: false, error: 'You don’t have access to start this form in the selected company.' };
      }
      if (apiRepository && !workflow?.stages.length) {
        return { success: false, error: 'A signing route must be configured for this company and form before sending.' };
      }
      const input: SubmitInput = { companyId: validation.companyId, formType,
        signerChoices,
        expectedWorkflowVersion: legacy ? undefined : workflow?.version,
        formData: { dateOfRequest: formData.dateOfRequest, department: formData.department, priority: formData.priority, workDescription: formData.workDescription, documents: formData.documents, administrativePayment: formData.administrativePayment, itRequest: formData.itRequest, cashVoucher: formData.cashVoucher, expenseClaim: formData.expenseClaim },
        attachments, comment, signatureDataUrl: signatureDataUrl || '' };
      const record = draftCoordinator && legacy
        ? await draftCoordinator.submit(validation.companyId, currentUserId, input)
        : await actionRepository.submit(input);
      setRequests(prev => [record, ...prev]);
      if (legacy) {
        if (draftCoordinator) { if (activeDraftKey.current === draftKey) setDraftFormData(null); }
        else try { await clearDraft(); } catch (error) { console.error('Request saved but draft could not be cleared:', error); }
      }
      return { success: true, newId: record.id };
    } catch (error) {
      if ((formData.administrativePayment || formData.itRequest || formData.cashVoucher || formData.expenseClaim) && error instanceof ApiError && error.status === 409) {
        try {
          const [latestWorkflows, latestUsers] = await Promise.all([actionRepository.getWorkflows(), actionRepository.getUsers()]);
          setWorkflows(latestWorkflows);
          setUsers(latestUsers);
          return { ...actionFailure(error), routeChanged: true };
        } catch {
          return { success: false, routeChanged: true, error: 'The route changed and could not be refreshed. Your entries are still here. Check your connection and try again.' };
        }
      }
      return actionFailure(error);
    }
  };
  const revisionOf = (id: string) => (requests.find(r => r.id === id) as VersionedRequest | undefined)?.revision ?? 1;
  const pendingActions = useRef(new Set<string>());
  const runAction = async (id: string, work: () => Promise<VersionedRequest>) => {
    if (pendingActions.current.has(id)) return { success: false, error: 'A save is already in progress. Please wait.' };
    pendingActions.current.add(id);
    try {
      const record = await work();
      setRequests(prev => prev.map(r => r.id === record.id ? record : r));
      return { success: true };
    } catch (error) {
      if (error instanceof ApiError && error.status === 409) {
        try {
          const latest = await actionRepository.getRequestById(id);
          if (latest) setRequests(prev => prev.map(r => r.id === id ? latest : r));
          return { success: false, error: 'This request changed in another session. The latest version is now loaded. Your entries are preserved. Cancel this dialog to review the latest stage and document before confirming again.' };
        } catch {
          return { success: false, error: 'This request changed in another session, but the latest version could not be loaded. Your entries are preserved. Check the connection and try again; no action was retried.' };
        }
      }
      return actionFailure(error);
    } finally { pendingActions.current.delete(id); }
  };
  const approveRequest = (id: string, comment?: string, signatureDataUrl?: string) => runAction(id, () => actionRepository.approve(id, { expectedRevision: revisionOf(id), comment, signatureDataUrl: signatureDataUrl || '' }));
  const returnRequest = (id: string, reason: string) => runAction(id, () => actionRepository.returnForCorrection(id, { expectedRevision: revisionOf(id), reason }));
  const rejectRequestAction = (id: string, reason: string) => runAction(id, () => actionRepository.reject(id, { expectedRevision: revisionOf(id), reason }));
  const resubmitRequest = (id: string, formData: AdminWorkFormData, changeNote?: string, signatureDataUrl?: string, attachments?: AttachmentItem[]) => runAction(id, () => actionRepository.resubmit(id, {
    expectedRevision: revisionOf(id), formData: {
      dateOfRequest: formData.dateOfRequest, department: formData.department, priority: formData.priority,
      workDescription: formData.workDescription, documents: formData.documents, itRequest: formData.itRequest,
      administrativePayment: formData.administrativePayment && {
        documentDescription: formData.administrativePayment.documentDescription, payment: formData.administrativePayment.payment,
      },
      expenseClaim: formData.expenseClaim && {
        designation: formData.expenseClaim.designation, project: formData.expenseClaim.project, lines: formData.expenseClaim.lines,
      },
    }, changeNote, signatureDataUrl: signatureDataUrl || '', attachments,
  }));
  const readLatestRoute = (id: string) => actionRepository.getRequestById(id);
  const replaceSigner = (id: string, stageId: string, newUserId: string, reason: string) => runAction(id, () => actionRepository.replaceSigner(id,{ expectedRevision: revisionOf(id), stageId, newUserId, reason }));
  const acceptReplacement = (id: string, accept: boolean) => runAction(id, () => actionRepository.acceptReplacement(id,{ expectedRevision: revisionOf(id), accept }));
  const cancelRoute = (id: string, reason: string) => runAction(id, () => actionRepository.cancel(id, { expectedRevision: revisionOf(id), reason }));
  const recordRouteProcessing: AppContextType['recordRouteProcessing'] = (id, action, note, signatureDataUrl, attachment) => runAction(id, () => actionRepository.recordProcessing(id, { expectedRevision: revisionOf(id), action, note, signatureDataUrl, attachment }));
  const directorOverrideAction = (id: string, reason: string, signatureDataUrl?: string) => runAction(id, () => actionRepository.override(id, { expectedRevision: revisionOf(id), reason, signatureDataUrl: signatureDataUrl || '' }));

  const resetDemoData = async () => {
    if (readOnly) return;
    await dataService.resetToSeedData();
    const [allCompanies, allUsers, allWorkflows, allRequests] = await Promise.all([
      dataService.getCompanies(),
      dataService.getUsers(),
      dataService.getWorkflows(),
      dataService.getRequests(),
    ]);
    setRequests(allRequests);
    setWorkflows(allWorkflows);
    setUsers(allUsers);
    setCompanies(allCompanies);
    setSelectedScopeState('PEW');
    setCurrentUserIdState('user-afzal');
    setDraftFormData(null);
  };

  if (initialError) return <div className="p-6 text-sm" role="alert">{initialError}</div>;

  return (
    <AppContext.Provider
      value={{
        readOnly,
        companies,
        selectedScope,
        selectedCompanyId: selectedScope,
        selectedCompany,
        setSelectedScope,
        setSelectedCompanyId: setSelectedScope,
        users,
        currentUser,
        setCurrentUserId,
        updateUserSignature,
        requests,
        refreshRequests,
        companyRequests,
        workflows,
        currentWorkflow,
        saveWorkflow,
        activeView,
        setActiveView,
        isMobileSidebarOpen,
        setIsMobileSidebarOpen,
        requestsFilter,
        setRequestsFilter,
        selectedRequestId,
        openReviewRequest,
        selectedRequestFormType,
        setSelectedRequestFormType,
        draftFormData,
        draftCompanyId,
        selectDraftCompany: (company) => { if (selectedScope === 'PEG') setGroupDraftCompany(company); else setSelectedScope(company); },
        reloadDraft: () => { reloadDraftKeys.current.add(draftKey); setLoadedDraftKey(''); setDraftRetry(value => value + 1); },
        draftReady: initialLoaded && loadedDraftKey === draftKey,
        draftError,
        retryDraft: () => setDraftRetry(value => value + 1),
        saveDraft,
        clearDraft,
        submitNewRequest,
        approveRequest,
        returnRequest,
        resubmitRequest,
        rejectRequestAction,
        directorOverrideAction,
        cancelRoute,
        recordRouteProcessing,
        replaceSigner,
        acceptReplacement,
        readLatestRoute,
        downloadDocumentPdf: apiRepository
          ? (id, version, updatedAt) => apiRepository.downloadDocumentPdf(id, version, updatedAt)
          : async (id, version, updatedAt) => {
              const record = await actionRepository.getRequestById(id);
              if (!record || !canReadPreciRoute(currentUser, record) || record.updatedAt !== updatedAt) throw new Error('The route changed or is unavailable. Reload and review before downloading.');
              const { createDemoDocumentPdf } = await import('../components/document/downloadDemoPdf');
              const pdf = await createDemoDocumentPdf(record, version);
              const latest = await actionRepository.getRequestById(id);
              if (!latest || !canReadPreciRoute(currentUser, latest) || latest.updatedAt !== updatedAt) throw new Error('The route changed or is unavailable. Reload and review before downloading.');
              return pdf;
            },
        resetDemoData,
      }}
    >
      {children}
    </AppContext.Provider>
  );
};

export const useApp = () => {
  const context = useContext(AppContext);
  if (!context) {
    throw new Error('useApp must be used within an AppProvider');
  }
  return context;
};
