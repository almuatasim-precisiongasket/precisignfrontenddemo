import { ApiError } from './apiTypes';
import type { BootstrapData, VersionedRequest } from './apiTypes';
import type { ApiPreciSignRepository } from './apiRepository';

export type SessionState =
  | { status: 'loading' }
  | { status: 'anonymous' }
  | { status: 'failed'; error: string }
  | { status: 'authenticated'; bootstrap: BootstrapData; requests: VersionedRequest[] };

/** No browser storage or demo fallback. Generation prevents late responses restoring logged-out data. */
export class ApiSession {
  state: SessionState = { status: 'loading' };
  private generation = 0;
  constructor(private repository: Pick<ApiPreciSignRepository, 'getCurrentUser' | 'login' | 'logout' | 'bootstrap' | 'getRequests'>, private changed: (state: SessionState) => void = () => {}) {}
  private set(state: SessionState) { this.state = state; this.changed(state); }
  private async load(generation: number) {
    const bootstrap = await this.repository.bootstrap();
    const requests = await this.repository.getRequests();
    if (generation === this.generation) this.set({ status: 'authenticated', bootstrap, requests });
  }
  async restore() {
    const generation = ++this.generation; this.set({ status: 'loading' });
    try { await this.repository.getCurrentUser(); await this.load(generation); }
    catch (error) { if (generation === this.generation) this.set(error instanceof ApiError && error.status === 401 ? { status: 'anonymous' } : { status: 'failed', error: 'Could not load the server. Please retry.' }); }
  }
  async login(email: string, password: string) {
    const generation = ++this.generation; this.set({ status: 'loading' });
    try { await this.repository.login(email, password); await this.load(generation); }
    catch (error) { if (generation === this.generation) this.set({ status: 'failed', error: error instanceof ApiError && error.status === 401 ? 'Invalid email or password.' : 'Could not sign in. Please retry.' }); }
  }
  async logout() {
    const generation = ++this.generation; this.set({ status: 'loading' });
    try { await this.repository.logout(); if (generation === this.generation) this.set({ status: 'anonymous' }); }
    catch (error) { if (generation === this.generation) this.set(error instanceof ApiError && error.status === 401 ? { status: 'anonymous' } : { status: 'failed', error: 'Could not confirm logout. Please retry.' }); }
  }
  expired() { ++this.generation; this.set({ status: 'anonymous' }); }
  unavailable() { ++this.generation; this.set({ status: 'failed', error: 'Could not reach the server. Please retry.' }); }
}
