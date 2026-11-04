import type { AdminWorkDraft, CompanyId } from '../types/index';
import { ApiError } from './apiTypes';
import type { DraftState, PrivateDraftRepository, SubmitInput, VersionedRequest } from './apiTypes';

interface Entry {
  saved?: DraftState;
  unsaved?: AdminWorkDraft;
  error?: unknown;
  queue: Promise<unknown>;
  submitting: boolean;
  generation: number;
}

/** One signed-in session. Keys include user identity; no browser storage or active-editor callbacks. */
export class DraftCoordinator {
  private entries = new Map<string, Entry>();
  constructor(private repository: PrivateDraftRepository & { submit(input: SubmitInput): Promise<VersionedRequest> }) {}
  private entry(company: CompanyId, user: string): Entry {
    const key = `${user}:${company}`;
    let entry = this.entries.get(key);
    if (!entry) { entry = { queue: Promise.resolve(), submitting: false, generation: 0 }; this.entries.set(key, entry); }
    return entry;
  }
  load(company: CompanyId, user: string, reload = false): Promise<AdminWorkDraft | null> {
    const entry = this.entry(company, user);
    const pending = entry.queue.catch(() => {}).then(async () => {
      if (entry.saved && !reload) return entry.unsaved ?? entry.saved.data;
      const saved = await this.repository.readPrivateDraft(company);
      entry.saved = saved; entry.unsaved = undefined; entry.error = undefined;
      return saved.data;
    });
    entry.queue = pending;
    return pending;
  }
  private enqueueSave(company: CompanyId, entry: Entry, data: AdminWorkDraft, retry: boolean) {
    entry.unsaved = structuredClone(data);
    const generation = ++entry.generation;
    if (retry && !(entry.error instanceof ApiError && entry.error.status === 409)) entry.error = undefined;
    const pending = entry.queue.catch(() => {}).then(async () => {
      // Queued callbacks retain a generation number, not a copy of every attachment snapshot.
      if (entry.generation !== generation) return;
      const snapshot = entry.unsaved;
      if (!snapshot) return;
      if (!entry.saved) throw new Error('Load the draft before saving.');
      if (entry.error) throw entry.error;
      try {
        entry.saved = await this.repository.writePrivateDraft(company, entry.saved.revision, snapshot);
        if (entry.unsaved === snapshot) entry.unsaved = undefined;
      } catch (error) { entry.error = error; throw error; }
    });
    entry.queue = pending;
    return pending;
  }
  save(company: CompanyId, user: string, data: AdminWorkDraft, retry = false) {
    const entry = this.entry(company, user);
    if (entry.submitting) return Promise.reject(new Error('Submission is in progress.'));
    return this.enqueueSave(company, entry, data, retry);
  }
  async clear(company: CompanyId, user: string) {
    const entry = this.entry(company, user);
    if (entry.submitting) throw new Error('Submission is in progress.');
    const pending = entry.queue.catch(() => {}).then(async () => {
      if (!entry.saved) throw new Error('Load the draft before clearing.');
      if (entry.error) throw entry.error;
      entry.saved = await this.repository.clearPrivateDraft(company, entry.saved.revision);
      entry.unsaved = undefined;
    });
    entry.queue = pending;
    await pending;
  }
  async submit(company: CompanyId, user: string, input: SubmitInput) {
    const entry = this.entry(company, user);
    if (entry.submitting) throw new Error('Submission is already in progress.');
    entry.submitting = true;
    try {
      await this.enqueueSave(company, entry, { ...input.formData, companyId: company, attachments: input.attachments || [] }, false);
      const revision = entry.saved!.revision;
      const record = await this.repository.submit({ ...input, expectedDraftRevision: revision });
      entry.saved = { revision: revision + 1, data: null }; entry.unsaved = undefined;
      return record;
    } catch (error) {
      // A stale submit must not rebase or overwrite the draft from another browser.
      if (error instanceof ApiError && error.status === 409) entry.error = error;
      throw error;
    } finally { entry.submitting = false; }
  }
}
