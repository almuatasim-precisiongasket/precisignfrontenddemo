import { LocalStoragePreciSignRepository, type AccountDirectoryEntry, type IAccountAdministrationRepository, type StaffRole } from './repository';
import type { CompanyId, UserProfile } from '../types';
import type { DemoDataset } from '../data/showcaseData';
import { activeDemoDataset } from '../data/demoDataset';
import { ApiError } from './apiTypes';

type DemoUser = UserProfile & { isDisabled?: boolean };
export const SHOWCASE_CHANGED = 'precisign:showcase-changed';

/** Local simulation for the isolated showcase only. Never handles real accounts or sessions. */
export class ShowcaseAdministration extends LocalStoragePreciSignRepository implements IAccountAdministrationRepository {
  constructor(private actorId: string, storage?: Storage, dataset: DemoDataset = activeDemoDataset) {
    super(storage, dataset);
    if (dataset.namespace !== 'precisign_showcase_v1') throw new Error('Showcase administration requires its isolated dataset.');
  }
  private profiles(): DemoUser[] { return structuredClone(this.getItem<DemoUser[]>(this.keys.USERS, this.dataset.users)); }
  private requireAdmin() {
    if (!this.profiles().some(user => user.id === this.actorId && user.isSuperAdmin && !user.isDisabled)) throw new ApiError(403, 'Switch to the sample administrator to manage demo accounts.');
  }
  private changed() { if (typeof window !== 'undefined') window.dispatchEvent(new Event(SHOWCASE_CHANGED)); }
  private saveProfiles(profiles: DemoUser[]) { this.setItem(this.keys.USERS, profiles); this.changed(); }
  async listAccounts(): Promise<AccountDirectoryEntry[]> {
    this.requireAdmin();
    return this.profiles().map(user => ({ id: user.id, name: user.name, email: user.email, department: user.department, role: user.role, companyGrants: user.companyGrants ?? [], formGrants: user.formGrants ?? {}, isSuperAdmin: !!user.isSuperAdmin, isDisabled: !!user.isDisabled }));
  }
  async updateAccount(id: string, update: { email?: string; isDisabled?: boolean; role?: StaffRole }) {
    this.requireAdmin();
    const profiles = this.profiles(); const target = profiles.find(user => user.id === id);
    if (!target) throw new ApiError(404, 'Demo account not found.');
    if (update.isDisabled && id === this.actorId) throw new ApiError(400, 'Keep the active sample administrator enabled.');
    if (update.email !== undefined) {
      const email = update.email.trim().toLowerCase();
      if (email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || profiles.some(user => user.id !== id && user.email.toLowerCase() === email)) throw new ApiError(400, 'Use a unique, valid demo email.');
      target.email = email;
    }
    if (update.role !== undefined) {
      if (['Director', 'General Manager'].includes(target.role) || !['Employee', 'Admin', 'IT', 'Finance'].includes(update.role)) throw new ApiError(400, 'This demo staff role cannot be changed.');
      target.role = update.role;
    }
    if (update.isDisabled !== undefined) { target.isDisabled = update.isDisabled; if (update.isDisabled) { target.companyGrants = []; target.formGrants = {}; } }
    this.saveProfiles(profiles);
  }
  async updateGrants(id: string, companyIds: CompanyId[], formsByCompany: Partial<Record<CompanyId, string[]>>) {
    this.requireAdmin();
    const profiles = this.profiles(); const target = profiles.find(user => user.id === id);
    if (!target || target.isDisabled) throw new ApiError(400, 'Enable this demo employee before assigning access.');
    const validCompanies = this.dataset.companies.map(company => company.id);
    const validForms = new Set(this.dataset.workflows.map(workflow => workflow.formType));
    if (new Set(companyIds).size !== companyIds.length || companyIds.some(id => !validCompanies.includes(id))
      || Object.entries(formsByCompany).some(([id, forms]) => !companyIds.includes(id as CompanyId) || forms.some(form => !validForms.has(form)))) throw new ApiError(400, 'Choose supported companies and forms.');
    target.companyGrants = [...companyIds]; target.formGrants = structuredClone(formsByCompany);
    this.saveProfiles(profiles);
  }
  async createResetLink(_id: string): Promise<string> { throw new ApiError(400, 'This showcase uses employee switching, not passwords or recovery links.'); }
  async listCompanyBranding() { this.requireAdmin(); return this.getCompanies(); }
  async updateCompanyLogo(id: CompanyId, logoDataUrl: string | null) {
    this.requireAdmin();
    if (logoDataUrl && (!/^data:image\/(png|jpeg);base64,[A-Za-z0-9+/=]+$/.test(logoDataUrl) || logoDataUrl.length > 3 * 1024 * 1024)) throw new ApiError(400, 'Choose a small PNG or JPEG logo.');
    const companies = await this.getCompanies();
    if (!companies.some(company => company.id === id)) throw new ApiError(404, 'Company not found.');
    this.setItem(this.keys.COMPANIES, companies.map(company => company.id === id ? { ...company, logoDataUrl: logoDataUrl ?? undefined } : company));
    this.changed(); return logoDataUrl;
  }
}
