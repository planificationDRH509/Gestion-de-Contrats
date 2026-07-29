import type { PersonalTask, TaskRecipient } from "../../data/types";

export type ActiveMention = {
  start: number;
  end: number;
  query: string;
};

export type ActiveContractTag = ActiveMention;

export function findActiveMention(value: string, caret: number): ActiveMention | null {
  const beforeCaret = value.slice(0, caret);
  const match = beforeCaret.match(/(^|\s)@([\p{L}\p{N}._-]*)$/u);
  if (!match || match.index === undefined) return null;

  const leadingSpaceLength = match[1]?.length ?? 0;
  const start = match.index + leadingSpaceLength;
  return {
    start,
    end: caret,
    query: match[2] ?? ""
  };
}

export function insertRecipientMention(
  value: string,
  mention: ActiveMention,
  recipient: TaskRecipient
) {
  const nextValue =
    value.slice(0, mention.start) +
    `@${recipient.username} ` +
    value.slice(mention.end);

  return {
    value: nextValue,
    caret: mention.start + recipient.username.length + 2
  };
}

export function filterTaskRecipients(recipients: TaskRecipient[], query: string) {
  const normalized = query.trim().toLocaleLowerCase("fr");
  if (!normalized) return recipients;

  return recipients.filter((recipient) =>
    `${recipient.fullName} ${recipient.username}`
      .toLocaleLowerCase("fr")
      .includes(normalized)
  );
}

export function findActiveContractTag(
  value: string,
  caret: number
): ActiveContractTag | null {
  const beforeCaret = value.slice(0, caret);
  const match = beforeCaret.match(/(^|\s)#([\p{L}\p{N}._-]*)$/u);
  if (!match || match.index === undefined) return null;

  const leadingSpaceLength = match[1]?.length ?? 0;
  return {
    start: match.index + leadingSpaceLength,
    end: caret,
    query: match[2] ?? ""
  };
}

export function insertContractTag(
  value: string,
  tag: ActiveContractTag,
  nif: string
) {
  const tagValue = nif
    .trim()
    .replace(/[^\p{L}\p{N}._-]+/gu, "-");
  const nextValue =
    value.slice(0, tag.start) +
    `#${tagValue} ` +
    value.slice(tag.end);

  return {
    value: nextValue,
    caret: tag.start + tagValue.length + 2
  };
}

export function normalizeContractNif(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLocaleLowerCase("fr")
    .replace(/[^\p{L}\p{N}]/gu, "");
}

export function extractContractTags(content: string) {
  return Array.from(
    content.matchAll(/(?:^|\s)#([\p{L}\p{N}._-]+)/gu),
    (match) => match[1] ?? ""
  ).filter(Boolean);
}

export function indexTasksByContractNif(tasks: PersonalTask[]) {
  const index = new Map<string, PersonalTask[]>();

  tasks.forEach((task) => {
    const taskNifs = new Set(
      extractContractTags(task.content)
        .map(normalizeContractNif)
        .filter(Boolean)
    );

    taskNifs.forEach((nif) => {
      const linkedTasks = index.get(nif) ?? [];
      linkedTasks.push(task);
      index.set(nif, linkedTasks);
    });
  });

  return index;
}
