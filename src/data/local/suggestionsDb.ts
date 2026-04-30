/**
 * Suggestions database for auto-completion in contract forms.
 * Stores addresses, positions (with default salaries), and institutions (per address area).
 */
import { sqliteApiRequest } from "./sqliteApiClient";
import { getDataProvider } from "../dataProvider";

const SUGGESTIONS_KEY = "contribution_suggestions_db";

export type AddressSuggestion = {
  id: string;
  label: string;
  prefix?: string | null;
  labelFeminine?: string | null;
  order: number;
};

export type PositionSuggestion = {
  id: string;
  label: string;
  prefix?: string | null;
  labelFeminine?: string | null;
  salaries: number[];
  order: number;
};

export type InstitutionSuggestion = {
  id: string;
  label: string;
  prefix?: string | null;
  labelFeminine?: string | null;
  addressKeywords: string[]; // which address areas this institution is linked to
  order: number;
};

export type SuggestionsDb = {
  addresses: AddressSuggestion[];
  positions: PositionSuggestion[];
  institutions: InstitutionSuggestion[];
};

let _genId = 0;
function sugId(): string {
  _genId++;
  return `sug_${Date.now()}_${_genId}_${Math.random().toString(36).slice(2, 7)}`;
}

function seedSuggestions(): SuggestionsDb {
  return {
    addresses: [
      { id: sugId(), label: "Port-au-Prince", order: 0 },
      { id: sugId(), label: "Delmas", order: 1 },
      { id: sugId(), label: "Pétion-Ville", order: 2 },
      { id: sugId(), label: "Tabarre", order: 3 },
      { id: sugId(), label: "Croix-des-Bouquets", order: 4 },
      { id: sugId(), label: "Carrefour", order: 5 },
      { id: sugId(), label: "Kenscoff", order: 6 },
      { id: sugId(), label: "Gressier", order: 7 },
      { id: sugId(), label: "Léogâne", order: 8 },
      { id: sugId(), label: "Jacmel", order: 9 },
      { id: sugId(), label: "Les Cayes", order: 10 },
      { id: sugId(), label: "Cap-Haïtien", order: 11 },
      { id: sugId(), label: "Gonaïves", order: 12 },
      { id: sugId(), label: "Saint-Marc", order: 13 },
      { id: sugId(), label: "Jérémie", order: 14 },
      { id: sugId(), label: "Hinche", order: 15 },
    ],
    positions: [
      { id: sugId(), label: "Agent de Liaison", salaries: [25000], order: 0 },
      { id: sugId(), label: "Intendant", salaries: [35000], order: 1 },
      { id: sugId(), label: "Auxiliaire-Infirmière", salaries: [30000], order: 2 },
      { id: sugId(), label: "Infirmière de Ligne", salaries: [45000], order: 3 },
      { id: sugId(), label: "Aide-Infirmière", salaries: [25000], order: 4 },
      { id: sugId(), label: "Médecin", salaries: [75000], order: 5 },
      { id: sugId(), label: "Technicien de Laboratoire", salaries: [40000], order: 6 },
      { id: sugId(), label: "Pharmacien", salaries: [60000], order: 7 },
      { id: sugId(), label: "Sage-Femme", salaries: [45000], order: 8 },
      { id: sugId(), label: "Assistante Administrative", salaries: [30000], order: 9 },
      { id: sugId(), label: "Agent de Sécurité", salaries: [20000], order: 10 },
      { id: sugId(), label: "Chauffeur", salaries: [25000], order: 11 },
      { id: sugId(), label: "Ménagère", salaries: [18000], order: 12 },
      { id: sugId(), label: "Cuisinier(ère)", salaries: [20000], order: 13 },
    ],
    institutions: [
      { id: sugId(), label: "Hôpital de l'Université d'État d'Haïti (HUEH)", addressKeywords: ["port-au-prince"], order: 0 },
      { id: sugId(), label: "Sanatorium", addressKeywords: ["port-au-prince"], order: 1 },
      { id: sugId(), label: "Centre de Santé de Delmas 33", addressKeywords: ["delmas"], order: 2 },
      { id: sugId(), label: "Centre de Santé de Delmas 75", addressKeywords: ["delmas"], order: 3 },
      { id: sugId(), label: "Hôpital de la Communauté Haïtienne", addressKeywords: ["pétion-ville", "petion-ville"], order: 4 },
      { id: sugId(), label: "Centre de Santé de Tabarre", addressKeywords: ["tabarre"], order: 5 },
      { id: sugId(), label: "Hôpital Universitaire de la Paix", addressKeywords: ["delmas"], order: 6 },
      { id: sugId(), label: "Centre de Santé de Croix-des-Bouquets", addressKeywords: ["croix-des-bouquets"], order: 7 },
      { id: sugId(), label: "Hôpital Sainte-Catherine Labouré", addressKeywords: ["carrefour"], order: 8 },
      { id: sugId(), label: "Centre Hospitalier de Kenscoff", addressKeywords: ["kenscoff"], order: 9 },
      { id: sugId(), label: "Hôpital Immaculée Conception (Les Cayes)", addressKeywords: ["les cayes", "cayes"], order: 10 },
      { id: sugId(), label: "Hôpital Justinien (Cap-Haïtien)", addressKeywords: ["cap-haïtien", "cap-haitien", "cap haïtien"], order: 11 },
      { id: sugId(), label: "Hôpital La Providence (Gonaïves)", addressKeywords: ["gonaïves", "gonaives"], order: 12 },
      { id: sugId(), label: "Maternité Isaïe Jeanty", addressKeywords: ["port-au-prince"], order: 13 },
      { id: sugId(), label: "Direction Générale", addressKeywords: [], order: 14 },
      { id: sugId(), label: "Direction Départementale", addressKeywords: [], order: 15 },
    ],
  };
}

