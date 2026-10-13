import { expect, test } from '@playwright/test';
import { getFiscalYearForDate } from '../../src/lib/contractDateFilters';

test('shares the colored paperclip across every fiscal period for the same identification', async ({page}) => {
  const currentYear = getFiscalYearForDate(new Date());
  const startYear = Number(currentYear.split('-')[0]);
  const years = [-1, 0, 1].map(offset => `${startYear + offset}-${startYear + offset + 1}`);
  const personNif = '111-222-333-4';
  const otherNif = '555-666-777-8';
  let entries: Record<string, any>[] = [{id:'existing',kind:'file',name:'preuve.pdf',content:'SGVsbG8=',size:5,createdAt:'2026-01-01'}];
  const rows = years.flatMap(year => [personNif, otherNif].map(nif => ({
    id_contrat:`${nif}-${year}`,nif,workspace_id:'workspace_default',created_by:'attachment-period-user',
    status:'saisie',duree_contrat:6,annee_fiscale:year,salaire_en_chiffre:25000,
    titre:`Agent ${year}`,lieu_affectation:'Port-au-Prince',created_at:new Date().toISOString(),
    updated_at:new Date().toISOString(),deleted_at:null,contract_tags:[],
    identification:{nif,prenom:nif === personNif ? 'Marie' : 'Paul',nom:'Jean',sexe:'Femme',adresse:'Port-au-Prince'}
  })));
  await page.addInitScript(() => {
    localStorage.setItem('contribution_auth',JSON.stringify({id:'attachment-period-user',username:'agent',name:'Test',workspaceId:'workspace_default',role:'agent',taskSessionToken:'test-token'}));
    localStorage.setItem('contribution_last_activity',String(Date.now()));
  });
  await page.route('**/*.supabase.co/**', async route => {
    const url = new URL(route.request().url());
    let body: unknown = [];
    if (url.pathname.endsWith('/app_users')) body = {role:'agent'};
    if (url.pathname.endsWith('/contrat')) body = rows;
    if (url.pathname.endsWith('/identification')) body = rows.slice(0,2).map(row => ({
      ...row.identification,workspace_id:row.workspace_id,created_at:row.created_at,updated_at:row.updated_at,deleted_at:null
    }));
    if (url.pathname.endsWith('/manage_identification_attachments')) {
      const args = route.request().postDataJSON();
      expect(args).not.toHaveProperty('p_contract_id');
      expect(args).not.toHaveProperty('annee_fiscale');
      expect([personNif,otherNif]).toContain(args.p_person_id);
      if (args.p_person_id === personNif) {
        if (args.p_action === 'delete') entries = entries.filter(entry => entry.id !== args.p_document.id);
        if (args.p_action === 'add') entries.push({...args.p_document,createdAt:new Date().toISOString()});
        body = entries.map(({content:_content,...entry}) => entry);
      }
    }
    const count = Array.isArray(body) ? body.length : 1;
    await route.fulfill({status:200,contentType:'application/json',body:JSON.stringify(body),headers:{'content-range':`0-${Math.max(0,count-1)}/${count}`}});
  });
  await page.goto('http://127.0.0.1:5179/app/contrats');
  await page.getByRole('button',{name:/Filtres/}).click();
  const fiscalYear = page.getByRole('combobox',{name:'Exercice fiscal'});
  const personRow = page.locator('.contracts-row').filter({hasText:personNif});
  const personButton = personRow.getByRole('button',{name:'Pièces jointes',exact:true});
  const otherButton = page.locator('.contracts-row').filter({hasText:otherNif}).getByRole('button',{name:'Pièces jointes',exact:true});
  const dialog = page.getByRole('dialog',{name:'Pièces jointes'});

  async function checkEveryPeriod(colored: boolean) {
    for (const year of years) {
      await fiscalYear.selectOption(year);
      await expect(personRow.locator('[title="Poste"]').getByText(`Agent ${year}`,{exact:true})).toBeVisible();
      await expect(personButton).toHaveCount(1);
      if (colored) {
        await expect(personButton).toHaveClass(/has-attachments/);
        // Verify the actual icon color, not just the presence of a CSS class.
        const neutralColor = await otherButton.locator('span').evaluate(el => getComputedStyle(el).color);
        await expect(personButton.locator('span')).not.toHaveCSS('color',neutralColor);
      } else {
        await expect(personButton).not.toHaveClass(/has-attachments/);
      }
      await expect(otherButton).not.toHaveClass(/has-attachments/);
    }
  }

  await checkEveryPeriod(true);
  await personButton.click();
  await dialog.getByRole('button',{name:`Supprimer ${personNif}.pdf`,exact:true}).click();
  await dialog.getByRole('button',{name:'Supprimer',exact:true}).click();
  await expect(dialog.getByText('Aucune pièce jointe')).toBeVisible();
  await dialog.getByRole('button',{name:'Fermer',exact:true}).click();
  await checkEveryPeriod(false);

  await personButton.click();
  await dialog.getByRole('button',{name:'Lien',exact:true}).click();
  await dialog.getByLabel('Nom',{exact:true}).fill('Justificatif');
  await dialog.getByLabel('Lien du document').fill('https://example.com/justificatif.pdf');
  await dialog.getByRole('button',{name:'Ajouter',exact:true}).click();
  await expect(dialog.getByRole('link',{name:'Ouvrir Justificatif'})).toBeVisible();
  await dialog.getByRole('button',{name:'Fermer',exact:true}).click();
  await checkEveryPeriod(true);
  await page.reload();
  await expect(personButton).toHaveClass(/has-attachments/);
  await expect(otherButton).not.toHaveClass(/has-attachments/);

  await page.getByRole('link',{name:'badge Identification'}).click();
  const identityRow = page.locator('.contracts-sheet-row-shell').filter({hasText:personNif});
  const identityButton = identityRow.getByRole('button',{name:'Pièces jointes',exact:true});
  const otherIdentityButton = page.locator('.contracts-sheet-row-shell').filter({hasText:otherNif})
    .getByRole('button',{name:'Pièces jointes',exact:true});
  await expect(identityButton).toHaveClass(/has-attachments/);
  await expect(identityRow.locator('.contracts-sheet-state-actions')).toHaveCSS('opacity','1');
  await expect(otherIdentityButton).not.toHaveClass(/has-attachments/);
  const neutralColor = await otherIdentityButton.locator('span').evaluate(el => getComputedStyle(el).color);
  await expect(identityButton.locator('span')).not.toHaveCSS('color',neutralColor);
  await page.screenshot({path:'/tmp/identification-colored-paperclip.png'});
  await identityButton.click();
  await dialog.getByRole('button',{name:'Supprimer Justificatif',exact:true}).click();
  await dialog.getByRole('button',{name:'Supprimer',exact:true}).click();
  await expect(identityButton).not.toHaveClass(/has-attachments/);
  await dialog.getByRole('button',{name:'Chemin externe',exact:true}).click();
  await dialog.getByLabel('Nom',{exact:true}).fill('Archive');
  await dialog.getByLabel('Chemin externe',{exact:true}).fill('/documents/justificatif.pdf');
  await dialog.getByRole('button',{name:'Ajouter',exact:true}).click();
  await expect(identityButton).toHaveClass(/has-attachments/);
  await dialog.getByRole('button',{name:'Fermer',exact:true}).click();
  await page.getByRole('link',{name:'description Contrats',exact:true}).click();
  await expect(personButton).toHaveClass(/has-attachments/);
});

