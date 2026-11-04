import { needsMyAction } from '../../utils/actionQueue';
import React, { useState, useMemo } from 'react';
import { useApp } from '../../context/AppContext';
import { RequestRecord, PriorityLevel } from '../../types/index';
import {
  Inbox,
  AlertTriangle,
  RotateCcw,
  CheckCircle2,
  Search,
  SlidersHorizontal,
  ChevronDown,
  ArrowUpDown,
  Plus,
  ArrowRight,
  ExternalLink,
  Clock,
  Check,
  Building,
} from 'lucide-react';
import { CompactApprovalChain } from '../common/CompactApprovalChain';
import { ApprovalJourneyModal } from '../common/ApprovalJourneyModal';
import { ApprovalJourneyPanel } from '../journey/ApprovalJourneyPanel';

export const DashboardView: React.FC = () => {
  const {
    currentUser,
    draftFormData,
    workflows,
    readOnly: connected,
    refreshRequests,
    companyRequests,
    selectedCompany,
    setActiveView,
    requestsFilter,
    setRequestsFilter,
    openReviewRequest,
    setSelectedRequestFormType,
  } = useApp();

  const [searchQuery, setSearchQuery] = useState('');
  const [formFilter,setFormFilter] = useState('ALL');
  const [statusFilter,setStatusFilter] = useState('ALL');
  const [refreshError, setRefreshError] = useState('');
  const [refreshing, setRefreshing] = useState(false);
  const [expandedRowId, setExpandedRowId] = useState<string | null>(null);
  const [showColumnsMenu, setShowColumnsMenu] = useState(false);
  const [sortBy, setSortBy] = useState<'date-desc' | 'date-asc' | 'priority' | 'id'>('date-desc');
  const [selectedJourneyRequest, setSelectedJourneyRequest] = useState<RequestRecord | null>(null);
  const [internalTab, setInternalTab] = useState<'pending' | 'my' | 'all' | 'returned' | 'approved'>(
    requestsFilter === 'pending'
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
    prioritySla: true,
    status: true,
    createdAt: true,
  });

  // Calculate dynamic KPIs from shared company requests
  const pendingForMeRequests = useMemo(() => {
    return companyRequests.filter(
      (r) => needsMyAction(r,currentUser.id)
    );
  }, [companyRequests, currentUser]);

  const urgentOrOverdueRequests = useMemo(() => {
    return companyRequests.filter(
      (r) => r.formData.priority === 'Urgent' && r.status === 'Pending Approval'
    );
  }, [companyRequests]);

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
    if (requestsFilter === 'pending') setInternalTab('pending');
    else if (requestsFilter === 'my') setInternalTab('my');
    else if (requestsFilter === 'approved') setInternalTab('approved');
    else if (requestsFilter === 'all') setInternalTab('all');
  }, [requestsFilter]);

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
    <div className="p-3.5 sm:p-6 md:p-8 space-y-4 sm:space-y-6 max-w-[1600px] mx-auto">
      {/* Top Section: Operational Status & Primary Action */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-2 border-b border-[#E2E5E9]">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-lg sm:text-xl font-bold tracking-tight text-[#192B3C]">
              Your workspace
            </h1>
            <span className="text-xs font-semibold px-2 py-0.5 rounded bg-[#EBF2F7] text-[#365C78] border border-[#C2D5E3]">
              {selectedCompany.code}
            </span>
          </div>
          <p className="text-[11px] sm:text-xs text-slate-500 mt-0.5">
            Your requests, signatures and next steps · <strong className="text-[#192B3C]">{currentUser.name}</strong> ({currentUser.role} · {currentUser.department}).
          </p>
        </div>

        {connected && <button disabled={refreshing} className="text-xs underline" onClick={async () => {
          setRefreshing(true); setRefreshError('');
          try { await refreshRequests(); } catch { setRefreshError('Could not refresh requests. Your current list is retained. Please retry.'); }
          finally { setRefreshing(false); }
        }}>{refreshing ? 'Refreshing…' : 'Refresh requests'}</button>}
        <button
          onClick={() => {
            setSelectedRequestFormType('Admin Work Request');
            setActiveView('create-request');
          }}
          className="flex items-center justify-center gap-2 px-3.5 py-2 bg-[#365C78] hover:bg-[#2A4A62] text-white rounded-md text-xs font-semibold shadow-xs transition-colors w-full sm:w-auto shrink-0"
        >
          <Plus className="w-4 h-4" />
          <span>New PreciRoute</span>
        </button>
      </div>

      {refreshError && <p role="alert" className="text-xs text-rose-700">{refreshError}</p>}
      <div className="grid grid-cols-4 bg-white rounded-lg border border-slate-200 divide-x divide-slate-200">
        {[['Needs my action',pendingForMeRequests.length,'pending'],['My active routes',myRequests.filter(r => r.status === 'Pending Approval').length,'my'],['Returned to me',returnedRequests.filter(r => r.requesterId === currentUser.id).length,'returned'],['Signing completed',approvedRequests.length,'approved']].map(([label,count,tab]) => <button key={String(tab)} onClick={() => { setInternalTab(tab as typeof internalTab); if(tab !== 'returned')setRequestsFilter(tab as 'pending'|'my'|'approved'); }} className="p-5 text-left hover:bg-slate-50"><strong className="block text-3xl tabular-nums text-[#192B3C]">{count}</strong><span className="text-sm text-slate-600">{label}</span></button>)}
      </div>
      {pendingForMeRequests[0] && <div className="flex items-center justify-between gap-4 rounded-lg border border-teal-200 bg-teal-50 p-4"><div><strong>{pendingForMeRequests[0].pendingReplacement?.newUserId === currentUser.id ? 'An assignment needs your response' : 'A route needs your signature'}</strong><p className="text-sm text-slate-600">{pendingForMeRequests[0].id}</p></div><button className="rounded bg-[#192B3C] px-5 py-2 text-sm font-semibold text-white" onClick={() => openReviewRequest(pendingForMeRequests[0].id)}>Review route →</button></div>}
      <section aria-label="Company forms"><div className="flex justify-between items-center mb-3"><h2 className="text-xl font-bold">Company forms</h2><button className="text-sm text-[#365C78] font-semibold" onClick={() => setActiveView('forms-library')}>Browse library →</button></div><div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <div className="lg:col-span-2 flex items-center justify-between rounded-lg border border-teal-300 bg-white p-5"><div><h3 className="font-bold text-lg">Admin Work Request</h3><p className="text-sm text-slate-500">Documents, letters and administrative services</p><span className="text-xs text-teal-700">{selectedCompany.code} · {workflows.some(w => w.companyId === selectedCompany.id && w.formType === 'Admin Work Request') ? 'Configured' : 'Select a configured company'}</span></div><button className="rounded bg-[#192B3C] text-white px-4 py-2 text-sm" onClick={() => {setSelectedRequestFormType('Admin Work Request');setActiveView('create-request');}}>Start request →</button></div>
        <div className="rounded-lg border border-slate-200 bg-white p-5"><h3 className="font-semibold">{draftFormData ? 'Continue your draft' : 'Ready when you are'}</h3><p className="text-sm text-slate-500 mt-1">Admin Work Request</p><button className="mt-3 text-sm text-[#365C78] font-semibold" onClick={() => setActiveView('create-request')}>{draftFormData ? 'Resume draft →' : 'Open form →'}</button></div>
      </div></section>
      <h2 className="text-xl font-bold">Recent PreciRoutes</h2>
      {/* Main Operational Table Container */}
      <div className="bg-white border border-[#E2E5E9] rounded-lg overflow-hidden shadow-xs">
        {/* Table Controls Bar: Operational Filter Tabs + Search + Sort + Columns */}
        <div className="p-3 sm:p-3.5 border-b border-[#E2E5E9] flex flex-col md:flex-row md:items-center justify-between gap-3 bg-[#F9FAFB]">
          {/* Segmented Filter Tabs */}
          <div className="flex items-center gap-1 overflow-x-auto pb-1 md:pb-0 scrollbar-none shrink-0">
            <button
              onClick={() => {
                setInternalTab('pending');
                setRequestsFilter('pending');
              }}
              className={`px-3 py-1.5 text-xs font-semibold rounded-md transition-colors whitespace-nowrap shrink-0 ${
                internalTab === 'pending'
                  ? 'bg-[#365C78] text-white shadow-xs'
                  : 'text-slate-600 hover:text-slate-900 hover:bg-slate-200/60'
              }`}
            >
              Awaiting Action ({pendingForMeRequests.length})
            </button>
            <button
              onClick={() => {
                setInternalTab('my');
                setRequestsFilter('my');
              }}
              className={`px-3 py-1.5 text-xs font-semibold rounded-md transition-colors whitespace-nowrap shrink-0 ${
                internalTab === 'my'
                  ? 'bg-[#365C78] text-white shadow-xs'
                  : 'text-slate-600 hover:text-slate-900 hover:bg-slate-200/60'
              }`}
            >
              My Requests ({myRequests.length})
            </button>
            <button
              onClick={() => setInternalTab('returned')}
              className={`px-3 py-1.5 text-xs font-semibold rounded-md transition-colors whitespace-nowrap shrink-0 ${
                internalTab === 'returned'
                  ? 'bg-[#365C78] text-white shadow-xs'
                  : 'text-slate-600 hover:text-slate-900 hover:bg-slate-200/60'
              }`}
            >
              Returned ({returnedRequests.length})
            </button>
            <button
              onClick={() => {
                setInternalTab('all');
                setRequestsFilter('all');
              }}
              className={`px-3 py-1.5 text-xs font-semibold rounded-md transition-colors whitespace-nowrap shrink-0 ${
                internalTab === 'all'
                  ? 'bg-[#365C78] text-white shadow-xs'
                  : 'text-slate-600 hover:text-slate-900 hover:bg-slate-200/60'
              }`}
            >
              All Requests ({companyRequests.length})
            </button>
            <button
              onClick={() => {
                setInternalTab('approved');
                setRequestsFilter('approved');
              }}
              className={`px-3 py-1.5 text-xs font-semibold rounded-md transition-colors whitespace-nowrap shrink-0 ${
                internalTab === 'approved'
                  ? 'bg-[#365C78] text-white shadow-xs'
                  : 'text-slate-600 hover:text-slate-900 hover:bg-slate-200/60'
              }`}
            >
              Completed ({approvedRequests.length})
            </button>
          </div>

          {/* Search, Sort & Columns Visibility */}
          <div className="flex flex-wrap items-center gap-2">
            {/* Search */}
            <div className="relative flex-1 sm:flex-none">
              <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                placeholder="Search..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-8 pr-2.5 py-1 text-xs border border-[#E2E5E9] bg-white rounded-md focus:outline-none focus:ring-1 focus:ring-[#365C78] focus:border-[#365C78] w-full sm:w-48"
              />
            </div>

            {/* Sort Picker */}
            <div className="flex items-center gap-1 border border-[#E2E5E9] rounded-md px-2 py-1 bg-white text-xs shrink-0">
              <ArrowUpDown className="w-3 h-3 text-slate-500" />
              <select aria-label="Filter by form type" value={formFilter} onChange={e => setFormFilter(e.target.value)} className="border border-slate-200 rounded p-2 text-xs"><option value="ALL">All form types</option>{[...new Set(companyRequests.map(r => r.formType))].map(type => <option key={type}>{type}</option>)}</select>
              <select aria-label="Filter by signing status" value={statusFilter} onChange={e => setStatusFilter(e.target.value)} className="border border-slate-200 rounded p-2 text-xs"><option value="ALL">All statuses</option>{['Pending Approval','Returned for Correction','Approved','Rejected','Cancelled'].map(status => <option key={status} value={status}>{status === 'Approved' ? 'Signing completed' : status}</option>)}</select>
              <select
                value={sortBy}
                onChange={(e) => setSortBy(e.target.value as any)}
                aria-label="Sort Requests By"
                className="bg-transparent text-xs text-slate-700 font-medium focus:outline-none cursor-pointer"
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
                className="flex items-center gap-1 px-2.5 py-1 border border-[#E2E5E9] bg-white rounded-md text-xs font-medium text-slate-700 hover:bg-slate-50 transition-colors"
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
                      currentApprover: 'Current Approver',
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
              <tr className="bg-[#F5F6F8] border-b border-[#E2E5E9] text-slate-500 font-semibold text-[11px] tracking-wide">
                <th className="py-4 px-4 w-8"></th>
                {visibleColumns.id && <th className="py-4 px-4">Request / document</th>}
                {visibleColumns.requester && <th className="py-4 px-4">Requester</th>}
                {visibleColumns.currentApprover && <th className="py-4 px-4 min-w-[290px]">Signers &amp; progress</th>}
                {visibleColumns.prioritySla && <th className="py-4 px-4">Priority</th>}
                {visibleColumns.status && <th className="py-4 px-4">Signing status</th>}
                {visibleColumns.createdAt && <th className="py-4 px-4">Submitted</th>}
                <th className="py-4 px-4 text-right">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#E2E5E9]">
              {filteredRequests.length === 0 ? (
                <tr>
                  <td colSpan={2 + Object.values(visibleColumns).filter(Boolean).length} className="py-12 text-center text-slate-400">
                    <p className="font-medium text-slate-600">No requests found</p>
                    <p className="text-[11px] text-slate-400 mt-1">
                      No matching records found for the selected tab and filter.
                    </p>
                  </td>
                </tr>
              ) : (
                filteredRequests.map((req) => {
                  const isExpanded = expandedRowId === req.id;
                  const isUrgent = req.formData.priority === 'Urgent';
                  const isPendingMe =
                    needsMyAction(req,currentUser.id);

                  return (
                    <React.Fragment key={req.id}>
                      <tr
                        onClick={() => setExpandedRowId(isExpanded ? null : req.id)}
                        className={`hover:bg-[#F9FAFB] transition-colors cursor-pointer ${
                          isExpanded ? 'bg-[#EBF2F7]/40' : ''
                        }`}
                      >
                        {/* Expand toggle */}
                        <td className="py-4 px-4 text-center">
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              setExpandedRowId(isExpanded ? null : req.id);
                            }}
                            className="text-slate-400 hover:text-slate-600"
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
                          <td className="py-4 px-4">
                            <div className="font-semibold text-[#192B3C] text-xs flex flex-wrap items-center gap-1.5">
                              <span className="break-all max-w-[210px]" title={req.id}>{req.id}</span>
                              <span className="text-[9px] px-1.5 py-0.5 rounded font-bold uppercase bg-slate-100 text-[#365C78] border border-slate-200">
                                {req.companyId}
                              </span>
                              {req.documentVersion > 1 && (
                                <span className="text-[9px] px-1 rounded bg-slate-200 text-slate-700 font-mono">
                                  v{req.documentVersion}
                                </span>
                              )}
                            </div>
                            <div className="text-xs text-slate-500 truncate max-w-[220px] mt-1" title={req.formData.workDescription}>
                              {req.formType}
                            </div>
                          </td>
                        )}

                        {/* Requester */}
                        {visibleColumns.requester && (
                          <td className="py-4 px-4">
                            <div className="font-semibold text-[#192B3C]">{req.requesterName}</div>
                            <div className="text-[10px] text-slate-500">{req.department}</div>
                          </td>
                        )}

                        {/* Approval Journey & Progress Chain */}
                        {visibleColumns.currentApprover && (
                          <td className="py-4 px-4">
                            <CompactApprovalChain
                              request={req}
                              currentUserId={currentUser.id}
                              onOpenDetail={(r) => setSelectedJourneyRequest(r)}
                            />
                          </td>
                        )}

                        {/* Priority & Turnaround Target (Distinguished from Status) */}
                        {visibleColumns.prioritySla && (
                          <td className="py-4 px-4">
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
                          <td className="py-4 px-4">
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
                              <span>{req.status === 'Approved' ? 'Signing completed' : req.status === 'Returned for Correction' ? 'Returned' : req.status === 'Pending Approval' ? 'In progress' : req.status}</span>
                            </span>
                          </td>
                        )}

                        {/* Submission Date */}
                        {visibleColumns.createdAt && (
                          <td className="py-4 px-4 tabular-nums text-slate-600">
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
                        <td className="py-4 px-4 text-right">
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              openReviewRequest(req.id);
                            }}
                            className={`px-3 py-1.5 rounded-md font-semibold text-xs transition-colors shadow-xs inline-flex items-center gap-2 whitespace-nowrap ${
                              isPendingMe
                                ? 'bg-[#365C78] hover:bg-[#2A4A62] text-white'
                                : 'bg-slate-100 hover:bg-slate-200 text-slate-800 border border-slate-300'
                            }`}
                          >
                            <span>{req.pendingReplacement?.newUserId === currentUser.id ? 'Respond' : req.status === 'Returned for Correction' && req.requesterId === currentUser.id ? 'Review correction' : isPendingMe ? 'Review & sign' : 'View details'}</span>
                            <ArrowRight className="w-3 h-3" />
                          </button>
                        </td>
                      </tr>

                      {/* Expandable Approval Workflow Stepper & Audit Overview */}
                      {isExpanded && (
                        <tr className="bg-[#F9FAFB] border-b border-[#E2E5E9]">
                          <td colSpan={2 + Object.values(visibleColumns).filter(Boolean).length} className="p-4 pl-10">
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
        <div className="p-3 border-t border-[#E2E5E9] bg-[#F9FAFB] text-[11px] text-slate-500 flex flex-col sm:flex-row justify-between items-center gap-2">
          <span>
            Showing {filteredRequests.length} of {companyRequests.length} requests in {selectedCompany.fullName}
          </span>
          <div className="flex items-center gap-3">
            <span className="text-slate-600 font-medium">Tenant Isolation: Strict {selectedCompany.code}</span>
            <span className="text-slate-300">|</span>
            <button
              onClick={() => setActiveView('archive')}
              className="font-medium text-[#365C78] hover:underline"
            >
              Open Full Searchable Archive Register
            </button>
          </div>
        </div>
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
