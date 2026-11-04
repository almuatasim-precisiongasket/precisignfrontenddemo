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
import {
  INITIAL_COMPANIES,
  INITIAL_USERS,
  INITIAL_WORKFLOWS,
  INITIAL_REQUESTS,
} from '../data/seedData';

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

  constructor(customStorage?: Storage) {
    this.customStorage = customStorage;
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

  private getItem<T>(key: string, fallback: T): T {
    const storage = this.getStorage();
    if (!storage) throw new Error('Storage is unavailable.');
    const data = storage.getItem(key);
    return data === null ? fallback : JSON.parse(data);
  }

  private setItem<T>(key: string, value: T): void {
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
    return this.getItem<Company[]>(STORAGE_KEYS.COMPANIES, INITIAL_COMPANIES);
  }

  async getCompanyById(id: CompanyId): Promise<Company | null> {
    const list = await this.getCompanies();
    return list.find((c) => c.id === id) || null;
  }

  async getUsers(): Promise<UserProfile[]> {
    return this.getItem<UserProfile[]>(STORAGE_KEYS.USERS, INITIAL_USERS);
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

    this.setItem(STORAGE_KEYS.USERS, updatedUsers);
    return updatedUser;
  }

  async getWorkflows(scope?: ViewingScope): Promise<WorkflowConfig[]> {
    const workflows = this.getItem<WorkflowConfig[]>(STORAGE_KEYS.WORKFLOWS, INITIAL_WORKFLOWS);
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
    this.setItem(STORAGE_KEYS.WORKFLOWS, updatedList);
    return workflow;
  }

  async getRequests(scope?: ViewingScope): Promise<RequestRecord[]> {
    const requests = this.getItem<RequestRecord[]>(STORAGE_KEYS.REQUESTS, INITIAL_REQUESTS);
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
    this.setItem(STORAGE_KEYS.REQUESTS, updated);
    return record;
  }

  async updateRequest(record: RequestRecord): Promise<RequestRecord> {
    const requests = await this.getRequests();
    const updated = requests.map((r) => (r.id === record.id ? record : r));
    this.setItem(STORAGE_KEYS.REQUESTS, updated);
    return record;
  }

  async getDraft(
    scope: ViewingScope,
    requesterId: string,
    formType: string
  ): Promise<AdminWorkDraft | null> {
    const key = `${STORAGE_KEYS.DRAFTS_PREFIX}${scope}_${requesterId}_${formType}`;
    return this.getItem<AdminWorkDraft | null>(key, null);
  }

  async saveDraft(
    scope: ViewingScope,
    requesterId: string,
    formType: string,
    draft: AdminWorkDraft
  ): Promise<void> {
    const key = `${STORAGE_KEYS.DRAFTS_PREFIX}${scope}_${requesterId}_${formType}`;
    this.setItem(key, draft);
  }

  async clearDraft(
    scope: ViewingScope,
    requesterId: string,
    formType: string
  ): Promise<void> {
    const key = `${STORAGE_KEYS.DRAFTS_PREFIX}${scope}_${requesterId}_${formType}`;
    this.removeItem(key);
  }

  async getDemoSession(): Promise<{ companyId: ViewingScope; userId: string }> {
    return this.getItem<{ companyId: ViewingScope; userId: string }>(STORAGE_KEYS.SESSION, {
      companyId: 'PEW',
      userId: 'user-afzal',
    });
  }

  async saveDemoSession(companyId: ViewingScope, userId: string): Promise<void> {
    this.setItem(STORAGE_KEYS.SESSION, { companyId, userId });
  }

  async resetToSeedData(): Promise<void> {
    this.setItem(STORAGE_KEYS.REQUESTS, INITIAL_REQUESTS);
    this.setItem(STORAGE_KEYS.WORKFLOWS, INITIAL_WORKFLOWS);
    this.setItem(STORAGE_KEYS.USERS, INITIAL_USERS);
    this.setItem(STORAGE_KEYS.COMPANIES, INITIAL_COMPANIES);
    this.setItem(STORAGE_KEYS.SESSION, { companyId: 'PEW', userId: 'user-afzal' });
    const storage = this.getStorage();
    if (storage) {
      // Clear draft keys
      for (let i = storage.length - 1; i >= 0; i--) {
        const k = storage.key(i);
        if (k && k.startsWith(STORAGE_KEYS.DRAFTS_PREFIX)) {
          storage.removeItem(k);
        }
      }
    }
  }
}

// Default export of instantiated repository singleton
export const dataService: IPreciSignRepository = new LocalStoragePreciSignRepository();
