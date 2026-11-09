import { activeDemoDataset } from '../data/demoDataset';
import type { DemoDataset } from '../data/showcaseData';
import { currentCompanyDisplay } from '../utils/companyDisplay';
import {
  Company,
  CompanyId,
  ViewingScope,
  PARENT_ORGANIZATION_ID,
  UserProfile,
  WorkflowConfig,
  RequestRecord,
  AdminWorkFormData,
  AdminWorkDraft,
} from '../types/index';

/**
 * Repository interface defining data contracts for PreciSign.
 * This abstraction decouples UI components from persistence.
 * When a real backend is implemented, a REST/GraphQL client implementation
 * (e.g. ApiPreciSignRepository) can replace LocalStoragePreciSignRepository
 * with zero changes to presentation components.
 */
export interface IPreciSignRepository {
  // Companies & Group
  getCompanies(): Promise<Company[]>;
  getCompanyById(id: CompanyId): Promise<Company | null>;

  // Users & Demo Personas
  getUsers(): Promise<UserProfile[]>;
  getUserById(id: string): Promise<UserProfile | null>;
  updateUserSignature(
    userId: string,
    signatureDataUrl?: string,
    signatureStyleText?: string
  ): Promise<UserProfile>;

  // Workflows
  getWorkflows(scope?: ViewingScope): Promise<WorkflowConfig[]>;
  getWorkflow(companyId: CompanyId, formType: string): Promise<WorkflowConfig | null>;
  saveWorkflow(workflow: WorkflowConfig): Promise<WorkflowConfig>;

  // Requests
  getRequests(scope?: ViewingScope): Promise<RequestRecord[]>;
  getRequestById(id: string): Promise<RequestRecord | null>;
  createRequest(record: RequestRecord): Promise<RequestRecord>;
  updateRequest(record: RequestRecord): Promise<RequestRecord>;

  // Drafts scoped by company/scope, requester, and document type
  getDraft(scope: ViewingScope, requesterId: string, formType: string): Promise<AdminWorkDraft | null>;
  saveDraft(scope: ViewingScope, requesterId: string, formType: string, draft: AdminWorkDraft): Promise<void>;
  clearDraft(scope: ViewingScope, requesterId: string, formType: string): Promise<void>;

  // Session / Demo Preferences
  getDemoSession(): Promise<{ companyId: ViewingScope; userId: string }>;
  saveDemoSession(companyId: ViewingScope, userId: string): Promise<void>;

  // Prototype Data Reset
  resetToSeedData(): Promise<void>;
}

/** Account administration exists only in the connected application. */
export type StaffRole = 'Employee' | 'Admin' | 'IT' | 'Finance';

export interface AccountDirectoryEntry {
  role: UserProfile['role'];
  id: string;
  name: string;
  email: string;
  department: string;
  companyGrants: CompanyId[] | null;
  formGrants: Partial<Record<CompanyId, string[]>> | null;
  isSuperAdmin: boolean;
  isDisabled: boolean;
}

export interface IAccountAdministrationRepository extends IPreciSignRepository {
  listCompanyBranding(): Promise<Company[]>;
  updateCompanyLogo(id: CompanyId, logoDataUrl: string | null): Promise<string | null>;
  listAccounts(): Promise<AccountDirectoryEntry[]>;
  updateAccount(id: string, update: { email?: string; isDisabled?: boolean; role?: StaffRole }): Promise<void>;
  updateGrants(id: string, companyIds: CompanyId[], formsByCompany: Partial<Record<CompanyId, string[]>>): Promise<void>;
  createResetLink(id: string): Promise<string>;
}

const STORAGE_KEYS = {
  REQUESTS: 'precisign_repo_requests_v2',
  WORKFLOWS: 'precisign_repo_workflows_v2',
  USERS: 'precisign_repo_users_v2',
  COMPANIES: 'precisign_repo_companies_v2',
  SESSION: 'precisign_repo_session_v2',
  DRAFTS_PREFIX: 'precisign_repo_draft_v2_',
};