export function loadSuggestions(): SuggestionsDb {
  const raw = localStorage.getItem(SUGGESTIONS_KEY);
  if (!raw) {
    const seeded = seedSuggestions();
    localStorage.setItem(SUGGESTIONS_KEY, JSON.stringify(seeded));
    return seeded;
  }
  try {
    const parsed = JSON.parse(raw) as SuggestionsDb;
    return {
      addresses: Array.isArray(parsed.addresses) ? parsed.addresses : [],
      positions: Array.isArray(parsed.positions) ? parsed.positions : [],
      institutions: Array.isArray(parsed.institutions) ? parsed.institutions : [],
    };
  } catch {
    const seeded = seedSuggestions();
    localStorage.setItem(SUGGESTIONS_KEY, JSON.stringify(seeded));
    return seeded;
  }
}

export function saveSuggestions(db: SuggestionsDb) {
  localStorage.setItem(SUGGESTIONS_KEY, JSON.stringify(db));

  try {
    const raw = localStorage.getItem("contribution_auth");
    const parsed = raw ? JSON.parse(raw) : null;
    const workspaceId = parsed?.workspaceId || "workspace_default";
    // Fire and forget push to server
    sqliteApiRequest("/autocompletion/sync", {
      method: "POST",
      body: { workspaceId, data: db }
    }).catch(err => console.error("Failed to sync autocompletion", err));
  } catch (e) {
    console.error(e);
  }
}

export async function syncSuggestionsFromServer(workspaceId: string) {
  try {
    const data = await sqliteApiRequest<SuggestionsDb>(`/autocompletion?workspaceId=${workspaceId}`);
    if (data && data.addresses) {
      localStorage.setItem(SUGGESTIONS_KEY, JSON.stringify(data));
      // Triggers custom event if needed for components to re-fetch
      window.dispatchEvent(new Event("contribution_suggestions_updated"));
    }
  } catch (err) {
    console.error("Failed to load suggestions from server", err);
  }
}

// ─── Address CRUD ──────────────────────────────────────────────
export function getAddresses(): AddressSuggestion[] {
  return loadSuggestions().addresses.slice().sort((a, b) => a.order - b.order);
}

export function addAddress(label: string): AddressSuggestion {
  const db = loadSuggestions();
  const maxOrder = db.addresses.reduce((m, a) => Math.max(m, a.order), -1);
  const entry: AddressSuggestion = { id: sugId(), label, order: maxOrder + 1 };
  db.addresses.push(entry);
  saveSuggestions(db);
  return entry;
}

export function updateAddress(id: string, label: string, prefix?: string | null, labelFeminine?: string | null) {
  const db = loadSuggestions();
  const idx = db.addresses.findIndex((a) => a.id === id);
  if (idx >= 0) {
    db.addresses[idx].label = label;
    db.addresses[idx].prefix = prefix ?? null;
    db.addresses[idx].labelFeminine = labelFeminine ?? null;
    saveSuggestions(db);
  }
}

