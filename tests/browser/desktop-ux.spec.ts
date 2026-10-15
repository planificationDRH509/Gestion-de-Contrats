import { expect, test } from '@playwright/test';
import { getFiscalYearForDate } from '../../src/lib/contractDateFilters';

test('desktop navigation and search support mouse and keyboard', async ({ page }) => {
  const year = getFiscalYearForDate(new Date());
  const rows = Array.from({ length: 8 }, (_, index) => ({
    id_contrat: `stats-${index}`, nif: `stats-${index}`, workspace_id: 'workspace_default',
    created_by: 'stats-user', status: 'saisie', duree_contrat: index + 1,
    annee_fiscale: year, salaire_en_chiffre: 25000,
    titre: `Responsable administratif des services régionaux ${index}`,
    lieu_affectation: `Direction départementale de la planification ${index}`,
    created_at: new Date().toISOString(), updated_at: new Date().toISOString(), deleted_at: null,
    identification: { nif: `stats-${index}`, prenom: 'Marie', nom: 'Jean', sexe: 'Femme' },
  }));
  await page.addInitScript(() => {
    localStorage.setItem('contribution_auth', JSON.stringify({ id: 'stats-user', username: 'admin', name: 'Test', workspaceId: 'workspace_default', role: 'admin', taskSessionToken: 'test-token' }));
    localStorage.setItem('contribution_last_activity', String(Date.now()));
  });
  await page.route('**/*.supabase.co/**', async route => {
    const path = new URL(route.request().url()).pathname;
    const body = path.endsWith('/app_users') ? { role: 'admin' } : path.endsWith('/contrat') ? rows : [];
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(body), headers: { 'content-range': `0-7/8` } });
  });
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto('http://127.0.0.1:5179/app/statistiques');
  const navigation = page.getByRole('navigation', { name: 'Navigation principale' });
  const search = navigation.getByRole('button', { name: 'Rechercher un contrat' });
  await expect(search).toBeVisible();
  await expect(navigation.getByRole('link', { name: 'Statistiques', exact: true })).toHaveClass(/active/);
  const resizer = page.getByRole('separator', { name: 'Largeur du menu' });
  await resizer.focus();
  const oldWidth = Number(await resizer.getAttribute('aria-valuenow'));
  await resizer.press('ArrowRight');
  await expect(resizer).toHaveAttribute('aria-valuenow', String(oldWidth + 20));
  await search.click();
  const dialog = page.getByRole('dialog', { name: 'Recherche rapide de contrats' });
  await expect(dialog).toBeVisible();
  const input = dialog.getByRole('combobox');
  await expect(input).toBeFocused();
  await input.fill('Marie');
  await expect(dialog.getByRole('option')).toHaveCount(8);
  await input.press('ArrowDown');
  await expect(dialog.getByRole('option').nth(1)).toHaveAttribute('aria-selected', 'true');
  await page.screenshot({ path: '/tmp/desktop-ux-search.png' });
  await input.press('Shift+Tab');
  await expect(dialog.getByRole('button', { name: 'Fermer la recherche' })).toBeFocused();
  await page.keyboard.press('Escape');
  await expect(dialog).not.toBeVisible();
  await expect(search).toBeFocused();
  await navigation.getByRole('link', { name: 'Paramètres', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Paramètres', exact: true })).toBeVisible();
  await page.screenshot({ path: '/tmp/desktop-ux-settings.png' });
  await page.setViewportSize({ width: 1100, height: 800 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBeTruthy();
});
