import { ApplicantRepository } from "../repositories/ApplicantRepository";
import { ContractRepository } from "../repositories/ContractRepository";
import { DossierRepository } from "../repositories/DossierRepository";
import { PrintJobRepository } from "../repositories/PrintJobRepository";
import {
  Applicant,
  Contract,
  ContractListParams,
  ContractListResult,
  ContractPrintJob,
  ContractStatus,
  CreateContractInput,
  CreateDossierInput,
  Dossier,
  UpdateContractInput,
  UpdateDossierInput,
  UpsertApplicantInput
} from "../types";
import { DataProvider } from "../dataProvider";
import { getSupabaseClient } from "./supabaseClient";
import {
  normalizeDossierName,
  normalizeNonNegativeInteger,
  normalizeOptionalDate,
  normalizeOptionalText
} from "../../lib/dossier";
import { matchesContractDateFilter } from "../../lib/contractDateFilters";

function mapApplicant(row: {
  id: string;
  workspace_id: string;
  gender: string;
  first_name: string;
  last_name: string;
  nif: string | null;
  ninu: string | null;
  address: string;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
}): Applicant {
  return {
    id: row.id,
    workspaceId: row.workspace_id,
    gender: row.gender as Applicant["gender"],
    firstName: row.first_name,
    lastName: row.last_name,
    nif: row.nif,
    ninu: row.ninu,
    address: row.address,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    deletedAt: row.deleted_at
  };
}

function mapContract(row: {
  id: string;
  workspace_id: string;
  dossier_id: string | null;
  applicant_id: string | null;
  status: string;
  gender: string;
  first_name: string;
  last_name: string;
  nif: string | null;
  ninu: string | null;
  address: string;
  position: string;
  assignment: string;
  salary_number: number;
  salary_text: string;
  duration_months: number;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
}): Contract {
  return {
    id: row.id,
    workspaceId: row.workspace_id,
    dossierId: row.dossier_id,
    applicantId: row.applicant_id,
    status: row.status as Contract["status"],
    gender: row.gender as Contract["gender"],
    firstName: row.first_name,
    lastName: row.last_name,
    nif: row.nif,
    ninu: row.ninu,
    address: row.address,
    position: row.position,
    assignment: row.assignment,
    salaryNumber: row.salary_number,
    salaryText: row.salary_text,
    durationMonths: row.duration_months,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    deletedAt: row.deleted_at
  };
}

function mapDossier(row: {
  id: string;
  workspace_id: string;
  name: string;
  is_ephemeral: boolean;
  priority: string;
  contract_target_count: number | null;
  comment: string | null;
  deadline_date: string | null;
  focal_point: string | null;
  roadmap_sheet_number: string | null;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
}): Dossier {
  return {
    id: row.id,
    workspaceId: row.workspace_id,
    name: row.name,
    isEphemeral: row.is_ephemeral,
    priority: row.priority as Dossier["priority"],
    contractTargetCount: normalizeNonNegativeInteger(row.contract_target_count),
    comment: row.comment,
    deadlineDate: row.deadline_date,
    focalPoint: row.focal_point,
    roadmapSheetNumber: row.roadmap_sheet_number,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    deletedAt: row.deleted_at
  };
}

class SupabaseApplicantRepository implements ApplicantRepository {
  async getById(id: string): Promise<Applicant | null> {
    const client = getSupabaseClient();
    const { data, error } = await client
      .from("applicants")
      .select("*")
      .eq("id", id)
      .is("deleted_at", null)
      .single();
    if (error || !data) return null;
    return mapApplicant(data);
  }

  async findByNifOrNinu(
    workspaceId: string,
    nif?: string | null,
    ninu?: string | null
  ): Promise<Applicant | null> {
    const client = getSupabaseClient();
    const normalizedNif = nif?.trim() || "";
    const normalizedNinu = ninu?.trim() || "";
    if (!normalizedNif && !normalizedNinu) return null;

    let query = client
      .from("applicants")
      .select("*")
      .eq("workspace_id", workspaceId)
      .is("deleted_at", null);

    if (normalizedNif && normalizedNinu) {
      query = query.or(
        `nif.eq.${normalizedNif},ninu.eq.${normalizedNinu}`
      );
    } else if (normalizedNif) {
      query = query.eq("nif", normalizedNif);
    } else if (normalizedNinu) {
      query = query.eq("ninu", normalizedNinu);
    }

    const { data, error } = await query.limit(1).maybeSingle();
    if (error || !data) return null;
    return mapApplicant(data);
  }

