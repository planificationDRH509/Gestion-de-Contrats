import { outboxKeys } from "../local/outboxDependencies";
import { setOutboxError } from "../local/localOutbox";
import { assertNoFiscalYearDuplicate } from "../contractIdentity";
import { readCachedContracts } from "../local/localContractRepository";
import { ApplicantRepository } from "../repositories/ApplicantRepository";
import { ContractRepository } from "../repositories/ContractRepository";
import { DossierRepository } from "../repositories/DossierRepository";
import { PrintJobRepository } from "../repositories/PrintJobRepository";
import { AutocompleteRepository } from "../repositories/AutocompleteRepository";
import { CreateTagInput, TagRepository } from "../repositories/TagRepository";
import {
  AddressSuggestion,
  PositionSuggestion,
  InstitutionSuggestion,
  cacheSuggestions
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
  Tag,
  UpdateContractInput,
  UpdateDossierInput,
  UpsertApplicantInput
} from "../types";
import { DataProvider } from "../dataProvider";
import { formatFirstName, formatLastName } from "../../lib/format";
import { sortContracts } from "../../lib/contractSorting";
import { getSupabaseClient } from "./supabaseClient";
import { LocalApplicantRepository } from "../local/localApplicantRepository";
import { LocalContractRepository } from "../local/localContractRepository";
import { LocalDossierRepository } from "../local/localDossierRepository";
import { LocalTagRepository } from "../local/localTagRepository";
import { LocalPrintJobRepository } from "../local/localPrintJobRepository";
import { SqliteAutocompleteRepository } from "../local/sqliteAutocompleteRepository";
import {
  cacheApplicant,
  cacheApplicants,
  cacheContract,
  cacheContracts,
  cacheDossier,
  cacheDossiers,
  cacheTag,
  cacheTags,
  deleteApplicantOffline,
  getPendingContractIds,
  getPendingOutbox,
  getPendingOutboxCount,
  getWorkspaceCacheCounts,
  getWorkspaceSyncMetadata,
  isOfflineFailure,
  replaceLocalApplicantId,
  replaceLocalDossierId,
  replaceLocalTagId,
  replaceWorkspaceCache,
  removeOutboxItem,
  setWorkspaceSyncMetadata,
  upsertApplicantOffline
} from "../local/offlineStore";
import {
  normalizeDossierName,
  normalizeDossierStatus,
  normalizeNonNegativeInteger,
  normalizeOptionalDate,
  normalizeOptionalText
} from "../../lib/dossier";
import { matchesContractDateFilter } from "../../lib/contractDateFilters";
import { getStoredFiscalYear } from "../../features/settings/settingsApi";
import { matchesContractSearch } from "../../lib/personSearch";
import {
  appendContractAuditEntry,
  buildContractAuditChanges,
  createContractAuditHistory,
  getStoredAuditActor,
  inferAuditAction,
  parseContractAudit,
  serializeContractAudit
} from "../../lib/contractAudit";
import { buildApplicantInsertPayload } from "./applicantPayload";
import { createId } from "../../lib/uuid";
import { fetchAllPages } from "./fetchAllPages";
import { downloadContractLists, syncQueuedList } from "./listSync";

function repositoryError(message: string, cause?: unknown): Error {
  const error = new Error(message) as Error & { cause?: unknown };
  error.cause = cause;
  return error;
}

function chunksOf<T>(items: T[], size: number): T[][] {
  const chunks: T[][] = [];
  for (let index = 0; index < items.length; index += size) {
    chunks.push(items.slice(index, index + size));
  }
  return chunks;
}

function applicantImportError(cause: unknown): Error {
  const details =
    cause && typeof cause === "object"
      ? ["message", "details", "hint"]
          .map((key) => (cause as Record<string, unknown>)[key])
          .filter((value): value is string => typeof value === "string")
          .join(" ")
      : "";
  const duplicateValue = details.match(/Key \((nif|ninu)\)=\(([^)]+)\)/i);
  const field = duplicateValue?.[1]?.toUpperCase();
  const value = duplicateValue?.[2];

  if (field === "NINU") {
    return repositoryError(
      `Conflit d'identification : le NINU${value ? ` ${value}` : ""} existe déjà dans la base pour un autre NIF.`,
      cause
    );
  }
  if (field === "NIF" || /duplicate key|unique constraint|23505/i.test(details)) {
    return repositoryError(
      `Conflit d'identification : le ${field ?? "NIF ou NINU"}${value ? ` ${value}` : ""} existe déjà dans la base.`,
      cause
    );
  }

  return repositoryError("Impossible d'enregistrer les fiches d'identification importées.", cause);
}

function mapApplicant(row: any): Applicant {
  return {
    id: row.nif,
    workspaceId: row.workspace_id,
    gender: (row.sexe as Applicant["gender"]) || "Homme",
    firstName: row.prenom,
    lastName: row.nom,
    nif: row.nif,
    ninu: row.ninu,
    phone: row.telephone,
    address: row.adresse,
    createdAt: row.created_at,
    updatedAt: row.updated_at || row.created_at,
    remoteUpdatedAt: row.updated_at ?? null,
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
    annee_fiscale: row.annee_fiscale || null,
    createdAt: row.created_at,
    updatedAt: row.updated_at || row.created_at,
    remoteUpdatedAt: row.updated_at ?? null,
    deletedAt: row.deleted_at || null,
    createdBy: row.created_by,
    commentaire: row.commentaire || null,
    auditHistory: parseContractAudit(row.historique_saisie, {
      createdAt: row.created_at,
      createdBy: {
        id: row.created_by || null,
        name: row.created_by || "Utilisateur inconnu"
      }
    }),
    tags: Array.isArray(row.contract_tags)
      ? row.contract_tags.map((ct: any) => ct.tags).filter(Boolean).map(mapTag)
      : undefined
  };
}

function mapTag(row: any): Tag {
  return {
    id: row.id,
    workspaceId: row.workspace_id,
    name: row.name,
    color: row.color || "#64748b",
    createdAt: row.created_at,
    updatedAt: row.updated_at || row.created_at,
    deletedAt: row.deleted_at || null,
    createdBy: row.created_by || null
  };
}

function mapDossier(row: any): Dossier {
  return {
    id: row.id,
    workspaceId: row.workspace_id,
    name: row.name,
    status: normalizeDossierStatus(row.status),
    isEphemeral: row.is_ephemeral,
    priority: row.priority as Dossier["priority"],
    contractTargetCount: normalizeNonNegativeInteger(row.contract_target_count),
    comment: row.comment,
    deadlineDate: row.deadline_date,
    focalPoint: row.focal_point,
    roadmapSheetNumber: row.roadmap_sheet_number,
    defaultDurationMonths: row.default_duration_months,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    deletedAt: row.deleted_at,
    createdBy: row.created_by
  };
}

// Only acknowledge a replay when the persisted contract values agree.
function sameQueuedContract(remote: Contract, local: Contract): boolean {
  const fields = ["workspaceId", "applicantId", "dossierId", "status", "position",
    "assignment", "salaryNumber", "salaryText", "durationMonths", "annee_fiscale",
    "commentaire", "createdBy"] as const;
  return !remote.deletedAt && fields.every((field) => (remote[field] || null) === (local[field] || null));
}

class SupabaseApplicantRepository implements ApplicantRepository {
  async syncOffline(input: UpsertApplicantInput & { baseApplicant?: Applicant | null }): Promise<Applicant> {
    const nif = (input.nif || input.id || "").trim();
    if (!nif) throw new Error("NIF obligatoire pour synchroniser le postulant.");
    const matches = await this.findManyByNifOrNinu(input.workspaceId, [nif], input.ninu ? [input.ninu] : []);
    const existing = matches.find((applicant) => applicant.nif === nif);
    const conflict = () => new Error(`Conflit d'identification pour le NIF ${nif} : les informations NIF/NINU ou personnelles diffèrent du serveur. Corrigez la fiche d'identification puis relancez la synchronisation. Les données locales sont conservées.`);
    if (matches.some((applicant) => applicant.nif !== nif)) throw conflict();
    if (existing) {
      if (existing.deletedAt) throw conflict();
      const desired = buildApplicantInsertPayload(input, formatFirstName(input.firstName), formatLastName(input.lastName));
      const fields = { prenom: "firstName", nom: "lastName", sexe: "gender", ninu: "ninu", telephone: "phone", adresse: "address" } as const;
      const normalize = (value: unknown) => String(value ?? "").trim().replace(/\s+/g, " ").toLocaleLowerCase("fr");
      const changes: Record<string, unknown> = {};
      for (const [column, field] of Object.entries(fields)) {
        const next = desired[column as keyof typeof desired];
        // Match online upsert semantics: absent optional values preserve remote data.
        if (next === undefined || (column !== "telephone" && !next)) continue;
        if (normalize(next) === normalize(existing[field])) continue;
        if (!input.baseApplicant || normalize(existing[field]) !== normalize(input.baseApplicant[field])) throw conflict();
        changes[column] = next;
      }
      if (Object.keys(changes).length === 0) return existing;
      let update = getSupabaseClient().from("identification")
        .update({ ...changes, updated_at: new Date().toISOString() } as any)
        .eq("workspace_id", input.workspaceId).eq("nif", nif).is("deleted_at", null);
      update = existing.remoteUpdatedAt === null ? update.is("updated_at", null)
        : update.eq("updated_at", existing.remoteUpdatedAt ?? existing.updatedAt);
      const { data, error } = await update.select("*").maybeSingle();
      if (error) throw repositoryError("Impossible de synchroniser la fiche d’identification.", error);
      if (!data) throw conflict();
      return mapApplicant(data);
    }
    // Insert only: a concurrent creation is a conflict, never an implicit UPDATE.
    const { data, error } = await getSupabaseClient().from("identification")
      .insert(buildApplicantInsertPayload(input, formatFirstName(input.firstName), formatLastName(input.lastName)) as any)
      .select("*").single();
    if (error || !data) throw applicantImportError(error);
    return mapApplicant(data);
  }

