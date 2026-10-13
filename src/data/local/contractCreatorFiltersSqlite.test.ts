// @vitest-environment node
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { PassThrough } from "node:stream";
import { createRequire } from "node:module";
import type { IncomingMessage, ServerResponse } from "node:http";
import type { Connect, ViteDevServer } from "vite";
import { expect, it, vi } from "vitest";
import { localSqliteApiPlugin } from "../../../server/localSqliteApi";
import type { ContractListResult } from "../types";

const { DatabaseSync } = createRequire(import.meta.url)("node:sqlite") as typeof import("node:sqlite");
vi.mock("node:sqlite", async () => {
  const { createRequire } = await import("node:module");
  return createRequire(import.meta.url)("node:sqlite");
});

it("filters SQLite contracts by creators alongside other filters before counting and paginating", async () => {
  const file = join(mkdtempSync(join(tmpdir(), "contribution-creators-")), "test.sqlite");
  vi.stubEnv("CONTRIBUTION_SQLITE_PATH", file);
  try {
    const configure = localSqliteApiPlugin().configureServer;
    if (typeof configure !== "function") throw new Error("Missing local API middleware");
    const use = vi.fn();
    configure.call({} as never, { middlewares: { use } } as unknown as ViteDevServer);
    const middleware = use.mock.calls[0][0] as Connect.NextHandleFunction;
    const request = (path: string, body?: unknown) => new Promise<ContractListResult>((resolve, reject) => {
      const stream = new PassThrough();
      const req = stream as unknown as IncomingMessage;
      req.url = `/api/local${path}`;
      req.method = body === undefined ? "GET" : "POST";
      req.headers = {};
      const response = {
        statusCode: 200, headersSent: false, setHeader: () => undefined,
        end: (payload: string) => resolve(JSON.parse(payload))
      };
      middleware(req, response as unknown as ServerResponse, reject);
      stream.end(body === undefined ? undefined : JSON.stringify(body));
    });
    await request("/workspaces");
    const db = new DatabaseSync(file);
    try {
      const person = db.prepare(`INSERT INTO identification(nif,nom,prenom,sexe,adresse,workspace_id,created_at,updated_at)
        VALUES(?, 'LOUIS', 'Jean', 'Homme', 'Delmas', 'workspace_default', '2026-01-01', '2026-01-01')`);
      const contract = db.prepare(`INSERT INTO contrat(id_contrat,nif,duree_contrat,annee_fiscale,salaire_en_chiffre,titre,
        lieu_affectation,historique_saisie,workspace_id,status,created_at,updated_at,created_by,ministre_id)
        VALUES(?, ?, 6, '2025-2026', 30000, 'Analyste', 'Direction', '{}', 'workspace_default', ?, '2026-01-01', '2026-01-01', ?, 'bertrand-sinal')`);
      ["me", "alice", "bob", "bob", null].forEach((creator, index) => {
        person.run(`person-${index}`);
        contract.run(`contract-${index}`, `person-${index}`, index === 3 ? "signe" : "saisie", creator);
      });
      const params = { workspaceId: "workspace_default", createdByIds: ["alice", "bob"], status: "saisie", durations: [6], fiscalYear: "2025-2026", query: "Jean", pageSize: 1, page: 2 };
      const result = await request("/contracts/list", params);
      expect(result.total).toBe(2);
      expect(result.items.map(item => item.id)).toEqual(["contract-2"]);
      expect((await request("/contracts/list", { ...params, createdByIds: ["missing"] })).total).toBe(0);
      expect((await request("/contracts/list", { ...params, createdByIds: [] })).total).toBe(4);
    } finally { db.close(); }
  } finally { vi.unstubAllEnvs(); }
});
