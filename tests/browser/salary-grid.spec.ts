import { expect, test } from '@playwright/test';
import { readFileSync } from 'node:fs';
const seed = JSON.parse(readFileSync(new URL('../../src/features/salary-grid/salaryGridSeed.json', import.meta.url), 'utf8'));

test('edits the grid, adapts gender and marks unapproved salaries in both entry modes', async ({page}) => {
  page.setDefaultTimeout(10000);
  let entries = structuredClone(seed);
  await page.addInitScript(() => {
    localStorage.setItem('contribution_auth',JSON.stringify({id:'salary-ui-test',username:'admin',name:'Test',workspaceId:'workspace_default',role:'admin',taskSessionToken:'test-session-token-not-a-real-session'}));
    localStorage.setItem('contribution_last_activity',String(Date.now()));
    localStorage.setItem('new_contract_entry_mode','form');
  });
  await page.route('**/*.supabase.co/**',async route => {
    const url=route.request().url();
    let body: unknown=[];
    if(url.includes('/app_users')) body={role:'admin'};
    if(url.includes('/rpc/read_salary_grid')) body=entries;
    if(url.includes('/rpc/sync_reference_change')) {
      const {p_change:change}=route.request().postDataJSON();
      for (const patch of change.patches) {
        entries = entries.filter((e: {id: string}) => e.id !== patch.id);
        if (patch.after) entries.push(patch.after);
      }
      body=entries;
    }
    await route.fulfill({status:200,contentType:'application/json',body:JSON.stringify(body),headers:{'content-range':'0-0/0'}});
  });
  await page.goto('http://127.0.0.1:5179/app/parametres');
  await expect(page.getByRole('navigation').getByText('Grille Salariale')).toHaveCount(0);
  await page.getByRole('link',{name:'Grille Salariale'}).click();
  await expect(page).toHaveURL(/\/app\/parametres\/grille-salariale$/);
  await expect(page.getByRole('heading',{name:'Grille Salariale',exact:true})).toBeVisible();
  await expect(page.getByRole('columnheader',{name:'Type de poste'})).toBeVisible();
  await expect(page.getByText('Date d’effet')).toHaveCount(0);
  await page.getByRole('textbox',{name:'Rechercher un titre'}).fill('Opérateur informatique');
  await expect(page.locator('tbody')).toContainText('Opérateur informatique 3');
  await page.getByRole('textbox',{name:'Rechercher un titre'}).fill('Pharmacien');
  await page.getByRole('button',{name:'Modifier Pharmacien',exact:true}).click();
  await expect(page.getByRole('dialog').getByLabel('Type de poste')).toHaveValue('Universitaire');
  await page.getByRole('dialog').getByLabel('Type de poste').selectOption('Technique');
  await expect(page.getByRole('dialog').getByText('Date d’effet')).toHaveCount(0);
  await page.getByLabel('Salaires autorisés (HTG)').fill('41000; 42000');
  await page.getByRole('button',{name:'Enregistrer',exact:true}).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await page.reload();
  await page.getByRole('textbox',{name:'Rechercher un titre'}).fill('Pharmacien');
  await expect(page.locator('tbody')).toContainText('Technique');
  await expect(page.locator('tbody')).toContainText(/41.?000/);
  await page.screenshot({path:'/tmp/salary-grid-page.png',fullPage:true});
  await page.goto('http://127.0.0.1:5179/app/contrats/nouveau');
  await page.getByRole('radio',{name:/Femme/}).click();
  const title=page.locator('input[name="position"]');
  const salary=page.getByRole('textbox',{name:'Salaire en gourdes'});
  await title.fill('Professionnel Senior');
  await salary.fill('62000');
  await expect(salary).not.toHaveAttribute('aria-invalid','true');
  await title.fill('Agent Administratif');
  await salary.fill('36500');
  await expect(salary).not.toHaveAttribute('aria-invalid','true');
  await salary.fill('35000');
  await expect(salary).toHaveAttribute('aria-invalid','true');
  await title.fill('Technicien Senior 1');
  await salary.fill('45700');
  await expect(salary).not.toHaveAttribute('aria-invalid','true');
  await title.fill('Comptable Contrôleuse Senior 1');
  await salary.fill('45700');
  await expect(salary).not.toHaveAttribute('aria-invalid','true');
  await title.fill('Comptable Contrôleuse Senior 2');
  await salary.fill('45700');
  await expect(salary).toHaveAttribute('aria-invalid','true');
  await title.fill('Pharmacien');
  await title.press('Tab');
  await expect(title).toHaveValue('Pharmacienne');
  await salary.fill('40000');
  await expect(salary).toHaveAttribute('aria-invalid','true');
  await salary.fill('41000');
  await expect(salary).not.toHaveAttribute('aria-invalid','true');
  await page.getByRole('radio',{name:/Homme/}).click();
  await expect(title).toHaveValue('Pharmacien');
  await page.screenshot({path:'/tmp/salary-grid-form.png',fullPage:true});
  await page.getByRole('button',{name:/Tableur/}).first().click();
  const row=page.locator('textarea[data-sheet-col="6"]').first();
  await row.fill('Pharmacien');
  const rowSalary=page.locator('input[data-sheet-col="8"]').first();
  await rowSalary.fill('40000');
  await expect(rowSalary).toHaveAttribute('aria-invalid','true');
  await expect(rowSalary).toHaveCSS('color','rgb(220, 38, 38)');
  await expect(rowSalary).toHaveCSS('box-shadow','rgb(220, 38, 38) 0px 0px 0px 1px inset');
  await page.screenshot({path:'/tmp/salary-grid-table-warning.png',fullPage:true});
  await rowSalary.fill('42000');
  await expect(rowSalary).not.toHaveAttribute('aria-invalid','true');
});

