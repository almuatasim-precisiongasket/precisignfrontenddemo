import type { ReactNode } from 'react';
import { Check, FileText, GitBranch, PenLine } from 'lucide-react';
import { BrandLockup } from './BrandLockup';

export function AuthLayout({ children }: { children: ReactNode }) {
  return <div className="preci-auth">
    <aside className="preci-auth-story">
      <BrandLockup />
      <div className="preci-auth-story-content">
        <p className="mb-4 flex items-center gap-2 text-xs font-bold tracking-widest text-teal-200 uppercase">
          <GitBranch aria-hidden="true" className="size-4" /> The PreciRoutes workspace
        </p>
        <p className="max-w-lg text-4xl leading-[1.08] font-bold tracking-tight text-white lg:text-5xl">Every request.<br />A clear route.</p>
        <p className="mt-4 max-w-sm text-base leading-relaxed text-slate-300">Set a route, collect signatures, and keep every request moving.</p>
        <div aria-hidden="true" className="preci-auth-route">
          <div className="flex items-center justify-between gap-3 border-b border-white/15 pb-3">
            <span className="flex items-center gap-2 font-semibold text-white"><FileText className="size-4 text-teal-200" /> A PreciRoute</span>
            <span className="rounded-md bg-white/10 px-2 py-1 text-[11px] text-slate-300">Workflow preview</span>
          </div>
          <div className="preci-auth-steps">
            <span><Check /> Submitted</span>
            <span><PenLine /> In review</span>
            <span><Check /> Complete</span>
          </div>
        </div>
      </div>
    </aside>
    <main className="preci-auth-main">{children}</main>
  </div>;
}
