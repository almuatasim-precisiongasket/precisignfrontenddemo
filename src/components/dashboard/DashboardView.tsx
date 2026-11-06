import { getInitials } from '../../utils/approvalJourney';
import { needsMyAction } from '../../utils/actionQueue';
import { needsProcessingAction } from '../../utils/routeProcessing';
import React, { useState, useMemo } from 'react';
import { useApp } from '../../context/AppContext';
import { RequestRecord, PriorityLevel } from '../../types/index';
import {
  Inbox,
  FileText,
  AlertTriangle,
  RotateCcw,
  CheckCircle2,
  Search,
  SlidersHorizontal,
  ChevronDown,
  RefreshCw,
  Plus,
  ArrowRight,
  ExternalLink,
  Clock,
  Check,
  Building,
  ChevronRight,
  LayoutGrid,
  Zap,
  BarChart3,
} from 'lucide-react';
import { companyForms } from '../library/FormsLibraryView';
import { canUserStartForm } from '../../utils/companyAccess';
import { CompactApprovalChain } from '../common/CompactApprovalChain';
import { ApprovalJourneyModal } from '../common/ApprovalJourneyModal';
import { ApprovalJourneyPanel } from '../journey/ApprovalJourneyPanel';

export const DashboardView: React.FC = () => {
  const {
    activeView,
    currentUser,
    draftFormData,
    readOnly: connected,
    refreshRequests,
    companyRequests,
    selectedCompany,
    selectedScope,
    companies,
    setActiveView,
    requestsFilter,
    setRequestsFilter,
    openReviewRequest,
    setSelectedRequestFormType,
  } = useApp();
  const formShortcuts = companyForms.filter(form => !connected || companies.some(company =>
    (selectedScope === 'PEG' || selectedScope === company.id) && canUserStartForm(currentUser, company.id, form.name)));

  const [searchQuery, setSearchQuery] = useState('');
  const [formFilter,setFormFilter] = useState('ALL');
  const [statusFilter,setStatusFilter] = useState('ALL');
  const hasFilters = Boolean(searchQuery.trim()) || formFilter !== 'ALL' || statusFilter !== 'ALL';
  const [refreshError, setRefreshError] = useState('');
  const [refreshing, setRefreshing] = useState(false);
  const [expandedRowId, setExpandedRowId] = useState<string | null>(null);
  const [showColumnsMenu, setShowColumnsMenu] = useState(false);
  const [sortBy, setSortBy] = useState<'date-desc' | 'date-asc' | 'priority' | 'id'>('date-desc');
  const [selectedJourneyRequest, setSelectedJourneyRequest] = useState<RequestRecord | null>(null);
  const [internalTab, setInternalTab] = useState<'pending' | 'my' | 'all' | 'returned' | 'approved'>(
    activeView === 'dashboard' ? 'all' : requestsFilter === 'pending'
      ? 'pending'
      : requestsFilter === 'my'
      ? 'my'
      : requestsFilter === 'approved'
      ? 'approved'
      : 'all'
  );

  // Column visibility state
  const [visibleColumns, setVisibleColumns] = useState({
    id: true,
    requester: true,
    currentApprover: true,
    prioritySla: false,
    status: true,
    createdAt: false,
  });

  // Calculate dynamic KPIs from shared company requests
  const pendingForMeRequests = useMemo(() => {
    return companyRequests.filter(
      (r) => needsMyAction(r, currentUser)
    );
  }, [companyRequests, currentUser]);

  function actionFor(request: RequestRecord) {
    if (request.status === 'Returned for Correction' && request.requesterId === currentUser.id) {
      return { title: 'A request needs your corrections', label: 'Review correction' };
    }
    if (needsProcessingAction(request, currentUser)) {
      return { title: 'A request needs processing', label: 'Process request' };
    }
    if (request.pendingReplacement?.newUserId === currentUser.id && request.status === 'Pending Approval') {
      return { title: 'An assignment needs your response', label: 'Respond to assignment' };
    }
    if (needsMyAction(request, currentUser)) {
      return { title: 'A route needs your signature', label: 'Review & sign' };
    }
    return { title: request.formType, label: 'View details' };
  }

  const returnedRequests = useMemo(() => {
    return companyRequests.filter((r) => r.status === 'Returned for Correction');
  }, [companyRequests]);

  const approvedRequests = useMemo(() => {
    return companyRequests.filter((r) => r.status === 'Approved');
  }, [companyRequests]);

  const myRequests = useMemo(() => {
    return companyRequests.filter((r) => r.requesterId === currentUser.id);
  }, [companyRequests, currentUser]);

  // Keep internal tab in sync if sidebar filter changed
  React.useEffect(() => {
    if (activeView === 'dashboard') return;
    if (requestsFilter === 'pending') setInternalTab('pending');
    else if (requestsFilter === 'my') setInternalTab('my');
    else if (requestsFilter === 'approved') setInternalTab('approved');
    else if (requestsFilter === 'all') setInternalTab('all');
  }, [activeView, requestsFilter]);

  function selectTab(tab: typeof internalTab) {
    setInternalTab(tab);
    if (activeView === 'requests' && tab !== 'returned') setRequestsFilter(tab);
  }

  // Filter & sort requests for the operational table
  const filteredRequests = useMemo(() => {
    let list: RequestRecord[] = [];
    if (internalTab === 'pending') {
      list = pendingForMeRequests;
    } else if (internalTab === 'my') {
      list = myRequests;
    } else if (internalTab === 'returned') {
      list = returnedRequests;
    } else if (internalTab === 'approved') {
      list = approvedRequests;
    } else {
      list = companyRequests;
    }

    list = list.filter(r => (formFilter === 'ALL' || r.formType === formFilter) && (statusFilter === 'ALL' || r.status === statusFilter));
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      list = list.filter(
        (r) =>
          r.id.toLowerCase().includes(q) ||
          r.formType.toLowerCase().includes(q) ||
          r.requesterName.toLowerCase().includes(q) ||
          r.title.toLowerCase().includes(q) ||
          r.formData.workDescription.toLowerCase().includes(q) ||
          (r.currentApproverName && r.currentApproverName.toLowerCase().includes(q))
      );
    }

    // Sort list
    const sorted = [...list];
    if (sortBy === 'date-desc') {
      sorted.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
    } else if (sortBy === 'date-asc') {
      sorted.sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());
    } else if (sortBy === 'priority') {
      const order: Record<PriorityLevel, number> = { Urgent: 0, Medium: 1, Low: 2 };
      sorted.sort((a, b) => order[a.formData.priority] - order[b.formData.priority]);
    } else if (sortBy === 'id') {
      sorted.sort((a, b) => a.id.localeCompare(b.id));
    }

    return sorted;
  }, [internalTab, pendingForMeRequests, myRequests, returnedRequests, approvedRequests, companyRequests, searchQuery, sortBy, formFilter, statusFilter]);

  const isRecentView = activeView === 'dashboard' && internalTab === 'all' && !hasFilters && sortBy === 'date-desc';
  const displayedRequests = isRecentView ? filteredRequests.slice(0, 5) : filteredRequests;

  const getSlaDescription = (priority: PriorityLevel) => {
    switch (priority) {
      case 'Urgent':
        return '< 1 hr (Immediate)';
      case 'Medium':
        return '3 business days';
      case 'Low':
        return '7 business days';
      default:
        return 'Standard';
    }
  };

  return (
    <div className="p-3.5 sm:p-6 space-y-5 max-w-[1720px] mx-auto">
      {/* Top Section: Operational Status & Primary Action */}
      <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
        <div>
          <p className="preci-eyebrow mb-1.5">Inbox</p>
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="text-2xl font-bold tracking-tight text-workspace-ink sm:text-3xl">
              {activeView === 'dashboard' ? `Welcome back, ${currentUser.name.trim().split(/\s+/)[0]} 👋` : 'Requests and approvals'}
            </h1>
          </div>
          <p className="mt-1.5 text-sm text-workspace-muted">
            Create, review and track company forms in one place.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2 sm:justify-end">
          {connected && <button type="button" disabled={refreshing} className="workspace-control inline-flex min-h-10 items-center gap-2 px-3 text-xs font-semibold" onClick={async () => {
            setRefreshing(true); setRefreshError('');
            try { await refreshRequests(); } catch { setRefreshError('Could not refresh requests. Your current list is retained. Please retry.'); }
            finally { setRefreshing(false); }
          }}><RefreshCw aria-hidden="true" className={`size-4 text-workspace-steel ${refreshing ? 'motion-safe:animate-spin' : ''}`} />{refreshing ? 'Refreshing…' : 'Refresh requests'}</button>}
          <button type="button" onClick={() => setActiveView('forms-library')}
            className="workspace-primary preci-press inline-flex min-h-11 items-center justify-center gap-2 whitespace-nowrap bg-linear-to-r from-[#00657a] to-[#087b79] px-5 text-sm shadow-sm">
            <Plus aria-hidden="true" className="size-4" />
            New PreciRoute
          </button>
        </div>
      </div>

      {refreshError && <p role="alert" className="text-xs text-rose-700">{refreshError}</p>}
      <section aria-label="Request summary" className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {([
          ['Needs my action', pendingForMeRequests.length, 'pending', Inbox, 'inbox'],
          ['My requests', myRequests.length, 'my', FileText, 'open'],
          ['Returned requests', returnedRequests.length, 'returned', RotateCcw, 'returned'],
          ['Signing completed', approvedRequests.length, 'approved', CheckCircle2, 'complete'],
        ] as const).map(([label, count, tab, Icon, tone]) => (
          <button type="button" key={tab} aria-pressed={internalTab === tab}
            onClick={() => selectTab(tab)}
            className="inbox-stat preci-press flex min-w-0 items-center gap-2 rounded-xl border p-2.5 text-left focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-workspace-steel sm:gap-3 sm:p-3"
            data-tone={tone}>
            <span className="inbox-stat-icon grid size-8 shrink-0 place-items-center rounded-lg sm:size-12">
              <Icon aria-hidden="true" className="size-4 sm:size-5" />
            </span>
            <span className="relative min-w-0 flex-1 text-workspace-ink">
              <span className="block text-xs font-semibold sm:text-sm">{label}</span>
              <strong className="block text-2xl leading-tight font-bold tabular-nums sm:text-3xl">{count}</strong>
            </span>
            <ChevronRight aria-hidden="true" className="relative hidden size-4 shrink-0 sm:block" />
          </button>
        ))}
      </section>

      <section aria-labelledby="dashboard-forms-heading" className="min-w-0">
        <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
          <h2 id="dashboard-forms-heading" className="text-base font-bold text-workspace-ink">Company forms</h2>
          <button type="button" onClick={() => setActiveView('forms-library')} className="preci-link inline-flex items-center gap-2 py-1">
            <LayoutGrid aria-hidden="true" className="size-4" /> Forms library <ArrowRight aria-hidden="true" className="size-4" />
          </button>
        </div>
        {formShortcuts.length ? <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
            {formShortcuts.map(({ name, department, icon: Icon }) => (
              <button type="button" key={name} className="workspace-control preci-press flex min-h-16 items-center gap-3 p-3 text-left text-sm font-semibold shadow-sm"
                onClick={() => { setSelectedRequestFormType(name); setActiveView('create-request'); }}>
                <span className="grid size-9 shrink-0 place-items-center rounded-lg bg-workspace-tint text-workspace-teal"><Icon aria-hidden="true" className="size-5" /></span>
                <span className="min-w-0 flex-1 leading-tight">{name}<span className="mt-1 block text-xs font-normal text-workspace-muted">{department}</span></span>
                <ChevronRight aria-hidden="true" className="size-4 shrink-0 text-workspace-muted" />
              </button>
            ))}
          </div> : <p className="workspace-panel p-4 text-sm text-workspace-muted">No forms are assigned in this view. Switch company or ask your account administrator for form access.</p>}
      </section>
      {draftFormData && <button type="button" className="workspace-control min-h-9 px-3 text-sm font-semibold"
        onClick={() => { setSelectedRequestFormType('Admin Work Request'); setActiveView('create-request'); }}>Resume Admin Work Request draft →</button>}
      <div className="grid min-w-0 items-start gap-4 min-[1560px]:grid-cols-[minmax(0,1fr)_210px]">
      {/* Main Operational Table Container */}
      <div className="workspace-panel min-w-0" aria-label="Recent requests">
        {/* Table Controls Bar: Operational Filter Tabs + Search + Sort + Columns */}
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-t-xl border-b border-workspace-line px-3 py-3">
          {/* Segmented Filter Tabs */}
          <div role="group" aria-label="Request views" className="flex max-w-full items-center gap-1 overflow-x-auto rounded-lg bg-workspace p-1 [&_button:focus-visible]:outline-2 [&_button:focus-visible]:-outline-offset-2 [&_button:focus-visible]:outline-workspace-steel">
            <button
              aria-pressed={internalTab === 'all'}
              onClick={() => selectTab('all')}
              className={`px-3 py-1.5 text-xs font-semibold rounded-md transition-colors whitespace-nowrap shrink-0 ${
                internalTab === 'all'
                  ? 'bg-[#12374d] text-white shadow-xs'
                  : 'text-slate-600 hover:text-slate-900 hover:bg-slate-200/60'
              }`}
            >
              {activeView === 'dashboard' ? 'Recent requests' : 'All routes'} ({companyRequests.length})
            </button>
            <button
              aria-pressed={internalTab === 'pending'}
              onClick={() => selectTab('pending')}
              className={`px-3 py-1.5 text-xs font-semibold rounded-md transition-colors whitespace-nowrap shrink-0 ${
                internalTab === 'pending'
                  ? 'bg-[#12374d] text-white shadow-xs'
                  : 'text-slate-600 hover:text-slate-900 hover:bg-slate-200/60'
              }`}
            >
              Needs my action ({pendingForMeRequests.length})
            </button>
            <button
              aria-pressed={internalTab === 'my'}
              onClick={() => selectTab('my')}
              className={`px-3 py-1.5 text-xs font-semibold rounded-md transition-colors whitespace-nowrap shrink-0 ${
                internalTab === 'my'
                  ? 'bg-[#12374d] text-white shadow-xs'
                  : 'text-slate-600 hover:text-slate-900 hover:bg-slate-200/60'
              }`}
            >
              My Requests ({myRequests.length})
            </button>
            <button
              aria-pressed={internalTab === 'returned'}
              onClick={() => setInternalTab('returned')}
              className={`px-3 py-1.5 text-xs font-semibold rounded-md transition-colors whitespace-nowrap shrink-0 ${
                internalTab === 'returned'
                  ? 'bg-[#12374d] text-white shadow-xs'
                  : 'text-slate-600 hover:text-slate-900 hover:bg-slate-200/60'
              }`}
            >
              Returned ({returnedRequests.length})
            </button>
            <button
              aria-pressed={internalTab === 'approved'}
              onClick={() => selectTab('approved')}
              className={`px-3 py-1.5 text-xs font-semibold rounded-md transition-colors whitespace-nowrap shrink-0 ${
                internalTab === 'approved'
                  ? 'bg-[#12374d] text-white shadow-xs'
                  : 'text-slate-600 hover:text-slate-900 hover:bg-slate-200/60'
              }`}
            >
              Completed ({approvedRequests.length})
            </button>
            {activeView === 'dashboard' && <button type="button" onClick={() => { setRequestsFilter('all'); setActiveView('requests'); }} className="shrink-0 whitespace-nowrap rounded-md px-3 py-1.5 text-xs font-semibold text-slate-600 hover:bg-slate-200/60">All routes ({companyRequests.length})</button>}
          </div>

          {/* Search, Sort & Columns Visibility */}
          <div className="flex flex-wrap items-center gap-2">
            {/* Search */}
            <div className="relative flex-1 sm:flex-none">
              <Search aria-hidden="true" className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-workspace-muted" />
              <input
                type="text"
                aria-label="Search recent PreciRoutes"
                placeholder="Search requests"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="workspace-control min-h-8 w-full pl-8 pr-2.5 text-xs placeholder:text-workspace-muted sm:w-32"
              />
            </div>

            {/* Sort Picker */}
            <div className="flex max-w-full flex-wrap items-center gap-2 text-xs">
              <select aria-label="Filter by form type" value={formFilter} onChange={e => setFormFilter(e.target.value)} className="workspace-control min-h-8 max-w-32 px-2"><option value="ALL">All form types</option>{[...new Set(companyRequests.map(r => r.formType))].map(type => <option key={type}>{type}</option>)}</select>
              <select aria-label="Filter by signing status" value={statusFilter} onChange={e => setStatusFilter(e.target.value)} className="workspace-control min-h-8 max-w-32 px-2"><option value="ALL">All statuses</option>{['Pending Approval','Returned for Correction','Approved','Rejected','Cancelled'].map(status => <option key={status} value={status}>{status === 'Approved' ? 'Signing completed' : status}</option>)}</select>
              <select
                value={sortBy}
                onChange={(e) => setSortBy(e.target.value as any)}
                aria-label="Sort Requests By"
                className="workspace-control min-h-8 px-2 text-xs font-medium"
              >
                <option value="date-desc">Newest First</option>
                <option value="date-asc">Oldest First</option>
                <option value="priority">Priority Order</option>
                <option value="id">Request ID</option>
              </select>
            </div>

            {/* Column Visibility Selector */}
            <div className="relative">
              <button
                onClick={() => setShowColumnsMenu(!showColumnsMenu)}
                aria-expanded={showColumnsMenu}
                aria-label="Customize table columns"
                className="workspace-control flex min-h-8 items-center gap-1.5 px-2.5 text-xs font-medium"
                title="Customize table columns"
              >
                <SlidersHorizontal className="w-3 h-3 text-slate-500" />
                <span className="hidden sm:inline">Columns</span>
                <ChevronDown className="w-2.5 h-2.5 text-slate-400" />
              </button>

              {showColumnsMenu && (
                <div className="absolute right-0 mt-1 w-52 bg-white border border-[#E2E5E9] rounded-md shadow-lg p-2 z-30 space-y-1 text-xs">
                  <div className="px-2 py-1 text-[10px] font-bold text-slate-400 uppercase tracking-wider">
                    Show / Hide Columns
                  </div>
                  {Object.entries(visibleColumns).map(([col, val]) => {
                    const columnLabels: Record<string, string> = {
                      id: 'Request ID & Document',
                      requester: 'Requester',
                      currentApprover: 'Signers & progress',
                      prioritySla: 'Priority & Target',
                      status: 'Workflow Status',
                      createdAt: 'Submission Date',
                    };
                    return (
                      <label
                        key={col}
                        className="flex items-center justify-between px-2 py-1 rounded hover:bg-[#F5F6F8] cursor-pointer"
                      >
                        <span>{columnLabels[col] || col}</span>
                        <input
                          type="checkbox"
                          checked={val}
                          onChange={() =>
                            setVisibleColumns((prev) => ({
                              ...prev,
                              [col]: !prev[col as keyof typeof visibleColumns],
                            }))
                          }
                          className="rounded text-[#365C78] focus:ring-[#365C78]"
                        />
                      </label>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Operational Table */}
        <div className="overflow-x-auto">
          <table className="w-full min-w-[1120px] text-left border-collapse text-[13px]">
            <thead>
              <tr className="border-b border-workspace-line bg-workspace text-xs font-semibold text-workspace-muted">
                <th className="py-2.5 px-2.5 w-8"></th>
                {visibleColumns.id && <><th className="py-2.5 px-2.5">Request ID &amp; subject</th><th className="py-2.5 px-2.5">Form type</th><th className="py-2.5 px-2.5">Company</th></>}
                {visibleColumns.requester && <th className="py-2.5 px-2.5">Requester</th>}
                {visibleColumns.currentApprover && <th className="py-2.5 px-2.5 min-w-[220px]">Signers &amp; progress</th>}
                {visibleColumns.prioritySla && <th className="py-2.5 px-2.5">Priority</th>}
                {visibleColumns.status && <th className="py-2.5 px-2.5">Signing status</th>}
                {visibleColumns.createdAt && <th className="py-2.5 px-2.5">Submitted</th>}
                <th className="py-2.5 px-2.5 text-right">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#E2E5E9]">
              {filteredRequests.length === 0 ? (
                <tr>
                  <td colSpan={2 + Object.values(visibleColumns).filter(Boolean).length + (visibleColumns.id ? 2 : 0)} className="py-12 text-center text-slate-400">
                    <p className="font-medium text-slate-600">{!hasFilters && internalTab === 'pending' ? 'You’re all caught up' : 'No requests found'}</p>
                    <p className="text-xs text-slate-600 mt-1">
                      {hasFilters ? 'No requests match your search and filters.' : internalTab === 'pending' ? 'Requests that need your action will appear here.' : 'There are no requests in this view yet.'}
                    </p>
                    {hasFilters && <button type="button" className="mt-2 text-xs font-semibold text-[#365C78] underline" onClick={() => {
                      setSearchQuery('');
                      setFormFilter('ALL');
                      setStatusFilter('ALL');
                    }}>Clear filters</button>}
                  </td>
                </tr>
              ) : (
                displayedRequests.map((req) => {
                  const isExpanded = expandedRowId === req.id;
                  const isUrgent = req.formData.priority === 'Urgent';
                  const isPendingMe =
                    needsMyAction(req, currentUser);

                  return (
                    <React.Fragment key={req.id}>
                      <tr
                        onClick={() => setExpandedRowId(isExpanded ? null : req.id)}
                        className={`cursor-pointer transition-colors duration-150 hover:bg-workspace/60 ${
                          isExpanded ? 'bg-workspace/60' : ''
                        }`}
                      >
                        {/* Expand toggle */}
                        <td className="py-2.5 px-2.5 text-center">
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              setExpandedRowId(isExpanded ? null : req.id);
                            }}
                            className="inline-grid size-7 place-items-center rounded-md text-workspace-muted hover:bg-workspace focus-visible:outline-2 focus-visible:outline-workspace-steel"
                            aria-expanded={isExpanded}
                            aria-label={`Expand details for ${req.id}`}
                          >
                            <ChevronDown
                              className={`w-3.5 h-3.5 transition-transform ${
                                isExpanded ? 'rotate-180 text-[#365C78]' : ''
                              }`}
                            />
                          </button>
                        </td>

                        {/* Request ID + Form */}
                        {visibleColumns.id && (
                          <>
                          <td className="py-2.5 px-2.5">
                            <div className="font-semibold text-[#192B3C] text-xs flex flex-wrap items-center gap-1.5">
                              <span className="max-w-[210px] text-workspace-ink [overflow-wrap:anywhere]" title={req.id}>{req.id}</span>
                              {req.documentVersion > 1 && (
                                <span className="text-[9px] px-1 rounded bg-slate-200 text-slate-700 font-mono">
                                  v{req.documentVersion}
                                </span>
                              )}
                            </div>
                            <div className="text-xs text-slate-500 truncate max-w-[220px] mt-1" title={req.formData.workDescription}>
                              {req.title || req.formData.workDescription}
                            </div>
                          </td>
                          <td className="px-2.5 py-2.5"><span className="inline-block rounded-md bg-workspace px-2 py-1 text-xs font-semibold leading-tight">{req.formType}</span></td>
                          <td className="px-2.5 py-2.5 text-xs font-semibold">{req.companyId}</td>
                          </>
                        )}

                        {/* Requester */}
                        {visibleColumns.requester && (
                          <td className="py-2.5 px-2.5">
                            <div className="flex items-center gap-2">
                              <span aria-hidden="true" className="grid size-7 shrink-0 place-items-center rounded-full bg-indigo-100 text-[10px] font-bold text-indigo-800">{getInitials(req.requesterName)}</span>
                              <div><div className="font-semibold text-workspace-ink">{req.requesterName}</div>
                              <div className="text-[11px] text-workspace-muted">{req.department}</div></div>
                            </div>
                          </td>
                        )}

                        {/* Approval Journey & Progress Chain */}
                        {visibleColumns.currentApprover && (
                          <td className="py-2.5 px-2.5">
                            <CompactApprovalChain
                              request={req}
                              currentUserId={currentUser.id}
                              maxVisible={4}
                              compact
                              onOpenDetail={(r) => setSelectedJourneyRequest(r)}
                            />
                          </td>
                        )}

                        {/* Priority & Turnaround Target (Distinguished from Status) */}
                        {visibleColumns.prioritySla && (
                          <td className="py-2.5 px-2.5">
                            <div className="flex items-center gap-1.5">
                              <span
                                className={`text-[11px] font-semibold px-2 py-0.5 rounded border inline-block ${
                                  isUrgent
                                    ? 'bg-rose-50 text-rose-800 border-rose-200'
                                    : req.formData.priority === 'Medium'
                                    ? 'bg-amber-50 text-amber-800 border-amber-200'
                                    : 'bg-slate-100 text-slate-700 border-slate-200'
                                }`}
                              >
                                {req.formData.priority}
                              </span>
                            </div>
                            <div className="text-[10px] text-slate-400 mt-0.5 tabular-nums">
                              Target: {getSlaDescription(req.formData.priority)}
                            </div>
                          </td>
                        )}

                        {/* Workflow Status */}
                        {visibleColumns.status && (
                          <td className="py-2.5 px-2.5">
                            <span
                              className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-medium border whitespace-nowrap ${
                                req.status === 'Approved'
                                  ? 'bg-emerald-50 text-emerald-800 border-emerald-200'
                                  : req.status === 'Returned for Correction'
                                  ? 'bg-amber-50 text-amber-800 border-amber-200'
                                  : req.status === 'Rejected'
                                  ? 'bg-rose-50 text-rose-800 border-rose-200'
                                  : 'bg-sky-50 text-sky-800 border-sky-200'
                              }`}
                            >
                              <span
                                className={`w-1.5 h-1.5 rounded-full ${
                                  req.status === 'Approved'
                                    ? 'bg-emerald-600'
                                    : req.status === 'Returned for Correction'
                                    ? 'bg-amber-600'
                                    : req.status === 'Rejected'
                                    ? 'bg-rose-600'
                                    : 'bg-sky-600'
                                }`}
                              />
                              <span>{req.status === 'Approved' ? 'Signing completed' : req.status === 'Returned for Correction' ? 'Returned' : req.status}</span>
                            </span>
                          </td>
                        )}

                        {/* Submission Date */}
                        {visibleColumns.createdAt && (
                          <td className="py-2.5 px-2.5 tabular-nums text-slate-600">
                            <div>
                              {new Date(req.createdAt).toLocaleDateString('en-GB', {
                                day: '2-digit',
                                month: 'short',
                                year: 'numeric',
                              })}
                            </div>
                            <div className="text-[10px] text-slate-400">
                              {new Date(req.createdAt).toLocaleTimeString([], {
                                hour: '2-digit',
                                minute: '2-digit',
                              })}
                            </div>
                          </td>
                        )}

                        {/* Primary Action Button */}
                        <td className="py-2.5 px-2.5 text-right">
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              openReviewRequest(req.id);
                            }}
                            className={`inline-flex min-h-8 items-center gap-2 whitespace-nowrap px-2.5 text-xs font-semibold ${isPendingMe ? 'workspace-primary' : 'workspace-control'}`}
                          >
                            <span>{actionFor(req).label}</span>
                            <ArrowRight aria-hidden="true" className="size-3.5" />
                          </button>
                        </td>
                      </tr>

                      {/* Expandable Approval Workflow Stepper & Audit Overview */}
                      {isExpanded && (
                        <tr className="bg-[#F9FAFB] border-b border-[#E2E5E9]">
                          <td colSpan={2 + Object.values(visibleColumns).filter(Boolean).length + (visibleColumns.id ? 2 : 0)} className="p-4 pl-10">
                            <div className="bg-white p-4 rounded-md border border-[#E2E5E9] space-y-4">
                              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-[#E2E5E9] pb-3">
                                <div>
                                  <h4 className="text-xs font-bold text-[#192B3C] flex items-center gap-2">
                                    <span>Approval Journey &amp; Recipient Tracking</span>
                                    <span className="text-[10px] font-normal text-slate-500">
                                      (Workflow Config v{req.workflowVersion})
                                    </span>
                                  </h4>
                                  <p className="text-[11px] text-slate-500 mt-0.5">
                                    Document description: "{req.formData.workDescription}"
                                  </p>
                                </div>

                                <button
                                  onClick={() => openReviewRequest(req.id)}
                                  className="text-xs font-semibold text-[#365C78] hover:text-[#2A4A62] flex items-center gap-1 self-start sm:self-auto"
                                >
                                  <span>Open full review &amp; audit history</span>
                                  <ExternalLink className="w-3 h-3" />
                                </button>
                              </div>

                              {/* Detailed Structured Journey Panel */}
                              <ApprovalJourneyPanel
                                request={req}
                                currentUserId={currentUser.id}
                                showDocumentButton={false}
                              />
                            </div>
                          </td>
                        </tr>
                      )}
                    </React.Fragment>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        {/* Operational Table Footer */}
        <div className="flex flex-col items-center justify-between gap-2 rounded-b-xl border-t border-workspace-line bg-workspace/40 p-3 text-xs text-workspace-muted sm:flex-row">
          <span>
            Showing {displayedRequests.length} of {companyRequests.length} requests in {selectedCompany.fullName}
          </span>
          <div className="flex items-center gap-3">


            <button
              onClick={() => { setRequestsFilter('all'); setActiveView('requests'); }}
              className="font-medium text-[#365C78] hover:underline"
            >
              View all requests
            </button>
          </div>
        </div>
      </div>

        <aside className="grid gap-3 sm:max-[1560px]:grid-cols-2" aria-label="Request shortcuts and totals">
          <section className="workspace-panel overflow-hidden">
            <h2 className="flex items-center gap-2 border-b border-workspace-line px-3 py-3 text-sm font-bold"><Zap aria-hidden="true" className="size-4 text-workspace-teal" />Quick actions</h2>
            <div className="p-1.5">
              {([
                ['Needs my action', pendingForMeRequests.length, 'pending', Inbox],
                ['Requests I started', myRequests.length, 'my', FileText],
                ['Returned requests', returnedRequests.length, 'returned', RotateCcw],
                ['Signing completed', approvedRequests.length, 'approved', CheckCircle2],
              ] as const).map(([label, count, tab, Icon]) => (
                <button type="button" key={tab} aria-pressed={internalTab === tab} onClick={() => selectTab(tab)}
                  className="flex min-h-9 w-full items-center gap-2 rounded-md px-2 text-left text-xs font-semibold hover:bg-workspace focus-visible:outline-2 focus-visible:outline-workspace-steel aria-pressed:bg-workspace-tint">
                  <Icon aria-hidden="true" className="size-4 shrink-0 text-workspace-teal" />
                  <span className="flex-1">{label} ({count})</span><ChevronRight aria-hidden="true" className="size-3.5 shrink-0" />
                </button>
              ))}
            </div>
          </section>
          <section className="workspace-panel overflow-hidden">
            <h2 className="flex items-center gap-2 border-b border-workspace-line px-3 py-3 text-sm font-bold"><BarChart3 aria-hidden="true" className="size-4 text-workspace-teal" />At a glance</h2>
            <dl className="divide-y divide-workspace-line px-3 text-xs">
              <div className="flex justify-between gap-2 py-2.5"><dt>Requests in this view</dt><dd className="font-bold tabular-nums">{companyRequests.length}</dd></div>
              <div className="flex justify-between gap-2 py-2.5"><dt>Awaiting approval</dt><dd className="font-bold tabular-nums">{companyRequests.filter(request => request.status === 'Pending Approval').length}</dd></div>
              <div className="flex justify-between gap-2 py-2.5"><dt>Signing completed</dt><dd className="font-bold tabular-nums">{approvedRequests.length}</dd></div>
            </dl>
          </section>
        </aside>
      </div>

      {/* Approval Journey Inspection Modal */}
      <ApprovalJourneyModal
        request={selectedJourneyRequest}
        isOpen={Boolean(selectedJourneyRequest)}
        onClose={() => setSelectedJourneyRequest(null)}
        onOpenDocument={openReviewRequest}
        currentUserId={currentUser.id}
      />
    </div>
  );
};
