export type Gender = "Homme" | "Femme";

export type Workspace = {
  id: string;
  name: string;
  createdAt: string;
  updatedAt: string;
};

export type Applicant = {
  id: string;
  workspaceId: string;
  gender: Gender;
  firstName: string;
  lastName: string;
  nif?: string | null;
  ninu?: string | null;
  address: string;
  createdAt: string;
  updatedAt: string;
  deletedAt?: string | null;
  createdBy?: string | null;
};

export type Dossier = {
  id: string;
  workspaceId: string;
  name: string;
  isEphemeral: boolean;
  priority: DossierPriority;
  contractTargetCount: number;
  comment?: string | null;
  deadlineDate?: string | null;
  focalPoint?: string | null;
  roadmapSheetNumber?: string | null;
  createdAt: string;
  updatedAt: string;
  deletedAt?: string | null;
  createdBy?: string | null;
};

export type DossierPriority = "normal" | "urgence";

export type ContractStatus = 
  | "draft" 
  | "final" 
  | "saisie" 
  | "correction" 
  | "impression_partiel" 
  | "imprime" 
  | "signe" 
  | "transfere" 
  | "classe";

export type Contract = {
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
  salaryText: string;
  durationMonths: number;
  createdAt: string;
  updatedAt: string;
  deletedAt?: string | null;
  createdBy?: string | null;
  commentaire?: string | null;
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
    | "applicant.upsert";
  payload: Record<string, unknown>;
  createdAt: string;
  syncedAt?: string | null;
};

export type ContractListParams = {
  workspaceId: string;
  query?: string;
  sort?: "createdAt_desc" | "createdAt_asc" | "name_asc" | "name_desc";
  page?: number;
  pageSize?: number;
  onlyMine?: boolean;
  userId?: string;
  status?: ContractStatus;
  dossierId?: string | null;
  dateFilterMode?: ContractDateFilterMode;
  dateFilterDate?: string;
  dateFilterStart?: string;
  dateFilterEnd?: string;
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
  "id" | "createdAt" | "updatedAt" | "deletedAt"
>;

export type UpdateContractInput = Partial<CreateContractInput> & { id: string };

export type UpsertApplicantInput = Omit<
  Applicant,
  "id" | "createdAt" | "updatedAt" | "deletedAt"
> & { id?: string };

export type CreateDossierInput = {
  workspaceId: string;
  name: string;
  isEphemeral?: boolean;
  priority?: DossierPriority;
  contractTargetCount?: number;
  comment?: string | null;
  deadlineDate?: string | null;
  focalPoint?: string | null;
  roadmapSheetNumber?: string | null;
  createdBy?: string;
};

export type UpdateDossierInput = {
  id: string;
  workspaceId: string;
  name?: string;
  isEphemeral?: boolean;
  priority?: DossierPriority;
  contractTargetCount?: number;
  comment?: string | null;
  deadlineDate?: string | null;
  focalPoint?: string | null;
  roadmapSheetNumber?: string | null;
};

export type AppUser = {
  id: string;
  username: string;
  password?: string;
  fullName: string;
  workspaces: string[];
  createdAt: string | null;
  updatedAt: string | null;
};
