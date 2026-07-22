import { CreateTagInput, TagRepository } from "../repositories/TagRepository";
import { Tag } from "../types";
import { createId } from "../../lib/uuid";
import { loadDb, saveDb, selectDb } from "./localDb";
import { queueOutbox } from "./localOutbox";

function now() {
  return new Date().toISOString();
}

function normalizeTagName(name: string) {
  return name.trim().replace(/\s+/g, " ");
}

function tagColor(name: string) {
  let hash = 0;
  for (const char of name) {
    hash = (hash * 31 + char.charCodeAt(0)) % 360;
  }
  return `hsl(${hash}, 70%, 42%)`;
}

export function readCachedTags(workspaceId: string): Tag[] {
  return selectDb((db) =>
    db.tags
      .filter((tag) => tag.workspaceId === workspaceId && !tag.deletedAt)
      .sort((a, b) => a.name.localeCompare(b.name))
  );
}

export class LocalTagRepository implements TagRepository {
  async list(workspaceId: string): Promise<Tag[]> {
    return readCachedTags(workspaceId);
  }

  async create(input: CreateTagInput): Promise<Tag> {
    const db = loadDb();
    const name = normalizeTagName(input.name);
    if (!name) {
      throw new Error("Le nom du tag est obligatoire.");
    }

    const existing = db.tags.find(
      (tag) =>
        tag.workspaceId === input.workspaceId &&
        !tag.deletedAt &&
        tag.name.localeCompare(name, undefined, { sensitivity: "accent" }) === 0
    );
    if (existing) {
      return existing;
    }

    const timestamp = now();
    const tag: Tag = {
      id: createId(),
      workspaceId: input.workspaceId,
      name,
      color: input.color || tagColor(name),
      createdAt: timestamp,
      updatedAt: timestamp,
      createdBy: input.createdBy ?? null
    };

    db.tags.push(tag);
    saveDb(db);
    queueOutbox(input.workspaceId, "tag.create", tag);
    return tag;
  }

  async applyAssignment(
    workspaceId: string,
    contractId: string,
    tagId: string,
    shouldQueue = false
  ): Promise<void> {
    const db = loadDb();
    const contractIndex = db.contracts.findIndex(
      (contract) =>
        contract.id === contractId &&
        contract.workspaceId === workspaceId &&
        !contract.deletedAt
    );
    if (contractIndex === -1) {
      throw new Error("Contrat introuvable.");
    }

    const tag = db.tags.find(
      (item) => item.id === tagId && item.workspaceId === workspaceId && !item.deletedAt
    );
    if (!tag) {
      throw new Error("Tag introuvable.");
    }

    const exists = db.contractTags.some(
      (item) => item.contractId === contractId && item.tagId === tagId
    );
    if (!exists) {
      db.contractTags.push({ contractId, tagId, createdAt: now() });
    }

    const currentTags = db.contracts[contractIndex].tags ?? [];
    if (!currentTags.some((item) => item.id === tag.id)) {
      db.contracts[contractIndex] = {
        ...db.contracts[contractIndex],
        tags: [...currentTags, tag],
        updatedAt: now()
      };
    }

    saveDb(db);
    if (shouldQueue) {
      queueOutbox(workspaceId, "tag.assign", { contractId, tagId });
    }
  }

  async assignToContract(workspaceId: string, contractId: string, tagId: string): Promise<void> {
    await this.applyAssignment(workspaceId, contractId, tagId, true);
  }

  async applyRemoval(
    workspaceId: string,
    contractId: string,
    tagId: string,
    shouldQueue = false
  ): Promise<void> {
    const db = loadDb();
    const contractIndex = db.contracts.findIndex(
      (contract) =>
        contract.id === contractId &&
        contract.workspaceId === workspaceId &&
        !contract.deletedAt
    );
    if (contractIndex === -1) {
      throw new Error("Contrat introuvable.");
    }

    db.contractTags = db.contractTags.filter(
      (item) => !(item.contractId === contractId && item.tagId === tagId)
    );
    db.contracts[contractIndex] = {
      ...db.contracts[contractIndex],
      tags: (db.contracts[contractIndex].tags ?? []).filter((tag) => tag.id !== tagId),
      updatedAt: now()
    };

    saveDb(db);
    if (shouldQueue) {
      queueOutbox(workspaceId, "tag.remove", { contractId, tagId });
    }
  }

  async removeFromContract(workspaceId: string, contractId: string, tagId: string): Promise<void> {
    await this.applyRemoval(workspaceId, contractId, tagId, true);
  }
}
