import { ref, computed } from 'vue';
import { defineStore } from 'pinia';
import type { BillingCycle, PlanCapability, PlanName, PriceOverride } from '@competa/contracts';
import { api } from '../api/client';
import { authClient } from '../api/auth-client';

export type Accountant = {
  accountant: { id: string; name: string; email: string; owner: boolean };
  accountingFirm: {
    id: string;
    name: string;
    logoUrl?: string | null;
    contactEmail?: string | null;
    cnpj?: string | null;
    plan: { name: PlanName; companyCap: number; capabilities: PlanCapability[] };
    subscription?: {
      status: string;
      planName: string;
      cycle: BillingCycle;
      trialEndsAt: string | null;
      currentPeriodEnd: string | null;
      priceOverride: PriceOverride | null;
    };
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

type Role = 'accountant' | 'contact';

export const useAuthStore = defineStore('auth', () => {
  const accountant = ref<Accountant | null>(null);
  const contact = ref<Contact | null>(null);

  let loads: Partial<Record<Role, Promise<boolean>>> = {};

  const isOverdue = computed(() => {
    const sub = accountant.value?.accountingFirm.subscription;
    if (!sub) return false;
    if (sub.status === 'OVERDUE') return true;
    /* Mesma regra do guard da API: cancelada escreve até o fim do período já pago. */
    if (sub.status === 'CANCELED') {
      return !sub.currentPeriodEnd || new Date(sub.currentPeriodEnd) < new Date();
    }
    if (sub.status === 'trialing' && sub.trialEndsAt && new Date(sub.trialEndsAt) < new Date()) {
      return true;
    }
    return false;
  });

  async function loadAccountant() {
    try {
      const data = await api.get<Accountant | null>('/auth/me');
      if (!data || !data.accountant) {
        accountant.value = null;
        return false;
      }
      accountant.value = data;
      return true;
    } catch {
      accountant.value = null;
      delete loads.accountant;
      return false;
    }
  }

  async function loadContact() {
    try {
      const data = await api.get<Contact | null>('/my/profile');
      if (!data || !data.contactId) {
        contact.value = null;
        return false;
      }
      contact.value = data;
      return true;
    } catch {
      contact.value = null;
      delete loads.contact;
      return false;
    }
  }

  function ensureRole(role: Role) {
    loads[role] ??= role === 'accountant' ? loadAccountant() : loadContact();
    return loads[role];
  }

  async function ensureLoaded(prefer: Role = 'accountant') {
    if (prefer === 'contact') {
      await ensureRole('contact');
      return;
    }
    if (!(await ensureRole('accountant'))) await ensureRole('contact');
  }

  async function signInAccountant(email: string, password: string) {
    const { error } = await authClient.signIn.email({ email, password });
    if (error) throw new Error('E-mail ou senha inválidos.');

    await reloadAccountant();
  }

  async function signUpWithInvite(
    body: { name: string; email: string; password: string },
    token: string,
  ) {
    await api.post('/auth/sign-up', { ...body, token });
  }

  async function registerFirm(body: {
    userName: string;
    email: string;
    password: string;
    firmName: string;
    cnpj?: string;
  }) {
    await api.post('/auth/register', body);
    const ok = await loadAccountant();
    loads.accountant = Promise.resolve(ok);
    if (!ok) {
      await signInAccountant(body.email, body.password);
    }
  }

  async function acceptContactInvite(token: string, body: { name: string; password?: string }) {
    await api.post(`/invites/${token}/contact-account`, body);
  }

  async function recoverLink(email: string) {
    await api.post('/access/recover', { email });
  }

  async function confirmRecoverLink(token: string) {
    await api.post('/access/recover/confirm', { token });
  }

  async function requestPasswordReset(email: string) {
    const { error } = await authClient.requestPasswordReset({
      email,
      redirectTo: `${location.origin}/redefinir-senha`,
    });
    if (error) throw new Error('Não foi possível enviar o email. Tente de novo.');
  }

  async function resetPassword(newPassword: string, token: string) {
    const { error } = await authClient.resetPassword({ newPassword, token });
    if (!error) return 'done';
    if (error.code === 'INVALID_TOKEN') return 'invalid-link';
    throw new Error('Não foi possível redefinir a senha. Tente de novo.');
  }

  async function signOut() {
    try {
      await authClient.signOut();
    } catch {
      /* Sair é intenção do usuário, não um pedido que pode falhar pela metade: se a
       * chamada cair, o estado local some do mesmo jeito e a navegação para a tela de
       * entrada acontece. O cookie que sobrar morre no TTL da sessão. */
    }
    accountant.value = null;
    contact.value = null;
    loads = {};
  }

  async function reloadContact() {
    const data = await api.get<Contact | null>('/my/profile');
    contact.value = data?.contactId ? data : null;
    loads.contact = Promise.resolve(Boolean(contact.value));
  }

  async function signInContact(email: string, password: string) {
    const { error } = await authClient.signIn.email({ email, password });
    if (error) throw new Error('E-mail ou senha inválidos.');

    await reloadContact();
  }

  async function setContactPassword(password: string) {
    await api.post<void>('/my/password', { password });
  }

  async function reloadAccountant() {
    const data = await api.get<Accountant | null>('/auth/me');
    accountant.value = data?.accountant ? data : null;
    loads.accountant = Promise.resolve(Boolean(accountant.value));
  }

  async function sendMagicLink(email: string, callbackURL: string) {
    const { error } = await authClient.signIn.magicLink({ email, callbackURL });
    if (error) throw new Error('Não foi possível enviar o link. Confira o e-mail e tente de novo.');
  }

  /** `false` enquanto o `/me` não voltou: nenhum gate deve parecer liberado antes de saber. */
  const can = (capability: PlanCapability) =>
    accountant.value?.accountingFirm.plan.capabilities.includes(capability) ?? false;

  return {
    accountant,
    contact,
    can,
    ensureLoaded,
    signInAccountant,
    signUpWithInvite,
    registerFirm,
    acceptContactInvite,
    recoverLink,
    confirmRecoverLink,
    requestPasswordReset,
    resetPassword,
    signOut,
    signInContact,
    reloadContact,
    setContactPassword,
    reloadAccountant,
    sendMagicLink,
    isOverdue,
  };
});
