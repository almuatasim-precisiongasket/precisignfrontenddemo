// Frontend route contract. Authentication and server data authorization remain separate.
export const pagePaths = {
  dashboard: '/dashboard', 'forms-library': '/forms', archive: '/archive',
  'user-profile': '/settings/profile', 'workflow-settings': '/settings/signing-routes',
  'user-directory': '/settings/users', 'company-branding': '/settings/branding',
} as const;
export const formPaths = {
  'Administrative & Payment Request': 'administrative-payment', 'IT Request': 'it-request',
  'Cash Voucher': 'cash-voucher', 'Expense Claim': 'expense-claim', 'R&D Initiative': 'rnd',
  'Admin Work Request': 'admin-work',
} as const;
export type PageView = keyof typeof pagePaths | 'create-request' | 'review-sign' | 'requests' | 'not-found';
export type RequestFilter = 'pending' | 'my' | 'all' | 'approved';
export interface PageRoute { view: PageView; formType?: string; requestId?: string; filter?: RequestFilter; }
const filters: RequestFilter[] = ['pending', 'my', 'all', 'approved'];

export function parsePageRoute(href: string): PageRoute {
  const url = new URL(href, 'http://localhost');
  const path = url.pathname.replace(/\/+$/, '') || '/';
  if (path === '/') return { view: 'dashboard' };
  if (path === '/settings') return { view: 'user-profile' };
  if (path === '/rnd') return { view: 'create-request', formType: 'R&D Initiative' };
  for (const [view, value] of Object.entries(pagePaths)) if (path === value) return { view: view as keyof typeof pagePaths };
  if (path === '/requests') {
    const filter = url.searchParams.get('filter') as RequestFilter;
    return { view: 'requests', filter: filters.includes(filter) ? filter : 'all' };
  }
  const request = path.match(/^\/requests\/([^/]+)$/);
  if (request) {
    try {
      const id = decodeURIComponent(request[1]);
      if (id && !/[\/\\\u0000-\u001f]/.test(id)) return { view: 'review-sign', requestId: id };
    } catch { /* Invalid encoding is an unavailable page, not a parser crash. */ }
    return { view: 'not-found' };
  }
  const editor = path.match(/^\/forms\/([^/]+)\/new$/);
  const form = Object.entries(formPaths).find(([, slug]) => slug === editor?.[1]);
  return form ? { view: 'create-request', formType: form[0] } : { view: 'not-found' };
}

export function pageRouteHref(route: PageRoute): string {
  if (route.view === 'review-sign') return `/requests/${encodeURIComponent(route.requestId || '')}`;
  if (route.view === 'create-request') return `/forms/${formPaths[route.formType as keyof typeof formPaths] || 'admin-work'}/new`;
  if (route.view === 'requests') return `/requests?filter=${route.filter || 'all'}`;
  return route.view === 'not-found' ? '/not-found' : pagePaths[route.view];
}