  async upsert(input: UpsertApplicantInput): Promise<Applicant> {
    const client = getSupabaseClient();
    const payload = {
      id: input.id,
      workspace_id: input.workspaceId,
      gender: input.gender,
      first_name: input.firstName,
      last_name: input.lastName,
      nif: input.nif ?? null,
      ninu: input.ninu ?? null,
      address: input.address
    };

    const { data, error } = await client
      .from("applicants")
      .upsert(payload)
      .select("*")
      .single();

    if (error || !data) {
      throw new Error("Impossible d'enregistrer le postulant.");
    }
    return mapApplicant(data);
  }
}

class SupabaseDossierRepository implements DossierRepository {
  async list(workspaceId: string): Promise<Dossier[]> {
    const client = getSupabaseClient();
    const { data, error } = await client
      .from("dossiers")
      .select("*")
      .eq("workspace_id", workspaceId)
      .is("deleted_at", null)
      .order("created_at", { ascending: false });

    if (error || !data) {
      throw new Error("Impossible de charger les dossiers.");
    }

    return data.map(mapDossier);
  }

  async getById(id: string): Promise<Dossier | null> {
    const client = getSupabaseClient();
    const { data, error } = await client
      .from("dossiers")
      .select("*")
      .eq("id", id)
      .is("deleted_at", null)
      .maybeSingle();
    if (error || !data) return null;
    return mapDossier(data);
  }

  async create(input: CreateDossierInput): Promise<Dossier> {
    const client = getSupabaseClient();
    const normalizedName = normalizeDossierName(input.name);
    const contractTargetCount = normalizeNonNegativeInteger(input.contractTargetCount);
    const comment = normalizeOptionalText(input.comment);
    const deadlineDate = normalizeOptionalDate(input.deadlineDate);
    const focalPoint = normalizeOptionalText(input.focalPoint);
    const roadmapSheetNumber = normalizeOptionalText(input.roadmapSheetNumber);

    const { data: existing } = await client
      .from("dossiers")
      .select("*")
      .eq("workspace_id", input.workspaceId)
      .ilike("name", normalizedName)
      .is("deleted_at", null)
      .limit(1)
      .maybeSingle();
    if (existing) {
      return mapDossier(existing);
    }

    const payload = {
      workspace_id: input.workspaceId,
      name: normalizedName,
      is_ephemeral: input.isEphemeral ?? false,
      priority: input.priority ?? "normal",
      contract_target_count: contractTargetCount,
      comment,
      deadline_date: deadlineDate,
      focal_point: focalPoint,
      roadmap_sheet_number: roadmapSheetNumber
    };

    const { data, error } = await client
      .from("dossiers")
      .insert(payload)
      .select("*")
      .single();

    if (error || !data) {
      throw new Error("Impossible de créer le dossier.");
    }

    return mapDossier(data);
  }

  async update(input: UpdateDossierInput): Promise<Dossier> {
    const client = getSupabaseClient();
    const existing = await this.getById(input.id);
    if (!existing || existing.workspaceId !== input.workspaceId) {
      throw new Error("Dossier introuvable.");
    }

    const payload = {
      name:
        input.name !== undefined
          ? normalizeDossierName(input.name)
          : existing.name,
      is_ephemeral: input.isEphemeral ?? existing.isEphemeral,
      priority: input.priority ?? existing.priority,
      contract_target_count:
        input.contractTargetCount !== undefined
          ? normalizeNonNegativeInteger(input.contractTargetCount)
          : normalizeNonNegativeInteger(existing.contractTargetCount),
      comment:
        input.comment !== undefined
          ? normalizeOptionalText(input.comment)
          : existing.comment ?? null,
      deadline_date:
        input.deadlineDate !== undefined
          ? normalizeOptionalDate(input.deadlineDate)
          : existing.deadlineDate ?? null,
      focal_point:
        input.focalPoint !== undefined
          ? normalizeOptionalText(input.focalPoint)
          : existing.focalPoint ?? null,
      roadmap_sheet_number:
        input.roadmapSheetNumber !== undefined
          ? normalizeOptionalText(input.roadmapSheetNumber)
          : existing.roadmapSheetNumber ?? null
    };

    const { data, error } = await client
      .from("dossiers")
      .update(payload)
      .eq("id", input.id)
      .eq("workspace_id", input.workspaceId)
      .is("deleted_at", null)
      .select("*")
      .single();

    if (error || !data) {
      throw new Error("Impossible de mettre à jour le dossier.");
    }

    return mapDossier(data);
  }

