import { DossierRepository } from "../repositories/DossierRepository";
import { CreateDossierInput, Dossier, UpdateDossierInput } from "../types";
import { sqliteApiRequest } from "./sqliteApiClient";

export class SqliteDossierRepository implements DossierRepository {
  async list(workspaceId: string): Promise<Dossier[]> {
    const params = new URLSearchParams({ workspaceId });
    return sqliteApiRequest<Dossier[]>(`/dossiers?${params.toString()}`);
  }

  async getById(id: string): Promise<Dossier | null> {
    return sqliteApiRequest<Dossier | null>(`/dossiers/${encodeURIComponent(id)}`);
  }

  async create(input: CreateDossierInput): Promise<Dossier> {
    return sqliteApiRequest<Dossier>("/dossiers", {
      method: "POST",
      body: input
    });
  }

  async update(input: UpdateDossierInput): Promise<Dossier> {
    return sqliteApiRequest<Dossier>(`/dossiers/${encodeURIComponent(input.id)}`, {
      method: "PATCH",
      body: input
    });
  }

  async delete(id: string, workspaceId: string): Promise<number> {
    return sqliteApiRequest<number>("/dossiers/delete", {
      method: "POST",
      body: {
        id,
        workspaceId
      }
    });
  }
}
