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
};

@Service()
export class AuthService {
  private readonly api = inject(Api);

  readonly accountant = signal<Accountant | null>(null);
  readonly contact = signal<Contact | null>(null);

  private pending?: Promise<void>;

  ensureLoaded(prefer: 'accountant' | 'contact' = 'accountant') {
    return (this.pending ??= this.load(prefer));
  }

  async signInAccountant(email: string, password: string) {
    const { error } = await authClient.signIn.email({ email, password });
    if (error) throw new Error('E-mail ou senha inválidos.');

    this.accountant.set(await this.api.get<Accountant>('/auth/me'));
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
    await authClient.signOut();
    this.accountant.set(null);
    this.contact.set(null);
    this.pending = undefined;
  }

  async signInContact(email: string, password: string) {
    const { error } = await authClient.signIn.email({ email, password });
    if (error) throw new Error('E-mail ou senha inválidos.');

    await this.reloadContact();
  }

  async reloadContact() {
    this.contact.set(await this.api.get<Contact>('/my/profile'));
    this.pending = Promise.resolve();
  }

  async setContactPassword(password: string) {
    await this.api.post<void>('/my/password', { password });
  }

  async reloadAccountant() {
    this.accountant.set(await this.api.get<Accountant>('/auth/me'));
    this.pending = Promise.resolve();
  }

  private async load(prefer: 'accountant' | 'contact') {
    const attempts =
      prefer === 'accountant'
        ? [this.loadAccountant, this.loadContact]
        : [this.loadContact, this.loadAccountant];

    for (const attempt of attempts) {
      if (await attempt.call(this)) return;
    }
  }

  private async loadAccountant() {
    try {
      this.accountant.set(await this.api.get<Accountant>('/auth/me'));
      return true;
    } catch {
      this.accountant.set(null);
      return false;
    }
  }

  private async loadContact() {
    try {
      this.contact.set(await this.api.get<Contact>('/my/profile'));
      return true;
    } catch {
      this.contact.set(null);
      return false;
    }
  }
}
