import { expect, test, type Page } from '@playwright/test';

async function expectAlignedSheet(page: Page, fits = false) {
  const sheet = page.locator('.contracts-data-sheet');
  if (fits) {
    await expect.poll(() => sheet.locator('.contracts-sheet-scroll').evaluate(el => el.scrollWidth - el.clientWidth)).toBeLessThanOrEqual(1);
  }
  await expect.poll(async () => sheet.evaluate(root => {
    const headers = [...root.querySelectorAll('.contracts-sheet-head-cell')].map(el => el.getBoundingClientRect());
    const rows = [...root.querySelectorAll('.contracts-sheet-row')];
    return Math.max(...rows.flatMap(row => [...row.children].map((cell, index) => {
      const rect = cell.getBoundingClientRect();
      return Math.max(Math.abs(rect.x - headers[index].x), Math.abs(rect.width - headers[index].width));
    })));
  })).toBeLessThan(1);
  const alignment = await sheet.evaluate(root => {
    const zoom = parseFloat(getComputedStyle(root.querySelector('.contracts-sheet-grid')!).zoom);
    const rows = [...root.querySelectorAll('.contracts-sheet-row')];
    const textDrift = rows.map(row => {
      const tops = [...row.querySelectorAll<HTMLInputElement | HTMLTextAreaElement>('[data-sheet-col]')].map(field => {
        const style = getComputedStyle(field);
        const top = field.getBoundingClientRect().top + parseFloat(style.paddingTop) * zoom;
        if (field.tagName === 'TEXTAREA') return top;
        const contentHeight = field.clientHeight - parseFloat(style.paddingTop) - parseFloat(style.paddingBottom);
        return top + (contentHeight - parseFloat(style.lineHeight)) * zoom / 2;
      });
      return Math.max(...tops) - Math.min(...tops);
    });
    const borderDrift = rows.flatMap(row => [...row.children].map(cell => Math.abs(cell.getBoundingClientRect().bottom - row.getBoundingClientRect().bottom)));
    const actionOverflow = [...root.querySelectorAll('.contracts-sheet-menu-cell')].flatMap(cell => [...cell.querySelectorAll('button')].map(button => button.getBoundingClientRect().right - cell.getBoundingClientRect().right));
    const scroll = root.querySelector('.contracts-sheet-scroll')!;
    return {textDrift: Math.max(...textDrift), borderDrift: Math.max(...borderDrift), actionOverflow: Math.max(...actionOverflow), overflow: scroll.scrollWidth - scroll.clientWidth};
  });
  expect(alignment.textDrift).toBeLessThan(1);
  expect(alignment.borderDrift).toBeLessThanOrEqual(2);
  expect(alignment.actionOverflow).toBeLessThanOrEqual(0);
  if (fits) expect(alignment.overflow).toBeLessThanOrEqual(1);
}

