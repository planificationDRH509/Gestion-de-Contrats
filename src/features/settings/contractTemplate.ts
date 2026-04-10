import { Contract } from "../../data/types";
import { formatCurrency } from "../../lib/format";

export type ContractTemplate = {
  html: string;
  css: string;
};

export type DraftTemplateType = "contract" | "assignment_letter" | "nomination";

export type DraftTemplateOption = {
  type: DraftTemplateType;
  label: string;
  description: string;
};

type DraftTemplateDefinition = DraftTemplateOption & {
  storageKey: string;
  eventName: string;
  defaultTemplate: ContractTemplate;
};

const defaultContractTemplate: ContractTemplate = {
  html: `
<div class="draft-doc">
  <header class="draft-header">
    <div>
      <div class="draft-title">Contrat de collaboration</div>
      <div class="draft-subtitle">Réf. {{contract_id}}</div>
    </div>
    <div class="draft-badge">{{workspace_name}}</div>
  </header>

  <section class="draft-section">
    <h3>Identification</h3>
    <p><strong>Nom :</strong> {{last_name}}</p>
    <p><strong>Prénom :</strong> {{first_name}}</p>
    <p><strong>Sexe :</strong> {{gender}}</p>
    <p><strong>Adresse :</strong> {{address}}</p>
    <p><strong>NIF :</strong> {{nif}}</p>
    <p><strong>NINU :</strong> {{ninu}}</p>
  </section>

  <section class="draft-section">
    <h3>Fonction & Période</h3>
    <p><strong>Poste :</strong> {{position}}</p>
    <p><strong>Affectation :</strong> {{assignment}}</p>
    <p><strong>Durée :</strong> {{duration_months}} mois</p>
    <p><strong>Période :</strong> du {{date_debut}} au {{date_fin}}</p>
  </section>

  <section class="draft-section">
    <h3>Rémunération</h3>
    <p>Salaire mensuel brut : {{salary_number}}</p>
    <p>En lettres : {{salary_text}}.</p>
  </section>

  <section class="draft-section">
    <h3>Engagements</h3>
    <p>
      Le présent contrat formalise la collaboration entre les parties. La personne engagée
      s'engage à respecter les procédures internes et à accomplir ses tâches conformément aux
      directives reçues.
    </p>
    <p>
      La rémunération est versée mensuellement. Toute modification substantielle fera l'objet
      d'un avenant écrit.
    </p>
  </section>

  <section class="draft-section">
    <p>Fait à Port-au-Prince, le {{created_date_long}}.</p>
    <p>Ce contrat débute le <strong>{{date_debut}}</strong> et se termine le <strong>{{date_fin}}</strong>.</p>
  </section>

  <div class="draft-signatures">
    <div class="draft-sign">Signature de l'employeur</div>
    <div class="draft-sign">Signature du collaborateur</div>
  </div>
</div>
  `.trim(),
  css: `
.draft-doc {
  font-family: "Space Grotesk", "Helvetica Neue", sans-serif;
  color: #1f1f1f;
}

.draft-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 24px;
}

.draft-title {
  font-family: "Fraunces", "Georgia", serif;
  font-size: 22px;
}

.draft-subtitle {
  color: #6b6b6b;
  font-size: 12px;
  letter-spacing: 0.05em;
  text-transform: uppercase;
}

.draft-badge {
  background: #f1efeb;
  color: #6b6b6b;
  padding: 6px 10px;
  border-radius: 999px;
  font-size: 12px;
}

.draft-section {
  margin-bottom: 16px;
}

.draft-section h3 {
  font-size: 12px;
  text-transform: uppercase;
  letter-spacing: 0.04em;
  margin-bottom: 6px;
  color: #6b6b6b;
}

.draft-section p {
  margin: 0 0 6px 0;
  font-size: 14px;
  line-height: 1.6;
}

.draft-signatures {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: 32px;
  margin-top: 40px;
}

.draft-sign {
  border-top: 1px solid #aaa;
  padding-top: 6px;
  font-size: 12px;
  color: #6b6b6b;
}
  `.trim()
};

