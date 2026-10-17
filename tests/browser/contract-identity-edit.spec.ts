import { expect, test, type Page } from '@playwright/test';
import { LEGACY_MINISTER } from '../../src/lib/ministers';

const originalNif = '123-456-789-0';
const originalNinu = '1234567890';
const workspaceId = 'workspace_default';
const contractId = 'identity-edit-contract';

async function prepareIdentityFixture(page: Page) {
  let online = false;
  const identity = { nif: originalNif, ninu: originalNinu, workspace_id: workspaceId,
    prenom: 'Jean', nom: 'LOUIS', sexe: 'Homme', adresse: 'Delmas', telephone: '37000000',
    created_at: '2026-10-01T12:00:00.000Z', updated_at: '2026-10-01T12:00:00.000Z',
    modified_at: '2026-10-01T12:00:00.000Z', deleted_at: null, created_by: 'identity-editor' };
  const identities: Record<string, any>[] = [identity];
  const contracts: Record<string, any>[] = ['2026-2027', '2025-2026'].map((year, index) => ({
    id_contrat: index ? 'identity-previous-contract' : contractId, workspace_id: workspaceId,
    nif: originalNif, status: 'saisie', titre: 'Comptable', lieu_affectation: 'Direction',
    salaire_en_chiffre: 35000, duree_contrat: 12, annee_fiscale: year, dossier_id: null,
    ministre_id: LEGACY_MINISTER.id, created_by: 'identity-editor', deleted_at: null,
    created_at: '2026-10-01T12:00:00.000Z', updated_at: '2026-10-01T12:00:00.000Z',
    modified_at: '2026-10-01T12:00:00.000Z',
  }));
  const writes: { table: string; method: string; payload: Record<string, any> }[] = [];
  await page.addInitScript(() => {
    Object.defineProperty(navigator, 'onLine', { configurable: true,
      get: () => localStorage.getItem('identity-fixture-offline') !== '1' });
  });
  await page.route('**/*.supabase.co/**', async route => {
    if (!online) return route.abort();
    const request = route.request();
    const url = new URL(request.url());
    const table = url.pathname.split('/').at(-1)!;
    const source = table === 'identification' ? identities : table === 'contrat' ? contracts : null;
    let rows: Record<string, any>[] = [];
    if (source) {
      rows = source.filter(row => {
        for (const [key, value] of url.searchParams) {
          if (value.startsWith('eq.') && String(row[key]) !== value.slice(3)) return false;
          if (value.startsWith('in.(') && !value.slice(4, -1).split(',').map(item => item.replaceAll('"', '')).includes(row[key])) return false;
          if (value === 'is.null' && row[key] != null) return false;
          if (value === 'not.is.null' && row[key] == null) return false;
        }
        return true;
      });
      if (request.method() === 'POST') {
        const payload = request.postDataJSON();
        writes.push({ table, method: 'POST', payload });
        for (const row of Array.isArray(payload) ? payload : [payload]) {
          if (table === 'identification' && identities.some(person => person.nif === row.nif || (row.ninu && person.ninu === row.ninu))) {
            return route.fulfill({ status: 409, contentType: 'application/json', body: JSON.stringify({ code: '23505', message: 'Identité déjà enregistrée.' }) });
          }
        }
        rows = (Array.isArray(payload) ? payload : [payload]).map(row => ({ ...row }));
        source.push(...rows);
      } else if (request.method() === 'PATCH') {
        const patch = request.postDataJSON();
        writes.push({ table, method: 'PATCH', payload: patch });
        for (const row of rows) {
          if (patch.modified_at && Date.parse(patch.modified_at) < Date.parse(row.modified_at)) continue;
          const previousNif = row.nif;
          const updatedAt = new Date(Math.max(Date.now(), Date.parse(row.updated_at) + 1)).toISOString();
          Object.assign(row, patch, { updated_at: updatedAt });
          // Updating the identity primary key cascades through the server's
          // contract trigger, whose clock is newer than the queued user edit.
          if (table === 'identification' && row.nif !== previousNif) {
            const cascadeTime = new Date(Math.max(Date.now(), Date.parse(patch.modified_at || '') || 0) + 1000).toISOString();
            for (const contract of contracts.filter(item => item.nif === previousNif)) {
              Object.assign(contract, { nif: row.nif, modified_at: cascadeTime, updated_at: cascadeTime });
            }
          }
        }
      }
      if (table === 'contrat') rows = rows.map(row => ({ ...row,
        identification: identities.find(person => person.nif === row.nif), contract_tags: [] }));
    } else if (table === 'autocompletion') {
      rows = [{ id: 'address', workspace_id: workspaceId, type: 'address', label: 'Delmas', order_index: 0 },
        { id: 'institution', workspace_id: workspaceId, type: 'institution', label: 'Direction', order_index: 0 },
        { id: 'institution-new', workspace_id: workspaceId, type: 'institution', label: 'Direction sanitaire', order_index: 1 }]
        .filter(row => !url.searchParams.get('type') || url.searchParams.get('type') === `eq.${row.type}`);
    }
    if (table === 'sync_identification_latest') {
      return route.fulfill({ status: 400, contentType: 'application/json', body: JSON.stringify({ message: 'Le changement de NIF ne doit pas transférer le NINU à une nouvelle personne.' }) });
    }
    const body = table === 'read_ministers' ? { ministers: [LEGACY_MINISTER], currentMinisterId: LEGACY_MINISTER.id }
      : table === 'app_users' ? { role: 'admin' }
      : request.headers().accept?.includes('object+json') ? rows[0] ?? null : rows;
    return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(body),
      headers: { 'content-range': `0-${Math.max(0, rows.length - 1)}/${rows.length}` } });
  });
  await page.goto('http://127.0.0.1:5179/tests/browser/offline.html?worker=1');
  await page.evaluate(async ({ identity, contracts, minister }) => {
    const { initializeLocalDb, loadDb, saveDb, flushLocalDbWrites } = await import('/src/data/local/localDb.ts');
    const { cacheMinisters } = await import('/src/features/settings/ministersCache.ts');
    localStorage.setItem('contribution_auth', JSON.stringify({ id: 'identity-editor', username: 'admin', name: 'Test',
      workspaceId: 'workspace_default', role: 'admin', taskSessionToken: 'fixture-only' }));
    localStorage.setItem('contribution_last_activity', String(Date.now()));
    localStorage.setItem('contribution_current_fiscal_year', '2026-2027');
    localStorage.setItem('identity-fixture-offline', '1');
    await initializeLocalDb();
    cacheMinisters({ ministers: [minister], currentMinisterId: minister.id });
    const person = { id: identity.nif, workspaceId: identity.workspace_id, nif: identity.nif, ninu: identity.ninu,
      firstName: identity.prenom, lastName: identity.nom, gender: identity.sexe, address: identity.adresse,
      phone: identity.telephone, createdAt: identity.created_at, updatedAt: identity.updated_at,
      remoteUpdatedAt: identity.updated_at, modifiedAt: identity.modified_at, createdBy: identity.created_by };
    const db = loadDb();
    db.applicants = [person];
    db.contracts = contracts.map(row => ({ ...person, id: row.id_contrat, applicantId: person.id,
      status: row.status, position: row.titre, assignment: row.lieu_affectation,
      salaryNumber: row.salaire_en_chiffre, salaryText: 'TRENTE CINQ MILLE', durationMonths: row.duree_contrat,
      annee_fiscale: row.annee_fiscale, ministerId: row.ministre_id, dossierId: null,
      updatedAt: row.updated_at, modifiedAt: row.modified_at, remoteUpdatedAt: row.updated_at }));
    db.outbox = [];
    db.syncMetadata.workspace_default = { snapshotVersion: 1, lastFullSyncedAt: new Date().toISOString() };
    saveDb(db);
    await flushLocalDbWrites();
  }, { identity, contracts, minister: LEGACY_MINISTER });

  return {
    identities, contracts, writes,
    async synchronize() {
      online = true;
      await page.evaluate(async () => {
        localStorage.removeItem('identity-fixture-offline');
        const { syncSupabaseOutbox } = await import('/src/data/supabase/supabaseProvider.ts');
        await syncSupabaseOutbox();
      });
      await expect.poll(() => page.evaluate(async () => {
        const { loadDb } = await import('/src/data/local/localDb.ts');
        return loadDb().outbox.filter(item => !item.syncedAt && /^(applicant|contract)\./.test(item.type))
          .map(item => ({ type: item.type, error: item.lastError ?? null }));
      })).toEqual([]);
    }
  };
}

