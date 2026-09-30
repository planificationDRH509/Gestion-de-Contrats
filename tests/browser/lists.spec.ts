import { expect, test } from '@playwright/test';

function zipText(buffer: Buffer, path: string) {
  let offset = 0;
  while (buffer.readUInt32LE(offset) === 0x04034b50) {
    const size = buffer.readUInt32LE(offset + 18);
    const nameSize = buffer.readUInt16LE(offset + 26);
    const extraSize = buffer.readUInt16LE(offset + 28);
    const name = buffer.subarray(offset + 30, offset + 30 + nameSize).toString();
    const start = offset + 30 + nameSize + extraSize;
    if (name === path) return buffer.subarray(start, start + size).toString();
    offset = start + size;
  }
  throw new Error(`Missing ${path}`);
}

test('desktop list workspace and mobile consultation export the correct department and formation', async ({ page }) => {
  page.setDefaultTimeout(10000);
  const now = new Date().toISOString();
  const people = [
    { id: 'c1', firstName: 'Ana', lastName: 'Étienne', nif: '001234567', position: 'Infirmière de ligne', assignment: 'à la Direction générale', salaryNumber: 35000, durationMonths: 6 },
    { id: 'c2', firstName: 'Marie', lastName: 'Jean', nif: '002234567', position: 'Technicienne de laboratoire', assignment: 'Hôpital du Cap', salaryNumber: 30000, durationMonths: 6 },
    { id: 'c3', firstName: 'Louvens', lastName: 'Louis', nif: '003234567', position: 'Titre sans référence', assignment: 'Institution sans référence', salaryNumber: 25000, durationMonths: 6 }
  ];
  const lists = [
    { id: 'list-main', workspaceId: 'workspace_default', durationMonths: 6, visaNumber: 'VISA-2026-042', sealedAt: null, version: 1, createdAt: now, members: people, history: [{at:now,actor:'Marie Jean',action:'create'}] },
    ...Array.from({length:7}, (_, index) => ({ id:`list-${index}`, workspaceId:'workspace_default',durationMonths: index % 2 ? 9 : 12,visaNumber:index % 2 ? `VISA-2026-0${30 + index}` : null,sealedAt:index % 2 ? now : null,version:1,createdAt:'2026-09-01',members:[{...people[index % 3],id:`other-${index}`,salaryNumber:25000}],history:[] }))
  ];
  const salary = [
    {id:'nurse',masculine:'Infirmier de ligne',feminine:'Infirmière de ligne',jobType:'Universitaire',aliases:[],category:'Soins',salaries:[35000],active:true,version:1,source:'',sourceRows:[],notes:''},
    {id:'tech',masculine:'Technicien de laboratoire',feminine:'Technicienne de laboratoire',jobType:'Technique',aliases:[],category:'Technique',salaries:[30000],active:true,version:1,source:'',sourceRows:[],notes:''}
  ];
  let mutations = 0;
  await page.addInitScript(() => {
    localStorage.setItem('contribution_auth', JSON.stringify({id:'list-ui-test',username:'admin',name:'Test',workspaceId:'workspace_default',role:'admin',taskSessionToken:'test-token-not-a-real-session'}));
    localStorage.setItem('contribution_last_activity', String(Date.now()));
  });
  await page.route('**/*.supabase.co/**', async route => {
    const path = new URL(route.request().url()).pathname;
    let body: unknown = [];
    if (path.endsWith('/app_users')) body = {role:'admin'};
    if (path.endsWith('/read_contract_lists')) body = lists;
    if (path.endsWith('/read_salary_grid')) body = salary;
    if (path.endsWith('/autocompletion')) body = [
      {id:'i1',label:'Direction générale',department:'Ouest',order_index:0,address_keywords:'[]'},
      {id:'i2',label:'Hôpital du Cap',department:'Nord',order_index:1,address_keywords:'[]'}
    ];
    if (path.endsWith('/contrat')) body = people.map(person => ({ id_contrat:person.id,nif:person.nif,workspace_id:'workspace_default',status:'final',duree_contrat:6,annee_fiscale:'2025-2026',salaire_en_chiffre:person.salaryNumber,titre:person.position,lieu_affectation:person.assignment,created_at:now,updated_at:now,deleted_at:null,contract_tags:[],identification:{nif:person.nif,prenom:person.firstName,nom:person.lastName,sexe:'Femme',adresse:'Port-au-Prince'} }));
    if (/mutate_contract_list|save_contract_list/.test(path)) mutations++;
    await route.fulfill({status:200,contentType:'application/json',body:JSON.stringify(body),headers:{'content-range':`0-${Array.isArray(body) ? Math.max(0,body.length-1) : 0}/${Array.isArray(body) ? body.length : 1}`}});
  });
  await page.setViewportSize({width:1600,height:1000});
  await page.goto('http://127.0.0.1:5179/app/listes');
  await expect(page.getByRole('heading',{name:'LOT-3-ÉTIENNE-Ana'})).toBeVisible();
  await expect(page.getByRole('table').getByRole('row')).toHaveCount(4);
  await page.screenshot({path:'/tmp/contribution-listes-desktop.png',fullPage:true});
  await page.getByRole('button',{name:'Modifier le visa'}).click();
  await expect(page.getByRole('dialog').getByLabel('Numéro de visa')).toBeFocused();
  await page.keyboard.press('Escape');
  await expect(page.getByRole('button',{name:'Modifier le visa'})).toBeFocused();
  await page.getByLabel('Sélectionner Ana Étienne').check();
  await page.getByRole('button',{name:'Retirer',exact:true}).click();
  await expect(page.getByRole('dialog')).toContainText('1 contrat(s) seront conservés sans liste.');
  await page.keyboard.press('Escape');
  await page.getByRole('button',{name:'Annuler la sélection'}).click();
  await page.getByRole('button',{name:'Nouvelle liste'}).click();
  await expect(page.getByRole('dialog').getByLabel('Durée commune')).toBeFocused();
  await page.screenshot({path:'/tmp/contribution-listes-creation.png'});
  await page.keyboard.press('Escape');
  await page.getByRole('button',{name:'Ajouter des contrats'}).click();
  await expect(page.getByRole('dialog')).toContainText('Aucun contrat disponible');
  await page.keyboard.press('Escape');
  await page.getByRole('button',{name:'Historique',exact:true}).click();
  await expect(page.getByText('Marie Jean',{exact:true})).toBeVisible();
  await page.getByRole('button',{name:'Contrats 3'}).click();
  await page.setViewportSize({width:390,height:844});
  await expect(page.getByRole('heading',{name:'LOT-3-ÉTIENNE-Ana'})).toHaveCount(0);
  await page.screenshot({path:'/tmp/contribution-listes-mobile.png',fullPage:true});
  await page.getByRole('button',{name:/LOT-3-ÉTIENNE-Ana/}).click();
  await expect(page.getByRole('button',{name:/Nouvelle liste|Ajouter des contrats|Modifier le visa|Sceller la liste|Retirer|Changer de liste/})).toHaveCount(0);
  await expect(page.locator('.lists-detail input[type="checkbox"]')).toHaveCount(0);
  await expect(page.locator('.lists-detail a')).toHaveCount(0);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await page.screenshot({path:'/tmp/contribution-listes-detail-mobile.png',fullPage:true});
  const downloadEvent = page.waitForEvent('download');
  await page.getByRole('button',{name:'Exporter en Excel'}).click();
  const download = await downloadEvent;
  expect(download.suggestedFilename()).toBe('LOT-3-ÉTIENNE-Ana.xlsx');
  await download.saveAs('/tmp/contribution-listes-verification.xlsx');
  const stream = await download.createReadStream();
  const chunks: Buffer[] = []; for await (const chunk of stream!) chunks.push(chunk);
  const sheet = zipText(Buffer.concat(chunks),'xl/worksheets/sheet1.xml');
  const value = (ref: string) => sheet.match(new RegExp(`<c r="${ref}"[^>]*>(.*?)</c>`,'s'))?.[1];
  expect(value('H12')).toContain('Ouest'); expect(value('I12')).toContain('Universitaire');
  expect(value('H13')).toContain('Nord'); expect(value('I13')).toContain('Technique');
  expect(value('H14')).toContain('<t xml:space="preserve"></t>'); expect(value('I14')).toContain('<t xml:space="preserve"></t>');
  expect(mutations).toBe(0);
  await page.getByRole('button',{name:'Toutes les listes',exact:true}).click();
  await expect(page.getByRole('button',{name:/LOT-3-ÉTIENNE-Ana/})).toBeVisible();
});
