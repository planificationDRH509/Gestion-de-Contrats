import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { PersonalTask, TaskStatus } from "../../data/types";
import { ContractTaskIndicator } from "./ContractTaskIndicator";

afterEach(cleanup);

function createTask(id: string, status: TaskStatus): PersonalTask {
  return {
    id,
    content: `Tâche ${id} pour #123-456`,
    status,
    completed: status === "done",
    completedAt: status === "done" ? "2026-07-29T00:00:00.000Z" : null,
    createdAt: "2026-07-29T00:00:00.000Z",
    updatedAt: "2026-07-29T00:00:00.000Z",
    createdBy: "user-1",
    createdByName: "Jean Dupont",
    createdByUsername: "jdupont"
  };
}

describe("ContractTaskIndicator", () => {
  it("shows one compact icon when private tasks are linked", () => {
    const openTasks = vi.fn();
    render(
      <ContractTaskIndicator
        tasks={[
          createTask("1", "todo"),
          createTask("2", "in_progress"),
          createTask("3", "done")
        ]}
        onOpenTasks={openTasks}
      />
    );

    const indicator = screen.getByRole("button", {
      name: "3 tâches privées liées à ce contrat"
    });
    expect(indicator).toHaveAttribute(
      "title",
      "3 tâches privées liées · 1 à faire · 1 en cours · 1 terminée"
    );
    expect(screen.queryByText("Tâche 1 pour #123-456")).not.toBeInTheDocument();

    fireEvent.click(indicator);
    expect(openTasks).toHaveBeenCalledOnce();
  });

  it("renders nothing when the contract has no linked task", () => {
    const { container } = render(
      <ContractTaskIndicator tasks={[]} onOpenTasks={vi.fn()} />
    );

    expect(container).toBeEmptyDOMElement();
  });

  it("uses a singular accessible label for one task", () => {
    render(
      <ContractTaskIndicator
        tasks={[createTask("1", "todo")]}
        onOpenTasks={vi.fn()}
      />
    );

    expect(
      screen.getByRole("button", {
        name: "1 tâche privée liée à ce contrat"
      })
    ).toBeInTheDocument();
  });
});
