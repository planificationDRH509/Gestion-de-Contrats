const API_BASE = "/api/local";
const AUTH_KEY = "contribution_auth";

type RequestOptions = {
  method?: "GET" | "POST" | "PATCH";
  body?: unknown;
};

function getOperatorName() {
  try {
    const raw = localStorage.getItem(AUTH_KEY);
    if (!raw) {
      return "Administrateur";
    }
    const parsed = JSON.parse(raw) as { name?: string };
    return parsed?.name?.trim() || "Administrateur";
  } catch {
    return "Administrateur";
  }
}

export async function sqliteApiRequest<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const method = options.method ?? "GET";
  const hasBody = options.body !== undefined;

  const response = await fetch(`${API_BASE}${path}`, {
    method,
    headers: {
      ...(hasBody ? { "Content-Type": "application/json" } : {}),
      "x-operator-name": getOperatorName()
    },
    body: hasBody ? JSON.stringify(options.body) : undefined
  });

  const raw = await response.text();
  const data = raw ? (JSON.parse(raw) as unknown) : null;

  if (!response.ok) {
    const message =
      data && typeof data === "object" && "error" in data && typeof data.error === "string"
        ? data.error
        : "Erreur API SQLite locale.";
    throw new Error(message);
  }

  return data as T;
}
