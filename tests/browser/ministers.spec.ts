import { expect, test } from '@playwright/test';

test('manages mandate dates, preserves contract ministers and warns only on out-of-range start dates', async ({ page }) => {
  const legacy = { id: 'bertrand-sinal', fullName: 'Bertrand SINAL', gender: 'Homme', nif: '003-888-685-8', ninu: '1009241060', mandateStartDate: '2020-01-01', mandateEndDate: null as string | null };
  const ministers = [legacy];
  let currentMinisterId = legacy.id;
  const now = new Date().toISOString();
  await page.addInitScript(() => {
    localStorage.setItem('contribution_auth', JSON.stringify({ id: 'minister-test-admin', username: 'admin', name: 'Test', role: 'admin', workspaceId: 'workspace_default', taskSessionToken: 'test-session' }));
    localStorage.setItem('contribution_last_activity', String(Date.now()));
    window.print = () => { document.documentElement.dataset.printRequested = 'true'; };
  });
  await page.route('**/*.supabase.co/**', async route => {
    const path = new URL(route.request().url()).pathname;
    let body: unknown = [];
    if (path.endsWith('/app_users')) body = { role: 'admin' };
    if (path.endsWith('/manage_ministers')) {
      const input = route.request().postDataJSON().p_input;
      if (input.action === 'add') ministers.push(input.minister);
      else if (input.action === 'mandate') {
        const minister = ministers.find(entry => entry.id === input.ministerId)!;
        expect(input.expectedStartDate).toBe(minister.mandateStartDate);
        expect(input.expectedEndDate).toBe(minister.mandateEndDate);
        minister.mandateStartDate = input.mandateStartDate;
        minister.mandateEndDate = input.mandateEndDate;
      } else currentMinisterId = input.ministerId;
    }
    if (path.endsWith('/read_ministers') || path.endsWith('/manage_ministers')) body = { ministers, currentMinisterId };
    if (path.endsWith('/contrat')) body = ['old','new'].map((id,index) => ({
      id_contrat: id, workspace_id: 'workspace_default', nif: `123456789${index}`,
      ministre_id: index ? ministers[1]?.id : legacy.id,
      status: 'saisie', duree_contrat: 12, annee_fiscale: '2026-2027', salaire_en_chiffre: 35000,
      titre: 'Agent administratif', lieu_affectation: 'Direction générale', created_at: now, updated_at: now,
      deleted_at: null, contract_tags: [], identification: { prenom: 'Jean', nom: index ? 'NOUVEAU' : 'ANCIEN', sexe: 'Homme', adresse: 'Delmas' }
    }));
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(body), headers: { 'content-range': `0-${Array.isArray(body) ? Math.max(0,body.length-1) : 0}/${Array.isArray(body) ? body.length : 1}` } });
  });
  await page.setViewportSize({ width: 1440, height: 1100 });
  await page.goto('http://127.0.0.1:5179/app/parametres/general');
  await expect(page.getByLabel('Ministre actuel', { exact: true })).toHaveValue(legacy.id);
  await expect(page.locator('.minister-table')).toContainText('01/01/2020');
  await page.getByRole('button', { name: 'Modifier le mandat de Bertrand SINAL', exact: true }).click();
  await expect(page.getByLabel('Début du mandat', { exact: true })).toHaveValue('2020-01-01');
  await page.getByLabel('Fin du mandat', { exact: true }).fill('2026-09-30');
  await page.getByRole('button', { name: 'Enregistrer le mandat', exact: true }).click();
  await expect(page.locator('.minister-table')).toContainText('30/09/2026');
  await page.getByRole('button', { name: 'Ajouter un ministre', exact: true }).click();
  await page.getByLabel('Nom complet', { exact: true }).fill('Marie EXEMPLE');
  await page.getByLabel('Sexe', { exact: true }).selectOption('Femme');
  await page.getByLabel('NIF', { exact: true }).fill('1112223334');
  await page.getByLabel('NINU', { exact: true }).fill('1112223334');
  await page.getByLabel('Début du mandat', { exact: true }).fill('2026-10-01');
  await page.getByLabel('Fin du mandat', { exact: true }).fill('2026-10-01');
  await page.getByRole('button', { name: 'Enregistrer le ministre', exact: true }).click();
  await expect(page.locator('.minister-table tbody tr')).toHaveCount(2);
  await expect(page.getByLabel('Ministre actuel', { exact: true })).toHaveValue(legacy.id);
  await page.getByLabel('Ministre actuel', { exact: true }).selectOption({ label: 'Marie EXEMPLE' });
  await page.getByRole('button', { name: 'Définir comme ministre actuel', exact: true }).click();
  await expect(page.locator('.minister-table tbody tr').filter({ hasText: 'Marie EXEMPLE' })).toContainText('Actuel');
  await page.reload();
  await expect(page.getByLabel('Ministre actuel', { exact: true })).toHaveValue(ministers[1].id);
  await page.locator('.ministers-settings').screenshot({ path: '/tmp/contribution-ministers-settings.png' });
  await page.goto('http://127.0.0.1:5179/app/contrats/print?ids=old,new');
  const oldDocument = page.locator('#print-contract-old');
  const newDocument = page.locator('#print-contract-new');
  await expect(oldDocument).toContainText('Docteur Bertrand SINAL');
  await expect(oldDocument).toContainText('Dr Bertrand SINAL');
  await expect(oldDocument).not.toContainText('Marie EXEMPLE');
  await expect(newDocument).toContainText('Madame Marie EXEMPLE');
  await expect(newDocument).toContainText('identifiée');
  await expect(newDocument).toContainText('domiciliée');
  await expect(newDocument).toContainText('111-222-333-4');
  await expect(newDocument).not.toContainText('Bertrand SINAL');
  await expect(newDocument).not.toContainText('{{');
  await expect(page.locator('.contract-sheet')).toHaveCount(8);
  const mandateAlert = page.locator('.contract-mandate-warning');
  await expect(mandateAlert).toHaveCount(1);
  await expect(mandateAlert).toContainText('Début du contrat (01/10/2026) hors du mandat de Bertrand SINAL');
  await expect(newDocument).toContainText('30 Septembre 2027');
  await page.emulateMedia({ media: 'print' });
  await expect(mandateAlert).toBeHidden();
  await page.emulateMedia({ media: 'screen' });
  await page.getByRole('button', { name: 'Imprimer', exact: true }).click();
  await expect(page.locator('html')).toHaveAttribute('data-print-requested', 'true');
  await newDocument.locator('.contract-sheet').first().screenshot({ path: '/tmp/contribution-minister-contract.png' });
});
