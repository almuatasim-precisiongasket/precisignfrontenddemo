import type { PriorityLevel, RequestRecord } from '../types';

export interface DashboardFilterInput {
  internalTab: 'pending' | 'my' | 'all' | 'returned' | 'approved';
  companyRequests: readonly RequestRecord[];
  pendingForMeRequests: readonly RequestRecord[];
  myRequests: readonly RequestRecord[];
  returnedRequests: readonly RequestRecord[];
  approvedRequests: readonly RequestRecord[];
  searchQuery: string;
  sortBy: 'date-desc' | 'date-asc' | 'priority' | 'id';
  formFilter: string;
  statusFilter: string;
}

/** Presentational filtering only; the caller supplies already-authorized lists. */
export function filterDashboardRequests({ internalTab, pendingForMeRequests, myRequests, returnedRequests, approvedRequests, companyRequests, searchQuery, sortBy, formFilter, statusFilter }: DashboardFilterInput): RequestRecord[] {
  let list: readonly RequestRecord[] = [];
  if (internalTab === 'pending') {
    list = pendingForMeRequests;
  } else if (internalTab === 'my') {
    list = myRequests;
  } else if (internalTab === 'returned') {
    list = returnedRequests;
  } else if (internalTab === 'approved') {
    list = approvedRequests;
  } else {
    list = companyRequests;
  }
  list = list.filter(r => (formFilter === 'ALL' || r.formType === formFilter) && (statusFilter === 'ALL' || r.status === statusFilter));
  if (searchQuery.trim()) {
    const q = searchQuery.toLowerCase();
    list = list.filter(
      (r) =>
        r.id.toLowerCase().includes(q) ||
        r.formType.toLowerCase().includes(q) ||
        r.requesterName.toLowerCase().includes(q) ||
        r.title.toLowerCase().includes(q) ||
        r.formData.workDescription.toLowerCase().includes(q) ||
        (r.currentApproverName && r.currentApproverName.toLowerCase().includes(q))
    );
  }
  // Sort list
  const sorted = [...list];
  if (sortBy === 'date-desc') {
    sorted.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  } else if (sortBy === 'date-asc') {
    sorted.sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());
  } else if (sortBy === 'priority') {
    const order: Record<PriorityLevel, number> = { Urgent: 0, Medium: 1, Low: 2 };
    sorted.sort((a, b) => order[a.formData.priority] - order[b.formData.priority]);
  } else if (sortBy === 'id') {
    sorted.sort((a, b) => a.id.localeCompare(b.id));
  }
  return sorted;
}
