import React, { useState, useMemo } from 'react';
import { useApp } from '../../context/AppContext';
import { RequestRecord, CompanyId, RequestStatus } from '../../types/index';
import {
  Archive,
  Search,
  Download,
  Printer,
  FileText,
  Filter,
  CheckCircle2,
  Clock,
  RotateCcw,
  XCircle,
  Eye,
  History,
  ChevronDown,
  Building2,
  ExternalLink,
} from 'lucide-react';
import { CompactApprovalChain } from '../common/CompactApprovalChain';
import { ApprovalJourneyModal } from '../common/ApprovalJourneyModal';

export const ArchiveRegisterView: React.FC = () => {
  const { companyRequests, openReviewRequest, selectedCompany, currentUser } = useApp();

  const [searchQuery, setSearchQuery] = useState('');
  const [companyFilter, setCompanyFilter] = useState<string>('ALL');
  const [statusFilter, setStatusFilter] = useState<string>('ALL');
  const [formTypeFilter, setFormTypeFilter] = useState<string>('ALL');
  const [dateFilter, setDateFilter] = useState<string>('ALL');
  const [selectedHistoryRequest, setSelectedHistoryRequest] = useState<RequestRecord | null>(null);

  // Filtered requests for the register
  const filteredRegister = useMemo(() => {
    return companyRequests.filter((r) => {
      // Company filter
      if (companyFilter !== 'ALL' && r.companyId !== companyFilter) {
        return false;
      }
      // Status filter
      if (statusFilter !== 'ALL' && r.status !== statusFilter) {
        return false;
      }
      // Form type filter
      if (formTypeFilter !== 'ALL' && r.formType !== formTypeFilter) {
        return false;
      }
      // Date filter
      if (dateFilter !== 'ALL') {
        const reqTime = new Date(r.createdAt).getTime();
        const now = Date.now();
        if (dateFilter === '7d' && now - reqTime > 7 * 24 * 60 * 60 * 1000) return false;
        if (dateFilter === '30d' && now - reqTime > 30 * 24 * 60 * 60 * 1000) return false;
      }
      // Search query
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        const matches =
          r.id.toLowerCase().includes(q) ||
          r.formType.toLowerCase().includes(q) ||
          r.requesterName.toLowerCase().includes(q) ||
          r.formData.workDescription.toLowerCase().includes(q) ||
          (r.currentApproverName && r.currentApproverName.toLowerCase().includes(q)) ||
          r.approvalHistory.some((h) => h.actionByName.toLowerCase().includes(q) || (h.comments && h.comments.toLowerCase().includes(q)));
        if (!matches) return false;
      }
      return true;
    });
  }, [companyRequests, companyFilter, statusFilter, formTypeFilter, dateFilter, searchQuery]);

  const visibleHistoryRequest = selectedHistoryRequest
    ? companyRequests.find((r) => r.id === selectedHistoryRequest.id) || null
    : null;

  // Export CSV functionality
  const handleExportCSV = () => {
    const headers = [
      'Document ID',
      'Form Code',
      'Company',
      'Requester',
      'Department',
      'Priority',
      'Status',
      'Submission Date',
      'Document Version',
      'Approval Stages Count',
      'Final Approver',
      'Description',
    ];

    const rows = filteredRegister.map((r) => [
      `"${r.id}"`,
      `"${r.formType}"`,
      `"${r.companyId}"`,
      `"${r.requesterName}"`,
      `"${r.department}"`,
      `"${r.formData.priority}"`,
      `"${r.status}"`,
      `"${new Date(r.createdAt).toISOString()}"`,
      r.documentVersion,
      r.approvalSteps.length,
      `"${(r.finalApproverName ?? '').replace(/"/g, '""')}"`,
      `"${r.formData.workDescription.replace(/"/g, '""')}"`,
    ]);

    const csvContent = [headers.join(','), ...rows.map((row) => row.join(','))].join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.setAttribute('href', url);
    link.setAttribute('download', `precisign_document_register_${new Date().toISOString().slice(0, 10)}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const handlePrintRegister = () => {
    window.print();
  };

  return (
    <div className="p-6 md:p-8 space-y-6 max-w-7xl mx-auto">
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-[#E2E5E9]">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-xl font-bold tracking-tight text-[#192B3C] flex items-center gap-2">
              <Archive className="w-5 h-5 text-[#365C78]" />
              <span>Document Archive &amp; Register</span>
            </h1>
            <span className="text-xs font-semibold px-2 py-0.5 rounded bg-[#EBF2F7] text-[#365C78] border border-[#C2D5E3]">
              {filteredRegister.length} Records
            </span>
          </div>
          <p className="text-xs text-slate-500 mt-1">
            Find previous requests, review their history and export the list.
          </p>
        </div>

        {/* Action Controls */}
        <div className="flex items-center gap-2">
          <button
            onClick={handleExportCSV}
            className="flex items-center gap-1.5 px-3 py-1.5 border border-[#CBD5E1] bg-white hover:bg-[#F5F6F8] text-[#192B3C] rounded-md text-xs font-semibold shadow-xs transition-colors"
            title="Download full register as CSV spreadsheet"
          >
            <Download className="w-3.5 h-3.5 text-[#365C78]" />
            <span>Export CSV</span>
          </button>

          <button
            onClick={handlePrintRegister}
            className="flex items-center gap-1.5 px-3 py-1.5 border border-[#CBD5E1] bg-white hover:bg-[#F5F6F8] text-[#192B3C] rounded-md text-xs font-semibold shadow-xs transition-colors"
            title="Print printable summary of the register"
          >
            <Printer className="w-3.5 h-3.5 text-slate-600" />
            <span>Print Register</span>
          </button>
        </div>
      </div>

      {/* Practical Filters Strip */}
      <div className="workspace-panel space-y-3 p-4">
        <div className="flex items-center gap-2 text-xs font-bold text-[#192B3C]">
          <Filter className="w-3.5 h-3.5 text-[#365C78]" />
          <span>Register Filters</span>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3">
          {/* 1. Search Query */}
          <div>
            <label className="block text-[11px] font-medium text-slate-600 mb-1">
              Search Register
            </label>
            <div className="relative">
              <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                placeholder="ID, Requester, Description..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full pl-8 pr-2.5 py-1.5 text-xs border border-[#E2E5E9] rounded-md focus:outline-none focus:ring-1 focus:ring-[#365C78]"
              />
            </div>
          </div>

          {/* 2. Company Filter */}
          <div>
            <label className="block text-[11px] font-medium text-slate-600 mb-1">
              Company Entity
            </label>
            <select
              value={companyFilter}
              onChange={(e) => setCompanyFilter(e.target.value)}
              className="workspace-control min-h-9 w-full px-2.5 text-xs"
            >
              <option value="ALL">All Companies</option>
              <option value="PEW">Precision Engineering Works (PEW)</option>
              <option value="ICCL">Insturmental Control Co Ltd (ICCL)</option>
              <option value="FSG">Future Steel Group (FSG)</option>
            </select>
          </div>

          {/* 3. Status Filter */}
          <div>
            <label className="block text-[11px] font-medium text-slate-600 mb-1">
              Workflow Status
            </label>
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="workspace-control min-h-9 w-full px-2.5 text-xs"
            >
              <option value="ALL">All Statuses</option>
              <option value="Approved">Approved</option>
              <option value="Pending Approval">Pending Approval</option>
              <option value="Returned for Correction">Returned for Correction</option>
              <option value="Rejected">Rejected</option>
              <option value="Cancelled">Cancelled</option>
            </select>
          </div>

          {/* 4. Form Type Filter */}
          <div>
            <label className="block text-[11px] font-medium text-slate-600 mb-1">
              Document Form
            </label>
            <select
              value={formTypeFilter}
              onChange={(e) => setFormTypeFilter(e.target.value)}
              className="workspace-control min-h-9 w-full px-2.5 text-xs"
            >
              <option value="ALL">All Form Types</option>
              {[...new Set(companyRequests.map(request => request.formType))].sort().map(type => (
                <option key={type} value={type}>{type}</option>
              ))}
            </select>
          </div>

          {/* 5. Date Range */}
          <div>
            <label className="block text-[11px] font-medium text-slate-600 mb-1">
              Submission Period
            </label>
            <select
              value={dateFilter}
              onChange={(e) => setDateFilter(e.target.value)}
              className="workspace-control min-h-9 w-full px-2.5 text-xs"
            >
              <option value="ALL">All Time</option>
              <option value="7d">Last 7 Days</option>
              <option value="30d">Last 30 Days</option>
            </select>
          </div>
        </div>
      </div>

      {/* High-density Operational Document Register Table */}
      <div className="workspace-panel overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse text-xs">
            <thead>
              <tr className="bg-[#F5F6F8] border-b border-[#E2E5E9] text-slate-500 font-semibold uppercase text-[10px] tracking-wider">
                <th className="py-2.5 px-3">Register No.</th>
                <th className="py-2.5 px-3">Entity</th>
                <th className="py-2.5 px-3">Document Title &amp; Description</th>
                <th className="py-2.5 px-3">Requester</th>
                <th className="py-2.5 px-3 min-w-[220px]">Approval Journey &amp; Progress</th>
                <th className="py-2.5 px-3">Status</th>
                <th className="py-2.5 px-3">Date</th>
                <th className="py-2.5 px-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#E2E5E9]">
              {filteredRegister.length === 0 ? (
                <tr>
                  <td colSpan={8} className="py-12 text-center text-slate-400">
                    No documents matching the archive filter criteria.
                  </td>
                </tr>
              ) : (
                filteredRegister.map((req) => (
                  <tr key={req.id} className="hover:bg-[#F9FAFB] transition-colors">
                    {/* Register ID + Version */}
                    <td className="py-2.5 px-3 font-mono font-bold text-[#192B3C]">
                      <div>{req.id}</div>
                      <div className="text-[10px] text-slate-400 font-sans">
                        v{req.documentVersion} · wf#{req.workflowVersion}
                      </div>
                    </td>

                    {/* Entity */}
                    <td className="py-2.5 px-3">
                      <span className="font-semibold text-slate-800">{req.companyId}</span>
                    </td>

                    {/* Document & Description */}
                    <td className="py-2.5 px-3 max-w-[280px]">
                      <div className="font-semibold text-[#192B3C] truncate">{req.formType}</div>
                      <div className="text-[11px] text-slate-500 truncate mt-0.5">
                        {req.formData.workDescription}
                      </div>
                    </td>

                    {/* Requester */}
                    <td className="py-2.5 px-3">
                      <div className="font-medium text-slate-800">{req.requesterName}</div>
                      <div className="text-[10px] text-slate-500">{req.department}</div>
                    </td>

                    {/* Compact Approval Journey */}
                    <td className="py-2.5 px-3">
                      <CompactApprovalChain
                        request={req}
                        currentUserId={currentUser.id}
                        onOpenDetail={(r) => setSelectedHistoryRequest(r)}
                      />
                    </td>

                    {/* Status */}
                    <td className="py-2.5 px-3">
                      <span
                        className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded text-[11px] font-medium border ${
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
                        <span>{req.status}</span>
                      </span>
                    </td>

                    {/* Date */}
                    <td className="py-2.5 px-3 tabular-nums text-slate-600">
                      {new Date(req.createdAt).toLocaleDateString('en-GB', {
                        day: '2-digit',
                        month: 'short',
                        year: 'numeric',
                      })}
                    </td>

                    {/* Actions */}
                    <td className="py-2.5 px-3 text-right">
                      <div className="flex items-center justify-end gap-1.5">
                        <button
                          onClick={() => setSelectedHistoryRequest(req)}
                          className="p-1 text-slate-500 hover:text-[#365C78] hover:bg-slate-100 rounded"
                          title="View approval timeline and audit history"
                        >
                          <History className="w-3.5 h-3.5" />
                        </button>
                        <button
                          onClick={() => openReviewRequest(req.id)}
                          className="px-2.5 py-1 bg-[#365C78] hover:bg-[#2A4A62] text-white rounded font-medium text-xs shadow-xs transition-colors"
                        >
                          View
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {/* Footer */}
        <div className="p-3 border-t border-[#E2E5E9] bg-[#F9FAFB] text-[11px] text-slate-500 flex justify-between items-center">
          <span>Showing {filteredRegister.length} records matching current filter</span>
          <span className="font-medium text-slate-700">PreciSign Document Register • Confidential</span>
        </div>
      </div>

      {/* Approval Journey & Audit Inspection Modal */}
      <ApprovalJourneyModal
        request={visibleHistoryRequest}
        isOpen={Boolean(visibleHistoryRequest)}
        onClose={() => setSelectedHistoryRequest(null)}
        onOpenDocument={openReviewRequest}
        currentUserId={currentUser.id}
      />
    </div>
  );
};
