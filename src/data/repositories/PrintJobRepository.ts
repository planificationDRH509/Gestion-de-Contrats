import { ContractPrintJob } from "../types";

export interface PrintJobRepository {
  create(workspaceId: string, contractIds: string[]): Promise<ContractPrintJob>;
}
