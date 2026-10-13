import { expect, test } from '@playwright/test';

test('keeps correction rows and new drafts across an offline reload, without duplicate contracts', async ({ page, context }) => {
  await context.route('**/*.supabase.co/**', route => route.abort());
  await page.goto('http://127.0.0.1:5179/tests/browser/offline.html?worker=1');
  await page.evaluate(async () => {
    const { initializeLocalDb, loadDb, saveDb, flushLocalDbWrites } = await import('/src/data/local/localDb.ts');
    const { queueOutbox, setOutboxError } = await import('/src/data/local/localOutbox.ts');
    localStorage.setItem('contribution_auth', JSON.stringify({ id: 'correction-user', username: 'admin', name: 'Test', workspaceId: 'workspace_default', role: 'admin', taskSessionToken: 'test-token' }));
    localStorage.setItem('contribution_last_activity', String(Date.now()));
    localStorage.setItem('new_contract_entry_mode', 'sheet');
    localStorage.setItem('contract_unsaved_draft:spreadsheet:workspace_default:correction-user:preferences', JSON.stringify({ value: { recentOpen: false } }));
    await initializeLocalDb();
    const db = loadDb();
    const person = { id: '123-456-789-0', workspaceId: 'workspace_default', nif: '123-456-789-0', ninu: null, firstName: 'Jean', lastName: 'LOUIS', gender: 'Homme', address: 'Delmas', createdAt: '2025-01-01', updatedAt: '2025-01-01' };
    db.applicants.push(person);
    db.contracts.push({ ...person, id: 'correction-contract', applicantId: person.id, createdBy: 'another-author', status: 'saisie', position: 'Comptable', assignment: 'Direction', salaryNumber: 35000, salaryText: 'TRENTE CINQ MILLE', durationMonths: 12, annee_fiscale: '2025-2026', ministerId: 'bertrand-sinal' });
    db.syncMetadata.workspace_default = { lastFullSyncedAt: new Date().toISOString() };
    saveDb(db);
    const queued = queueOutbox('workspace_default', 'contract.update', { id: 'correction-contract', salaryNumber: 35000, baseContract: { ...db.contracts.at(-1), salaryNumber: 30000 } });
    setOutboxError(queued.id, 'Salaire hors grille');
    await flushLocalDbWrites();
  });
  await page.goto('http://127.0.0.1:5179/app/contrats/nouveau');
  const correction = page.locator('.contracts-sheet-row-correction');
  await expect(correction).toHaveCount(1);
  await expect(correction).toBeVisible();
  await expect(page.locator('#sheet-recent-contracts')).toBeHidden();
  const draft = page.locator('.contracts-sheet-row-new [data-sheet-col="1"]').first();
  await draft.fill('Saisie en cours');
  await page.reload();
  await expect(correction).toHaveCount(1);
  await expect(draft).toHaveValue('Saisie en cours');
  await correction.locator('[data-sheet-col="8"]').fill('45000');
  await correction.locator('[data-sheet-col="7"]').focus();
  await expect.poll(() => page.evaluate(async () => {
    const { loadDb } = await import('/src/data/local/localDb.ts');
    return loadDb().contracts.find(contract => contract.id === 'correction-contract')?.salaryNumber;
  })).toBe(45000);
  await page.reload();
  await expect(correction).toHaveCount(1);
  await expect(correction.locator('[data-sheet-col="8"]')).toHaveValue('45000');
  await expect(draft).toHaveValue('Saisie en cours');
  expect(await page.evaluate(async () => {
    const { loadDb } = await import('/src/data/local/localDb.ts');
    return loadDb().contracts.filter(contract => contract.id === 'correction-contract').length;
  })).toBe(1);
  await page.screenshot({ path: '/tmp/contribution-contract-corrections.png', fullPage: true });
});