  async list(workspaceId: string): Promise<Applicant[]> {
    const client = getSupabaseClient();
    const query = client.from("identification").select("*", { count: "exact" })
      .eq("workspace_id", workspaceId).is("deleted_at", null)
      .order("created_at", { ascending: false })
      .order("nif", { ascending: true });
    const data = await fetchAllPages(async (from, to) => {
      const { data, error, count } = await query.range(from, to);
      if (error || !data) throw repositoryError("Impossible de charger la base d’identification.", error);
      return { items: data, total: count };
    });
    return data.map(mapApplicant);
  }

  async getById(id: string): Promise<Applicant | null> {
    const client = getSupabaseClient();
    const { data, error } = await client
      .from("identification")
      .select("*")
      .eq("nif", id)
      .is("deleted_at", null)
      .maybeSingle();
    if (error) throw repositoryError("Impossible de charger le postulant.", error);
    if (!data) return null;
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
      .eq("workspace_id", workspaceId)
      .is("deleted_at", null);

    if (normalizedNif && normalizedNinu) {
      query = query.or(`nif.eq.${normalizedNif},ninu.eq.${normalizedNinu}`);
    } else if (normalizedNif) {
      query = query.eq("nif", normalizedNif);
    } else if (normalizedNinu) {
      query = query.eq("ninu", normalizedNinu);
    }

    const { data, error } = await query.limit(1).maybeSingle();
    if (error) throw repositoryError("Impossible de rechercher le postulant.", error);
    if (!data) return null;
    return mapApplicant(data);
  }

  async findManyByNifOrNinu(
    workspaceId: string,
    nifs: string[],
    ninus: string[]
  ): Promise<Applicant[]> {
    const client = getSupabaseClient();
    const uniqueNifs = Array.from(new Set(nifs.map((value) => value.trim()).filter(Boolean)));
    const uniqueNinus = Array.from(new Set(ninus.map((value) => value.trim()).filter(Boolean)));
    const queryBatches: Array<PromiseLike<{ data: any[] | null; error: any }>> = [];

    for (const values of chunksOf(uniqueNifs, 200)) {
      queryBatches.push(
        client
          .from("identification")
          .select("*")
          .eq("workspace_id", workspaceId)
          .in("nif", values)
      );
    }
    for (const values of chunksOf(uniqueNinus, 200)) {
      queryBatches.push(
        client
          .from("identification")
          .select("*")
          .eq("workspace_id", workspaceId)
          .in("ninu", values)
      );
    }

    const matches = new Map<string, Applicant>();
    for (const { data, error } of await Promise.all(queryBatches)) {
      if (error || !data) {
        throw repositoryError("Impossible de vérifier les NIF et NINU importés.", error);
      }
      data.map(mapApplicant).forEach((applicant) => matches.set(applicant.id, applicant));
    }
    return Array.from(matches.values());
  }

  async upsert(input: UpsertApplicantInput): Promise<Applicant> {
    const client = getSupabaseClient();
    const nif = (input.nif || input.id || "").trim();
    const existingNif = (input.id || nif).trim();
    if (!nif) throw new Error("NIF obligatoire pour enregistrer un postulant.");

    const formattedFirstName = formatFirstName(input.firstName);
    const formattedLastName  = formatLastName(input.lastName);

    // ── 1. Check if the record already exists ─────────────────────────────
    const { data: existing, error: existingError } = await client
      .from("identification")
      .select("*")
      .eq("nif", existingNif)
      .maybeSingle();
    if (existingError) {
      throw repositoryError("Impossible de vérifier le postulant.", existingError);
    }

    if (!existing) {
      // ── 2a. NIF not found → INSERT ────────────────────────────────────
      const payload = buildApplicantInsertPayload(
        input,
        formattedFirstName,
        formattedLastName
      );

      const { data, error } = await (client
        .from("identification")
        .insert(payload as any) as any)
        .select("*")
        .single();

      if (error || !data) {
        throw repositoryError("Impossible d'enregistrer le postulant.", error);
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
    if (input.phone !== undefined) {
      const phone = input.phone?.trim() || null;
      if (phone !== (existing.telephone || null)) {
        changes.telephone = phone;
      }
    }
    if (input.address && input.address !== existing.adresse) {
      changes.adresse = input.address;
    }
    if (nif !== existing.nif) {
      changes.nif = nif;
    }

    if (Object.keys(changes).length === 0) {
      // Nothing changed — return existing data as-is
      return mapApplicant(existing);
    }

    changes.updated_at = new Date().toISOString();

    const { data: updated, error: updateError } = await (client
      .from("identification")
      .update(changes as any) as any)
      .eq("nif", existingNif)
      .eq("workspace_id", input.workspaceId)
      .select("*")
      .single();

    if (updateError || !updated) {
      throw repositoryError("Impossible de mettre à jour le postulant.", updateError);
    }
    return mapApplicant(updated);
  }

  async upsertMany(inputs: UpsertApplicantInput[]): Promise<Applicant[]> {
    if (inputs.length === 0) return [];

    const client = getSupabaseClient();
    const timestamp = new Date().toISOString();
    const includesPhone = inputs.some((input) => input.phone !== undefined);
    const payloads = inputs.map((input) => ({
      nif: (input.nif || input.id || "").trim(),
      workspace_id: input.workspaceId,
      sexe: input.gender,
      prenom: formatFirstName(input.firstName),
      nom: formatLastName(input.lastName),
      ninu: input.ninu || null,
      ...(includesPhone ? { telephone: input.phone?.trim() || null } : {}),
      adresse: input.address,
      updated_at: timestamp,
      deleted_at: null
    }));

    if (payloads.some((payload) => !payload.nif)) {
      throw new Error("NIF obligatoire pour enregistrer un postulant.");
    }

    const { data, error } = await (client
      .from("identification")
      .upsert(payloads as any, { onConflict: "nif" }) as any)
      .select("*");

    if (error || !data) throw applicantImportError(error);
    return (Array.isArray(data) ? data : [data]).map(mapApplicant);
  }

  async softDelete(id: string, workspaceId: string): Promise<void> {
    const client = getSupabaseClient();
    const { error } = await client
      .from("identification")
      .update({ deleted_at: new Date().toISOString() } as any)
      .eq("nif", id)
      .eq("workspace_id", workspaceId);
    if (error) {
      throw repositoryError("Impossible de supprimer la fiche d'identification.", error);
    }
  }
}

class SupabaseDossierRepository implements DossierRepository {
  async list(workspaceId: string): Promise<Dossier[]> {
    const client = getSupabaseClient();
    const query = client.from("dossiers").select("*", { count: "exact" })
      .eq("workspace_id", workspaceId).is("deleted_at", null)
      .order("created_at", { ascending: false })
      .order("id", { ascending: true });
    const data = await fetchAllPages(async (from, to) => {
      const { data, error, count } = await query.range(from, to);
      if (error || !data) throw repositoryError("Impossible de charger les dossiers.", error);
      return { items: data, total: count };
    });
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
    if (error) throw repositoryError("Impossible de charger le dossier.", error);
    if (!data) return null;
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
      id: (input as CreateDossierInput & { id?: string }).id || crypto.randomUUID(),
      workspace_id: input.workspaceId,
      name: normalizedName,
      status: normalizeDossierStatus(input.status),
      is_ephemeral: input.isEphemeral || false,
      priority: input.priority || "normal",
      contract_target_count: contractTargetCount,
      comment,
      deadline_date: deadlineDate,
      focal_point: focalPoint,
      roadmap_sheet_number: roadmapSheetNumber,
      default_duration_months: input.defaultDurationMonths || null,
      created_by: (input as any).createdBy
    };

    const { data, error } = await (client
      .from("dossiers")
      .insert(payload as any) as any)
      .select("*")
      .single();

    if (error || !data) {
      console.error("Dossier create error:", error);
      throw repositoryError(
        `Impossible de créer le dossier: ${error?.message || "Erreur Supabase"}`,
        error
      );
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
      status:
        input.status !== undefined
          ? normalizeDossierStatus(input.status)
          : normalizeDossierStatus(existing.status),
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
          : (existing as any).roadmapSheetNumber ?? null,
      default_duration_months:
        input.defaultDurationMonths !== undefined
          ? input.defaultDurationMonths
          : existing.defaultDurationMonths ?? null
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
      throw repositoryError("Impossible de mettre à jour le dossier.", error);
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
      throw repositoryError("Impossible de dissocier les contrats du dossier.", detachError);
    }

    const { error: deleteError } = await client
      .from("dossiers")
      .update({ deleted_at: new Date().toISOString() } as any)
      .eq("id", id)
      .eq("workspace_id", workspaceId)
      .is("deleted_at", null);
    if (deleteError) {
      throw repositoryError("Impossible de supprimer le dossier.", deleteError);
    }

    return detachedContracts?.length ?? 0;
  }
}

class SupabaseContractRepository implements ContractRepository {
  private buildInsertPayload(input: CreateContractInput) {
    const timestamp = new Date().toISOString();
    const auditHistory =
      input.auditHistory ??
      createContractAuditHistory(getStoredAuditActor(), timestamp);
    return {
      id_contrat: (input as CreateContractInput & { id?: string }).id || crypto.randomUUID(),
      workspace_id: input.workspaceId,
      dossier_id: input.dossierId || null,
      nif: input.applicantId || input.nif || "",
      status: input.status,
      titre: input.position,
      lieu_affectation: input.assignment,
      salaire_en_chiffre: input.salaryNumber,
      salaire: input.salaryText,
      duree_contrat: input.durationMonths || 12,
      commentaire: input.commentaire || null,
      annee_fiscale: input.annee_fiscale || getStoredFiscalYear(),
      historique_saisie: serializeContractAudit(auditHistory),
      created_by: input.createdBy
    };
  }

