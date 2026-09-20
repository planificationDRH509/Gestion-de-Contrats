import type { AppPermission } from "../auth/permissions";

type Props = {
  count: number;
  singleContractAvailable?: boolean;
  label?: string;
  can: (permission: AppPermission) => boolean;
  expanded: boolean;
  onClose: () => void;
  onDetails: () => void;
  onList: (mode: "assign" | "create") => void;
  onDossiers: () => void;
  onNewDossier: () => void;
  onRemoveDossier: () => void;
  onStatus: () => void;
  onTags: () => void;
  onLetter: () => void;
  onDelete: () => void;
  onPrint: () => void;
};
function Action({ icon, label, onClick, danger = false, submenu = false }: {
  icon: string; label: string; onClick: () => void; danger?: boolean; submenu?: boolean;
}) {
  return <button type="button" role="menuitem" className={`context-menu-item contract-action${danger ? " is-danger" : ""}`} onClick={onClick}>
    <span className="material-symbols-rounded" aria-hidden="true">{icon}</span><span>{label}</span>
    {submenu && <span className="material-symbols-rounded contract-action-chevron" aria-hidden="true">chevron_right</span>}
  </button>;
}
export function ContractActionsMenu(props: Props) {
  const { count, can } = props;
  const single = count === 1;
  const singleAvailable = single && props.singleContractAvailable !== false;
  return <>
    <div className="contract-menu-heading">
      <div><strong>{count} contrat{single ? "" : "s"}{single ? "" : " sélectionnés"}</strong><small>{props.label ?? "Actions sur la sélection"}</small></div>
      <button type="button" className="icon-btn" onClick={props.onClose} aria-label="Fermer le menu"><span className="material-symbols-rounded" aria-hidden="true">close</span></button>
    </div>
    {can("contracts.edit") && <div className="contract-menu-group" role="group" aria-label="Listes">
      <div className="contract-menu-label">Listes de contrats</div>
      <Action icon="playlist_add" label="Attribuer à une liste…" onClick={() => props.onList("assign")} />
      <Action icon="add_box" label="Créer une liste avec la sélection…" onClick={() => props.onList("create")} />
    </div>}
    {can("dossiers.manage") && <div className="contract-menu-group" role="group" aria-label="Dossiers">
      <div className="contract-menu-label">Dossiers</div>
      <Action icon="folder_open" label="Attribuer à un dossier" submenu onClick={props.onDossiers} />
      <Action icon="create_new_folder" label="Créer un dossier…" onClick={props.onNewDossier} />
      <Action icon="folder_off" label="Retirer du dossier" onClick={props.onRemoveDossier} />
    </div>}
    {(can("contracts.change_status") || can("contracts.edit")) && <div className="contract-menu-group" role="group" aria-label="Suivi">
      <div className="contract-menu-label">Suivi</div>
      {can("contracts.change_status") && <Action icon="rule" label="Changer l’état" submenu onClick={props.onStatus} />}
      {can("contracts.edit") && <Action icon="label" label="Ajouter un tag" submenu onClick={props.onTags} />}
    </div>}
    <div className="contract-menu-group" role="group" aria-label="Documents">
      <div className="contract-menu-label">Consultation et documents</div>
      {singleAvailable && <Action icon="unfold_more" label={props.expanded ? "Masquer les informations" : "Afficher les informations"} onClick={props.onDetails} />}
      {can("contracts.print") && <Action icon="print" label={single ? "Imprimer le contrat" : "Imprimer la sélection"} onClick={props.onPrint} />}
      {singleAvailable && <Action icon="description" label="Lettre d’affectation" onClick={props.onLetter} />}
    </div>
    {singleAvailable && can("contracts.delete") && <div className="contract-menu-group"><Action icon="delete" label="Supprimer le contrat…" danger onClick={props.onDelete} /></div>}
  </>;
}

/** Right-clicking a selected card keeps the entire selection as the action scope. */
export function contractContextTargets(id: string, selected: string[], selectionScope: boolean) {
  return selectionScope ? [...selected] : [id];
}