/**
 * LocalStorage implementation of IPreciSignRepository for browser prototype use.
 * Completely encapsulates browser storage APIs.
 */
export class LocalStoragePreciSignRepository implements IPreciSignRepository {
  private customStorage?: Storage;

  protected keys: typeof STORAGE_KEYS;
  constructor(customStorage?: Storage, protected dataset: DemoDataset = activeDemoDataset) {
    this.customStorage = customStorage;
    this.keys = dataset.namespace
      ? Object.fromEntries(Object.entries(STORAGE_KEYS).map(([name]) => [name, `${dataset.namespace}_${name.toLowerCase()}${name === 'DRAFTS_PREFIX' ? '_' : ''}`])) as typeof STORAGE_KEYS
      : STORAGE_KEYS;
  }

  private getStorage(): Storage | null {
    if (this.customStorage) return this.customStorage;
    if (typeof window !== 'undefined' && window.localStorage) return window.localStorage;
    if (typeof globalThis !== 'undefined' && (globalThis as any).localStorage) {
      return (globalThis as any).localStorage;
    }
    return null;
  }

  private isStorageAvailable(): boolean {
    return this.getStorage() !== null;
  }

  protected getItem<T>(key: string, fallback: T): T {
    const storage = this.getStorage();
    if (!storage) throw new Error('Storage is unavailable.');
    const data = storage.getItem(key);
    return data === null ? fallback : JSON.parse(data);
  }

  protected setItem<T>(key: string, value: T): void {
    const storage = this.getStorage();
    if (!storage) throw new Error('Storage is unavailable.');
    storage.setItem(key, JSON.stringify(value));
  }

  private removeItem(key: string): void {
    const storage = this.getStorage();
    if (!storage) throw new Error('Storage is unavailable.');
    storage.removeItem(key);
  }

  async getCompanies(): Promise<Company[]> {
    return this.getItem<Company[]>(this.keys.COMPANIES, this.dataset.companies).map(currentCompanyDisplay);
  }

  async getCompanyById(id: CompanyId): Promise<Company | null> {
    const list = await this.getCompanies();
    return list.find((c) => c.id === id) || null;
  }

  async getUsers(): Promise<UserProfile[]> {
    return this.getItem<(UserProfile & { isDisabled?: boolean })[]>(this.keys.USERS, this.dataset.users).filter(user => !user.isDisabled);
  }

  async getUserById(id: string): Promise<UserProfile | null> {
    const users = await this.getUsers();
    return users.find((u) => u.id === id) || null;
  }

  async updateUserSignature(
    userId: string,
    signatureDataUrl?: string,
    signatureStyleText?: string
  ): Promise<UserProfile> {
    const users = await this.getUsers();
    let updatedUser: UserProfile | null = null;
    const updatedUsers = users.map((u) => {
      if (u.id === userId) {
        updatedUser = {
          ...u,
          signatureDataUrl: signatureDataUrl !== undefined ? signatureDataUrl : u.signatureDataUrl,
          signatureStyleText: signatureStyleText !== undefined ? signatureStyleText : u.signatureStyleText,
        };
        return updatedUser;
      }
      return u;
    });

    if (!updatedUser) {
      throw new Error(`User with ID ${userId} not found.`);
    }

    this.setItem(this.keys.USERS, updatedUsers);
    return updatedUser;
  }

  async getWorkflows(scope?: ViewingScope): Promise<WorkflowConfig[]> {
    const workflows = this.getItem<WorkflowConfig[]>(this.keys.WORKFLOWS, this.dataset.workflows);
    if (scope && scope !== PARENT_ORGANIZATION_ID) {
      return workflows.filter((w) => w.companyId === scope);
    }
    return workflows;
  }