const defaultAssignmentLetterTemplate: ContractTemplate = {
  html: `
<div class="draft-doc">
  <header class="draft-header">
    <div>
      <div class="draft-subtitle">Lettre d'affectation</div>
      <div class="draft-title">Notification de poste</div>
      <div class="draft-subtitle">Réf. {{contract_id}}</div>
    </div>
    <div class="draft-badge">{{workspace_name}}</div>
  </header>

  <section class="draft-section">
    <p><strong>Destinataire :</strong> {{last_name}} {{first_name}}</p>
    <p><strong>Adresse :</strong> {{address}}</p>
  </section>

  <section class="draft-section">
    <p>
      Par la présente, vous êtes affecté(e) au poste de <strong>{{position}}</strong>
      au sein de <strong>{{assignment}}</strong>.
    </p>
    <p>
      Cette affectation prend effet le <strong>{{date_debut}}</strong> pour une durée de
      <strong> {{duration_months}} mois</strong>, jusqu'au <strong>{{date_fin}}</strong>.
    </p>
  </section>

  <section class="draft-section draft-highlight">
    <p><strong>Rémunération mensuelle :</strong> {{salary_number}}</p>
    <p><strong>Montant en lettres :</strong> {{salary_text}}</p>
  </section>

  <section class="draft-section">
    <p>
      Merci de vous présenter à votre affectation avec les pièces administratives requises.
      Cette lettre vaut notification officielle.
    </p>
    <p>Fait à Port-au-Prince, le {{created_date_long}}.</p>
  </section>

  <div class="draft-signatures">
    <div class="draft-sign">Responsable RH</div>
    <div class="draft-sign">Collaborateur(trice)</div>
  </div>
</div>
  `.trim(),
  css: `
.draft-doc {
  font-family: "Space Grotesk", "Helvetica Neue", sans-serif;
  color: #1f1f1f;
}

.draft-header {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  margin-bottom: 24px;
}

.draft-title {
  font-family: "Fraunces", "Georgia", serif;
  font-size: 24px;
  margin-top: 2px;
}

.draft-subtitle {
  color: #6b6b6b;
  font-size: 12px;
  letter-spacing: 0.05em;
  text-transform: uppercase;
}

.draft-badge {
  background: #f4f8f4;
  color: #39764c;
  padding: 6px 10px;
  border-radius: 999px;
  font-size: 12px;
}

.draft-section {
  margin-bottom: 16px;
}

.draft-section p {
  margin: 0 0 8px;
  font-size: 14px;
  line-height: 1.65;
}

.draft-highlight {
  padding: 12px;
  border: 1px solid #d8e4d4;
  border-radius: 10px;
  background: #fafdf9;
}

.draft-signatures {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: 32px;
  margin-top: 44px;
}

.draft-sign {
  border-top: 1px solid #9ca3af;
  padding-top: 6px;
  font-size: 12px;
  color: #6b6b6b;
}
  `.trim()
};

