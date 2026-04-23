import { ApplicantRepository } from "../repositories/ApplicantRepository";
import { ContractRepository } from "../repositories/ContractRepository";
import { DossierRepository } from "../repositories/DossierRepository";
import { PrintJobRepository } from "../repositories/PrintJobRepository";
import { AutocompleteRepository } from "../repositories/AutocompleteRepository";
import {
  AddressSuggestion,
  PositionSuggestion,
  InstitutionSuggestion
} from "../local/suggestionsDb";
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
import { formatFirstName, formatLastName } from "../../lib/format";
import { getSupabaseClient } from "./supabaseClient";
import {
  normalizeDossierName,
  normalizeNonNegativeInteger,
  normalizeOptionalDate,
  normalizeOptionalText
} from "../../lib/dossier";
import { matchesContractDateFilter } from "../../lib/contractDateFilters";
import { getStoredFiscalYear } from "../../features/settings/settingsApi";

function mapApplicant(row: any): Applicant {
  return {
    id: row.nif,
    workspaceId: row.workspace_id,
    gender: (row.sexe as Applicant["gender"]) || "Homme",
    firstName: row.prenom,
    lastName: row.nom,
    nif: row.nif,
    ninu: row.ninu,
    address: row.adresse,
    createdAt: row.created_at,
    updatedAt: row.updated_at || row.created_at,
    deletedAt: row.deleted_at || null,
    createdBy: row.created_by
  };
}

function mapContract(row: any): Contract {
  const ident = row.identification || {};
  return {
    id: row.id_contrat,
    workspaceId: row.workspace_id,
    dossierId: row.dossier_id,
    applicantId: row.nif,
    status: row.status as Contract["status"],
    gender: (ident.sexe as Contract["gender"]) || "Homme",
    firstName: ident.prenom || "",
    lastName: ident.nom || "",
    nif: row.nif,
    ninu: ident.ninu || null,
    address: ident.adresse || "",
    position: row.titre,
    assignment: row.lieu_affectation,
    salaryNumber: row.salaire_en_chiffre,
    salaryText: row.salaire,
    durationMonths: row.duree_contrat,
    createdAt: row.created_at,
    updatedAt: row.updated_at || row.created_at,
    deletedAt: row.deleted_at || null,
    createdBy: row.created_by,
    commentaire: row.commentaire || null
  };
}

function mapDossier(row: any): Dossier {
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
    deletedAt: row.deleted_at,
    createdBy: row.created_by
  };
}