  async getWorkflow(companyId: CompanyId, formType: string): Promise<WorkflowConfig | null> {
    const list = await this.getWorkflows(companyId);
    return list.find((w) => w.formType === formType) || null;
  }

  async saveWorkflow(workflow: WorkflowConfig): Promise<WorkflowConfig> {
    const workflows = await this.getWorkflows();
    const existingIndex = workflows.findIndex(
      (w) => w.companyId === workflow.companyId && w.formType === workflow.formType
    );
    let updatedList: WorkflowConfig[];
    if (existingIndex >= 0) {
      updatedList = workflows.map((w, idx) => (idx === existingIndex ? workflow : w));
    } else {
      updatedList = [...workflows, workflow];
    }
    this.setItem(this.keys.WORKFLOWS, updatedList);
    return workflow;
  }

  async getRequests(scope?: ViewingScope): Promise<RequestRecord[]> {
    const requests = this.getItem<RequestRecord[]>(this.keys.REQUESTS, this.dataset.requests);
    if (scope && scope !== PARENT_ORGANIZATION_ID) {
      return requests.filter((r) => r.companyId === scope);
    }
    return requests;
  }

  async getRequestById(id: string): Promise<RequestRecord | null> {
    const requests = await this.getRequests();
    return requests.find((r) => r.id === id) || null;
  }

  async createRequest(record: RequestRecord): Promise<RequestRecord> {
    const requests = await this.getRequests();
    const updated = [record, ...requests];
    this.setItem(this.keys.REQUESTS, updated);
    return record;
  }

  async updateRequest(record: RequestRecord): Promise<RequestRecord> {
    const requests = await this.getRequests();
    const updated = requests.map((r) => (r.id === record.id ? record : r));
    this.setItem(this.keys.REQUESTS, updated);
    return record;
  }

  async getDraft(
    scope: ViewingScope,
    requesterId: string,
    formType: string
  ): Promise<AdminWorkDraft | null> {
    const key = `${this.keys.DRAFTS_PREFIX}${scope}_${requesterId}_${formType}`;
    return this.getItem<AdminWorkDraft | null>(key, null);
  }

  async saveDraft(
    scope: ViewingScope,
    requesterId: string,
    formType: string,
    draft: AdminWorkDraft
  ): Promise<void> {
    const key = `${this.keys.DRAFTS_PREFIX}${scope}_${requesterId}_${formType}`;
    this.setItem(key, draft);
  }

  async clearDraft(
    scope: ViewingScope,
    requesterId: string,
    formType: string
  ): Promise<void> {
    const key = `${this.keys.DRAFTS_PREFIX}${scope}_${requesterId}_${formType}`;
    this.removeItem(key);
  }

  async getDemoSession(): Promise<{ companyId: ViewingScope; userId: string }> {
    return this.getItem<{ companyId: ViewingScope; userId: string }>(this.keys.SESSION, this.dataset.session);
  }

  async saveDemoSession(companyId: ViewingScope, userId: string): Promise<void> {
    this.setItem(this.keys.SESSION, { companyId, userId });
  }

  async resetToSeedData(): Promise<void> {
    this.setItem(this.keys.REQUESTS, this.dataset.requests);
    this.setItem(this.keys.WORKFLOWS, this.dataset.workflows);
    this.setItem(this.keys.USERS, this.dataset.users);
    this.setItem(this.keys.COMPANIES, this.dataset.companies);
    this.setItem(this.keys.SESSION, this.dataset.session);
    const storage = this.getStorage();
    if (storage) {
      // Clear draft keys
      for (let i = storage.length - 1; i >= 0; i--) {
        const k = storage.key(i);
        if (k && k.startsWith(this.keys.DRAFTS_PREFIX)) {
          storage.removeItem(k);
        }
      }
    }
  }
}

// Default export of instantiated repository singleton
export const dataService: IPreciSignRepository = new LocalStoragePreciSignRepository();
