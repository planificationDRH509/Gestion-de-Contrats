import 'fake-indexeddb/auto';
import { get, set } from 'idb-keyval';
import { describe, expect, it, vi } from 'vitest';
import { manageAttachments, readAttachmentFile, validDocumentLink, validateAttachment } from './attachmentsRepository';
import type { Contract } from '../../data/types';
import type { AuthUser } from '../auth/auth';
vi.hoisted(() => { vi.stubEnv('VITE_DATA_PROVIDER', 'local'); });
const user = {id:'u',role:'agent',workspaceId:'w'} as AuthUser;
const contract = {id:'c',workspaceId:'w',applicantId:'person',nif:'123-456-789-0'} as Contract;
describe('person attachments', () => {
  it('shares documents across contracts for the same person, excluding content from listings', async () => {
    const id = crypto.randomUUID();
    const draft = {id,kind:'file' as const,name:'test.txt',content:'SGVsbG8='};
    await manageAttachments(user,contract,'add',draft);
    await manageAttachments(user,contract,'add',draft);
    const listed = await manageAttachments(user,{...contract,id:'other'},'list');
    expect(listed).toEqual([expect.objectContaining({id,name:'123-456-789-0.txt',size:5})]);
    expect(await get(`person-attachments:w:person`)).toEqual([expect.objectContaining({name:'123-456-789-0.txt'})]);
    expect(listed).not.toEqual([expect.objectContaining({content:'SGVsbG8='})]);
    expect(await manageAttachments({...user,role:'reader'},contract,'get',{id})).toEqual({name:'123-456-789-0.txt',content:'SGVsbG8='});
    expect(await manageAttachments(user,{...contract,workspaceId:'other'},'list')).toEqual([]);
    await expect(manageAttachments({...user,role:'reader'},contract,'delete',{id})).rejects.toThrow();
    await manageAttachments(user,contract,'delete',{id});
    expect(await manageAttachments(user,contract,'list')).toEqual([]);
  });
  it('uses the current NIF for existing files without renaming links or paths', async () => {
    const legacyContract = {...contract, applicantId:'legacy-person', nif:' 987-654-321-0 '};
    await set('person-attachments:w:legacy-person', [
      {id:'file',kind:'file',name:'ancienne.preuve.PDF',content:'SGVsbG8=',createdAt:'2026-09-01'},
      {id:'link',kind:'link',name:'Document Drive',location:'https://example.com/document',createdAt:'2026-09-01'},
      {id:'path',kind:'path',name:'Archive',location:'/archive/document.pdf',createdAt:'2026-09-01'}
    ]);
    expect(await manageAttachments(user,legacyContract,'list')).toEqual([
      expect.objectContaining({id:'file',name:'987-654-321-0.PDF'}),
      expect.objectContaining({id:'link',name:'Document Drive'}),
      expect.objectContaining({id:'path',name:'Archive'})
    ]);
    expect(await manageAttachments(user,legacyContract,'get',{id:'file'})).toEqual({name:'987-654-321-0.PDF',content:'SGVsbG8='});
  });
  it('numbers multiple files in upload order, across extensions, with matching download names', async () => {
    const filesContract = {...contract,applicantId:'multiple-files'};
    vi.useFakeTimers({toFake:['Date']});
    try {
      const drafts = [['one','preuve.pdf','SGVsbG8='],['two','autre.pdf','V29ybGQ='],['three','document','SGVsbG8=']];
      for (const [index,[id,name,content]] of drafts.entries()) {
        vi.setSystemTime(new Date('2026-09-01T00:00:00Z').getTime() + index * 1000);
        await manageAttachments(user,filesContract,'add',{id,kind:'file',name,content});
      }
    } finally {
      vi.useRealTimers();
    }
    await manageAttachments(user,filesContract,'add',{id:'link',kind:'link',name:'Document Drive',location:'https://example.com/document'});
    expect(await manageAttachments(user,filesContract,'list')).toEqual([
      expect.objectContaining({id:'link',name:'Document Drive'}),
      expect.objectContaining({id:'three',name:'123-456-789-0-3'}),
      expect.objectContaining({id:'two',name:'123-456-789-0-2.pdf'}),
      expect.objectContaining({id:'one',name:'123-456-789-0-1.pdf'})
    ]);
    expect(await manageAttachments(user,filesContract,'get',{id:'one'})).toEqual({name:'123-456-789-0-1.pdf',content:'SGVsbG8='});
    expect(await manageAttachments(user,filesContract,'get',{id:'two'})).toEqual({name:'123-456-789-0-2.pdf',content:'V29ybGQ='});
    await manageAttachments(user,filesContract,'delete',{id:'two'});
    expect(await manageAttachments(user,filesContract,'get',{id:'three'})).toEqual({name:'123-456-789-0-2',content:'SGVsbG8='});
    await manageAttachments(user,filesContract,'delete',{id:'one'});
    expect(await manageAttachments(user,filesContract,'get',{id:'three'})).toEqual({name:'123-456-789-0',content:'SGVsbG8='});
    await expect(manageAttachments(user,{...filesContract,nif:null},'add',{id:'missing-nif',kind:'file',name:'preuve.pdf',content:'SGVsbG8='})).rejects.toThrow('NIF');
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
