import type { PersonalTask } from "../../data/types";

export function ContractTaskIndicator({
  tasks,
  onOpenTasks
}: {
  tasks: PersonalTask[];
  onOpenTasks: () => void;
}) {
  if (tasks.length === 0) return null;

  const todoCount = tasks.filter((task) => task.status === "todo").length;
  const inProgressCount = tasks.filter(
    (task) => task.status === "in_progress"
  ).length;
  const doneCount = tasks.filter((task) => task.status === "done").length;
  const taskLabel = tasks.length === 1 ? "tâche privée liée" : "tâches privées liées";
  const title = [
    `${tasks.length} ${taskLabel}`,
    todoCount > 0 ? `${todoCount} à faire` : null,
    inProgressCount > 0 ? `${inProgressCount} en cours` : null,
    doneCount > 0 ? `${doneCount} terminée${doneCount > 1 ? "s" : ""}` : null
  ].filter(Boolean).join(" · ");

  return (
    <button
      type="button"
      className="icon-btn contract-task-trigger has-tasks"
      aria-label={`${tasks.length} ${taskLabel} à ce contrat`}
      title={title}
      onClick={(event) => {
        event.stopPropagation();
        onOpenTasks();
      }}
    >
      <span className="material-symbols-rounded">checklist</span>
    </button>
  );
}
