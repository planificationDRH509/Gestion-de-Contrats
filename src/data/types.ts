import type { AppRole } from "../features/auth/permissions";
import type { Minister } from "../lib/ministers";

export type Gender = "Homme" | "Femme";

export type AuditValue = string | number | boolean | null;

export type AuditActor = {
  id?: string | null;
  name: string;
  role?: AppRole | null;
};

export type ContractAuditChange = {
  field: string;
  previousValue: AuditValue;
  newValue: AuditValue;
};

export type ContractAuditAction =
  | "creation"
  | "modification"
  | "status"
  | "dossier"
  | "duration"
  | "comment"
  | "deletion";

export type ContractAuditEntry = {
  id: string;
  action: ContractAuditAction;
  at: string;
  actor: AuditActor;
  changes: ContractAuditChange[];
};

export type ContractAuditHistory = {
  version: 2;
  createdAt: string;
  createdBy: AuditActor;
  entries: ContractAuditEntry[];
};

export type Workspace = {
  id: string;
  name: string;
  createdAt: string;
  updatedAt: string;
  /** Time of the user edit, preserved across delayed uploads. */
  modifiedAt?: string | null;
};

export type Applicant = {
  id: string;
  workspaceId: string;
  gender: Gender;
  firstName: string;
  lastName: string;
  nif?: string | null;
  ninu?: string | null;
  phone?: string | null;
  address: string;
  createdAt: string;
  updatedAt: string;
  /** Time of the user edit, preserved across delayed uploads. */
  modifiedAt?: string | null;
  /** Exact cloud version for conditional writes; null is distinct from createdAt. */
  remoteUpdatedAt?: string | null;
  deletedAt?: string | null;
  createdBy?: string | null;
};

export type Dossier = {
  id: string;
  workspaceId: string;
  name: string;
  status: DossierStatus;
  isEphemeral: boolean;
  priority: DossierPriority;
  contractTargetCount: number;
  comment?: string | null;
  deadlineDate?: string | null;
  focalPoint?: string | null;
  roadmapSheetNumber?: string | null;
  defaultDurationMonths?: number | null;
  createdAt: string;
  updatedAt: string;
  /** Time of the user edit, preserved across delayed uploads. */
  modifiedAt?: string | null;
  remoteUpdatedAt?: string | null;
  deletedAt?: string | null;
  createdBy?: string | null;
};

export type DossierStatus = "active" | "classified";

export type DossierPriority = "normal" | "urgence";

export type ContractStatus = 
  | "draft" 
  | "final" 
  | "liste"
  | "saisie" 
  | "correction" 
  | "impression_partiel" 
  | "imprime" 
  | "signe" 
  | "transfere" 
  | "classe";

export type Tag = {
  id: string;
  workspaceId: string;
  name: string;
  color: string;
  createdAt: string;
  updatedAt: string;
  deletedAt?: string | null;
  createdBy?: string | null;
};

export type Contract = {
  ministerId?: string;
  /** Immutable reference data cached with the contract for offline printing. */
  minister?: Minister;
  id: string;
  workspaceId: string;
  dossierId?: string | null;
  applicantId: string | null;
  status: ContractStatus;
  gender: Gender;
  firstName: string;
  lastName: string;
  nif?: string | null;
  ninu?: string | null;
  address: string;
  position: string;
  assignment: string;
  salaryNumber: number;
  /** Derived from salaryNumber; never persisted as contract data. */
  salaryText: string;
  durationMonths: number;
  /** Fiscal year stored on the contract, for example "2025-2026". */
  annee_fiscale?: string | null;
  createdAt: string;
  updatedAt: string;
  /** Time of the user edit, preserved across delayed uploads. */
  modifiedAt?: string | null;
  /** Exact cloud version for conditional writes; null is distinct from createdAt. */
  remoteUpdatedAt?: string | null;
  deletedAt?: string | null;
  createdBy?: string | null;
  commentaire?: string | null;
  tags?: Tag[];
  auditHistory?: ContractAuditHistory;
};

export type ContractPrintJob = {
  id: string;
  workspaceId: string;
  contractIds: string[];
  createdAt: string;
  printedAt?: string | null;
};