  async list(params: ContractListParams): Promise<ContractListResult> {
    const client = getSupabaseClient();
    const page = params.page ?? 1;
    const pageSize = params.pageSize ?? 10;
    const from = (page - 1) * pageSize;
    const to = from + pageSize - 1;
    const hasDateFilter = Boolean(params.dateFilterMode && params.dateFilterMode !== "all");
    const requiresIdentitySorting = params.sort?.startsWith("name_") || params.sort?.startsWith("nif_");
    const requiresClientFiltering =
      hasDateFilter || Boolean(params.query?.trim()) || requiresIdentitySorting;

    let query;
    if (params.tagId) {
      query = client
        .from("contrat")
        .select("*, identification!inner(*), contract_tags!inner(tag_id, tags(*))", { count: "exact" })
        .eq("workspace_id", params.workspaceId)
        .eq("contract_tags.tag_id", params.tagId);
    } else {
      query = client
        .from("contrat")
        .select("*, identification!inner(*), contract_tags(tags(*))", { count: "exact" })
        .eq("workspace_id", params.workspaceId);
    }

    query = params.deletionState === "deleted"
      ? query.not("deleted_at", "is", null)
      : query.is("deleted_at", null);

    if (params.onlyMine && params.userId) {
      query = query.eq("created_by", params.userId);
    }

    if (params.status) {
      query = query.eq("status", params.status);
    }

    if (params.assignments && params.assignments.length > 0) {
      query = query.in("lieu_affectation", params.assignments);
    }

    if (params.positions && params.positions.length > 0) {
      query = query.in("titre", params.positions);
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
    // Keep page boundaries deterministic when several imports share a timestamp.
    query = query.order("id_contrat", { ascending: true });

    if (params.all || pageSize > 1000 || requiresClientFiltering) {
      const data = await fetchAllPages(async (rangeFrom, rangeTo) => {
        const { data: pageData, error, count } = await query.range(rangeFrom, rangeTo);
        if (error || !pageData) {
          throw repositoryError("Impossible de charger les contrats.", error);
        }
        return { items: pageData, total: count };
      });

      const filteredItems = data
        .map(mapContract)
        .filter((contract) => !params.query?.trim() || matchesContractSearch(contract, params.query))
        .filter((contract) =>
          !hasDateFilter || matchesContractDateFilter(
            contract,
            params.dateFilterMode,
            {
              dayDateInput: params.dateFilterDate,
              rangeStartInput: params.dateFilterStart,
              rangeEndInput: params.dateFilterEnd
            }
          )
        );
      const sortedItems = sortContracts(filteredItems, params.sort);
      
      const pagedItems = params.all ? sortedItems : sortedItems.slice(from, to + 1);

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
      throw repositoryError("Impossible de charger les contrats.", error);
    }
    
    const items = data.map(mapContract);

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
      .select("*, identification(*), contract_tags(tags(*))")
      .eq("id_contrat", id)
      .is("deleted_at", null)
      .maybeSingle();
    if (error) throw repositoryError("Impossible de charger le contrat.", error);
    if (!data) return null;
    return mapContract(data);
  }

  async getByIds(ids: string[], workspaceId: string): Promise<Contract[]> {
    const client = getSupabaseClient();
    const { data, error } = await client
      .from("contrat")
      .select("*, identification(*), contract_tags(tags(*))")
      .eq("workspace_id", workspaceId)
      .in("id_contrat", ids)
      .is("deleted_at", null);
    if (error || !data) {
      throw repositoryError("Impossible de charger les contrats sélectionnés.", error);
    }
    return data.map(mapContract);
  }

  async checkFiscalYearDuplicate(input: CreateContractInput): Promise<void> {
    if (!(input.nif || input.applicantId)) return;
    const { data, error } = await getSupabaseClient().from("contrat")
      .select("*").eq("workspace_id", input.workspaceId)
      .eq("nif", input.applicantId || input.nif || "").is("deleted_at", null);
    if (error || !data) throw repositoryError("Impossible de vérifier les doublons avant synchronisation.", error);
    assertNoFiscalYearDuplicate(input, data.map(mapContract));
  }

  async create(input: CreateContractInput): Promise<Contract> {
    const created = await this.createMany([input]);
    const contract = created[0];
    if (!contract) {
      throw new Error("Impossible de créer le contrat.");
    }
    return contract;
  }

  async createMany(inputs: CreateContractInput[]): Promise<Contract[]> {
    if (inputs.length === 0) {
      return [];
    }

    const client = getSupabaseClient();
    const payloads = inputs.map((input) => this.buildInsertPayload(input));
    const { data, error } = await (client
      .from("contrat")
      .insert(payloads as any) as any)
      .select("*, identification(*), contract_tags(tags(*))");

    if (error || !data) {
      throw repositoryError("Impossible de créer les contrats.", error);
    }

    const rows = Array.isArray(data) ? data : [data];
    return rows.map(mapContract);
  }

  async update(input: UpdateContractInput): Promise<Contract> {
    const client = getSupabaseClient();
    const existing = await this.getById(input.id);
    if (!existing) {
      throw new Error("Contrat introuvable.");
    }
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

    const nextValues: Partial<Contract> = {
      ...input,
      dossierId:
        input.dossierId !== undefined ? input.dossierId : existing.dossierId,
      commentaire:
        input.commentaire !== undefined ? input.commentaire : existing.commentaire
    };
    const changes = buildContractAuditChanges(existing, nextValues);
    const suppliedHistory = input.auditHistory;
    const shouldUseSuppliedHistory =
      suppliedHistory &&
      suppliedHistory.entries.length >= (existing.auditHistory?.entries.length ?? 0);
    const auditHistory = shouldUseSuppliedHistory
      ? suppliedHistory
      : appendContractAuditEntry(existing.auditHistory, {
          action: inferAuditAction(changes),
          changes
        });
    payload.historique_saisie = serializeContractAudit(auditHistory);

    const { data, error } = await (client
      .from("contrat")
      .update(payload as any) as any)
      .eq("id_contrat", input.id)
      .select("*, identification(*), contract_tags(tags(*))")
      .single();

    if (error || !data) {
      throw repositoryError("Impossible de mettre à jour le contrat.", error);
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

    return this.updateManyWithAudit(
      workspaceId,
      contractIds,
      "dossier",
      () => ({ dossierId }),
      () => ({ dossier_id: dossierId }),
      "Impossible d'affecter les contrats au dossier."
    );
  }

  async syncOfflineStatus(
    workspaceId: string,
    id: string,
    status: ContractStatus,
    previousStatus?: ContractStatus,
    changedAt?: string
  ): Promise<Contract> {
    const existing = await this.getById(id);
    if (!existing || existing.workspaceId !== workspaceId) {
      throw new Error(`Conflit d’état : le contrat ${id} a été supprimé ou n’est plus accessible. Le changement local est conservé.`);
    }
    // A lost response may mean this exact transition already reached the server.
    if (existing.status === status) return existing;
    if (!previousStatus || existing.status !== previousStatus) {
      throw new Error(`Conflit d’état pour le contrat ${id} : état serveur « ${existing.status} », état local « ${status} ». Vérifiez le contrat avant de relancer la synchronisation. Le changement local est conservé.`);
    }
    const auditHistory = appendContractAuditEntry(existing.auditHistory, {
      action: "status",
      changes: buildContractAuditChanges(existing, { status }),
      at: changedAt
    });
    let update = getSupabaseClient().from("contrat")
      .update({ status, historique_saisie: serializeContractAudit(auditHistory), updated_at: new Date().toISOString() } as any)
      .eq("workspace_id", workspaceId)
      .eq("id_contrat", id)
      .eq("status", previousStatus)
      .is("deleted_at", null);
    update = existing.remoteUpdatedAt === null ? update.is("updated_at", null)
      : update.eq("updated_at", existing.remoteUpdatedAt ?? existing.updatedAt);
    const { data, error } = await update.select("*, identification(*), contract_tags(tags(*))").maybeSingle();
    if (error) throw repositoryError("Impossible de synchroniser l’état du contrat.", error);
    if (!data) {
      throw new Error(`Conflit d’état pour le contrat ${id} : le contrat a changé pendant la synchronisation. Le changement local est conservé.`);
    }
    return mapContract(data);
  }

  async updateStatus(
    workspaceId: string,
    contractIds: string[],
    status: ContractStatus
  ): Promise<number> {
    if (contractIds.length === 0) {
      return 0;
    }

    return this.updateManyWithAudit(
      workspaceId,
      contractIds,
      "status",
      () => ({ status }),
      () => ({ status }),
      "Impossible de modifier l'état des contrats."
    );
  }

  async updateDuration(
    workspaceId: string,
    contractIds: string[],
    durationMonths: number
  ): Promise<number> {
    if (contractIds.length === 0) {
      return 0;
    }

    return this.updateManyWithAudit(
      workspaceId,
      contractIds,
      "duration",
      () => ({ durationMonths }),
      () => ({ duree_contrat: durationMonths }),
      "Impossible de modifier la durée des contrats."
    );
  }

  async softDelete(id: string, workspaceId: string): Promise<void> {
    const client = getSupabaseClient();
    const existing = await this.getById(id);
    const auditHistory = appendContractAuditEntry(existing?.auditHistory, {
      action: "deletion",
      changes: []
    });
    const { error } = await client
      .from("contrat")
      .update({
        deleted_at: new Date().toISOString(),
        historique_saisie: serializeContractAudit(auditHistory)
      } as any)
      .eq("id_contrat", id)
      .eq("workspace_id", workspaceId);
    if (error) {
      throw repositoryError("Impossible de supprimer le contrat.", error);
    }
  }

  private async updateManyWithAudit(
    workspaceId: string,
    contractIds: string[],
    action: "status" | "dossier" | "duration",
    nextValues: (contract: Contract) => Partial<Contract>,
    databasePatch: (contract: Contract) => Record<string, unknown>,
    errorMessage: string
  ): Promise<number> {
    const client = getSupabaseClient();
    const { data, error } = await client
      .from("contrat")
      .select("*, identification(*), contract_tags(tags(*))")
      .eq("workspace_id", workspaceId)
      .in("id_contrat", contractIds)
      .is("deleted_at", null);
    if (error || !data) {
      throw repositoryError(errorMessage, error);
    }

    const contracts = data.map(mapContract);
    await Promise.all(contracts.map(async (contract) => {
      const changes = buildContractAuditChanges(contract, nextValues(contract));
      if (changes.length === 0) return;
      const auditHistory = appendContractAuditEntry(contract.auditHistory, {
        action,
        changes
      });
      const { error: updateError } = await client
        .from("contrat")
        .update({
          ...databasePatch(contract),
          historique_saisie: serializeContractAudit(auditHistory)
        } as any)
        .eq("id_contrat", contract.id)
        .eq("workspace_id", workspaceId);
      if (updateError) {
        throw repositoryError(errorMessage, updateError);
      }
    }));

    return contracts.length;
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
      throw repositoryError("Impossible de créer l'historique d'impression.", error);
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

function normalizeTagName(name: string) {
  return name.trim().replace(/\s+/g, " ");
}

function fallbackTagColor(name: string) {
  let hash = 0;
  for (const char of name) {
    hash = (hash * 31 + char.charCodeAt(0)) % 360;
  }
  return `hsl(${hash}, 70%, 42%)`;
}

class SupabaseTagRepository implements TagRepository {
  async list(workspaceId: string): Promise<Tag[]> {
    const client = getSupabaseClient();
    const query = client.from("tags").select("*", { count: "exact" })
      .eq("workspace_id", workspaceId).is("deleted_at", null)
      .order("name", { ascending: true })
      .order("id", { ascending: true });
    const data = await fetchAllPages(async (from, to) => {
      const { data, error, count } = await query.range(from, to);
      if (error || !data) throw repositoryError("Impossible de charger les tags.", error);
      return { items: data, total: count };
    });
    return data.map(mapTag);
  }

  async create(input: CreateTagInput): Promise<Tag> {
    const client = getSupabaseClient();
    const name = normalizeTagName(input.name);
    if (!name) {
      throw new Error("Le nom du tag est obligatoire.");
    }

    const { data: existing, error: existingError } = await (client
      .from("tags")
      .select("*") as any)
      .eq("workspace_id", input.workspaceId)
      .ilike("name", name)
      .is("deleted_at", null)
      .limit(1)
      .maybeSingle();
    if (existingError) {
      throw repositoryError("Impossible de vérifier le tag.", existingError);
    }
    if (existing) {
      return mapTag(existing);
    }

    const payload = {
      id: (input as CreateTagInput & { id?: string }).id || crypto.randomUUID(),
      workspace_id: input.workspaceId,
      name,
      color: input.color || fallbackTagColor(name),
      created_by: input.createdBy ?? null
    };
    const { data, error } = await (client
      .from("tags")
      .insert(payload as any) as any)
      .select("*")
      .single();

    if (error || !data) {
      throw repositoryError("Impossible de créer le tag.", error);
    }
    return mapTag(data);
  }

  async assignToContract(workspaceId: string, contractId: string, tagId: string): Promise<void> {
    void workspaceId;
    const client = getSupabaseClient();
    const { error } = await (client
      .from("contract_tags")
      .upsert({ contract_id: contractId, tag_id: tagId } as any) as any);

    if (error) {
      throw repositoryError("Impossible d'ajouter le tag au contrat.", error);
    }
  }

  async removeFromContract(workspaceId: string, contractId: string, tagId: string): Promise<void> {
    void workspaceId;
    const client = getSupabaseClient();
    const { error } = await client
      .from("contract_tags")
      .delete()
      .eq("contract_id", contractId)
      .eq("tag_id", tagId);

    if (error) {
      throw repositoryError("Impossible de retirer le tag du contrat.", error);
    }
  }
}

class SupabaseAutocompleteRepository implements AutocompleteRepository {
  private async getByType(workspaceId: string, type: string): Promise<any[]> {
    const client = getSupabaseClient();
    const query = client.from("autocompletion").select("*", { count: "exact" })
      .eq("workspace_id", workspaceId).eq("type", type)
      .order("order_index", { ascending: true }).order("id", { ascending: true });
    return fetchAllPages(async (from, to) => {
      const { data, error, count } = await query.range(from, to);
      if (error || !data) throw repositoryError("Impossible de charger les suggestions.", error);
      return { items: data, total: count };
    });
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
      department: r.department,
      commune: r.commune,
      addressKeywords: typeof r.address_keywords === 'string' ? JSON.parse(r.address_keywords) : (r.address_keywords || []), 
      order: r.order_index 
    }));
  }

  async addAddress(workspaceId: string, label: string, createdBy?: string): Promise<AddressSuggestion> {
    const client = getSupabaseClient();
    const id = crypto.randomUUID();
    const payload = { id, workspace_id: workspaceId, type: "address", label, order_index: 0, created_by: createdBy };
    const { error } = await (client.from("autocompletion").insert(payload as any) as any);
    if (error) throw repositoryError("Impossible d'ajouter l'adresse.", error);
    return { id, label, order: 0 };
  }

  async updateAddress(id: string, label: string, prefix?: string | null, labelFeminine?: string | null): Promise<void> {
    const client = getSupabaseClient();
    const { error } = await (client.from("autocompletion").update({ label, prefix, label_feminine: labelFeminine } as any).eq("id", id) as any);
    if (error) throw repositoryError("Impossible de modifier l'adresse.", error);
  }

  async deleteAddress(id: string): Promise<void> {
    const client = getSupabaseClient();
    const { error } = await (client.from("autocompletion").delete().eq("id", id) as any);
    if (error) throw repositoryError("Impossible de supprimer l'adresse.", error);
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
    const { error } = await (client.from("autocompletion").insert(payload as any) as any);
    if (error) throw repositoryError("Impossible d'ajouter le poste.", error);
    return { id, label, salaries, order: 0 };
  }

  async updatePosition(id: string, label: string, salaries: number[], prefix?: string | null, labelFeminine?: string | null): Promise<void> {
    const client = getSupabaseClient();
    const { error } = await (client.from("autocompletion").update({
      label, 
      salaries,
      prefix,
      label_feminine: labelFeminine
    } as any).eq("id", id) as any);
    if (error) throw repositoryError("Impossible de modifier le poste.", error);
  }

  async deletePosition(id: string): Promise<void> {
    const client = getSupabaseClient();
    const { error } = await (client.from("autocompletion").delete().eq("id", id) as any);
    if (error) throw repositoryError("Impossible de supprimer le poste.", error);
  }

  async addInstitution(
    workspaceId: string,
    label: string,
    addressKeywords: string[],
    createdBy?: string,
    department?: string | null,
    commune?: string | null
  ): Promise<InstitutionSuggestion> {
    const client = getSupabaseClient();
    const id = crypto.randomUUID();
    const payload = { 
      id, 
      workspace_id: workspaceId, 
      type: "institution", 
      label, 
      address_keywords: JSON.stringify(addressKeywords),
      department: department?.trim() || null,
      commune: commune?.trim() || null,
      order_index: 0,
      created_by: createdBy
    };
    const { error } = await (client.from("autocompletion").insert(payload as any) as any);
    if (error) throw repositoryError("Impossible d'ajouter l'affectation.", error);
    return {
      id,
      label,
      department: department?.trim() || null,
      commune: commune?.trim() || null,
      addressKeywords,
      order: 0
    };
  }

  async updateInstitution(
    id: string,
    label: string,
    addressKeywords: string[],
    prefix?: string | null,
    labelFeminine?: string | null,
    department?: string | null,
    commune?: string | null
  ): Promise<void> {
    const client = getSupabaseClient();
    const { error } = await (client.from("autocompletion").update({
      label, 
      address_keywords: JSON.stringify(addressKeywords),
      prefix,
      label_feminine: labelFeminine,
      department: department?.trim() || null,
      commune: commune?.trim() || null
    } as any).eq("id", id) as any);
    if (error) throw repositoryError("Impossible de modifier l'affectation.", error);
  }

  async deleteInstitution(id: string): Promise<void> {
    const client = getSupabaseClient();
    const { error } = await (client.from("autocompletion").delete().eq("id", id) as any);
    if (error) throw repositoryError("Impossible de supprimer l'affectation.", error);
  }
}

class OfflineFirstAutocompleteRepository implements AutocompleteRepository {
  private readonly local = new SqliteAutocompleteRepository();
  private readonly remote = new SupabaseAutocompleteRepository();

