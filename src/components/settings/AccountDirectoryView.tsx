import { isShowcaseBuild } from '../../config/demo';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Building2, CheckCircle2, KeyRound, Mail, MoreHorizontal, Search, Shield, SlidersHorizontal, UserRoundCheck, UserRoundMinus, UsersRound, X } from 'lucide-react';
import type { StaffRole, AccountDirectoryEntry, IAccountAdministrationRepository } from '../../services/repository';
import type { CompanyId } from '../../types';
import { INITIAL_COMPANIES } from '../../data/seedData';
import { companyForms } from '../library/FormsLibraryView';

type Editor = { account: AccountDirectoryEntry; mode: 'access' | 'email' | 'status' | 'reset' | 'role' };
type FormGrants = Partial<Record<CompanyId, string[]>>;

const editorTitles = {
  access: 'Manage access',
  email: 'Change sign-in email',
  role: 'Change staff role',
  status: 'Account status',
  reset: 'Password reset link',
};

export function AccountDirectoryView({ repository }: { repository: IAccountAdministrationRepository }) {
  const [accounts, setAccounts] = useState<AccountDirectoryEntry[] | null>(null);
  const [query, setQuery] = useState('');
  const [status, setStatus] = useState('all');
  const [loadError, setLoadError] = useState(false);
  const [notice, setNotice] = useState('');
  const [editor, setEditor] = useState<Editor | null>(null);
  const heading = useRef<HTMLHeadingElement>(null);
  const editorTrigger = useRef<HTMLElement | null>(null);
  const refresh = useCallback(async () => {
    setLoadError(false);
    try { setAccounts(await repository.listAccounts()); }
    catch { setLoadError(true); }
  }, [repository]);
  useEffect(() => { void refresh(); heading.current?.focus(); }, [refresh]);
  useEffect(() => {
    if (!editor && editorTrigger.current) {
      editorTrigger.current.focus({ preventScroll: true });
      editorTrigger.current = null;
    }
  }, [editor]);

  const term = query.trim().toLowerCase();
  const filtered = accounts?.filter(account => (
    (status === 'all' || account.isDisabled === (status === 'disabled'))
    && [account.name, account.email, account.department].some(value => value.toLowerCase().includes(term))
  ));
  const activeCount = accounts?.filter(account => !account.isDisabled).length ?? 0;
  function openEditor(account: AccountDirectoryEntry, mode: Editor['mode'], trigger: HTMLButtonElement) {
    const menu = trigger.closest('details');
    editorTrigger.current = menu?.querySelector('summary') ?? trigger;
    if (menu) menu.open = false;
    setNotice('');
    setEditor({ account, mode });
  }

  return <section className="preci-directory" aria-labelledby="directory-title">
    <header className="preci-directory-hero">
      <div className="relative">
        <p className="preci-eyebrow">Administration</p>
        <h1 id="directory-title" ref={heading} tabIndex={-1} className="mt-2 text-3xl font-bold tracking-tight sm:text-4xl">User directory</h1>
        <p className="mt-2 max-w-lg text-sm leading-relaxed text-workspace-muted">Find an employee, manage their account, and choose which company forms they can start.</p>
      </div>
      {accounts && <dl className="preci-directory-stats relative">
        <div><dt><UsersRound aria-hidden="true" /> Accounts</dt><dd>{accounts.length}</dd></div>
        <div><dt><UserRoundCheck aria-hidden="true" /> Active</dt><dd>{activeCount}</dd></div>
        <div><dt><UserRoundMinus aria-hidden="true" /> Disabled</dt><dd>{accounts.length - activeCount}</dd></div>
      </dl>}
    </header>

    {notice && <p role="status" className="flex items-center gap-2 rounded-lg border border-teal-200 bg-workspace-tint p-3 text-sm text-teal-900"><CheckCircle2 aria-hidden="true" className="size-4 shrink-0" />{notice}</p>}
    {loadError && <div role="alert" className="preci-error flex flex-wrap items-center justify-between gap-2">
      <span>Could not load accounts. Please try again.</span>
      <button type="button" className="preci-link" onClick={() => void refresh()}>Retry</button>
    </div>}
    <div className="workspace-panel">
      <div className="flex flex-wrap items-end justify-between gap-3 border-b border-workspace-line p-4 sm:px-5">
        <div className="w-full max-w-md sm:flex-1">
          <label htmlFor="directory-search" className="preci-field">Find an employee</label>
          <div className="preci-search">
            <Search aria-hidden="true" />
            <input id="directory-search" type="search" placeholder="Search by name, email, or department" value={query} onChange={event => setQuery(event.target.value)} />
          </div>
        </div>
        <label className="preci-field">Account status
          <select className="workspace-control block min-h-10 px-3 text-sm font-normal" value={status} onChange={event => setStatus(event.target.value)}>
            <option value="all">All statuses</option>
            <option value="active">Active</option>
            <option value="disabled">Disabled</option>
          </select>
        </label>
      </div>
      {filtered && <p role="status" className="border-b border-workspace-line bg-workspace/45 px-4 py-2 text-xs font-medium text-workspace-muted sm:px-5">
        Showing {filtered.length} of {accounts?.length} accounts
      </p>}
      {!accounts && !loadError && <p className="p-5 text-sm text-workspace-muted" role="status">Loading accounts…</p>}
      {filtered?.length === 0 && <div className="flex flex-col items-center gap-2 px-5 py-12 text-center">
        <span className="grid size-12 place-items-center rounded-xl bg-workspace-tint text-workspace-teal"><UsersRound aria-hidden="true" /></span>
        <h2 className="text-base font-bold">{accounts?.length ? 'No matching accounts' : 'No employee accounts yet'}</h2>
        <p className="text-sm text-workspace-muted">{accounts?.length ? 'Try a different search or status.' : 'Employee accounts will appear here after registration.'}</p>
        {!!accounts?.length && <button type="button" className="preci-link" onClick={() => { setQuery(''); setStatus('all'); }}>Clear filters</button>}
      </div>}
      <ul className="divide-y divide-workspace-line">
        {filtered?.map(account => <li className="preci-directory-row" key={account.id}>
          <div className="flex min-w-0 items-start gap-3">
            <span className="preci-avatar" aria-hidden="true">{account.name.trim().split(/\s+/).slice(0, 2).map(part => part.charAt(0)).join('')}</span>
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-1.5">
                <h2 className="break-words text-sm font-bold">{account.name}</h2>
                {account.isSuperAdmin && <span className="preci-tag preci-tag-admin"><Shield aria-hidden="true" /> Super admin</span>}
                <span className={`preci-tag ${account.isDisabled ? 'preci-tag-disabled' : 'preci-tag-active'}`}>
                  <span aria-hidden="true" className="size-1.5 rounded-full bg-current" />{account.isDisabled ? 'Disabled' : 'Active'}
                </span>
              </div>
              <p className="mt-1 break-all text-xs text-workspace-muted">{account.email}</p>
              {account.department && <p className="mt-1 text-xs text-workspace-muted">{account.department} Â· {account.role}</p>}
            </div>
          </div>
          <div className="min-w-0 text-xs">
            <p className="mb-1.5 font-semibold text-workspace-muted">Company &amp; form access</p>
            {account.companyGrants === null ? <p className="text-amber-900">This older account needs access migration before it can be edited.</p>
              : account.companyGrants.length === 0 ? <p className="text-workspace-muted">No companies assigned</p>
              : <dl className="space-y-1.5">{account.companyGrants.map(company => <div key={company} className="flex items-start gap-2">
                <dt className="min-w-10 rounded bg-workspace px-1.5 py-0.5 text-center font-bold text-workspace-steel">{company}</dt>
                <dd className="min-w-0 break-words pt-0.5 text-workspace-muted">{account.formGrants?.[company]?.join(', ') || 'No forms assigned'}</dd>
              </div>)}</dl>}
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {!account.isDisabled && account.companyGrants !== null && <button type="button" className="workspace-control preci-press inline-flex min-h-10 items-center gap-2 px-3 text-xs font-semibold" onClick={event => openEditor(account, 'access', event.currentTarget)}>
              <SlidersHorizontal aria-hidden="true" className="size-4 text-workspace-teal" /> Manage access
            </button>}
            <details className="preci-row-menu relative" onBlur={event => {
              if (!event.currentTarget.contains(event.relatedTarget)) event.currentTarget.open = false;
            }} onKeyDown={event => {
              if (event.key === 'Escape') {
                event.currentTarget.open = false;
                event.currentTarget.querySelector('summary')?.focus();
              }
            }}>
              <summary aria-label={`Account actions for ${account.name}`} className="workspace-control preci-icon-button min-h-10 min-w-10"><MoreHorizontal aria-hidden="true" /></summary>
              <div className="preci-popover absolute top-full right-0 z-10 mt-2 w-52 origin-top-right rounded-xl border border-workspace-line bg-white p-1.5 shadow-lg">
                <button type="button" className="preci-menu-action" disabled={account.companyGrants === null} onClick={event => openEditor(account, 'email', event.currentTarget)}><Mail aria-hidden="true" /> Change email</button>
                {account.companyGrants !== null && !account.isDisabled && !['Director', 'General Manager'].includes(account.role) &&
                  <button type="button" className="preci-menu-action" onClick={event => openEditor(account, 'role', event.currentTarget)}><UsersRound aria-hidden="true" /> Change staff role</button>}
                {!isShowcaseBuild && !account.isDisabled && <button type="button" className="preci-menu-action" onClick={event => openEditor(account, 'reset', event.currentTarget)}><KeyRound aria-hidden="true" /> Create reset link</button>}
                <button type="button" className={`preci-menu-action ${account.isDisabled ? '' : 'text-rose-800 hover:bg-rose-50'}`} disabled={account.companyGrants === null} onClick={event => openEditor(account, 'status', event.currentTarget)}>
                  {account.isDisabled ? <UserRoundCheck aria-hidden="true" /> : <UserRoundMinus aria-hidden="true" />}
                  {account.isDisabled ? 'Re-enable account' : 'Disable account'}
                </button>
              </div>
            </details>
          </div>
        </li>)}
      </ul>
    </div>
    {editor && <AccountEditor editor={editor} repository={repository} onClose={() => setEditor(null)} onSaved={message => {
      setEditor(null);
      setNotice(message);
      void refresh();
    }} />}
  </section>;
}