export type OutboxItem = {
  id: string;
  workspaceId: string;
  type:
    | "contract.create"
    | "contract.update"
    | "contract.delete"
    | "applicant.upsert"
    | "applicant.delete"
    | "dossier.create"
    | "dossier.update"
    | "dossier.delete"
    | "tag.create"
    | "tag.assign"
    | "tag.remove"
    | "list.operation"
    | "print.create"
    | "pin.set"
    | "reference.change";
  payload: Record<string, unknown>;
  createdAt: string;
  /** Independent of createdAt, which also preserves dependency ordering. */
  modifiedAt?: string;
  syncedAt?: string | null;
  /** Completed without insertion because this NIF/fiscal year already exists. */
  skippedDuplicateId?: string;
  /** Explicit cancellation retained so an import journal cannot recreate it. */
  ignoredAt?: string;
  lastError?: string | null;
  failureKind?: "temporary" | "correction" | "action" | "dependency";
  /** Keep the row in the correction area until its server acknowledgement. */
  correctionPending?: boolean;
  sequence?: number;
  actorId?: string;
  conflict?: { fields: string[]; remote: Record<string, unknown> };
};

export type ContractSort =
  | "createdAt_desc"
  | "createdAt_asc"
  | "name_asc"
  | "name_desc"
  | "nif_asc"
  | "nif_desc";

export type ContractListParams = {
  workspaceId: string;
  /** Select active contracts by default, or only soft-deleted contracts for the trash. */
  deletionState?: "active" | "deleted";
  query?: string;
  sort?: ContractSort;
  page?: number;
  pageSize?: number;
  /** Absolute offset for composed pages, independent of page/pageSize. */
  offset?: number;
  includeIds?: string[];
  excludeIds?: string[];
  /** Personal priority order; composed by the contract list query. */
  pinnedIds?: string[];
  /** Load every matching contract for statistics and exports. */
  all?: boolean;
  onlyMine?: boolean;
  userId?: string;
  createdByIds?: string[];
  status?: ContractStatus;
  dossierId?: string | null;
  fiscalYear?: string;
  dateFilterMode?: ContractDateFilterMode;
  dateFilterDate?: string;
  dateFilterStart?: string;
  dateFilterEnd?: string;
  tagId?: string;
  assignments?: string[];
  positions?: string[];
  durations?: number[];
};

export type ContractDateFilterMode =
  | "all"
  | "day"
  | "range"
  | "week"
  | "month"
  | "fiscal_year_current";

export type ContractListResult = {
  items: Contract[];
  total: number;
  page: number;
  pageSize: number;
};

export type CreateContractInput = Omit<
  Contract,
  "id" | "createdAt" | "updatedAt" | "deletedAt" | "salaryText"
> & { id?: string; salaryText?: string; skipFiscalYearDuplicate?: boolean };

export type UpdateContractInput = Partial<CreateContractInput> & { id: string; createdAt?: string };

export type UpsertApplicantInput = Omit<
  Applicant,
  "id" | "createdAt" | "updatedAt" | "deletedAt"
> & { id?: string; expectedUpdatedAt?: string; importContractId?: string };

export type CreateDossierInput = {
  workspaceId: string;
  name: string;
  status?: DossierStatus;
  isEphemeral?: boolean;
  priority?: DossierPriority;
  contractTargetCount?: number;
  comment?: string | null;
  deadlineDate?: string | null;
  focalPoint?: string | null;
  roadmapSheetNumber?: string | null;
  defaultDurationMonths?: number | null;
  createdBy?: string;
};

export type UpdateDossierInput = {
  id: string;
  workspaceId: string;
  name?: string;
  status?: DossierStatus;
  isEphemeral?: boolean;
  priority?: DossierPriority;
  contractTargetCount?: number;
  comment?: string | null;
  deadlineDate?: string | null;
  focalPoint?: string | null;
  roadmapSheetNumber?: string | null;
  defaultDurationMonths?: number | null;
};

export type AppUser = {
  isSuspended?: boolean;
  id: string;
  username: string;
  password?: string;
  fullName: string;
  role: AppRole;
  createdAt: string | null;
  updatedAt: string | null;
};

export type TaskRecipient = {
  id: string;
  username: string;
  fullName: string;
};

export type TaskStatus = "todo" | "in_progress" | "done";

export type PersonalTask = {
  notes?: string;
  kind?: "task" | "note";
  id: string;
  content: string;
  status: TaskStatus;
  completed: boolean;
  completedAt: string | null;
  createdAt: string;
  updatedAt: string;
  createdBy: string;
  createdByName: string;
  createdByUsername: string;
};