test('contract spreadsheet aligns headers, cells and row actions across zoom and fullscreen', async ({page}) => {
  page.setDefaultTimeout(10000);
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
  await page.setViewportSize({width:1600,height:1000});
  await page.goto('http://127.0.0.1:5179/app/contrats/nouveau');
  await expect(page.locator('[data-sheet-row="existingRow_long"][data-sheet-col="1"]')).toBeVisible();
  await expectAlignedSheet(page, true);
  await page.screenshot({path:'/tmp/contract-sheet-aligned.png',fullPage:true});

  await expect(page.locator('.contracts-sheet-head-cell')).toHaveCount(10);
  expect(await page.locator('.contracts-sheet-state-cell').first().evaluate(el => parseFloat(getComputedStyle(el).width))).toBeCloseTo(30, 1);
  await expect(page.locator('.contracts-sheet-state-cell button')).toHaveCount(0);
  await page.getByRole('button', {name:'Actions de la ligne',exact:true}).first().click();
  await page.getByRole('menuitem', {name:'Afficher le téléphone',exact:true}).click();
  await expect(page.locator('.contracts-sheet-head-cell')).toHaveCount(11);
  await expect(page.getByRole('textbox', {name:'Téléphone',exact:true})).toHaveCount(5);
  await expect(page.locator('[data-sheet-row="existingRow_long"][data-sheet-col="10"]')).toHaveValue('+509 37 00 00 01');
  const phoneOverflow = await page.locator('[data-sheet-row="existingRow_long"][data-sheet-col="10"]').evaluate(element => {
    const input = element as HTMLInputElement;
    const style = getComputedStyle(input);
    const context = document.createElement('canvas').getContext('2d')!;
    context.font = style.font;
    return context.measureText(input.value).width + parseFloat(style.paddingLeft) + parseFloat(style.paddingRight) - input.clientWidth;
  });
  expect(phoneOverflow).toBeLessThanOrEqual(0);
  await expectAlignedSheet(page, true);
  await page.reload();
  await expect(page.locator('.contracts-sheet-head-cell')).toHaveCount(11);
  await page.getByRole('button', {name:'Actions de la ligne',exact:true}).last().click();
  await page.screenshot({path:'/tmp/contract-sheet-row-menu.png',fullPage:true});
  await page.getByRole('menuitem', {name:'Masquer le téléphone',exact:true}).click();
  await expect(page.locator('.contracts-sheet-head-cell')).toHaveCount(10);
  await expect(page.getByRole('textbox', {name:'Téléphone',exact:true})).toHaveCount(0);
  await expectAlignedSheet(page, true);

  const startCell = page.locator('.contracts-sheet-row-new [data-sheet-col="0"]').first();
  await startCell.focus();
  await startCell.evaluate(el => {
    const clipboardData = new DataTransfer();
    clipboardData.setData('text/plain', [
      ['12345678901', '', 'Jean', 'F', '', 'Delmas', 'Infirmière de ligne', 'Direction', '35000', '6'],
      ['9876543210', 'Anne', 'Paul', 'F', '', 'Delmas', 'Infirmière de ligne', 'Direction', '35000', '6']
    ].map(row => row.join('\t')).join('\r\n'));
    el.dispatchEvent(new ClipboardEvent('paste', {clipboardData, bubbles:true, cancelable:true}));
  });
  await expect(startCell).toHaveValue('12345678901');
  await expect(startCell).toHaveAttribute('aria-invalid', 'true');
  await page.getByRole('button', {name:'Enregistrer les lignes collées (2)', exact:true}).click();
  await expect(startCell).toBeFocused();
  await page.screenshot({path:'/tmp/contract-sheet-paste-errors.png',fullPage:true});
  await startCell.press('ControlOrMeta+z');
  await expect(startCell).toHaveValue('');
  await startCell.press('ControlOrMeta+Shift+z');
  await expect(startCell).toHaveValue('12345678901');
  await page.getByRole('button', {name:'Annuler la saisie',exact:true}).click();
  await expect(startCell).toHaveValue('');

  await page.getByRole('button', {name:'Valeurs par défaut',exact:true}).click();
  for (const label of ['Dossier', 'Durée', 'Adresse', 'Affectation', 'Commentaire']) {
    await page.getByRole('switch', {name:`Activer ${label.toLowerCase()} par défaut`,exact:true}).check();
  }
  await page.locator('.defaults-input-mini').fill('6');
  await page.getByPlaceholder('Adresse par défaut').fill('Delmas');
  const defaultHeights = await page.locator('.sheet-default-field').evaluateAll(items => items.map(item => item.getBoundingClientRect().height));
  expect(Math.max(...defaultHeights) - Math.min(...defaultHeights)).toBeLessThan(1);
  await page.screenshot({path:'/tmp/contract-sheet-defaults-aligned.png',fullPage:true});

  await page.getByRole('button', {name:'Actions de la ligne',exact:true}).first().click();
  await page.getByRole('menuitem', {name:'Afficher le téléphone',exact:true}).click();

  for (const zoom of ['75', '100', '125']) {
    await page.getByRole('combobox', {name:'Zoom du tableur', exact:true}).selectOption(zoom);
    await expectAlignedSheet(page);
  }

  // The dragged edge follows the pointer even at a reduced zoom.
  await page.getByRole('combobox', {name:'Zoom du tableur', exact:true}).selectOption('75');
  const firstNameHeader = page.locator('.contracts-sheet-head-cell').nth(1);
  const before = (await firstNameHeader.boundingBox())!;
  const handle = (await page.getByRole('button', {name:'Redimensionner Prénom',exact:true}).boundingBox())!;
  await page.mouse.move(handle.x + handle.width / 2, handle.y + handle.height / 2);
  await page.mouse.down();
  await page.mouse.move(handle.x + handle.width / 2 + 60, handle.y + handle.height / 2);
  await page.mouse.up();
  expect(Math.abs((await firstNameHeader.boundingBox())!.width - before.width - 60)).toBeLessThan(1);
  await expectAlignedSheet(page);

  // Wrapping draft values preserves the first line and keyboard navigation.
  const draftName = page.locator('.contracts-sheet-row-new [data-sheet-col="1"]').first();
  await draftName.fill('Marie Stéphanie Alexandra');
  await draftName.press('Tab');
  await expect(page.locator('.contracts-sheet-row-new [data-sheet-col="2"]').first()).toBeFocused();
  await expectAlignedSheet(page);

  await page.getByRole('button', {name:'Ajuster les colonnes', exact:true}).click();
  await page.setViewportSize({width:1366,height:900});
  await expectAlignedSheet(page, true);
  await page.screenshot({path:'/tmp/contract-sheet-laptop-aligned.png',fullPage:true});

  const widths = await page.locator('.contracts-sheet-header').evaluate(el => (el as HTMLElement).style.gridTemplateColumns);
  const activeCell = page.locator('.contracts-sheet-row-new [data-sheet-col="2"]').first();
  await activeCell.focus();
  await page.getByRole('button', {name:'Agrandir le tableur', exact:true}).click();
  await expect(activeCell).toBeFocused();
  await expect(page.locator('.contracts-sheet-fullscreen')).toBeVisible();
  await expectAlignedSheet(page, true);
  await page.getByRole('button', {name:'Actions de la ligne',exact:true}).last().click();
  await expect(page.getByRole('menu')).toBeVisible();
  await expect(page.getByRole('menuitem', {name:'Ajouter un commentaire',exact:true})).toBeVisible();
  await page.getByRole('menu').press('Escape');
  expect(await page.locator('.contracts-sheet-header').evaluate(el => (el as HTMLElement).style.gridTemplateColumns)).toBe(widths);
  await expect(page.locator('.defaults-input-mini')).toHaveValue('6');
  await expect(page.getByPlaceholder('Adresse par défaut')).toHaveValue('Delmas');
  const toolbarHeight = await page.locator('.sheet-edit-toolbar').evaluate(el => el.getBoundingClientRect().height);
  expect(toolbarHeight).toBeLessThan(100);
  await page.screenshot({path:'/tmp/contract-sheet-fullscreen-aligned.png',fullPage:true});
  await page.locator('.contracts-sheet-fullscreen').getByRole('button', {name:'Réduire le tableur',exact:true}).click();
  await expectAlignedSheet(page, true);
  expect(await page.locator('.contracts-sheet-header').evaluate(el => (el as HTMLElement).style.gridTemplateColumns)).toBe(widths);
  await page.getByRole('button', {name:/Contrats récents/}).click();
  await expect(page.locator('[data-sheet-row="existingRow_long"][data-sheet-col="1"]')).toBeHidden();
  await page.getByRole('button', {name:/Contrats récents/}).click();
  await expectAlignedSheet(page, true);
  await page.reload();
  await expect(page.locator('.contracts-sheet-header')).toBeVisible();
  expect(await page.locator('.contracts-sheet-header').evaluate(el => (el as HTMLElement).style.gridTemplateColumns)).toBe(widths);
  await expect(page.locator('.defaults-input-mini')).toHaveValue('6');
  await expect(page.getByPlaceholder('Adresse par défaut')).toHaveValue('Delmas');
  await expect(page.locator('.contracts-sheet-row-new [data-sheet-col="1"]').first()).toHaveValue('Marie Stéphanie Alexandra');
});