  async getAddresses(workspaceId: string): Promise<AddressSuggestion[]> {
    try {
      if (typeof navigator !== "undefined" && !navigator.onLine) throw new TypeError("offline");
      const items = await this.remote.getAddresses(workspaceId);
      cacheSuggestions({ addresses: items });
      return items;
    } catch (error) {
      if (!isOfflineFailure(error)) throw error;
      return this.local.getAddresses(workspaceId);
    }
  }

  async getPositions(workspaceId: string): Promise<PositionSuggestion[]> {
    try {
      if (typeof navigator !== "undefined" && !navigator.onLine) throw new TypeError("offline");
      const items = await this.remote.getPositions(workspaceId);
      cacheSuggestions({ positions: items });
      return items;
    } catch (error) {
      if (!isOfflineFailure(error)) throw error;
      return this.local.getPositions(workspaceId);
    }
  }

  async getInstitutions(workspaceId: string): Promise<InstitutionSuggestion[]> {
    try {
      if (typeof navigator !== "undefined" && !navigator.onLine) throw new TypeError("offline");
      const items = await this.remote.getInstitutions(workspaceId);
      cacheSuggestions({ institutions: items });
      return items;
    } catch (error) {
      if (!isOfflineFailure(error)) throw error;
      return this.local.getInstitutions(workspaceId);
    }
  }

