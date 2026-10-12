import { LEGACY_MINISTER } from "../../src/lib/ministers";
import { expect, test } from '@playwright/test';

test('import preserves corrections and shows errors on their cells', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.addInitScript(() => {
    localStorage.setItem('contribution_auth', JSON.stringify({ id: 'import-ui-test', username: 'admin', name: 'Test', workspaceId: 'workspace_default', role: 'admin', taskSessionToken: 'fixture-only' }));
    localStorage.setItem('contribution_last_activity', String(Date.now()));
  });
  // Isolate the browser check from all real account data.
  await page.route('**/*.supabase.co/**', async route => {
    const path = new URL(route.request().url()).pathname;
    const body = path.endsWith('/app_users') ? { role: 'admin' } : [];
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(body), headers: { 'content-range': '0-0/0' } });
  });
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto('http://127.0.0.1:5179/app/contrats');
  await page.getByRole('button', { name: 'Importer', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'Importer depuis Excel' });
  await dialog.getByPlaceholder('Collez les lignes copiées depuis Excel').fill('NIF\tNom\tPrénom\tSexe\tAdresse\tSalaire\tPoste\tAffectation\n1234567890\tLouis\tJean\tHomme\t\t30000\tAgent\tMSPP\n123\tPierre\tAnne\tFemme\t\t30000\tAgent\tMSPP');
  await expect(dialog.getByLabel('NIF, ligne 3', { exact: true })).toHaveAttribute('aria-invalid', 'true');
  await dialog.getByLabel('Adresse (optionnelle), ligne 2', { exact: true }).fill('Jacmel');
  await dialog.getByRole('button', { name: 'Fermer', exact: true }).last().click();
  await page.getByRole('button', { name: 'Importer', exact: true }).click();
  await expect(dialog.getByLabel('Adresse (optionnelle), ligne 2', { exact: true })).toHaveValue('Jacmel');
  await dialog.getByRole('button', { name: /^Erreurs/ }).click();
  await expect(dialog.getByLabel('NIF, ligne 2', { exact: true })).toHaveCount(0);
  await expect(dialog.getByLabel('NIF, ligne 3', { exact: true })).toBeVisible();
  const bounds = await dialog.boundingBox();
  expect(bounds?.x).toBe(0);
  expect(bounds?.y).toBe(0);
  expect(bounds?.width).toBe(1440);
  expect(bounds?.height).toBe(1000);
  const name = dialog.getByLabel('Nom, ligne 3', { exact: true });
  const before = await name.boundingBox();
  await dialog.locator('.contracts-import-preview').evaluate(element => { element.scrollLeft = 700; });
  await expect.poll(async () => Math.round((await name.boundingBox())!.x)).toBe(Math.round(before!.x));
  await expect(dialog.getByRole('button', { name: /^Importer \d/ })).toBeVisible();
  await dialog.locator('.contracts-import-preview').evaluate(element => { element.scrollLeft = 0; });
  await page.screenshot({ path: '/tmp/contribution-import-errors.png', fullPage: true });
  expect(errors).toEqual([]);
});


