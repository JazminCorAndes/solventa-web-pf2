import { bootstrapApplication } from '@angular/platform-browser';
import { appConfig } from './app/app.config';
import { App } from './app/app';
import { mergeApplicationConfig } from '@angular/core';
import { RecoveryLinkService } from './app/core/auth/recovery-link.service';

const recoveryLink = new RecoveryLinkService();
recoveryLink.capture(window.location, window.history, new URL(document.baseURI).pathname);

bootstrapApplication(
  App,
  mergeApplicationConfig(appConfig, {
    providers: [{ provide: RecoveryLinkService, useValue: recoveryLink }],
  }),
).catch((err) => console.error(err));
