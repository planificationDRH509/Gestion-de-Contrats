import { expect, test } from '@playwright/test';

for (const viewport of [{ width: 1440, height: 1000 }, { width: 390, height: 844 }]) {
  test(`trash permanent deletion confirms, cancels and refreshes at ${viewport.width}px`, async ({ page }) => {
    await page.setViewportSize(viewport);
    await page.addInitScript(() => {
      localStorage.setItem('contribution_auth', JSON.stringify({ id: 'trash-admin', username: 'admin', name: 'Test', role: 'admin', workspaceId: 'workspace_default', taskSessionToken: 'trash-test-token' }));
      localStorage.setItem('contribution_last_activity', String(Date.now()));
    });
    const now = new Date().toISOString();
    let deleted = false;
    let deleteRequests = 0;
    const row = {
      id_contrat: 'trash-test', workspace_id: 'workspace_default', nif: '111-222-333-4',
      titre: 'Analyste', lieu_affectation: 'Direction générale', salaire_en_chiffre: 30000,
      duree_contrat: 12, annee_fiscale: '2026-2027', status: 'saisie', created_at: now, updated_at: now,
      deleted_at: now, contract_tags: [],
      identification: { nom: 'JEAN', prenom: 'Marie', sexe: 'Femme', adresse: 'Delmas' }
    };
    await page.route('**/*.supabase.co/**', async route => {
      const url = new URL(route.request().url());
      let body: unknown = [];
      if (url.pathname.endsWith('/app_users')) body = { role: 'admin' };
      if (url.pathname.endsWith('/contrat')) {
        if (route.request().method() === 'DELETE') {
          expect(url.searchParams.get('id_contrat')).toBe('eq.trash-test');
          expect(url.searchParams.get('workspace_id')).toBe('eq.workspace_default');
          expect(url.searchParams.get('deleted_at')).toBe('not.is.null');
          deleteRequests += 1;
          deleted = true;
          body = { id_contrat: 'trash-test' };
        } else if (url.searchParams.get('deleted_at') === 'not.is.null') {
          body = deleted ? [] : [row];
        }
      }
      const count = Array.isArray(body) ? body.length : 1;
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(body), headers: { 'content-range': `0-${Math.max(0, count - 1)}/${count}` } });
    });
    await page.goto('http://127.0.0.1:5179/app/parametres/corbeille');
    const action = page.getByRole('button', { name: /Supprimer définitivement le contrat de Marie JEAN/ });
    await expect(action).toBeVisible();
    const panel = page.locator('.trash-panel');
    expect(await panel.evaluate(element => element.scrollWidth <= element.clientWidth)).toBe(true);
    await page.screenshot({ path: `/tmp/contribution-trash-${viewport.width}.png`, fullPage: true });
    page.once('dialog', async dialog => {
      expect(dialog.message()).toContain('Cette action est irréversible.');
      await dialog.dismiss();
    });
    await action.click();
    expect(deleteRequests).toBe(0);
    await expect(page.getByRole('heading', { name: 'Marie JEAN' })).toBeVisible();
    page.once('dialog', dialog => dialog.accept());
    await action.click();
    await expect(page.getByRole('heading', { name: 'La corbeille est vide' })).toBeVisible();
    expect(deleteRequests).toBe(1);
    await expect(page.getByLabel('0 contrats supprimés')).toBeVisible();
    await page.reload();
    await expect(page.getByRole('heading', { name: 'La corbeille est vide' })).toBeVisible();
  });
}
