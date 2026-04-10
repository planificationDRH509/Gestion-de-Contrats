import {
  Contract,
  ContractListParams,
  ContractListResult,
  ContractStatus,
  CreateContractInput,
  UpdateContractInput
} from "../types";

export interface ContractRepository {
  list(params: ContractListParams): Promise<ContractListResult>;
  getById(id: string): Promise<Contract | null>;
  getByIds(ids: string[], workspaceId: string): Promise<Contract[]>;
  create(input: CreateContractInput): Promise<Contract>;
  update(input: UpdateContractInput): Promise<Contract>;
  assignToDossier(
    workspaceId: string,
    contractIds: string[],
    dossierId: string | null
  ): Promise<number>;
  updateStatus(
    workspaceId: string,
    contractIds: string[],
    status: ContractStatus
  ): Promise<number>;
  updateDuration(
    workspaceId: string,
    contractIds: string[],
    durationMonths: number
  ): Promise<number>;
  softDelete(id: string, workspaceId: string): Promise<void>;
}
