import { outboxEditTime } from "../local/outboxEditTime";
import { localEditWins } from "../latestEdit";
import { isTransientSyncFailure, syncFailureKind, syncErrorMessage } from "../local/syncFailures";
import { queueReferenceChange } from '../local/referenceQueue';
import { referenceWorkspace, type ReferenceEntry } from '../local/referenceOverlay';
import { syncReferenceChange } from './referenceSync';
import { cachePinnedContracts } from "../../features/contracts/pinnedContractsCache";
import { assertContractDuration } from "../../lib/contractDuration";
import { bindContractMinister, cachedContractMinister } from "../../features/settings/ministersCache";
import { LEGACY_MINISTER } from "../../lib/ministers";
import { applicantDatabaseConflictMessage } from "../applicantConflict";
import { DEPARTMENTS, inferInstitutionType, normalizeInstitution } from '../../lib/institutions';
import { numberToFrenchWords } from "../../lib/numberToFrenchWords";
import { OfflineConflict, mergeOfflinePatch, contractEditFields, dossierEditFields } from "./offlineConflict";
import { flushLocalDbWrites, refreshLocalDb, getLocalStorageError, loadDb, saveDb } from "../local/localDb";
import { withBrowserLock } from "../../lib/browserLock";
import { outboxKeys, outboxWriteKeys, discardableContractChanges } from "../local/outboxDependencies";
import { setOutboxError } from "../local/localOutbox";
import { assertNoFiscalYearDuplicate } from "../contractIdentity";
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
  cacheSuggestions, hasCachedSuggestions
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
  removeCachedContract,
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
import { getContractFiscalYear, matchesContractDateFilter } from "../../lib/contractDateFilters";
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
  const conflictMessage = applicantDatabaseConflictMessage(cause);
  if (conflictMessage) return repositoryError(conflictMessage, cause);

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
    modifiedAt: row.modified_at ?? undefined,
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
    ministerId: row.ministre_id || LEGACY_MINISTER.id,
    minister: row.ministre_id && row.ministre_id !== LEGACY_MINISTER.id ? cachedContractMinister({ ministerId: row.ministre_id }) : undefined,
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
    salaryText: numberToFrenchWords(Number(row.salaire_en_chiffre)),
    durationMonths: row.duree_contrat,
    annee_fiscale: row.annee_fiscale || null,
    createdAt: row.created_at,
    modifiedAt: row.modified_at ?? undefined,
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
    modifiedAt: row.modified_at ?? undefined,
    updatedAt: row.updated_at || row.created_at,
    remoteUpdatedAt: row.updated_at ?? null,
    deletedAt: row.deleted_at,
    createdBy: row.created_by
  };
}

// Only acknowledge a replay when the persisted contract values agree.
function sameQueuedContract(remote: Contract, local: Contract): boolean {
  const fields = ["workspaceId", "applicantId", "dossierId", "status", "position",
    "assignment", "salaryNumber", "durationMonths", "annee_fiscale",
    "commentaire", "createdBy"] as const;
  return !remote.deletedAt && (remote.ministerId || LEGACY_MINISTER.id) === (local.ministerId || LEGACY_MINISTER.id)
    && fields.every((field) => (remote[field] || null) === (local[field] || null));
}

