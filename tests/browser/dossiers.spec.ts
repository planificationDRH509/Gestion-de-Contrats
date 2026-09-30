import { expect, test } from '@playwright/test';

test('Dossiers stays usable on desktop and mobile with accessible dialogs', async ({ page }) => {
  const now = new Date().toISOString();
  const entries = [
    { id: 'health', name: 'Campagne de recrutement — Santé', focal_point: 'Marie Jean', priority: 'urgence', deadline_date: '2020-01-10', contract_target_count: 40 },
    { id: 'north', name: 'Renouvellements · Direction du Nord', focal_point: 'Jean Baptiste', priority: 'normal', deadline_date: '2099-10-15', contract_target_count: 25 },
    { id: 'south', name: 'Personnel administratif — Sud', focal_point: 'Service des ressources humaines', priority: 'normal', deadline_date: null, contract_target_count: 0 },
    { id: 'long', name: 'Programme de renforcement des équipes des établissements de santé de la Grand’Anse et du Nord-Ouest', focal_point: 'Équipe de coordination départementale', priority: 'normal', deadline_date: '2099-11-01', contract_target_count: 100 },
    { id: 'archive', name: 'Campagne précédente', updated_at: '2020-01-01', priority: 'normal' },
    { id: 'closed', name: 'Dossier clôturé', status: 'classified', priority: 'normal' }
  ].map(row => ({ workspace_id: 'workspace_default', created_at: now, updated_at: now, created_by: 'dossier-ui-test', status: 'active', is_ephemeral: false, contract_target_count: 0, deleted_at: null, ...row }));
  await page.addInitScript(() => {
    localStorage.setItem('contribution_auth', JSON.stringify({ id: 'dossier-ui-test', username: 'admin', name: 'Test', workspaceId: 'workspace_default', role: 'admin', taskSessionToken: 'test-not-a-real-token' }));
    localStorage.setItem('contribution_last_activity', String(Date.now()));
  });
  // All remote application requests are fixtures; no user data is changed.
  await page.route('**/*.supabase.co/**', async route => {
    const path = new URL(route.request().url()).pathname;
    const body = path.endsWith('/app_users') ? { role: 'admin' } : path.endsWith('/dossiers') ? entries : [];
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(body), headers: { 'content-range': `0-${Array.isArray(body) ? Math.max(0, body.length - 1) : 0}/${Array.isArray(body) ? body.length : 1}` } });
  });
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto('http://127.0.0.1:5179/app/contrats');
  await page.getByRole('button', { name: 'Dossiers', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Dossiers', exact: true })).toBeVisible();
  await expect(page.locator('.dossiers-row')).toHaveCount(4);
  await page.screenshot({ path: '/tmp/contribution-dossiers-desktop.png', fullPage: true });
  await page.getByRole('searchbox', { name: 'Rechercher un dossier' }).fill('renouvellements');
  await expect(page.locator('.dossiers-row')).toHaveCount(1);
  await page.getByRole('button', { name: 'Effacer la recherche' }).click();
  const detailButton = page.getByRole('button', { name: 'Détails de Campagne de recrutement — Santé' });
  await detailButton.click();
  const detail = page.getByRole('dialog');
  await expect(detail).toBeVisible();
  await page.screenshot({ path: '/tmp/contribution-dossiers-details.png' });
  await page.keyboard.press('Escape');
  await expect(detail).toHaveCount(0);
  await expect(detailButton).toBeFocused();
  await page.getByRole('button', { name: 'Nouveau dossier', exact: true }).click();
  const dialog = page.getByRole('dialog');
  await expect(dialog.getByLabel('Nom du dossier')).toBeFocused();
  await dialog.getByText('Planification et détails').click();
  await page.screenshot({ path: '/tmp/contribution-dossiers-form.png' });
  await page.keyboard.press('Escape');
  await expect(dialog).toHaveCount(0);
  await page.setViewportSize({ width: 390, height: 844 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await expect(page.getByRole('button', { name: 'Nouveau dossier', exact: true })).toHaveCount(0);
  expect(await page.getByLabel('Propriétaire des dossiers').evaluate(el => el.clientWidth)).toBeGreaterThan(150);
  await page.screenshot({ path: '/tmp/contribution-dossiers-mobile.png', fullPage: true });
  await detailButton.click();
  expect(await dialog.evaluate(el => el.scrollWidth <= el.clientWidth)).toBe(true);
  await page.screenshot({ path: '/tmp/contribution-dossiers-details-mobile.png' });
  await dialog.getByRole('button', { name: 'Modifier', exact: true }).click();
  await expect(dialog.getByLabel('Nom du dossier')).toHaveValue('Campagne de recrutement — Santé');
  expect(await dialog.evaluate(el => el.scrollWidth <= el.clientWidth)).toBe(true);
  await page.screenshot({ path: '/tmp/contribution-dossiers-form-mobile.png' });
  await page.keyboard.press('Escape');
  await page.keyboard.press('Escape');
  await page.getByRole('button', { name: 'Ouvrir les contrats de Campagne de recrutement — Santé' }).click();
  await expect(page.locator('.dossiers-workspace')).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Tous les contrats', exact: true })).toBeVisible();
  await expect(page.getByText('Dossier: Campagne de recrutement — Santé')).toBeVisible();
});