test('fullscreen import pins context and displays differences beside the table', async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem('contribution_auth', JSON.stringify({ id: 'import-ui-test', username: 'admin', name: 'Test', workspaceId: 'workspace_default', role: 'admin', taskSessionToken: 'fixture-only' }));
    localStorage.setItem('contribution_last_activity', String(Date.now()));
  });
  await page.route('**/*.supabase.co/**', async route => {
    const path = new URL(route.request().url()).pathname;
    const identity = { nif: '123-456-789-0', nom: 'Louis', prenom: 'Jean', sexe: 'Homme', adresse: 'Delmas', workspace_id: 'workspace_default', created_at: '2025-01-01', updated_at: '2025-01-01' };
    const body = path.endsWith('/app_users') ? { role: 'admin' } : path.endsWith('/identification') ? [identity] : [];
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(body), headers: { 'content-range': `0-0/${Array.isArray(body) ? body.length : 1}` } });
  });
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('http://127.0.0.1:5179/app/contrats');
  await page.getByRole('button', { name: 'Importer', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'Importer depuis Excel' });
  const rows = Array.from({ length: 60 }, (_, index) => `${1234567890 + index}\tLouis\tJean\tHomme\tJacmel\t30000\tAgent\tMSPP`);
  await dialog.getByPlaceholder('Collez les lignes copiées depuis Excel').fill(['NIF\tNom\tPrénom\tSexe\tAdresse\tSalaire\tPoste\tAffectation', ...rows].join('\n'));
  await expect(dialog.locator('.import-source')).not.toHaveAttribute('open');
  const header = dialog.getByRole('columnheader', { name: 'Nom', exact: true });
  const before = await header.boundingBox();
  await dialog.locator('.contracts-import-preview').evaluate(element => { element.scrollTop = 800; });
  await expect.poll(async () => Math.round((await header.boundingBox())!.y)).toBe(Math.round(before!.y));
  await expect(dialog.getByRole('button', { name: 'Suivant' })).toBeVisible();
  await expect(dialog.getByRole('button', { name: /^Importer \d/ })).toBeVisible();
  await dialog.locator('.contracts-import-preview').evaluate(element => { element.scrollTop = 0; });
  await dialog.getByRole('button', { name: 'Voir les différences de la ligne 2', exact: true }).click();
  const panel = dialog.getByRole('complementary', { name: 'Différences de la ligne 2' });
  await expect(panel.getByText('Delmas', { exact: true })).toBeVisible();
  await expect(panel.getByText('Jacmel', { exact: true })).toBeVisible();
  await page.screenshot({ path: '/tmp/contribution-import-fullscreen.png' });
  await panel.getByRole('button', { name: /Reprendre l’ancienne valeur : Adresse/ }).click();
  await expect(dialog.getByLabel('Adresse (optionnelle), ligne 2', { exact: true })).toHaveValue('Delmas');
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(panel).toBeVisible();
  const mobilePanel = await panel.boundingBox();
  expect(mobilePanel!.x).toBeGreaterThanOrEqual(0);
  expect(mobilePanel!.x + mobilePanel!.width).toBeLessThanOrEqual(390);
  await expect(dialog.getByRole('button', { name: /^Importer \d/ })).toBeVisible();
  await page.screenshot({ path: '/tmp/contribution-import-mobile.png' });
  await panel.getByRole('button', { name: 'Fermer les différences' }).click();
  await expect(panel).toHaveCount(0);
});

test('duplicate choices remain visible and selected on desktop and mobile', async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem('contribution_auth', JSON.stringify({ id: 'import-ui-test', username: 'admin', name: 'Test', workspaceId: 'workspace_default', role: 'admin', taskSessionToken: 'fixture-only' }));
    localStorage.setItem('contribution_last_activity', String(Date.now()));
    localStorage.setItem('contribution_current_fiscal_year', '2026-2027');
  });
  await page.route('**/*.supabase.co/**', async route => {
    const path = new URL(route.request().url()).pathname;
    const identity = { nif: '123-456-789-0', nom: 'Louis', prenom: 'Jean', sexe: 'Homme', adresse: 'Delmas', workspace_id: 'workspace_default', created_at: '2026-10-01', updated_at: '2026-10-01' };
    const contract = { id_contrat: 'old-contract', workspace_id: 'workspace_default', nif: identity.nif, identification: identity, titre: 'Agent', lieu_affectation: 'MSPP', salaire_en_chiffre: 30000, duree_contrat: 12, annee_fiscale: '2026-2027', created_at: '2026-10-01', updated_at: '2026-10-01', status: 'saisie', deleted_at: null, dossier_id: null, contract_tags: [] };
    const body = path.endsWith('/app_users') ? { role: 'admin' } : path.endsWith('/identification') ? [identity] : path.endsWith('/contrat') ? [contract] : [];
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(body), headers: { 'content-range': `0-0/${Array.isArray(body) ? body.length : 1}` } });
  });
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('http://127.0.0.1:5179/app/contrats');
  await page.getByRole('button', { name: 'Importer', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'Importer depuis Excel' });
  await dialog.getByPlaceholder('Collez les lignes copiées depuis Excel').fill('NIF\tNom\tPrénom\tSexe\tAdresse\tSalaire\tPoste\tAffectation\n1234567890\tLouis\tJean\tHomme\tJacmel\t50000\tDirecteur\tMSPP');
  const keep = dialog.getByRole('button', { name: 'Garder l’ancien' });
  await expect(keep).toBeVisible();
  await keep.click();
  await expect(keep).toHaveAttribute('aria-pressed', 'true');
  await expect(dialog.getByRole('button', { name: 'Importer 1 contrat(s)' })).toBeEnabled();
  await dialog.getByRole('button', { name: 'Remplacer par le nouveau' }).click();
  await expect(keep).toHaveAttribute('aria-pressed', 'false');
  await page.screenshot({ path: '/tmp/contribution-import-duplicate-desktop.png' });
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(keep).toBeVisible();
  await expect(dialog.getByRole('button', { name: 'Remplacer par le nouveau' })).toBeVisible();
  await page.screenshot({ path: '/tmp/contribution-import-duplicate-mobile.png' });
});

