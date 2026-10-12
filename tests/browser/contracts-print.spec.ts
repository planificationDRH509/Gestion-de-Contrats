import { expect, test } from '@playwright/test';

test('print index navigates through selected contracts without affecting printed pages', async ({ page }) => {
  const now = new Date().toISOString();
  await page.addInitScript(() => {
    window.print = () => { document.documentElement.dataset.printRequested = 'true'; };
    localStorage.setItem('contribution_auth', JSON.stringify({id:'sheet-layout-user',username:'admin',name:'Test',workspaceId:'workspace_default',role:'admin',taskSessionToken:'test-token'}));
    localStorage.setItem('contribution_last_activity',String(Date.now()));
    localStorage.setItem('new_contract_entry_mode','sheet');
  });
  const people = [
    {id:'short',first:'Marie',last:'Jean',address:'Delmas',position:'Infirmière de ligne',assignment:'Direction générale'},
    {id:'long',first:'Marie Stéphanie Alexandra',last:'Durand',address:'Port-au-Prince, quartier du centre administratif',position:'Technicienne en maintenance informatique',assignment:'Direction départementale de la santé de la Grand’Anse'}
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
  await page.goto('http://127.0.0.1:5179/app/contrats/print?ids=short,long');
  const index = page.getByRole('navigation', { name: 'Contrats sélectionnés' });
  await expect(index.getByRole('link')).toHaveText(['1Marie Stéphanie Alexandra DURAND', '2Marie JEAN']);
  const firstLink = index.getByRole('link').first();
  const secondLink = index.getByRole('link').last();
  await expect(firstLink).toHaveAttribute('aria-current', 'location');
  const documents = page.locator('.print-preview-documents');
  const target = page.locator('#print-contract-short');
  await expect.poll(() => index.evaluate(el => {
    const preview = el.closest('.print-preview-layout')!.querySelector('.print-preview-documents')!;
    return preview.getBoundingClientRect().left - el.getBoundingClientRect().right;
  })).toBeGreaterThan(0);
  // Both panes fit at laptop widths, with full pages scaled into the preview.
  for (const width of [1024, 1280, 1600]) {
    await page.setViewportSize({ width, height: 1000 });
    await expect.poll(() => documents.evaluate(el => el.scrollWidth - el.clientWidth)).toBeLessThanOrEqual(1);
    await expect.poll(() => index.evaluate(el => el.scrollWidth - el.clientWidth)).toBeLessThanOrEqual(1);
    await expect.poll(() => documents.evaluate(el => {
      const sheet = el.querySelector('.contract-sheet')!.getBoundingClientRect();
      return sheet.right - el.getBoundingClientRect().right;
    })).toBeLessThanOrEqual(0);
  }
  await index.getByRole('link', { name: 'Marie JEAN', exact: true }).click();
  await expect(target).toBeFocused();
  await expect(secondLink).toHaveAttribute('aria-current', 'location');
  await expect(firstLink).not.toHaveAttribute('aria-current');
  await expect.poll(() => documents.evaluate(el => el.scrollTop)).toBeGreaterThan(1000);
  expect(Math.abs((await target.boundingBox())!.y - (await documents.boundingBox())!.y)).toBeLessThan(5);
  const previousWidth = (await documents.boundingBox())!.width;
  await page.getByRole('button', { name: 'Masquer la liste', exact: true }).click();
  await expect(index).toBeHidden();
  expect((await documents.boundingBox())!.width).toBeGreaterThan(previousWidth);
  await page.getByRole('button', { name: 'Afficher la liste', exact: true }).click();
  await expect(index).toBeVisible();
  await secondLink.click();
  await expect(target).toBeFocused();
  // Wheel scrolling updates the index without clicking a name.
  await documents.hover();
  await page.mouse.wheel(0, -5000);
  await expect(firstLink).toHaveAttribute('aria-current', 'location');
  await expect(secondLink).not.toHaveAttribute('aria-current');
  await page.mouse.wheel(0, 5000);
  await expect(secondLink).toHaveAttribute('aria-current', 'location');

  await page.emulateMedia({ reducedMotion: 'no-preference' });
  await firstLink.hover();
  await expect(firstLink).toHaveCSS('transform', 'matrix(1, 0, 0, 1, 3, 0)');
  await expect(secondLink).toHaveAttribute('aria-current', 'location');
  await page.screenshot({ path: '/tmp/contracts-print-index.png' });
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await expect(firstLink).toHaveCSS('transform', 'none');

  // Hover actions change only the print selection; details remain available.
  const firstRow = firstLink.locator('xpath=../..');
  const secondRow = secondLink.locator('xpath=../..');
  await firstRow.hover();
  await firstRow.getByRole('button', { name: /Détails de/ }).click();
  const details = firstRow.getByRole('region');
  await expect(details).toContainText('6 mois');
  await expect(details).toContainText('35,000.00');
  await expect(details).toContainText('Technicienne en maintenance informatique');
  await expect(details).toContainText('Direction départementale de la santé de la Grand’Anse');
  await secondRow.hover();
  await secondRow.getByRole('button', { name: /Retirer/ }).click();
  await expect(secondLink).toHaveAttribute('aria-disabled', 'true');
  await expect(target).toHaveCount(0);
  await expect(firstLink).toHaveAttribute('aria-current', 'location');
  await expect(secondRow.getByRole('button', { name: /Réintégrer/ })).toBeVisible();
  await expect(page.locator('.contract-document')).toHaveCount(1);
  await page.getByRole('button', { name: 'Imprimer la Liste', exact: true }).click();
  const listFrame = page.frameLocator('iframe[title="Impression de la liste des contrats"]');
  await expect(listFrame.locator('html')).toHaveAttribute('data-print-requested', 'true');
  await expect(listFrame.locator('tbody tr')).toHaveCount(1);
  await expect(listFrame.locator('thead')).toContainText('Nom et prénom');
  await expect(listFrame.locator('tbody')).toContainText('Marie Stéphanie Alexandra');
  await expect(listFrame.locator('tbody')).toContainText('6 mois');
  await expect(listFrame.locator('body')).not.toContainText('35,000.00');
  await expect(listFrame.locator('thead')).not.toContainText('Salaire');
  await expect(listFrame.locator('.receipt-checkbox')).toHaveCount(1);
  await expect(listFrame.locator('.signature-space')).toHaveCount(2);
  await expect(listFrame.locator('tbody')).toContainText('Technicienne en maintenance informatique');
  await expect(listFrame.locator('tbody')).toContainText('Direction départementale de la santé de la Grand’Anse');
  const summary = await page.context().newPage();
  await summary.setViewportSize({ width: 710, height: 700 });
  await summary.setContent(await listFrame.locator('html').evaluate(el => el.outerHTML));
  await summary.screenshot({ path: '/tmp/contracts-list-summary.png' });
  await summary.close();
  await listFrame.locator('html').evaluate(() => window.dispatchEvent(new Event('afterprint')));
  await expect(page.locator('iframe[title="Impression de la liste des contrats"]')).toHaveCount(0);
  await page.screenshot({ path: '/tmp/contracts-print-actions.png' });
  await page.emulateMedia({ media: 'print' });
  await expect(index).toBeHidden();
  await expect(page.locator('.contract-sheet:visible')).toHaveCount(4);
  await page.emulateMedia({ media: 'screen' });
  await secondRow.getByRole('button', { name: /Réintégrer/ }).click();
  await expect(page.locator('.contract-document')).toHaveCount(2);
  await expect(secondLink).not.toHaveAttribute('aria-disabled');
  await expect(target).toBeAttached();
  await firstRow.getByRole('button', { name: /Détails de/ }).press('Escape');
  await expect(details).toHaveCount(0);

  // Nonconsecutive page selections retain their targets and print order.
  for (const number of [1, 3]) await page.getByRole('button', { name: `Page ${number}`, exact: true }).click();
  await index.getByRole('link').first().click();
  await expect(page.locator('#print-contract-long')).toBeFocused();
  await expect(firstLink).toHaveAttribute('aria-current', 'location');
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
  // The home FAB retains the printed batch as one reopenable entry.
  await page.emulateMedia({ media: 'screen' });
  await page.getByRole('button', { name: 'Imprimer', exact: true }).click();
  await page.evaluate(() => window.dispatchEvent(new Event('afterprint')));
  await page.goto('http://127.0.0.1:5179/app/contrats');
  await page.getByRole("button", { name: "Historique d'Impressions", exact: true }).click();
  await expect(page).toHaveURL(/historique-impressions/);
  const history = page.locator('.print-history-page');
  await expect(history.getByRole('heading', { name: "Historique d'Impressions" })).toBeVisible();
  await expect(page.locator('.print-history-fab')).toHaveCount(0);
  await expect(history.locator('.print-history-item')).toHaveCount(1);
  await page.reload();
  await expect(history.locator('.print-history-item')).toHaveCount(1);
  await history.getByRole('searchbox').fill('absent');
  await expect(history.getByText('Aucune impression trouvée.')).toBeVisible();
  await history.getByRole('searchbox').fill('');
  await expect(history.getByRole('button', { name: /^Lot de 2 contrats$/ })).toBeVisible();
  await page.screenshot({ path: '/tmp/contracts-print-history-batch.png' });
  await history.getByRole('button', { name: 'Imprimer', exact: true }).click();
  const historyPrint = page.frameLocator('iframe[title="Impression de l’historique"]');
  await expect(historyPrint.locator('html')).toHaveAttribute('data-print-requested', 'true');
  await expect(historyPrint.locator('.line')).toHaveCount(2);
  await historyPrint.locator('html').evaluate(() => window.dispatchEvent(new Event('afterprint')));
  await expect(page.locator('iframe[title="Impression de l’historique"]')).toHaveCount(0);
  await history.getByRole('button', { name: 'Ajouter', exact: true }).click();
  const manual = page.locator('.print-history-modal');
  await manual.getByLabel('Prénom', { exact: true }).fill('Anne');
  await manual.getByLabel('Nom *', { exact: true }).fill('Paul');
  await manual.getByRole('button', { name: 'Ajouter', exact: true }).click();
  await expect(history.locator('.print-history-item')).toHaveCount(2);
  await history.getByRole('button', { name: 'Retirer Anne Paul', exact: true }).click();
  await expect(history.locator('.print-history-item')).toHaveCount(1);

  await history.getByRole('button', { name: 'Retirer le lot de 2 contrats' }).click();
  await expect(history.locator('.print-history-item')).toHaveCount(0);
  await page.locator('.print-history-undo').getByRole('button', { name: 'Annuler' }).click();
  await expect(history.locator('.print-history-item')).toHaveCount(1);
  await history.getByRole('button', { name: /^Lot de 2 contrats$/ }).click();
  await expect(page).toHaveURL(/\/app\/contrats\/print\?ids=/);
  await expect(page.locator('.contract-document')).toHaveCount(2);

});

test('adds suggested and searched contracts to the printed batch while preserving exclusions and pages', async ({ page }) => {
  await page.addInitScript(() => {
    window.print = () => { document.documentElement.dataset.printRequested = 'true'; };
    localStorage.setItem('contribution_auth', JSON.stringify({ id: 'print-add-user', username: 'admin', name: 'Test', workspaceId: 'workspace_default', role: 'admin', taskSessionToken: 'test-token' }));
    localStorage.setItem('contribution_last_activity', String(Date.now()));
  });
  const people = [
    { id: 'base', first: 'Marie', last: 'Jean', dossier: 'd1', date: '2026-10-01T12:00:00Z', position: 'Infirmière', duration: 6 },
    { id: 'excluded', first: 'Paul', last: 'Retiré', dossier: null, date: '2026-01-01T12:00:00Z', position: 'Chauffeur', duration: 12 },
    { id: 'suggestion', first: 'Stéphanie', last: 'Zéphir', dossier: 'd1', date: '2026-10-01T12:00:00Z', position: 'Infirmière', duration: 6 },
    { id: 'search', first: 'Anne', last: 'Albert', dossier: null, date: '2026-01-01T12:00:00Z', position: 'Comptable', duration: 12 }
  ];
  const rows = people.map((person, index) => ({ id_contrat: person.id, nif: `123456789${index}`, workspace_id: 'workspace_default', dossier_id: person.dossier, status: 'saisie', duree_contrat: person.duration, annee_fiscale: '2025-2026', salaire_en_chiffre: 35000, titre: person.position, lieu_affectation: 'Direction générale', created_by: 'print-add-user', created_at: person.date, updated_at: person.date, deleted_at: null, contract_tags: [], identification: { nif: `123456789${index}`, prenom: person.first, nom: person.last, sexe: 'Femme', adresse: 'Delmas' } }));
  await page.route('**/*.supabase.co/**', async route => {
    const url = new URL(route.request().url());
    let body: unknown = [];
    if (url.pathname.endsWith('/app_users')) body = { role: 'admin' };
    if (url.pathname.endsWith('/contrat')) {
      const filter = url.searchParams.get('id_contrat');
      const ids = filter?.replace(/^in\.\(/, '').replace(/\)$/, '').split(',').map(id => id.replaceAll('"', ''));
      body = ids ? rows.filter(row => ids.includes(row.id_contrat)) : rows;
    }
    if (url.pathname.endsWith('/read_contract_lists')) body = [{ id: 'list1', workspaceId: 'workspace_default', durationMonths: 6, visaNumber: null, sealedAt: null, version: 1, createdAt: '2026-10-01', members: ['base', 'suggestion'].map(id => ({ id })), history: [] }];
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(body), headers: { 'content-range': `0-${Array.isArray(body) ? Math.max(0, body.length - 1) : 0}/${Array.isArray(body) ? body.length : 1}` } });
  });
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto('http://127.0.0.1:5179/app/contrats/print?ids=base,excluded');
  await expect(page.locator('.contract-document')).toHaveCount(2);
  await page.getByRole('navigation', { name: 'Contrats sélectionnés' }).getByRole('link', { name: 'Paul RETIRÉ' }).hover();
  await page.getByRole('button', { name: 'Retirer Paul RETIRÉ de l’impression' }).click();
  await page.getByRole('button', { name: 'Page 3', exact: true }).click();
  await page.getByRole('button', { name: 'Ajouter des contrats', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'Ajouter des contrats' });
  await expect(dialog.getByRole('checkbox').first()).toHaveAccessibleName('Stéphanie ZÉPHIR');
  await expect(dialog.getByRole('checkbox', { name: 'Marie JEAN' })).toHaveCount(0);
  await dialog.getByRole('checkbox', { name: 'Stéphanie ZÉPHIR' }).check();
  const search = dialog.getByRole('searchbox');
  await search.fill('albert anne');
  await expect(dialog.getByRole('checkbox')).toHaveCount(1);
  await dialog.getByRole('checkbox', { name: 'Anne ALBERT' }).check();
  await search.fill('absent');
  await expect(dialog.getByText('Aucun contrat trouvé.')).toBeVisible();
  await search.fill('');
  await expect(dialog.getByRole('checkbox', { name: 'Stéphanie ZÉPHIR' })).toBeChecked();
  await page.screenshot({ path: '/tmp/contracts-print-add.png' });
  await dialog.getByRole('button', { name: 'Ajouter (2)', exact: true }).click();
  await expect(dialog).toHaveCount(0);
  await expect(page).toHaveURL(/ids=base%2Cexcluded%2Csuggestion%2Csearch/);
  await expect(page.locator('.contract-document')).toHaveCount(3);
  await expect(page.locator('#print-contract-excluded')).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Page 3', exact: true })).toHaveAttribute('aria-pressed', 'false');
  await page.getByRole('button', { name: 'Imprimer la Liste', exact: true }).click();
  const listFrame = page.frameLocator('iframe[title="Impression de la liste des contrats"]');
  await expect(listFrame.locator('tbody tr')).toHaveCount(3);
  await expect(listFrame.locator('tbody')).toContainText('Stéphanie');
  await expect(listFrame.locator('tbody')).toContainText('Anne');
  await listFrame.locator('html').evaluate(() => window.dispatchEvent(new Event('afterprint')));
  await page.emulateMedia({ media: 'print' });
  await expect(page.locator('.contract-sheet:visible')).toHaveCount(9);
  await expect(page.locator('#print-contract-suggestion .contract-sheet:visible')).toHaveCount(3);
  await page.emulateMedia({ media: 'screen' });
  await page.getByRole('button', { name: 'Ajouter des contrats', exact: true }).click();
  await expect(dialog.getByRole('checkbox')).toHaveCount(1);
  await expect(dialog.getByRole('checkbox')).toHaveAccessibleName('Paul RETIRÉ');
  await dialog.getByRole('checkbox').check();
  await dialog.getByRole('button', { name: 'Ajouter (1)', exact: true }).click();
  await expect(page.locator('.contract-document')).toHaveCount(4);
  await page.reload();
  await expect(page.locator('.contract-document')).toHaveCount(4);
});