export function deleteAddress(id: string) {
  const db = loadSuggestions();
  db.addresses = db.addresses.filter((a) => a.id !== id);
  saveSuggestions(db);
}

// ─── Position CRUD ──────────────────────────────────────────────
export function getPositions(): PositionSuggestion[] {
  return loadSuggestions().positions.slice().sort((a, b) => a.order - b.order);
}

export function addPosition(label: string, salaries: number[]): PositionSuggestion {
  const db = loadSuggestions();
  const maxOrder = db.positions.reduce((m, p) => Math.max(m, p.order), -1);
  const entry: PositionSuggestion = { id: sugId(), label, salaries, order: maxOrder + 1 };
  db.positions.push(entry);
  saveSuggestions(db);
  return entry;
}

export function updatePosition(
  id: string,
  label: string,
  salaries: number[],
  prefix?: string | null,
  labelFeminine?: string | null
) {
  const db = loadSuggestions();
  const idx = db.positions.findIndex((p) => p.id === id);
  if (idx >= 0) {
    db.positions[idx].label = label;
    db.positions[idx].salaries = salaries;
    db.positions[idx].prefix = prefix ?? null;
    db.positions[idx].labelFeminine = labelFeminine ?? null;
    saveSuggestions(db);
  }
}

export function deletePosition(id: string) {
  const db = loadSuggestions();
  db.positions = db.positions.filter((p) => p.id !== id);
  saveSuggestions(db);
}

// ─── Institution CRUD ──────────────────────────────────────────────
export function getInstitutions(): InstitutionSuggestion[] {
  return loadSuggestions().institutions.slice().sort((a, b) => a.order - b.order);
}

export function addInstitution(label: string, addressKeywords: string[]): InstitutionSuggestion {
  const db = loadSuggestions();
  const maxOrder = db.institutions.reduce((m, i) => Math.max(m, i.order), -1);
  const entry: InstitutionSuggestion = { id: sugId(), label, addressKeywords, order: maxOrder + 1 };
  db.institutions.push(entry);
  saveSuggestions(db);
  return entry;
}

export function updateInstitution(
  id: string,
  label: string,
  addressKeywords: string[],
  prefix?: string | null,
  labelFeminine?: string | null
) {
  const db = loadSuggestions();
  const idx = db.institutions.findIndex((i) => i.id === id);
  if (idx >= 0) {
    db.institutions[idx].label = label;
    db.institutions[idx].addressKeywords = addressKeywords;
    db.institutions[idx].prefix = prefix ?? null;
    db.institutions[idx].labelFeminine = labelFeminine ?? null;
    saveSuggestions(db);
  }
}

export function deleteInstitution(id: string) {
  const db = loadSuggestions();
  db.institutions = db.institutions.filter((i) => i.id !== id);
  saveSuggestions(db);
}

// ─── Last Choice Persistence ───────────────────────────────────

export function saveLastChoice(category: "address" | "position" | "assignment" | "durationMonths", value: string) {
  if (!value) return;
  localStorage.setItem(`contribution_last_${category}`, value);
}

export function getLastChoice(category: "address" | "position" | "assignment" | "durationMonths"): string | null {
  return localStorage.getItem(`contribution_last_${category}`);
}

export function getPinnedChoices(category: string): string[] {
  try {
    const raw = localStorage.getItem(`contribution_pinned_${category}`);
    if (raw) return JSON.parse(raw);
  } catch {}
  return [];
}

export function togglePinnedChoice(category: string, id: string) {
  const current = getPinnedChoices(category);
  if (current.includes(id)) {
    localStorage.setItem(`contribution_pinned_${category}`, JSON.stringify(current.filter(i => i !== id)));
  } else {
    localStorage.setItem(`contribution_pinned_${category}`, JSON.stringify([...current, id]));
  }
  // Dispatch event so AutocompleteField can react
  window.dispatchEvent(new Event("contribution_pinned_updated"));
}

// ─── Utilities ──────────────────────────────────────────────────

function normalize(str: string): string {
  return str
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
}

// ─── Smart Queries ──────────────────────────────────────────────

/** Filter addresses matching a partial input */
export function filterAddresses(query: string): AddressSuggestion[] {
  const q = normalize(query);
  if (!q) return getAddresses();
  return getAddresses().filter((a) =>
    normalize(a.label).includes(q)
  );
}

/** Filter positions matching a partial input */
export function filterPositions(query: string): PositionSuggestion[] {
  const q = normalize(query);
  if (!q) return getPositions();
  return getPositions().filter((p) =>
    normalize(p.label).includes(q)
  );
}

