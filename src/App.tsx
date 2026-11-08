import { WorkspaceDialog } from './components/common/WorkspaceDialog';
import { canConfigureSigningRoutes } from './utils/workflowAdministration';
import { isShowcaseBuild } from './config/demo';
import { ShowcaseAdministration } from './services/showcaseAdministration';
import { ShowcaseBar } from './components/layout/ShowcaseBar';
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
import { SignatureModal } from './components/modals/SignatureModal';
import { CompanyBrandingView } from './components/settings/CompanyBrandingView';
import { AccountDirectoryView } from './components/settings/AccountDirectoryView';
import type { UserProfile } from './types';
import { RequestCompanyField } from './components/create/RequestCompanyField';
import { canUserStartForm } from './utils/companyAccess';
import { Building2, Check, Eye, EyeOff, KeyRound, Mail, PenLine, UserRound, ArrowRight } from 'lucide-react';
import { AuthLayout } from './components/layout/AuthLayout';

const MainLayout: React.FC<{ repository?: ApiPreciSignRepository; onSignOut?: () => void }> = ({ repository, onSignOut }) => {
  const { activeView, setActiveView, navigationPrompt, requestRouteStatus, currentUser, selectedScope, selectedRequestId, selectedRequestFormType, draftReady, draftError, retryDraft, readOnly, draftCompanyId, selectDraftCompany, companies } = useApp();
  const administration = React.useMemo(() => repository ?? (isShowcaseBuild ? new ShowcaseAdministration(currentUser.id) : undefined), [repository, currentUser.id]);
  const canOpenDirectory = Boolean(administration && currentUser.isSuperAdmin);
  const [sidebarHidden, setSidebarHidden] = React.useState(false);
  const awaitingAccess = readOnly && companies.length === 0;
  const unavailable = <section className="workspace-panel m-6 max-w-xl space-y-3 p-6"><h1 className="text-xl font-bold">{activeView === 'not-found' ? 'Page not found' : activeView === 'review-sign' ? 'Request unavailable' : 'Page unavailable'}</h1><p className="text-sm text-workspace-muted">This page may not exist or may not be available to your account.</p><button type="button" className="workspace-primary min-h-10 px-4" onClick={() => setActiveView('dashboard')}>Go to dashboard</button></section>;
  const blockedSettings = (activeView === 'user-directory' || activeView === 'company-branding') && !canOpenDirectory
    || activeView === 'workflow-settings' && !canConfigureSigningRoutes(currentUser) && (Boolean(repository) || isShowcaseBuild);
  const blockedForm = activeView === 'create-request' && (Boolean(repository) || isShowcaseBuild)
    && !companies.some(company => (selectedScope === 'PEG' || company.id === selectedScope) && canUserStartForm(currentUser, company.id, selectedRequestFormType));
  const shortcutForm = companyForms.find(form => form.name === selectedRequestFormType)?.name;
  const libraryEditor = shortcutForm === 'Administrative & Payment Request' ? undefined : shortcutForm;
  function renderRequestEditor() {
    if (libraryEditor) return <FormsLibraryView key={libraryEditor} initialForm={libraryEditor} />;

    if (readOnly && !draftCompanyId) return (
      <section className="mx-auto max-w-xl space-y-5 px-5 py-8">
        <button type="button" className="text-sm font-semibold text-workspace-teal hover:underline" onClick={() => setActiveView('forms-library')}>← Back to forms</button>
        <div>
          <p className="text-sm font-medium text-slate-600">{selectedRequestFormType}</p>
          <h1 className="mt-1 text-2xl font-semibold text-workspace-ink">Choose the request company</h1>
        </div>
        <RequestCompanyField form={selectedRequestFormType} value="" onChange={selectDraftCompany} />
      </section>
    );

    if (readOnly && draftCompanyId && !canUserStartForm(currentUser, draftCompanyId, selectedRequestFormType)) {
      return <div className="p-6"><p>You don’t have access to start this form in the current company.</p><button type="button" className="mt-3 underline" onClick={() => setActiveView('forms-library')}>Back to forms</button></div>;
    }

    if (draftReady || selectedRequestFormType === 'Administrative & Payment Request') {
      return <CreateRequestView key={`${currentUser.id}:${selectedScope}:${draftCompanyId}:${selectedRequestFormType}`} />;
    }

    return <div className="p-6 text-sm">{draftError ? <><p role="alert">{draftError}</p><button onClick={retryDraft} className="mt-2 underline">Retry</button></> : <p role="status">Loading draft…</p>}</div>;
  }

  return (
    <div className="preci-shell flex min-h-screen bg-workspace text-workspace-ink">
      <AppSidebar canOpenDirectory={canOpenDirectory} onSignOut={onSignOut} desktopHidden={sidebarHidden} onHideDesktop={() => setSidebarHidden(true)} />

      <div className="flex-1 flex flex-col min-w-0">
        <AppHeader onSignOut={onSignOut} sidebarHidden={sidebarHidden} onToggleSidebar={() => setSidebarHidden(value => !value)} />
        {isShowcaseBuild && <ShowcaseBar />}
        <main className="flex-1 pb-16">
          {activeView === 'not-found' || blockedSettings || blockedForm ? unavailable
          : activeView === 'review-sign' ? requestRouteStatus === 'loading' ? <p role="status" className="p-6">Loading request…</p> : requestRouteStatus === 'unavailable' ? unavailable : <ReviewSignView key={`${currentUser.id}:${selectedScope}:${selectedRequestId}`} />
          : activeView === 'user-directory' && canOpenDirectory && administration ? <AccountDirectoryView repository={administration} />
          : activeView === 'company-branding' && canOpenDirectory && administration ? <CompanyBrandingView repository={administration} />
          : activeView === 'user-profile' ? <UserProfileView key={currentUser.id} />
          : awaitingAccess ? <section className="workspace-panel mx-4 my-6 max-w-xl space-y-3 p-6 sm:mx-6">
            <span className="grid size-12 place-items-center rounded-xl bg-workspace-tint text-workspace-teal"><Building2 aria-hidden="true" /></span>
            <h1 className="text-2xl font-bold">Welcome, {currentUser.name}</h1>
            <p className="text-sm text-workspace-muted">You haven’t been assigned a company yet. Ask your account administrator for access.</p>
            <button type="button" className="workspace-control preci-press min-h-10 px-3 text-sm font-semibold" onClick={() => setActiveView('user-profile')}>Set up your signature</button>
          </section> : <>
          {(activeView === 'dashboard' || activeView === 'requests' || activeView === 'user-directory') && <DashboardView key={activeView} />}
          {activeView === 'create-request' && renderRequestEditor()}
          {activeView === 'forms-library' && <FormsLibraryView />}
          {activeView === 'archive' && <ArchiveRegisterView />}
          {activeView === 'workflow-settings' && <WorkflowSettingsView />}
          </>}
        </main>
        {navigationPrompt && <WorkspaceDialog titleId="leave-page-heading" onClose={navigationPrompt.stay} className="max-w-md p-6">
          <h2 id="leave-page-heading" className="text-lg font-bold">Leave this page?</h2>
          <p className="mt-2 text-sm text-workspace-muted">You have unsaved changes. Leaving may discard them. Existing saved drafts remain available.</p>
          <div className="mt-5 flex justify-end gap-2"><button type="button" data-dialog-focus className="workspace-control min-h-10 px-4" onClick={navigationPrompt.stay}>Stay</button><button type="button" className="workspace-primary min-h-10 px-4" onClick={navigationPrompt.leave}>Leave</button></div>
        </WorkspaceDialog>}

      </div>
    </div>
  );
};

