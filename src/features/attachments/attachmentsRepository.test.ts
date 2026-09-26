import 'fake-indexeddb/auto';
import { describe, expect, it, vi } from 'vitest';
import { manageAttachments, readAttachmentFile, validDocumentLink, validateAttachment } from './attachmentsRepository';
import type { Contract } from '../../data/types';
import type { AuthUser } from '../auth/auth';
vi.hoisted(() => { vi.stubEnv('VITE_DATA_PROVIDER', 'local'); });
const user = {id:'u',role:'agent',workspaceId:'w'} as AuthUser;
const contract = {id:'c',workspaceId:'w',applicantId:'person'} as Contract;
describe('person attachments', () => {
  it('shares documents across contracts for the same person, excluding content from listings', async () => {
    const id = crypto.randomUUID();
    const draft = {id,kind:'file' as const,name:'test.txt',content:'SGVsbG8='};
    await manageAttachments(user,contract,'add',draft);
    await manageAttachments(user,contract,'add',draft);
    const listed = await manageAttachments(user,{...contract,id:'other'},'list');
    expect(listed).toEqual([expect.objectContaining({id,name:'test.txt',size:5})]);
    expect(listed).not.toEqual([expect.objectContaining({content:'SGVsbG8='})]);
    expect(await manageAttachments({...user,role:'reader'},contract,'get',{id})).toEqual({name:'test.txt',content:'SGVsbG8='});
    expect(await manageAttachments(user,{...contract,workspaceId:'other'},'list')).toEqual([]);
    await expect(manageAttachments({...user,role:'reader'},contract,'delete',{id})).rejects.toThrow();
    await manageAttachments(user,contract,'delete',{id});
    expect(await manageAttachments(user,contract,'list')).toEqual([]);
  });
  it('rejects unsafe links, empty names, empty and oversized files', async () => {
    for (const location of ['javascript:alert(1)','data:text/html,hi','file:///secret','https://']) {
      expect(validDocumentLink(location)).toBe(false);
      expect(() => validateAttachment({id:'a',kind:'link',name:'Doc',location})).toThrow();
    }
    expect(validDocumentLink('https://example.com/a.pdf')).toBe(true);
    expect(() => validateAttachment({id:'a',kind:'path',name:' ',location:'/a'})).toThrow();
    await expect(readAttachmentFile(new File([],'empty'))).rejects.toThrow();
    await expect(readAttachmentFile(new File([new Uint8Array(10*1024*1024+1)],'large'))).rejects.toThrow();
    expect(await readAttachmentFile(new File(['Hello'],'hello.txt'))).toBe('SGVsbG8=');
  });
});
