import {
  useEffect,
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
  findActiveContractTag,
  findActiveMention,
  insertContractTag,
  insertRecipientMention,
  type ActiveContractTag,
  type ActiveMention
} from "./taskMentions";
import {
  getTaskErrorMessage,
  type TaskContractSuggestion,
  useCreatePrivateTask,
  useDeletePrivateTask,
  useEditPrivateTask,
  usePrivateTasks,
  useSetTaskStatus,
  useTaskContractSuggestions,
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
  const { user, activateTaskSession } = useAuth();
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const tasksQuery = usePrivateTasks();
  const recipientsQuery = useTaskRecipients();
  const createTask = useCreatePrivateTask();
  const setStatus = useSetTaskStatus();
  const deleteTask = useDeletePrivateTask();
  const editTask = useEditPrivateTask();
  const [editingTask, setEditingTask] = useState<PersonalTask | null>(null);
  const [editContent, setEditContent] = useState("");
  const [editNotes, setEditNotes] = useState("");
  const [search, setSearch] = useState("");
  const [noteSearch, setNoteSearch] = useState("");
  const [newNote, setNewNote] = useState(false);
  const dialogRef = useRef<HTMLDialogElement>(null);

  function closeEditor() {
    if (editTask.isPending || createTask.isPending) return;
    const changed = editContent !== (editingTask?.content ?? "") || editNotes !== (editingTask?.notes ?? "");
    if (changed && !window.confirm("Abandonner les modifications ?")) return;
    dialogRef.current?.close();
    setEditingTask(null);
  }

  function openEditor(task: PersonalTask) {
    setActionError(null);
    setNewNote(false);
    setEditingTask(task);
    setEditContent(task.content);
    setEditNotes(task.notes ?? "");
    dialogRef.current?.showModal();
  }

  async function saveEdit(event: FormEvent) {
    event.preventDefault();
    if ((!editingTask && !newNote) || !editContent.trim() || editTask.isPending || createTask.isPending) return;
    setActionError(null);
    try {
      if (newNote) {
        await createTask.mutateAsync({ content: editContent.trim(), notes: editNotes, kind: "note", assigneeId: null });
      } else if (editingTask) {
        await editTask.mutateAsync({ taskId: editingTask.id, content: editContent.trim(), notes: editingTask.kind === "note" ? editNotes : "" });
      }
      dialogRef.current?.close();
      setEditingTask(null);
    } catch (error) { setActionError(getTaskErrorMessage(error)); }
  }

  const [draft, setDraft] = useState("");
  const [recipient, setRecipient] = useState<TaskRecipient | null>(null);
  const [activeMention, setActiveMention] = useState<ActiveMention | null>(null);
  const [activeContractTag, setActiveContractTag] = useState<ActiveContractTag | null>(null);
  const [selectedContract, setSelectedContract] = useState<TaskContractSuggestion | null>(null);
  const [highlightedIndex, setHighlightedIndex] = useState(0);
  const [filter, setFilter] = useState<TaskFilter>("all");
  const [view, setView] = useState<TaskView>("list");
  const [draggedTaskId, setDraggedTaskId] = useState<string | null>(null);
  const [dragTargetStatus, setDragTargetStatus] = useState<TaskStatus | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [sessionPassword, setSessionPassword] = useState("");
  const [sessionActivationError, setSessionActivationError] = useState<string | null>(null);
  const [isActivatingSession, setIsActivatingSession] = useState(false);
  const [isOnline, setIsOnline] = useState(() => navigator.onLine);

  const recipients = recipientsQuery.data ?? [];
  const suggestions = useMemo(
    () => filterTaskRecipients(recipients, activeMention?.query ?? "").slice(0, 6),
    [activeMention?.query, recipients]
  );
  const contractSuggestionsQuery = useTaskContractSuggestions(
    activeContractTag?.query ?? null
  );
  const contractSuggestions = contractSuggestionsQuery.data ?? [];
  const allItems = tasksQuery.data ?? [];
  const tasks = allItems.filter(task => task.kind !== "note");
  const notes = allItems.filter(task => task.kind === "note" && `${task.content} ${task.notes ?? ""}`.toLocaleLowerCase().includes(noteSearch.toLocaleLowerCase().trim()));
  const todoCount = tasks.filter((task) => task.status === "todo").length;
  const inProgressCount = tasks.filter((task) => task.status === "in_progress").length;
  const completedCount = tasks.filter((task) => task.status === "done").length;
  const visibleTasks = tasks.filter((task) => {
    return (view === "kanban" || filter === "all" || task.status === filter)
      && `${task.content} ${task.notes ?? ""}`.toLocaleLowerCase().includes(search.toLocaleLowerCase().trim());
  });

  const sessionUnavailable = !user?.taskSessionToken;
  const queryError = tasksQuery.error ?? recipientsQuery.error;
  const isBusy = createTask.isPending || setStatus.isPending || deleteTask.isPending || editTask.isPending;

  useEffect(() => {
    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);
    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", handleOffline);
    return () => {
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("offline", handleOffline);
    };
  }, []);

  async function handleTaskSessionActivation(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!sessionPassword || isActivatingSession) return;

    setSessionActivationError(null);
    setIsActivatingSession(true);
    try {
      const result = await activateTaskSession(sessionPassword);
      if (!result.success) {
        setSessionActivationError(result.error ?? "Impossible d’activer la liste privée.");
        return;
      }
      setSessionPassword("");
      setNotice("Votre liste privée est activée.");
      window.setTimeout(() => setNotice(null), 3500);
    } catch {
      setSessionActivationError(
        "Impossible de joindre le serveur. Vérifiez votre connexion puis réessayez."
      );
    } finally {
      setIsActivatingSession(false);
    }
  }

  function updateComposerTokens(value: string, caret: number) {
    const mention = findActiveMention(value, caret);
    const contractTag = findActiveContractTag(value, caret);
    setActiveMention(mention);
    setActiveContractTag(contractTag);
    setHighlightedIndex(0);

    if (recipient && !value.includes(`@${recipient.username}`)) {
      setRecipient(null);
    }
    if (selectedContract && !value.includes(`#${selectedContract.nif}`)) {
      setSelectedContract(null);
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

  function selectContract(nextContract: TaskContractSuggestion) {
    if (!activeContractTag) return;
    const inserted = insertContractTag(draft, activeContractTag, nextContract.nif);
    setDraft(inserted.value);
    setSelectedContract(nextContract);
    setActiveContractTag(null);

    window.requestAnimationFrame(() => {
      textareaRef.current?.focus();
      textareaRef.current?.setSelectionRange(inserted.caret, inserted.caret);
    });
  }

  function handleComposerKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    const activeSuggestions = activeMention
      ? suggestions
      : activeContractTag
        ? contractSuggestions
        : [];

    if ((activeMention || activeContractTag) && activeSuggestions.length > 0) {
      if (event.key === "ArrowDown") {
        event.preventDefault();
        setHighlightedIndex((current) => (current + 1) % activeSuggestions.length);
        return;
      }
      if (event.key === "ArrowUp") {
        event.preventDefault();
        setHighlightedIndex((current) =>
          (current - 1 + activeSuggestions.length) % activeSuggestions.length
        );
        return;
      }
      if (event.key === "Enter" && !event.shiftKey) {
        event.preventDefault();
        if (activeMention) {
          selectRecipient(suggestions[highlightedIndex] ?? suggestions[0]);
        } else {
          selectContract(
            contractSuggestions[highlightedIndex] ?? contractSuggestions[0]
          );
        }
        return;
      }
      if (event.key === "Escape") {
        event.preventDefault();
        setActiveMention(null);
        setActiveContractTag(null);
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
      const result = await createTask.mutateAsync({
        content,
        assigneeId: recipient?.id ?? null
      });
      const queued = Boolean(
        result &&
        typeof result === "object" &&
        "queued" in result &&
        result.queued
      );
      setDraft("");
      setActiveMention(null);
      setActiveContractTag(null);
      setRecipient(null);
      setSelectedContract(null);
      setNotice(
        queued
          ? recipient
            ? `Tâche enregistrée hors ligne. Elle sera transmise à ${recipient.fullName} à la reconnexion.`
            : "Tâche enregistrée hors ligne. Elle sera synchronisée à la reconnexion."
          : recipient
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

  async function removeTask(taskId: string, isNote = false) {
    if (!window.confirm(isNote ? "Supprimer cette note ?" : "Supprimer cette tâche ?")) return;
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
          <h1 className="section-title">Tâches et notes</h1>

        </div>
        <div className="tasks-header-actions">
          <span className={`tasks-connectivity${isOnline ? " is-online" : " is-offline"}`}>
            <span className="material-symbols-rounded">
              {isOnline ? "cloud_done" : "cloud_off"}
            </span>
            {isOnline ? "En ligne" : "Mode hors ligne"}
          </span>
          <button
            type="button"
            className="btn btn-outline tasks-sync-button"
            onClick={() => void tasksQuery.refetch()}
            disabled={tasksQuery.isFetching || sessionUnavailable || !isOnline}
          >
            <span className={`material-symbols-rounded${tasksQuery.isFetching ? " is-spinning" : ""}`}>
              sync
            </span>
            Synchroniser
          </button>
        </div>
      </header>

      {sessionUnavailable ? (
        <section className="card tasks-session-card" role="alert">
          <span className="material-symbols-rounded">lock</span>
          <div>
            <h2>Activez votre liste privée</h2>
            <p>
              Confirmez le mot de passe de votre compte. Vous resterez connecté à l’application.
            </p>
            {sessionActivationError ? (
              <p className="tasks-session-error">{sessionActivationError}</p>
            ) : null}
          </div>
          <form className="tasks-session-form" onSubmit={handleTaskSessionActivation}>
            <label className="tasks-session-password">
              <span>Mot de passe</span>
              <input
                className="input"
                type="password"
                value={sessionPassword}
                autoComplete="current-password"
                disabled={isActivatingSession || !isOnline}
                onChange={(event) => setSessionPassword(event.target.value)}
              />
            </label>
            <button
              type="submit"
              className="btn btn-primary"
              disabled={!sessionPassword || isActivatingSession || !isOnline}
            >
              <span
                className={`material-symbols-rounded${isActivatingSession ? " is-spinning" : ""}`}
              >
                {isActivatingSession ? "sync" : "lock_open"}
              </span>
              {isActivatingSession ? "Activation…" : "Activer mes tâches"}
            </button>
          </form>
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

      <nav className="tasks-jump-links" aria-label="Accès rapide">
        <a href="#task-section">Tâches <span>{tasks.length}</span></a>
        <a href="#notes-heading">Notes <span>{allItems.filter(item => item.kind === "note").length}</span></a>
      </nav>
      <div className="tasks-and-notes">
      <div className="tasks-workspace" id="task-section">
      <details open className={`card task-composer-card${sessionUnavailable ? " is-disabled" : ""}`} >
        <summary className="task-composer-toggle"><span className="material-symbols-rounded" aria-hidden="true">add</span>Nouvelle tâche<span className="material-symbols-rounded" aria-hidden="true">expand_more</span></summary>
        <form onSubmit={handleSubmit}>
          <div className="task-composer-input-wrap">
            <textarea
              ref={textareaRef}
              className="textarea task-composer-input"
              value={draft}
              rows={2}
              maxLength={1000}
              disabled={sessionUnavailable}
              placeholder="Ajouter une tâche…"
              aria-label="Description de la tâche"
              aria-expanded={Boolean(
                (activeMention && suggestions.length) ||
                (activeContractTag && contractSuggestions.length)
              )}
              aria-controls={
                activeContractTag
                  ? "task-contract-suggestions"
                  : "task-mention-suggestions"
              }
              onChange={(event) => {
                setDraft(event.target.value);
                updateComposerTokens(event.target.value, event.target.selectionStart);
              }}
              onClick={(event) =>
                updateComposerTokens(event.currentTarget.value, event.currentTarget.selectionStart)
              }
              onKeyUp={(event) => {
                if (["ArrowDown", "ArrowUp", "Enter", "Escape"].includes(event.key)) return;
                updateComposerTokens(event.currentTarget.value, event.currentTarget.selectionStart);
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

            {activeContractTag ? (
              <div
                className="task-mention-menu task-contract-menu"
                id="task-contract-suggestions"
                role="listbox"
                aria-label="Contrats par NIF"
              >
                <div className="task-mention-menu-label">Lier un contrat par NIF</div>
                {contractSuggestions.length > 0 ? (
                  contractSuggestions.map((contract, index) => (
                    <button
                      key={contract.id}
                      type="button"
                      className={`task-mention-option task-contract-option${index === highlightedIndex ? " is-active" : ""}`}
                      role="option"
                      aria-selected={index === highlightedIndex}
                      onMouseDown={(event) => event.preventDefault()}
                      onClick={() => selectContract(contract)}
                    >
                      <span className="task-avatar task-contract-avatar" aria-hidden="true">
                        #
                      </span>
                      <span>
                        <strong>#{contract.nif}</strong>
                        <small>
                          {contract.personName}
                          {contract.position ? ` · ${contract.position}` : ""}
                          {contract.fiscalYear ? ` · ${contract.fiscalYear}` : ""}
                        </small>
                      </span>
                      <span className="material-symbols-rounded">link</span>
                    </button>
                  ))
                ) : (
                  <div className="task-contract-empty">
                    <span className={`material-symbols-rounded${contractSuggestionsQuery.isFetching ? " is-spinning" : ""}`}>
                      {contractSuggestionsQuery.isFetching ? "sync" : "search_off"}
                    </span>
                    {contractSuggestionsQuery.isFetching
                      ? "Recherche des contrats…"
                      : "Aucun contrat trouvé dans les données disponibles."}
                  </div>
                )}
              </div>
            ) : null}
          </div>

          <div className="task-composer-footer">
            <div className="task-composer-contexts">
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
                    @ pour transmettre
                  </>
                )}
              </div>
              <div className="task-recipient-state task-contract-state">
                {selectedContract ? (
                  <>
                    <span className="material-symbols-rounded">tag</span>
                    Contrat <strong>#{selectedContract.nif}</strong>
                    <button
                      type="button"
                      onClick={() => {
                        setDraft((current) =>
                          current.replace(`#${selectedContract.nif}`, "").replace(/\s{2,}/g, " ")
                        );
                        setSelectedContract(null);
                      }}
                      aria-label="Retirer le contrat"
                    >
                      <span className="material-symbols-rounded">close</span>
                    </button>
                  </>
                ) : (
                  <>
                    <span className="material-symbols-rounded">tag</span>
                    # pour lier un contrat
                  </>
                )}
              </div>
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
      </details>

      <section className="tasks-list-section">
        <div className="tasks-list-heading">
          <div>
            <h2>Tâches</h2>
            <span>
              {todoCount} à faire · {inProgressCount} en cours · {completedCount} terminée
              {completedCount === 1 ? "" : "s"}
            </span>
          </div>
          <div className="tasks-list-controls">
            <input className="input tasks-search" type="search" aria-label="Rechercher les tâches" placeholder="Rechercher…" value={search} onChange={event => setSearch(event.target.value)} />
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
                    aria-pressed={filter === value}
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
              {search.trim() ? "Aucun résultat" : filter === "done"
                ? "Aucune tâche terminée"
                : filter === "all"
                  ? "Votre liste est à jour"
                  : "Aucune tâche dans cet état"}
            </h3>

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
                    <p><TaskText content={task.content} /></p>

                    <div className="task-row-meta">
                      <TaskStatusSelect
                        task={task}
                        disabled={isBusy}
                        onChange={(status) => void changeTaskStatus(task.id, status)}
                      />
                      {task.id.startsWith("offline-task-") ? (
                        <span className="task-pending-sync">
                          <span className="material-symbols-rounded">cloud_upload</span>
                          En attente de synchronisation
                        </span>
                      ) : null}
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
                  <button type="button" className="task-edit-button" aria-label="Modifier la tâche" disabled={isBusy} onClick={() => openEditor(task)}>
                    <span className="material-symbols-rounded" aria-hidden="true">edit_note</span>
                  </button>
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
              const columnTasks = visibleTasks.filter((task) => task.status === column.status);
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
                              <button type="button" className="task-edit-button" aria-label="Modifier la tâche" disabled={isBusy} onClick={() => openEditor(task)}>
                                <span className="material-symbols-rounded" aria-hidden="true">edit_note</span>
                              </button>
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
                            <p><TaskText content={task.content} /></p>

                            <div className="kanban-card-meta">
                              {task.id.startsWith("offline-task-") ? (
                                <span className="task-pending-sync">
                                  <span className="material-symbols-rounded">cloud_upload</span>
                                  À synchroniser
                                </span>
                              ) : null}
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
      <section className="notes-section" aria-labelledby="notes-heading">
        <h2 id="notes-heading" tabIndex={-1}>Notes <span className="notes-count">{allItems.filter(item => item.kind === "note").length}</span></h2>
        <div className="notes-toolbar">
          <input className="input" type="search" aria-label="Rechercher les notes" placeholder="Rechercher…" value={noteSearch} onChange={event => setNoteSearch(event.target.value)} />
          <button className="btn btn-primary" disabled={sessionUnavailable || isBusy} onClick={() => { setNewNote(true); setEditingTask(null); setEditContent(""); setEditNotes(""); setActionError(null); dialogRef.current?.showModal(); }}>Nouvelle note</button>
        </div>
        {tasksQuery.isLoading ? <p role="status">Chargement…</p> : notes.length === 0 ? <div className="tasks-empty-state"><h3>{noteSearch.trim() ? "Aucun résultat" : "Aucune note"}</h3></div> : <div className="notes-grid">{notes.map(note => <article className="card note-card" key={note.id}>
          <h3><button type="button" className="note-open-button" disabled={isBusy} onClick={() => openEditor(note)}>{note.content}</button></h3><p>{note.notes}</p>
          <div className="notes-toolbar"><time>{taskDateFormatter.format(new Date(note.updatedAt))}</time>
            <button className="task-edit-button" aria-label="Modifier la note" disabled={isBusy} onClick={() => openEditor(note)}><span className="material-symbols-rounded" aria-hidden="true">edit</span></button>
            <button className="task-delete-button" aria-label="Supprimer la note" disabled={isBusy} onClick={() => void removeTask(note.id, true)}><span className="material-symbols-rounded" aria-hidden="true">delete</span></button>
          </div>
        </article>)}</div>}
      </section>
      </div>
      <dialog ref={dialogRef} className="task-editor-dialog" aria-labelledby="task-editor-title" onCancel={event => { event.preventDefault(); closeEditor(); }}>
        <form onSubmit={saveEdit} className="task-editor-form" onKeyDown={event => { if ((event.ctrlKey || event.metaKey) && event.key === "Enter") { event.preventDefault(); event.currentTarget.requestSubmit(); } }}>
          <h2 id="task-editor-title">{newNote ? "Nouvelle note" : editingTask?.kind === "note" ? "Modifier la note" : "Modifier la tâche"}</h2>
          <label>{newNote || editingTask?.kind === "note" ? "Titre" : "Tâche"}<textarea autoFocus className="textarea" aria-label={newNote || editingTask?.kind === "note" ? "Titre" : "Tâche"} value={editContent} maxLength={1000} required rows={3} disabled={editTask.isPending || createTask.isPending} onChange={event => setEditContent(event.target.value)} /></label>
          {newNote || editingTask?.kind === "note" ? <label>Note<textarea className="textarea" aria-label="Notes" value={editNotes} maxLength={10000} rows={8} disabled={editTask.isPending || createTask.isPending} onChange={event => setEditNotes(event.target.value)} /></label> : null}
          {actionError ? <p role="alert">{actionError}</p> : null}
          <div className="task-editor-actions">
            <button type="button" className="btn btn-outline" disabled={editTask.isPending || createTask.isPending} onClick={closeEditor}>Annuler</button>
            <button type="submit" className="btn btn-primary" disabled={!editContent.trim() || editTask.isPending || createTask.isPending}>{editTask.isPending ? "Enregistrement…" : "Enregistrer"}</button>
          </div>
        </form>
      </dialog>
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

function TaskText({ content }: { content: string }) {
  const parts = content.split(/(#[\p{L}\p{N}._-]+)/gu);
  return (
    <>
      {parts.map((part, index) =>
        part.startsWith("#") ? (
          <span className="task-inline-contract-tag" key={`${part}-${index}`}>
            <span className="material-symbols-rounded" aria-hidden="true">tag</span>
            {part}
          </span>
        ) : (
          part
        )
      )}
    </>
  );
}
