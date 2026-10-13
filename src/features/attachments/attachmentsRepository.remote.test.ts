import { beforeEach, expect, it, vi } from 'vitest';
import type { AuthUser } from '../auth/auth';
import { manageAttachments, type AttachmentPerson } from './attachmentsRepository';

const rpc = vi.hoisted(() => {
  vi.stubEnv('VITE_DATA_PROVIDER', 'supabase');
  return vi.fn();
});
vi.mock('../../data/supabase/supabaseClient', () => ({getSupabaseClient: () => ({rpc})}));

const user = {id:'agent',role:'agent',taskSessionToken:'session'} as AuthUser;
const person: AttachmentPerson = {
  workspaceId:'w',applicantId:'123-456-789-0',nif:'123-456-789-0',firstName:'Jean',lastName:'Louis'
};
beforeEach(() => rpc.mockReset());

it('uses the identification RPC without a contract for adding, listing and deleting', async () => {
  rpc.mockResolvedValue({data:[],error:null});
  const draft = {id:'file',kind:'file' as const,name:'preuve.pdf',content:'SGVsbG8='};
  await manageAttachments(user,person,'add',draft);
  await manageAttachments(user,person,'list');
  await manageAttachments(user,person,'delete',{id:'file'});
  expect(rpc).toHaveBeenNthCalledWith(1,'manage_identification_attachments',{
    p_session_token:'session',p_person_id:person.nif,p_action:'add',
    p_document:{...draft,name:'123-456-789-0.pdf'}
  });
  for (const [,args] of rpc.mock.calls) {
    expect(args.p_person_id).toBe(person.nif);
    expect(args).not.toHaveProperty('p_contract_id');
  }
});

it('downloads the identification file using its current NIF', async () => {
  rpc.mockResolvedValueOnce({data:{name:'ancien.pdf',content:'SGVsbG8='},error:null})
    .mockResolvedValueOnce({data:[{id:'file',name:'ancien.pdf',kind:'file',createdAt:'2026-01-01'}],error:null});
  expect(await manageAttachments(user,person,'get',{id:'file'}))
    .toEqual({name:'123-456-789-0.pdf',content:'SGVsbG8='});
});
