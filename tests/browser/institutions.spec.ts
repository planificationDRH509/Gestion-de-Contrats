import { expect, test } from '@playwright/test';

const initial = [
  {id:'hospital',label:'Hôpital Saint-Antoine de Jérémie',department:'Grand’Anse',commune:'Jérémie',institution_type:'Hôpital',source_url:'https://www.mspp.gouv.ht/directions',version:1,order_index:0,address_keywords:'[]'},
  {id:'centre',label:'Centre de Santé de Carradeux',department:'Ouest',commune:'Tabarre',institution_type:'Centre de Santé',source_url:null,version:1,order_index:1,address_keywords:'[]'},
  {id:'hcr',label:'Hôpital Communautaire de Référence de Port-Salut',department:'Sud',commune:'Port-Salut',institution_type:'HCR',source_url:null,version:1,order_index:2,address_keywords:'[]'},
  {id:'bureau',label:'Bureau Central',department:null,commune:null,institution_type:'Bureau Central',source_url:null,version:1,order_index:3,address_keywords:'[]'}
].map(entry => ({...entry,prefix:null as string | null}));

test('institutions share the contract references and support filters, editing and duplicate rejection',async({page}) => {
  page.setDefaultTimeout(10000);
  let entries=structuredClone(initial);
  await page.addInitScript(() => {
    localStorage.setItem('contribution_auth',JSON.stringify({id:'institution-ui-test',username:'admin',name:'Test',workspaceId:'workspace_default',role:'admin',taskSessionToken:'test-session-token-not-a-real-session'}));
    localStorage.setItem('contribution_last_activity',String(Date.now()));
  });
  await page.route('**/*.supabase.co/**',async route => {
    const url=route.request().url();
    let body:unknown=[];
    if(url.includes('/app_users')) body={role:'admin'};
    if(url.includes('/autocompletion')) body=entries;
    if(url.includes('/rpc/save_institution')) {
      const {p_entry:entry}=route.request().postDataJSON();
      const saved={...entry,version:entry.version+1};
      const row={id:entry.id,label:entry.label,prefix:entry.prefix ?? null,department:entry.department,commune:entry.commune,institution_type:entry.institutionType,source_url:entry.source,version:saved.version,order_index:entry.order,address_keywords:JSON.stringify(entry.addressKeywords)};
      entries=[...entries.filter(e => e.id!==entry.id),row];
      body=saved;
    }
    await route.fulfill({status:200,contentType:'application/json',body:JSON.stringify(body),headers:{'content-range':`0-${entries.length-1}/${entries.length}`}});
  });
  await page.goto('http://127.0.0.1:5179/app/parametres');
  await page.getByRole('link',{name:'Institutions'}).click();
  await expect(page).toHaveURL(/\/app\/parametres\/institutions$/);
  await expect(page.getByRole('heading',{name:'Institutions',exact:true})).toBeVisible();
  await expect(page.getByRole('columnheader',{name:'Source',exact:true})).toHaveCount(0);
  await expect(page.locator('tbody tr')).toHaveCount(4);
  await page.getByRole('combobox',{name:'Département',exact:true}).selectOption('Ouest');
  await expect(page.locator('tbody tr')).toHaveCount(1);
  await page.getByRole('combobox',{name:'Commune',exact:true}).selectOption('Tabarre');
  await page.getByRole('combobox',{name:'Département',exact:true}).selectOption('Sud');
  await expect(page.getByRole('combobox',{name:'Commune',exact:true})).toHaveValue('');
  await expect(page.locator('tbody')).toContainText('Port-Salut');
  await page.getByRole('combobox',{name:'Département',exact:true}).selectOption('');
  await page.getByRole('combobox',{name:'Type d’institution'}).selectOption('Bureau Central');
  await expect(page.locator('tbody tr')).toHaveCount(1);
  await page.getByRole('combobox',{name:'Type d’institution'}).selectOption('');
  await page.getByRole('textbox',{name:'Rechercher une institution'}).fill('jeremie');
  await expect(page.locator('tbody tr')).toHaveCount(1);
  await page.getByRole('button',{name:'Modifier Hôpital Saint-Antoine de Jérémie',exact:true}).click();
  const dialog=page.getByRole('dialog');
  await expect(dialog.getByLabel('Préposition',{exact:true})).toHaveCount(0);
  await dialog.getByLabel('Type',{exact:true}).selectOption('HCR');
  await dialog.getByRole('button',{name:'Enregistrer',exact:true}).click();
  await expect(dialog).toHaveCount(0);
  await expect(page.locator('tbody')).toContainText('HCR');
  await page.getByRole('textbox',{name:'Rechercher une institution'}).fill('');
  await page.getByRole('button',{name:'Ajouter une institution',exact:true}).click();
  await dialog.getByLabel('Nom',{exact:true}).fill('centre de sante de carradeux');
  await dialog.getByLabel('Type',{exact:true}).selectOption('Centre de Santé');
  await dialog.getByRole('button',{name:'Enregistrer',exact:true}).click();
  await expect(dialog.getByRole('alert')).toHaveText('Cette institution existe déjà.');
  await dialog.getByLabel('Nom',{exact:true}).fill('Centre de Santé d’Essai');
  await dialog.getByLabel('Département',{exact:true}).selectOption('Nord');
  await dialog.getByLabel('Commune',{exact:true}).fill('Milot');
  await dialog.getByRole('button',{name:'Enregistrer',exact:true}).click();
  await expect(dialog).toHaveCount(0);
  await expect(page.locator('tbody tr')).toHaveCount(5);
  await page.setViewportSize({width:390,height:844});
  await expect(page.getByRole('button',{name:'Ajouter une institution',exact:true})).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await page.screenshot({path:'/tmp/contribution-institutions-mobile.png',fullPage:true});
  await page.setViewportSize({width:1440,height:1000});
  await page.screenshot({path:'/tmp/contribution-institutions-page.png',fullPage:true});
});