class SupabaseApplicantRepository implements ApplicantRepository {
  async getById(id: string): Promise<Applicant | null> {
    const client = getSupabaseClient();
    const { data, error } = await client
      .from("identification")
      .select("*")
      .eq("nif", id)
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
      .from("identification")
      .select("*")
      .is("deleted_at", null);

    if (normalizedNif && normalizedNinu) {
      query = query.or(`nif.eq.${normalizedNif},ninu.eq.${normalizedNinu}`);
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
    const nif = (input.nif || input.id || "").trim();
    if (!nif) throw new Error("NIF obligatoire pour enregistrer un postulant.");

    const formattedFirstName = formatFirstName(input.firstName);
    const formattedLastName  = formatLastName(input.lastName);

    // ── 1. Check if the record already exists ─────────────────────────────
    const { data: existing } = await client
      .from("identification")
      .select("*")
      .eq("nif", nif)
      .maybeSingle();

    if (!existing) {
      // ── 2a. NIF not found → INSERT ────────────────────────────────────
      const payload = {
        nif,
        workspace_id: input.workspaceId,
        sexe: input.gender,
        prenom: formattedFirstName,
        nom: formattedLastName,
        ninu: input.ninu || null,
        adresse: input.address,
        created_by: input.createdBy
      };

      const { data, error } = await (client
        .from("identification")
        .insert(payload as any) as any)
        .select("*")
        .single();

      if (error || !data) {
        throw new Error("Impossible d'enregistrer le postulant.");
      }
      return mapApplicant(data);
    }

    // ── 2b. NIF exists → selective UPDATE of changed fields only ─────────
    const changes: Record<string, unknown> = {};

    if (formattedFirstName && formattedFirstName !== existing.prenom) {
      changes.prenom = formattedFirstName;
    }
    if (formattedLastName && formattedLastName !== existing.nom) {
      changes.nom = formattedLastName;
    }
    if (input.gender && input.gender !== existing.sexe) {
      changes.sexe = input.gender;
    }
    // For ninu: only update if a new value is provided AND it differs
    if (input.ninu && input.ninu !== existing.ninu) {
      changes.ninu = input.ninu;
    }
    if (input.address && input.address !== existing.adresse) {
      changes.adresse = input.address;
    }

    if (Object.keys(changes).length === 0) {
      // Nothing changed — return existing data as-is
      return mapApplicant(existing);
    }

    changes.updated_at = new Date().toISOString();

    const { data: updated, error: updateError } = await (client
      .from("identification")
      .update(changes as any) as any)
      .eq("nif", nif)
      .eq("workspace_id", input.workspaceId)
      .select("*")
      .single();

    if (updateError || !updated) {
      throw new Error("Impossible de mettre à jour le postulant.");
    }
    return mapApplicant(updated);
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
      id: crypto.randomUUID(),
      workspace_id: input.workspaceId,
      name: normalizedName,
      is_ephemeral: input.isEphemeral || false,
      priority: input.priority || "normal",
      contract_target_count: contractTargetCount,
      comment,
      deadline_date: deadlineDate,
      focal_point: focalPoint,
      roadmap_sheet_number: roadmapSheetNumber,
      created_by: (input as any).createdBy
    };

    const { data, error } = await (client
      .from("dossiers")
      .insert(payload as any) as any)
      .select("*")
      .single();

    if (error || !data) {
      console.error("Dossier create error:", error);
      throw new Error(`Impossible de créer le dossier: ${error?.message || "Erreur Supabase"}`);
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
          : (existing as any).comment ?? null,
      deadline_date:
        input.deadlineDate !== undefined
          ? normalizeOptionalDate(input.deadlineDate)
          : (existing as any).deadlineDate ?? null,
      focal_point:
        input.focalPoint !== undefined
          ? normalizeOptionalText(input.focalPoint)
          : (existing as any).focalPoint ?? null,
      roadmap_sheet_number:
        input.roadmapSheetNumber !== undefined
          ? normalizeOptionalText(input.roadmapSheetNumber)
          : (existing as any).roadmapSheetNumber ?? null
    };

    const { data, error } = await (client
      .from("dossiers")
      .update(payload as any) as any)
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
      .from("contrat")
      .update({ dossier_id: null } as any)
      .eq("workspace_id", workspaceId)
      .eq("dossier_id", id)
      .is("deleted_at", null)
      .select("id_contrat");
    if (detachError) {
      throw new Error("Impossible de dissocier les contrats du dossier.");
    }

    const { error: deleteError } = await client
      .from("dossiers")
      .update({ deleted_at: new Date().toISOString() } as any)
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
      .from("contrat")
      .select("*, identification!inner(*)", { count: "exact" })
      .eq("workspace_id", params.workspaceId)
      .is("deleted_at", null);

    if (params.onlyMine && params.userId) {
      query = query.eq("created_by", params.userId);
    }

    if (params.query) {
      const escaped = params.query.replace(/,/g, " ");
      query = query.or(`titre.ilike.%${escaped}%,lieu_affectation.ilike.%${escaped}%,nif.ilike.%${escaped}%`);
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
      if (params.sort === "name_asc") {
        filteredItems.sort((a,b) => a.lastName.localeCompare(b.lastName));
      } else if (params.sort === "name_desc") {
        filteredItems.sort((a,b) => b.lastName.localeCompare(a.lastName));
      }
      
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
      console.error(error);
      throw new Error("Impossible de charger les contrats.");
    }
    
    let items = data.map(mapContract);
    if (params.sort === "name_asc") {
        items.sort((a,b) => a.lastName.localeCompare(b.lastName));
    } else if (params.sort === "name_desc") {
        items.sort((a,b) => b.lastName.localeCompare(a.lastName));
    }

    return {
      items,
      total: count ?? data.length,
      page,
      pageSize
    };
  }

  async getById(id: string): Promise<Contract | null> {
    const client = getSupabaseClient();
    const { data, error } = await client
      .from("contrat")
      .select("*, identification(*)")
      .eq("id_contrat", id)
      .is("deleted_at", null)
      .single();
    if (error || !data) return null;
    return mapContract(data);
  }

  async getByIds(ids: string[], workspaceId: string): Promise<Contract[]> {
    const client = getSupabaseClient();
    const { data, error } = await client
      .from("contrat")
      .select("*, identification(*)")
      .eq("workspace_id", workspaceId)
      .in("id_contrat", ids)
      .is("deleted_at", null);
    if (error || !data) {
      throw new Error("Impossible de charger les contrats sélectionnés.");
    }
    return data.map(mapContract);
  }