function AccountEditor({ editor, repository, onClose, onSaved }: {
  editor: Editor;
  repository: IAccountAdministrationRepository;
  onClose: () => void;
  onSaved: (message: string) => void;
}) {
  const { account, mode } = editor;
  const dialog = useRef<HTMLDialogElement>(null);
  const [email, setEmail] = useState(account.email);
  const [role, setRole] = useState<StaffRole | ''>('');
  const [companyIds, setCompanyIds] = useState<CompanyId[]>(account.companyGrants ?? []);
  const [formGrants, setFormGrants] = useState<FormGrants>(account.formGrants ?? {});
  const [resetLink, setResetLink] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  useEffect(() => {
    const element = dialog.current;
    element?.showModal();
    return () => element?.close();
  }, []);

  function toggleCompany(id: CompanyId, enabled: boolean) {
    setCompanyIds(ids => enabled ? [...ids, id] : ids.filter(value => value !== id));
    if (!enabled) setFormGrants(grants => {
      const next = { ...grants };
      delete next[id];
      return next;
    });
  }

  function toggleForm(company: CompanyId, form: string, enabled: boolean) {
    setFormGrants(grants => {
      const current = grants[company] ?? [];
      return { ...grants, [company]: enabled ? [...current, form] : current.filter(value => value !== form) };
    });
  }

  async function save() {
    if (busy || resetLink) return;
    setBusy(true);
    setError('');
    try {
      if (mode === 'access') {
        await repository.updateGrants(account.id, companyIds, formGrants);
        onSaved(`Access updated for ${account.name}.`);
      } else if (mode === 'role') {
        if (!role) return;
        await repository.updateAccount(account.id, { role });
        onSaved(`Staff role updated for ${account.name}.`);
      } else if (mode === 'email') {
        await repository.updateAccount(account.id, { email });
        onSaved(`Sign-in email updated for ${account.name}.`);
      } else if (mode === 'status') {
        await repository.updateAccount(account.id, { isDisabled: !account.isDisabled });
        onSaved(account.isDisabled ? `${account.name}’s account was re-enabled.` : `${account.name}’s account was disabled.`);
      } else {
        setResetLink(await repository.createResetLink(account.id));
      }
    } catch {
      setError(mode === 'reset' ? 'Could not create a reset link. Please try again.' : 'Could not save the changes. Check the details and try again.');
    } finally {
      setBusy(false);
    }
  }

  const submitLabel = mode === 'access' ? 'Save access' : mode === 'email' ? 'Save email'
    : mode === 'role' ? 'Save role' : mode === 'reset' ? 'Create reset link' : account.isDisabled ? 'Re-enable account' : 'Disable account';
  return <dialog ref={dialog} className="preci-dialog" aria-labelledby="account-editor-title" onCancel={event => {
    event.preventDefault();
    if (!busy) onClose();
  }}>
    <form className="flex min-h-0 flex-col" onSubmit={event => { event.preventDefault(); void save(); }}>
      <header className="flex shrink-0 items-start justify-between gap-3 border-b border-workspace-line p-4 sm:p-5">
        <div>
          <h2 id="account-editor-title" className="text-xl font-bold">{editorTitles[mode]}</h2>
          <p className="mt-1 break-all text-sm text-workspace-muted">{account.name} · {account.email}</p>
        </div>
        <button type="button" className="workspace-control preci-icon-button shrink-0" aria-label="Close account editor" disabled={busy} onClick={onClose}><X aria-hidden="true" /></button>
      </header>
      <div className="space-y-4 overflow-y-auto p-4 sm:p-5">
        {mode === 'role' && <p className="text-sm text-workspace-muted">Employee is the standard role. IT, Finance and Admin processing also require company access and signing-route processing-team assignment. Signing comes from the request assignment. Super admin separately controls account management.</p>}
        {mode === 'role' && <label className="preci-field">Staff role (currently {account.role})
          <select className="workspace-control block min-h-10 px-3" value={role} required disabled={busy} onChange={event => setRole(event.target.value as StaffRole | '')}>
            <option value="">Choose role</option>
            <option>Employee</option><option value="Admin">Admin processing</option><option>IT</option><option>Finance</option>
          </select>
        </label>}
        {mode === 'access' && <>
          <p className="text-sm text-workspace-muted">Choose the companies this employee can access and the forms they can start in each company.</p>
          <fieldset className="space-y-3" disabled={busy}>
            <legend className="sr-only">Company and form access</legend>
            {INITIAL_COMPANIES.map(company => {
              const enabled = companyIds.includes(company.id);
              const selected = formGrants[company.id] ?? [];
              return <div key={company.id} className={`preci-grant-card ${enabled ? 'preci-grant-selected' : ''}`}>
                <label className="flex cursor-pointer items-center gap-3 p-3">
                  <span className="grid size-9 shrink-0 place-items-center rounded-lg bg-workspace-tint text-workspace-teal"><Building2 aria-hidden="true" className="size-4" /></span>
                  <span className="min-w-0 flex-1"><span className="block text-sm font-bold">{company.name}</span>
                    <span className="block text-xs text-workspace-muted">{company.id} · {enabled ? `${selected.length} ${selected.length === 1 ? 'form' : 'forms'} assigned` : 'No access'}</span></span>
                  <input type="checkbox" className="preci-check" aria-label={`Allow ${company.id} access`} checked={enabled} onChange={event => toggleCompany(company.id, event.target.checked)} />
                </label>
                {enabled && <fieldset className="border-t border-workspace-line px-3 pt-2 pb-3">
                  <legend className="sr-only">Forms for {company.id}</legend>
                  <div className="grid gap-1 sm:grid-cols-2">{companyForms.map(({ name, icon: Icon }) => <label key={name} className="preci-form-option">
                    <input type="checkbox" className="preci-check" checked={selected.includes(name)} onChange={event => toggleForm(company.id, name, event.target.checked)} />
                    <Icon aria-hidden="true" className="size-4 shrink-0 text-workspace-teal" />{name}
                  </label>)}</div>
                  <details className="mt-2 rounded-md px-2 text-xs text-workspace-muted" open={selected.includes('Admin Work Request') || undefined}>
                    <summary className="min-h-8 cursor-pointer py-1.5 font-medium">Legacy form</summary>
                    <label className="preci-form-option"><input type="checkbox" className="preci-check" checked={selected.includes('Admin Work Request')} onChange={event => toggleForm(company.id, 'Admin Work Request', event.target.checked)} /> Admin Work Request</label>
                  </details>
                </fieldset>}
              </div>;
            })}
          </fieldset>
        </>}
        {mode === 'email' && <label className="preci-field">Sign-in email
          <input className="workspace-control block min-h-10 w-full px-3 font-normal" type="email" required maxLength={254} disabled={busy} value={email} onChange={event => setEmail(event.target.value)} />
        </label>}
        {mode === 'status' && <p className="text-sm text-workspace-muted">{account.isDisabled
          ? 'The employee will be able to sign in again. Assign company and form access separately.'
          : 'The employee will be signed out immediately. Their company and form access will be cleared.'}</p>}
        {mode === 'reset' && <>
          <p className="text-sm text-workspace-muted">Share the single-use link privately with the employee. It expires in 30 minutes.</p>
          {resetLink && <label className="preci-field">Password reset link
            <input className="workspace-control block min-h-10 w-full px-3 font-normal" readOnly value={resetLink} onFocus={event => event.currentTarget.select()} />
          </label>}
        </>}
        {error && <p role="alert" className="preci-error">{error}</p>}
      </div>
      <footer className="flex shrink-0 flex-wrap justify-end gap-2 border-t border-workspace-line bg-white p-4 sm:px-5">
        <button type="button" className="workspace-control preci-press min-h-10 px-4 text-sm font-semibold" disabled={busy} onClick={onClose}>{resetLink ? 'Done' : 'Cancel'}</button>
        {!resetLink && <button type="submit" className={`workspace-primary preci-press min-h-10 px-4 text-sm ${mode === 'status' && !account.isDisabled ? 'preci-danger' : ''}`} disabled={busy}>{busy ? 'Working…' : submitLabel}</button>}
      </footer>
    </form>
  </dialog>;
}
