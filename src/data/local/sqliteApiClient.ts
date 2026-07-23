const API_BASE = "/api/local";
const AUTH_KEY = "contribution_auth";

type RequestOptions = {
  method?: "GET" | "POST" | "PATCH";
  body?: unknown;
};

function getOperator() {
  try {
    const raw = localStorage.getItem(AUTH_KEY);
    if (!raw) {
      return { id: "", name: "Administrateur", role: "admin" };
    }
    const parsed = JSON.parse(raw) as { id?: string; name?: string; role?: string };
    return {
      id: parsed?.id?.trim() || "",
      name: parsed?.name?.trim() || "Administrateur",
      role: parsed?.role?.trim() || ""
    };
  } catch {
    return { id: "", name: "Administrateur", role: "admin" };
  }
}

export async function sqliteApiRequest<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const method = options.method ?? "GET";
  const hasBody = options.body !== undefined;
  const operator = getOperator();

  const response = await fetch(`${API_BASE}${path}`, {
    method,
    headers: {
      ...(hasBody ? { "Content-Type": "application/json" } : {}),
      "x-operator-id": operator.id,
      "x-operator-name": operator.name,
      "x-operator-role": operator.role
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