for (const offline of [false, true]) {
  test(`deletes a title after confirmation and persists after reload (${offline ? 'offline' : 'online'})`, async ({ page, context }) => {
    const entry = structuredClone(seed.find((item: { masculine: string }) => item.masculine === 'Pharmacien'));
    let entries = [entry];
    let synced = false;
    await page.addInitScript(() => {
      localStorage.setItem('contribution_auth', JSON.stringify({ id: 'salary-delete-test', username: 'admin', name: 'Test', workspaceId: 'workspace_default', role: 'admin', taskSessionToken: 'test-token' }));
      localStorage.setItem('contribution_last_activity', String(Date.now()));
    });
    await page.route('**/*.supabase.co/**', async route => {
      const path = new URL(route.request().url()).pathname;
      let body: unknown = [];
      if (path.endsWith('/app_users')) body = { role: 'admin' };
      if (path.endsWith('/read_salary_grid')) body = entries;
      if (path.endsWith('/sync_reference_change')) {
        const { p_change: change } = route.request().postDataJSON();
        expect(change.scope).toBe('salary');
        expect(change.patches).toEqual([{ id: entry.id, before: entry, after: null }]);
        synced = true;
        entries = [];
        body = entries;
      }
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(body), headers: { 'content-range': '0-0/0' } });
    });
    await page.goto('http://127.0.0.1:5179/app/parametres/grille-salariale');
    const remove = page.getByRole('button', { name: 'Supprimer Pharmacien', exact: true });
    await expect(remove).toBeVisible();
    await remove.click();
    const dialog = page.getByRole('dialog', { name: 'Supprimer le titre ?' });
    await expect(dialog).toContainText('Pharmacien / Pharmacienne');
    if (!offline) await page.screenshot({ path: '/tmp/salary-grid-delete-dialog.png' });
    await dialog.getByRole('button', { name: 'Annuler' }).click();
    await expect(remove).toBeVisible();
    if (offline) await context.setOffline(true);
    await remove.click();
    await dialog.getByRole('button', { name: 'Supprimer', exact: true }).click();
    await expect(dialog).toHaveCount(0);
    await expect(remove).toHaveCount(0);
    await expect(page.locator('tbody')).toContainText('Aucun titre');
    if (offline) {
      expect(synced).toBe(false);
      await context.setOffline(false);
    }
    await expect.poll(() => synced).toBe(true);
    await page.reload();
    await expect(page.locator('tbody')).toContainText('Aucun titre');
    await expect(remove).toHaveCount(0);
  });
}