class SupabaseApplicantRepository implements ApplicantRepository {
  async syncOffline(input: UpsertApplicantInput & { baseApplicant?: Applicant | null }, modifiedAt: string): Promise<Applicant> {
    const nif = (input.nif || input.id || "").trim();
    if (!nif) throw new Error("NIF obligatoire pour synchroniser le postulant.");
    const matches = await this.findManyByNifOrNinu(input.workspaceId, [nif], input.ninu ? [input.ninu] : []);
    const existing = matches.find((applicant) => applicant.nif === nif);
    if (matches.some((applicant) => applicant.nif !== nif)) {
      const { data, error } = await getSupabaseClient().rpc("sync_identification_latest", {
        p_record: buildApplicantInsertPayload(input, formatFirstName(input.firstName), formatLastName(input.lastName)),
        p_modified_at: modifiedAt
      });
      if (error || !data) throw repositoryError("Impossible de synchroniser la fiche d’identification.", error);
      return mapApplicant(data);
    }
    if (existing) {
      if (!localEditWins(modifiedAt, existing)) return existing;
      const desired = buildApplicantInsertPayload(input, formatFirstName(input.firstName), formatLastName(input.lastName));
      const fields = { prenom: "firstName", nom: "lastName", sexe: "gender", ninu: "ninu", telephone: "phone", adresse: "address" } as const;
      const normalize = (value: unknown) => String(value ?? "").trim().replace(/\s+/g, " ").toLocaleLowerCase("fr");
      const changes: Record<string, unknown> = {};
      for (const [column, field] of Object.entries(fields)) {
        const next = desired[column as keyof typeof desired];
        // Match online upsert semantics: absent optional values preserve remote data.
        if (next === undefined) continue;
        if (normalize(next) === normalize(existing[field])) continue;
        if (input.baseApplicant && normalize(next) === normalize(input.baseApplicant[field])) continue;
        changes[column] = next;
      }
      if (existing.deletedAt) changes.deleted_at = null;
      if (Object.keys(changes).length === 0) return existing;
      let update = getSupabaseClient().from("identification")
        .update({ ...changes, modified_at: modifiedAt } as any)
        .eq("workspace_id", input.workspaceId).eq("nif", nif);
      update = existing.remoteUpdatedAt === null ? update.is("updated_at", null)
        : update.eq("updated_at", existing.remoteUpdatedAt ?? existing.updatedAt);
      const { data, error } = await update.select("*").maybeSingle();
      if (error?.code === "23505") throw new Error("La fiche d’identification a changé pendant la synchronisation. Nouvelle tentative automatique.");
      if (error) throw repositoryError("Impossible de synchroniser la fiche d’identification.", error);
      if (!data) throw new Error("La fiche d’identification a changé pendant la synchronisation. Nouvelle tentative automatique.");
      return mapApplicant(data);
    }
    // A concurrent INSERT is retried against the newly persisted edit clock.
    const { data, error } = await getSupabaseClient().from("identification")
      .insert({ ...buildApplicantInsertPayload(input, formatFirstName(input.firstName), formatLastName(input.lastName)), modified_at: modifiedAt } as any)
      .select("*").single();
    if (error?.code === "23505") throw new Error("La fiche d’identification a changé pendant la synchronisation. Nouvelle tentative automatique.");
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

  async getById(id: string, includeDeleted = false): Promise<Applicant | null> {
    let query = getSupabaseClient().from("identification").select("*").eq("nif", id);
    if (!includeDeleted) query = query.is("deleted_at", null);
    const { data, error } = await query.maybeSingle();
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

    if (input.expectedUpdatedAt !== undefined && (!existing || existing.workspace_id !== input.workspaceId || (existing.updated_at || existing.created_at) !== input.expectedUpdatedAt)) throw new Error("La fiche d’identification a changé. Actualisez le lot avant de réessayer.");
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
    if (input.ninu !== undefined && input.ninu !== existing.ninu) {
      changes.ninu = input.ninu;
    }
    if (input.phone !== undefined) {
      const phone = input.phone?.trim() || null;
      if (phone !== (existing.telephone || null)) {
        changes.telephone = phone;
      }
    }
    if (input.address !== undefined && input.address !== existing.adresse) {
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

    let update = client.from("identification").update(changes as any)
      .eq("nif", existingNif).eq("workspace_id", input.workspaceId);
    if (input.expectedUpdatedAt !== undefined) update = existing.updated_at == null
      ? update.is("updated_at", null) : update.eq("updated_at", existing.updated_at);
    const { data: updated, error: updateError } = await update.select("*").single();

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

  async softDelete(id: string, workspaceId: string, modifiedAt?: string): Promise<void> {
    const existing = modifiedAt ? await this.getById(id, true) : undefined;
    if (modifiedAt && (!existing || !localEditWins(modifiedAt, existing))) return;
    let update = getSupabaseClient().from("identification")
      .update({ deleted_at: modifiedAt ?? new Date().toISOString(), modified_at: modifiedAt } as any)
      .eq("nif", id).eq("workspace_id", workspaceId);
    if (existing) update = existing.remoteUpdatedAt === null ? update.is("updated_at", null)
      : update.eq("updated_at", existing.remoteUpdatedAt ?? existing.updatedAt);
    const { data, error } = await update.select("*").maybeSingle();
    if (error) throw repositoryError("Impossible de supprimer la fiche d'identification.", error);
    if (existing && !data) throw new Error("La fiche d’identification a changé pendant la synchronisation. Nouvelle tentative automatique.");
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

  async getById(id: string, includeDeleted = false): Promise<Dossier | null> {
    let query = getSupabaseClient().from("dossiers").select("*").eq("id", id);
    if (!includeDeleted) query = query.is("deleted_at", null);
    const { data, error } = await query.maybeSingle();
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
      modified_at: (input as CreateDossierInput & { modifiedAt?: string }).modifiedAt,
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

  async syncOfflineUpdate(input: UpdateDossierInput & { baseDossier?: Dossier }, modifiedAt: string): Promise<Dossier> {
    const remote = await this.getById(input.id, true);
    if (!remote) throw new Error("Dossier introuvable.");
    if (!localEditWins(modifiedAt, remote)) return remote;
    const patch = mergeOfflinePatch<Dossier>(input, input.baseDossier, remote, dossierEditFields, modifiedAt);
    if (!Object.keys(patch).length && !remote.deletedAt) return remote;
    return this.update({ id: input.id, workspaceId: input.workspaceId, ...patch }, remote, modifiedAt);
  }

  async update(input: UpdateDossierInput, expected?: Dossier, modifiedAt?: string): Promise<Dossier> {
    const client = getSupabaseClient();
    const existing = expected ?? await this.getById(input.id);
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

    let update = client.from("dossiers").update({ ...payload, ...(modifiedAt ? { modified_at: modifiedAt, deleted_at: null } : {}) } as any).eq("id", input.id)
      .eq("workspace_id", input.workspaceId);
    if (expected) update = expected.remoteUpdatedAt === null ? update.is("updated_at", null)
      : update.eq("updated_at", expected.remoteUpdatedAt ?? expected.updatedAt);
    const { data, error } = await update.select("*").maybeSingle();
    if (!error && !data) throw new Error("Le dossier a changé pendant la synchronisation. Réessayez.");

    if (error || !data) {
      throw repositoryError("Impossible de mettre à jour le dossier.", error);
    }

    return mapDossier(data);
  }

  async delete(id: string, workspaceId: string, modifiedAt?: string): Promise<number> {
    if (modifiedAt) {
      const { data, error } = await getSupabaseClient().rpc("delete_dossier_latest", {
        p_id: id, p_workspace_id: workspaceId, p_modified_at: modifiedAt
      });
      if (error) throw repositoryError("Impossible de supprimer le dossier.", error);
      return data ?? 0;
    }
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
      ministre_id: input.ministerId,
      workspace_id: input.workspaceId,
      dossier_id: input.dossierId || null,
      nif: input.applicantId || input.nif || "",
      status: input.status,
      titre: input.position,
      lieu_affectation: input.assignment,
      salaire_en_chiffre: input.salaryNumber,
      duree_contrat: input.durationMonths || 12,
      commentaire: input.commentaire || null,
      annee_fiscale: input.annee_fiscale || getStoredFiscalYear(),
      historique_saisie: serializeContractAudit(auditHistory),
      created_by: input.createdBy,
      modified_at: (input as CreateContractInput & { modifiedAt?: string }).modifiedAt
    };
  }

  async list(params: ContractListParams): Promise<ContractListResult> {
    const client = getSupabaseClient();
    const page = params.page ?? 1;
    const pageSize = params.pageSize ?? 10;
    const from = params.offset ?? (page - 1) * pageSize;
    const to = from + pageSize - 1;
    const hasDateFilter = Boolean(params.dateFilterMode && params.dateFilterMode !== "all");
    const requiresIdentitySorting = params.sort?.startsWith("name_") || params.sort?.startsWith("nif_");
    const requiresClientFiltering =
      Boolean(params.fiscalYear) || hasDateFilter || Boolean(params.query?.trim()) || requiresIdentitySorting;

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

    if (params.includeIds) {
      if (params.includeIds.length === 0) {
        return { items: [], total: 0, page, pageSize };
      }
      query = query.in("id_contrat", params.includeIds);
    }
    for (const id of params.excludeIds ?? []) {
      query = query.neq("id_contrat", id);
    }

    if (params.onlyMine && params.userId) {
      query = query.eq("created_by", params.userId);
    }

    if (params.createdByIds?.length) {
      query = query.in("created_by", params.createdByIds);
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

    if (params.durations?.length) {
      query = query.in("duree_contrat", params.durations);
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
        .filter(contract => !params.fiscalYear || getContractFiscalYear(contract) === params.fiscalYear)
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

  async getById(id: string, includeDeleted = false): Promise<Contract | null> {
    let query = getSupabaseClient().from("contrat").select("*, identification(*), contract_tags(tags(*))").eq("id_contrat", id);
    if (!includeDeleted) query = query.is("deleted_at", null);
    const { data, error } = await query.maybeSingle();
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
    assertContractDuration(input.durationMonths);
    const created = await this.createMany([input]);
    const contract = created[0];
    if (!contract) {
      throw new Error("Impossible de créer le contrat.");
    }
    return contract;
  }

  async createMany(inputs: CreateContractInput[]): Promise<Contract[]> {
    inputs.forEach(input => assertContractDuration(input.durationMonths));
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

  async syncOfflineUpdate(input: UpdateContractInput & { baseContract?: Contract }, modifiedAt: string): Promise<Contract> {
    const remote = await this.getById(input.id, true);
    if (!remote) throw new Error("Contrat introuvable.");
    if (!localEditWins(modifiedAt, remote)) return remote;
    const patch = mergeOfflinePatch<Contract>(input, input.baseContract, remote, contractEditFields, modifiedAt);
    if (!Object.keys(patch).length && !remote.deletedAt) return remote;
    return this.update({ id: input.id, ...patch }, remote, modifiedAt);
  }

  async update(input: UpdateContractInput, expected?: Contract, modifiedAt?: string): Promise<Contract> {
    if (input.durationMonths !== undefined) assertContractDuration(input.durationMonths);
    const client = getSupabaseClient();
    const existing = expected ?? await this.getById(input.id);
    if (!existing) {
      throw new Error("Contrat introuvable.");
    }
    if (input.ministerId !== undefined && input.ministerId !== existing.ministerId) {
      throw new Error("Le ministre d’un contrat existant ne peut pas être remplacé.");
    }
    const payload: Record<string, any> = modifiedAt ? { modified_at: modifiedAt, deleted_at: null } : {};
    if (input.status !== undefined) payload.status = input.status;
    if (input.createdAt !== undefined) payload.created_at = input.createdAt;
    if (input.annee_fiscale !== undefined) payload.annee_fiscale = input.annee_fiscale;
    if (input.position !== undefined) payload.titre = input.position;
    if (input.assignment !== undefined) payload.lieu_affectation = input.assignment;
    if (input.salaryNumber !== undefined) payload.salaire_en_chiffre = input.salaryNumber;
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

    let update = client.from("contrat").update(payload as any)
      .eq("id_contrat", input.id).eq("workspace_id", existing.workspaceId);
    if (expected) update = existing.remoteUpdatedAt === null ? update.is("updated_at", null)
      : update.eq("updated_at", existing.remoteUpdatedAt ?? existing.updatedAt);
    const { data, error } = await update.select("*, identification(*), contract_tags(tags(*))").maybeSingle();
    if (!error && !data) throw new Error("Le contrat a changé pendant la synchronisation. Réessayez.");

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
    _previousStatus?: ContractStatus,
    changedAt?: string
  ): Promise<Contract> {
    const existing = await this.getById(id, true);
    if (!existing || existing.workspaceId !== workspaceId) {
      throw new Error(`Conflit d’état : le contrat ${id} a été supprimé ou n’est plus accessible. Le changement local est conservé.`);
    }
    // A lost response may mean this exact transition already reached the server.
    if (existing.status === status && !existing.deletedAt) return existing;
    if (changedAt && !localEditWins(changedAt, existing)) return existing;
    const auditHistory = appendContractAuditEntry(existing.auditHistory, {
      action: "status",
      changes: buildContractAuditChanges(existing, { status }),
      at: changedAt
    });
    let update = getSupabaseClient().from("contrat")
      .update({ status, deleted_at: null, historique_saisie: serializeContractAudit(auditHistory), modified_at: changedAt } as any)
      .eq("workspace_id", workspaceId)
      .eq("id_contrat", id)
      .eq("status", existing.status);
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
    assertContractDuration(durationMonths);
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

  async softDelete(id: string, workspaceId: string, base?: Contract, modifiedAt?: string): Promise<void> {
    const client = getSupabaseClient();
    const existing = await this.getById(id);
    if (!existing || existing.deletedAt) return;
    if (modifiedAt && !localEditWins(modifiedAt, existing)) return;
    const auditHistory = appendContractAuditEntry(existing?.auditHistory, {
      action: "deletion",
      changes: []
    });
    let deletion = client
      .from("contrat")
      .update({
        deleted_at: modifiedAt ?? new Date().toISOString(),
        modified_at: modifiedAt,
        historique_saisie: serializeContractAudit(auditHistory)
      } as any)
      .eq("id_contrat", id)
      .eq("workspace_id", workspaceId);
    if (base || modifiedAt) deletion = existing.remoteUpdatedAt === null ? deletion.is("updated_at", null)
      : deletion.eq("updated_at", existing.remoteUpdatedAt ?? existing.updatedAt);
    const { data, error } = await deletion.select("id_contrat").maybeSingle();
    if (!error && !data) throw new Error("Le contrat a changé pendant la synchronisation. Nouvelle tentative automatique.");
    if (error) {
      throw repositoryError("Impossible de supprimer le contrat.", error);
    }
  }

  async permanentlyDelete(id: string, workspaceId: string): Promise<void> {
    const { data, error } = await getSupabaseClient()
      .from("contrat")
      .delete()
      .eq("id_contrat", id)
      .eq("workspace_id", workspaceId)
      .not("deleted_at", "is", null)
      .select("id_contrat")
      .maybeSingle();
    if (error) throw repositoryError("Impossible de supprimer définitivement le contrat.", error);
    if (!data) throw new Error("Ce contrat n’est plus dans la corbeille ou vous n’avez pas le droit de le supprimer.");
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
      // Associations are insert/delete only. Ignoring an existing pair also
      // makes retries safe when the first acknowledgement was lost.
      .upsert({ contract_id: contractId, tag_id: tagId } as any, {
        onConflict: "contract_id,tag_id", ignoreDuplicates: true
      }) as any);

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
      institutionType: r.institution_type,
      source: r.source_url,
      version: r.version,
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
    _createdBy?: string,
    department?: string | null,
    commune?: string | null
  ): Promise<InstitutionSuggestion> {
    const raw = localStorage.getItem('contribution_auth');
    const token = raw ? (JSON.parse(raw) as {taskSessionToken?:string}).taskSessionToken : undefined;
    if (!token) throw new Error('Session utilisateur indisponible.');
    const {data,error} = await getSupabaseClient().rpc('learn_institution', {
      p_session_token:token, p_workspace_id:workspaceId,
      p_entry:{label:label.trim(),addressKeywords,institutionType:inferInstitutionType(label),
        department:department ? DEPARTMENTS.find(d => normalizeInstitution(d) === normalizeInstitution(department)) ?? null : null,
        commune:commune?.trim() || null}
    });
    if (error) throw repositoryError("Impossible d'ajouter l'affectation.",error);
    return data as unknown as InstitutionSuggestion;
  }

  async updateInstitution(
    id: string, label: string, addressKeywords: string[],
    _prefix?: string | null, _labelFeminine?: string | null,
    department?: string | null, commune?: string | null
  ): Promise<void> {
    const client = getSupabaseClient();
    const {data:previous,error:readError} = await client.from('autocompletion').select('*').eq('id',id).eq('type','institution').single();
    if (readError || !previous) throw repositoryError('Institution inaccessible.',readError);
    const raw = localStorage.getItem('contribution_auth');
    const token = raw ? (JSON.parse(raw) as {taskSessionToken?:string}).taskSessionToken : undefined;
    if (!token) throw new Error('Session utilisateur indisponible.');
    const {error} = await client.rpc('save_institution', {
      p_session_token:token,p_workspace_id:previous.workspace_id,
      p_entry:{id,label,addressKeywords,department:department ? DEPARTMENTS.find(d => normalizeInstitution(d) === normalizeInstitution(department)) ?? null : null,
        commune:commune?.trim() || null,institutionType:previous.institution_type ?? inferInstitutionType(label) ?? 'Autre',source:previous.source_url,version:previous.version}
    });
    if (error) throw repositoryError("Impossible de modifier l'affectation.",error);
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
  async getAddresses(workspaceId: string) {
    if (!hasCachedSuggestions('addresses', workspaceId) && navigator.onLine) {
      try { cacheSuggestions({ addresses: await this.remote.getAddresses(workspaceId) }, workspaceId); }
      catch (error) { if (!isOfflineFailure(error)) throw error; }
    }
    return this.local.getAddresses(workspaceId);
  }
  async getPositions(workspaceId: string) {
    if (!hasCachedSuggestions('positions', workspaceId) && navigator.onLine) {
      try { cacheSuggestions({ positions: await this.remote.getPositions(workspaceId) }, workspaceId); }
      catch (error) { if (!isOfflineFailure(error)) throw error; }
    }
    return this.local.getPositions(workspaceId);
  }
  async getInstitutions(workspaceId: string) {
    if (!hasCachedSuggestions('institutions', workspaceId) && navigator.onLine) {
      try { cacheSuggestions({ institutions: await this.remote.getInstitutions(workspaceId) }, workspaceId); }
      catch (error) { if (!isOfflineFailure(error)) throw error; }
    }
    return this.local.getInstitutions(workspaceId);
  }

  private async save<T extends { id: string }>(scope: 'addresses' | 'positions' | 'institutions', workspaceId: string, before: T | null, after: T | null, learn = false) {
    await queueReferenceChange(workspaceId, { scope, learn, patches: [{ id: (after ?? before)!.id,
      before: before as ReferenceEntry | null, after: after as ReferenceEntry | null }] });
    return after!;
  }
  async addAddress(workspaceId: string, label: string, _createdBy?: string) {
    const existing = (await this.getAddresses(workspaceId)).find(entry => normalizeInstitution(entry.label) === normalizeInstitution(label));
    if (existing) return existing;
    return this.save('addresses', workspaceId, null, { id: createId(), label: label.trim(), order: 0 }, true);
  }
  async updateAddress(id: string, label: string, prefix?: string | null, labelFeminine?: string | null) {
    const workspaceId = referenceWorkspace();
    const before = (await this.getAddresses(workspaceId)).find(entry => entry.id === id);
    if (!before) throw new Error('Adresse introuvable.');
    await this.save('addresses', workspaceId, before, { ...before, label, prefix: prefix ?? null, labelFeminine: labelFeminine ?? null });
  }
  async deleteAddress(id: string) {
    const workspaceId = referenceWorkspace();
    const before = (await this.getAddresses(workspaceId)).find(entry => entry.id === id);
    if (before) await this.save('addresses', workspaceId, before, null);
  }
  async addPosition(workspaceId: string, label: string, salaries: number[], _createdBy?: string) {
    return this.save('positions', workspaceId, null, { id: createId(), label: label.trim(), salaries, order: 0 });
  }
  async updatePosition(id: string, label: string, salaries: number[], prefix?: string | null, labelFeminine?: string | null) {
    const workspaceId = referenceWorkspace();
    const before = (await this.getPositions(workspaceId)).find(entry => entry.id === id);
    if (!before) throw new Error('Poste introuvable.');
    await this.save('positions', workspaceId, before, { ...before, label, salaries, prefix: prefix ?? null, labelFeminine: labelFeminine ?? null });
  }
  async deletePosition(id: string) {
    const workspaceId = referenceWorkspace();
    const before = (await this.getPositions(workspaceId)).find(entry => entry.id === id);
    if (before) await this.save('positions', workspaceId, before, null);
  }
  async addInstitution(workspaceId: string, label: string, addressKeywords: string[], _createdBy?: string, department?: string | null, commune?: string | null): Promise<InstitutionSuggestion> {
    const existing = (await this.getInstitutions(workspaceId)).find(entry => normalizeInstitution(entry.label) === normalizeInstitution(label));
    if (existing) return existing;
    return this.save('institutions', workspaceId, null, { id: createId(), label: label.trim(), addressKeywords, order: 0, version: 1,
      institutionType: inferInstitutionType(label), department: department ? DEPARTMENTS.find(d => normalizeInstitution(d) === normalizeInstitution(department)) ?? null : null,
      commune: commune?.trim() || null }, true);
  }
  async updateInstitution(id: string, label: string, addressKeywords: string[], _prefix?: string | null, _labelFeminine?: string | null, department?: string | null, commune?: string | null) {
    const workspaceId = referenceWorkspace();
    const before = (await this.getInstitutions(workspaceId)).find(entry => entry.id === id);
    if (!before) throw new Error('Institution introuvable.');
    await this.save('institutions', workspaceId, before, { ...before, label, addressKeywords,
      department: department ? DEPARTMENTS.find(d => normalizeInstitution(d) === normalizeInstitution(department)) ?? null : null,
      commune: commune?.trim() || null, version: (before.version ?? 0) + 1 });
  }
  async deleteInstitution(id: string) {
    const workspaceId = referenceWorkspace();
    const before = (await this.getInstitutions(workspaceId)).find(entry => entry.id === id);
    if (before) await this.save('institutions', workspaceId, before, null);
  }
}

class OfflineFirstPrintJobRepository implements PrintJobRepository {
  private readonly local = new LocalPrintJobRepository();
  async create(workspaceId: string, contractIds: string[]): Promise<ContractPrintJob> {
    return this.local.create(workspaceId, contractIds);
  }
}

export type SupabaseSyncState = {
  isOnline: boolean;
  isSyncing: boolean;
  pendingCount: number;
  lastSyncedAt: string | null;
  lastFullSyncedAt?: string | null;
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
    lastError: getLocalStorageError() ?? getPendingOutbox().find(item => item.workspaceId === workspaceId && item.lastError)?.lastError ?? metadata.lastError ?? null,
    lastFullSyncedAt: metadata.lastFullSyncedAt ?? null,
    cached: getWorkspaceCacheCounts(workspaceId)
  };
}

function syncPendingOutbox() {
  if (outboxSyncPromise) return outboxSyncPromise;
  let didBegin = false;

  outboxSyncPromise = withBrowserLock("outbox-sync", async () => {
    await refreshLocalDb();
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
      const modifiedAt = outboxEditTime(item);
      const keys = outboxKeys(item);
      const writes = outboxWriteKeys(item);
      if (keys.some((key) => blockedKeys.has(key))) {
        writes.forEach((key) => blockedKeys.add(key));
        setOutboxError(item.id, "En attente de la résolution d’une action liée à ce contrat.", undefined, "dependency");
        continue;
      }
      let syncedContract: Contract | undefined;
      const syncedContracts: Contract[] = [];
      let syncedDossier: Dossier | undefined;
      let syncedApplicant: Applicant | undefined;
      try {
        if (typeof navigator !== "undefined" && !navigator.onLine) return;
        const actor = JSON.parse(localStorage.getItem("contribution_auth") ?? "null");
        if (item.actorId && item.actorId !== actor?.id) throw new Error("Reconnectez le compte ayant effectué cette modification pour la synchroniser.");
        if ((item.type === "contract.create" || item.type === "contract.update") && getPendingOutbox().some(pending =>
          pending.workspaceId === item.workspaceId && pending.type === "applicant.upsert" &&
          (item.payload.nif && pending.payload.nif === item.payload.nif || item.payload.applicantId && pending.payload.id === item.payload.applicantId))) {
          keys.filter(key => key.includes(":contract:")).forEach(key => blockedKeys.add(key));
          setOutboxError(item.id, "La fiche d’identification doit être synchronisée avant ce contrat.", undefined, "dependency");
          continue;
        }
        if (item.type === "reference.change") {
          await syncReferenceChange(item);
        } else if (item.type === "print.create") {
          const job = item.payload as unknown as ContractPrintJob;
          const { error } = await getSupabaseClient().from("contract_print_jobs").upsert({
            id: job.id, workspace_id: job.workspaceId, contract_ids_json: JSON.stringify(job.contractIds),
            created_at: job.createdAt, printed_at: job.printedAt
          } as any, { onConflict: "id", ignoreDuplicates: true });
          if (error) throw error;
        } else if (item.type === "pin.set") {
          if (!actor?.taskSessionToken || actor.id !== item.payload.userId || actor.workspaceId !== item.workspaceId) {
            throw new Error("Reconnectez le compte ayant épinglé ce contrat pour le synchroniser.");
          }
          const { data, error } = await getSupabaseClient().rpc("set_pinned_contract", {
            p_session_token: actor.taskSessionToken,
            p_contract_id: String(item.payload.contractId), p_pinned: Boolean(item.payload.pinned)
          });
          if (error) throw error;
          // A later local toggle must stay visible while this request is acknowledged.
          if (!getPendingOutbox().some(next => next.id !== item.id && next.type === "pin.set" && next.payload.userId === actor.id)) {
            cachePinnedContracts(actor.id, data ?? []);
          }
        } else if (item.type === "list.operation") {
          await syncQueuedList(item);
        } else if (item.type === "applicant.upsert") {
          const payload = item.payload as unknown as UpsertApplicantInput;
          const applicant = await applicants.syncOffline(payload, modifiedAt);
          if (payload.id && payload.id !== applicant.id) {
            replaceLocalApplicantId(item.workspaceId, payload.id, applicant);
          }
          syncedApplicant = applicant;
        } else if (item.type === "applicant.delete") {
          const payload = item.payload as { id?: string };
          if (payload.id) {
            await applicants.softDelete(payload.id, item.workspaceId, modifiedAt);
            syncedApplicant = await applicants.getById(payload.id, true) ?? undefined;
          }
        } else if (item.type === "contract.create") {
          const payload = item.payload as unknown as Contract;
          if (getPendingOutbox().some(pending => pending.type === 'reference.change' && pending.payload.scope === 'ministers' &&
            (pending.payload.patches as { id: string; before: unknown }[]).some(patch => patch.id === payload.ministerId && !patch.before))) {
            throw new Error('Le ministre de ce contrat doit être synchronisé avant le contrat.');
          }
          const existing = await contracts.getById(payload.id, true);
          if (existing && !sameQueuedContract(existing, payload)) {
            const base = item.payload.baseContract as Contract | undefined;
            if (existing.workspaceId !== payload.workspaceId || existing.createdBy !== payload.createdBy || (existing.ministerId || LEGACY_MINISTER.id) !== (payload.ministerId || LEGACY_MINISTER.id)) {
              throw new Error("Ce contrat n’est plus accessible avec les mêmes références. Le contrat local est conservé.");
            }
            // A previous INSERT may have committed before its response was lost.
            // Correct that same record with the original base, never INSERT again.
            syncedContract = await contracts.syncOfflineUpdate({ ...payload, baseContract: base }, modifiedAt);
          } else {
            if (!existing) await contracts.checkFiscalYearDuplicate(payload);
            syncedContract = existing ?? await contracts.create({ ...payload, modifiedAt } as typeof payload);
          }
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
            syncedContract = await contracts.syncOfflineUpdate(payload as UpdateContractInput, modifiedAt);
          } else if (Array.isArray(payload.contractIds) && payload.status) {
            for (const id of payload.contractIds) {
              syncedContracts.push(await contracts.syncOfflineStatus(
                item.workspaceId, id, payload.status, payload.previousStatus, modifiedAt
              ));
            }
          } else if (Array.isArray(payload.contractIds) && typeof payload.durationMonths === "number") {
            for (const id of payload.contractIds) {
              const saved = await contracts.syncOfflineUpdate({ id, durationMonths: payload.durationMonths }, modifiedAt);
              syncedContracts.push(saved);
            }
          } else if (Array.isArray(payload.contractIds) && "dossierId" in payload) {
            for (const id of payload.contractIds) {
              const saved = await contracts.syncOfflineUpdate({ id, dossierId: payload.dossierId ?? null }, modifiedAt);
              syncedContracts.push(saved);
            }
          }
        } else if (item.type === "contract.delete") {
          const payload = item.payload as { id?: string; baseContract?: Contract };
          if (payload.id) {
            await contracts.softDelete(payload.id, item.workspaceId, payload.baseContract, modifiedAt);
            syncedContract = await contracts.getById(payload.id, true) ?? undefined;
          }
        } else if (item.type === "dossier.create") {
          const payload = item.payload as unknown as CreateDossierInput & { id?: string };
          const dossier = await dossiers.create({ ...payload, modifiedAt } as typeof payload);
          if (payload.id && payload.id !== dossier.id) {
            replaceLocalDossierId(item.workspaceId, payload.id, dossier);
          }
          syncedDossier = dossier;
        } else if (item.type === "dossier.update") {
          const payload = item.payload as unknown as UpdateDossierInput;
          const dossier = await dossiers.syncOfflineUpdate(payload, modifiedAt);
          syncedDossier = dossier;
        } else if (item.type === "dossier.delete") {
          const payload = item.payload as { id?: string; workspaceId?: string; contractIds?: string[] };
          if (payload.id) {
            await dossiers.delete(payload.id, payload.workspaceId ?? item.workspaceId, modifiedAt);
            syncedDossier = await dossiers.getById(payload.id, true) ?? undefined;
            if (payload.contractIds?.length) syncedContracts.push(...await contracts.getByIds(payload.contractIds, item.workspaceId));
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
        syncedContracts.forEach(cacheContract);
        if (syncedDossier) cacheDossier(syncedDossier);
        if (syncedApplicant) cacheApplicant(syncedApplicant);

        setWorkspaceSyncMetadata(item.workspaceId, {
          lastSyncedAt: new Date().toISOString(),
          lastError: getPendingOutbox().find((pending) => pending.workspaceId === item.workspaceId && pending.lastError)?.lastError ?? null
        });
        await flushLocalDbWrites();
        notifySyncState();
      } catch (error) {
        // A failed transport says nothing about the queued data. Stop this pass
        // and let the caller retry, without marking the operation as rejected.
        if (isTransientSyncFailure(error)) {
          setOutboxError(item.id, null, undefined, "temporary");
          await flushLocalDbWrites();
          notifySyncState();
          throw error;
        }
        const message = syncErrorMessage(error);
        setOutboxError(item.id, message, error instanceof OfflineConflict ? { fields: error.fields, remote: error.remote } : undefined, syncFailureKind(item, error));
        await flushLocalDbWrites();
        setWorkspaceSyncMetadata(item.workspaceId, { lastError: message });
        notifySyncState();
        writes.forEach((key) => blockedKeys.add(key));
        console.error("Impossible de synchroniser une action locale.", error);
      }
    }
  }).finally(() => {
    outboxSyncPromise = null;
    if (didBegin) endSyncOperation();
  });

  return outboxSyncPromise;
}

/** Restore confirmed server data before dropping this contract's queued edits. */
export async function discardContractSyncChanges(contract: Contract, expectedIds: string[]) {
  if (!navigator.onLine) throw new Error("Reconnectez-vous pour récupérer la version du serveur.");
  await withBrowserLock("outbox-sync", async () => {
    await refreshLocalDb();
    const pending = getPendingOutbox();
    const selected = discardableContractChanges(contract, pending);
    const assertUnchanged = (items: typeof selected) => {
      if (!items.length || items.length !== expectedIds.length || items.some(item => !expectedIds.includes(item.id))) {
        throw new Error("Les modifications ont changé. Actualisez avant de réessayer.");
      }
    };
    assertUnchanged(selected);
    if (pending.some(item => item.workspaceId === contract.workspaceId && item.type === "contract.create" && item.payload.id === contract.id)) {
      throw new Error("Ce contrat n’existe pas encore sur le serveur.");
    }
    const remote = await new SupabaseContractRepository().getById(contract.id);
    if (!remote || remote.workspaceId !== contract.workspaceId) throw new Error("La version du serveur est introuvable. Les modifications sont conservées.");
    await refreshLocalDb();
    const db = loadDb();
    const current = discardableContractChanges(contract, db.outbox);
    assertUnchanged(current);
    if (JSON.stringify(current) !== JSON.stringify(selected)) throw new Error("Les modifications ont changé. Réessayez.");
    const actor = JSON.parse(localStorage.getItem("contribution_auth") ?? "null");
    if (current.some(item => item.actorId && item.actorId !== actor?.id)) throw new Error("Reconnectez le compte ayant effectué ces modifications.");
    db.outbox = db.outbox.flatMap(item => {
      if (!expectedIds.includes(item.id)) return [item];
      if (Array.isArray(item.payload.contractIds)) {
        const contractIds = item.payload.contractIds.filter(id => id !== contract.id);
        if (contractIds.length) return [{ ...item, payload: { ...item.payload, contractIds } }];
      }
      return [];
    });
    const index = db.contracts.findIndex(item => item.id === contract.id && item.workspaceId === contract.workspaceId);
    if (index < 0) throw new Error("Le contrat local a changé. Actualisez avant de réessayer.");
    db.contracts[index] = remote;
    db.contractTags = db.contractTags.filter(item => item.contractId !== contract.id);
    for (const tag of remote.tags ?? []) {
      if (!db.tags.some(item => item.id === tag.id)) db.tags.push(tag);
      db.contractTags.push({ contractId: contract.id, tagId: tag.id, createdAt: new Date().toISOString() });
    }
    db.syncMetadata[contract.workspaceId] = { ...db.syncMetadata[contract.workspaceId],
      lastError: db.outbox.find(item => !item.syncedAt && item.workspaceId === contract.workspaceId && item.lastError)?.lastError ?? null };
    saveDb(db);
    await flushLocalDbWrites();
    notifySyncState();
  });
}

export function syncSupabaseOutbox() {
  return syncPendingOutbox();
}

/**
 * Refreshes the local workspace used by all regular reads. Background callers
 * verify the revision; explicit force requests download the complete snapshot.
 */
export function syncSupabaseWorkspace(
  workspaceId: string,
  options: { force?: boolean; verify?: boolean } = {}
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
    !options.verify &&
    metadata.snapshotVersion === 1 &&
    !metadata.lastError &&
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

      const session = JSON.parse(localStorage.getItem("contribution_auth") ?? "null");
      let remoteRevision: string | null = null;
      if (session?.taskSessionToken && session.workspaceId === workspaceId) {
        const revision = await getSupabaseClient().rpc("get_offline_workspace_revision", {
          p_session_token: session.taskSessionToken, p_workspace_id: workspaceId
        });
        if (revision.error) {
          // Older deployments can still download complete snapshots.
          if (!/PGRST202|42883/.test(revision.error.code ?? "")) throw revision.error;
        } else if (typeof revision.data === "string") remoteRevision = revision.data;
      }
      const currentMetadata = getWorkspaceSyncMetadata(workspaceId);
      if (!options.force && currentMetadata.snapshotVersion === 1 && remoteRevision && currentMetadata.lastFullSyncedAt && currentMetadata.lastTrashSyncedAt && currentMetadata.remoteRevision === remoteRevision) {
        setWorkspaceSyncMetadata(workspaceId, { lastSyncedAt: new Date().toISOString(),
          lastError: getPendingOutbox().find(item => item.workspaceId === workspaceId && item.lastError)?.lastError ?? null });
        await flushLocalDbWrites();
        return false;
      }

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
        cacheSuggestions({ addresses, positions, institutions }, workspaceId);
      } catch (error) {
        console.warn("Les suggestions n'ont pas pu être actualisées pour le mode hors ligne.", error);
      }

      const [active, trash] = await Promise.all([
        contractsRepo.list({ workspaceId, all: true, sort: "createdAt_desc" }),
        contractsRepo.list({ workspaceId, all: true, sort: "createdAt_desc", deletionState: "deleted" })
      ]);
      const contracts = [...active.items, ...trash.items];

      replaceWorkspaceCache(workspaceId, { applicants, contracts, dossiers, tags });
      await downloadContractLists(workspaceId);
      await flushLocalDbWrites();
      const storedIds = new Set(loadDb().contracts.filter(c => c.workspaceId === workspaceId).map(c => c.id));
      const pendingIds = getPendingContractIds();
      if (contracts.some(c => !storedIds.has(c.id) && !pendingIds.has(c.id))) {
        throw new Error("Enregistrement local incomplet : relancez la synchronisation.");
      }
      const syncedAt = new Date().toISOString();
      setWorkspaceSyncMetadata(workspaceId, {
        snapshotVersion: 1,
        lastSyncedAt: syncedAt,
        lastFullSyncedAt: syncedAt,
        lastTrashSyncedAt: syncedAt,
        remoteRevision,
        lastError: getPendingOutboxCount(workspaceId) > 0 ? getWorkspaceSyncMetadata(workspaceId).lastError : null
      });
      await flushLocalDbWrites();
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
    if (getWorkspaceSyncMetadata(workspaceId).lastFullSyncedAt) return this.local.list(workspaceId);
    try {
      if (typeof navigator !== "undefined" && !navigator.onLine) throw new TypeError("offline");
      const applicants = await this.remote.list(workspaceId);
      cacheApplicants(applicants);
      return applicants;
    } catch (error) {
      if (!isOfflineFailure(error)) throw error;
      return this.local.list(workspaceId);
    }
  }

  async getById(id: string): Promise<Applicant | null> {
    const cached = await this.local.getById(id);
    if (cached) return cached;
    if (getPendingOutbox().some(item => item.type.startsWith("applicant.") && (item.payload.id === id || item.payload.nif === id))) return this.local.getById(id);
    try {
      if (typeof navigator !== "undefined" && !navigator.onLine) throw new TypeError("offline");
      const applicant = await this.remote.getById(id);
      if (applicant) cacheApplicant(applicant);
      return this.local.getById(id);
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
    const cached = await this.local.findByNifOrNinu(workspaceId, nif, ninu);
    if (cached || getWorkspaceSyncMetadata(workspaceId).lastFullSyncedAt) return cached;
    try {
      if (typeof navigator !== "undefined" && !navigator.onLine) throw new TypeError("offline");
      const applicant = await this.remote.findByNifOrNinu(workspaceId, nif, ninu);
      if (applicant) cacheApplicant(applicant);
      return this.local.findByNifOrNinu(workspaceId, nif, ninu);
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
    if (getWorkspaceSyncMetadata(workspaceId).lastFullSyncedAt) return this.local.findManyByNifOrNinu(workspaceId, nifs, ninus);
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
    const applicant = upsertApplicantOffline(input);
    await flushLocalDbWrites();
    return applicant;
  }

  async upsertMany(inputs: UpsertApplicantInput[]): Promise<Applicant[]> {
    const applicants = inputs.map(input => upsertApplicantOffline(input));
    await flushLocalDbWrites();
    return applicants;
  }

  async softDelete(id: string, workspaceId: string): Promise<void> {
    deleteApplicantOffline(id, workspaceId);
    await flushLocalDbWrites();
  }
}

class OfflineFirstDossierRepository implements DossierRepository {
  private readonly local = new LocalDossierRepository();
  private readonly remote = new SupabaseDossierRepository();

  async list(workspaceId: string): Promise<Dossier[]> {
    if (getWorkspaceSyncMetadata(workspaceId).lastFullSyncedAt) return this.local.list(workspaceId);
    try {
      if (typeof navigator !== "undefined" && !navigator.onLine) throw new TypeError("offline");
      const dossiers = await this.remote.list(workspaceId);
      cacheDossiers(dossiers);
      return dossiers;
    } catch (error) {
      if (!isOfflineFailure(error)) throw error;
      return this.local.list(workspaceId);
    }
  }

  async getById(id: string): Promise<Dossier | null> {
    const cached = await this.local.getById(id);
    if (cached || getPendingOutbox().some(item => item.type === "dossier.delete" && item.payload.id === id)) return cached;
    try {
      if (typeof navigator !== "undefined" && !navigator.onLine) throw new TypeError("offline");
      const dossier = await this.remote.getById(id);
      if (dossier) cacheDossier(dossier);
      return this.local.getById(id);
    } catch (error) {
      if (!isOfflineFailure(error)) throw error;
      return this.local.getById(id);
    }
  }

  async create(input: CreateDossierInput): Promise<Dossier> {
    return this.local.create(input);
  }

  async update(input: UpdateDossierInput): Promise<Dossier> {
    return this.local.update(input);
  }

  async delete(id: string, workspaceId: string): Promise<number> {
    return this.local.delete(id, workspaceId);
  }
}

class OfflineFirstContractRepository implements ContractRepository {
  private readonly local = new LocalContractRepository();
  private readonly remote = new SupabaseContractRepository();

  async list(params: ContractListParams): Promise<ContractListResult> {
    const metadata = getWorkspaceSyncMetadata(params.workspaceId);
    if (params.deletionState === "deleted" ? metadata.lastTrashSyncedAt : metadata.lastFullSyncedAt) {
      return this.local.list(params);
    }
    try {
      if (typeof navigator !== "undefined" && !navigator.onLine) throw new TypeError("offline");
      if (params.all && !params.includeIds && !params.query && params.deletionState !== "deleted") {
        // Reconcile deletions and preserve queued changes before calculating totals.
        await syncSupabaseWorkspace(params.workspaceId, { verify: true });
        return this.local.list(params);
      }
      const remoteResult = await this.remote.list(params);
      cacheContracts(remoteResult.items);
      if (params.deletionState === "deleted" && params.all && !params.query && !params.includeIds && !params.status && params.dossierId === undefined && !params.onlyMine && !params.createdByIds?.length && !params.fiscalYear && (!params.dateFilterMode || params.dateFilterMode === "all") && !params.tagId && !params.assignments?.length && !params.positions?.length && !params.durations?.length && !params.excludeIds?.length) {
        setWorkspaceSyncMetadata(params.workspaceId, { lastTrashSyncedAt: new Date().toISOString() });
        await flushLocalDbWrites();
      }

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
    const cached = await this.local.getById(id);
    if (cached) return cached;
    if (getPendingContractIds().has(id)) return this.local.getById(id);
    try {
      if (typeof navigator !== "undefined" && !navigator.onLine) throw new TypeError("offline");
      const contract = await this.remote.getById(id);
      if (contract) cacheContract(contract);
      return this.local.getById(id);
    } catch (error) {
      if (!isOfflineFailure(error)) throw error;
      return this.local.getById(id);
    }
  }

  async getByIds(ids: string[], workspaceId: string): Promise<Contract[]> {
    const cached = await this.local.getByIds(ids, workspaceId);
    if (cached.length === new Set(ids).size || getWorkspaceSyncMetadata(workspaceId).lastFullSyncedAt) return cached;
    try {
      if (typeof navigator !== "undefined" && !navigator.onLine) throw new TypeError("offline");
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
    assertContractDuration(input.durationMonths);
    // Persist before any network work; AppLayout drains the outbox in the background.
    // Replay performs the authoritative fiscal-year duplicate check before insertion.
    input = bindContractMinister(input);
    return this.local.create({ ...input, id: input.id ?? createId(), annee_fiscale: input.annee_fiscale || getStoredFiscalYear() });
  }

  async createMany(inputs: CreateContractInput[]): Promise<Contract[]> {
    inputs.forEach(input => assertContractDuration(input.durationMonths));
    return this.local.createMany(inputs.map(input => bindContractMinister({
      ...input, id: input.id ?? createId(), annee_fiscale: input.annee_fiscale || getStoredFiscalYear()
    })));
  }

  async update(input: UpdateContractInput, expected?: Contract): Promise<Contract> {
    if (input.durationMonths !== undefined) assertContractDuration(input.durationMonths);
    return this.local.update(input, expected);
  }

  async assignToDossier(
    workspaceId: string,
    contractIds: string[],
    dossierId: string | null
  ): Promise<number> {
    return this.local.assignToDossier(workspaceId, contractIds, dossierId);
  }

  async updateStatus(
    workspaceId: string,
    contractIds: string[],
    status: ContractStatus
  ): Promise<number> {
    return this.local.updateStatus(workspaceId, contractIds, status);
  }

  async updateDuration(
    workspaceId: string,
    contractIds: string[],
    durationMonths: number
  ): Promise<number> {
    assertContractDuration(durationMonths);
    return this.local.updateDuration(workspaceId, contractIds, durationMonths);
  }

  async softDelete(id: string, workspaceId: string, expected?: Contract): Promise<void> {
    return this.local.softDelete(id, workspaceId, expected);
  }

  async permanentlyDelete(id: string, workspaceId: string): Promise<void> {
    if (typeof navigator !== "undefined" && !navigator.onLine) {
      throw new Error("Une connexion est nécessaire pour supprimer définitivement ce contrat.");
    }
    await syncPendingOutbox();
    await withBrowserLock("outbox-sync", async () => {
      await refreshLocalDb();
      if (getPendingContractIds().has(id)) {
        throw new Error("Synchronisez les modifications de ce contrat avant de le supprimer définitivement.");
      }
      await this.remote.permanentlyDelete(id, workspaceId);
      removeCachedContract(id, workspaceId);
      await flushLocalDbWrites();
    });
  }
}

class OfflineFirstTagRepository implements TagRepository {
  private readonly local = new LocalTagRepository();
  private readonly remote = new SupabaseTagRepository();

  async list(workspaceId: string): Promise<Tag[]> {
    if (getWorkspaceSyncMetadata(workspaceId).lastFullSyncedAt) return this.local.list(workspaceId);
    try {
      if (typeof navigator !== "undefined" && !navigator.onLine) throw new TypeError("offline");
      const tags = await this.remote.list(workspaceId);
      cacheTags(tags);
      return tags;
    } catch (error) {
      if (!isOfflineFailure(error)) throw error;
      return this.local.list(workspaceId);
    }
  }

  async create(input: CreateTagInput): Promise<Tag> {
    return this.local.create(input);
  }

  async assignToContract(workspaceId: string, contractId: string, tagId: string): Promise<void> {
    return this.local.assignToContract(workspaceId, contractId, tagId);
  }

  async removeFromContract(workspaceId: string, contractId: string, tagId: string): Promise<void> {
    return this.local.removeFromContract(workspaceId, contractId, tagId);
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
