import { createApp } from 'vue';
import { createPinia } from 'pinia';
import { VueQueryPlugin } from '@tanstack/vue-query';
import './main.css';
import App from './App.vue';
import router from './router';
import { ApiError } from './api/error';

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

app.mount('#app');
