import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { downloadListExcel } from "./downloadListExcel";
import type { ContractList } from "./listModel";

const mocks = vi.hoisted(() => ({ getByIds: vi.fn(), getInstitutions: vi.fn(), build: vi.fn() }));
vi.mock("../../data/dataProvider", () => ({ getDataProvider: () => ({contracts: {getByIds: mocks.getByIds}, suggestions: {getInstitutions: mocks.getInstitutions}}) }));
vi.mock("./listExcelExport", () => ({createListExcelWorkbook: mocks.build}));
const list: ContractList = {id: "lot",workspaceId: "w",durationMonths:9,visaNumber:null,sealedAt:null,version:1,createdAt:"",history:[],members:[
  {id:"c",firstName:"Ana",lastName:"Louis",nif:"001",position:"Infirmière",salaryNumber:100,durationMonths:9}
]};
const createUrl = vi.fn(); const revokeUrl = vi.fn();
beforeEach(() => {
  vi.useFakeTimers();
  mocks.getByIds.mockReset().mockResolvedValue(["contract"]); mocks.getInstitutions.mockReset().mockResolvedValue([]);
  mocks.build.mockReset().mockReturnValue(new Blob(["xlsx"]));
  createUrl.mockReset().mockReturnValue("blob:excel"); revokeUrl.mockReset();
  vi.stubGlobal("fetch",vi.fn().mockResolvedValue({ok:true,arrayBuffer:async () => new ArrayBuffer(1)}));
  vi.stubGlobal("URL",{createObjectURL:createUrl,revokeObjectURL:revokeUrl});
  vi.spyOn(HTMLAnchorElement.prototype,"click").mockImplementation(() => {});
});
afterEach(() => { vi.runOnlyPendingTimers(); vi.useRealTimers(); vi.unstubAllGlobals(); vi.restoreAllMocks(); });

describe("list Excel download", () => {
  it("reads complete contracts, verifies current membership and downloads the named workbook", async () => {
    const read = vi.fn().mockResolvedValue(list);
    const click = vi.spyOn(HTMLAnchorElement.prototype,"click").mockImplementation(function(this: HTMLAnchorElement) {
      expect(this.download).toBe("LOT-1-LOUIS-Ana.xlsx"); expect(this.href).toBe("blob:excel");
    });
    await downloadListExcel(read);
    expect(read).toHaveBeenCalledTimes(2);
    expect(mocks.getByIds).toHaveBeenCalledWith(["c"],"w");
    expect(mocks.getInstitutions).toHaveBeenCalledWith("w");
    expect(mocks.build).toHaveBeenCalledWith(list,["contract"],[],expect.any(Uint8Array));
    expect(click).toHaveBeenCalledOnce(); expect(document.querySelector('a[download]')).toBeNull();
    vi.runOnlyPendingTimers(); expect(revokeUrl).toHaveBeenCalledWith("blob:excel");
  });
  it("does not download if the list changes during preparation", async () => {
    const read = vi.fn().mockResolvedValueOnce(list).mockResolvedValueOnce({...list,visaNumber:"new",version:2});
    await expect(downloadListExcel(read)).rejects.toThrow(/changé/);
    expect(createUrl).not.toHaveBeenCalled();
  });
  it("does not download on read, template or validation errors", async () => {
    const read = vi.fn().mockResolvedValue(list);
    mocks.getByIds.mockRejectedValueOnce(new Error("Réseau indisponible"));
    await expect(downloadListExcel(read)).rejects.toThrow(/Réseau/);
    mocks.build.mockImplementationOnce(() => {throw new Error("Contrat manquant");});
    await expect(downloadListExcel(read)).rejects.toThrow(/manquant/);
    vi.mocked(fetch).mockResolvedValueOnce({ok:false} as Response);
    await expect(downloadListExcel(read)).rejects.toThrow(/modèle Excel/);
    expect(createUrl).not.toHaveBeenCalled();
  });
});
