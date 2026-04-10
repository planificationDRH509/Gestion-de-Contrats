import { PrintJobRepository } from "../repositories/PrintJobRepository";
import { ContractPrintJob } from "../types";
import { sqliteApiRequest } from "./sqliteApiClient";

export class SqlitePrintJobRepository implements PrintJobRepository {
  async create(workspaceId: string, contractIds: string[]): Promise<ContractPrintJob> {
    return sqliteApiRequest<ContractPrintJob>("/print-jobs", {
      method: "POST",
      body: {
        workspaceId,
        contractIds
      }
    });
  }
}
