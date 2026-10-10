import { beforeEach, describe, expect, it } from 'vitest';
import { LEGACY_MINISTER, MINISTRY_ADDRESS, validateMinister, type Minister } from '../../lib/ministers';
import { bindContractMinister, cacheMinisters, readMinistersCache } from './ministersCache';
import { buildTemplateVariables, renderTemplate, getDefaultTemplate, withMinisterVariables } from './contractTemplate';
import { LocalContractRepository } from '../../data/local/localContractRepository';
import { getPendingOutbox } from '../../data/local/offlineStore';
import { loadDb, saveDb } from '../../data/local/localDb';
import type { Contract, CreateContractInput } from '../../data/types';

const successor: Minister = { id: 'successor', fullName: 'Marie EXEMPLE', gender: 'Femme', nif: '111-222-333-4', ninu: '1112223334', mandateStartDate: '2026-10-01', mandateEndDate: null };
const input: CreateContractInput = { workspaceId: 'w', applicantId: '123', nif: '123', firstName: 'Jean', lastName: 'Test', gender: 'Homme', address: 'Delmas', position: 'Agent', assignment: 'MSPP', salaryNumber: 30000, durationMonths: 12, status: 'saisie', annee_fiscale: '2025-2026' };
const select = (id: string) => cacheMinisters({ ministers: [LEGACY_MINISTER, successor], currentMinisterId: id });
beforeEach(() => localStorage.clear());

describe('minister history and printing', () => {
  it('pins the minister in offline contracts and queued requests across a change, edit and reload', async () => {
    const repo = new LocalContractRepository();
    select(LEGACY_MINISTER.id);
    const previous = await repo.create(bindContractMinister(input));
    select(successor.id);
    const next = await repo.create(bindContractMinister({ ...input, nif: '456', applicantId: '456' }));
    expect(previous.ministerId).toBe(LEGACY_MINISTER.id);
    expect(next.ministerId).toBe(successor.id);
    expect(getPendingOutbox().filter(i => i.type === 'contract.create').map(i => i.payload.ministerId)).toEqual([LEGACY_MINISTER.id, successor.id]);
    const edited = await repo.update({ id: previous.id, position: 'Directeur' });
    expect(edited.ministerId).toBe(LEGACY_MINISTER.id);
    await expect(repo.update({ id: previous.id, ministerId: successor.id })).rejects.toThrow(/remplacé/);
    select(LEGACY_MINISTER.id);
    const restored = (await repo.getById(next.id))!;
    const html = renderTemplate(getDefaultTemplate('contract').html, buildTemplateVariables(restored));
    expect(html).toContain('Madame Marie EXEMPLE');
    expect(html).toContain('identifiée');
    expect(html).toContain('domiciliée');
    expect(html).toContain(successor.nif);
    expect(html).toContain(successor.ninu);
    expect(html).toContain(MINISTRY_ADDRESS);
    expect(html).not.toContain('SINAL');
    expect(html).not.toContain('{{');
    expect(renderTemplate(getDefaultTemplate('contract').html, buildTemplateVariables(edited))).toContain('Dr Bertrand SINAL');
  });
  it('migrates legacy queued creations to the original minister, never to the newly selected one', () => {
    select(successor.id);
    const db = loadDb();
    db.contracts = [{ ...input, id: 'old', createdAt: '2025-10-01', updatedAt: '2025-10-01', salaryText: '' } as Contract];
    db.outbox = [{ id: 'pending', workspaceId: 'w', type: 'contract.create', createdAt: '2025-10-01', payload: { ...input, id: 'old' } }];
    saveDb(db);
    expect(loadDb().contracts[0].ministerId).toBe(LEGACY_MINISTER.id);
    expect(getPendingOutbox()[0].payload.ministerId).toBe(LEGACY_MINISTER.id);
  });
  it('refuses unknown ministers and an uncached current minister instead of printing the wrong person', () => {
    expect(() => bindContractMinister(input)).toThrow(/Chargez/);
    expect(() => buildTemplateVariables({ ...input, ministerId: 'unknown' } as Contract)).toThrow(/indisponibles/);
    select(successor.id);
    expect(buildTemplateVariables({ ...input, id: 'old', createdAt: '2025-10-01' } as Contract).minister_id).toBe(LEGACY_MINISTER.id);
    expect(readMinistersCache()?.currentMinisterId).toBe(successor.id);
  });
  it('updates saved template signatories, preserves layout, and escapes minister input', () => {
    const old = '<p class="custom">Docteur Bertrand SINAL, identifi&eacute; NINU 1009241060 NIF 003-888-685-8 domicilié</p><b>Dr Bertrand SINAL</b>';
    const variables = buildTemplateVariables({ ...input, id: 'new', createdAt: '2025-10-01', ministerId: successor.id, minister: { ...successor, fullName: '<img src=x onerror=alert(1)>' } } as Contract);
    const html = renderTemplate(old, variables);
    expect(html).toContain('class="custom"');
    expect(html).toContain('&lt;img');
    expect(html).not.toContain('<img');
    expect(html).not.toContain('SINAL');
    expect(withMinisterVariables(withMinisterVariables(old))).toBe(withMinisterVariables(old));
  });
  it('validates and normalizes the four requested identity fields', () => {
    expect(validateMinister({ ...successor, fullName: '  Marie   EXEMPLE ', nif: '1112223334' })).toEqual(successor);
    expect(() => validateMinister({ ...successor, nif: '123' })).toThrow(/NIF/);
    expect(() => validateMinister({ ...successor, ninu: 'not digits' })).toThrow(/NINU/);
  });
});
