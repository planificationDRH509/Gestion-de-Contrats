import {
  useMemo,
  useRef,
  useState,
  type DragEvent,
  type FormEvent,
  type KeyboardEvent
} from "react";
import { useAuth } from "../auth/auth";
import type {
  PersonalTask,
  TaskRecipient,
  TaskStatus
} from "../../data/types";
import {
  filterTaskRecipients,
  findActiveMention,
  insertRecipientMention,
  type ActiveMention
} from "./taskMentions";
import {
  getTaskErrorMessage,
  useCreatePrivateTask,
  useDeletePrivateTask,
  usePrivateTasks,
  useSetTaskStatus,
  useTaskRecipients
} from "./tasksApi";

type TaskFilter = "all" | TaskStatus;
type TaskView = "list" | "kanban";

const TASK_COLUMNS: Array<{
  status: TaskStatus;
  label: string;
  icon: string;
}> = [
  { status: "todo", label: "À faire", icon: "radio_button_unchecked" },
  { status: "in_progress", label: "En cours", icon: "pending" },
  { status: "done", label: "Terminées", icon: "task_alt" }
];

const TASK_STATUS_LABELS: Record<TaskStatus, string> = {
  todo: "À faire",
  in_progress: "En cours",
  done: "Terminée"
};

const taskDateFormatter = new Intl.DateTimeFormat("fr-HT", {
  day: "numeric",
  month: "short",
  hour: "2-digit",
  minute: "2-digit"
});