test('readers can consult institutions without management controls',async({page}) => {
  await page.addInitScript(() => {
    localStorage.setItem('contribution_auth',JSON.stringify({id:'institution-reader',username:'reader',name:'Lecteur',workspaceId:'workspace_default',role:'reader',taskSessionToken:'test-session-token-not-a-real-session'}));
    localStorage.setItem('contribution_last_activity',String(Date.now()));
  });
  await page.route('**/*.supabase.co/**',async route => {
    const url=route.request().url();
    const body=url.includes('/app_users') ? {role:'reader'} : url.includes('/autocompletion') ? initial : [];
    await route.fulfill({status:200,contentType:'application/json',body:JSON.stringify(body),headers:{'content-range':'0-3/4'}});
  });
  await page.goto('http://127.0.0.1:5179/app/institutions');
  await expect(page.getByRole('heading',{name:'Institutions',exact:true})).toBeVisible();
  await expect(page.locator('tbody tr')).toHaveCount(4);
  await expect(page.getByRole('button',{name:'Ajouter une institution'})).toHaveCount(0);
  await expect(page.getByRole('button',{name:/Modifier/})).toHaveCount(0);
});

test('prepositions are edited once per family and persist without changing institutions', async({page}) => {
  let rules=[
    {family:'hospital',prefix:'à l’',version:1},
    {family:'health_centre',prefix:'au',version:1},
    {family:'department',prefix:'au',version:1},
    {family:'direction',prefix:'à la',version:1}
  ];
  let institutionWrites=0;
  await page.addInitScript(() => {
    localStorage.setItem('contribution_auth',JSON.stringify({id:'preposition-ui-test',username:'admin',name:'Test',workspaceId:'workspace_default',role:'admin',taskSessionToken:'test-session-token-not-a-real-session'}));
    localStorage.setItem('contribution_last_activity',String(Date.now()));
  });
  await page.route('**/*.supabase.co/**',async route => {
    const url=route.request().url();
    let body:unknown=[];
    if(url.includes('/app_users')) body={role:'admin'};
    if(url.includes('/autocompletion')) body=initial;
    if(url.includes('/rpc/read_institution_prepositions')) body=rules;
    if(url.includes('/rpc/save_institution_prepositions')) {
      const {p_rules:changes}=route.request().postDataJSON();
      expect(changes).toHaveLength(1);
      rules=rules.map(rule => {
        const change=changes.find((entry:{family:string}) => entry.family===rule.family);
        return change ? {...change,prefix:change.prefix.trim(),version:rule.version+1} : rule;
      });
      body=rules;
    }
    if(url.includes('/rpc/save_institution') && !url.includes('prepositions')) institutionWrites++;
    await route.fulfill({status:200,contentType:'application/json',body:JSON.stringify(body)});
  });
  await page.goto('http://127.0.0.1:5179/app/parametres/institutions');
  await page.getByRole('button',{name:'Prépositions',exact:true}).click();
  const dialog=page.getByRole('dialog',{name:'Prépositions',exact:true});
  await expect(dialog.getByLabel('Hôpital',{exact:true})).toHaveValue('à l’');
  await expect(dialog.getByLabel('Centre de Santé',{exact:true})).toHaveValue('au');
  await expect(dialog.getByLabel('Département Sanitaire',{exact:true})).toHaveValue('au');
  await expect(dialog.getByLabel('Direction',{exact:true})).toHaveValue('à la');
  await dialog.getByLabel('Hôpital',{exact:true}).fill('au sein de l’');
  await dialog.getByRole('button',{name:'Enregistrer',exact:true}).click();
  await expect(dialog).toHaveCount(0);
  await page.reload();
  await page.getByRole('button',{name:'Prépositions',exact:true}).click();
  await expect(dialog.getByLabel('Hôpital',{exact:true})).toHaveValue('au sein de l’');
  await expect(dialog.getByLabel('Centre de Santé',{exact:true})).toHaveValue('au');
  await dialog.getByRole('button',{name:'Annuler',exact:true}).click();
  await expect(page.locator('tbody tr')).toHaveCount(4);
  expect(institutionWrites).toBe(0);
  await page.setViewportSize({width:390,height:844});
  await page.getByRole('button',{name:'Prépositions',exact:true}).click();
  expect(await page.evaluate(() => document.documentElement.scrollWidth<=window.innerWidth)).toBe(true);
  await page.screenshot({path:'/tmp/contribution-institution-prepositions-mobile.png',fullPage:true});
});