test('adds files, links and paths from the contract card and allows reader downloads', async ({page,context}) => {
  let role = 'agent';
  let entries: Record<string, any>[] = [{id:'legacy-file',kind:'file',name:'ancienne.pdf',content:'SGVsbG8=',size:5,createdAt:'2026-09-01'}];
  await context.grantPermissions(['clipboard-read','clipboard-write']);
  await page.addInitScript(() => {
    localStorage.setItem('contribution_auth',JSON.stringify({id:'attachment-test-user',username:'agent',name:'Test',workspaceId:'workspace_default',role:'agent',taskSessionToken:'test-token'}));
    localStorage.setItem('contribution_last_activity',String(Date.now()));
  });
  await page.route('**/*.supabase.co/**', async route => {
    const url = new URL(route.request().url());
    let body: unknown = [];
    if (url.pathname.endsWith('/app_users')) body = {role};
    if (url.pathname.endsWith('/contrat')) body = [{id_contrat:'attachment-c1',nif:'123456789',workspace_id:'workspace_default',created_by:'attachment-test-user',status:'saisie',duree_contrat:6,annee_fiscale:getFiscalYearForDate(new Date()),salaire_en_chiffre:25000,titre:'Agent',lieu_affectation:'Port-au-Prince',created_at:new Date().toISOString(),updated_at:new Date().toISOString(),deleted_at:null,contract_tags:[],identification:{nif:'123456789',prenom:'Marie',nom:'Jean',sexe:'Femme',adresse:'Port-au-Prince'}}];
    if (url.pathname.endsWith('/manage_identification_attachments')) {
      const {p_action:action,p_document:doc,p_person_id:personId} = route.request().postDataJSON();
      expect(personId).toBe('123456789');
      if (action === 'add') entries.unshift({...doc,size:doc.content ? Buffer.from(doc.content,'base64').length : null,createdAt:new Date().toISOString()});
      if (action === 'delete') entries = entries.filter(item => item.id !== doc.id);
      body = action === 'get' ? entries.find(item => item.id === doc.id) : entries.map(({content:_content,...item}) => item);
    }
    await route.fulfill({status:200,contentType:'application/json',body:JSON.stringify(body),headers:{'content-range':'0-0/1'}});
  });
  await page.goto('http://127.0.0.1:5179/app/contrats');
  const attachmentButton = page.getByRole('button',{name:'Pièces jointes',exact:true}).first();
  await expect(attachmentButton).toHaveClass(/has-attachments/);
  await attachmentButton.click();
  const dialog = page.getByRole('dialog',{name:'Pièces jointes'});
  await expect(dialog).toBeVisible();
  await expect(dialog.getByLabel('Nom',{exact:true})).toHaveCount(0);
  const legacyDownloadPromise = page.waitForEvent('download');
  await dialog.getByRole('button',{name:'Télécharger 123456789.pdf'}).click();
  expect((await legacyDownloadPromise).suggestedFilename()).toBe('123456789.pdf');
  await dialog.getByRole('button',{name:'Supprimer 123456789.pdf',exact:true}).click();
  await dialog.getByRole('button',{name:'Supprimer',exact:true}).click();
  await expect(attachmentButton).not.toHaveClass(/has-attachments/);
  await dialog.getByLabel('Fichier',{exact:true}).setInputFiles({name:'preuve.pdf',mimeType:'application/pdf',buffer:Buffer.from('Hello')});
  await dialog.getByRole('button',{name:'Ajouter',exact:true}).click();
  await expect(attachmentButton).toHaveClass(/has-attachments/);
  await dialog.getByLabel('Fichier',{exact:true}).setInputFiles({name:'preuve.txt',mimeType:'text/plain',buffer:Buffer.from('Document de test')});
  await dialog.getByRole('button',{name:'Ajouter',exact:true}).click();
  await expect(dialog.getByRole('button',{name:'Télécharger 123456789-1.pdf'})).toBeVisible();
  await expect(dialog.getByRole('button',{name:'Télécharger 123456789-2.txt'})).toBeVisible();
  expect(entries[0].name).toBe('123456789.txt');
  const downloadPromise = page.waitForEvent('download');
  await dialog.getByRole('button',{name:'Télécharger 123456789-2.txt'}).click();
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toBe('123456789-2.txt');
  const stream = await download.createReadStream();
  const chunks: Buffer[] = []; for await (const chunk of stream!) chunks.push(chunk);
  expect(Buffer.concat(chunks).toString()).toBe('Document de test');
  await dialog.getByLabel('Fichier',{exact:true}).setInputFiles({name:'deuxieme.txt',mimeType:'text/plain',buffer:Buffer.from('Autre document')});
  await dialog.getByRole('button',{name:'Ajouter',exact:true}).click();
  await expect(dialog.getByRole('button',{name:'Télécharger 123456789-2.txt'})).toBeVisible();
  await expect(dialog.getByRole('button',{name:'Télécharger 123456789-3.txt'})).toBeVisible();
  const secondDownloadPromise = page.waitForEvent('download');
  await dialog.getByRole('button',{name:'Télécharger 123456789-3.txt'}).click();
  const secondDownload = await secondDownloadPromise;
  expect(secondDownload.suggestedFilename()).toBe('123456789-3.txt');
  const secondStream = await secondDownload.createReadStream();
  const secondChunks: Buffer[] = []; for await (const chunk of secondStream!) secondChunks.push(chunk);
  expect(Buffer.concat(secondChunks).toString()).toBe('Autre document');
  await dialog.getByRole('button',{name:'Lien',exact:true}).click();
  await dialog.getByLabel('Nom',{exact:true}).fill('Document Drive');
  await dialog.getByLabel('Lien du document').fill('https://example.com/document');
  await dialog.getByRole('button',{name:'Ajouter',exact:true}).click();
  await expect(dialog.getByRole('link',{name:'Ouvrir Document Drive'})).toHaveAttribute('href','https://example.com/document');
  await dialog.getByRole('button',{name:'Chemin externe',exact:true}).click();
  await dialog.getByLabel('Nom',{exact:true}).fill('Archive');
  await dialog.getByLabel('Chemin externe',{exact:true}).fill('/Volumes/Archives/document.pdf');
  await dialog.getByRole('button',{name:'Ajouter',exact:true}).click();
  await dialog.getByRole('button',{name:'Copier le chemin de Archive'}).click();
  expect(await page.evaluate(() => navigator.clipboard.readText())).toBe('/Volumes/Archives/document.pdf');
  await page.screenshot({path:'/tmp/person-attachments-desktop.png'});
  await page.setViewportSize({width:390,height:844});
  await expect(dialog).toBeVisible();
  expect(await dialog.evaluate(e => e.scrollWidth <= e.clientWidth)).toBe(true);
  await page.screenshot({path:'/tmp/person-attachments-mobile.png'});
  await dialog.getByRole('button',{name:'Supprimer Archive',exact:true}).click();
  await dialog.getByRole('button',{name:'Supprimer',exact:true}).click();
  await expect(dialog.getByText('/Volumes/Archives/document.pdf')).toHaveCount(0);
  await page.keyboard.press('Escape');
  await expect(dialog).toHaveCount(0);
  role = 'reader';
  await page.reload();
  await page.getByRole('button',{name:'Pièces jointes',exact:true}).first().click();
  await expect(dialog.getByRole('button',{name:'Télécharger 123456789-2.txt'})).toBeVisible();
  await expect(dialog.getByRole('button',{name:'Télécharger 123456789-3.txt'})).toBeVisible();
  await expect(dialog.getByRole('button',{name:'Ajouter',exact:true})).toHaveCount(0);
  await expect(dialog.getByRole('button',{name:/Supprimer/})).toHaveCount(0);
});
