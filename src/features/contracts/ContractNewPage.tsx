import { useEffect, useMemo, useRef, useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useNavigate, useSearchParams } from "react-router-dom";
import { contractFormSchema, ContractFormSchema } from "./contractSchema";
import { useApplicantUpsert, useContractsList, useCreateContract } from "./contractsApi";
import { useAuth } from "../auth/auth";
import { numberToFrenchWords } from "../../lib/numberToFrenchWords";
import { parseMoney, formatFirstName, formatLastName } from "../../lib/format";
import { saveDraftContract } from "./contractDraft";
import { useCreateDossier, useDossiersList } from "../dossiers/dossiersApi";
import { AutocompleteField, type AutocompleteItem } from "../../app/ui/AutocompleteField";

import {
  useAddresses,
  usePositions,
  useInstitutions
} from "../settings/suggestionsApi";
import {
  getLastChoice,
  saveLastChoice,
  learnSuggestions,
} from "../../data/local/suggestionsDb";
import { ContractsSpreadsheetView } from "./ContractsSpreadsheetView";

function normalize(str: string): string {
  if (!str) return "";
  return str
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
}

export function ContractNewPage() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const createContract = useCreateContract();
  const upsertApplicant = useApplicantUpsert();
  const createDossier = useCreateDossier();
  const [serverError, setServerError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const genderFocusRef = useRef<HTMLButtonElement | null>(null);
  const lastFieldRef = useRef<HTMLInputElement | null>(null);
  const addressContainerRef = useRef<HTMLDivElement | null>(null);
  const positionContainerRef = useRef<HTMLDivElement | null>(null);
  const assignmentContainerRef = useRef<HTMLDivElement | null>(null);
  const salaryInputRef = useRef<HTMLInputElement | null>(null);
  const preselectedDossierId = searchParams.get("dossierId") ?? "";
  const workspaceId = user?.workspaceId ?? "";
  const userId = user?.id ?? "";
  const { data: dossiers = [] } = useDossiersList(workspaceId);
  const spreadsheetQueryParams = useMemo(
    () => ({
      workspaceId,
      sort: "createdAt_desc" as const,
      page: 1,
      pageSize: 15,
      onlyMine: true,
      userId
    }),
    [workspaceId, userId]
  );
  const { data: spreadsheetData, isLoading: spreadsheetLoading } = useContractsList(spreadsheetQueryParams);
  const [entryMode, setEntryMode] = useState<"form" | "sheet">(
    () => (localStorage.getItem("new_contract_entry_mode") === "sheet" ? "sheet" : "form")
  );
  const isSheetMode = entryMode === "sheet";
  const [isSheetFullscreen, setIsSheetFullscreen] = useState(false);

  const [msppModalOpen, setMsppModalOpen] = useState(false);
  const { data: allAddresses = [] } = useAddresses(workspaceId);
  const { data: allPositions = [] } = usePositions(workspaceId);
  const { data: allInstitutions = [] } = useInstitutions(workspaceId);

  const defaultDuration = useMemo(() => {
    const stored = localStorage.getItem("last_contract_duration");
    const parsed = stored ? parseInt(stored, 10) : 12;
    return isNaN(parsed) ? 12 : parsed;
  }, []);

  const defaultValues = useMemo<ContractFormSchema>(
    () => ({
      gender: "",
      firstName: "",
      lastName: "",
      nif: "",
      ninu: "",
      salaryNumber: "",
      salaryText: "",
      position: "",
      assignment: "",
      address: "",
      dossierId: preselectedDossierId,
      durationMonths: defaultDuration
    }),
    [preselectedDossierId, defaultDuration]
  );

  const {
    register,
    handleSubmit,
    setValue,
    watch,
    reset,
    setFocus,
    formState: { errors, isSubmitting }
  } = useForm<ContractFormSchema>({
    resolver: zodResolver(contractFormSchema),
    defaultValues
  });

  const salaryNumber = watch("salaryNumber");
  const genderValue = watch("gender");
  const salaryNumberRegister = register("salaryNumber");
  const durationValue = watch("durationMonths");
  const addressValue = watch("address");
  const positionValue = watch("position");
  const assignmentValue = watch("assignment");
  const nifValue = watch("nif");

  const isMedical = /infirmi|medecin|médecin|pharmacien|sage-femme|laboratoire/i.test(positionValue || "");

  function handleVerifyMspp() {
    const rawNif = (nifValue || "").replace(/\D/g, "");
    if (rawNif.length !== 10) {
      alert("Veuillez d'abord renseigner un NIF valide (10 chiffres).");
      return;
    }
    setMsppModalOpen(true);
  }

  // ── Autocomplete items ──────────────────────────────
  const addressItems: AutocompleteItem[] = useMemo(() => {
    const q = normalize(addressValue || "");
    return allAddresses
      .filter(a => normalize(a.label).includes(q))
      .map((a) => ({ id: a.id, label: a.label }));
  }, [allAddresses, addressValue]);

  const positionItems: AutocompleteItem[] = useMemo(() => {
    const q = normalize(positionValue || "");
    return allPositions
      .filter(p => normalize(p.label).includes(q))
      .map((p) => ({
        id: p.id,
        label: p.label,
        sublabel: p.defaultSalary > 0 ? `${p.defaultSalary.toLocaleString("fr-HT")} HTG` : undefined,
      }));
  }, [allPositions, positionValue]);

  const assignmentItems: AutocompleteItem[] = useMemo(() => {
    const q = normalize(assignmentValue || "");
    return allInstitutions
      .filter(i => {
        const matchesQ = normalize(i.label).includes(q);
        return matchesQ;
      })
      .map((i) => ({
        id: i.id,
        label: i.label,
      }));
  }, [allInstitutions, assignmentValue, addressValue]);

  const featuredAddress = useMemo(() => {
    const last = getLastChoice("address");
    return last ? { id: `last_${last}`, label: last } : undefined;
  }, []);

  const featuredPosition = useMemo(() => {
    const last = getLastChoice("position");
    const match = allPositions.find(p => p.label === last);
    return last ? { 
      id: `last_${last}`, 
      label: last,
      sublabel: match && match.defaultSalary > 0 ? `${match.defaultSalary.toLocaleString("fr-HT")} HTG` : undefined
    } : undefined;
  }, [allPositions]);

  const featuredAssignment = useMemo(() => {
    const last = getLastChoice("assignment");
    return last ? { id: `last_${last}`, label: last } : undefined;
  }, []);

  useEffect(() => {
    if (durationValue) {
      localStorage.setItem("last_contract_duration", durationValue.toString());
    }
  }, [durationValue]);

  useEffect(() => {
    const numeric = parseMoney(salaryNumber || "0");
    const computed = numeric ? numberToFrenchWords(numeric) : "";
    setValue("salaryText", computed, { shouldValidate: true, shouldDirty: true });
  }, [salaryNumber, setValue]);

  useEffect(() => {
    setValue("dossierId", preselectedDossierId, { shouldDirty: false });
  }, [preselectedDossierId, setValue]);

  useEffect(() => {
    localStorage.setItem("new_contract_entry_mode", entryMode);
  }, [entryMode]);

  useEffect(() => {
    if (!isSheetMode) {
      setIsSheetFullscreen(false);
    }
  }, [isSheetMode]);

  useEffect(() => {
    if (!(isSheetMode && isSheetFullscreen)) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setIsSheetFullscreen(false);
      }
    };
    document.body.classList.add("contracts-sheet-fullscreen-active");
    window.addEventListener("keydown", onKeyDown);
    return () => {
      document.body.classList.remove("contracts-sheet-fullscreen-active");
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [isSheetMode, isSheetFullscreen]);

  // ── Position selection: auto-fill salary ──────────────────────────────
  function handlePositionSelect(item: AutocompleteItem) {
    const match = allPositions.find((p) => p.id === item.id);
    if (match && match.defaultSalary > 0) {
      setValue("salaryNumber", match.defaultSalary.toString(), {
        shouldValidate: true,
        shouldDirty: true,
      });
    }
  }

  async function persistContract(values: ContractFormSchema, mode: "save" | "print" | "preview") {
    if (!user) return;
    setServerError(null);
    setSuccessMessage(null);

    // Save choices for next time
    saveLastChoice("address", values.address);
    saveLastChoice("position", values.position);
    saveLastChoice("assignment", values.assignment);

    const salaryNumberValue = parseMoney(values.salaryNumber);
    
    // Automatically learn new inputs for the suggestion lists
    learnSuggestions(values.address, values.position, values.assignment, salaryNumberValue);

    const formattedFirstName = formatFirstName(values.firstName);
    const formattedLastName = formatLastName(values.lastName);

    const applicant = await upsertApplicant.mutateAsync({
      workspaceId: user.workspaceId,
      gender: values.gender as "Homme" | "Femme",
      firstName: formattedFirstName,
      lastName: formattedLastName,
      nif: values.nif?.trim() || null,
      ninu: values.ninu?.trim() || null,
      address: values.address
    });

    const contractPayload = {
      workspaceId: user.workspaceId,
      applicantId: applicant.id,
      dossierId: values.dossierId?.trim() ? values.dossierId : null,
      status: mode === "preview" ? "draft" : "saisie",
      gender: values.gender as "Homme" | "Femme",
      firstName: formattedFirstName,
      lastName: formattedLastName,
      nif: values.nif?.trim() || null,
      ninu: values.ninu?.trim() || null,
      address: values.address,
      position: values.position,
      assignment: values.assignment,
      salaryNumber: salaryNumberValue,
      salaryText: values.salaryText,
      durationMonths: values.durationMonths
    } as const;

    if (mode === "preview") {
      saveDraftContract({
        ...contractPayload,
        applicantId: applicant.id
      });
      navigate("/app/contrats/preview");
      return;
    }

    const contract = await createContract.mutateAsync(contractPayload);

    if (mode === "print") {
      navigate(`/app/contrats/print?ids=${contract.id}`);
      return;
    }

    if (mode === "save") {
      setSuccessMessage("Contrat enregistré. Prêt pour une nouvelle saisie.");
      reset(defaultValues);
      requestAnimationFrame(() => setFocus("nif"));
      return;
    }

    navigate(`/app/contrats/${contract.id}`);
  }

  const onSubmit = (mode: "save" | "print" | "preview") =>
    handleSubmit(async (values) => {
      try {
        await persistContract(values, mode);
      } catch (error) {
        console.error(error);
        setServerError(
          error instanceof Error
            ? error.message
            : "Impossible d'enregistrer le contrat. Réessayez."
        );
      }
    });

  function handleGenderSelect(value: "Homme" | "Femme") {
    setValue("gender", value, { shouldValidate: true, shouldDirty: true });
    setTimeout(() => setFocus("ninu"), 0);
  }

  function handleGenderKey(event: React.KeyboardEvent<HTMLDivElement>) {
    const key = event.key.toLowerCase();
    if (key === "f") {
      event.preventDefault();
      handleGenderSelect("Femme");
    }
    if (key === "m") {
      event.preventDefault();
      handleGenderSelect("Homme");
    }
  }

  function handleFormKeyDown(event: React.KeyboardEvent<HTMLFormElement>) {
    if (event.key !== "Enter") return;
    if (!(event.target instanceof HTMLInputElement)) return;
    if (event.target === lastFieldRef.current) {
      return;
    }
    event.preventDefault();
  }

  async function handleCreateDossier() {
    if (!user) return;
    const name = window.prompt("Nom du nouveau dossier");
    if (!name?.trim()) {
      return;
    }
    try {
      const dossier = await createDossier.mutateAsync({
        workspaceId: user.workspaceId,
        name
      });
      setValue("dossierId", dossier.id, { shouldDirty: true });
      setSuccessMessage(`Dossier "${dossier.name}" sélectionné pour ce contrat.`);
      setServerError(null);
    } catch (error) {
      console.error(error);
      setServerError("Impossible de créer le dossier.");
    }
  }



  return (
    <div>
      <div className="section-header">
        <div>
          <div className="section-title">Nouveau contrat</div>
        </div>
        <div className="new-contract-header-actions">
          {isSheetMode ? (
            <button
              type="button"
              className={`icon-btn ${isSheetFullscreen ? "primary" : ""}`}
              title={isSheetFullscreen ? "Réduire le tableur" : "Afficher le tableur en plein écran"}
              onClick={() => setIsSheetFullscreen((prev) => !prev)}
              aria-label={isSheetFullscreen ? "Réduire le tableur" : "Agrandir le tableur"}
            >
              <span className="material-symbols-rounded">
                {isSheetFullscreen ? "fullscreen_exit" : "fullscreen"}
              </span>
            </button>
          ) : null}
          <button
            type="button"
            className={`icon-btn ${isSheetMode ? "primary" : ""}`}
            title={isSheetMode ? "Basculer vers le formulaire" : "Basculer vers la vue tableur"}
            onClick={() => setEntryMode((prev) => (prev === "form" ? "sheet" : "form"))}
            aria-label={isSheetMode ? "Afficher le formulaire" : "Afficher la vue tableur"}
          >
            <span className="material-symbols-rounded">
              {isSheetMode ? "description" : "table_view"}
            </span>
          </button>
        </div>
      </div>

      {!isSheetMode ? (
      <form className="card form-compact" onSubmit={onSubmit("save")} onKeyDown={handleFormKeyDown}>
        <div className="form-grid compact">
          <label className="field">
            <span>NIF *</span>
            <input 
              className="input" 
              placeholder="000-000-000-0" 
              {...register("nif", {
                onChange: (e) => {
                  setMsppModalOpen(false);
                  let val = e.target.value.replace(/\D/g, "");
                  if (val.length > 10) val = val.slice(0, 10);
                  let formatted = "";
                  if (val.length > 0) formatted += val.substring(0, 3);
                  if (val.length > 3) formatted += "-" + val.substring(3, 6);
                  if (val.length > 6) formatted += "-" + val.substring(6, 9);
                  if (val.length > 9) formatted += "-" + val.substring(9, 10);
                  e.target.value = formatted;
                  if (val.length === 10) {
                     setFocus("firstName");
                  }
                }
              })}
              style={errors.nif ? { borderColor: "red" } : undefined}
              autoFocus
            />
            {errors.nif ? <span className="form-error" style={{ padding: "4px 8px", fontSize: "11px" }}>{errors.nif.message}</span> : null}
          </label>

          <label className="field">
            <span>Prénom *</span>
            <input className="input" {...register("firstName")} />
            {errors.firstName ? (
              <span className="form-error" style={{ padding: "4px 8px", fontSize: "11px" }}>{errors.firstName.message}</span>
            ) : null}
          </label>

          <label className="field">
            <span>Nom *</span>
            <input className="input" {...register("lastName")} />
            {errors.lastName ? (
              <span className="form-error" style={{ padding: "4px 8px", fontSize: "11px" }}>{errors.lastName.message}</span>
            ) : null}
          </label>

          <div className="field">
            <span>Sexe *</span>
            <input type="hidden" {...register("gender")} />
            <div
              className="gender-toggle"
              role="radiogroup"
              aria-label="Sexe"
              onKeyDown={handleGenderKey}
            >
              <button
                type="button"
                ref={genderFocusRef}
                className={`gender-option ${genderValue === "Femme" ? "active" : ""}`}
                role="radio"
                aria-checked={genderValue === "Femme"}
                tabIndex={genderValue === "Femme" || genderValue === "" ? 0 : -1}
                onClick={() => handleGenderSelect("Femme")}
              >
                F · Femme
              </button>
              <button
                type="button"
                className={`gender-option ${genderValue === "Homme" ? "active" : ""}`}
                role="radio"
                aria-checked={genderValue === "Homme"}
                tabIndex={genderValue === "Homme" ? 0 : -1}
                onClick={() => handleGenderSelect("Homme")}
              >
                M · Homme
              </button>
            </div>
            {errors.gender ? <span className="form-error" style={{ padding: "4px 8px", fontSize: "11px" }}>{errors.gender.message}</span> : null}
          </div>

          <label className="field">
            <span>NINU</span>
            <input 
              className="input" 
              placeholder="0000000000" 
              {...register("ninu", {
                onChange: (e) => {
                  let val = e.target.value.replace(/\D/g, "");
                  if (val.length > 10) val = val.slice(0, 10);
                  e.target.value = val;
                  if (val.length === 10) {
                     setFocus("address");
                  }
                }
              })}
              style={errors.ninu ? { borderColor: "red" } : undefined}
            />
            {errors.ninu ? <span className="form-error" style={{ padding: "4px 8px", fontSize: "11px" }}>{errors.ninu.message}</span> : null}
          </label>

          <div className="field" ref={addressContainerRef}>
            <span>Adresse *</span>
            <AutocompleteField
              value={addressValue}
              onChange={(val) => setValue("address", val, { shouldValidate: true, shouldDirty: true })}
              onAfterSelect={() => positionContainerRef.current?.querySelector("input")?.focus()}
              featuredItem={featuredAddress}
              items={addressItems}
              placeholder="Commencez à taper une adresse…"
              hasError={!!errors.address}
              name="address"
              pinCategory="address"
            />
            {errors.address ? (
              <span className="form-error" style={{ padding: "4px 8px", fontSize: "11px" }}>{errors.address.message}</span>
            ) : null}
          </div>

          <div className="field" ref={positionContainerRef}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <span>Poste *</span>
              {isMedical && (
                <button
                  type="button"
                  className="btn btn-outline"
                  style={{ padding: "2px 8px", fontSize: "11px", height: "auto", minHeight: "24px" }}
                  onClick={handleVerifyMspp}
                >
                  <span className="material-symbols-rounded" style={{ fontSize: "14px", verticalAlign: "middle" }}>verified_user</span>
                  {" "}Vérifier permis MSPP
                </button>
              )}
            </div>
            <AutocompleteField
              value={positionValue}
              onChange={(val) => setValue("position", val, { shouldValidate: true, shouldDirty: true })}
              onSelect={handlePositionSelect}
              onAfterSelect={() => assignmentContainerRef.current?.querySelector("input")?.focus()}
              featuredItem={featuredPosition}
              items={positionItems}
              placeholder="Sélectionnez ou tapez un poste…"
              hasError={!!errors.position}
              name="position"
              pinCategory="position"
            />
            {errors.position ? (
              <span className="form-error" style={{ padding: "4px 8px", fontSize: "11px" }}>{errors.position.message}</span>
            ) : null}
          </div>

          <div className="field" ref={assignmentContainerRef}>
            <span>Affectation *</span>
            <AutocompleteField
              value={assignmentValue}
              onChange={(val) => setValue("assignment", val, { shouldValidate: true, shouldDirty: true })}
              onAfterSelect={() => salaryInputRef.current?.focus()}
              featuredItem={featuredAssignment}
              items={assignmentItems}
              placeholder="Institution d'affectation…"
              hasError={!!errors.assignment}
              name="assignment"
              pinCategory="assignment"
            />
            {errors.assignment ? (
              <span className="form-error" style={{ padding: "4px 8px", fontSize: "11px" }}>{errors.assignment.message}</span>
            ) : null}
          </div>

          <label className="field">
            <span>Salaire (HTG) *</span>
            <input
              className="input"
              {...salaryNumberRegister}
              placeholder="Ex: 45000"
              inputMode="decimal"
              ref={(element) => {
                salaryNumberRegister.ref(element);
                lastFieldRef.current = element;
                salaryInputRef.current = element;
              }}
            />
            {errors.salaryNumber ? (
              <span className="form-error" style={{ padding: "4px 8px", fontSize: "11px" }}>{errors.salaryNumber.message}</span>
            ) : null}
          </label>

          <div className="field span-2">
            <label htmlFor="salaryText">
              <span>Salaire en lettre</span>
            </label>
            <input
              id="salaryText"
              className="input"
              {...register("salaryText")}
              readOnly
              tabIndex={-1}
            />
          </div>

          <div className="field span-2">
            <span>Dossier</span>
            <div className="field-inline-actions">
              <select className="select" {...register("dossierId")}>
                <option value="">Aucun dossier</option>
                {dossiers.map((dossier) => (
                  <option key={dossier.id} value={dossier.id}>
                    {dossier.name}
                  </option>
                ))}
              </select>
              <button
                type="button"
                className="btn btn-outline"
                onClick={handleCreateDossier}
                disabled={createDossier.isPending}
              >
                <span className="material-symbols-rounded icon">create_new_folder</span>
                Dossier
              </button>
            </div>
          </div>

          <label className="field">
            <span>Durée du contrat *</span>
            <div style={{ position: "relative" }}>
               <input
                 className="input"
                 type="number"
                 min="1"
                 max="12"
                 style={{ paddingRight: "42px" }}
                 {...register("durationMonths", { valueAsNumber: true })}
               />
               <span style={{ position: "absolute", right: "12px", top: "50%", transform: "translateY(-50%)", color: "var(--ink-muted)", pointerEvents: "none" }}>mois</span>
            </div>
            {errors.durationMonths ? (
              <span className="form-error" style={{ padding: "4px 8px", fontSize: "11px" }}>{errors.durationMonths.message}</span>
            ) : null}
          </label>
        </div>

        {serverError ? <div className="form-error">{serverError}</div> : null}
        {successMessage ? <div className="form-success">{successMessage}</div> : null}

        <div className="form-actions">
          <button className="btn btn-primary" type="submit" disabled={isSubmitting}>
            <span className="material-symbols-rounded icon">save</span>
            Enregistrer
          </button>
          <button
            className="btn btn-outline"
            type="button"
            onClick={onSubmit("preview")}
            disabled={isSubmitting}
          >
            <span className="material-symbols-rounded icon">visibility</span>
            Aperçu
          </button>
          <button
            className="btn btn-outline"
            type="button"
            onClick={onSubmit("print")}
            disabled={isSubmitting}
          >
            <span className="material-symbols-rounded icon">print</span>
            Imprimer
          </button>
        </div>
      </form>
      ) : (
        isSheetFullscreen ? (
          <div className="contracts-sheet-fullscreen">
            <div className="contracts-sheet-fullscreen-topbar">
              <button
                type="button"
                className="icon-btn primary"
                title="Réduire le tableur"
                onClick={() => setIsSheetFullscreen(false)}
                aria-label="Réduire le tableur"
              >
                <span className="material-symbols-rounded">fullscreen_exit</span>
              </button>
            </div>
            <div className="contracts-sheet-fullscreen-body">
              <ContractsSpreadsheetView
                workspaceId={workspaceId}
                userId={userId}
                contracts={spreadsheetData?.items ?? []}
                isLoading={spreadsheetLoading}
                showToolbar={false}
              />
            </div>
          </div>
        ) : (
          <div className="card">
            <ContractsSpreadsheetView
              workspaceId={workspaceId}
              userId={userId}
              contracts={spreadsheetData?.items ?? []}
              isLoading={spreadsheetLoading}
            />
          </div>
        )
      )}

      {/* ── Modal MSPP ──────────────────────────────────── */}
      {msppModalOpen && (
        <div
          onClick={(e) => { if (e.target === e.currentTarget) setMsppModalOpen(false); }}
          style={{
            position: "fixed", inset: 0, zIndex: 1000,
            background: "rgba(0,0,0,0.5)",
            display: "flex", alignItems: "center", justifyContent: "center",
            padding: "16px"
          }}
        >
          <div style={{
            background: "var(--panel, #fff)",
            borderRadius: "12px",
            width: "100%",
            maxWidth: "520px",
            maxHeight: "80vh",
            overflow: "hidden",
            display: "flex",
            flexDirection: "column",
            boxShadow: "0 20px 60px rgba(0,0,0,0.3)"
          }}>
            <div style={{
              display: "flex", alignItems: "center", justifyContent: "space-between",
              padding: "12px 16px",
              borderBottom: "1px solid var(--border, #eee)"
            }}>
              <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                <span className="material-symbols-rounded" style={{ fontSize: "20px", color: "var(--accent, #10b981)" }}>verified_user</span>
                <span style={{ fontWeight: 600, fontSize: "14px" }}>Vérification MSPP</span>
              </div>
              <button
                type="button"
                onClick={() => setMsppModalOpen(false)}
                style={{ background: "none", border: "none", cursor: "pointer", padding: "4px", lineHeight: 1 }}
              >
                <span className="material-symbols-rounded" style={{ fontSize: "20px", color: "var(--ink-muted, #666)" }}>close</span>
              </button>
            </div>
            <iframe
              src={`/api/local/mspp/verify?nif=${(nifValue || "").replace(/\D/g, "")}`}
              title="Vérification du permis MSPP"
              style={{ flex: 1, border: "none", minHeight: "320px" }}
            />
          </div>
        </div>
      )}

    </div>
  );
}
