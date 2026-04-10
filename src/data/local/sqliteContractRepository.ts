import { ContractRepository } from "../repositories/ContractRepository";
import {
  Contract,
  ContractListParams,
  ContractListResult,
  ContractStatus,
  CreateContractInput,
  UpdateContractInput
} from "../types";
import { sqliteApiRequest } from "./sqliteApiClient";

export class SqliteContractRepository implements ContractRepository {
  async list(params: ContractListParams): Promise<ContractListResult> {
    return sqliteApiRequest<ContractListResult>("/contracts/list", {
      method: "POST",
      body: params
    });
  }

  async getById(id: string): Promise<Contract | null> {
    return sqliteApiRequest<Contract | null>(`/contracts/${encodeURIComponent(id)}`);
  }

  async getByIds(ids: string[], workspaceId: string): Promise<Contract[]> {
    return sqliteApiRequest<Contract[]>("/contracts/by-ids", {
      method: "POST",
      body: {
        ids,
        workspaceId
      }
    });
  }

  async create(input: CreateContractInput): Promise<Contract> {
    return sqliteApiRequest<Contract>("/contracts", {
      method: "POST",
      body: input
    });
  }

  async update(input: UpdateContractInput): Promise<Contract> {
    return sqliteApiRequest<Contract>(`/contracts/${encodeURIComponent(input.id)}`, {
      method: "PATCH",
      body: input
    });
  }

  async assignToDossier(
    workspaceId: string,
    contractIds: string[],
    dossierId: string | null
  ): Promise<number> {
    return sqliteApiRequest<number>("/contracts/assign-dossier", {
      method: "POST",
      body: {
        workspaceId,
        contractIds,
        dossierId
      }
    });
  }

  async updateStatus(
    workspaceId: string,
    contractIds: string[],
    status: ContractStatus
  ): Promise<number> {
    return sqliteApiRequest<number>("/contracts/update-status", {
      method: "POST",
      body: {
        workspaceId,
        contractIds,
        status
      }
    });
  }

  async updateDuration(
    workspaceId: string,
    contractIds: string[],
    durationMonths: number
  ): Promise<number> {
    return sqliteApiRequest<number>("/contracts/update-duration", {
      method: "POST",
      body: {
        workspaceId,
        contractIds,
        durationMonths
      }
    });
  }

  async softDelete(id: string, workspaceId: string): Promise<void> {
    await sqliteApiRequest<{ ok: boolean }>("/contracts/soft-delete", {
      method: "POST",
      body: {
        id,
        workspaceId
      }
    });
  }
}