const ApiApp: React.FC = () => {
  const [state, setState] = React.useState<SessionState>({ status: 'loading' });
  const [email, setEmail] = React.useState('');
  const [password, setPassword] = React.useState('');
  const [signup, setSignup] = React.useState(false);
  const [name, setName] = React.useState('');
  const [department, setDepartment] = React.useState('');
  const [signatureDataUrl, setSignatureDataUrl] = React.useState<string>();
  const [showSignature, setShowSignature] = React.useState(false);
  const [signupBusy, setSignupBusy] = React.useState(false);
  const [loginBusy, setLoginBusy] = React.useState(false);
  const [signupError, setSignupError] = React.useState('');
  const [newPassword, setNewPassword] = React.useState('');
  const [passwordChangeError, setPasswordChangeError] = React.useState('');
  const [passwordChangeBusy, setPasswordChangeBusy] = React.useState(false);
  const [connectionError, setConnectionError] = React.useState('');
  const [expired, setExpired] = React.useState(false);
  const [reauthPassword, setReauthPassword] = React.useState('');
  const [reauthBusy, setReauthBusy] = React.useState(false);
  const [resetToken, setResetToken] = React.useState(() => {
    const token = new URLSearchParams(window.location.hash.slice(1)).get('reset') || '';
    if (token) window.history.replaceState(null, '', window.location.pathname + window.location.search);
    return token;
  });
  const [resetMessage, setResetMessage] = React.useState('');
  const [forgot, setForgot] = React.useState(false);
  const [showPassword, setShowPassword] = React.useState(false);
  const repository = React.useMemo(() => new ApiPreciSignRepository(), []);
  const session = React.useMemo(() => new ApiSession(repository, setState), [repository]);
  React.useEffect(() => {
    const onHashChange = () => {
      const token = new URLSearchParams(window.location.hash.slice(1)).get('reset');
      if (token) { window.history.replaceState(null, '', window.location.pathname + window.location.search); setResetToken(token); }
    };
    window.addEventListener('hashchange', onHashChange);
    return () => window.removeEventListener('hashchange', onHashChange);
  }, []);
  React.useEffect(() => { void session.restore(); }, [session]);
  React.useEffect(() => {
    if (state.status !== 'authenticated') return;
    let active = true;
    const timer = window.setInterval(() => { void repository.getCurrentUser().then(() => { if (active) setConnectionError(''); }).catch(error => { if (!active) return; if (error instanceof ApiError && error.status === 401) setExpired(true); else setConnectionError('Connection lost. Your entered information is kept here. Check the connection before saving again.'); }); }, 30000);
    return () => { active = false; window.clearInterval(timer); };
  }, [state.status, repository, session]);
  if (resetToken) return <div className="min-h-screen flex items-center justify-center p-6"><form className="w-full max-w-sm bg-white border rounded-lg p-6 space-y-4" onSubmit={async event => {
    event.preventDefault(); if (passwordChangeBusy) return; setPasswordChangeBusy(true); setResetMessage('');
    try { await repository.resetPassword(resetToken, newPassword); setResetToken(''); setNewPassword(''); setResetMessage('Password changed. Please sign in.'); await session.restore(); }
    catch { setResetMessage('Could not reset password. The link may have expired or already been used.'); }
    finally { setPasswordChangeBusy(false); }
  }}><h1 className="text-xl font-bold">Set a new password</h1>
    {resetMessage && <p role="status">{resetMessage}</p>}
    <label className="block text-sm">New password<input className="mt-1 w-full border rounded p-2" type="password" autoComplete="new-password" minLength={12} maxLength={1024} required value={newPassword} onChange={e => setNewPassword(e.target.value)} /></label>
    <button disabled={passwordChangeBusy} className="w-full rounded bg-[#365C78] text-white p-2">Set password</button>
    <button type="button" className="underline" onClick={() => setResetToken('')}>Back to sign in</button>
  </form></div>;
  if (state.status === 'authenticated') return <AppProvider apiData={state} apiRepository={repository}>
    {connectionError && <p role="alert" className="px-6 py-2 text-xs text-rose-700">{connectionError}</p>}
    <div hidden={expired} inert={expired}><MainLayout repository={repository} onSignOut={() => { setPassword(''); setShowPassword(false); void session.logout(); }} /></div>
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
  if (state.status === 'loading' && !loginBusy && !signupBusy) return <AuthLayout><p role="status" className="text-sm font-semibold text-workspace-muted">Connecting to PreciSign…</p></AuthLayout>;
  if (state.status === 'password-change') return <div className="min-h-screen flex items-center justify-center p-6"><form className="w-full max-w-sm bg-white border rounded-lg p-6 space-y-4" onSubmit={async event => {
    event.preventDefault();
    if (passwordChangeBusy) return;
    setPasswordChangeBusy(true);
    setPasswordChangeError('');
    try {
      await repository.changePassword(password, newPassword);
      setPassword(''); setNewPassword('');
      await session.restore();
    } catch {
      setPasswordChangeError('Could not change password. Check your current password and try again.');
    } finally { setPasswordChangeBusy(false); }
  }}>
    <h1 className="text-xl font-bold">Choose a new password</h1>
    <p className="text-sm">Change your temporary password to continue as {state.user.name}.</p>
    {passwordChangeError && <p role="alert">{passwordChangeError}</p>}
    <label className="block text-sm">Current password<input className="mt-1 w-full border rounded p-2" type="password" autoComplete="current-password" required value={password} onChange={e => setPassword(e.target.value)} /></label>
    <label className="block text-sm">New password<input className="mt-1 w-full border rounded p-2" type="password" autoComplete="new-password" minLength={12} maxLength={1024} required value={newPassword} onChange={e => setNewPassword(e.target.value)} /></label>
    <button disabled={passwordChangeBusy} className="w-full rounded bg-[#365C78] text-white p-2">Change password</button>
    <button type="button" className="underline" onClick={() => { setPassword(''); setNewPassword(''); void session.logout(); }}>Sign out</button>
  </form></div>;
  const signatureUser: UserProfile = { id: '', name: name.trim(), email, role: 'Admin', department, initials: '', avatarColor: '#365C78', companyId: 'PEW' };
  return <AuthLayout><form className="preci-auth-form" onSubmit={async (event) => {
    event.preventDefault();
    if (!signup) {
      if (loginBusy) return;
      setLoginBusy(true);
      try { await session.login(email, password); }
      finally { setPassword(''); setShowPassword(false); setLoginBusy(false); }
      return;
    }
    if (signupBusy) return;
    setSignupBusy(true);
    setSignupError('');
    try {
      await repository.signup({ name, email, department, password, signatureDataUrl });
      setSignup(false);
      setPassword('');
      await session.login(email, password);
    } catch (error) {
      setSignupError(error instanceof ApiError && error.status === 409
        ? 'Could not create this account. If you already registered, try signing in.'
        : 'Could not create the account. Check your details and try again.');
    } finally { setSignupBusy(false); }
  }}>
    <div>
      <p className="preci-eyebrow">{signup ? 'Employee registration' : 'Employee access'}</p>
      <h1 className="mt-2 text-3xl font-bold tracking-tight text-workspace-ink sm:text-4xl">{signup ? 'Create your account' : 'Welcome back'}</h1>
      <p className="mt-2 text-sm leading-relaxed text-workspace-muted">{signup ? 'Set up your profile. Your administrator will assign company and form access.' : 'Sign in to review, sign, and track your PreciRoutes.'}</p>
    </div>
    {resetMessage && <p role="status" className="rounded-lg bg-workspace-tint p-3 text-sm text-teal-900">{resetMessage}</p>}
    {signupError && signup && <p role="alert" className="preci-error">{signupError}</p>}
    {state.status === 'failed' && !signup && <p role="alert" className="preci-error">{state.error}</p>}
    <fieldset disabled={signupBusy || loginBusy} className="space-y-4">
      {signup && <div className="grid gap-4 sm:grid-cols-2">
        <label className="preci-field">Name<span className="preci-auth-input"><UserRound aria-hidden="true" /><input autoComplete="name" required maxLength={150} value={name} onChange={e => { setName(e.target.value); setSignatureDataUrl(undefined); }} /></span></label>
        <label className="preci-field">Department<span className="preci-auth-input"><Building2 aria-hidden="true" /><input required maxLength={150} value={department} onChange={e => setDepartment(e.target.value)} /></span></label>
      </div>}
      <label className="preci-field">Email<span className="preci-auth-input"><Mail aria-hidden="true" /><input type="email" autoComplete={signup ? 'email' : 'username'} required value={email} onChange={e => setEmail(e.target.value)} /></span></label>
      <div>
        <label htmlFor="account-password" className="preci-field">Password</label>
        <div className="preci-auth-input">
          <KeyRound aria-hidden="true" />
          <input id="account-password" type={showPassword ? 'text' : 'password'} autoComplete={signup ? 'new-password' : 'current-password'} minLength={signup ? 12 : undefined} maxLength={1024} required aria-describedby={signup ? 'account-password-hint' : undefined} value={password} onChange={e => setPassword(e.target.value)} />
          <button type="button" aria-label={showPassword ? 'Hide password' : 'Show password'} className="preci-icon-button" onClick={() => setShowPassword(value => !value)}>{showPassword ? <EyeOff aria-hidden="true" /> : <Eye aria-hidden="true" />}</button>
        </div>
        {signup ? <p id="account-password-hint" className="mt-1.5 text-xs text-workspace-muted">Use at least 12 characters.</p>
        : <button className="preci-link mt-2" type="button" aria-expanded={forgot} onClick={() => setForgot(value => !value)}>Forgot password?</button>}
        {!signup && forgot && <p className="mt-2 rounded-lg bg-workspace p-3 text-sm text-workspace-muted">Contact your super admin for a private password reset link.</p>}
      </div>
      {signup && <div className="rounded-lg border border-workspace-line bg-workspace/50 p-3">
        <button type="button" className="preci-link flex items-center gap-2" disabled={!name.trim()} onClick={() => setShowSignature(true)}>{signatureDataUrl ? <Check aria-hidden="true" className="size-4" /> : <PenLine aria-hidden="true" className="size-4" />}{signatureDataUrl ? 'Edit saved signature' : 'Add a signature (optional)'}</button>
        {!name.trim() && <p className="mt-1 pl-6 text-xs text-workspace-muted">Enter your name to set up a signature.</p>}
      </div>}
      <button className="workspace-primary preci-press flex min-h-11 w-full items-center justify-center gap-2 px-4 py-2.5 text-sm" type="submit">
        {signupBusy ? 'Creating account…' : loginBusy ? 'Signing in…' : signup ? 'Create account' : 'Sign in'}
        {!signupBusy && !loginBusy && <ArrowRight aria-hidden="true" className="size-4" />}
      </button>
    </fieldset>
    <p className="border-t border-workspace-line pt-4 text-center text-sm text-workspace-muted">
      {signup ? 'Already registered?' : 'New to PreciSign?'}{' '}
      <button className="preci-link" type="button" disabled={signupBusy || loginBusy} onClick={() => {
        setSignup(!signup); setPassword(''); setShowPassword(false); setSignupError(''); setForgot(false);
      }}>{signup ? 'Back to sign in' : 'Create an account'}</button>
    </p>
  </form>
  {showSignature && <SignatureModal isOpen user={signatureUser} title="Set up your signature" confirmLabel="Use this signature" onClose={() => setShowSignature(false)} onConfirm={async value => {
    setSignatureDataUrl(value);
    setShowSignature(false);
    return { success: true };
  }} />}
  </AuthLayout>;
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
      {!isShowcaseBuild && import.meta.env.VITE_DEMO_NOTICE === 'true' && <p role="status" className="demo-workspace-notice bg-teal-50 px-6 py-2 text-xs text-teal-900">Demo workspace · Changes stay in this browser. Use sample information only.</p>}
      <MainLayout />
    </AppProvider>
  );
}
