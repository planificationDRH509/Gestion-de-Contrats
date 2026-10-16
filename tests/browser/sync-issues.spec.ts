import { expect, test } from '@playwright/test';

test('resolves individual synchronization errors and continues dependent uploads', async ({ page }) => {
  const workspaceId = 'workspace_default';
  const actorId = 'sync-dialog-user';
  const remoteClock = '2026-09-01T10:00:00.000Z';
  const editClock = '2026-09-02T10:00:00.000Z';
  const contracts = ['JEAN', 'PAUL'].map((lastName, index) => ({
    id: `sync-contract-${index}`, workspaceId, applicantId: `123456789${index}`,
    nif: `123456789${index}`, firstName: 'Marie', lastName, gender: 'Femme',
    status: 'saisie', position: 'Poste serveur', assignment: 'MSPP', salaryNumber: 30000,
    salaryText: 'trente mille', durationMonths: 12, annee_fiscale: '2026-2027',
    address: 'Delmas', dossierId: null, createdBy: actorId,
    createdAt: remoteClock, updatedAt: remoteClock, modifiedAt: remoteClock, tags: []
  }));
  const local = {
    workspaces: [{ id: workspaceId, name: 'Test', createdAt: remoteClock, updatedAt: remoteClock }],
    applicants: contracts.map(contract => ({ ...contract, id: contract.applicantId })),
    contracts: contracts.map((contract, index) => ({ ...contract, position: 'Poste local',
      assignment: index === 1 ? 'Nouvelle affectation' : contract.assignment, modifiedAt: editClock })),
    dossiers: [], tags: [], contractTags: [], printJobs: [], contractLists: [], cachedListWorkspaces: [],
    outbox: [
      ...contracts.map((contract, index) => ({
        id: `sync-update-${index}`, workspaceId, actorId, type: 'contract.update',
        payload: { id: contract.id, position: 'Poste local', baseContract: contract },
        createdAt: editClock, modifiedAt: editClock, sequence: index,
        lastError: `Modification refusée pour ${contract.lastName}`, failureKind: 'correction'
      })),
      { id: 'later-edit', workspaceId, actorId, type: 'contract.update',
        payload: { id: contracts[1].id, assignment: 'Nouvelle affectation', baseContract: { ...contracts[1], position: 'Poste local' } },
        createdAt: '2026-09-02T11:00:00.000Z', modifiedAt: '2026-09-02T11:00:00.000Z', sequence: 2 },
      { id: 'dependent-pin', workspaceId, actorId, type: 'pin.set',
        payload: { userId: actorId, contractId: contracts[0].id, pinned: true },
        createdAt: editClock, sequence: 3 }
    ],
    syncMetadata: {}
  };
  await page.addInitScript(({ actorId, workspaceId, local }) => {
    localStorage.setItem('contribution_auth', JSON.stringify({
      id: actorId, username: 'admin', name: 'Test', workspaceId, role: 'admin', taskSessionToken: 'fixture-only'
    }));
    localStorage.setItem('contribution_last_activity', String(Date.now()));
    localStorage.setItem('contribution_local_db', JSON.stringify(local));
  }, { actorId, workspaceId, local });

  const rows = contracts.map(contract => ({
    id_contrat: contract.id, workspace_id: workspaceId, nif: contract.nif,
    titre: contract.position, lieu_affectation: contract.assignment, salaire_en_chiffre: contract.salaryNumber,
    duree_contrat: contract.durationMonths, annee_fiscale: contract.annee_fiscale, status: contract.status,
    dossier_id: null, created_by: actorId, created_at: remoteClock, updated_at: remoteClock,
    modified_at: remoteClock, deleted_at: null, contract_tags: [],
    identification: { nif: contract.nif, workspace_id: workspaceId, prenom: contract.firstName,
      nom: contract.lastName, sexe: contract.gender, adresse: contract.address, created_at: remoteClock, updated_at: remoteClock }
  }));
  const pins: string[] = [];
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  // Every network request to the data service is isolated from real accounts.
  await page.route('**/*.supabase.co/**', async route => {
    const request = route.request();
    const url = new URL(request.url());
    const table = url.pathname.split('/').at(-1);
    let data: unknown = [];
    if (table === 'app_users') data = { role: 'admin' };
    if (table === 'identification') data = rows.map(row => row.identification);
    if (table === 'contrat') {
      const selected = rows.filter(row => [...url.searchParams].every(([key, value]) => {
        if (value.startsWith('eq.')) return String((row as Record<string, unknown>)[key]) === value.slice(3);
        if (key === 'deleted_at' && value === 'not.is.null') return Boolean(row.deleted_at);
        return true;
      }));
      if (request.method() === 'PATCH') {
        const patch = request.postDataJSON();
        if (patch.modified_at < '2026-09-03') {
          await route.fulfill({ status: 400, contentType: 'application/json', body: JSON.stringify({
            code: '23514', message: `Modification refusée pour ${selected[0]?.identification.nom}`
          }) });
          return;
        }
        selected.forEach(row => Object.assign(row, patch, { updated_at: patch.modified_at }));
      }
      data = request.headers().accept?.includes('object+json') ? selected[0] ?? null : selected;
    }
    if (table === 'set_pinned_contract') {
      pins.push(request.postDataJSON().p_contract_id);
      data = pins;
    }
    if (table === 'read_pinned_contracts') data = pins;
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(data),
      headers: { 'content-range': `0-${Array.isArray(data) ? Math.max(0, data.length - 1) : 0}/${Array.isArray(data) ? data.length : 1}` } });
  });
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto('http://127.0.0.1:5179/app/contrats');
  const card = page.locator('.offline-sync-card');
  await expect(card).toContainText('Synchronisation à vérifier');
  await expect(card).not.toContainText('Modification refusée');
  await card.click();
  const dialog = page.getByRole('dialog', { name: 'Synchronisation' });
  await expect(dialog).toBeVisible();
  const first = dialog.getByRole('article', { name: /1234567890/ }).filter({ hasText: 'Modification refusée' });
  const second = dialog.getByRole('article', { name: /1234567891/ }).filter({ hasText: 'Modification refusée' });
  await expect(first).toContainText('Modification refusée');
  await expect(second).toContainText('Modification refusée');
  await page.screenshot({ path: '/tmp/contribution-sync-issues-errors.png' });
  await page.setViewportSize({ width: 390, height: 844 });
  const bounds = await dialog.boundingBox();
  expect(bounds!.x).toBeGreaterThanOrEqual(0);
  expect(bounds!.x + bounds!.width).toBeLessThanOrEqual(390);
  await page.screenshot({ path: '/tmp/contribution-sync-issues-mobile.png' });
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.emulateMedia({ media: 'print' });
  await expect(dialog).toBeHidden();
  await expect(page.locator('.sync-issue:visible')).toHaveCount(0);
  await page.emulateMedia({ media: 'screen' });
  page.on('dialog', native => void native.accept());
  await first.getByRole('button', { name: 'Actualiser en local', exact: true }).click();
  await expect(first).toHaveCount(0);
  await expect(second).toBeVisible();
  await expect.poll(() => pins).toContain(contracts[0].id);
  await second.getByRole('button', { name: 'Actualiser le serveur', exact: true }).click();
  await expect(dialog.getByRole('article')).toHaveCount(0);
  expect(rows[0].titre).toBe('Poste serveur');
  expect(rows[1].titre).toBe('Poste local');
  expect(rows[1].lieu_affectation).toBe('Nouvelle affectation');
  await page.screenshot({ path: '/tmp/contribution-sync-issues.png' });
  await dialog.getByRole('button', { name: 'Fermer', exact: true }).last().click();
  await expect(card).not.toContainText('Synchronisation à vérifier');
  await page.reload();
  await card.click();
  await expect(dialog.getByRole('article')).toHaveCount(0);
  expect(errors).toEqual([]);
});
