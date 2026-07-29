import type { TaskRecipient } from "../../data/types";

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
  const nextValue =
    value.slice(0, tag.start) +
    `#${nif} ` +
    value.slice(tag.end);

  return {
    value: nextValue,
    caret: tag.start + nif.length + 2
  };
}
