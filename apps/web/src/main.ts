import '@fontsource-variable/outfit';
import '@fontsource-variable/plus-jakarta-sans';
import { createApp } from 'vue';
import { createPinia } from 'pinia';
import { VueQueryPlugin } from '@tanstack/vue-query';
import { toast } from 'vue-sonner';
/* Carrega a voz PT-BR do zod para todo schema, inclusive os locais das páginas. */
import '@competa/contracts';
import './main.css';
import App from './App.vue';
import router from './router';
import { ApiError } from './api/error';
import { onSessionExpired } from './api/client';
import { useAuthStore } from './stores/auth';

const isClientError = (error: unknown) =>
  error instanceof ApiError && error.status >= 400 && error.status < 500;

const app = createApp(App);

app.use(createPinia());
app.use(router);
app.use(VueQueryPlugin, {
  queryClientConfig: {
    defaultOptions: {
      queries: { retry: (failureCount, error) => !isClientError(error) && failureCount < 3 },
    },
  },
});

onSessionExpired(async () => {
  const area = router.currentRoute.value.meta.requiresAuth;
  if (!area) return;

  toast.error('Sua sessão foi encerrada. Entre de novo para continuar.', { id: 'session-expired' });
  await useAuthStore().signOut();
  await router.push(area === 'contact' ? '/minha-area/acesso' : '/entrar');
});

app.mount('#app');
