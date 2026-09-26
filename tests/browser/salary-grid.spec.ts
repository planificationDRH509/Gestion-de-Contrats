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
    if(url.includes('/rpc/save_salary_grid_entry')) {
      const {p_entry:entry}=route.request().postDataJSON();
      entries=entries.map((e: {id: string}) => e.id===entry.id ? {...entry,version:entry.version+1} : e);
      body=entries;
    }
    await route.fulfill({status:200,contentType:'application/json',body:JSON.stringify(body),headers:{'content-range':'0-0/0'}});
  });
  await page.goto('http://127.0.0.1:5179/app/parametres');
  await expect(page.getByRole('navigation').getByText('Grille Salariale')).toHaveCount(0);
  await page.getByRole('link',{name:'Grille Salariale'}).click();
  await expect(page).toHaveURL(/\/app\/parametres\/grille-salariale$/);
  await expect(page.getByRole('heading',{name:'Grille Salariale',exact:true})).toBeVisible();
  await page.getByRole('textbox',{name:'Rechercher un titre'}).fill('Pharmacien');
  await page.getByRole('button',{name:'Modifier Pharmacien',exact:true}).click();
  await page.getByLabel('Salaires autorisés (HTG)').fill('41000; 42000');
  await page.getByRole('button',{name:'Enregistrer',exact:true}).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await page.reload();
  await page.getByRole('textbox',{name:'Rechercher un titre'}).fill('Pharmacien');
  await expect(page.locator('tbody')).toContainText(/41.?000/);
  await page.screenshot({path:'/tmp/salary-grid-page.png',fullPage:true});
  await page.goto('http://127.0.0.1:5179/app/contrats/nouveau');
  await page.getByRole('radio',{name:/Femme/}).click();
  const title=page.locator('input[name="position"]');
  await title.fill('Pharmacien');
  await title.press('Tab');
  await expect(title).toHaveValue('Pharmacienne');
  const salary=page.getByRole('textbox',{name:'Salaire en gourdes'});
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