  addAddress(workspaceId: string, label: string, createdBy?: string) {
    return this.remote.addAddress(workspaceId, label, createdBy);
  }
  updateAddress(id: string, label: string, prefix?: string | null, labelFeminine?: string | null) {
    return this.remote.updateAddress(id, label, prefix, labelFeminine);
  }
  deleteAddress(id: string) {
    return this.remote.deleteAddress(id);
  }
  addPosition(workspaceId: string, label: string, salaries: number[], createdBy?: string) {
    return this.remote.addPosition(workspaceId, label, salaries, createdBy);
  }
  updatePosition(id: string, label: string, salaries: number[], prefix?: string | null, labelFeminine?: string | null) {
    return this.remote.updatePosition(id, label, salaries, prefix, labelFeminine);
  }
  deletePosition(id: string) {
    return this.remote.deletePosition(id);
  }
  addInstitution(
    workspaceId: string,
    label: string,
    addressKeywords: string[],
    createdBy?: string,
    department?: string | null,
    commune?: string | null
  ) {
    return this.remote.addInstitution(workspaceId, label, addressKeywords, createdBy, department, commune);
  }
  updateInstitution(
    id: string,
    label: string,
    addressKeywords: string[],
    prefix?: string | null,
    labelFeminine?: string | null,
    department?: string | null,
    commune?: string | null
  ) {
    return this.remote.updateInstitution(
      id,
      label,
      addressKeywords,
      prefix,
      labelFeminine,
      department,
      commune
    );
  }
  deleteInstitution(id: string) {
    return this.remote.deleteInstitution(id);
  }
}

class OfflineFirstPrintJobRepository implements PrintJobRepository {
  private readonly local = new LocalPrintJobRepository();
  private readonly remote = new SupabasePrintJobRepository();

