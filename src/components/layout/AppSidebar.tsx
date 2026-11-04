import { needsMyAction } from '../../utils/actionQueue';
import React, { useState } from 'react';
import { useApp } from '../../context/AppContext';
import {
  Inbox,
  FileText,
  PlusCircle,
  FolderOpen,
  Library,
  Archive,
  Sliders,
  PenTool,
  ChevronDown,
  RotateCcw,
  Shield,
  Building2,
  X,
  CheckCircle2,
  AlertCircle,
  Globe,
} from 'lucide-react';
import { PARENT_ORGANIZATION_ID, ViewingScope } from '../../types';

export const AppSidebar: React.FC = () => {
  const {
    readOnly,
    activeView,
    setActiveView,
    isMobileSidebarOpen,
    setIsMobileSidebarOpen,
    requestsFilter,
    setRequestsFilter,
    companyRequests,
    currentUser,
    users,
    setCurrentUserId,
    resetDemoData,
    selectedCompany,
    selectedScope,
    setSelectedScope,
    companies,
  } = useApp();

  const [adminOpen, setAdminOpen] = useState(true);
  const [showUserMenu, setShowUserMenu] = useState(false);
  const [showScopeDropdown, setShowScopeDropdown] = useState(false);

  // Count requests pending current user's approval
  const pendingApprovalsCount = companyRequests.filter(
    (r) => needsMyAction(r,currentUser.id)
  ).length;

  // Count user's own active requests
  const myRequestsCount = companyRequests.filter(
    (r) => r.requesterId === currentUser.id
  ).length;

  const hasSignature = Boolean(currentUser.signatureDataUrl || currentUser.signatureStyleText);

  const handleNav = (
    view:
      | 'dashboard'
      | 'create-request'
      | 'review-sign'
      | 'requests'
      | 'workflow-settings'
      | 'user-profile'
      | 'forms-library'
      | 'archive',
    filter?: 'pending' | 'my' | 'all' | 'approved'
  ) => {
    if (filter) {
      setRequestsFilter(filter);
    }
    setActiveView(view);
    setIsMobileSidebarOpen(false);
  };

  const isMyApprovalsActive =
    (activeView === 'dashboard' || activeView === 'requests') && requestsFilter === 'pending';
  const isMyRequestsActive =
    (activeView === 'dashboard' || activeView === 'requests') && requestsFilter === 'my';
  const isAllRequestsActive =
    (activeView === 'dashboard' || activeView === 'requests') && requestsFilter === 'all';

  const isGroupView = selectedScope === PARENT_ORGANIZATION_ID;

  return (
    <>
      {/* Mobile Backdrop */}
      {isMobileSidebarOpen && (
        <div
          onClick={() => setIsMobileSidebarOpen(false)}
          className="fixed inset-0 bg-slate-950/60 z-40 md:hidden backdrop-blur-xs transition-opacity"
          aria-hidden="true"
        />
      )}

      <aside
        className={`app-sidebar w-64 bg-[#192B3C] text-slate-200 flex flex-col justify-between shrink-0 h-screen border-r border-[#24394E] select-none transition-transform duration-200 ease-in-out fixed inset-y-0 left-0 z-50 ${
          isMobileSidebarOpen ? 'translate-x-0 shadow-2xl' : '-translate-x-full'
        } md:static md:translate-x-0 md:shadow-none md:z-30`}
      >
        {/* TOP SECTION: Header & Scrollable Nav */}
        <div className="flex flex-col min-h-0 flex-1">
          {/* Company & Product Header */}
          <div className="h-16 flex items-center justify-between px-4 border-b border-[#24394E] bg-[#142332] shrink-0">
            <div className="flex items-center gap-3 min-w-0">
              <div className="w-8 h-8 rounded-md bg-white/10 p-1 flex items-center justify-center shrink-0 border border-white/10 shadow-inner">
                <img
                  src="/assets/aistudio/precision-logo_e56c0764.png"
                  alt="Precision Engineering Group"
                  className="w-6 h-6 object-contain brightness-0 invert"
                  loading="eager"
                />
              </div>
              <div className="min-w-0">
                <div className="text-sm font-bold text-white tracking-tight truncate flex items-center gap-1.5">
                  <span>PreciSign</span>
                  <span className="text-[9px] font-semibold uppercase px-1.5 py-0.5 rounded bg-[#365C78]/70 text-slate-100 border border-[#4B799C]">
                    PreciRoutes
                  </span>
                </div>
                <div className="text-[11px] text-slate-400 truncate font-normal">
                  Precision Engineering Group
                </div>
              </div>
            </div>

            {/* Mobile close button */}
            <button
              onClick={() => setIsMobileSidebarOpen(false)}
              className="md:hidden p-1.5 text-slate-400 hover:text-white rounded-md hover:bg-[#24394E]"
              title="Close Navigation"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          {/* Scrollable Navigation List */}
          <nav className="p-3 space-y-1 text-xs font-medium overflow-y-auto flex-1">
            {/* Section: Workflow Operations */}
            <div className="px-3 py-1.5 text-[10px] font-extrabold text-slate-400 uppercase tracking-wider">
              Workspace
            </div>

            {/* 1. My Approvals */}
            <button
              onClick={() => handleNav('dashboard', 'pending')}
              className={`w-full flex items-center justify-between px-3 py-2 rounded-lg transition-all ${
                isMyApprovalsActive
                  ? 'bg-[#365C78] text-white font-semibold shadow-sm border-l-4 border-amber-400'
                  : 'text-slate-300 hover:bg-[#24394E] hover:text-white'
              }`}
            >
              <div className="flex items-center gap-2.5 min-w-0">
                <Inbox className={`w-4 h-4 shrink-0 ${isMyApprovalsActive ? 'text-amber-400' : 'text-slate-300'}`} />
                <span className="truncate">Needs my action</span>
              </div>
              {pendingApprovalsCount > 0 ? (
                <span className="bg-amber-500 text-slate-950 text-[10px] font-black px-1.5 py-0.5 rounded-full min-w-[18px] text-center tabular-nums shadow-xs">
                  {pendingApprovalsCount}
                </span>
              ) : (
                <span className="text-[10px] text-slate-400 tabular-nums font-mono">0</span>
              )}
            </button>

            {/* 2. My Requests */}
            <button
              onClick={() => handleNav('dashboard', 'my')}
              className={`w-full flex items-center justify-between px-3 py-2 rounded-lg transition-all ${
                isMyRequestsActive
                  ? 'bg-[#365C78] text-white font-semibold shadow-sm border-l-4 border-sky-400'
                  : 'text-slate-300 hover:bg-[#24394E] hover:text-white'
              }`}
            >
              <div className="flex items-center gap-2.5 min-w-0">
                <FileText className={`w-4 h-4 shrink-0 ${isMyRequestsActive ? 'text-sky-300' : 'text-slate-300'}`} />
                <span className="truncate">My PreciRoutes</span>
              </div>
              <span className="text-[10px] text-slate-400 tabular-nums font-mono">{myRequestsCount}</span>
            </button>

            {/* 3. Create Request */}
            <button
              onClick={() => handleNav('create-request')}
              className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-lg transition-all ${
                activeView === 'create-request'
                  ? 'bg-[#365C78] text-white font-semibold shadow-sm border-l-4 border-emerald-400'
                  : 'text-slate-200 hover:bg-[#24394E] hover:text-white'
              }`}
            >
              <PlusCircle className="w-4 h-4 shrink-0 text-emerald-400" />
              <span className="truncate">New PreciRoute</span>
            </button>

            {/* 4. All Requests */}
            <button
              onClick={() => handleNav('dashboard', 'all')}
              className={`w-full flex items-center justify-between px-3 py-2 rounded-lg transition-all ${
                isAllRequestsActive
                  ? 'bg-[#365C78] text-white font-semibold shadow-sm border-l-4 border-indigo-400'
                  : 'text-slate-300 hover:bg-[#24394E] hover:text-white'
              }`}
            >
              <div className="flex items-center gap-2.5 min-w-0">
                <FolderOpen className={`w-4 h-4 shrink-0 ${isAllRequestsActive ? 'text-indigo-300' : 'text-slate-300'}`} />
                <span className="truncate">All routes</span>
              </div>
              <span className="text-[10px] text-slate-400 tabular-nums font-mono">{companyRequests.length}</span>
            </button>

            {/* Section: Documents & Repositories */}
            <div className="pt-3 px-3 py-1.5 text-[10px] font-extrabold text-slate-400 uppercase tracking-wider">
              Documents
            </div>

            {/* 5. Forms Library */}
            <button
              onClick={() => handleNav('forms-library')}
              className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-lg transition-all ${
                activeView === 'forms-library'
                  ? 'bg-[#365C78] text-white font-semibold shadow-sm border-l-4 border-blue-400'
                  : 'text-slate-300 hover:bg-[#24394E] hover:text-white'
              }`}
            >
              <Library className="w-4 h-4 shrink-0 text-slate-300" />
              <span className="truncate">Forms Library</span>
            </button>

            {/* 6. Archive */}
            <button
              onClick={() => handleNav('archive')}
              className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-lg transition-all ${
                activeView === 'archive'
                  ? 'bg-[#365C78] text-white font-semibold shadow-sm border-l-4 border-purple-400'
                  : 'text-slate-300 hover:bg-[#24394E] hover:text-white'
              }`}
            >
              <Archive className="w-4 h-4 shrink-0 text-slate-300" />
              <span className="truncate">Archive &amp; Register</span>
            </button>

            {/* 7. Administration */}
            <div className="pt-3">
              <button
                onClick={() => setAdminOpen(!adminOpen)}
                className="w-full flex items-center justify-between px-3 py-1.5 text-slate-400 hover:text-slate-200 uppercase tracking-wider text-[10px] font-extrabold"
              >
                <span>Administration</span>
                <ChevronDown
                  className={`w-3.5 h-3.5 transition-transform duration-200 ${adminOpen ? 'rotate-180' : ''}`}
                />
              </button>

              {adminOpen && (
                <div className="mt-1 space-y-0.5 pl-2 border-l border-[#24394E] ml-3">
                  <button
                    onClick={() => handleNav('workflow-settings')}
                    className={`w-full flex items-center gap-2 px-2.5 py-1.5 rounded-md text-xs transition-colors ${
                      activeView === 'workflow-settings'
                        ? 'bg-[#24394E] text-white font-semibold border-l-2 border-[#5B8FB9]'
                        : 'text-slate-400 hover:bg-[#24394E]/60 hover:text-white'
                    }`}
                  >
                    <Sliders className="w-3.5 h-3.5 shrink-0" />
                    <span className="truncate">Forms &amp; Workflows</span>
                  </button>


                </div>
              )}
            </div>
                  <button
                    onClick={() => handleNav('user-profile')}
                    className={`w-full flex items-center justify-between px-2.5 py-1.5 rounded-md text-xs transition-colors ${
                      activeView === 'user-profile'
                        ? 'bg-[#24394E] text-white font-semibold border-l-2 border-[#5B8FB9]'
                        : 'text-slate-400 hover:bg-[#24394E]/60 hover:text-white'
                    }`}
                  >
                    <div className="flex items-center gap-2 min-w-0">
                      <PenTool className="w-3.5 h-3.5 shrink-0" />
                      <span className="truncate">Signature &amp; profile</span>
                    </div>
                    {hasSignature ? (
                      <CheckCircle2 className="w-3 h-3 text-emerald-400 shrink-0" />
                    ) : (
                      <AlertCircle className="w-3 h-3 text-amber-400 shrink-0" />
                    )}
                  </button>
          </nav>
        </div>

        {/* BOTTOM FIXED FOOTER: Organization Scope & User Persona Card */}
        <div className="p-3 border-t border-[#24394E] bg-[#12202D] shrink-0 space-y-2">
          {/* Active Viewing Scope Card */}
          <div className="relative">
            <button
              onClick={() => setShowScopeDropdown(!showScopeDropdown)}
              className="w-full px-2.5 py-1.5 bg-[#182838] hover:bg-[#1f3347] rounded-md border border-[#2d4763] flex items-center justify-between text-left text-[11px] transition-colors group"
              title="Click to switch organization viewing scope"
            >
              <div className="flex items-center gap-2 min-w-0">
                {isGroupView ? (
                  <Globe className="w-3.5 h-3.5 text-amber-400 shrink-0" />
                ) : (
                  <Building2 className="w-3.5 h-3.5 text-[#5B8FB9] shrink-0" />
                )}
                <div className="min-w-0 leading-tight">
                  <div className="font-semibold text-slate-200 truncate flex items-center gap-1">
                    <span>{isGroupView ? 'Group View (PEG)' : selectedCompany.code}</span>
                  </div>
                  <div className="text-[9px] text-slate-400 truncate">
                    {isGroupView ? 'All Subsidiary Entities' : selectedCompany.name}
                  </div>
                </div>
              </div>
              <div className="flex items-center gap-1 shrink-0 ml-1">
                <span className="text-[9px] font-mono px-1 py-0.5 rounded bg-[#24394E] text-slate-300 border border-[#365C78]">
                  {selectedScope}
                </span>
                <ChevronDown className={`w-3 h-3 text-slate-400 group-hover:text-white transition-transform ${showScopeDropdown ? 'rotate-180' : ''}`} />
              </div>
            </button>

            {/* Scope Switcher Dropdown */}
            {showScopeDropdown && (
              <div className="absolute bottom-full left-0 right-0 mb-2 bg-[#182838] border border-[#365C78] rounded-lg shadow-xl p-1.5 z-50 text-xs">
                <div className="px-2 py-1 text-[9px] font-bold uppercase tracking-wider text-slate-400 flex items-center justify-between">
                  <span>Organization Scope</span>
                  <span className="text-amber-400 font-normal">Switch View</span>
                </div>
                
                {/* Group View Option */}
                <button
                  onClick={() => {
                    setSelectedScope(PARENT_ORGANIZATION_ID);
                    setShowScopeDropdown(false);
                  }}
                  className={`w-full flex items-center justify-between px-2 py-1.5 rounded text-left transition-colors mb-1 ${
                    selectedScope === PARENT_ORGANIZATION_ID
                      ? 'bg-[#365C78] text-white font-semibold'
                      : 'text-slate-300 hover:bg-[#24394E]'
                  }`}
                >
                  <div className="flex items-center gap-2 truncate">
                    <Globe className="w-3.5 h-3.5 text-amber-400 shrink-0" />
                    <span className="truncate">Parent Group View (PEG)</span>
                  </div>
                  <span className="text-[9px] px-1 bg-amber-500/20 text-amber-300 rounded border border-amber-500/30">
                    All
                  </span>
                </button>

                <div className="my-1 border-t border-[#24394E]" />

                {/* Company Entities */}
                <div className="space-y-0.5 max-h-36 overflow-y-auto">
                  {companies.map((c) => (
                    <button
                      key={c.id}
                      onClick={() => {
                        setSelectedScope(c.id as ViewingScope);
                        setShowScopeDropdown(false);
                      }}
                      className={`w-full flex items-center justify-between px-2 py-1.5 rounded text-left transition-colors ${
                        selectedScope === c.id
                          ? 'bg-[#365C78] text-white font-semibold'
                          : 'text-slate-300 hover:bg-[#24394E]'
                      }`}
                    >
                      <div className="flex items-center gap-2 truncate">
                        <Building2 className="w-3.5 h-3.5 text-[#5B8FB9] shrink-0" />
                        <span className="truncate">{c.code} — {c.name}</span>
                      </div>
                      <span className="text-[9px] text-slate-400 font-mono">{c.id}</span>
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Current User Card */}
          <div className="relative">
            <button
              onClick={() => { if (!readOnly) setShowUserMenu(!showUserMenu); }}
              className="w-full flex items-center justify-between p-2 rounded-lg hover:bg-[#24394E] transition-all text-left border border-[#24394E] hover:border-[#365C78] bg-[#182838]/60"
            >
              <div className="flex items-center gap-2.5 min-w-0">
                <div className="relative shrink-0">
                  <div
                    className="w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold text-white shrink-0 border border-white/20 shadow-xs"
                    style={{ backgroundColor: currentUser.avatarColor || '#365C78' }}
                  >
                    {currentUser.initials}
                  </div>
                  {/* Signature status indicator badge */}
                  <div
                    className={`absolute -bottom-0.5 -right-0.5 w-3 h-3 rounded-full border-2 border-[#12202D] flex items-center justify-center ${
                      hasSignature ? 'bg-emerald-500' : 'bg-amber-500'
                    }`}
                    title={hasSignature ? 'Signature Configured' : 'Signature Required'}
                  />
                </div>
                <div className="min-w-0 leading-tight">
                  <div className="text-xs font-bold text-white truncate flex items-center gap-1">
                    <span>{currentUser.name}</span>
                  </div>
                  <div className="text-[10px] text-slate-400 truncate">
                    {currentUser.role} · {currentUser.department}
                  </div>
                  <div className="text-[9px] flex items-center gap-1 mt-0.5">
                    {hasSignature ? (
                      <span className="text-emerald-400 font-medium flex items-center gap-0.5">
                        <CheckCircle2 className="w-2.5 h-2.5" /> Signature Ready
                      </span>
                    ) : (
                      <span className="text-amber-400 font-medium flex items-center gap-0.5">
                        <AlertCircle className="w-2.5 h-2.5" /> No Signature
                      </span>
                    )}
                  </div>
                </div>
              </div>
              <ChevronDown className={`w-3.5 h-3.5 text-slate-400 shrink-0 ml-1 transition-transform ${showUserMenu ? 'rotate-180' : ''}`} />
            </button>

            {/* Quick Persona Switcher popover */}
            {!readOnly && showUserMenu && (
              <div className="absolute bottom-full left-0 right-0 mb-2 bg-[#192B3C] border border-[#365C78] rounded-xl shadow-2xl p-2.5 z-50 space-y-2">
                <div className="px-1 py-0.5 text-[10px] font-bold uppercase tracking-wider text-[#5B8FB9] flex items-center justify-between">
                  <span className="flex items-center gap-1">
                    <Shield className="w-3.5 h-3.5 text-amber-400" /> Switch Demo Persona
                  </span>
                  <span className="text-[9px] text-slate-400 font-normal">Role Test</span>
                </div>
                
                <p className="px-1 text-[10px] text-slate-400 leading-tight">
                  Switch persona to evaluate stage approvals, signature authorization, and permissions:
                </p>

                <div className="max-h-48 overflow-y-auto space-y-1 pr-1 custom-scrollbar">
                  {users.map((u) => {
                    const isSelected = u.id === currentUser.id;
                    return (
                      <button
                        key={u.id}
                        onClick={() => {
                          setCurrentUserId(u.id);
                          setShowUserMenu(false);
                        }}
                        className={`w-full flex items-center justify-between p-1.5 rounded-lg text-xs transition-colors ${
                          isSelected
                            ? 'bg-[#365C78] text-white font-semibold ring-1 ring-[#5B8FB9]'
                            : 'text-slate-300 hover:bg-[#24394E] hover:text-white'
                        }`}
                      >
                        <div className="flex items-center gap-2 truncate min-w-0">
                          <span
                            className="w-6 h-6 rounded-full text-[10px] flex items-center justify-center font-bold text-white shrink-0 border border-white/20"
                            style={{ backgroundColor: u.avatarColor || '#365C78' }}
                          >
                            {u.initials}
                          </span>
                          <div className="min-w-0 text-left leading-tight">
                            <div className="truncate font-semibold">{u.name}</div>
                            <div className="text-[9px] text-slate-300/80 truncate">
                              {u.role} ({u.companyId})
                            </div>
                          </div>
                        </div>
                        {isSelected && <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400 shrink-0 ml-1" />}
                      </button>
                    );
                  })}
                </div>

                {/* Direct Action Links */}
                <div className="pt-2 border-t border-[#24394E] space-y-1">
                  <button
                    onClick={() => {
                      handleNav('user-profile');
                      setShowUserMenu(false);
                    }}
                    className="w-full flex items-center justify-center gap-1.5 py-1.5 text-[11px] font-medium text-slate-200 bg-[#24394E] hover:bg-[#365C78] rounded-md transition-colors"
                  >
                    <PenTool className="w-3 h-3 text-[#5B8FB9]" />
                    <span>Manage Signature &amp; profile</span>
                  </button>

                  <button
                    onClick={() => {
                      resetDemoData();
                      setShowUserMenu(false);
                    }}
                    className="w-full flex items-center justify-center gap-1.5 py-1 text-[10px] font-medium text-slate-400 hover:text-rose-300 hover:bg-rose-950/40 rounded transition-colors"
                  >
                    <RotateCcw className="w-3 h-3 text-rose-400" />
                    <span>Reset All Demo Data</span>
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      </aside>
    </>
  );
};