const defaultNominationTemplate: ContractTemplate = {
  html: `
<div class="draft-doc">
  <header class="draft-header">
    <div>
      <div class="draft-subtitle">Acte de nomination</div>
      <div class="draft-title">Décision de nomination</div>
      <div class="draft-subtitle">N° {{contract_id}}</div>
    </div>
    <div class="draft-badge">{{workspace_name}}</div>
  </header>

  <section class="draft-section">
    <p>
      Vu les besoins de service, la personne ci-dessous est nommée aux fonctions indiquées.
    </p>
  </section>

  <section class="draft-section draft-grid">
    <p><strong>Nom et prénom :</strong> {{last_name}} {{first_name}}</p>
    <p><strong>Sexe :</strong> {{gender}}</p>
    <p><strong>NIF :</strong> {{nif}}</p>
    <p><strong>NINU :</strong> {{ninu}}</p>
    <p><strong>Poste :</strong> {{position}}</p>
    <p><strong>Affectation :</strong> {{assignment}}</p>
    <p><strong>Durée :</strong> {{duration_months}} mois</p>
    <p><strong>Date d'effet :</strong> {{date_debut}}</p>
  </section>

  <section class="draft-section">
    <p>
      L'intéressé(e) bénéficie d'une rémunération mensuelle de <strong>{{salary_number}}</strong>
      ({{salary_text}}) et doit se conformer aux règlements internes en vigueur.
    </p>
    <p>La présente nomination prend fin le {{date_fin}}.</p>
    <p>Fait à Port-au-Prince, le {{created_date_long}}.</p>
  </section>

  <div class="draft-signatures">
    <div class="draft-sign">Autorité de nomination</div>
    <div class="draft-sign">Personne nommée</div>
  </div>
</div>
  `.trim(),
  css: `
.draft-doc {
  font-family: "Space Grotesk", "Helvetica Neue", sans-serif;
  color: #222;
}

.draft-header {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  margin-bottom: 28px;
}

.draft-title {
  font-family: "Fraunces", "Georgia", serif;
  font-size: 24px;
  margin-top: 2px;
}

.draft-subtitle {
  color: #6b6b6b;
  font-size: 12px;
  letter-spacing: 0.05em;
  text-transform: uppercase;
}

.draft-badge {
  background: #f4f5fb;
  color: #4b4f90;
  padding: 6px 10px;
  border-radius: 999px;
  font-size: 12px;
}

.draft-section {
  margin-bottom: 16px;
}

.draft-section p {
  margin: 0 0 8px;
  font-size: 14px;
  line-height: 1.65;
}

.draft-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 8px 18px;
  border-top: 1px solid #e5e7eb;
  border-bottom: 1px solid #e5e7eb;
  padding: 10px 0;
}

.draft-signatures {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: 32px;
  margin-top: 44px;
}

.draft-sign {
  border-top: 1px solid #9ca3af;
  padding-top: 6px;
  font-size: 12px;
  color: #6b6b6b;
}
  `.trim()
};

const TEMPLATE_DEFINITIONS: Record<DraftTemplateType, DraftTemplateDefinition> = {
  contract: {
    type: "contract",
    label: "Contrat",
    description: "Template utilisé pour les contrats et impressions actuelles.",
    storageKey: "contribution_contract_template",
    eventName: "contract-template-updated",
    defaultTemplate: defaultContractTemplate
  },
  assignment_letter: {
    type: "assignment_letter",
    label: "Lettre d'affectation",
    description: "Modèle de notification d'affectation du personnel.",
    storageKey: "contribution_assignment_letter_template",
    eventName: "assignment-letter-template-updated",
    defaultTemplate: defaultAssignmentLetterTemplate
  },
  nomination: {
    type: "nomination",
    label: "Nomination",
    description: "Document de décision de nomination.",
    storageKey: "contribution_nomination_template",
    eventName: "nomination-template-updated",
    defaultTemplate: defaultNominationTemplate
  }
};

function cloneTemplate(template: ContractTemplate): ContractTemplate {
  return {
    html: template.html,
    css: template.css
  };
}

function getTemplateDefinition(type: DraftTemplateType): DraftTemplateDefinition {
  return TEMPLATE_DEFINITIONS[type];
}

export const draftTemplateOptions: DraftTemplateOption[] = (
  Object.values(TEMPLATE_DEFINITIONS) as DraftTemplateDefinition[]
).map(({ type, label, description }) => ({ type, label, description }));

export function getDefaultTemplate(type: DraftTemplateType): ContractTemplate {
  return cloneTemplate(getTemplateDefinition(type).defaultTemplate);
}

export function loadTemplateByType(type: DraftTemplateType): ContractTemplate {
  const definition = getTemplateDefinition(type);
  const raw = localStorage.getItem(definition.storageKey);
  if (!raw) return getDefaultTemplate(type);

  try {
    const parsed = JSON.parse(raw) as Partial<ContractTemplate>;
    if (typeof parsed.html !== "string" || typeof parsed.css !== "string") {
      return getDefaultTemplate(type);
    }

    return {
      html: parsed.html,
      css: parsed.css
    };
  } catch {
    return getDefaultTemplate(type);
  }
}

export function saveTemplateByType(type: DraftTemplateType, template: ContractTemplate) {
  const definition = getTemplateDefinition(type);
  localStorage.setItem(definition.storageKey, JSON.stringify(template));
  window.dispatchEvent(new Event(definition.eventName));
}

