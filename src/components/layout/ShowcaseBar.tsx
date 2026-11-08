import { useState } from 'react';
import { RotateCcw, FlaskConical } from 'lucide-react';
import { useApp } from '../../context/AppContext';
import { WorkspaceDialog } from '../common/WorkspaceDialog';

export function ShowcaseBar() {
  const { users, currentUser, setCurrentUserId, setActiveView, resetDemoData } = useApp();
  const [confirm, setConfirm] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  return <aside aria-label="Interactive showcase controls" className="no-print border-b border-teal-200 bg-teal-50 px-3 py-3 sm:px-6">
    <div className="flex flex-wrap items-center justify-between gap-3">
      <div className="flex items-start gap-2"><FlaskConical aria-hidden="true" className="mt-0.5 size-4 shrink-0 text-teal-800" /><div><p className="text-xs font-bold text-teal-950">PreciSign showcase</p><p className="text-xs text-teal-900">Dont Worry Chap , We are in DEMO mode now !</p></div></div>
      <div className="flex min-w-0 flex-wrap items-center gap-2">
        <label className="text-xs font-semibold text-teal-950">Try as <select aria-label="Demo employee" value={currentUser.id} className="workspace-control ml-2 min-h-10 max-w-[215px] bg-white px-2 text-xs" onChange={event => { setCurrentUserId(event.target.value); }}>
          {users.map(user => <option key={user.id} value={user.id}>{user.name} · {user.isSuperAdmin ? 'Administrator' : user.role}</option>)}
        </select></label>
        <button type="button" className="workspace-control inline-flex min-h-10 items-center gap-1.5 bg-white px-3 text-xs font-semibold" onClick={() => { setConfirm(true); setError(''); }}><RotateCcw aria-hidden="true" className="size-3.5" /> Reset demo</button>
      </div>
    </div>
    {confirm && <WorkspaceDialog titleId="showcase-reset-title" onClose={() => setConfirm(false)} busy={busy}>
      <div className="space-y-4 p-5"><h2 id="showcase-reset-title" className="text-lg font-bold">Restore the sample requests?</h2><p className="text-sm text-workspace-muted">This removes changes, uploads and drafts from this showcase in your browser, then restores the sample employees and requests.</p>
        {error && <p role="alert" className="text-sm text-rose-700">{error}</p>}
        <div className="flex justify-end gap-2"><button type="button" data-dialog-focus disabled={busy} className="workspace-control px-3 py-2 text-sm" onClick={() => setConfirm(false)}>Keep my changes</button><button type="button" disabled={busy} className="workspace-primary px-3 py-2 text-sm" onClick={async () => { setBusy(true); try { await resetDemoData(); setConfirm(false); } catch { setError('Could not reset browser storage. Your changes are still available.'); } finally { setBusy(false); } }}>{busy ? 'Restoring…' : 'Restore sample data'}</button></div>
      </div>
    </WorkspaceDialog>}
  </aside>;
}
