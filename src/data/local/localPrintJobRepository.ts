import { PrintJobRepository } from "../repositories/PrintJobRepository";
import { ContractPrintJob } from "../types";
import { createId } from "../../lib/uuid";
import { loadDb, saveDb } from "./localDb";

function now() {
  return new Date().toISOString();
}

export class LocalPrintJobRepository implements PrintJobRepository {
  async create(workspaceId: string, contractIds: string[]): Promise<ContractPrintJob> {
    const db = loadDb();
    const job: ContractPrintJob = {
      id: createId(),
      workspaceId,
      contractIds,
      createdAt: now(),
      printedAt: now()
    };
    db.printJobs.push(job);
    saveDb(db);
    return job;
  }
}
