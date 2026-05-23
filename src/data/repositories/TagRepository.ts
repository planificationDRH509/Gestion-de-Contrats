import { Tag } from "../types";

export type CreateTagInput = {
  workspaceId: string;
  name: string;
  color?: string;
  createdBy?: string | null;
};

export interface TagRepository {
  list(workspaceId: string): Promise<Tag[]>;
  create(input: CreateTagInput): Promise<Tag>;
  assignToContract(workspaceId: string, contractId: string, tagId: string): Promise<void>;
  removeFromContract(workspaceId: string, contractId: string, tagId: string): Promise<void>;
}
