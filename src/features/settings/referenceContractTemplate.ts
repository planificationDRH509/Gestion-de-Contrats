import type { ContractTemplate } from "./contractTemplate";

export const REFERENCE_CONTRACT_LAYOUT = "morquette-reference-v2";

export const referenceContractTemplate: ContractTemplate = {
  html: `
<div class="draft-doc" data-contract-layout="${REFERENCE_CONTRACT_LAYOUT}">
  <section class="contract-sheet" data-page="1">
    <div class="contract-header">
      <span>No……………………..</span>
      <span>Port-au-Prince, le………………………</span>
    </div>

    <p class="contract-title"><strong><u>CONTRAT DE SERVICE</u></strong></p>
    <p><strong>Entre</strong></p>

    <p>L’Etat Haïtien, représenté par <strong>Docteur Bertrand SINAL</strong>, identifié par son <strong>NINU : 1009241060</strong> et son <strong>NIF : 003-888-685-8</strong>, demeurant et domicilié au numéro 1 Rue Jacques Roumain, Maïs Gâté, Port-au-Prince, agissant en ses qualités de Ministre de la Santé Publique et de la Population, ci-après dénommé&lt;&lt; <strong>l’Employeur</strong>&gt;&gt;.</p>

    <p><strong>Et</strong></p>

    <p>{{honorific}} <strong>{{first_name}} {{last_name}},</strong> {{identifiee_identifie}} par son <strong>NINU : {{ninu}}</strong> et son <strong>NIF : {{nif}}</strong> demeurant et domicilié à {{address}}, ci-après {{denommee_denomme}} {{contractant_legal}}.</p>

    <p>Considérant que pour pouvoir réaliser sa mission d’intérêt général et assurer le fonctionnement normal de ses différentes entités, l’employeur doit disposer de ressources humaines adéquates ; Qu’à cette fin, il convient d’engager des cadres compétents ;</p>

    <p>Considérant que {{la_le_contractant}} possède les compétences requises pour intervenir dans les tâches administratives de son entité d’affectation ;</p>

    <p>Considérant qu’au regard de l’article 200-4 de la constitution et de l’article 5.3 de décret du 23 novembre 2005 régissant l’organisation et le fonctionnement de la <strong>CSC/CA</strong> la Cour Supérieure des Comptes et du Contentieux Administratif donne son avis sur tous les projets de contrats à caractère financier ou commercial auxquels l’Etat est partie ;</p>

    <p>Considérant qu’il y a lieu de matérialiser les termes de cet accord dans un contrat</p>

    <p>Vu l’avis numéro ……………. de la Cour Supérieure des Comptes et du Contentieux Administratif en date du ………………….</p>

    <p><strong>Il a été convenu et arrêté ce qui suit :</strong></p>

    <p><strong>Article 1.- Objet du contrat</strong></p>
    <p>L’employeur engage {{la_le_contractant}}, qui l’accepte, à titre de <strong>{{position}} à {{assignment}}</strong> selon la description de tâche annexée au présent contrat pour en faire partie.</p>

    <p><strong>Article 2.- Pièces constitutives</strong></p>
    <p><strong>Les documents contractuels sont les suivants :</strong></p>
    <div class="contract-list">
      <p>- <span>Le contrat dûment signé par les deux parties</span></p>
      <p>- <span>La description de taches de {{la_le_contractant}}</span></p>
      <p>- <span>Le curriculum vitae de {{la_le_contractant}}</span></p>
      <p>- <span>Copie de la CINU et matricule fiscal de {{la_le_contractant}}.</span></p>
    </div>

    <p><strong>Article 3.- Obligation du contractant</strong></p>
    <p>{{La_Le_Contractant}} s’engage à fournir avec compétence, loyauté, dévouement et célérité ses connaissances techniques au bon fonctionnement du Ministère de la Santé Publique et de la Population.</p>

    <span class="contract-page-number" aria-hidden="true">1</span>
  </section>

  <section class="contract-sheet" data-page="2">
    <p>{{Elle_Il}} fournira ses services dans les domaines spécifiés et accomplira ses tâches telles que définies dans sa description de tâches. {{Elle_Il}} s’engage à présenter régulièrement à son supérieur hiérarchique immédiat des rapports de ses activités et un rapport global à la fin du contrat.</p>

    <p><strong>Article 4.- Statut du contractant</strong></p>
    <p>{{La_Le_Contractant}} travaillera sous la supervision de son supérieur hiérarchique immédiat.</p>
    <p>{{La_Le_Contractant}} est un agent public contractuel. {{Elle_Il}} ne sera pas {{consideree_considere}}, à quelque fin que ce soit, comme fonctionnaire de l’Etat et ne sera donc pas {{couverte_couvert}} par le Statut Général de la Fonction Publique. {{Elle_Il}} ne peut en aucun cas prétendre à des droits autres que ceux contenus dans le présent contrat.</p>

    <p><strong>Article 5.- Respect de la légalité</strong></p>
    <p>{{La_Le_Contractant}} reconnait qu’{{elle_il}} est {{astreinte_astreint}} au respect de la loi dans tous ses agissements sous peine de voir la responsabilité de l’administration ou la sienne propre {{engagee_engage}} et d’attirer sur {{elle_lui}} des sanctions disciplinaires ou pénales.</p>

    <p><strong>Article 6.- Clause d’éthique</strong></p>
    <p>{{La_Le_Contractant}} ne peut user de sa qualité, de son emploi ou des attributs de sa fonction en vue d’obtenir ou tenter d’obtenir un avantage de quelque nature que ce soit. De même, {{elle_il}} ne peut user de sa qualité pour entreprendre des démarches ayant pour objet une faveur personnelle, ou exercer une pression quelconque sur des tiers à des fins personnelles.</p>

    <p><strong>Article 7.- Horaire de travail</strong></p>
    <p>{{La_Le_Contractant}} s’engage à travailler huit heures par jour, du lundi au vendredi. Cependant, {{elle_il}} peut être {{appelee_appele}}, en cas de besoin, à travailler au-delà des heures et/ou jours règlementaires sans pouvoir prétendre à une rémunération supplémentaire.</p>

    <p><strong>Articles 8.- Droits de propriété</strong></p>
    <p>Les droits de propriété, droits d’auteur et tous autres droits de quelque nature que ce soit, sur toute étude ou toute œuvre produite par {{la_le_contractant}} dans le cadre de l’exécution du présent contrat, restent la propriété exclusive de l’Employeur.</p>
    <p>Il est formellement interdit à {{la_le_contractant}} de détruire, de détourner des dossiers, des pièces ou documents de service.</p>

    <p><strong>Article 9.- Responsabilité relative au matériel de service</strong></p>
    <p>{{La_Le_Contractant}} reconnait que le matériel mis à sa disposition pour les besoins du service reste et demeure la propriété de l’Employeur et qu’{{elle_il}} doit le gérer en bon chef de famille.</p>
    <p>{{Elle_Il}} engage sa responsabilité en cas de vol, perte, détérioration ou dégradation, ou toute autre cause pouvant affecter le bon fonctionnement ou la valeur du matériel pour laquelle {{elle_il}} ne peut pas se dégager de sa responsabilité directe.</p>
    <p>Ce matériel doit être restitué à l’Employeur à la fin du contrat.</p>

    <span class="contract-page-number" aria-hidden="true">2</span>
  </section>

  <section class="contract-sheet" data-page="3">
    <p><strong>Article 10.- Obligation de confidentialité</strong></p>
    <p>{{La_Le_Contractant}} s’abstiendra de communiquer à toute autre personne, à toute entité ou à tout organisme étranger à l’Employeur, les documents et les informations dont {{elle_il}} aurait eu connaissance dans le cadre de l’exécution de ses tâches conformément au présent contrat.</p>

    <p><strong>Article 11.- Obligation de réserve et de discrétion professionnelle</strong></p>
    <p>{{La_Le_Contractant}} est {{tenue_tenu}} à une obligation de réserve et doit notamment s’abstenir, même en dehors du service, de tout acte incompatible avec la dignité de la fonction qu’{{elle_il}} occupe.</p>
    <p>{{Elle_Il}} est {{liee_lie}} par l’obligation de discrétion professionnelle pour tout ce qui concerne les faits, les informations et les documents dont {{elle_il}} a connaissance dans l’exercice ou à l’occasion de sa fonction.</p>

    <p><strong>Article 12.- Normes de conduite</strong></p>
    <p>{{La_Le_Contractant}} ne doit se livrer à aucune activité incompatible avec la mission de l’Employeur ou nuisible à l’accomplissement des tâches définies dans le présent contrat. {{Elle_Il}} doit s’abstenir de toutes actions ou tous comportements susceptibles de nuire aux intérêts de l’Employeur.</p>

    <p><strong>Articles 13.- Discipline</strong></p>
    <p>{{La_Le_Contractant}} reconnait que le manquement à ses obligations en vertu du présent contrat constitue une faute disciplinaire qui l’expose à une sanction disciplinaire sans préjudice des réparations liées à sa responsabilité civile et des peines prévues par les dispositions du Code Pénal consécutives à une infraction de droit commun.</p>
    <p>Les sanctions disciplinaires auxquelles est {{exposee_expose}} {{la_le_contractant}} sont celles énumérées à l’article 188 alinéas 1 et 2 du décret du 17 mai 2005 portant révision du Statut Général de la Fonction Publique et sont subordonnées au principe de proportionnalité par rapport à la gravité de la faute. Elles seront prononcées par le supérieur hiérarchique immédiat de {{la_le_contractant}}.</p>

    <p><strong>Article 14.- Congé</strong></p>
    <p>{{La_Le_Contractant}} a droit à un congé régulier payé de 15 jours ouvrables pour une année de service. Ce congé pourra être obtenu sur demande écrite adressée au Service d’Affectation, après approbation de la Direction ou Service des Ressources Humaines.</p>

    <p><strong>Article 15.- Fin de contrat</strong></p>
    <p>Le présent contrat prend fin de plein droit le <strong>{{date_fin}}.</strong></p>
    <p>De même ce contrat prend automatiquement fin et sans aucune responsabilité pour aucune des parties</p>
    <div class="contract-list">
      <p>- <span>Par le décès de {{la_le_contractant}} ;</span></p>
      <p>- <span>Par le consentement mutuel des parties ;</span></p>
      <p>- <span>En cas d’incapacité dûment constatée de {{la_le_contractant}} ;</span></p>
      <p>- <span>Dans les autres cas prévus par la loi.</span></p>
    </div>

    <p><strong>Article 16.- Résiliation</strong></p>
    <p>Le présent contrat sera résilié de plein droit et sans indemnité :</p>
    <div class="contract-list">
      <p>- <span>Pour non-respect des clauses du contrat ;</span></p>
      <p>- <span>Pour rendement insatisfaisant de {{la_le_contractant}} ;</span></p>
      <p>- <span>En cas de conflit d’intérêts ; Pour faute grave de {{la_le_contractant}}.</span></p>
    </div>

    <span class="contract-page-number" aria-hidden="true">3</span>
  </section>

  <section class="contract-sheet contract-final-sheet" data-page="4">
    <p><strong>Article 17.- Rémunération</strong></p>
    <p>L’Etat Haïtien versera mensuellement au Contractant, le montant de <strong>{{salary_text}} GOURDES ({{salary_number}})</strong>, en prélevant les retenues exigées par la loi.</p>

    <p><strong>Article 18.- Durée du contrat</strong></p>
    <p>Le présent contrat est conclu pour une durée de <strong>{{duration_months_text}} ({{duration_months_padded}}) mois</strong> débutant le <strong>{{date_debut}}</strong> et prenant fin le <strong>{{date_fin}}.</strong></p>

    <p><strong>Article 19.- Règlement des conflits</strong></p>
    <p>Tout différend relatif à l’interprétation ou à l’application du présent contrat qui ne pourra être résolu à l’amiable sera tranché par la Cour Supérieur des Comptes et du Contentieux Administratif.</p>

    <p><strong>Article 20.- Loi applicable</strong></p>
    <p>Pour tout ce qui n’est pas stipulé dans le présent contrat, les parties devront se référer aux lois de la République.</p>

    <p class="contract-made-at">Fait à Port-au-Prince, en triple original, <strong>le {{date_debut}}</strong></p>

    <div class="contract-signatures" aria-label="Signatures">
      <div class="contract-signature contract-signature-left">
        <span class="contract-signature-line"></span>
        <strong class="contract-signature-name">{{first_name}} {{last_name}}</strong>
        <strong class="contract-signature-label">{{contractant_label}}</strong>
      </div>
      <div class="contract-signature contract-signature-right">
        <span class="contract-signature-line"></span>
        <strong class="contract-signature-name">Dr Bertrand SINAL</strong>
        <strong class="contract-signature-label">Ministre</strong>
      </div>
    </div>

    <span class="contract-page-number" aria-hidden="true">4</span>
  </section>
</div>
  `.trim(),
  css: `
.draft-doc[data-contract-layout="${REFERENCE_CONTRACT_LAYOUT}"] {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 24px;
  width: 100%;
  margin: 0;
  padding: 0;
  background: transparent;
}

.draft-doc[data-contract-layout="${REFERENCE_CONTRACT_LAYOUT}"] .contract-sheet {
  position: relative;
  flex: 0 0 auto;
  width: 8.5in;
  height: 11in;
  margin: 0;
  padding: 53.4pt 72pt 49pt;
  overflow: hidden;
  box-sizing: border-box;
  background: #fff;
  color: #000;
  border: 0;
  border-radius: 0;
  outline: 1px solid #d7d7d7;
  box-shadow: 0 10px 30px rgba(0, 0, 0, 0.09);
  font-family: "Times New Roman", Times, serif;
  font-size: 11pt;
  line-height: 13pt;
  font-variant-ligatures: none;
  text-rendering: geometricPrecision;
}

.draft-doc[data-contract-layout="${REFERENCE_CONTRACT_LAYOUT}"] .contract-sheet p {
  margin: 0 0 8pt;
  padding: 0;
  color: #000;
  font: inherit;
  text-align: justify;
}

/* La page 3 est la plus dense. Cette réserve empêche la dernière ligne de
   l'article 16 d'être rognée par les variations des moteurs d'impression. */
.draft-doc[data-contract-layout="${REFERENCE_CONTRACT_LAYOUT}"] .contract-sheet[data-page="3"] p {
  margin-bottom: 7.4pt;
}

.draft-doc[data-contract-layout="${REFERENCE_CONTRACT_LAYOUT}"] .contract-header {
  display: flex;
  justify-content: space-between;
  align-items: baseline;
  height: 13pt;
  margin: 0 0 29pt;
  padding: 0 3.5pt 0 0;
  white-space: nowrap;
}

.draft-doc[data-contract-layout="${REFERENCE_CONTRACT_LAYOUT}"] .contract-sheet p.contract-title {
  text-align: center;
}

.draft-doc[data-contract-layout="${REFERENCE_CONTRACT_LAYOUT}"] .contract-list p {
  display: grid;
  grid-template-columns: 12pt 1fr;
  column-gap: 6pt;
  margin-left: 18pt;
}

.draft-doc[data-contract-layout="${REFERENCE_CONTRACT_LAYOUT}"] .contract-sheet .contract-made-at {
  margin-top: 29pt;
  margin-left: 36pt;
}

.draft-doc[data-contract-layout="${REFERENCE_CONTRACT_LAYOUT}"] .contract-page-number {
  position: absolute;
  top: 731.5pt;
  right: 72pt;
  font-family: Calibri, Arial, sans-serif;
  font-size: 11pt;
  line-height: 13pt;
}

.draft-doc[data-contract-layout="${REFERENCE_CONTRACT_LAYOUT}"] .contract-signature {
  position: absolute;
  color: #000;
}

.draft-doc[data-contract-layout="${REFERENCE_CONTRACT_LAYOUT}"] .contract-signature-left {
  top: 434.5pt;
  left: 63pt;
  width: 154pt;
}

.draft-doc[data-contract-layout="${REFERENCE_CONTRACT_LAYOUT}"] .contract-signature-right {
  top: 437.5pt;
  left: 357.5pt;
  width: 195.5pt;
}

.draft-doc[data-contract-layout="${REFERENCE_CONTRACT_LAYOUT}"] .contract-signature-line {
  display: block;
  width: 100%;
  border-top: 0.5pt solid #000;
}

.draft-doc[data-contract-layout="${REFERENCE_CONTRACT_LAYOUT}"] .contract-signature-name,
.draft-doc[data-contract-layout="${REFERENCE_CONTRACT_LAYOUT}"] .contract-signature-label {
  display: block;
  font-family: "Times New Roman", Times, serif;
  font-size: 12pt;
  line-height: 15pt;
}

.draft-doc[data-contract-layout="${REFERENCE_CONTRACT_LAYOUT}"] .contract-signature-left .contract-signature-name,
.draft-doc[data-contract-layout="${REFERENCE_CONTRACT_LAYOUT}"] .contract-signature-left .contract-signature-label {
  margin-left: 9pt;
}

.draft-doc[data-contract-layout="${REFERENCE_CONTRACT_LAYOUT}"] .contract-signature-left .contract-signature-name {
  margin-top: 6pt;
}

.draft-doc[data-contract-layout="${REFERENCE_CONTRACT_LAYOUT}"] .contract-signature-right .contract-signature-name,
.draft-doc[data-contract-layout="${REFERENCE_CONTRACT_LAYOUT}"] .contract-signature-right .contract-signature-label {
  margin-left: 17.5pt;
}

.draft-doc[data-contract-layout="${REFERENCE_CONTRACT_LAYOUT}"] .contract-signature-right .contract-signature-name {
  margin-top: 3pt;
}

@media print {
  .draft-doc[data-contract-layout="${REFERENCE_CONTRACT_LAYOUT}"] {
    display: block;
    width: 8.5in !important;
    gap: 0;
  }

  .draft-doc[data-contract-layout="${REFERENCE_CONTRACT_LAYOUT}"] .contract-sheet {
    width: 8.5in !important;
    height: 11in !important;
    min-height: 11in !important;
    max-width: none !important;
    outline: 0;
    box-shadow: none;
    break-after: page;
    page-break-after: always;
  }

  .draft-doc[data-contract-layout="${REFERENCE_CONTRACT_LAYOUT}"] .contract-sheet:last-child {
    break-after: auto;
    page-break-after: auto;
  }
}
  `.trim()
};
