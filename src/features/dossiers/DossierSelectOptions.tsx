import { Dossier } from "../../data/types";
import { getDossierGroups } from "../../lib/dossier";

type DossierSelectOptionsProps = {
  dossiers: Dossier[];
  emptyLabel?: string;
};

export function DossierSelectOptions({
  dossiers,
  emptyLabel = "Aucun dossier"
}: DossierSelectOptionsProps) {
  const groups = getDossierGroups(dossiers);

  return (
    <>
      <option value="">{emptyLabel}</option>
      {groups.active.map((dossier) => (
        <option key={dossier.id} value={dossier.id}>
          {dossier.name}
        </option>
      ))}
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
