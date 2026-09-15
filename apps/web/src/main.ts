import { bootstrapApplication } from '@angular/platform-browser';
import * as Sentry from '@sentry/angular';
import { appConfig } from './app/app.config';
import { App } from './app/app';
import { environment } from './environments/environment';

if (environment.sentryDsn) {
  Sentry.init({
    dsn: environment.sentryDsn,
    environment: environment.production ? 'production' : 'development',
    integrations: [Sentry.browserTracingIntegration()],
    tracesSampleRate: environment.production ? 0.2 : 1.0,
    tracePropagationTargets: [/^https:\/\/api\.competa\.com\.br/],
  });
}

bootstrapApplication(App, appConfig).catch((err) => console.error(err));
