import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { TasksPage } from "./TasksPage";
import type { PersonalTask } from "../../data/types";

const createMutateAsync = vi.fn();
const statusMutateAsync = vi.fn();
let mockTasks: PersonalTask[] = [];
let mockContractSuggestions = [
  {
    id: "contract-1",
    nif: "123-456-789-0",
    personName: "Jean Dupont",
    position: "Comptable",
    fiscalYear: "2025-2026"
  }
];

vi.mock("../auth/auth", () => ({
  useAuth: () => ({
    user: {
      id: "current-user",
      username: "admin",
      name: "Administrateur",
      workspaceId: "workspace",
      role: "admin",
      taskSessionToken: "session-token"
    },
    logout: vi.fn()
  })
}));

vi.mock("./tasksApi", () => ({
  getTaskErrorMessage: (error: unknown) => String(error),
  usePrivateTasks: () => ({
    data: mockTasks,
    error: null,
    isLoading: false,
    isFetching: false,
    refetch: vi.fn()
  }),
  useTaskRecipients: () => ({
    data: [
      { id: "jean-id", username: "jdupont", fullName: "Jean Dupont" },
      { id: "marie-id", username: "marie", fullName: "Marie Noël" }
    ],
    error: null
  }),
  useTaskContractSuggestions: () => ({
    data: mockContractSuggestions,
    isFetching: false
  }),
  useCreatePrivateTask: () => ({
    isPending: false,
    mutateAsync: createMutateAsync
  }),
  useSetTaskStatus: () => ({
    isPending: false,
    mutateAsync: statusMutateAsync
  }),
  useDeletePrivateTask: () => ({
    isPending: false,
    mutateAsync: vi.fn()
  })
}));

describe("TasksPage", () => {
  afterEach(() => {
    cleanup();
  });

  beforeEach(() => {
    mockTasks = [];
    mockContractSuggestions = [
      {
        id: "contract-1",
        nif: "123-456-789-0",
        personName: "Jean Dupont",
        position: "Comptable",
        fiscalYear: "2025-2026"
      }
    ];
    createMutateAsync.mockReset();
    createMutateAsync.mockResolvedValue("task-id");
    statusMutateAsync.mockReset();
    statusMutateAsync.mockResolvedValue(true);
  });

  it("shows other users after @ and transmits to the selected account", async () => {
    render(<TasksPage />);

    const composer = screen.getByRole("textbox", {
      name: "Description de la tâche"
    });
    fireEvent.change(composer, {
      target: { value: "Préparer le rapport @je", selectionStart: 23 }
    });

    expect(screen.getByRole("listbox", { name: "Utilisateurs" })).toBeInTheDocument();
    fireEvent.click(
      screen.getByRole("option", { name: "Jean Dupont @jdupont arrow_forward" })
    );

    expect(screen.getByText("Jean Dupont", { selector: ".task-recipient-state strong" }))
      .toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "send Transmettre" }));

    await waitFor(() => {
      expect(createMutateAsync).toHaveBeenCalledWith({
        content: "Préparer le rapport @jdupont",
        assigneeId: "jean-id"
      });
    });
  });

  it("keeps a task private when no account is tagged", async () => {
    render(<TasksPage />);

    const composer = screen.getByRole("textbox", {
      name: "Description de la tâche"
    });
    fireEvent.change(composer, {
      target: { value: "Relire le dossier", selectionStart: 16 }
    });
    fireEvent.click(screen.getByRole("button", { name: "add_task Ajouter" }));

    await waitFor(() => {
      expect(createMutateAsync).toHaveBeenCalledWith({
        content: "Relire le dossier",
        assigneeId: null
      });
    });
  });

  it("suggests a contract by NIF after #", () => {
    render(<TasksPage />);

    const composer = screen.getByRole("textbox", {
      name: "Description de la tâche"
    });
    fireEvent.change(composer, {
      target: { value: "Vérifier #123", selectionStart: 13 }
    });

    expect(screen.getByRole("listbox", { name: "Contrats par NIF" }))
      .toBeInTheDocument();
    fireEvent.click(screen.getByText("#123-456-789-0"));

    expect(composer).toHaveValue("Vérifier #123-456-789-0 ");
    expect(
      screen.getByText("#123-456-789-0", {
        selector: ".task-contract-state strong"
      })
    ).toBeInTheDocument();
  });

  it("moves a task to En cours by dragging it in the Kanban", async () => {
    mockTasks = [
      {
        id: "task-1",
        content: "Préparer les contrats",
        status: "todo",
        completed: false,
        completedAt: null,
        createdAt: "2026-07-29T12:00:00.000Z",
        updatedAt: "2026-07-29T12:00:00.000Z",
        createdBy: "current-user",
        createdByName: "Administrateur",
        createdByUsername: "admin"
      }
    ];
    render(<TasksPage />);

    fireEvent.click(screen.getByRole("button", { name: "view_kanban Kanban" }));

    const card = screen.getByLabelText("Tâche : Préparer les contrats");
    const inProgressColumn = screen.getByLabelText("Colonne En cours");
    const dataTransfer = {
      effectAllowed: "move",
      dropEffect: "move",
      setData: vi.fn(),
      getData: vi.fn(() => "task-1")
    };

    fireEvent.dragStart(card, { dataTransfer });
    fireEvent.dragOver(inProgressColumn, { dataTransfer });
    fireEvent.drop(inProgressColumn, { dataTransfer });

    await waitFor(() => {
      expect(statusMutateAsync).toHaveBeenCalledWith({
        taskId: "task-1",
        status: "in_progress"
      });
    });
  });
});
