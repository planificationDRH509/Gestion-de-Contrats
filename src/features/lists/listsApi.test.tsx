import type { PropsWithChildren } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
const mocks=vi.hoisted(() => ({ rpc:vi.fn(),sync:vi.fn(),pending:[] as {workspaceId:string;type:string}[] }));
vi.mock('../auth/auth', () => ({useAuth: () => ({user:{id:'u',workspaceId:'w',taskSessionToken:'test-session'},can:()=>true})}));
vi.mock('../../data/supabase/supabaseClient', () => ({getSupabaseClient:()=>({rpc:mocks.rpc})}));
vi.mock('../../data/supabase/supabaseProvider', () => ({syncSupabaseOutbox:mocks.sync}));
vi.mock('../../data/local/offlineStore', () => ({getPendingOutbox:()=>mocks.pending}));
vi.stubEnv('VITE_DATA_PROVIDER','supabase');
const {useListOperation}=await import('./listsApi');
function setup() {
  const client=new QueryClient({defaultOptions:{mutations:{retry:false}}});
  const wrapper=({children}:PropsWithChildren)=><QueryClientProvider client={client}>{children}</QueryClientProvider>;
  return renderHook(()=>useListOperation(),{wrapper});
}
beforeEach(()=>{
  vi.spyOn(navigator,'onLine','get').mockReturnValue(true);
  mocks.rpc.mockReset().mockResolvedValue({data:'lot',error:null}); mocks.sync.mockReset().mockResolvedValue(0); mocks.pending=[];
});
describe('list mutation synchronization',()=>{
  it('refuses offline changes instead of queuing a future seal',async()=>{
    vi.spyOn(navigator,'onLine','get').mockReturnValue(false); const {result}=setup();
    await act(async()=>{await expect(result.current.mutateAsync({action:'seal',listId:'lot',version:1})).rejects.toThrow(/Reconnectez/);});
    expect(mocks.rpc).not.toHaveBeenCalled();
  });
  it('refuses sealing while contract edits remain unsynchronized',async()=>{
    mocks.pending=[{workspaceId:'w',type:'contract.update'}]; const {result}=setup();
    await act(async()=>{await expect(result.current.mutateAsync({action:'seal',listId:'lot',version:1})).rejects.toThrow(/synchroniser/);});
    expect(mocks.sync).toHaveBeenCalledOnce(); expect(mocks.rpc).not.toHaveBeenCalled();
  });
  it('flushes queued changes before the authenticated atomic RPC',async()=>{
    const {result}=setup();
    await act(async()=>{await result.current.mutateAsync({action:'assign',listId:'lot',contractIds:['c1']});});
    expect(mocks.sync.mock.invocationCallOrder[0]).toBeLessThan(mocks.rpc.mock.invocationCallOrder[0]);
    expect(mocks.rpc).toHaveBeenCalledWith('mutate_contract_list',{p_session_token:'test-session',p_workspace_id:'w',p_operation:{action:'assign',listId:'lot',contractIds:['c1']}});
  });
});