export function resetTemplateByType(type: DraftTemplateType) {
  const definition = getTemplateDefinition(type);
  localStorage.removeItem(definition.storageKey);
  window.dispatchEvent(new Event(definition.eventName));
}

export function subscribeTemplateByType(type: DraftTemplateType, listener: () => void) {
  const definition = getTemplateDefinition(type);
  window.addEventListener(definition.eventName, listener);
  return () => window.removeEventListener(definition.eventName, listener);
}

// Backward compatibility: current contract flow still uses these functions.
export const defaultTemplate: ContractTemplate = getDefaultTemplate("contract");

export function loadTemplate(): ContractTemplate {
  return loadTemplateByType("contract");
}

export function saveTemplate(template: ContractTemplate) {
  saveTemplateByType("contract", template);
}

export function resetTemplate() {
  resetTemplateByType("contract");
}

export function subscribeTemplate(listener: () => void) {
  return subscribeTemplateByType("contract", listener);
}

export function buildTemplateVariables(contract: Contract, workspaceName = "Planification") {
  const date = new Date(contract.createdAt);

  let endYear = date.getFullYear();
  if (date.getMonth() >= 9) {
    endYear++;
  }
  const endDate = new Date(endYear, 8, 30);

  const d = contract.durationMonths ?? 12;
  const targetStartMonth = 8 - d + 1;
  const startDate = new Date(endYear, targetStartMonth, 1);
  while (startDate.getDay() !== 1) {
    startDate.setDate(startDate.getDate() + 1);
  }

  const dateOptions: Intl.DateTimeFormatOptions = { year: "numeric", month: "long", day: "numeric" };
  const dateDebut = startDate.toLocaleDateString("fr-FR", dateOptions);
  const dateFin = endDate.toLocaleDateString("fr-FR", dateOptions);

  return {
    contract_id: contract.id,
    first_name: contract.firstName,
    last_name: contract.lastName,
    full_name: `${contract.lastName} ${contract.firstName}`.trim(),
    gender: contract.gender,
    address: contract.address,
    nif: contract.nif ?? "",
    ninu: contract.ninu ?? "",
    position: contract.position,
    assignment: contract.assignment,
    salary_number: formatCurrency(contract.salaryNumber),
    salary_number_raw: contract.salaryNumber.toString(),
    salary_text: contract.salaryText,
    duration_months: contract.durationMonths.toString(),
    date_debut: dateDebut,
    date_fin: dateFin,
    created_date: date.toLocaleDateString("fr-FR"),
    created_date_long: date.toLocaleDateString("fr-FR", {
      year: "numeric",
      month: "long",
      day: "numeric"
    }),
    workspace_name: workspaceName
  };
}

export function renderTemplate(html: string, variables: Record<string, string>) {
  return html.replace(/\{\{\s*([a-zA-Z0-9_]+)\s*\}\}/g, (_, key: string) => {
    return variables[key] ?? "";
  });
}

export const templateVariables = [
  { key: "{{contract_id}}", label: "ID du contrat" },
  { key: "{{first_name}}", label: "Prénom" },
  { key: "{{last_name}}", label: "Nom" },
  { key: "{{full_name}}", label: "Nom complet" },
  { key: "{{gender}}", label: "Sexe" },
  { key: "{{address}}", label: "Adresse" },
  { key: "{{nif}}", label: "NIF" },
  { key: "{{ninu}}", label: "NINU" },
  { key: "{{position}}", label: "Poste" },
  { key: "{{assignment}}", label: "Affectation" },
  { key: "{{salary_number}}", label: "Salaire formaté" },
  { key: "{{salary_number_raw}}", label: "Salaire brut" },
  { key: "{{salary_text}}", label: "Salaire en lettres" },
  { key: "{{duration_months}}", label: "Durée (mois)" },
  { key: "{{date_debut}}", label: "Date de début" },
  { key: "{{date_fin}}", label: "Date de fin" },
  { key: "{{created_date}}", label: "Date courte" },
  { key: "{{created_date_long}}", label: "Date longue" },
  { key: "{{workspace_name}}", label: "Nom du workspace" }
];
