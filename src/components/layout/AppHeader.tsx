import { needsMyAction } from '../../utils/actionQueue';
import React, { useState } from 'react';
import { useApp } from '../../context/AppContext';
import { CompanyId } from '../../types/index';
import {
  Building2,
  ChevronDown,
  Search,
  Bell,
  HelpCircle,
  ShieldCheck,
  Check,
  Menu,
} from 'lucide-react';

export const AppHeader: React.FC = () => {
  const {
    readOnly,
    companies,
    selectedScope,
    selectedCompany,
    setSelectedScope,
    currentUser,
    users,
    setCurrentUserId,
    companyRequests,
    openReviewRequest,
    setIsMobileSidebarOpen,
  } = useApp();

  const [companyDropdownOpen, setCompanyDropdownOpen] = useState(false);
  const [personaDropdownOpen, setPersonaDropdownOpen] = useState(false);
  const [notificationsOpen, setNotificationsOpen] = useState(false);
  const [globalSearch, setGlobalSearch] = useState('');

  const isGroupView = selectedScope === 'PEG';

  // Number of requests requiring current user's approval
  const pendingApprovals = companyRequests.filter(
    (r) => needsMyAction(r,currentUser.id)
  );

  // Search results for global dropdown
  const searchResults = globalSearch.trim()
    ? companyRequests.filter(
        (r) =>
          r.id.toLowerCase().includes(globalSearch.toLowerCase()) ||
          r.title.toLowerCase().includes(globalSearch.toLowerCase()) ||
          r.requesterName.toLowerCase().includes(globalSearch.toLowerCase()) ||
          r.formData.workDescription.toLowerCase().includes(globalSearch.toLowerCase())
      )
    : [];

  return (
    <header className="app-header h-16 bg-white border-b border-[#E2E5E9] px-3 sm:px-6 flex items-center justify-between gap-2 sm:gap-4 sticky top-0 z-20">
      {/* Left: Organization / Company Context (Demo Tenant Selector) */}
      <div className="flex items-center gap-1.5 sm:gap-3 min-w-0">
        {/* Mobile Hamburger menu toggle */}
        <button
          onClick={() => setIsMobileSidebarOpen(true)}
          className="md:hidden p-1.5 rounded-md text-slate-600 hover:text-[#192B3C] hover:bg-[#F5F6F8] focus:outline-none focus:ring-1 focus:ring-[#365C78] shrink-0"
          aria-label="Open Navigation Menu"
        >
          <Menu className="w-5 h-5" />
        </button>

        <div className="relative min-w-0">
          <button
            onClick={() => setCompanyDropdownOpen(!companyDropdownOpen)}
            className="flex items-center gap-1.5 sm:gap-2 px-2.5 sm:px-3 py-1.5 rounded-md border border-[#E2E5E9] bg-[#F5F6F8] hover:bg-[#EDF0F3] transition-colors text-xs font-semibold text-[#192B3C] max-w-full"
            title="Active Viewing Scope / Organization"
          >
            <Building2 className={`w-3.5 h-3.5 shrink-0 ${isGroupView ? 'text-indigo-600' : 'text-[#365C78]'}`} />
            <span className="truncate max-w-[120px] sm:max-w-[210px] md:max-w-[260px]">
              {isGroupView ? 'PRECISION ENGINEERING GROUP' : selectedCompany.fullName}
            </span>
            <span className={`hidden sm:inline-block text-[9px] font-bold tracking-wider px-1.5 py-0.5 rounded border uppercase shrink-0 ${
              isGroupView
                ? 'bg-indigo-50 text-indigo-700 border-indigo-200'
                : 'bg-[#EBF2F7] text-[#365C78] border-[#C2D5E3]'
            }`}>
              {isGroupView ? 'Group View' : 'Company View'}
            </span>
            <ChevronDown className="w-3 h-3 text-slate-500 shrink-0" />
          </button>

          {companyDropdownOpen && (
            <div className="absolute top-full left-0 mt-1 w-84 bg-white border border-[#E2E5E9] rounded-lg shadow-lg p-2 z-50">
              <div className="px-2 py-1 text-[10px] font-bold uppercase tracking-wider text-slate-500">
                Parent Organization:
              </div>
              <button
                onClick={() => {
                  setSelectedScope('PEG');
                  setCompanyDropdownOpen(false);
                }}
                className={`w-full text-left px-3 py-2 rounded-md text-xs transition-colors flex items-center justify-between mb-2 ${
                  isGroupView
                    ? 'bg-indigo-50 text-indigo-900 font-bold border border-indigo-200'
                    : 'text-slate-800 hover:bg-slate-100'
                }`}
              >
                <div>
                  <div className="font-semibold flex items-center gap-1.5">
                    <span>🏢 PRECISION ENGINEERING GROUP</span>
                  </div>
                  <div className="text-[10px] text-slate-500">All companies you can access</div>
                </div>
                {isGroupView && <Check className="w-3.5 h-3.5 text-indigo-600 shrink-0" />}
              </button>

              <div className="px-2 py-1 text-[10px] font-bold uppercase tracking-wider text-slate-500 border-t border-[#E2E5E9] pt-2">
                Operating Subsidiary Entities:
              </div>
              <div className="space-y-1 mt-1">
                {companies.map((company) => (
                  <button
                    key={company.id}
                    onClick={() => {
                      setSelectedScope(company.id as CompanyId);
                      setCompanyDropdownOpen(false);
                    }}
                    className={`w-full text-left px-3 py-2 rounded-md text-xs transition-colors flex items-center justify-between ${
                      !isGroupView && company.id === selectedScope
                        ? 'bg-[#EBF2F7] text-[#192B3C] font-bold border border-[#C2D5E3]'
                        : 'text-slate-700 hover:bg-[#F5F6F8]'
                    }`}
                  >
                    <div>
                      <div className="font-semibold">{company.name}</div>
                      <div className="text-[10px] text-slate-500">{company.groupName}</div>
                    </div>
                    {!isGroupView && company.id === selectedScope && (
                      <Check className="w-3.5 h-3.5 text-[#365C78] shrink-0" />
                    )}
                  </button>
                ))}
              </div>
              <div className="mt-2 pt-2 border-t border-[#E2E5E9] px-2 text-[10px] text-slate-500">
                Choose a company to focus your view. Your access stays the same.
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Center: Global Search Bar */}
      <div className="flex-1 max-w-md hidden md:block relative">
        <div className="relative">
          <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            placeholder="Search request ID, requester, or work description..."
            value={globalSearch}
            onChange={(e) => setGlobalSearch(e.target.value)}
            className="w-full pl-9 pr-14 py-1.5 bg-[#F5F6F8] hover:bg-[#EDF0F3] focus:bg-white text-xs border border-[#E2E5E9] rounded-md focus:outline-none focus:ring-1 focus:ring-[#365C78] focus:border-[#365C78] transition-colors text-[#192B3C] placeholder-slate-400"
          />
          <kbd className="absolute right-2.5 top-1/2 -translate-y-1/2 text-[10px] font-mono text-slate-400 bg-white px-1.5 py-0.5 rounded border border-[#E2E5E9]">
            ⌘K
          </kbd>
        </div>

        {/* Search Results Popover */}
        {globalSearch.trim() && (
          <div className="absolute top-full left-0 right-0 mt-1 bg-white border border-[#E2E5E9] rounded-lg shadow-xl p-2 z-50 max-h-72 overflow-y-auto">
            <div className="px-2 py-1 text-[10px] font-bold uppercase tracking-wider text-slate-400">
              Matching Requests ({searchResults.length}):
            </div>
            {searchResults.length === 0 ? (
              <div className="p-3 text-xs text-slate-400 text-center">No matching documents found.</div>
            ) : (
              <div className="space-y-1 mt-1">
                {searchResults.map((req) => (
                  <button
                    key={req.id}
                    onClick={() => {
                      openReviewRequest(req.id);
                      setGlobalSearch('');
                    }}
                    className="w-full text-left p-2 rounded hover:bg-[#F5F6F8] text-xs transition-colors flex items-center justify-between"
                  >
                    <div className="min-w-0 pr-2">
                      <div className="font-semibold text-[#192B3C] truncate">{req.id} · {req.formData.workDescription.slice(0, 45)}...</div>
                      <div className="text-[10px] text-slate-500">Requester: {req.requesterName} · {req.department}</div>
                    </div>
                    <span className="text-[10px] px-1.5 py-0.5 rounded border font-medium shrink-0 bg-slate-50 text-slate-700 border-slate-200">
                      {req.status}
                    </span>
                  </button>
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Right: Demo Persona Switcher + Notifications + Active User */}
      <div className="flex items-center gap-1.5 sm:gap-3 shrink-0">
        {/* Explicit Demo User Persona Selector */}
        {!readOnly && <div className="relative">
          <button
            onClick={() => setPersonaDropdownOpen(!personaDropdownOpen)}
            className="flex items-center gap-1.5 sm:gap-2 px-2 sm:px-2.5 py-1.5 rounded-md border border-[#365C78]/30 bg-[#EBF2F7] text-[#192B3C] hover:bg-[#DEEAF3] transition-colors text-xs font-medium"
            title="Switch demo persona to test approver permissions"
          >
            <ShieldCheck className="w-3.5 h-3.5 text-[#365C78] shrink-0" />
            <span className="font-semibold truncate max-w-[80px] sm:max-w-none">{currentUser.name}</span>
            <span className="hidden md:inline text-[10px] text-slate-500">({currentUser.role})</span>
            <ChevronDown className="w-3 h-3 text-slate-600 shrink-0" />
          </button>

          {personaDropdownOpen && (
            <div className="absolute top-full right-0 mt-1 w-80 bg-white border border-[#E2E5E9] rounded-lg shadow-xl p-2 z-50">
              <div className="px-2 py-1 text-[10px] font-bold uppercase tracking-wider text-slate-500 border-b border-[#E2E5E9] pb-1.5 mb-1.5">
                Switch Role / Approver Persona:
              </div>
              <div className="max-h-72 overflow-y-auto space-y-1">
                {users.map((u) => (
                  <button
                    key={u.id}
                    onClick={() => {
                      setCurrentUserId(u.id);
                      setPersonaDropdownOpen(false);
                    }}
                    className={`w-full flex items-center justify-between p-2 rounded text-xs transition-colors text-left ${
                      u.id === currentUser.id
                        ? 'bg-[#EBF2F7] text-[#192B3C] font-semibold border border-[#C2D5E3]'
                        : 'hover:bg-[#F5F6F8] text-slate-700'
                    }`}
                  >
                    <div className="flex items-center gap-2">
                      <div
                        className="w-6 h-6 rounded flex items-center justify-center text-[10px] font-bold text-white shrink-0"
                        style={{ backgroundColor: u.avatarColor || '#365C78' }}
                      >
                        {u.initials}
                      </div>
                      <div>
                        <div className="font-medium text-[#192B3C]">{u.name}</div>
                        <div className="text-[10px] text-slate-500">{u.role} · {u.department}</div>
                      </div>
                    </div>
                    {u.id === currentUser.id && <Check className="w-3.5 h-3.5 text-[#365C78]" />}
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>}

        {/* Notifications Popover */}
        <div className="relative">
          <button
            onClick={() => setNotificationsOpen(!notificationsOpen)}
            className="relative p-2 rounded-md text-slate-600 hover:text-[#192B3C] hover:bg-[#F5F6F8] transition-colors border border-transparent hover:border-[#E2E5E9]"
            title={`${pendingApprovals.length} pending approvals`}
          >
            <Bell className="w-4 h-4" />
            {pendingApprovals.length > 0 && (
              <span className="absolute top-1 right-1 w-2 h-2 rounded-full bg-amber-500 ring-2 ring-white" />
            )}
          </button>

          {notificationsOpen && (
            <div className="absolute top-full right-0 mt-1 w-80 bg-white border border-[#E2E5E9] rounded-lg shadow-xl p-3 z-50">
              <div className="flex items-center justify-between pb-2 border-b border-[#E2E5E9]">
                <span className="text-xs font-bold text-[#192B3C]">Actionable Items</span>
                <span className="text-[10px] font-semibold text-[#365C78] bg-[#EBF2F7] px-1.5 py-0.5 rounded">
                  {pendingApprovals.length} Pending
                </span>
              </div>
              <div className="mt-2 space-y-1.5 max-h-60 overflow-y-auto">
                {pendingApprovals.length === 0 ? (
                  <div className="text-center py-4 text-xs text-slate-400">
                    No requests currently awaiting your approval.
                  </div>
                ) : (
                  pendingApprovals.map((req) => (
                    <button
                      key={req.id}
                      onClick={() => {
                        openReviewRequest(req.id);
                        setNotificationsOpen(false);
                      }}
                      className="w-full text-left p-2 rounded hover:bg-[#F5F6F8] border border-[#E2E5E9] text-xs transition-colors"
                    >
                      <div className="flex items-center justify-between font-semibold text-[#192B3C]">
                        <span>{req.id}</span>
                        <span className={`text-[9px] px-1 rounded ${req.formData.priority === 'Urgent' ? 'bg-rose-100 text-rose-800' : 'bg-slate-100 text-slate-700'}`}>
                          {req.formData.priority}
                        </span>
                      </div>
                      <div className="text-[11px] text-slate-600 truncate mt-0.5">{req.formData.workDescription}</div>
                      <div className="text-[10px] text-slate-400 mt-1">Submitted by {req.requesterName}</div>
                    </button>
                  ))
                )}
              </div>
            </div>
          )}
        </div>

        {/* User initials badge */}
        <div
          className="w-8 h-8 rounded flex items-center justify-center text-xs font-bold text-white shadow-xs border border-slate-300"
          style={{ backgroundColor: currentUser.avatarColor || '#192B3C' }}
          title={`${currentUser.name} (${currentUser.role})`}
        >
          {currentUser.initials}
        </div>
      </div>
    </header>
  );
};
