import { requireAuthOrRedirect, setupTopbarAuth } from './auth-ui.js';
import { initMobileTopbar } from './mobile-topbar.js';
import { mountSettingsForm, PAGE_SETTINGS_IDS } from './settings-modal.js';

async function bootstrap() {
  const isAuthenticated = await requireAuthOrRedirect();
  if (!isAuthenticated) return;

  initMobileTopbar();
  setupTopbarAuth();
  await mountSettingsForm({
    scope: document,
    ids: PAGE_SETTINGS_IDS
  });
}

bootstrap();
