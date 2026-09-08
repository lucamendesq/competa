import { Service, inject, signal } from '@angular/core';
import { Api } from '../http/api';
import { authClient } from './auth-client';

export type Accountant = {
  accountant: { id: string; name: string; email: string; owner: boolean };
  accountingFirm: { id: string; name: string };
};

export type Contact = {
  contactId: string;
  name: string;
  email: string;
  phone: string | null;
  companyId: string;
  companyName: string;
  accountingFirmName: string;
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
    if (error) throw new Error(error.message ?? 'E-mail ou senha inválidos.');

    this.accountant.set(await this.api.get<Accountant>('/auth/me'));
  }

  async signOut() {
    await authClient.signOut();
    this.accountant.set(null);
    this.contact.set(null);
    this.pending = undefined;
  }

  /** Só quem aceitou um convite tem senha; quem ativou pelo Link de Upload entra por
   *  passkey ou magic link. As duas formas de conta convivem, então a tela de entrada
   *  oferece as duas. */
  async signInContact(email: string, password: string) {
    const { error } = await authClient.signIn.email({ email, password });
    if (error) throw new Error(error.message ?? 'E-mail ou senha inválidos.');

    await this.reloadContact();
  }

  /** Marca a sessão como resolvida junto: sem isso, um `ensureLoaded` anterior que falhou
   *  fica memoizado como "não é Responsável" e o guard manda de volta para o login logo
   *  depois de a conta ter sido ativada com sucesso. */
  async reloadContact() {
    this.contact.set(await this.api.get<Contact>('/my/profile'));
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