/** Get institutions that match the current address (smart matching) */
export function filterInstitutions(addressValue: string, query: string): InstitutionSuggestion[] {
  const addr = normalize(addressValue);
  const q = normalize(query);
  const all = getInstitutions();
  
  // First, filter by address-relevance - show matching ones first, then all
  let relevant: InstitutionSuggestion[];
  if (addr) {
    const matched = all.filter((inst) =>
      inst.addressKeywords.length === 0 ||
      inst.addressKeywords.some((kw) => addr.includes(normalize(kw)))
    );
    // Put address-matched ones first, then the rest
    const matchedIds = new Set(matched.map((m) => m.id));
    const rest = all.filter((inst) => !matchedIds.has(inst.id));
    relevant = [...matched, ...rest];
  } else {
    relevant = all;
  }
  
  // Then filter by search query
  if (q) {
    relevant = relevant.filter((inst) =>
      normalize(inst.label).includes(q)
    );
  }
  
  return relevant;
}

/** Automagically insert un-recognized inputs into the suggestions to learn from the user's input  */
export async function learnSuggestions(address?: string, position?: string, assignment?: string, salaryNumber: number = 0) {
  const provider = import.meta.env.VITE_DATA_PROVIDER ?? "local";
  
  try {
    const raw = localStorage.getItem("contribution_auth");
    const parsed = raw ? JSON.parse(raw) : null;
    const workspaceId = parsed?.workspaceId || "workspace_default";

    if (provider === "supabase") {
      const repo = getDataProvider().suggestions;
      if (address) {
        const items = await repo.getAddresses(workspaceId);
        if (!items.some(i => i.label.toLowerCase() === address.trim().toLowerCase())) {
          await repo.addAddress(workspaceId, address.trim());
        }
      }
      if (position) {
        const items = await repo.getPositions(workspaceId);
        const existing = items.find(i => i.label.toLowerCase() === position.trim().toLowerCase());
        if (!existing) {
          await repo.addPosition(workspaceId, position.trim(), salaryNumber > 0 ? [salaryNumber] : []);
        } else if (salaryNumber > 0 && !existing.salaries.includes(salaryNumber)) {
          // If we have a new salary for an existing position, learn it too (up to 3)
          const newSalaries = [...existing.salaries, salaryNumber].slice(0, 3);
          await repo.updatePosition(existing.id, existing.label, newSalaries);
        }
      }
      if (assignment) {
        const items = await repo.getInstitutions(workspaceId);
        if (!items.some(i => i.label.toLowerCase() === assignment.trim().toLowerCase())) {
          await repo.addInstitution(workspaceId, assignment.trim(), address ? [address] : []);
        }
      }
      return;
    }
  } catch (e) {
    console.error("Failed to learn suggestions in Supabase mode", e);
  }

  // Fallback to local logic
  let db = loadSuggestions();
  let changed = false;

  if (address) {
    const nAddr = normalize(address);
    if (!db.addresses.some((a) => normalize(a.label) === nAddr)) {
      const maxOrder = db.addresses.reduce((m, a) => Math.max(m, a.order), -1);
      db.addresses.push({ id: sugId(), label: address.trim(), order: maxOrder + 1 });
      changed = true;
    }
  }
  // ... (rest is same)
  if (position) {
    const nPos = normalize(position);
    const existing = db.positions.find((p) => normalize(p.label) === nPos);
    if (!existing) {
      const maxOrder = db.positions.reduce((m, p) => Math.max(m, p.order), -1);
      db.positions.push({ id: sugId(), label: position.trim(), salaries: salaryNumber > 0 ? [salaryNumber] : [], order: maxOrder + 1 });
      changed = true;
    } else if (salaryNumber > 0 && !existing.salaries.includes(salaryNumber)) {
      existing.salaries = [...existing.salaries, salaryNumber].slice(0, 3);
      changed = true;
    }
  }

  if (assignment) {
    const nAssig = normalize(assignment);
    if (!db.institutions.some((i) => normalize(i.label) === nAssig)) {
      const maxOrder = db.institutions.reduce((m, i) => Math.max(m, i.order), -1);
      const kw = address ? [normalize(address)] : [];
      db.institutions.push({ id: sugId(), label: assignment.trim(), addressKeywords: kw, order: maxOrder + 1 });
      changed = true;
    }
  }

  if (changed) {
    saveSuggestions(db);
  }
}