  async create(workspaceId: string, contractIds: string[]): Promise<ContractPrintJob> {
    try {
      if (typeof navigator !== "undefined" && !navigator.onLine) throw new TypeError("offline");
      return await this.remote.create(workspaceId, contractIds);
    } catch (error) {
      if (!isOfflineFailure(error)) throw error;
      return this.local.create(workspaceId, contractIds);
    }
  }
}

export type SupabaseSyncState = {
  isOnline: boolean;
  isSyncing: boolean;
  pendingCount: number;
  lastSyncedAt: string | null;
  lastError: string | null;
  cached: ReturnType<typeof getWorkspaceCacheCounts>;
};

let outboxSyncPromise: Promise<void> | null = null;
let activeSyncOperations = 0;
const workspaceSyncPromises = new Map<string, Promise<boolean>>();
const WORKSPACE_SYNC_MIN_INTERVAL_MS = 5 * 60 * 1000;

function notifySyncState() {
  if (typeof window !== "undefined") {
    window.dispatchEvent(new CustomEvent("contribution-offline-sync"));
  }
}

function beginSyncOperation() {
  activeSyncOperations += 1;
  notifySyncState();
}

function endSyncOperation() {
  activeSyncOperations = Math.max(0, activeSyncOperations - 1);
  notifySyncState();
}

export function getSupabaseSyncState(workspaceId: string): SupabaseSyncState {
  const metadata = getWorkspaceSyncMetadata(workspaceId);
  return {
    isOnline: typeof navigator === "undefined" ? true : navigator.onLine,
    isSyncing: activeSyncOperations > 0,
    pendingCount: getPendingOutboxCount(workspaceId),
    lastSyncedAt: metadata.lastSyncedAt ?? null,
    lastError: metadata.lastError ?? null,
    cached: getWorkspaceCacheCounts(workspaceId)
  };
}

function syncPendingOutbox() {
  if (outboxSyncPromise) return outboxSyncPromise;
  let didBegin = false;

  outboxSyncPromise = (async () => {
    if (typeof navigator !== "undefined" && !navigator.onLine) return;
    beginSyncOperation();
    didBegin = true;

    const applicants = new SupabaseApplicantRepository();
    const contracts = new SupabaseContractRepository();
    const dossiers = new SupabaseDossierRepository();
    const tags = new SupabaseTagRepository();

    const blockedKeys = new Set<string>();
    for (const queued of getPendingOutbox()) {
      const item = getPendingOutbox().find((current) => current.id === queued.id);
      if (!item) continue;
      const keys = outboxKeys(item);
      if (keys.some((key) => blockedKeys.has(key))) {
        keys.forEach((key) => blockedKeys.add(key));
        setOutboxError(item.id, "En attente de la résolution d’une action liée à ce contrat.");
        continue;
      }
      let syncedContract: Contract | undefined;
      try {
        if (typeof navigator !== "undefined" && !navigator.onLine) return;
        if (item.type === "list.operation") {
          await syncQueuedList(item);
        } else if (item.type === "applicant.upsert") {
          const payload = item.payload as unknown as UpsertApplicantInput;
          const applicant = await applicants.syncOffline(payload);
          if (payload.id && payload.id !== applicant.id) {
            replaceLocalApplicantId(item.workspaceId, payload.id, applicant);
          }
          cacheApplicant(applicant);
        } else if (item.type === "applicant.delete") {
          const payload = item.payload as { id?: string };
          if (payload.id) {
            await applicants.softDelete(payload.id, item.workspaceId);
          }
        } else if (item.type === "contract.create") {
          const payload = item.payload as unknown as Contract;
          if (getPendingOutbox().some((pending) => pending.workspaceId === item.workspaceId &&
              pending.type === "applicant.upsert" && (pending.payload.nif === payload.nif || pending.payload.id === payload.applicantId))) {
            keys.filter((key) => key.includes(":contract:")).forEach((key) => blockedKeys.add(key));
            setOutboxError(item.id, "La fiche d’identification doit être synchronisée avant ce contrat.");
            continue;
          }
          const existing = await contracts.getById(payload.id);
          if (existing && !sameQueuedContract(existing, payload)) {
            throw new Error(`Conflit sur le contrat ${payload.id} : une version différente existe sur le serveur. Le contrat local est conservé.`);
          }
          if (!existing) await contracts.checkFiscalYearDuplicate(payload);
          syncedContract = existing ?? await contracts.create(payload);
        } else if (item.type === "contract.update") {
          const payload = item.payload as Partial<UpdateContractInput> & {
            id?: string;
            contractIds?: string[];
            status?: ContractStatus;
            previousStatus?: ContractStatus;
            changedAt?: string;
            durationMonths?: number;
            dossierId?: string | null;
          };
          if (payload.id) {
            syncedContract = await contracts.update(payload as UpdateContractInput);
          } else if (Array.isArray(payload.contractIds) && payload.status) {
            for (const id of payload.contractIds) {
              syncedContract = await contracts.syncOfflineStatus(
                item.workspaceId, id, payload.status, payload.previousStatus, payload.changedAt
              );
            }
          } else if (Array.isArray(payload.contractIds) && typeof payload.durationMonths === "number") {
            await contracts.updateDuration(item.workspaceId, payload.contractIds, payload.durationMonths);
          } else if (Array.isArray(payload.contractIds) && "dossierId" in payload) {
            await contracts.assignToDossier(item.workspaceId, payload.contractIds, payload.dossierId ?? null);
          }
        } else if (item.type === "contract.delete") {
          const payload = item.payload as { id?: string };
          if (payload.id) {
            await contracts.softDelete(payload.id, item.workspaceId);
          }
        } else if (item.type === "dossier.create") {
          const payload = item.payload as unknown as CreateDossierInput & { id?: string };
          const dossier = await dossiers.create(payload);
          if (payload.id && payload.id !== dossier.id) {
            replaceLocalDossierId(item.workspaceId, payload.id, dossier);
          }
          cacheDossier(dossier);
        } else if (item.type === "dossier.update") {
          const payload = item.payload as unknown as UpdateDossierInput;
          const dossier = await dossiers.update(payload);
          cacheDossier(dossier);
        } else if (item.type === "dossier.delete") {
          const payload = item.payload as { id?: string; workspaceId?: string };
          if (payload.id) {
            await dossiers.delete(payload.id, payload.workspaceId ?? item.workspaceId);
          }
        } else if (item.type === "tag.create") {
          const payload = item.payload as unknown as CreateTagInput & { id?: string };
          const tag = await tags.create(payload);
          if (payload.id && payload.id !== tag.id) {
            replaceLocalTagId(item.workspaceId, payload.id, tag);
          }
          cacheTag(tag);
        } else if (item.type === "tag.assign") {
          const payload = item.payload as { contractId?: string; tagId?: string };
          if (payload.contractId && payload.tagId) {
            await tags.assignToContract(item.workspaceId, payload.contractId, payload.tagId);
          }
        } else if (item.type === "tag.remove") {
          const payload = item.payload as { contractId?: string; tagId?: string };
          if (payload.contractId && payload.tagId) {
            await tags.removeFromContract(item.workspaceId, payload.contractId, payload.tagId);
          }
        }
        removeOutboxItem(item.id);
        if (syncedContract) cacheContract(syncedContract);

        setWorkspaceSyncMetadata(item.workspaceId, {
          lastSyncedAt: new Date().toISOString(),
          lastError: getPendingOutbox().find((pending) => pending.workspaceId === item.workspaceId && pending.lastError)?.lastError ?? null
        });
        notifySyncState();
      } catch (error) {
        const message = error instanceof Error ? error.message : "Erreur de synchronisation.";
        setOutboxError(item.id, message);
        setWorkspaceSyncMetadata(item.workspaceId, { lastError: message });
        notifySyncState();
        if (isOfflineFailure(error)) return;
        keys.forEach((key) => blockedKeys.add(key));
        console.error("Impossible de synchroniser une action locale.", error);
      }
    }
  })().finally(() => {
    outboxSyncPromise = null;
    if (didBegin) endSyncOperation();
  });

  return outboxSyncPromise;
}

export function syncSupabaseOutbox() {
  return syncPendingOutbox();
}

/**
 * Downloads the complete workspace dataset for offline use. Automatic calls are
 * throttled because visible queries already refresh their current page.
 */
export function syncSupabaseWorkspace(
  workspaceId: string,
  options: { force?: boolean } = {}
): Promise<boolean> {
  if (!workspaceId || (typeof navigator !== "undefined" && !navigator.onLine)) {
    return Promise.resolve(false);
  }
  const existing = workspaceSyncPromises.get(workspaceId);
  if (existing) return existing;

  const metadata = getWorkspaceSyncMetadata(workspaceId);
  const lastFullSync = metadata.lastFullSyncedAt
    ? new Date(metadata.lastFullSyncedAt).getTime()
    : 0;
  const hasPendingChanges = getPendingOutboxCount(workspaceId) > 0;
  if (
    !options.force &&
    !hasPendingChanges &&
    Number.isFinite(lastFullSync) &&
    Date.now() - lastFullSync < WORKSPACE_SYNC_MIN_INTERVAL_MS
  ) {
    return Promise.resolve(false);
  }

  const syncPromise = (async () => {
    beginSyncOperation();
    try {
      if (typeof navigator !== "undefined" && !navigator.onLine) throw new TypeError("offline");
      await syncPendingOutbox();

      const applicantsRepo = new SupabaseApplicantRepository();
      const contractsRepo = new SupabaseContractRepository();
      const dossiersRepo = new SupabaseDossierRepository();
      const tagsRepo = new SupabaseTagRepository();
      const suggestionsRepo = new SupabaseAutocompleteRepository();

      const [applicants, dossiers, tags] = await Promise.all([
        applicantsRepo.list(workspaceId),
        dossiersRepo.list(workspaceId),
        tagsRepo.list(workspaceId)
      ]);
      try {
        const [addresses, positions, institutions] = await Promise.all([
          suggestionsRepo.getAddresses(workspaceId),
          suggestionsRepo.getPositions(workspaceId),
          suggestionsRepo.getInstitutions(workspaceId)
        ]);
        cacheSuggestions({ addresses, positions, institutions });
      } catch (error) {
        console.warn("Les suggestions n'ont pas pu être actualisées pour le mode hors ligne.", error);
      }

      const { items: contracts } = await contractsRepo.list({
        workspaceId, all: true, sort: "createdAt_desc"
      });

      replaceWorkspaceCache(workspaceId, { applicants, contracts, dossiers, tags });
      await downloadContractLists(workspaceId);
      const syncedAt = new Date().toISOString();
      setWorkspaceSyncMetadata(workspaceId, {
        lastSyncedAt: syncedAt,
        lastFullSyncedAt: syncedAt,
        lastError: getPendingOutboxCount(workspaceId) > 0 ? getWorkspaceSyncMetadata(workspaceId).lastError : null
      });
      return true;
    } catch (error) {
      const message = error instanceof Error ? error.message : "Erreur de synchronisation.";
      setWorkspaceSyncMetadata(workspaceId, { lastError: message });
      throw error;
    } finally {
      workspaceSyncPromises.delete(workspaceId);
      endSyncOperation();
    }
  })();

  workspaceSyncPromises.set(workspaceId, syncPromise);
  return syncPromise;
}

class OfflineFirstApplicantRepository implements ApplicantRepository {
  private readonly local = new LocalApplicantRepository();
  private readonly remote = new SupabaseApplicantRepository();

