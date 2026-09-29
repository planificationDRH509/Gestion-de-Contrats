import { useDossierContractMetrics } from "./dossiersApi";
import { useAuth } from "../auth/auth";
import { Dossier } from "../../data/types";
import { getUserDossierGroups } from "../../lib/dossier";

type DossierSelectOptionsProps = {
  dossiers: Dossier[];
  emptyLabel?: string;
};

export function DossierSelectOptions({
  dossiers,
  emptyLabel = "Aucun dossier"
}: DossierSelectOptionsProps) {
  const { user } = useAuth();
  const { data: metrics = {} } = useDossierContractMetrics(user?.workspaceId ?? "");
  const groups = getUserDossierGroups(dossiers, user?.id, metrics);

  return (
    <>
      <option value="">{emptyLabel}</option>
      {groups.active.map((dossier) => (
        <option key={dossier.id} value={dossier.id}>
          {dossier.name}
        </option>
      ))}
      {groups.others.length > 0 ? (
        <optgroup label="Autres dossiers">
          {groups.others.map((dossier) => (
            <option key={dossier.id} value={dossier.id}>{dossier.name}</option>
          ))}
        </optgroup>
      ) : null}
      {groups.archived.length > 0 ? (
        <optgroup label="Dossiers archivés">
          {groups.archived.map((dossier) => (
            <option key={dossier.id} value={dossier.id}>
              {dossier.name}
            </option>
          ))}
        </optgroup>
      ) : null}
      {groups.classified.length > 0 ? (
        <optgroup label="Dossiers classés">
          {groups.classified.map((dossier) => (
            <option key={dossier.id} value={dossier.id}>
              {dossier.name}
            </option>
          ))}
        </optgroup>
      ) : null}
    </>
  );
}
