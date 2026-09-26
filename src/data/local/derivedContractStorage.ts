function withoutSalaryText(value: unknown): unknown {
  if (!value || typeof value !== "object" || Array.isArray(value)) return value;
  const { salaryText: _derived, ...stored } = value as Record<string, unknown>;
  return stored;
}

/** Keep historical audit entries; omit only the current, reproducible value. */
export function compactContractRecord(key: string, value: unknown): unknown {
  if (key.startsWith("contracts:")) return withoutSalaryText(value);
  if (!key.startsWith("outbox:") || !value || typeof value !== "object") return value;
  const item = value as { type?: string; payload?: Record<string, unknown>; conflict?: { remote: unknown } };
  if (!item.type?.startsWith("contract.")) return value;
  const payload = { ...withoutSalaryText(item.payload) as Record<string, unknown> };
  if (payload.baseContract) payload.baseContract = withoutSalaryText(payload.baseContract);
  return {
    ...item,
    payload,
    ...(item.conflict ? { conflict: { ...item.conflict, remote: withoutSalaryText(item.conflict.remote) } } : {})
  };
}
