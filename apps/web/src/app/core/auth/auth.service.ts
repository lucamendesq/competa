import { Service, inject, signal } from '@angular/core';
import { Api } from '../http/api';
import { authClient } from './auth-client';

export type Accountant = {
  accountant: { id: string; name: string; email: string; owner: boolean };
  accountingFirm: {
    id: string;
    name: string;
    logoUrl?: string | null;
    contactEmail?: string | null;
  };
};

export type Contact = {
  contactId: string;
  name: string;
  email: string;
  phone: string | null;
  companyId: string;
  companyName: string;
  accountingFirmName: string;
  companies: { companyId: string; companyName: string; accountingFirmName: string }[];
  hasPassword?: boolean;
};

const SESSION_HINT_KEY = 'competa_auth';

@Service()
export class AuthService {
  private readonly api = inject(Api);

  readonly accountant = signal<Accountant | null>(null);
  readonly contact = signal<Contact | null>(null);

  private pending?: Promise<void>;

  ensureLoaded(prefer: 'accountant' | 'contact' = 'accountant') {
    const hint = this.getSessionHint();
    if (!hint && prefer === 'accountant') {
      return Promise.resolve();
    }

    const target = hint && (hint === prefer || prefer === 'accountant') ? hint : prefer;
    return (this.pending ??= this.load(target));
  }

  async signInAccountant(email: string, password: string) {
    const { error } = await authClient.signIn.email({ email, password });
    if (error) throw new Error('E-mail ou senha inválidos.');

    this.setSessionHint('accountant');
    this.accountant.set(await this.api.get<Accountant>('/auth/me'));
  }

  async signUpWithInvite(body: { name: string; email: string; password: string }, token: string) {
    await this.api.post('/auth/sign-up', body, { token });
  }

  async acceptContactInvite(token: string, body: { name: string; password?: string }) {
    await this.api.post(`/invites/${token}/contact-account`, body);
  }

  async recoverLink(email: string) {
    await this.api.post('/access/recover', { email });
  }

  async confirmRecoverLink(token: string) {
    await this.api.post('/access/recover/confirm', { token });
  }

  async requestPasswordReset(email: string) {
    const { error } = await authClient.requestPasswordReset({
      email,
      redirectTo: `${location.origin}/redefinir-senha`,
    });
    if (error) throw new Error('Não foi possível enviar o email. Tente de novo.');
  }

  async resetPassword(newPassword: string, token: string) {
    const { error } = await authClient.resetPassword({ newPassword, token });
    if (error) throw new Error('Link inválido ou expirado. Peça um novo.');
  }

  async signOut() {
    this.setSessionHint(null);
    await authClient.signOut();
    this.accountant.set(null);
    this.contact.set(null);
    this.pending = undefined;
  }

  async signInContact(email: string, password: string) {
    const { error } = await authClient.signIn.email({ email, password });
    if (error) throw new Error('E-mail ou senha inválidos.');

    this.setSessionHint('contact');
    await this.reloadContact();
  }

  async reloadContact() {
    this.setSessionHint('contact');
    const data = await this.api.get<Contact | null>('/my/profile');
    if (!data || !data.contactId) {
      this.contact.set(null);
      this.setSessionHint(null);
      return;
    }
    this.contact.set(data);
    this.pending = Promise.resolve();
  }

  async setContactPassword(password: string) {
    await this.api.post<void>('/my/password', { password });
  }

  async reloadAccountant() {
    this.setSessionHint('accountant');
    const data = await this.api.get<Accountant | null>('/auth/me');
    if (!data || !data.accountant) {
      this.accountant.set(null);
      this.setSessionHint(null);
      return;
    }
    this.accountant.set(data);
    this.pending = Promise.resolve();
  }

  private async load(target: 'accountant' | 'contact') {
    if (target === 'accountant') {
      const ok = await this.loadAccountant();
      if (!ok) this.setSessionHint(null);
      return;
    }

    const ok = await this.loadContact();
    if (!ok) this.setSessionHint(null);
  }

  private async loadAccountant() {
    try {
      const data = await this.api.get<Accountant | null>('/auth/me');
      if (!data || !data.accountant) {
        this.accountant.set(null);
        return false;
      }
      this.accountant.set(data);
      this.setSessionHint('accountant');
      return true;
    } catch {
      this.accountant.set(null);
      this.pending = undefined;
      return false;
    }
  }

  private async loadContact() {
    try {
      const data = await this.api.get<Contact | null>('/my/profile');
      if (!data || !data.contactId) {
        this.contact.set(null);
        return false;
      }
      this.contact.set(data);
      this.setSessionHint('contact');
      return true;
    } catch {
      this.contact.set(null);
      this.pending = undefined;
      return false;
    }
  }

  private setSessionHint(role: 'accountant' | 'contact' | null) {
    try {
      if (role) localStorage.setItem(SESSION_HINT_KEY, role);
      else localStorage.removeItem(SESSION_HINT_KEY);
    } catch {
      return;
    }
  }

  private getSessionHint(): 'accountant' | 'contact' | null {
    try {
      return (localStorage.getItem(SESSION_HINT_KEY) as 'accountant' | 'contact') ?? null;
    } catch {
      return null;
    }
  }
}