test('imports valid rows, resumes the remainder and cancels the saved batch', async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem('contribution_auth', JSON.stringify({ id: 'import-ui-test', username: 'admin', name: 'Test', workspaceId: 'workspace_default', role: 'admin', taskSessionToken: 'fixture-only' }));
    localStorage.setItem('contribution_last_activity', String(Date.now()));
  });
  const identities: Record<string, any>[] = [];
  const contracts: Record<string, any>[] = [];
  await page.route('**/*.supabase.co/**', async route => {
    const request = route.request(); const url = new URL(request.url());
    const table = url.pathname.split('/').at(-1);
    let rows: any[] = [];
    const source = table === 'identification' ? identities : table === 'contrat' ? contracts : null;
    if (source) {
      const idField = table === 'contrat' ? 'id_contrat' : 'nif';
      if (request.method() === 'POST') {
        const body = request.postDataJSON();
        for (const item of Array.isArray(body) ? body : [body]) {
          const saved = { created_at: new Date().toISOString(), updated_at: new Date().toISOString(), deleted_at: null, ...item };
          source.push(saved); rows.push(saved);
        }
      } else {
        rows = source.filter(item => {
          for (const [key, value] of url.searchParams) {
            if (value.startsWith('eq.') && String(item[key]) !== value.slice(3)) return false;
            if (key === 'deleted_at' && value === 'is.null' && item.deleted_at) return false;
            if (key === idField && value.startsWith('in.(') && !value.slice(4, -1).split(',').map(s => s.replaceAll('"', '')).includes(item[key])) return false;
          }
          return true;
        });
        if (request.method() === 'PATCH') rows.forEach(item => Object.assign(item, request.postDataJSON(), { updated_at: new Date().toISOString() }));
      }
      if (table === 'contrat') rows = rows.map(item => ({ ...item, identification: identities.find(person => person.nif === item.nif), contract_tags: [] }));
    } else if (table === 'dossiers') rows = [{ id: 'folder', workspace_id: 'workspace_default', name: 'Lot de test', created_at: '2026-10-01', updated_at: '2026-10-01', deleted_at: null }];
    const body = table === 'read_ministers' ? { ministers: [LEGACY_MINISTER], currentMinisterId: LEGACY_MINISTER.id } : table === 'app_users' ? { role: 'admin' } : request.headers().accept?.includes('object+json') ? rows[0] ?? null : rows;
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(body), headers: { 'content-range': `0-${Math.max(0, rows.length - 1)}/${rows.length}` } });
  });
  await page.goto('http://127.0.0.1:5179/app/contrats');
  await page.getByRole('button', { name: 'Importer', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'Importer depuis Excel' });
  await dialog.getByPlaceholder('Collez les lignes copiées depuis Excel').fill('NIF\tNom\tPrénom\tSexe\tAdresse\tSalaire\tPoste\tAffectation\n1234567890\tLouis\tJean\tHomme\tDelmas\t30.000\tAgent\tMSPP\n123\tPierre\tAnne\tFemme\tDelmas\t30000\tAgent\tMSPP');
  await dialog.getByLabel('Dossier', { exact: true }).selectOption('folder');
  await dialog.getByRole('button', { name: 'Importer 1 contrat(s)' }).click();
  await expect(dialog.getByText('1 importée(s)', { exact: true })).toBeVisible();
  await expect(dialog.getByRole('button', { name: 'Restantes 1' })).toHaveAttribute('aria-pressed', 'true');
  await expect(dialog.getByLabel('NIF, ligne 2', { exact: true })).toHaveCount(0);
  await dialog.getByRole('button', { name: 'Fermer', exact: true }).last().click();
  await page.getByRole('button', { name: 'Importer', exact: true }).click();
  await expect(dialog.getByRole('button', { name: 'Restantes 1' })).toHaveAttribute('aria-pressed', 'true');
  await dialog.getByRole('button', { name: 'Annuler le lot', exact: true }).click();
  await expect(dialog.getByText('0 importée(s)', { exact: true })).toBeVisible();
  await expect(dialog.getByLabel('NIF, ligne 2', { exact: true })).toBeEnabled();
  await expect(dialog.getByRole('button', { name: 'Annuler le lot', exact: true })).toHaveCount(0);
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(dialog.getByRole('button', { name: 'Importer 1 contrat(s)' })).toBeVisible();
  await page.screenshot({ path: '/tmp/contribution-import-partial-mobile.png' });
});
