import React from 'react';
import { AppProvider, useApp } from './context/AppContext';
import { AppSidebar } from './components/layout/AppSidebar';
import { AppHeader } from './components/layout/AppHeader';
import { DashboardView } from './components/dashboard/DashboardView';
import { CreateRequestView } from './components/create/CreateRequestView';
import { ReviewSignView } from './components/review/ReviewSignView';
import { WorkflowSettingsView } from './components/settings/WorkflowSettingsView';
import { UserProfileView } from './components/profile/UserProfileView';
import { companyForms, FormsLibraryView } from './components/library/FormsLibraryView';
import { ArchiveRegisterView } from './components/archive/ArchiveRegisterView';
import { ApiPreciSignRepository } from './services/apiRepository';
import { ApiError } from './services/apiTypes';
import { ApiSession, type SessionState } from './services/apiSession';
import { RequestPdfView } from './components/document/RequestPdfView';

const MainLayout: React.FC = () => {
  const { activeView, currentUser, selectedScope, selectedRequestId, selectedRequestFormType, draftReady, draftError, retryDraft, readOnly, draftCompanyId, selectDraftCompany, companies } = useApp();
  const shortcutForm = companyForms.find(form => form.name === selectedRequestFormType)?.name;
  const libraryEditor = shortcutForm === 'Administrative & Payment Request' ? undefined : shortcutForm;

  return (
    <div className="min-h-screen flex bg-workspace text-workspace-ink">
      {/* Dark Navy Sidebar (#192B3C) */}
      <AppSidebar />

      {/* Main Content Area */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Top Header */}
        <AppHeader />

        {/* Dynamic View Router */}
        <main className={`flex-1 overflow-y-auto pb-16 ${activeView === "dashboard" || activeView === "requests" ? "bg-linear-to-br from-[#fafbfd] to-[#edf3f9]" : ""}`}>
          {(activeView === 'dashboard' || activeView === 'requests') && <DashboardView key={activeView} />}
          {activeView === 'create-request' && (libraryEditor ? <FormsLibraryView key={libraryEditor} initialForm={libraryEditor} /> : readOnly && !draftCompanyId ? <div className="p-6 text-sm space-y-3"><p>Select the company this request is for.</p><select aria-label="Request company" value="" onChange={event => selectDraftCompany(event.target.value as typeof currentUser.companyId)} className="border rounded p-2"><option value="" disabled>Select company</option>{companies.map(company => <option key={company.id} value={company.id}>{company.fullName}</option>)}</select></div> : draftReady || selectedRequestFormType === 'Administrative & Payment Request' ? <CreateRequestView key={`${currentUser.id}:${selectedScope}:${draftCompanyId}:${selectedRequestFormType}`} /> : <div className="p-6 text-sm">{draftError ? <><p role="alert">{draftError}</p><button onClick={retryDraft} className="mt-2 underline">Retry</button></> : 'Loading draft…'}</div>)}
          {activeView === 'review-sign' && <ReviewSignView key={`${currentUser.id}:${selectedScope}:${selectedRequestId}`} />}
          {activeView === 'forms-library' && <FormsLibraryView />}
          {activeView === 'archive' && <ArchiveRegisterView />}
          {activeView === 'workflow-settings' && <WorkflowSettingsView />}
          {activeView === 'user-profile' && <UserProfileView key={currentUser.id} />}
        </main>
      </div>
    </div>
  );
};

const Unavailable = () => <div className="p-6 text-sm" role="status">This feature is not yet available in the connected pilot.</div>;

