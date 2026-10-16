import { createHash } from 'node:crypto';
import { expect, test } from '@playwright/test';

// Compare actual Chromium print output, not just visibility in a screen preview.
// Only the PDF timestamps may differ between two prints of the same document.
function pdfFingerprint(pdf: Buffer) {
  const content = pdf.toString('latin1').replace(
    /\/(CreationDate|ModDate) \(D:\d{14}/g,
    '/$1 (D:00000000000000'
  );
  return createHash('sha256').update(content, 'latin1').digest('hex');
}

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    window.print = () => { document.documentElement.dataset.printRequested = 'true'; };
    localStorage.setItem('contribution_auth', JSON.stringify({ id: 'print-isolation-user', username: 'admin', name: 'Test', workspaceId: 'workspace_default', role: 'admin', taskSessionToken: 'test-token' }));
    localStorage.setItem('contribution_last_activity', String(Date.now()));
  });
  await page.route('**/*.supabase.co/**', async route => {
    const path = new URL(route.request().url()).pathname;
    let body: unknown = [];
    if (path.endsWith('/app_users')) body = { role: 'admin' };
    if (path.endsWith('/contrat')) body = ['Jean', 'Paul'].map((nom, index) => ({
      id_contrat: `print-${index}`, nif: `123456789${index}`, workspace_id: 'workspace_default',
      status: 'saisie', duree_contrat: 6, annee_fiscale: '2025-2026', salaire_en_chiffre: 35000,
      titre: 'Infirmière', lieu_affectation: 'Direction générale', created_by: 'print-isolation-user',
      created_at: '2026-10-01T12:00:00Z', updated_at: '2026-10-01T12:00:00Z', deleted_at: null,
      contract_tags: [], identification: { nif: `123456789${index}`, prenom: 'Marie', nom, sexe: 'Femme', adresse: 'Delmas' }
    }));
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(body), headers: {
      'content-range': `0-${Array.isArray(body) ? Math.max(0, body.length - 1) : 0}/${Array.isArray(body) ? body.length : 1}`
    } });
  });
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('http://127.0.0.1:5179/app/contrats/print?ids=print-0,print-1');
  await expect(page.locator('.contract-document')).toHaveCount(2);
  await expect(page.locator('.contract-sheet')).toHaveCount(8);
  await page.evaluate(() => document.fonts.ready);
});

for (const selection of [{ name: 'complete', pages: [1, 2, 3, 4] }, { name: 'partial', pages: [2, 4] }]) {
  test(`${selection.name} contract PDF excludes all surrounding interface, including future controls`, async ({ page }, testInfo) => {
    for (const number of [1, 2, 3, 4].filter(number => !selection.pages.includes(number))) {
      await page.getByRole('button', { name: `Page ${number}`, exact: true }).click();
    }
    await page.emulateMedia({ media: 'print' });
    const sheets = page.locator('.contract-sheet:visible');
    await expect(sheets).toHaveCount(selection.pages.length * 2);
    const expectedText = await sheets.allTextContents();
    const options = { preferCSSPageSize: true, printBackground: true, tagged: false };
    const clean = await page.pdf({ ...options, path: testInfo.outputPath('contracts-clean.pdf') });
    expect(clean.toString('latin1').match(/\/Type \/Page\b/g)).toHaveLength(selection.pages.length * 2);

    await page.emulateMedia({ media: 'screen' });
    // These controls intentionally have no .no-print class or known UI class.
    await page.evaluate(() => {
      for (const selector of ['body', '#root', '.app-shell', '.main', '.app-content', '.print-stack', '.print-preview-layout', '.print-preview-documents']) {
        const control = document.createElement('button');
        control.dataset.printLeakProbe = selector;
        control.textContent = `INTERFACE INTERDITE ${selector}`;
        control.style.cssText = 'position:fixed;bottom:16px;left:16px;z-index:99999;background:red;color:white';
        document.querySelector(selector)!.appendChild(control);
      }
      const popover = document.createElement('div');
      popover.dataset.printLeakProbe = 'popover';
      popover.textContent = 'INFOBULLE INTERDITE';
      popover.setAttribute('popover', 'manual');
      document.body.appendChild(popover);
      popover.showPopover();
    });
    await page.addStyleTag({ content: '.print-stack::after { content: "DECORATION INTERDITE"; position: fixed; bottom: 0; right: 0; }' });
    const probes = page.locator('[data-print-leak-probe]');
    for (const probe of await probes.all()) await expect(probe).toBeVisible();
    const skip = page.getByRole('link', { name: 'Aller au contenu' });
    await skip.focus();
    await expect(skip).toBeInViewport();

    // Browser print (Ctrl/Cmd+P) must be safe without any click handler cleanup.
    await page.emulateMedia({ media: 'print' });
    await expect(skip).toBeHidden();
    for (const probe of await probes.all()) await expect(probe).toBeHidden();
    await expect(page.locator('button:visible, [role="tooltip"]:visible')).toHaveCount(0);
    await expect(sheets).toHaveCount(selection.pages.length * 2);
    expect(await sheets.allTextContents()).toEqual(expectedText);
    const withInterface = await page.pdf({ ...options, path: testInfo.outputPath('contracts-with-interface.pdf') });
    expect(pdfFingerprint(withInterface)).toBe(pdfFingerprint(clean));

    await page.emulateMedia({ media: 'screen' });
    for (const probe of await probes.all()) await expect(probe).toBeVisible();
    await skip.focus();
    await expect(skip).toBeInViewport();
  });
}

test('an empty print selection never falls back to printing the application', async ({ page }) => {
  for (const name of ['Marie JEAN', 'Marie PAUL']) {
    const index = page.getByRole('navigation', { name: 'Contrats sélectionnés' });
    await index.getByRole('link', { name, exact: true }).hover();
    await page.getByRole('button', { name: `Retirer ${name} de l’impression`, exact: true }).click();
  }
  await expect(page.locator('.contract-document')).toHaveCount(0);
  await page.emulateMedia({ media: 'print' });
  expect(await page.locator('body').innerText()).toBe('');
  await expect(page.locator('button:visible, a:visible')).toHaveCount(0);
});

test('loading and missing contracts never print application messages', async ({ page }) => {
  let respond!: () => void;
  const responseReady = new Promise<void>(resolve => { respond = resolve; });
  await page.route(url => url.hostname.endsWith('.supabase.co') && url.pathname.endsWith('/contrat'), async route => {
    await responseReady;
    await route.fulfill({ status: 200, contentType: 'application/json', body: '[]', headers: { 'content-range': '0-0/0' } });
  });
  await page.goto('http://127.0.0.1:5179/app/contrats/print?ids=missing');
  try {
    await expect(page.getByText('Chargement des contrats…', { exact: true })).toBeVisible();
    await page.emulateMedia({ media: 'print' });
    expect(await page.locator('body').innerText()).toBe('');
    await expect(page.locator('button:visible, a:visible')).toHaveCount(0);
  } finally {
    respond();
  }
  await page.emulateMedia({ media: 'screen' });
  await expect(page.getByText('Aucun contrat à imprimer.', { exact: true })).toBeVisible();
  await page.emulateMedia({ media: 'print' });
  expect(await page.locator('body').innerText()).toBe('');
  await expect(page.locator('button:visible, a:visible')).toHaveCount(0);
});
