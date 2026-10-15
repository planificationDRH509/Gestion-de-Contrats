import { expect, test } from '@playwright/test';
import { getFiscalYearForDate } from '../../src/lib/contractDateFilters';

test('statistics keeps labels and integer axes readable on desktop and mobile', async ({ page }) => {
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
  await page.goto('http://127.0.0.1:5179/app/statistiques');
  await expect(page.getByRole('heading', { name: 'Top 8 Postes' })).toBeVisible();
  for (const width of [1440, 390]) {
    await page.setViewportSize({ width, height: 1000 });
    const chart = page.locator('.premium-card').filter({ has: page.getByRole('heading', { name: 'Top 8 Postes' }) });
    await chart.scrollIntoViewIfNeeded();
    await expect(chart.locator('text > title')).toHaveCount(8);
    const ticks = await chart.locator('.recharts-cartesian-axis-tick-value').allTextContents();
    expect(ticks.length).toBeGreaterThan(1);
    expect(ticks.every(tick => /^\d+$/.test(tick))).toBeTruthy();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBeTruthy();
    await chart.screenshot({ path: `/tmp/statistics-layout-${width}.png` });
  }
});
