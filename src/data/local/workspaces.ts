import { Workspace } from "../types";

const seededAt = new Date().toISOString();

const WORKSPACES: Workspace[] = [
  {
    id: "workspace_default",
    name: "Planification",
    createdAt: seededAt,
    updatedAt: seededAt
  },
  {
    id: "workspace_mouvement",
    name: "Mouvement",
    createdAt: seededAt,
    updatedAt: seededAt
  },
  {
    id: "workspace_avantages",
    name: "Avantages Sociaux",
    createdAt: seededAt,
    updatedAt: seededAt
  }
];

export function listLocalWorkspaces(): Workspace[] {
  return [...WORKSPACES];
}

export function getDefaultWorkspace(): Workspace {
  return WORKSPACES[0];
}