  async delete(id: string, workspaceId: string): Promise<number> {
    const client = getSupabaseClient();

    const { data: detachedContracts, error: detachError } = await client
      .from("contracts")
      .update({ dossier_id: null })
      .eq("workspace_id", workspaceId)
      .eq("dossier_id", id)
      .is("deleted_at", null)
      .select("id");
    if (detachError) {
      throw new Error("Impossible de dissocier les contrats du dossier.");
    }

    const { error: deleteError } = await client
      .from("dossiers")
      .update({ deleted_at: new Date().toISOString() })
      .eq("id", id)
      .eq("workspace_id", workspaceId)
      .is("deleted_at", null);
    if (deleteError) {
      throw new Error("Impossible de supprimer le dossier.");
    }

    return detachedContracts?.length ?? 0;
  }
}

class SupabaseContractRepository implements ContractRepository {
  async list(params: ContractListParams): Promise<ContractListResult> {
    const client = getSupabaseClient();
    const page = params.page ?? 1;
    const pageSize = params.pageSize ?? 10;
    const from = (page - 1) * pageSize;
    const to = from + pageSize - 1;
    const hasDateFilter = Boolean(params.dateFilterMode && params.dateFilterMode !== "all");

    let query = client
      .from("contracts")
      .select("*", { count: "exact" })
      .eq("workspace_id", params.workspaceId)
      .is("deleted_at", null);

    if (params.query) {
      const escaped = params.query.replace(/,/g, " ");
      query = query.or(
        `first_name.ilike.%${escaped}%,last_name.ilike.%${escaped}%,nif.ilike.%${escaped}%,ninu.ilike.%${escaped}%,position.ilike.%${escaped}%,assignment.ilike.%${escaped}%`
      );
    }

    if (params.status) {
      query = query.eq("status", params.status);
    }

    if (params.dossierId !== undefined) {
      if (params.dossierId === null) {
        query = query.is("dossier_id", null);
      } else {
        query = query.eq("dossier_id", params.dossierId);
      }
    }

    switch (params.sort) {
      case "createdAt_asc":
        query = query.order("created_at", { ascending: true });
        break;
      case "name_asc":
        query = query.order("last_name", { ascending: true });
        break;
      case "name_desc":
        query = query.order("last_name", { ascending: false });
        break;
      case "createdAt_desc":
      default:
        query = query.order("created_at", { ascending: false });
    }

    if (hasDateFilter) {
      const { data, error } = await query;
      if (error || !data) {
        throw new Error("Impossible de charger les contrats.");
      }

      const filteredItems = data
        .map(mapContract)
        .filter((contract) =>
          matchesContractDateFilter(
            contract,
            params.dateFilterMode,
            {
              dayDateInput: params.dateFilterDate,
              rangeStartInput: params.dateFilterStart,
              rangeEndInput: params.dateFilterEnd
            }
          )
        );
      const pagedItems = filteredItems.slice(from, to + 1);

      return {
        items: pagedItems,
        total: filteredItems.length,
        page,
        pageSize
      };
    }

    const { data, error, count } = await query.range(from, to);
    if (error || !data) {
      throw new Error("Impossible de charger les contrats.");
    }

    return {
      items: data.map(mapContract),
      total: count ?? data.length,
      page,
      pageSize
    };
  }

  async getById(id: string): Promise<Contract | null> {
    const client = getSupabaseClient();
    const { data, error } = await client
      .from("contracts")
      .select("*")
      .eq("id", id)
      .is("deleted_at", null)
      .single();
    if (error || !data) return null;
    return mapContract(data);
  }

  async getByIds(ids: string[], workspaceId: string): Promise<Contract[]> {
    const client = getSupabaseClient();
    const { data, error } = await client
      .from("contracts")
      .select("*")
      .eq("workspace_id", workspaceId)
      .in("id", ids)
      .is("deleted_at", null);
    if (error || !data) {
      throw new Error("Impossible de charger les contrats sélectionnés.");
    }
    return data.map(mapContract);
  }

