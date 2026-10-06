import { ref, computed } from 'vue';
import { defineStore } from 'pinia';
import { api } from '../api/client';
import { authClient } from '../api/auth-client';

export type Accountant = {
  accountant: { id: string; name: string; email: string; owner: boolean };
  accountingFirm: {
    id: string;
    name: string;
    logoUrl?: string | null;
    contactEmail?: string | null;
    subscription?: {
      status: string;
      planName: string;
      trialEndsAt: string | null;
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

const SESSION_HINT_KEY = 'competa_auth';

export const useAuthStore = defineStore('auth', () => {
  const accountant = ref<Accountant | null>(null);
  const contact = ref<Contact | null>(null);

  let pending: Promise<void> | undefined;

  const isOverdue = computed(() => {
    const sub = accountant.value?.accountingFirm.subscription;
    if (!sub) return false;
    if (sub.status === 'OVERDUE' || sub.status === 'CANCELED') return true;
    if (sub.status === 'trialing' && sub.trialEndsAt && new Date(sub.trialEndsAt) < new Date()) {
      return true;
    }
    return false;
  });

  function setSessionHint(role: 'accountant' | 'contact' | null) {
    try {
      if (role) localStorage.setItem(SESSION_HINT_KEY, role);
      else localStorage.removeItem(SESSION_HINT_KEY);
    } catch {
      return;
    }
  }

  function getSessionHint(): 'accountant' | 'contact' | null {
    try {
      return (localStorage.getItem(SESSION_HINT_KEY) as 'accountant' | 'contact') ?? null;
    } catch {
      return null;
    }
  }

  async function loadAccountant() {
    try {
      const data = await api.get<Accountant | null>('/auth/me');
      if (!data || !data.accountant) {
        accountant.value = null;
        return false;
      }
      accountant.value = data;
      setSessionHint('accountant');
      return true;
    } catch {
      accountant.value = null;
      pending = undefined;
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
      setSessionHint('contact');
      return true;
    } catch {
      contact.value = null;
      pending = undefined;
      return false;
    }
  }

  async function load(target: 'accountant' | 'contact') {
    if (target === 'accountant') {
      const ok = await loadAccountant();
      if (!ok) setSessionHint(null);
      return;
    }

    const ok = await loadContact();
    if (!ok) setSessionHint(null);
  }

  async function ensureLoaded(prefer: 'accountant' | 'contact' = 'accountant') {
    const hint = getSessionHint();
    if (!hint && prefer === 'accountant') {
      return Promise.resolve();
    }

    const target = hint && (hint === prefer || prefer === 'accountant') ? hint : prefer;
    if (!pending) pending = load(target);
    return pending;
  }

  async function signInAccountant(email: string, password: string) {
    const { error } = await authClient.signIn.email({ email, password });
    if (error) throw new Error('E-mail ou senha inválidos.');

    setSessionHint('accountant');
    accountant.value = await api.get<Accountant>('/auth/me');
  }

  async function signUpWithInvite(
    body: { name: string; email: string; password: string },
    token: string,
  ) {
    await api.post('/auth/sign-up', { ...body, token });
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
    if (error) throw new Error('Link inválido ou expirado. Peça um novo.');
  }

  async function signOut() {
    setSessionHint(null);
    await authClient.signOut();
    accountant.value = null;
    contact.value = null;
    pending = undefined;
  }

  async function reloadContact() {
    setSessionHint('contact');
    const data = await api.get<Contact | null>('/my/profile');
    if (!data || !data.contactId) {
      contact.value = null;
      setSessionHint(null);
      return;
    }
    contact.value = data;
    pending = Promise.resolve();
  }

  async function signInContact(email: string, password: string) {
    const { error } = await authClient.signIn.email({ email, password });
    if (error) throw new Error('E-mail ou senha inválidos.');

    setSessionHint('contact');
    await reloadContact();
  }

  async function setContactPassword(password: string) {
    await api.post<void>('/my/password', { password });
  }

  async function reloadAccountant() {
    setSessionHint('accountant');
    const data = await api.get<Accountant | null>('/auth/me');
    if (!data || !data.accountant) {
      accountant.value = null;
      setSessionHint(null);
      return;
    }
    accountant.value = data;
    pending = Promise.resolve();
  }

  async function sendMagicLink(email: string, callbackURL: string) {
    const { error } = await authClient.signIn.magicLink({ email, callbackURL });
    if (error) throw new Error('Não foi possível enviar o link. Confira o e-mail e tente de novo.');
  }

  return {
    accountant,
    contact,
    ensureLoaded,
    signInAccountant,
    signUpWithInvite,
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