  async list(workspaceId: string): Promise<Applicant[]> {
    try {
      if (typeof navigator !== "undefined" && !navigator.onLine) throw new TypeError("offline");
      await syncPendingOutbox();
      const applicants = await this.remote.list(workspaceId);
      cacheApplicants(applicants);
      return applicants;
    } catch (error) {
      if (!isOfflineFailure(error)) throw error;
      return this.local.list(workspaceId);
    }
  }

  async getById(id: string): Promise<Applicant | null> {
    try {
      if (typeof navigator !== "undefined" && !navigator.onLine) throw new TypeError("offline");
      const applicant = await this.remote.getById(id);
      if (applicant) cacheApplicant(applicant);
      return applicant;
    } catch (error) {
      if (!isOfflineFailure(error)) throw error;
      return this.local.getById(id);
    }
  }

  async findByNifOrNinu(
    workspaceId: string,
    nif?: string | null,
    ninu?: string | null
  ): Promise<Applicant | null> {
    try {
      if (typeof navigator !== "undefined" && !navigator.onLine) throw new TypeError("offline");
      const applicant = await this.remote.findByNifOrNinu(workspaceId, nif, ninu);
      if (applicant) cacheApplicant(applicant);
      return applicant;
    } catch (error) {
      if (!isOfflineFailure(error)) throw error;
      return this.local.findByNifOrNinu(workspaceId, nif, ninu);
    }
  }

  async findManyByNifOrNinu(
    workspaceId: string,
    nifs: string[],
    ninus: string[]
  ): Promise<Applicant[]> {
    try {
      if (typeof navigator !== "undefined" && !navigator.onLine) throw new TypeError("offline");
      const applicants = await this.remote.findManyByNifOrNinu(workspaceId, nifs, ninus);
      cacheApplicants(applicants);
      return applicants;
    } catch (error) {
      if (!isOfflineFailure(error)) throw error;
      return this.local.findManyByNifOrNinu(workspaceId, nifs, ninus);
    }
  }

  async upsert(input: UpsertApplicantInput): Promise<Applicant> {
    if (getPendingOutbox().some((item) => item.workspaceId === input.workspaceId && item.type === "applicant.upsert" &&
        (item.payload.nif === input.nif || (input.id && item.payload.id === input.id)))) {
      return upsertApplicantOffline(input);
    }
    try {
      if (typeof navigator !== "undefined" && !navigator.onLine) throw new TypeError("offline");
      await syncPendingOutbox();
      const applicant = await this.remote.upsert(input);
      if (input.id && input.id !== applicant.id) {
        replaceLocalApplicantId(input.workspaceId, input.id, applicant);
      }
      cacheApplicant(applicant);
      return applicant;
    } catch (error) {
      if (!isOfflineFailure(error)) throw error;
      return upsertApplicantOffline(input);
    }
  }

  async upsertMany(inputs: UpsertApplicantInput[]): Promise<Applicant[]> {
    if (inputs.length === 0) return [];
    try {
      if (typeof navigator !== "undefined" && !navigator.onLine) throw new TypeError("offline");
      await syncPendingOutbox();
      const applicants = await this.remote.upsertMany(inputs);
      const inputsByNif = new Map(
        inputs.map((input) => [(input.nif || input.id || "").trim(), input])
      );
      applicants.forEach((applicant) => {
        const input = inputsByNif.get(applicant.nif?.trim() || applicant.id);
        const previousId = input?.id;
        if (previousId && previousId !== applicant.id) {
          replaceLocalApplicantId(input.workspaceId, previousId, applicant);
        }
      });
      cacheApplicants(applicants);
      return applicants;
    } catch (error) {
      if (!isOfflineFailure(error)) throw error;
      return inputs.map((input) => upsertApplicantOffline(input));
    }
  }

  async softDelete(id: string, workspaceId: string): Promise<void> {
    try {
      if (typeof navigator !== "undefined" && !navigator.onLine) throw new TypeError("offline");
      await syncPendingOutbox();
      await this.remote.softDelete(id, workspaceId);
      await this.local.applySoftDelete(id, workspaceId);
    } catch (error) {
      if (!isOfflineFailure(error)) throw error;
      deleteApplicantOffline(id, workspaceId);
    }
  }
}

class OfflineFirstDossierRepository implements DossierRepository {
  private readonly local = new LocalDossierRepository();
  private readonly remote = new SupabaseDossierRepository();

  async list(workspaceId: string): Promise<Dossier[]> {
    try {
      if (typeof navigator !== "undefined" && !navigator.onLine) throw new TypeError("offline");
      await syncPendingOutbox();
      const dossiers = await this.remote.list(workspaceId);
      cacheDossiers(dossiers);
      return dossiers;
    } catch (error) {
      if (!isOfflineFailure(error)) throw error;
      return this.local.list(workspaceId);
    }
  }

  async getById(id: string): Promise<Dossier | null> {
    try {
      if (typeof navigator !== "undefined" && !navigator.onLine) throw new TypeError("offline");
      await syncPendingOutbox();
      const dossier = await this.remote.getById(id);
      if (dossier) cacheDossier(dossier);
      return dossier;
    } catch (error) {
      if (!isOfflineFailure(error)) throw error;
      return this.local.getById(id);
    }
  }

  async create(input: CreateDossierInput): Promise<Dossier> {
    try {
      if (typeof navigator !== "undefined" && !navigator.onLine) throw new TypeError("offline");
      await syncPendingOutbox();
      const dossier = await this.remote.create(input);
      cacheDossier(dossier);
      return dossier;
    } catch (error) {
      if (!isOfflineFailure(error)) throw error;
      return this.local.create(input);
    }
  }

  async update(input: UpdateDossierInput): Promise<Dossier> {
    try {
      if (typeof navigator !== "undefined" && !navigator.onLine) throw new TypeError("offline");
      await syncPendingOutbox();
      const dossier = await this.remote.update(input);
      cacheDossier(dossier);
      return dossier;
    } catch (error) {
      if (!isOfflineFailure(error)) throw error;
      return this.local.update(input);
    }
  }

  async delete(id: string, workspaceId: string): Promise<number> {
    try {
      if (typeof navigator !== "undefined" && !navigator.onLine) throw new TypeError("offline");
      await syncPendingOutbox();
      const count = await this.remote.delete(id, workspaceId);
      await this.local.applyDelete(id, workspaceId);
      return count;
    } catch (error) {
      if (!isOfflineFailure(error)) throw error;
      return this.local.delete(id, workspaceId);
    }
  }
}

class OfflineFirstContractRepository implements ContractRepository {
  private readonly local = new LocalContractRepository();
  private readonly remote = new SupabaseContractRepository();

  async list(params: ContractListParams): Promise<ContractListResult> {
    try {
      if (typeof navigator !== "undefined" && !navigator.onLine) throw new TypeError("offline");
      if (params.all && !params.query && params.deletionState !== "deleted") {
        // Reconcile deletions and preserve queued changes before calculating totals.
        await syncSupabaseWorkspace(params.workspaceId, { force: true });
        return this.local.list(params);
      }
      await syncPendingOutbox();
      const remoteResult = await this.remote.list(params);
      cacheContracts(remoteResult.items);

      const pending = getPendingOutbox().some((item) => item.workspaceId === params.workspaceId &&
        (item.type.startsWith("contract.") || item.type === "tag.assign" || item.type === "tag.remove"));
      if (!pending) return remoteResult;
      if (params.all && params.query) {
        const pendingIds = getPendingContractIds();
        const local = await this.local.list(params);
        const byId = new Map(remoteResult.items.filter((item) => !pendingIds.has(item.id)).map((item) => [item.id, item]));
        local.items.filter((item) => pendingIds.has(item.id)).forEach((item) => byId.set(item.id, item));
        const items = sortContracts([...byId.values()], params.sort);
        return { ...remoteResult, items, total: items.length };
      }
      return this.local.list(params);
    } catch (error) {
      if (!isOfflineFailure(error)) throw error;
      return this.local.list(params);
    }
  }