  async create(input: CreateContractInput): Promise<Contract> {
    const client = getSupabaseClient();
    const payload = {
      id_contrat: crypto.randomUUID(),
      workspace_id: input.workspaceId,
      dossier_id: input.dossierId || null,
      nif: input.applicantId || input.nif || "",
      status: input.status,
      titre: input.position,
      lieu_affectation: input.assignment,
      salaire_en_chiffre: input.salaryNumber,
      salaire: input.salaryText,
      duree_contrat: input.durationMonths || 12,
      annee_fiscale: getStoredFiscalYear(),
      historique_saisie: "[]",
      created_by: input.createdBy
    };

    const { data, error } = await (client
      .from("contrat")
      .insert(payload as any) as any)
      .select("*, identification(*)")
      .single();

    if (error || !data) {
      throw new Error("Impossible de créer le contrat.");
    }
    return mapContract(data);
  }

  async update(input: UpdateContractInput): Promise<Contract> {
    const client = getSupabaseClient();
    const payload: Record<string, any> = {};
    if (input.status !== undefined) payload.status = input.status;
    if (input.position !== undefined) payload.titre = input.position;
    if (input.assignment !== undefined) payload.lieu_affectation = input.assignment;
    if (input.salaryNumber !== undefined) payload.salaire_en_chiffre = input.salaryNumber;
    if (input.salaryText !== undefined) payload.salaire = input.salaryText;
    if (input.durationMonths !== undefined) payload.duree_contrat = input.durationMonths;
    if (input.dossierId !== undefined) payload.dossier_id = input.dossierId;
    if (input.applicantId !== undefined || input.nif !== undefined) {
      payload.nif = input.applicantId || input.nif || "";
    }
    if (input.commentaire !== undefined) payload.commentaire = input.commentaire;

    const { data, error } = await (client
      .from("contrat")
      .update(payload as any) as any)
      .eq("id_contrat", input.id)
      .select("*, identification(*)")
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
      .from("contrat")
      .update({ dossier_id: dossierId } as any)
      .eq("workspace_id", workspaceId)
      .in("id_contrat", contractIds)
      .is("deleted_at", null)
      .select("id_contrat");

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
      .from("contrat")
      .update({ status } as any)
      .eq("workspace_id", workspaceId)
      .in("id_contrat", contractIds)
      .is("deleted_at", null)
      .select("id_contrat");

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
      .from("contrat")
      .update({ duree_contrat: durationMonths } as any)
      .eq("workspace_id", workspaceId)
      .in("id_contrat", contractIds)
      .is("deleted_at", null)
      .select("id_contrat");

    if (error) {
      throw new Error("Impossible de modifier la durée des contrats.");
    }

    return data?.length ?? 0;
  }

  async softDelete(id: string, workspaceId: string): Promise<void> {
    const client = getSupabaseClient();
    const { error } = await client
      .from("contrat")
      .update({ deleted_at: new Date().toISOString() } as any)
      .eq("id_contrat", id)
      .eq("workspace_id", workspaceId);
    if (error) {
      throw new Error("Impossible de supprimer le contrat.");
    }
  }
}

class SupabasePrintJobRepository implements PrintJobRepository {
  async create(workspaceId: string, contractIds: string[]): Promise<ContractPrintJob> {
    const client = getSupabaseClient();
    const id = crypto.randomUUID();
    const { data, error } = await (client
      .from("contract_print_jobs")
      .insert({ 
        id, 
        workspace_id: workspaceId, 
        contract_ids_json: JSON.stringify(contractIds) 
      } as any) as any)
      .select("*")
      .single();
    if (error || !data) {
      throw new Error("Impossible de créer l'historique d'impression.");
    }
    const ids = typeof data.contract_ids_json === 'string' ? JSON.parse(data.contract_ids_json) : [];
    return {
      id: data.id,
      workspaceId: data.workspace_id,
      contractIds: ids,
      createdAt: data.created_at,
      printedAt: data.printed_at
    };
  }
}

class SupabaseAutocompleteRepository implements AutocompleteRepository {
  private async getByType(workspaceId: string, type: string): Promise<any[]> {
    const client = getSupabaseClient();
    const { data, error } = await client
      .from("autocompletion")
      .select("*")
      .eq("workspace_id", workspaceId)
      .eq("type", type)
      .order("order_index", { ascending: true });
    if (error) return [];
    return data || [];
  }

