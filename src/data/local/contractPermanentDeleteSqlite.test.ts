// @vitest-environment node
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { PassThrough } from "node:stream";
import { createRequire } from "node:module";
import type { DatabaseSync as SqliteDatabase } from "node:sqlite";
import type { IncomingMessage, ServerResponse } from "node:http";
import type { Connect, ViteDevServer } from "vite";
import { afterAll, beforeAll, expect, it, vi } from "vitest";
import { localSqliteApiPlugin } from "../../../server/localSqliteApi";

const { DatabaseSync } = createRequire(import.meta.url)("node:sqlite") as typeof import("node:sqlite");
vi.mock("node:sqlite", async () => {
  const { createRequire } = await import("node:module");
  return createRequire(import.meta.url)("node:sqlite");
});

let middleware: Connect.NextHandleFunction;
let db: SqliteDatabase;

function request(path: string, body?: unknown, role = "admin") {
  return new Promise<{ status: number; body: Record<string, unknown> }>((resolve, reject) => {
    const stream = new PassThrough();
    const req = stream as unknown as IncomingMessage;
    req.url = `/api/local${path}`;
    req.method = body === undefined ? "GET" : "POST";
    req.headers = { "x-operator-role": role };
    const response = {
      statusCode: 200, headersSent: false,
      setHeader: () => undefined,
      end: (payload: string) => resolve({ status: response.statusCode, body: JSON.parse(payload) })
    };
    middleware(req, response as unknown as ServerResponse, reject);
    stream.end(body === undefined ? undefined : JSON.stringify(body));
  });
}

beforeAll(async () => {
  const file = join(mkdtempSync(join(tmpdir(), "contribution-trash-")), "test.sqlite");
  vi.stubEnv("CONTRIBUTION_SQLITE_PATH", file);
  const configure = localSqliteApiPlugin().configureServer;
  if (typeof configure !== "function") throw new Error("Missing local API middleware");
  const use = vi.fn();
  configure.call({} as never, { middlewares: { use } } as unknown as ViteDevServer);
  middleware = use.mock.calls[0][0];
  expect((await request("/workspaces")).status).toBe(200);
  db = new DatabaseSync(file);
  db.exec(`PRAGMA foreign_keys=ON;
    INSERT INTO identification(nif,nom,prenom,sexe,adresse,workspace_id,created_at,updated_at)
      VALUES('111-222-333-4','JEAN','Marie','Femme','Delmas','workspace_default','2026-10-01','2026-10-01');
    INSERT INTO contrat(id_contrat,nif,duree_contrat,annee_fiscale,salaire_en_chiffre,titre,lieu_affectation,
      historique_saisie,workspace_id,status,created_at,updated_at,deleted_at,ministre_id)
      VALUES('trash','111-222-333-4',12,'2026-2027',30000,'Analyste','Direction','{}','workspace_default','saisie',
        '2026-10-01','2026-10-11','2026-10-11','bertrand-sinal'),
      ('active','111-222-333-4',12,'2025-2026',30000,'Analyste','Direction','{}','workspace_default','saisie',
        '2026-10-01','2026-10-01',NULL,'bertrand-sinal');
    INSERT INTO tags(id,workspace_id,name,color,created_at,updated_at)
      VALUES('tag','workspace_default','Test','#64748b','2026-10-01','2026-10-01');
    INSERT INTO contract_tags(contract_id,tag_id,created_at) VALUES('trash','tag','2026-10-01');
  `);
});
afterAll(() => { db?.close(); vi.unstubAllEnvs(); });

it("refuses non-admin requests and contracts outside this workspace or the trash", async () => {
  for (const role of ["agent", "controller", "reader", ""]) {
    expect((await request("/contracts/permanent-delete", { id: "trash", workspaceId: "workspace_default" }, role)).status).toBe(403);
  }
  for (const body of [
    { id: "active", workspaceId: "workspace_default" },
    { id: "trash", workspaceId: "workspace_mouvement" },
    { id: "missing", workspaceId: "workspace_default" }
  ]) expect((await request("/contracts/permanent-delete", body)).status).toBe(409);
  expect((await request("/contracts/permanent-delete", { id: "trash" })).status).toBe(400);
  expect(db.prepare("SELECT count(*) AS count FROM contrat").get()?.count).toBe(2);
});

it("physically deletes the contract and its tag links while keeping the person and other contracts", async () => {
  expect(await request("/contracts/permanent-delete", { id: "trash", workspaceId: "workspace_default" }))
    .toEqual({ status: 200, body: { ok: true } });
  expect(db.prepare("SELECT * FROM contrat WHERE id_contrat='trash'").get()).toBeUndefined();
  expect(db.prepare("SELECT * FROM contract_tags WHERE contract_id='trash'").all()).toEqual([]);
  expect(db.prepare("SELECT * FROM identification WHERE nif='111-222-333-4'").get()).toBeDefined();
  expect(db.prepare("SELECT * FROM contrat WHERE id_contrat='active'").get()).toBeDefined();
  expect((await request("/contracts/list", { workspaceId: "workspace_default", deletionState: "deleted", all: true })).body)
    .toMatchObject({ items: [], total: 0 });
});
