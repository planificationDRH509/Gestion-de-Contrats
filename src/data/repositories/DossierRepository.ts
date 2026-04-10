import { CreateDossierInput, Dossier, UpdateDossierInput } from "../types";

export interface DossierRepository {
  list(workspaceId: string): Promise<Dossier[]>;
  getById(id: string): Promise<Dossier | null>;
  create(input: CreateDossierInput): Promise<Dossier>;
  update(input: UpdateDossierInput): Promise<Dossier>;
  delete(id: string, workspaceId: string): Promise<number>;
}
