import { expect, test } from '@playwright/test';

test('adds files, links and paths from the contract card and allows reader downloads', async ({page,context}) => {
  let role = 'agent';
  let entries: Record<string, any>[] = [];
  await context.grantPermissions(['clipboard-read','clipboard-write']);
  await page.addInitScript(() => {
    localStorage.setItem('contribution_auth',JSON.stringify({id:'attachment-test-user',username:'agent',name:'Test',workspaceId:'workspace_default',role:'agent',taskSessionToken:'test-token'}));
    localStorage.setItem('contribution_last_activity',String(Date.now()));
  });
  await page.route('**/*.supabase.co/**', async route => {
    const url = new URL(route.request().url());
    let body: unknown = [];
    if (url.pathname.endsWith('/app_users')) body = {role};
    if (url.pathname.endsWith('/contrat')) body = [{id_contrat:'attachment-c1',nif:'123456789',workspace_id:'workspace_default',status:'saisie',duree_contrat:6,annee_fiscale:'2025-2026',salaire_en_chiffre:25000,titre:'Agent',lieu_affectation:'Port-au-Prince',created_at:new Date().toISOString(),updated_at:new Date().toISOString(),deleted_at:null,contract_tags:[],identification:{nif:'123456789',prenom:'Marie',nom:'Jean',sexe:'Femme',adresse:'Port-au-Prince'}}];
    if (url.pathname.endsWith('/manage_person_attachments')) {
      const {p_action:action,p_document:doc} = route.request().postDataJSON();
      if (action === 'add') entries.unshift({...doc,size:doc.content ? Buffer.from(doc.content,'base64').length : null,createdAt:new Date().toISOString()});
      if (action === 'delete') entries = entries.filter(item => item.id !== doc.id);
      body = action === 'get' ? entries.find(item => item.id === doc.id) : entries.map(({content:_content,...item}) => item);
    }
    await route.fulfill({status:200,contentType:'application/json',body:JSON.stringify(body),headers:{'content-range':'0-0/1'}});
  });
  await page.goto('http://127.0.0.1:5179/app/contrats');
  await page.getByRole('button',{name:'Pièces jointes',exact:true}).first().click();
  const dialog = page.getByRole('dialog',{name:'Pièces jointes'});
  await expect(dialog).toBeVisible();
  await dialog.getByLabel('Fichier',{exact:true}).setInputFiles({name:'preuve.txt',mimeType:'text/plain',buffer:Buffer.from('Document de test')});
  await dialog.getByRole('button',{name:'Ajouter',exact:true}).click();
  await expect(dialog.getByRole('button',{name:'Télécharger preuve.txt'})).toBeVisible();
  const downloadPromise = page.waitForEvent('download');
  await dialog.getByRole('button',{name:'Télécharger preuve.txt'}).click();
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toBe('preuve.txt');
  const stream = await download.createReadStream();
  const chunks: Buffer[] = []; for await (const chunk of stream!) chunks.push(chunk);
  expect(Buffer.concat(chunks).toString()).toBe('Document de test');
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
  await expect(dialog.getByRole('button',{name:'Télécharger preuve.txt'})).toBeVisible();
  await expect(dialog.getByRole('button',{name:'Ajouter',exact:true})).toHaveCount(0);
  await expect(dialog.getByRole('button',{name:/Supprimer/})).toHaveCount(0);
});
