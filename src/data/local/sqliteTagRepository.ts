import { CreateTagInput, TagRepository } from "../repositories/TagRepository";
import { Tag } from "../types";
import { sqliteApiRequest } from "./sqliteApiClient";

export class SqliteTagRepository implements TagRepository {
  async list(workspaceId: string): Promise<Tag[]> {
    return sqliteApiRequest<Tag[]>(`/tags?workspaceId=${encodeURIComponent(workspaceId)}`);
  }

  async create(input: CreateTagInput): Promise<Tag> {
    return sqliteApiRequest<Tag>("/tags", {
      method: "POST",
      body: input
    });
  }

  async assignToContract(workspaceId: string, contractId: string, tagId: string): Promise<void> {
    await sqliteApiRequest<{ ok: boolean }>("/tags/assign", {
      method: "POST",
      body: { workspaceId, contractId, tagId }
    });
  }

  async removeFromContract(workspaceId: string, contractId: string, tagId: string): Promise<void> {
    await sqliteApiRequest<{ ok: boolean }>("/tags/remove", {
      method: "POST",
      body: { workspaceId, contractId, tagId }
    });
  }
}