  async getAddresses(workspaceId: string): Promise<AddressSuggestion[]> {
    const data = await this.getByType(workspaceId, "address");
    return data.map(r => ({ 
      id: r.id, 
      label: r.label, 
      prefix: r.prefix,
      labelFeminine: r.label_feminine,
      order: r.order_index 
    }));
  }

  async getPositions(workspaceId: string): Promise<PositionSuggestion[]> {
    const data = await this.getByType(workspaceId, "position");
    return data.map(r => {
      return { 
        id: r.id, 
        label: r.label, 
        prefix: r.prefix,
        labelFeminine: r.label_feminine,
        salaries: r.salaries || [], 
        order: r.order_index 
      };
    });
  }

  async getInstitutions(workspaceId: string): Promise<InstitutionSuggestion[]> {
    const data = await this.getByType(workspaceId, "institution");
    return data.map(r => ({ 
      id: r.id, 
      label: r.label, 
      prefix: r.prefix,
      labelFeminine: r.label_feminine,
      addressKeywords: typeof r.address_keywords === 'string' ? JSON.parse(r.address_keywords) : (r.address_keywords || []), 
      order: r.order_index 
    }));
  }

  async addAddress(workspaceId: string, label: string, createdBy?: string): Promise<AddressSuggestion> {
    const client = getSupabaseClient();
    const id = crypto.randomUUID();
    const payload = { id, workspace_id: workspaceId, type: "address", label, order_index: 0, created_by: createdBy };
    await (client.from("autocompletion").insert(payload as any) as any);
    return { id, label, order: 0 };
  }

  async updateAddress(id: string, label: string, prefix?: string | null, labelFeminine?: string | null): Promise<void> {
    const client = getSupabaseClient();
    await (client.from("autocompletion").update({ label, prefix, label_feminine: labelFeminine } as any).eq("id", id) as any);
  }

  async deleteAddress(id: string): Promise<void> {
    const client = getSupabaseClient();
    await (client.from("autocompletion").delete().eq("id", id) as any);
  }

  async addPosition(workspaceId: string, label: string, salaries: number[], createdBy?: string): Promise<PositionSuggestion> {
    const client = getSupabaseClient();
    const id = crypto.randomUUID();
    const payload = { 
      id, 
      workspace_id: workspaceId, 
      type: "position", 
      label, 
      salaries,
      order_index: 0, 
      created_by: createdBy 
    };
    await (client.from("autocompletion").insert(payload as any) as any);
    return { id, label, salaries, order: 0 };
  }

  async updatePosition(id: string, label: string, salaries: number[], prefix?: string | null, labelFeminine?: string | null): Promise<void> {
    const client = getSupabaseClient();
    await (client.from("autocompletion").update({ 
      label, 
      salaries,
      prefix,
      label_feminine: labelFeminine
    } as any).eq("id", id) as any);
  }

  async deletePosition(id: string): Promise<void> {
    const client = getSupabaseClient();
    await (client.from("autocompletion").delete().eq("id", id) as any);
  }

  async addInstitution(workspaceId: string, label: string, addressKeywords: string[], createdBy?: string): Promise<InstitutionSuggestion> {
    const client = getSupabaseClient();
    const id = crypto.randomUUID();
    const payload = { 
      id, 
      workspace_id: workspaceId, 
      type: "institution", 
      label, 
      address_keywords: JSON.stringify(addressKeywords),
      order_index: 0,
      created_by: createdBy
    };
    await (client.from("autocompletion").insert(payload as any) as any);
    return { id, label, addressKeywords, order: 0 };
  }

  async updateInstitution(id: string, label: string, addressKeywords: string[], prefix?: string | null, labelFeminine?: string | null): Promise<void> {
    const client = getSupabaseClient();
    await (client.from("autocompletion").update({ 
      label, 
      address_keywords: JSON.stringify(addressKeywords),
      prefix,
      label_feminine: labelFeminine
    } as any).eq("id", id) as any);
  }

  async deleteInstitution(id: string): Promise<void> {
    const client = getSupabaseClient();
    await (client.from("autocompletion").delete().eq("id", id) as any);
  }
}

export function createSupabaseProvider(): DataProvider {
  return {
    applicants: new SupabaseApplicantRepository(),
    dossiers: new SupabaseDossierRepository(),
    contracts: new SupabaseContractRepository(),
    printJobs: new SupabasePrintJobRepository(),
    suggestions: new SupabaseAutocompleteRepository()
  };
}
