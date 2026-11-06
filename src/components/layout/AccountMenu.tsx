import { useEffect, useId, useRef, useState } from 'react';
import { ChevronDown, LogOut, PenTool } from 'lucide-react';
import { useApp } from '../../context/AppContext';

export function AccountMenu({ onSignOut, inSidebar = false }: { onSignOut?: () => void; inSidebar?: boolean }) {
  const { currentUser, setActiveView, setIsMobileSidebarOpen } = useApp();
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const panelId = useId();
  useEffect(() => {
    if (!open) return;
    function onPointer(event: PointerEvent) {
      if (!root.current?.contains(event.target as Node)) setOpen(false);
    }
    function onKey(event: KeyboardEvent) {
      if (event.key === 'Escape' && root.current?.contains(document.activeElement)) {
        event.stopPropagation();
        setOpen(false);
        trigger.current?.focus();
      }
    }
    document.addEventListener('pointerdown', onPointer);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('pointerdown', onPointer);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  const initials = currentUser.initials || currentUser.name.split(/\s+/).slice(0, 2).map(part => part[0]).join('');
  return <div className={`relative ${inSidebar ? 'w-full' : ''}`} ref={root} onBlur={event => {
    if (!event.currentTarget.contains(event.relatedTarget)) setOpen(false);
  }}>
    <button type="button" ref={trigger} aria-label={`Account menu for ${currentUser.name}`} aria-expanded={open}
      aria-controls={open ? panelId : undefined} onClick={() => setOpen(value => !value)}
      className={`preci-press flex min-h-10 items-center gap-2 rounded-lg border p-1.5 text-left focus-visible:outline-2 focus-visible:outline-offset-2 ${inSidebar
        ? 'w-full border-white/12 bg-white/5 text-white hover:bg-white/10 focus-visible:outline-teal-300'
        : 'border-transparent text-workspace-ink hover:border-workspace-line hover:bg-workspace focus-visible:outline-workspace-teal'}`}>
      <span aria-hidden="true" className="grid size-8 shrink-0 place-items-center rounded-full bg-teal-100 text-xs font-bold text-teal-900">{initials}</span>
      <span className={`${inSidebar ? 'flex-1' : 'hidden xl:block'} min-w-0 max-w-36`}>
        <span className="block truncate text-xs font-bold">{currentUser.name}</span>
        <span className={`block truncate text-[11px] ${inSidebar ? 'text-slate-300' : 'text-workspace-muted'}`}>{currentUser.isSuperAdmin ? 'Super admin' : currentUser.role}</span>
      </span>
      <ChevronDown className="size-3.5 shrink-0 opacity-70" aria-hidden="true" />
    </button>
    {open && <div id={panelId} className={`preci-popover absolute z-50 w-60 max-w-[calc(100vw-1.5rem)] rounded-xl border border-workspace-line bg-white p-1.5 text-workspace-ink shadow-xl ${inSidebar ? 'bottom-full left-0 mb-2 origin-bottom-left' : 'right-0 top-full mt-2 origin-top-right'}`}>
      <div className="border-b border-workspace-line px-3 py-2">
        <p className="break-words text-sm font-bold">{currentUser.name}</p>
        <p className="mt-0.5 break-all text-xs text-workspace-muted">{currentUser.email}</p>
      </div>
      <button type="button" className="preci-menu-action mt-1" onClick={() => {
        setOpen(false);
        setIsMobileSidebarOpen(false);
        setActiveView('user-profile');
      }}><PenTool aria-hidden="true" /> Signature &amp; profile</button>
      {onSignOut && <button type="button" className="preci-menu-action text-rose-800 hover:bg-rose-50" onClick={() => {
        setOpen(false);
        onSignOut();
      }}><LogOut aria-hidden="true" /> Sign out</button>}
    </div>}
  </div>;
}
