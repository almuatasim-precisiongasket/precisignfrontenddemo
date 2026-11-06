import type { AccountDirectoryEntry, IAccountAdministrationRepository } from './repository';
import type { AdminWorkDraft, Company, CompanyId, RequestRecord, UserProfile, ViewingScope, WorkflowConfig } from '../types/index';
import { ApiError } from './apiTypes';
import type { ApprovalInput, BootstrapData, DraftState, OverrideInput, ReasonInput, RequestActions, ResubmitInput, SubmitInput, VersionedRequest } from './apiTypes';

type Transport = (url: string, init?: RequestInit) => Promise<Response>;
export class ApiPreciSignRepository implements IAccountAdministrationRepository, RequestActions {
  private actorId?: string;
  constructor(private transport: Transport = (url, init) => fetch(url, init)) {}
  private async call(path: string, method = 'GET', body?: unknown): Promise<unknown> {
    let response: Response;
    const headers: Record<string,string> = body === undefined ? {} : { 'Content-Type': 'application/json' };
    if (this.actorId && path !== '/auth/login') headers['X-PreciSign-User'] = this.actorId;
    try { response = await this.transport(`/api${path}`, { method, credentials: 'same-origin', headers, body: body === undefined ? undefined : JSON.stringify(body) }); }
    catch { throw new ApiError(0, 'Could not reach the server.', 'NETWORK_ERROR'); }
    if (response.status === 204 && response.ok) return undefined;
    let data: unknown;
    try { data = await response.json(); }
    catch { throw new ApiError(response.ok ? 502 : response.status, 'Invalid server response.', response.ok ? 'INVALID_RESPONSE' : undefined); }
    if (!response.ok) throw new ApiError(response.status, typeof (data as any)?.error === 'string' ? (data as any).error : 'Request failed.');
    return data;
  }
  private profile(data: any): UserProfile {
    if (!data || typeof data.id !== 'string' || typeof data.name !== 'string' || typeof data.email !== 'string' || !['PEW','ICCL','FSG'].includes(data.companyId) || typeof data.role !== 'string') throw new ApiError(502, 'Invalid profile response.', 'INVALID_RESPONSE');
    return data;
  }
  private record(data: any): VersionedRequest {
    if (!data || typeof data.id !== 'string' || !Number.isInteger(data.revision) || data.revision < 1 || !['PEW','ICCL','FSG'].includes(data.companyId) || !Array.isArray(data.approvalHistory) || !data.formData) throw new ApiError(502, 'Invalid request response.', 'INVALID_RESPONSE');
    return data;
  }
  async login(email: string, password: string) { const data: any = await this.call('/auth/login', 'POST', { email, password }); const user = this.profile(data?.user); this.actorId = user.id; return user; }
  async signup(input: { name: string; email: string; department: string; password: string; signatureDataUrl?: string }) {
    await this.call('/auth/signup', 'POST', input);
  }
  async changePassword(currentPassword: string, newPassword: string) {
    await this.call('/auth/change-password', 'POST', { currentPassword, newPassword });
    this.actorId = undefined;
  }
  async listCompanyBranding(): Promise<Company[]> {
    const data = await this.call('/admin/company-branding');
    if (!Array.isArray(data)) throw new ApiError(502, 'Invalid company settings response.', 'INVALID_RESPONSE');
    return data;
  }
  async updateCompanyLogo(id: CompanyId, logoDataUrl: string | null): Promise<string | null> {
    const data = await this.call(`/admin/company-branding/${encodeURIComponent(id)}`, 'PUT', { logoDataUrl }) as { logoDataUrl?: unknown } | null;
    if (data?.logoDataUrl !== null && typeof data?.logoDataUrl !== 'string') throw new ApiError(502, 'Invalid company settings response.', 'INVALID_RESPONSE');
    return data.logoDataUrl;
  }
  async listAccounts(): Promise<AccountDirectoryEntry[]> {
    const data = await this.call('/admin/accounts');
    if (!Array.isArray(data)) throw new ApiError(502, 'Invalid account directory response.', 'INVALID_RESPONSE');
    return data;
  }
  async updateAccount(id: string, update: { email?: string; isDisabled?: boolean }) {
    await this.call(`/admin/accounts/${encodeURIComponent(id)}`, 'PATCH', update);
  }
  async updateGrants(id: string, companyIds: CompanyId[], formsByCompany: Partial<Record<CompanyId, string[]>>) {
    await this.call(`/admin/accounts/${encodeURIComponent(id)}/grants`, 'PUT', { companyIds, formsByCompany });
  }
  async createResetLink(id: string): Promise<string> {
    const result: any = await this.call(`/admin/accounts/${encodeURIComponent(id)}/reset-link`, 'POST');
    if (typeof result?.link !== 'string') throw new ApiError(502, 'Invalid reset link response.');
    return result.link;
  }
  async resetPassword(token: string, newPassword: string) {
    await this.call('/auth/reset-password', 'POST', { token, newPassword });
    this.actorId = undefined;
  }
  async getCurrentUser() { const data: any = await this.call('/auth/me'); return this.profile(data?.user); }
  async logout() { await this.call('/auth/logout', 'POST'); }
  async bootstrap(): Promise<BootstrapData> {
    const data: any = await this.call('/bootstrap');
    if (!data || !Array.isArray(data.companies) || !Array.isArray(data.users) || !Array.isArray(data.workflows)) throw new ApiError(502, 'Invalid bootstrap response.', 'INVALID_RESPONSE');
    this.profile(data.user); data.users.forEach((user: any) => this.profile(user)); this.actorId = data.user.id; return data;
  }
  async getCompanies() { return (await this.bootstrap()).companies; }
  async getCompanyById(id: CompanyId) { return (await this.getCompanies()).find(company => company.id === id) || null; }
  async getUsers() { return (await this.bootstrap()).users; }
  async getUserById(id: string) { return (await this.getUsers()).find(user => user.id === id) || null; }
  async getWorkflows(scope?: ViewingScope) { return (await this.bootstrap()).workflows.filter(w => !scope || scope === 'PEG' || w.companyId === scope); }
  async getWorkflow(companyId: CompanyId, formType: string) { return (await this.getWorkflows(companyId)).find(w => w.formType === formType) || null; }
  async getRequests(scope?: ViewingScope): Promise<VersionedRequest[]> {
    const data = await this.call(`/requests${scope ? `?scope=${encodeURIComponent(scope)}` : ''}`);
    if (!Array.isArray(data)) throw new ApiError(502, 'Invalid request list.', 'INVALID_RESPONSE');
    return data.map(record => this.record(record));
  }
  async getRequestById(id: string) { return this.record(await this.call(`/requests/${encodeURIComponent(id)}`)); }
  async downloadDocumentPdf(id: string, version: number, updatedAt: string): Promise<Blob> {
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    if (this.actorId) headers['X-PreciSign-User'] = this.actorId;
    const response = await this.transport(`/api/requests/${encodeURIComponent(id)}/document-pdf`, {
      method: 'POST', credentials: 'same-origin', headers, body: JSON.stringify({ version, updatedAt }),
    });
    if (!response.ok) {
      const error = await response.json().catch(() => undefined);
      throw new ApiError(response.status, error?.error || 'Could not download PDF.');
    }
    if (response.headers.get('Content-Type')?.split(';')[0] !== 'application/pdf') {
      throw new ApiError(502, 'The server did not return a PDF.');
    }
    return response.blob();
  }
  async submit(input: SubmitInput) { return this.record(await this.call('/requests', 'POST', input)); }
  private async action(id: string, action: string, input: unknown) { return this.record(await this.call(`/requests/${encodeURIComponent(id)}/${action}`, 'POST', input)); }
  approve(id: string, input: ApprovalInput) { return this.action(id, 'approve', input); }
  returnForCorrection(id: string, input: ReasonInput) { return this.action(id, 'return', input); }
  reject(id: string, input: ReasonInput) { return this.action(id, 'reject', input); }
  resubmit(id: string, input: ResubmitInput) { return this.action(id, 'resubmit', input); }
  replaceSigner(id: string, input: ReasonInput & { stageId: string; newUserId: string }) { return this.action(id,'replace',input); }
  acceptReplacement(id: string, input: { expectedRevision: number; accept: boolean }) { return this.action(id,'accept-replacement',input); }
  cancel(id: string, input: ReasonInput) { return this.action(id, 'cancel', input); }
  recordProcessing(id: string, input: Parameters<RequestActions['recordProcessing']>[1]) { return this.action(id, 'process', input); }
  override(id: string, input: OverrideInput) { return this.action(id, 'override', input); }
  private draftPath(company: CompanyId) { return `/drafts/${encodeURIComponent(company)}/${encodeURIComponent('Admin Work Request')}`; }
  private draftState(value: any): DraftState {
    if (!value || !Number.isSafeInteger(value.revision) || value.revision < 0 || (value.data !== null && (typeof value.data !== 'object' || Array.isArray(value.data)))) throw new ApiError(502, 'Invalid draft response.', 'INVALID_RESPONSE');
    return value;
  }
  async readPrivateDraft(company: CompanyId) { return this.draftState(await this.call(this.draftPath(company))); }
  async writePrivateDraft(company: CompanyId, expectedRevision: number, data: AdminWorkDraft) { return this.draftState(await this.call(this.draftPath(company), 'PUT', { expectedRevision, data })); }
  async clearPrivateDraft(company: CompanyId, expectedRevision: number) { return this.draftState(await this.call(this.draftPath(company), 'DELETE', { expectedRevision })); }
  private unavailable(): never { throw new ApiError(501, 'This operation is not available in API mode.', 'NOT_IMPLEMENTED'); }
  async createRequest(_record: RequestRecord): Promise<RequestRecord> { return this.unavailable(); }
  async updateRequest(_record: RequestRecord): Promise<RequestRecord> { return this.unavailable(); }
  async saveWorkflow(workflow: WorkflowConfig): Promise<WorkflowConfig> {
    const data: any = await this.call(`/workflows/${encodeURIComponent(workflow.companyId)}/${encodeURIComponent(workflow.formType)}`, 'PUT', { expectedVersion: workflow.version, workflow });
    if (!data || !Number.isSafeInteger(data.version) || data.version < 1 || !Array.isArray(data.stages)) throw new ApiError(502, 'Invalid workflow response.', 'INVALID_RESPONSE');
    return data;
  }
  async updateUserSignature(id: string, image?: string, text?: string): Promise<UserProfile> {
    if (id !== this.actorId) throw new ApiError(403, 'Only your own signature can be updated.');
    return this.profile(await this.call('/me/signature', 'PATCH', { signatureDataUrl: image, signatureStyleText: text }));
  }
  async getDraft(_scope: ViewingScope, _userId: string, _formType: string): Promise<AdminWorkDraft | null> { return this.unavailable(); }
  async saveDraft(_scope: ViewingScope, _userId: string, _formType: string, _draft: AdminWorkDraft): Promise<void> { return this.unavailable(); }
  async clearDraft(_scope: ViewingScope, _userId: string, _formType: string): Promise<void> { return this.unavailable(); }
  async getDemoSession(): Promise<{ companyId: ViewingScope; userId: string }> { return this.unavailable(); }
  async saveDemoSession(_scope: ViewingScope, _id: string): Promise<void> { return this.unavailable(); }
  async resetToSeedData(): Promise<void> { return this.unavailable(); }
}
