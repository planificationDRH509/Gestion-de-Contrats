import { expect, test } from '@playwright/test';

test('print index navigates through selected contracts without affecting printed pages', async ({ page }) => {
  const now = new Date().toISOString();
  await page.addInitScript(() => {
    localStorage.setItem('contribution_auth', JSON.stringify({id:'sheet-layout-user',username:'admin',name:'Test',workspaceId:'workspace_default',role:'admin',taskSessionToken:'test-token'}));
    localStorage.setItem('contribution_last_activity',String(Date.now()));
    localStorage.setItem('new_contract_entry_mode','sheet');
  });
  const people = [
    {id:'short',first:'Marie',last:'Jean',address:'Delmas',position:'Infirmière de ligne',assignment:'Direction générale'},
    {id:'long',first:'Marie Stéphanie Alexandra',last:'Jean Baptiste Pierre Louis',address:'Port-au-Prince, quartier du centre administratif',position:'Technicienne en maintenance informatique',assignment:'Direction départementale de la santé de la Grand’Anse'}
  ];
  await page.route('**/*.supabase.co/**', async route => {
    const path = new URL(route.request().url()).pathname;
    let body: unknown = [];
    if (path.endsWith('/app_users')) body={role:'admin'};
    if (path.endsWith('/identification')) body=people.map((person,index) => ({nif:`123456789${index}`,workspace_id:'workspace_default',prenom:person.first,nom:person.last,sexe:'Femme',adresse:person.address,telephone:`+509 37 00 00 0${index}`,created_at:now,updated_at:now,deleted_at:null}));
    if (path.endsWith('/contrat')) body=people.map((person,index) => ({id_contrat:person.id,nif:`123456789${index}`,workspace_id:'workspace_default',status:'saisie',duree_contrat:6,annee_fiscale:'2025-2026',salaire_en_chiffre:35000,titre:person.position,lieu_affectation:person.assignment,created_by:'sheet-layout-user',created_at:now,updated_at:now,deleted_at:null,contract_tags:[],identification:{nif:`123456789${index}`,prenom:person.first,nom:person.last,sexe:'Femme',adresse:person.address}}));
    if(path.endsWith('/read_salary_grid')) body=[{id:'nurse',masculine:'Infirmier de ligne',feminine:'Infirmière de ligne',category:'Soins',jobType:'Universitaire',salaries:[35000],aliases:[],source:'',sourceRows:[],notes:'',active:true,version:1}];
    await route.fulfill({status:200,contentType:'application/json',body:JSON.stringify(body),headers:{'content-range':`0-${Array.isArray(body)?Math.max(0,body.length-1):0}/${Array.isArray(body)?body.length:1}`}});
  });
  await page.setViewportSize({ width: 1600, height: 1000 });
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('http://127.0.0.1:5179/app/contrats/print?ids=long,short');
  const index = page.getByRole('navigation', { name: 'Contrats sélectionnés' });
  await expect(index.getByRole('link')).toHaveText(['1Marie Stéphanie Alexandra JEAN BAPTISTE PIERRE LOUIS', '2Marie JEAN']);
  const documents = page.locator('.print-preview-documents');
  const target = page.locator('#print-contract-short');
  const indexBounds = (await index.boundingBox())!;
  expect(indexBounds.x + indexBounds.width).toBeLessThan((await documents.boundingBox())!.x);
  await index.getByRole('link', { name: 'Marie JEAN', exact: true }).click();
  await expect(target).toBeFocused();
  await expect.poll(() => documents.evaluate(el => el.scrollTop)).toBeGreaterThan(1000);
  expect(Math.abs((await target.boundingBox())!.y - (await documents.boundingBox())!.y)).toBeLessThan(5);
  await page.screenshot({ path: '/tmp/contracts-print-index.png' });

  // Nonconsecutive page selections retain their targets and print order.
  for (const number of [1, 3]) await page.getByRole('button', { name: `Page ${number}`, exact: true }).click();
  await index.getByRole('link').first().click();
  await expect(page.locator('#print-contract-long')).toBeFocused();
  await expect(page.locator('.contract-sheet:visible')).toHaveCount(4);
  await page.emulateMedia({ media: 'print' });
  await expect(index).toBeHidden();
  const printLayout = await documents.evaluate(el => {
    const style = getComputedStyle(el);
    return { overflow: style.overflow, maxHeight: style.maxHeight, height: el.clientHeight, scrollHeight: el.scrollHeight };
  });
  expect(printLayout.overflow).toBe('visible');
  expect(printLayout.maxHeight).toBe('none');
  expect(printLayout.height).toBeGreaterThan(4000);
  expect(printLayout.height).toBe(printLayout.scrollHeight);
  await expect(page.locator('.contract-sheet:visible')).toHaveCount(4);
});