async function editContract(page: Page, changes: { nif?: string; ninu?: string; salary?: string; assignment?: string }, submitWithoutBlur = false) {
  await page.goto(`http://127.0.0.1:5179/app/contrats/${contractId}/modifier`);
  await expect(page.getByLabel('NINU', { exact: true })).not.toHaveValue('');
  await expect(page.locator('input[name="salaryText"]')).not.toHaveValue('');
  if (changes.nif) await page.getByLabel('NIF *', { exact: true }).fill(changes.nif);
  if (changes.ninu) await page.getByLabel('NINU', { exact: true }).fill(changes.ninu);
  if (changes.salary) await page.locator('input[name="salaryNumber"]').fill(changes.salary);
  if (changes.assignment) await page.locator('input[name="assignment"]').fill(changes.assignment);
  if (submitWithoutBlur) {
    // Validate the registered form values while the normalized field is still
    // focused, rather than relying on blur to reread the changed DOM value.
    await page.locator('form').evaluate(form => (form as HTMLFormElement).requestSubmit());
  } else {
    await page.getByRole('button', { name: /Enregistrer$/ }).click();
  }
  await expect(page).toHaveURL(`http://127.0.0.1:5179/app/contrats/${contractId}`);
}

test('renames the existing NIF, preserves NINU and saves contract edits despite the server cascade clock', async ({ page }) => {
  const fixture = await prepareIdentityFixture(page);
  await editContract(page, { nif: '234-567-890-1', salary: '45000', assignment: 'Direction sanitaire' });
  await fixture.synchronize();
  expect(fixture.identities).toHaveLength(1);
  expect(fixture.identities[0]).toMatchObject({ nif: '234-567-890-1', ninu: originalNinu, telephone: '37000000' });
  expect(fixture.contracts[0]).toMatchObject({ nif: '234-567-890-1', salaire_en_chiffre: 45000, lieu_affectation: 'Direction sanitaire' });
  expect(fixture.contracts[1]).toMatchObject({ nif: '234-567-890-1', salaire_en_chiffre: 35000 });
  expect(fixture.writes.some(write => write.table === 'identification' && write.method === 'POST')).toBe(false);
  await page.reload();
  await expect(page.locator('.contract-document')).toContainText(originalNinu);

  await editContract(page, { ninu: '987 654 321-0' }, true);
  await fixture.synchronize();
  expect(fixture.identities[0]).toMatchObject({ nif: '234-567-890-1', ninu: '9876543210' });
  expect(await page.evaluate(async () => {
    const { loadDb } = await import('/src/data/local/localDb.ts');
    return loadDb().contracts.map(contract => contract.ninu);
  })).toEqual(['9876543210', '9876543210']);
  await page.reload();
  await expect(page.locator('.contract-document')).toContainText('9876543210');
});

test('preserves repeated offline NIF and NINU corrections through reload and synchronization', async ({ page }) => {
  const fixture = await prepareIdentityFixture(page);
  await editContract(page, { nif: '2345678901' }, true);
  await editContract(page, { nif: '345-678-901-2', ninu: '9876543210', salary: '55000' });
  await page.reload();
  await expect(page.locator('.contract-document')).toContainText('345-678-901-2');
  await expect(page.locator('.contract-document')).toContainText('9876543210');
  await fixture.synchronize();
  expect(fixture.identities).toHaveLength(1);
  expect(fixture.identities[0]).toMatchObject({ nif: '345-678-901-2', ninu: '9876543210' });
  expect(fixture.contracts[0]).toMatchObject({ nif: '345-678-901-2', salaire_en_chiffre: 55000 });
  expect(fixture.contracts[1]).toMatchObject({ nif: '345-678-901-2', salaire_en_chiffre: 35000 });
  await page.reload();
  await expect(page.locator('.contract-document')).toContainText('9876543210');
});
