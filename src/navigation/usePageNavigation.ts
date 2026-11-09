import { useCallback, useEffect, useRef, useState } from 'react';
import { pageRouteHref, parsePageRoute, type PageRoute, type PageView, type RequestFilter } from './pageRoutes';

const positionKey = 'precisignPagePosition';
/** One URL-derived page state; legacy view setters delegate here during migration. */
export function usePageNavigation() {
  const [route, setRoute] = useState(() => parsePageRoute(window.location.href));
  const current = useRef(route);
  const position = useRef(Number(window.history.state?.[positionKey]) || 0);
  const dirty = useRef(new Map<symbol, boolean>());
  const [pending, setPending] = useState<{ href?: string; delta?: number; run?: () => void } | null>(null);
  const pendingRef = useRef(pending);
  const ignorePop = useRef(false);
  const form = useRef(route.formType || 'Admin Work Request');
  const filter = useRef<RequestFilter>(route.filter || 'all');
  const setDirty = useCallback((key: symbol, value: boolean) => { if (value) dirty.current.set(key, true); else dirty.current.delete(key); }, []);
  const hasUnsavedWork = () => [...dirty.current.values()].some(Boolean);
  function applyLocation() {
    const next = parsePageRoute(window.location.href);
    current.current = next;
    if (next.formType) form.current = next.formType;
    if (next.filter) filter.current = next.filter;
    setRoute(next);
  }
  function commit(href: string) {
    const destination = new URL(href, window.location.origin);
    if (destination.origin !== window.location.origin) throw Error('Navigation must stay inside PreciSign.');
    if (destination.pathname + destination.search + destination.hash === window.location.pathname + window.location.search + window.location.hash) return;
    position.current++;
    window.history.pushState({ ...window.history.state, [positionKey]: position.current }, '', href);
    applyLocation();
  }
  function navigate(next: PageRoute) {
    const href = pageRouteHref(next);
    if (href === window.location.pathname + window.location.search) return;
    if (hasUnsavedWork()) { const value = { href }; pendingRef.current = value; setPending(value); return; }
    commit(href);
  }
  useEffect(() => {
    window.history.replaceState({ ...window.history.state, [positionKey]: position.current }, '');
    const onPop = () => {
      const target = Number(window.history.state?.[positionKey]);
      if (ignorePop.current) { ignorePop.current = false; return; }
      if (hasUnsavedWork() && Number.isFinite(target) && target !== position.current) {
        const delta = target - position.current;
        // Restore the original entry before asking, so Stay keeps URL, page and form aligned.
        ignorePop.current = true;
        window.history.go(-delta);
        const value = { delta }; pendingRef.current = value; setPending(value);
        return;
      }
      position.current = Number.isFinite(target) ? target : 0;
      applyLocation();
    };
    const onBeforeUnload = (event: BeforeUnloadEvent) => {
      if (hasUnsavedWork()) { event.preventDefault(); event.returnValue = ''; }
    };
    window.addEventListener('popstate', onPop);
    window.addEventListener('beforeunload', onBeforeUnload);
    return () => { window.removeEventListener('popstate', onPop); window.removeEventListener('beforeunload', onBeforeUnload); };
  }, []);
  return {
    route, pending,
    setDirty,
    runGuarded: (run: () => void) => {
      if (hasUnsavedWork()) { const value = { run }; pendingRef.current = value; setPending(value); }
      else run();
    },
    clearDirty: () => dirty.current.clear(),
    stay: () => { pendingRef.current = null; setPending(null); },
    leave: () => {
      const destination = pendingRef.current;
      dirty.current.clear(); pendingRef.current = null; setPending(null);
      if (destination?.run) destination.run();
      else if (destination?.delta) window.history.go(destination.delta);
      else if (destination?.href) commit(destination.href);
    },
    setActiveView: (view: PageView) => navigate({ view, formType: form.current, filter: filter.current, requestId: current.current.requestId }),
    setForm: (value: string) => { form.current = value; if (current.current.view === 'create-request') navigate({ view: 'create-request', formType: value }); },
    setFilter: (value: RequestFilter) => { filter.current = value; if (current.current.view === 'requests') navigate({ view: 'requests', filter: value }); },
    openRequest: (requestId: string) => navigate({ view: 'review-sign', requestId }),
    selectedForm: route.formType || form.current,
    selectedFilter: route.filter || filter.current,
  };
}
