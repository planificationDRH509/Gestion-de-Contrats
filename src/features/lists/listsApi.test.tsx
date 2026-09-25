import type { PropsWithChildren } from "react";
import { onlineManager, QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { getPendingOutbox } from '../../data/local/offlineStore';
import type { ContractList } from "./listModel";
const mocks=vi.hoisted(() => ({ rpc:vi.fn(),sync:vi.fn(), }));
vi.mock('../auth/auth', () => ({useAuth: () => ({user:{id:'u',workspaceId:'w',taskSessionToken:'test-session',role:'admin',name:'Agent'},can:()=>true})}));
vi.mock('../../data/supabase/supabaseClient', () => ({getSupabaseClient:()=>({rpc:mocks.rpc})}));
vi.mock('../../data/supabase/supabaseProvider', () => ({syncSupabaseOutbox:mocks.sync}));
vi.stubEnv('VITE_DATA_PROVIDER','supabase');
const {useContractLists,useListOperation}=await import('./listsApi');
function setup() {
  const client=new QueryClient({defaultOptions:{mutations:{retry:false}}});
  const wrapper=({children}:PropsWithChildren)=><QueryClientProvider client={client}>{children}</QueryClientProvider>;
  return renderHook(()=>useListOperation(),{wrapper});
}
beforeEach(()=>{
  vi.spyOn(navigator,'onLine','get').mockReturnValue(true);
  mocks.rpc.mockReset().mockResolvedValue({data:'lot',error:null}); mocks.sync.mockReset().mockResolvedValue(0); localStorage.clear();
});
describe('list mutation synchronization',()=>{
  it('saves offline creations in the durable outbox',async()=>{
    vi.spyOn(navigator,'onLine','get').mockReturnValue(false); const {result}=setup();
    let id: string | null = null;
    await act(async()=>{id=await result.current.mutateAsync({action:'create',durationMonths:6});});
    expect(id).toBeTruthy();
    expect(getPendingOutbox()).toEqual([expect.objectContaining({type:'list.operation',payload:expect.objectContaining({operation:expect.objectContaining({createId:id})})})]);
    expect(mocks.rpc).not.toHaveBeenCalled();
  });
  it('also queues online changes durably before synchronizing',async()=>{
    const {result}=setup();
    await act(async()=>{await result.current.mutateAsync({action:'create',durationMonths:6});});
    expect(getPendingOutbox()).toHaveLength(1);
    expect(mocks.rpc).not.toHaveBeenCalled();
  });
});

describe('offline list reads',()=>{
  const cachedList: ContractList = {
    id:'lot', workspaceId:'w', durationMonths:12, visaNumber:null, sealedAt:null,
    version:1, createdAt:'2026-09-20T00:00:00Z', history:[], members:[]
  };

  function mountListQuery(cached?: ContractList[]) {
    const client=new QueryClient({defaultOptions:{queries:{retry:false}}});
    if(cached) client.setQueryData(['contract-lists','w','u'],cached);
    const wrapper=({children}:PropsWithChildren)=><QueryClientProvider client={client}>{children}</QueryClientProvider>;
    return {client,...renderHook(()=>useContractLists(),{wrapper})};
  }

  it('shows cached lists without an error while offline, then refreshes after reconnecting',async()=>{
    vi.spyOn(navigator,'onLine','get').mockReturnValue(false);
    onlineManager.setOnline(false);
    const {result,unmount,client}=mountListQuery([cachedList]);
    await waitFor(()=>expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toEqual([cachedList]);
    expect(mocks.rpc).not.toHaveBeenCalled();

    vi.spyOn(navigator,'onLine','get').mockReturnValue(true);
    mocks.rpc.mockResolvedValue({data:[],error:null});
    await act(async()=>{onlineManager.setOnline(true);});
    await waitFor(()=>expect(mocks.rpc).toHaveBeenCalledWith('read_contract_lists',{
      p_session_token:'test-session',p_workspace_id:'w'
    }));
    await waitFor(()=>expect(result.current.data).toEqual([]));
    unmount(); client.clear();
  });

  it('keeps the cached lists when a network request fails',async()=>{
    mocks.rpc.mockRejectedValueOnce(new TypeError('Failed to fetch'));
    const {result,unmount,client}=mountListQuery([cachedList]);
    await waitFor(()=>expect(mocks.rpc).toHaveBeenCalledOnce());
    await waitFor(()=>expect(result.current.isFetching).toBe(false));
    expect(result.current.isError).toBe(false);
    expect(result.current.data).toEqual([cachedList]);
    unmount(); client.clear();
  });

  it('does not show a request error when no lists have been cached yet',async()=>{
    vi.spyOn(navigator,'onLine','get').mockReturnValue(false);
    const {result,unmount,client}=mountListQuery();
    await waitFor(()=>expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toEqual([]);
    expect(mocks.rpc).not.toHaveBeenCalled();
    unmount(); client.clear();
  });

  it('still reports server errors that are unrelated to connectivity',async()=>{
    mocks.rpc.mockResolvedValueOnce({data:null,error:new Error('Permission refusée')});
    const {result,unmount,client}=mountListQuery();
    await waitFor(()=>expect(result.current.isError).toBe(true));
    expect(result.current.error).toMatchObject({message:'Permission refusée'});
    unmount(); client.clear();
  });
});
