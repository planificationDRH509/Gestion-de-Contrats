import { expect, test } from '@playwright/test';

test('filters contracts by several users on desktop and mobile', async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem('contribution_auth', JSON.stringify({ id: 'me', username: 'admin', name: 'Test', role: 'admin', workspaceId: 'workspace_default', taskSessionToken: 'filter-test-token' }));
    localStorage.setItem('contribution_last_activity', String(Date.now()));
  });
  const now = new Date();
  const year = now.getMonth() >= 9 ? now.getFullYear() : now.getFullYear() - 1;
  const rows = ['me', 'alice', 'bob', 'charlie'].map((creator, index) => ({
    id_contrat: `contract-${index}`, created_by: creator, workspace_id: 'workspace_default', nif: `111-222-333-${index}`,
    titre: 'Analyste', lieu_affectation: 'Direction', salaire_en_chiffre: 30000, duree_contrat: index === 2 ? 12 : 6,
    annee_fiscale: `${year}-${year + 1}`, status: 'saisie', created_at: now.toISOString(), updated_at: now.toISOString(),
    deleted_at: null, contract_tags: [], identification: { nom: 'LOUIS', prenom: `Jean ${index}`, sexe: 'Homme', adresse: 'Delmas' }
  }));
  await page.route('**/*.supabase.co/**', async route => {
    const url = new URL(route.request().url());
    let body: unknown = [];
    if (url.pathname.endsWith('/app_users')) {
      body = url.searchParams.has('id') ? { role: 'admin' } : [
        { id: 'me', username: 'admin', full_name: 'Test' },
        { id: 'alice', username: 'alice', full_name: 'Alice Jean' },
        { id: 'bob', username: 'bob', full_name: 'Robert Pierre' },
        { id: 'charlie', username: 'charlie', full_name: 'Charles Louis' }
      ];
    }
    if (url.pathname.endsWith('/contrat')) {
      body = rows.filter(row => [...url.searchParams].every(([key, value]) => {
        if (!(key in row)) return true;
        const actual = String(row[key as keyof typeof row]);
        if (value.startsWith('eq.')) return actual === value.slice(3);
        if (value.startsWith('in.(')) return value.slice(4, -1).split(',').includes(actual);
        return true;
      }));
    }
    const count = Array.isArray(body) ? body.length : 1;
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(body), headers: { 'content-range': `0-${Math.max(0, count - 1)}/${count}` } });
  });
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto('http://127.0.0.1:5179/app/contrats');
  const total = page.getByRole('status', { name: 'Nombre de contrats' });
  await expect(total).toHaveText('1');
  await page.getByRole('button', { name: /Filtres/ }).click();
  await page.getByRole('button', { name: /Tous les utilisateurs/ }).click();
  await page.getByRole('checkbox', { name: 'Alice Jean', exact: true }).check();
  await page.getByRole('checkbox', { name: 'Robert Pierre', exact: true }).check();
  await expect(total).toHaveText('2');
  await expect(page.getByRole('button', { name: 'Tous les contrats', exact: true })).toBeVisible();
  await page.screenshot({ path: '/tmp/contribution-users-filter-desktop.png', fullPage: true });
  await page.keyboard.press('Escape');
  await page.getByRole('button', { name: /Toutes les durées/ }).click();
  await page.getByRole('checkbox', { name: '6 mois', exact: true }).check();
  await expect(total).toHaveText('1');
  await page.keyboard.press('Escape');
  await page.setViewportSize({ width: 390, height: 844 });
  await page.getByRole('button', { name: /Alice Jean, Robert Pierre/ }).first().click();
  await expect(page.getByRole('checkbox', { name: 'Alice Jean', exact: true })).toBeChecked();
  await page.screenshot({ path: '/tmp/contribution-users-filter-mobile.png', fullPage: true });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await page.getByTitle('Retirer le filtre utilisateurs').click();
  await expect(total).toHaveText('3');
  await page.getByRole('button', { name: 'Réinitialiser', exact: true }).click();
  await expect(total).toHaveText('4');
});