export function TasksPage() {
  const { user, logout } = useAuth();
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const tasksQuery = usePrivateTasks();
  const recipientsQuery = useTaskRecipients();
  const createTask = useCreatePrivateTask();
  const setStatus = useSetTaskStatus();
  const deleteTask = useDeletePrivateTask();

  const [draft, setDraft] = useState("");
  const [recipient, setRecipient] = useState<TaskRecipient | null>(null);
  const [activeMention, setActiveMention] = useState<ActiveMention | null>(null);
  const [highlightedIndex, setHighlightedIndex] = useState(0);
  const [filter, setFilter] = useState<TaskFilter>("all");
  const [view, setView] = useState<TaskView>("list");
  const [draggedTaskId, setDraggedTaskId] = useState<string | null>(null);
  const [dragTargetStatus, setDragTargetStatus] = useState<TaskStatus | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  const recipients = recipientsQuery.data ?? [];
  const suggestions = useMemo(
    () => filterTaskRecipients(recipients, activeMention?.query ?? "").slice(0, 6),
    [activeMention?.query, recipients]
  );
  const tasks = tasksQuery.data ?? [];
  const todoCount = tasks.filter((task) => task.status === "todo").length;
  const inProgressCount = tasks.filter((task) => task.status === "in_progress").length;
  const completedCount = tasks.filter((task) => task.status === "done").length;
  const visibleTasks = tasks.filter((task) => {
    return filter === "all" || task.status === filter;
  });

  const sessionUnavailable = !user?.taskSessionToken;
  const queryError = tasksQuery.error ?? recipientsQuery.error;
  const isBusy = createTask.isPending || setStatus.isPending || deleteTask.isPending;

  function updateMention(value: string, caret: number) {
    const mention = findActiveMention(value, caret);
    setActiveMention(mention);
    setHighlightedIndex(0);

    if (recipient && !value.includes(`@${recipient.username}`)) {
      setRecipient(null);
    }
  }

  function selectRecipient(nextRecipient: TaskRecipient) {
    if (!activeMention) return;
    const inserted = insertRecipientMention(draft, activeMention, nextRecipient);
    setDraft(inserted.value);
    setRecipient(nextRecipient);
    setActiveMention(null);

    window.requestAnimationFrame(() => {
      textareaRef.current?.focus();
      textareaRef.current?.setSelectionRange(inserted.caret, inserted.caret);
    });
  }

  function handleComposerKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (activeMention && suggestions.length > 0) {
      if (event.key === "ArrowDown") {
        event.preventDefault();
        setHighlightedIndex((current) => (current + 1) % suggestions.length);
        return;
      }
      if (event.key === "ArrowUp") {
        event.preventDefault();
        setHighlightedIndex((current) =>
          (current - 1 + suggestions.length) % suggestions.length
        );
        return;
      }
      if (event.key === "Enter" && !event.shiftKey) {
        event.preventDefault();
        selectRecipient(suggestions[highlightedIndex] ?? suggestions[0]);
        return;
      }
      if (event.key === "Escape") {
        event.preventDefault();
        setActiveMention(null);
        return;
      }
    }

    if ((event.ctrlKey || event.metaKey) && event.key === "Enter") {
      event.preventDefault();
      event.currentTarget.form?.requestSubmit();
    }
  }

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    const content = draft.trim();
    if (!content || createTask.isPending) return;

    setActionError(null);
    setNotice(null);
    try {
      await createTask.mutateAsync({
        content,
        assigneeId: recipient?.id ?? null
      });
      setDraft("");
      setActiveMention(null);
      setRecipient(null);
      setNotice(
        recipient
          ? `Tâche transmise à ${recipient.fullName}.`
          : "Tâche ajoutée à votre liste privée."
      );
      window.setTimeout(() => setNotice(null), 3500);
    } catch (error) {
      setActionError(getTaskErrorMessage(error));
    }
  }

  async function changeTaskStatus(taskId: string, status: TaskStatus) {
    setActionError(null);
    try {
      await setStatus.mutateAsync({ taskId, status });
    } catch (error) {
      setActionError(getTaskErrorMessage(error));
    }
  }

  function handleDragStart(event: DragEvent<HTMLElement>, taskId: string) {
    setDraggedTaskId(taskId);
    event.dataTransfer.effectAllowed = "move";
    event.dataTransfer.setData("text/task-id", taskId);
  }

  function handleDragEnd() {
    setDraggedTaskId(null);
    setDragTargetStatus(null);
  }

  function handleDrop(event: DragEvent<HTMLElement>, status: TaskStatus) {
    event.preventDefault();
    const taskId = event.dataTransfer.getData("text/task-id") || draggedTaskId;
    const task = tasks.find((item) => item.id === taskId);
    handleDragEnd();
    if (!task || task.status === status) return;
    void changeTaskStatus(task.id, status);
  }

  async function removeTask(taskId: string) {
    if (!window.confirm("Supprimer cette tâche ?")) return;
    setActionError(null);
    try {
      await deleteTask.mutateAsync(taskId);
    } catch (error) {
      setActionError(getTaskErrorMessage(error));
    }
  }

  return (
    <div className="page-container tasks-page">
      <header className="section-header page-header tasks-page-header">
        <div>
          <span className="page-eyebrow">Espace personnel</span>
          <h1 className="section-title">Mes tâches</h1>
          <div className="section-subtitle">
            Votre liste est confidentielle. Utilisez <strong>@</strong> pour transmettre une tâche.
          </div>
        </div>
        <button
          type="button"
          className="btn btn-outline tasks-sync-button"
          onClick={() => void tasksQuery.refetch()}
          disabled={tasksQuery.isFetching || sessionUnavailable}
        >
          <span className={`material-symbols-rounded${tasksQuery.isFetching ? " is-spinning" : ""}`}>
            sync
          </span>
          Synchroniser
        </button>
      </header>

      {sessionUnavailable ? (
        <section className="card tasks-session-card" role="alert">
          <span className="material-symbols-rounded">lock</span>
          <div>
            <h2>Reconnectez-vous une fois</h2>
            <p>
              Une nouvelle session sécurisée est nécessaire pour ouvrir votre liste confidentielle.
            </p>
          </div>
          <button type="button" className="btn btn-primary" onClick={logout}>
            Se reconnecter
          </button>
        </section>
      ) : null}

      {queryError || actionError ? (
        <div className="app-toast app-toast-error tasks-toast" role="alert">
          <span className="material-symbols-rounded">error</span>
          <span>{actionError ?? getTaskErrorMessage(queryError)}</span>
          {actionError ? (
            <button type="button" onClick={() => setActionError(null)} aria-label="Fermer">
              <span className="material-symbols-rounded">close</span>
            </button>
          ) : null}
        </div>
      ) : null}

      {notice ? (
        <div className="app-toast app-toast-success tasks-toast" role="status">
          <span className="material-symbols-rounded">check_circle</span>
          <span>{notice}</span>
        </div>
      ) : null}

      <section className={`card task-composer-card${sessionUnavailable ? " is-disabled" : ""}`}>
        <form onSubmit={handleSubmit}>
          <div className="task-composer-heading">
            <div>
              <h2>Nouvelle tâche</h2>
              <p>Sans destinataire, elle reste visible uniquement par vous.</p>
            </div>
            <span className="task-privacy-badge">
              <span className="material-symbols-rounded">lock</span>
              Privée
            </span>
          </div>

          <div className="task-composer-input-wrap">
            <textarea
              ref={textareaRef}
              className="textarea task-composer-input"
              value={draft}
              rows={3}
              maxLength={1000}
              disabled={sessionUnavailable}
              placeholder="Ex. Vérifier les dossiers… Tapez @ pour transmettre"
              aria-label="Description de la tâche"
              aria-expanded={Boolean(activeMention && suggestions.length)}
              aria-controls="task-mention-suggestions"
              onChange={(event) => {
                setDraft(event.target.value);
                updateMention(event.target.value, event.target.selectionStart);
              }}
              onClick={(event) =>
                updateMention(event.currentTarget.value, event.currentTarget.selectionStart)
              }
              onKeyUp={(event) => {
                if (["ArrowDown", "ArrowUp", "Enter", "Escape"].includes(event.key)) return;
                updateMention(event.currentTarget.value, event.currentTarget.selectionStart);
              }}
              onKeyDown={handleComposerKeyDown}
            />

            {activeMention && suggestions.length > 0 ? (
              <div
                className="task-mention-menu"
                id="task-mention-suggestions"
                role="listbox"
                aria-label="Utilisateurs"
              >
                <div className="task-mention-menu-label">Transmettre à</div>
                {suggestions.map((suggestion, index) => (
                  <button
                    key={suggestion.id}
                    type="button"
                    className={`task-mention-option${index === highlightedIndex ? " is-active" : ""}`}
                    role="option"
                    aria-selected={index === highlightedIndex}
                    onMouseDown={(event) => event.preventDefault()}
                    onClick={() => selectRecipient(suggestion)}
                  >
                    <span className="task-avatar" aria-hidden="true">
                      {suggestion.fullName.slice(0, 1).toUpperCase()}
                    </span>
                    <span>
                      <strong>{suggestion.fullName}</strong>
                      <small>@{suggestion.username}</small>
                    </span>
                    <span className="material-symbols-rounded">arrow_forward</span>
                  </button>
                ))}
              </div>
            ) : null}
          </div>

          <div className="task-composer-footer">
            <div className="task-recipient-state">
              {recipient ? (
                <>
                  <span className="material-symbols-rounded">send</span>
                  Sera transmise à <strong>{recipient.fullName}</strong>
                  <button
                    type="button"
                    onClick={() => {
                      setDraft((current) =>
                        current.replace(`@${recipient.username}`, "").replace(/\s{2,}/g, " ")
                      );
                      setRecipient(null);
                    }}
                    aria-label="Retirer le destinataire"
                  >
                    <span className="material-symbols-rounded">close</span>
                  </button>
                </>
              ) : (
                <>
                  <span className="material-symbols-rounded">alternate_email</span>
                  Tapez @ puis choisissez un compte
                </>
              )}
            </div>
            <button
              type="submit"
              className="btn btn-primary"
              disabled={!draft.trim() || createTask.isPending || sessionUnavailable}
            >
              <span className="material-symbols-rounded">
                {recipient ? "send" : "add_task"}
              </span>
              {createTask.isPending
                ? "Envoi…"
                : recipient
                  ? "Transmettre"
                  : "Ajouter"}
            </button>
          </div>
        </form>
      </section>

      <section className="tasks-list-section">
        <div className="tasks-list-heading">
          <div>
            <h2>Ma liste</h2>
            <span>
              {todoCount} à faire · {inProgressCount} en cours · {completedCount} terminée
              {completedCount === 1 ? "" : "s"}
            </span>
          </div>
          <div className="tasks-list-controls">
            <div className="task-view-switch" aria-label="Mode d’affichage">
              <button
                type="button"
                className={view === "list" ? "is-active" : ""}
                aria-pressed={view === "list"}
                onClick={() => setView("list")}
              >
                <span className="material-symbols-rounded">view_list</span>
                Liste
              </button>
              <button
                type="button"
                className={view === "kanban" ? "is-active" : ""}
                aria-pressed={view === "kanban"}
                onClick={() => setView("kanban")}
              >
                <span className="material-symbols-rounded">view_kanban</span>
                Kanban
              </button>
            </div>
            {view === "list" ? (
              <div className="tasks-filter" aria-label="Filtrer les tâches">
                {([
                  ["all", "Toutes"],
                  ["todo", "À faire"],
                  ["in_progress", "En cours"],
                  ["done", "Terminées"]
                ] as const).map(([value, label]) => (
                  <button
                    key={value}
                    type="button"
                    className={filter === value ? "is-active" : ""}
                    onClick={() => setFilter(value)}
                  >
                    {label}
                  </button>
                ))}
              </div>
            ) : null}
          </div>
        </div>

        {tasksQuery.isLoading ? (
          <div className="tasks-loading" role="status">
            <span className="material-symbols-rounded is-spinning">sync</span>
            Synchronisation de votre liste…
          </div>
        ) : view === "list" && visibleTasks.length === 0 ? (
          <div className="tasks-empty-state">
            <span className="material-symbols-rounded">
              {filter === "done" ? "task_alt" : "checklist"}
            </span>
            <h3>
              {filter === "done"
                ? "Aucune tâche terminée"
                : filter === "all"
                  ? "Votre liste est à jour"
                  : "Aucune tâche dans cet état"}
            </h3>
            <p>
              {filter === "done"
                ? "Les tâches cochées apparaîtront ici."
                : "Ajoutez une tâche personnelle ou transmettez-en une avec @."}
            </p>
          </div>
        ) : view === "list" ? (
          <div className="tasks-list">
            {visibleTasks.map((task) => {
              const received = task.createdBy !== user?.id;
              return (
                <article
                  key={task.id}
                  className={`task-row is-${task.status}${task.status === "done" ? " is-completed" : ""}`}
                >
                  <button
                    type="button"
                    className="task-check"
                    aria-label={task.status === "done" ? "Rouvrir la tâche" : "Terminer la tâche"}
                    aria-pressed={task.status === "done"}
                    disabled={isBusy}
                    onClick={() =>
                      void changeTaskStatus(task.id, task.status === "done" ? "todo" : "done")
                    }
                  >
                    <span className="material-symbols-rounded">
                      {task.status === "done" ? "check_circle" : "radio_button_unchecked"}
                    </span>
                  </button>
                  <div className="task-row-content">
                    <p>{task.content}</p>
                    <div className="task-row-meta">
                      <TaskStatusSelect
                        task={task}
                        disabled={isBusy}
                        onChange={(status) => void changeTaskStatus(task.id, status)}
                      />
                      {received ? (
                        <span className="task-sender">
                          <span className="material-symbols-rounded">forward_to_inbox</span>
                          Transmise par <strong>{task.createdByName}</strong>
                        </span>
                      ) : (
                        <span>
                          <span className="material-symbols-rounded">lock</span>
                          Personnelle
                        </span>
                      )}
                      <span>{taskDateFormatter.format(new Date(task.createdAt))}</span>
                    </div>
                  </div>
                  <button
                    type="button"
                    className="task-delete-button"
                    aria-label="Supprimer la tâche"
                    disabled={isBusy}
                    onClick={() => void removeTask(task.id)}
                  >
                    <span className="material-symbols-rounded">delete</span>
                  </button>
                </article>
              );
            })}
          </div>
        ) : (
          <div className="tasks-kanban" aria-label="Tableau Kanban">
            {TASK_COLUMNS.map((column) => {
              const columnTasks = tasks.filter((task) => task.status === column.status);
              const isDropTarget = dragTargetStatus === column.status;
              return (
                <section
                  key={column.status}
                  className={`kanban-column is-${column.status}${isDropTarget ? " is-drop-target" : ""}`}
                  aria-label={`Colonne ${column.label}`}
                  onDragOver={(event) => {
                    event.preventDefault();
                    event.dataTransfer.dropEffect = "move";
                    setDragTargetStatus(column.status);
                  }}
                  onDrop={(event) => handleDrop(event, column.status)}
                >
                  <header className="kanban-column-header">
                    <span className="material-symbols-rounded">{column.icon}</span>
                    <h3>{column.label}</h3>
                    <span className="kanban-count">{columnTasks.length}</span>
                  </header>
                  <div className="kanban-column-body">
                    {columnTasks.length === 0 ? (
                      <div className="kanban-column-empty">
                        <span className="material-symbols-rounded">move_to_inbox</span>
                        Glissez une tâche ici
                      </div>
                    ) : (
                      columnTasks.map((task) => {
                        const received = task.createdBy !== user?.id;
                        return (
                          <article
                            key={task.id}
                            className={`kanban-card${draggedTaskId === task.id ? " is-dragging" : ""}`}
                            draggable={!isBusy}
                            aria-label={`Tâche : ${task.content}`}
                            onDragStart={(event) => handleDragStart(event, task.id)}
                            onDragEnd={handleDragEnd}
                          >
                            <div className="kanban-card-topline">
                              <span className="material-symbols-rounded kanban-drag-handle">
                                drag_indicator
                              </span>
                              <TaskStatusSelect
                                task={task}
                                disabled={isBusy}
                                onChange={(status) => void changeTaskStatus(task.id, status)}
                              />
                              <button
                                type="button"
                                className="task-delete-button"
                                aria-label="Supprimer la tâche"
                                disabled={isBusy}
                                onClick={() => void removeTask(task.id)}
                              >
                                <span className="material-symbols-rounded">delete</span>
                              </button>
                            </div>
                            <p>{task.content}</p>
                            <div className="kanban-card-meta">
                              {received ? (
                                <span className="task-sender">
                                  <span className="material-symbols-rounded">forward_to_inbox</span>
                                  {task.createdByName}
                                </span>
                              ) : (
                                <span>
                                  <span className="material-symbols-rounded">lock</span>
                                  Personnelle
                                </span>
                              )}
                              <span>{taskDateFormatter.format(new Date(task.createdAt))}</span>
                            </div>
                          </article>
                        );
                      })
                    )}
                  </div>
                </section>
              );
            })}
          </div>
        )}
      </section>
    </div>
  );
}

function TaskStatusSelect({
  task,
  disabled,
  onChange
}: {
  task: PersonalTask;
  disabled: boolean;
  onChange: (status: TaskStatus) => void;
}) {
  return (
    <label className={`task-status-control is-${task.status}`}>
      <span className="material-symbols-rounded" aria-hidden="true">
        {task.status === "todo"
          ? "radio_button_unchecked"
          : task.status === "in_progress"
            ? "pending"
            : "task_alt"}
      </span>
      <select
        value={task.status}
        disabled={disabled}
        aria-label={`État de la tâche : ${task.content}`}
        onChange={(event) => onChange(event.target.value as TaskStatus)}
      >
        {TASK_COLUMNS.map((column) => (
          <option key={column.status} value={column.status}>
            {TASK_STATUS_LABELS[column.status]}
          </option>
        ))}
      </select>
    </label>
  );
}