  async getById(id: string): Promise<Contract | null> {
    if (getPendingContractIds().has(id)) return this.local.getById(id);
    try {
      if (typeof navigator !== "undefined" && !navigator.onLine) throw new TypeError("offline");
      await syncPendingOutbox();
      const contract = await this.remote.getById(id);
      if (contract) cacheContract(contract);
      return contract;
    } catch (error) {
      if (!isOfflineFailure(error)) throw error;
      return this.local.getById(id);
    }
  }

  async getByIds(ids: string[], workspaceId: string): Promise<Contract[]> {
    try {
      if (typeof navigator !== "undefined" && !navigator.onLine) throw new TypeError("offline");
      await syncPendingOutbox();
      const contracts = await this.remote.getByIds(ids, workspaceId);
      cacheContracts(contracts);
      const pendingIds = getPendingContractIds();
      const pending = await this.local.getByIds(ids.filter((id) => pendingIds.has(id)), workspaceId);
      const byId = new Map(contracts.filter((contract) => !pendingIds.has(contract.id)).map((contract) => [contract.id, contract]));
      pending.forEach((contract) => byId.set(contract.id, contract));
      return Array.from(byId.values());
    } catch (error) {
      if (!isOfflineFailure(error)) throw error;
      return this.local.getByIds(ids, workspaceId);
    }
  }

  async create(input: CreateContractInput): Promise<Contract> {
    input = { ...input, id: input.id ?? createId(), annee_fiscale: input.annee_fiscale || getStoredFiscalYear() };
    assertNoFiscalYearDuplicate(input, readCachedContracts({ workspaceId: input.workspaceId, all: true }).items);
    if (getPendingOutbox().some((item) => item.workspaceId === input.workspaceId &&
        item.type === "applicant.upsert" && (item.payload.nif === input.nif || item.payload.id === input.applicantId))) {
      return this.local.create(input);
    }
    try {
      if (typeof navigator !== "undefined" && !navigator.onLine) throw new TypeError("offline");
      await syncPendingOutbox();
      const contract = await this.remote.create(input);
      cacheContract(contract);
      return contract;
    } catch (error) {
      if (!isOfflineFailure(error)) throw error;
      return this.local.create(input);
    }
  }

  async createMany(inputs: CreateContractInput[]): Promise<Contract[]> {
    inputs = inputs.map((input) => ({ ...input, id: input.id ?? createId(), annee_fiscale: input.annee_fiscale || getStoredFiscalYear() }));
    try {
      if (typeof navigator !== "undefined" && !navigator.onLine) throw new TypeError("offline");
      await syncPendingOutbox();
      if (inputs.some((input) => getPendingOutbox().some((item) => item.workspaceId === input.workspaceId &&
          item.type === "applicant.upsert" && (item.payload.nif === input.nif || item.payload.id === input.applicantId)))) {
        return this.local.createMany(inputs);
      }
      const contracts = await this.remote.createMany(inputs);
      cacheContracts(contracts);
      return contracts;
    } catch (error) {
      if (!isOfflineFailure(error)) throw error;
      return this.local.createMany(inputs);
    }
  }

  async update(input: UpdateContractInput): Promise<Contract> {
    if (getPendingContractIds().has(input.id)) return this.local.update(input);
    try {
      if (typeof navigator !== "undefined" && !navigator.onLine) throw new TypeError("offline");
      await syncPendingOutbox();
      const contract = await this.remote.update(input);
      cacheContract(contract);
      return contract;
    } catch (error) {
      if (!isOfflineFailure(error)) throw error;
      return this.local.update(input);
    }
  }

  async assignToDossier(
    workspaceId: string,
    contractIds: string[],
    dossierId: string | null
  ): Promise<number> {
    try {
      if (typeof navigator !== "undefined" && !navigator.onLine) throw new TypeError("offline");
      await syncPendingOutbox();
      if (contractIds.some((id) => getPendingContractIds().has(id))) return this.local.assignToDossier(workspaceId, contractIds, dossierId);
      const count = await this.remote.assignToDossier(workspaceId, contractIds, dossierId);
      await this.local.applyAssignToDossier(workspaceId, contractIds, dossierId);
      return count;
    } catch (error) {
      if (!isOfflineFailure(error)) throw error;
      return this.local.assignToDossier(workspaceId, contractIds, dossierId);
    }
  }

  async updateStatus(
    workspaceId: string,
    contractIds: string[],
    status: ContractStatus
  ): Promise<number> {
    try {
      if (typeof navigator !== "undefined" && !navigator.onLine) throw new TypeError("offline");
      await syncPendingOutbox();
      if (contractIds.some((id) => getPendingContractIds().has(id))) return this.local.updateStatus(workspaceId, contractIds, status);
      const count = await this.remote.updateStatus(workspaceId, contractIds, status);
      await this.local.applyUpdateStatus(workspaceId, contractIds, status);
      return count;
    } catch (error) {
      if (!isOfflineFailure(error)) throw error;
      return this.local.updateStatus(workspaceId, contractIds, status);
    }
  }

  async updateDuration(
    workspaceId: string,
    contractIds: string[],
    durationMonths: number
  ): Promise<number> {
    try {
      if (typeof navigator !== "undefined" && !navigator.onLine) throw new TypeError("offline");
      await syncPendingOutbox();
      if (contractIds.some((id) => getPendingContractIds().has(id))) return this.local.updateDuration(workspaceId, contractIds, durationMonths);
      const count = await this.remote.updateDuration(workspaceId, contractIds, durationMonths);
      await this.local.applyUpdateDuration(workspaceId, contractIds, durationMonths);
      return count;
    } catch (error) {
      if (!isOfflineFailure(error)) throw error;
      return this.local.updateDuration(workspaceId, contractIds, durationMonths);
    }
  }

  async softDelete(id: string, workspaceId: string): Promise<void> {
    try {
      if (typeof navigator !== "undefined" && !navigator.onLine) throw new TypeError("offline");
      await syncPendingOutbox();
      if (getPendingContractIds().has(id)) return this.local.softDelete(id, workspaceId);
      await this.remote.softDelete(id, workspaceId);
      await this.local.applySoftDelete(id, workspaceId);
    } catch (error) {
      if (!isOfflineFailure(error)) throw error;
      await this.local.softDelete(id, workspaceId);
    }
  }
}

class OfflineFirstTagRepository implements TagRepository {
  private readonly local = new LocalTagRepository();
  private readonly remote = new SupabaseTagRepository();

  async list(workspaceId: string): Promise<Tag[]> {
    try {
      if (typeof navigator !== "undefined" && !navigator.onLine) throw new TypeError("offline");
      await syncPendingOutbox();
      const tags = await this.remote.list(workspaceId);
      cacheTags(tags);
      return tags;
    } catch (error) {
      if (!isOfflineFailure(error)) throw error;
      return this.local.list(workspaceId);
    }
  }

  async create(input: CreateTagInput): Promise<Tag> {
    try {
      if (typeof navigator !== "undefined" && !navigator.onLine) throw new TypeError("offline");
      await syncPendingOutbox();
      const tag = await this.remote.create(input);
      cacheTag(tag);
      return tag;
    } catch (error) {
      if (!isOfflineFailure(error)) throw error;
      return this.local.create(input);
    }
  }

  async assignToContract(workspaceId: string, contractId: string, tagId: string): Promise<void> {
    if (getPendingContractIds().has(contractId)) return this.local.assignToContract(workspaceId, contractId, tagId);
    try {
      if (typeof navigator !== "undefined" && !navigator.onLine) throw new TypeError("offline");
      await syncPendingOutbox();
      await this.remote.assignToContract(workspaceId, contractId, tagId);
      await this.local.applyAssignment(workspaceId, contractId, tagId);
    } catch (error) {
      if (!isOfflineFailure(error)) throw error;
      await this.local.assignToContract(workspaceId, contractId, tagId);
    }
  }

  async removeFromContract(workspaceId: string, contractId: string, tagId: string): Promise<void> {
    try {
      if (typeof navigator !== "undefined" && !navigator.onLine) throw new TypeError("offline");
      await syncPendingOutbox();
      await this.remote.removeFromContract(workspaceId, contractId, tagId);
      await this.local.applyRemoval(workspaceId, contractId, tagId);
    } catch (error) {
      if (!isOfflineFailure(error)) throw error;
      await this.local.removeFromContract(workspaceId, contractId, tagId);
    }
  }
}

export function createSupabaseProvider(): DataProvider {
  return {
    applicants: new OfflineFirstApplicantRepository(),
    dossiers: new OfflineFirstDossierRepository(),
    contracts: new OfflineFirstContractRepository(),
    printJobs: new OfflineFirstPrintJobRepository(),
    suggestions: new OfflineFirstAutocompleteRepository(),
    tags: new OfflineFirstTagRepository()
  };
}