  async create(input: CreateContractInput): Promise<Contract> {
    const client = getSupabaseClient();
    const payload = {
      workspace_id: input.workspaceId,
      dossier_id: input.dossierId ?? null,
      applicant_id: input.applicantId,
      status: input.status,
      gender: input.gender,
      first_name: input.firstName,
      last_name: input.lastName,
      nif: input.nif ?? null,
      ninu: input.ninu ?? null,
      address: input.address,
      position: input.position,
      assignment: input.assignment,
      salary_number: input.salaryNumber,
      salary_text: input.salaryText,
      duration_months: input.durationMonths ?? 12
    };

    const { data, error } = await client
      .from("contracts")
      .insert(payload)
      .select("*")
      .single();

    if (error || !data) {
      throw new Error("Impossible de créer le contrat.");
    }
    return mapContract(data);
  }

  async update(input: UpdateContractInput): Promise<Contract> {
    const client = getSupabaseClient();
    const payload = {
      status: input.status,
      gender: input.gender,
      first_name: input.firstName,
      last_name: input.lastName,
      nif: input.nif ?? null,
      ninu: input.ninu ?? null,
      address: input.address,
      position: input.position,
      assignment: input.assignment,
      salary_number: input.salaryNumber,
      salary_text: input.salaryText,
      duration_months: input.durationMonths ?? 12,
      applicant_id: input.applicantId,
      dossier_id: input.dossierId
    };

    const { data, error } = await client
      .from("contracts")
      .update(payload)
      .eq("id", input.id)
      .select("*")
      .single();

    if (error || !data) {
      throw new Error("Impossible de mettre à jour le contrat.");
    }
    return mapContract(data);
  }

  async assignToDossier(
    workspaceId: string,
    contractIds: string[],
    dossierId: string | null
  ): Promise<number> {
    if (contractIds.length === 0) {
      return 0;
    }

    const client = getSupabaseClient();
    const { data, error } = await client
      .from("contracts")
      .update({ dossier_id: dossierId })
      .eq("workspace_id", workspaceId)
      .in("id", contractIds)
      .is("deleted_at", null)
      .select("id");

    if (error) {
      throw new Error("Impossible d'affecter les contrats au dossier.");
    }

    return data?.length ?? 0;
  }

  async updateStatus(
    workspaceId: string,
    contractIds: string[],
    status: ContractStatus
  ): Promise<number> {
    if (contractIds.length === 0) {
      return 0;
    }

    const client = getSupabaseClient();
    const { data, error } = await client
      .from("contracts")
      .update({ status })
      .eq("workspace_id", workspaceId)
      .in("id", contractIds)
      .is("deleted_at", null)
      .select("id");

    if (error) {
      throw new Error("Impossible de modifier l'état des contrats.");
    }

    return data?.length ?? 0;
  }

  async updateDuration(
    workspaceId: string,
    contractIds: string[],
    durationMonths: number
  ): Promise<number> {
    if (contractIds.length === 0) {
      return 0;
    }

    const client = getSupabaseClient();
    const { data, error } = await client
      .from("contracts")
      .update({ duration_months: durationMonths })
      .eq("workspace_id", workspaceId)
      .in("id", contractIds)
      .is("deleted_at", null)
      .select("id");

    if (error) {
      throw new Error("Impossible de modifier la durée des contrats.");
    }

    return data?.length ?? 0;
  }

  async softDelete(id: string, workspaceId: string): Promise<void> {
    const client = getSupabaseClient();
    const { error } = await client
      .from("contracts")
      .update({ deleted_at: new Date().toISOString() })
      .eq("id", id)
      .eq("workspace_id", workspaceId);
    if (error) {
      throw new Error("Impossible de supprimer le contrat.");
    }
  }
}

class SupabasePrintJobRepository implements PrintJobRepository {
  async create(workspaceId: string, contractIds: string[]): Promise<ContractPrintJob> {
    const client = getSupabaseClient();
    const { data, error } = await client
      .from("contract_print_jobs")
      .insert({ workspace_id: workspaceId, contract_ids: contractIds })
      .select("*")
      .single();
    if (error || !data) {
      throw new Error("Impossible de créer l'historique d'impression.");
    }
    return {
      id: data.id,
      workspaceId: data.workspace_id,
      contractIds: data.contract_ids,
      createdAt: data.created_at,
      printedAt: data.printed_at
    };
  }
}

export function createSupabaseProvider(): DataProvider {
  return {
    applicants: new SupabaseApplicantRepository(),
    dossiers: new SupabaseDossierRepository(),
    contracts: new SupabaseContractRepository(),
    printJobs: new SupabasePrintJobRepository()
  };
}
