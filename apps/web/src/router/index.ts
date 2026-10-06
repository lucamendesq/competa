import { createRouter, createWebHistory, type RouteRecordRaw } from 'vue-router';
import { useAuthStore } from '../stores/auth';

const routes: RouteRecordRaw[] = [
  {
    path: '/termos',
    name: 'Terms',
    meta: { title: 'Termos de Uso' },
    component: () => import('../pages/TermsPage.vue'),
  },
  {
    path: '/privacidade',
    name: 'Privacy',
    meta: { title: 'Política de Privacidade' },
    component: () => import('../pages/PrivacyPage.vue'),
  },
  {
    path: '/envio/:linkToken',
    name: 'Upload',
    component: () => import('../pages/UploadPage.vue'),
  },
  {
    path: '/convite/:linkToken',
    name: 'Invite',
    component: () => import('../pages/InvitePage.vue'),
  },
  {
    path: '/perdi-meu-link',
    name: 'RecoverLink',
    component: () => import('../pages/RecoverLinkPage.vue'),
  },
  {
    path: '/perdi-meu-link/confirmar',
    name: 'RecoverLinkConfirm',
    component: () => import('../pages/RecoverLinkConfirmPage.vue'),
  },
  {
    path: '/esqueci-senha',
    name: 'ForgotPassword',
    component: () => import('../pages/ForgotPasswordPage.vue'),
  },
  {
    path: '/redefinir-senha',
    name: 'ResetPassword',
    component: () => import('../pages/ResetPasswordPage.vue'),
  },
  {
    path: '/minha-area',
    component: () => import('../layouts/ContactLayout.vue'),
    children: [
      {
        path: 'acesso',
        name: 'ContactSignIn',
        meta: { guestOnly: true },
        component: () => import('../pages/ContactSignInPage.vue'),
      },
      {
        path: 'definir-senha',
        name: 'ContactSetPassword',
        component: () => import('../pages/ContactSetPasswordPage.vue'),
      },
      {
        path: 'pendencias',
        name: 'ContactPending',
        meta: { requiresAuth: 'contact' },
        component: () => import('../pages/ContactPendingPage.vue'),
      },
      {
        path: 'competencias',
        name: 'ContactHistory',
        meta: { requiresAuth: 'contact' },
        component: () => import('../pages/ContactHistoryPage.vue'),
      },
    ],
  },
  {
    path: '/',
    component: () => import('../layouts/PanelLayout.vue'),
    meta: { requiresAuth: 'accountant' },
    children: [
      { path: '', redirect: '/competencias' },
      {
        path: 'competencias',
        name: 'Periods',
        component: () => import('../pages/PeriodsListPage.vue'),
      },
      {
        path: 'empresas',
        name: 'Companies',
        component: () => import('../pages/CompaniesListPage.vue'),
      },
      {
        path: 'empresas/nova',
        name: 'CompanyFormNew',
        component: () => import('../pages/CompanyFormPage.vue'),
      },
      {
        path: 'empresas/importar',
        name: 'ImportCompanies',
        component: () => import('../pages/ImportCompaniesPage.vue'),
      },
      {
        path: 'empresas/:id/editar',
        name: 'CompanyFormEdit',
        component: () => import('../pages/CompanyFormPage.vue'),
        props: true,
      },
      {
        path: 'empresas/:id/checklist',
        name: 'CompanyChecklist',
        component: () => import('../pages/CompanyChecklistPage.vue'),
        props: true,
      },
      {
        path: 'templates',
        name: 'Checklists',
        component: () => import('../pages/ChecklistsListPage.vue'),
      },
      {
        path: 'templates/:id',
        name: 'ChecklistForm',
        component: () => import('../pages/ChecklistFormPage.vue'),
        props: true,
      },
      {
        path: 'solicitacoes/:id',
        name: 'RequestReview',
        component: () => import('../pages/RequestReviewPage.vue'),
        props: true,
      },
      {
        path: 'competencias/:id/pendencias',
        name: 'PendingPanel',
        component: () => import('../pages/PendingPanelPage.vue'),
        props: true,
      },
      {
        path: 'configuracoes/contadores',
        name: 'AccountantsSettings',
        component: () => import('../pages/AccountantsSettingsPage.vue'),
      },
      {
        path: 'configuracoes/whatsapp',
        name: 'WhatsAppSettings',
        component: () => import('../pages/WhatsAppSettingsPage.vue'),
      },
      {
        path: 'configuracoes/plano',
        name: 'Plan',
        component: () => import('../pages/PlanPage.vue'),
      },
    ],
  },
  {
    path: '/entrar',
    name: 'Login',
    meta: { guestOnly: true },
    component: () => import('../pages/LoginPage.vue'),
  },
  /* Catch-all explícito: sem ele uma URL com typo casava com nada e o `<RouterView>`
   * ficava vazio — tela branca sem erro, sem 404 e sem cair no guard de login. */
  {
    path: '/:pathMatch(.*)*',
    name: 'NotFound',
    meta: { title: 'Página não encontrada' },
    component: () => import('../pages/NotFoundPage.vue'),
  },
];

const router = createRouter({
  history: createWebHistory(import.meta.env.BASE_URL),
  routes,
});

/** Para onde uma sessão viva pertence. */
const homeFor = (authStore: ReturnType<typeof useAuthStore>) => {
  if (authStore.accountant) return '/competencias';
  if (authStore.contact) return '/minha-area/pendencias';
  return null;
};

router.beforeEach(async (to, _from, next) => {
  const authStore = useAuthStore();

  /* Tela de entrada com sessão viva é beco sem saída: o Responsável logado que caísse em
   * `/entrar` via o formulário do Contador e concluía que tinha sido deslogado. */
  if (to.meta.guestOnly) {
    await authStore.ensureLoaded();
    const home = homeFor(authStore);
    return home ? next(home) : next();
  }

  if (to.meta.requiresAuth === 'accountant') {
    await authStore.ensureLoaded('accountant');
    if (authStore.accountant) return next();
    if (authStore.contact) return next('/minha-area/pendencias');
    return next('/entrar');
  }

  if (to.meta.requiresAuth === 'contact') {
    await authStore.ensureLoaded('contact');
    if (authStore.contact) return next();
    return next('/minha-area/acesso');
  }

  next();
});

router.afterEach((to) => {
  if (to.meta.title) {
    document.title = `${to.meta.title} - Competa`;
  } else {
    document.title = 'Competa';
  }
});

export default router;