const ApiApp: React.FC = () => {
  const [state, setState] = React.useState<SessionState>({ status: 'loading' });
  const [email, setEmail] = React.useState('');
  const [password, setPassword] = React.useState('');
  const [connectionError, setConnectionError] = React.useState('');
  const [expired, setExpired] = React.useState(false);
  const [reauthPassword, setReauthPassword] = React.useState('');
  const [reauthBusy, setReauthBusy] = React.useState(false);
  const repository = React.useMemo(() => new ApiPreciSignRepository(), []);
  const session = React.useMemo(() => new ApiSession(repository, setState), [repository]);
  React.useEffect(() => { void session.restore(); }, [session]);
  React.useEffect(() => {
    if (state.status !== 'authenticated') return;
    let active = true;
    const timer = window.setInterval(() => { void repository.getCurrentUser().then(() => { if (active) setConnectionError(''); }).catch(error => { if (!active) return; if (error instanceof ApiError && error.status === 401) setExpired(true); else setConnectionError('Connection lost. Your entered information is kept here. Check the connection before saving again.'); }); }, 30000);
    return () => { active = false; window.clearInterval(timer); };
  }, [state.status, repository, session]);
  if (state.status === 'authenticated') return <AppProvider apiData={state} apiRepository={repository}>
    <div className="flex justify-end bg-white px-4 py-2"><button className="text-xs underline" onClick={() => void session.logout()}>Sign out</button></div>
    {connectionError && <p role="alert" className="px-6 py-2 text-xs text-rose-700">{connectionError}</p>}
    <div hidden={expired} inert={expired}><MainLayout /></div>
    {expired && <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 p-6"><form className="bg-white rounded-lg p-6 space-y-4 max-w-sm" onSubmit={async event => {
      event.preventDefault(); if (reauthBusy) return; setReauthBusy(true);
      try {
        const user = await repository.login(state.bootstrap.user.email, reauthPassword);
        if (user.id !== state.bootstrap.user.id) throw new Error('Sign in as the original user to continue.');
        setExpired(false); setConnectionError(''); setReauthPassword('');
      } catch { setConnectionError('Could not restore your session. Check your password and connection.'); }
      finally { setReauthBusy(false); }
    }}><p className="text-sm">Your session expired. Sign in again as {state.bootstrap.user.name} to keep working. Your entries are preserved.</p>
      {connectionError && <p role="alert" className="text-xs text-rose-700">{connectionError}</p>}
      <input aria-label="Session password" type="password" required value={reauthPassword} onChange={e => setReauthPassword(e.target.value)} className="w-full border rounded p-2" />
      <button disabled={reauthBusy} className="bg-[#365C78] text-white rounded p-2">Restore session</button>
    </form></div>}
  </AppProvider>;
  if (state.status === 'loading') return <div className="p-8 text-sm">Connecting…</div>;
  return <div className="min-h-screen flex items-center justify-center bg-[#F5F6F8] p-6"><form className="w-full max-w-sm bg-white border rounded-lg p-6 space-y-4" onSubmit={(event) => { event.preventDefault(); void session.login(email, password); setPassword(''); }}>
    <h1 className="text-xl font-bold text-[#192B3C]">Sign in to PreciSign</h1>
    {state.status === 'failed' && <p role="alert" className="text-sm text-rose-700">{state.error}</p>}
    <label className="block text-sm">Email<input className="mt-1 w-full border rounded p-2" type="email" required value={email} onChange={e => setEmail(e.target.value)} /></label>
    <label className="block text-sm">Password<input className="mt-1 w-full border rounded p-2" type="password" required value={password} onChange={e => setPassword(e.target.value)} /></label>
    <button className="w-full rounded bg-[#365C78] text-white p-2" type="submit">Sign in</button>
    {state.status === 'failed' && <button className="text-sm underline" type="button" onClick={() => void session.restore()}>Retry connection</button>}
  </form></div>;
};

export default function App() {
  if (import.meta.env.VITE_DATA_MODE === 'api') {
    if (window.location.pathname === '/document-export') {
      const params = new URLSearchParams(window.location.search);
      const requestId = params.get('request');
      const version = Number(params.get('version'));
      if (!requestId || !Number.isSafeInteger(version) || version < 1) return <p data-pdf-error>Invalid document version.</p>;
      return <RequestPdfView requestId={requestId} version={version} />;
    }
    return <ApiApp />;
  }
  if (import.meta.env.VITE_DATA_MODE && import.meta.env.VITE_DATA_MODE !== 'demo') return <div className="p-6 text-sm" role="alert">Invalid data mode. Check the application configuration.</div>;
  return (
    <AppProvider>
      {import.meta.env.VITE_DEMO_NOTICE === 'true' && <p role="status" className="demo-workspace-notice bg-teal-50 px-6 py-2 text-xs text-teal-900">Demo workspace · Changes stay in this browser. Use sample information only.</p>}
      <MainLayout />
    </AppProvider>
  );
}
