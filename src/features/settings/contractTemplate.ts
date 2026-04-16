import { Contract } from "../../data/types";
import { formatCurrency } from "../../lib/format";
import { loadSuggestions } from "../../data/local/suggestionsDb";

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
    <p style="margin-top:0pt; margin-bottom:8pt; text-align:justify;"><span style="font-family:'Times New Roman';">No&hellip;&hellip;&hellip;&hellip;&hellip;&hellip;&hellip;&hellip;..&nbsp;</span><span style="width:34.31pt; font-family:'Times New Roman'; display:inline-block;">&nbsp;</span><span style="width:36pt; font-family:'Times New Roman'; display:inline-block;">&nbsp;</span><span style="width:36pt; font-family:'Times New Roman'; display:inline-block;">&nbsp;</span><span style="width:36pt; font-family:'Times New Roman'; display:inline-block;">&nbsp;</span><span style="width:36pt; font-family:'Times New Roman'; display:inline-block;">&nbsp;</span><span style="font-family:'Times New Roman';">Port-au-Prince, le {{created_date_long}}</span></p>

    <p style="margin-top:0pt; margin-bottom:8pt; text-align:center;"><strong><span style="font-family:'Times New Roman';">&nbsp;</span></strong></p>

    <p style="margin-top:0pt; margin-bottom:8pt; text-align:center;"><strong><u><span style="font-family:'Times New Roman';">CONTRAT DE SERVICE</span></u></strong></p>

    <p style="margin-top:0pt; margin-bottom:8pt; text-align:justify;"><strong><span style="font-family:'Times New Roman';">Entre</span></strong></p>

    <p style="margin-top:0pt; margin-bottom:8pt; text-align:justify; line-height:108%; font-size:12pt;"><span style="line-height:108%; font-family:'Times New Roman'; font-size:11pt;">L&rsquo;Etat Ha&iuml;tien, repr&eacute;sent&eacute; par&nbsp;</span><strong><span style="line-height:108%; font-family:'Times New Roman'; font-size:11pt;">Docteur Bertrand SINAL</span></strong><span style="line-height:108%; font-family:'Times New Roman'; font-size:11pt;">, identifi&eacute; par son&nbsp;</span><strong><span style="line-height:108%; font-family:'Times New Roman'; font-size:11pt;">NINU</span></strong><span style="line-height:108%; font-family:'Times New Roman'; font-size:11pt;">&nbsp;</span><span style="line-height:108%; font-family:'Times New Roman'; font-size:11pt;">:&nbsp;</span><strong><span style="font-family:'Times New Roman';">1009241060</span></strong><span style="line-height:108%; font-family:'Times New Roman'; font-size:11pt;">&nbsp;et son&nbsp;</span><strong><span style="line-height:108%; font-family:'Times New Roman'; font-size:11pt;">NIF</span></strong><strong><span style="line-height:108%; font-family:'Times New Roman'; font-size:11pt;">&nbsp;</span></strong><strong><span style="line-height:108%; font-family:'Times New Roman'; font-size:11pt;">: </span></strong><strong><span style="font-family:'Times New Roman';">003-888-685-8</span></strong><span style="line-height:108%; font-family:'Times New Roman'; font-size:11pt;">, demeurant et domicili&eacute; au num&eacute;ro 1 Rue Jacques Roumain, Ma&iuml;s G&acirc;t&eacute;, Port-au-Prince, agissant en ses qualit&eacute;s de Ministre de la Sant&eacute; Publique et de la Population, ci-apr&egrave;s d&eacute;nomm&eacute;&lt;&lt;&nbsp;</span><strong><span style="line-height:108%; font-family:'Times New Roman'; font-size:11pt;">l&rsquo;Employeur</span></strong><span style="line-height:108%; font-family:'Times New Roman'; font-size:11pt;">&gt;&gt;.</span></p>

    <p style="margin-top:0pt; margin-bottom:8pt; text-align:justify;"><strong><span style="font-family:'Times New Roman';">Et</span></strong></p>

    <p style="margin-top:0pt; margin-bottom:8pt; text-align:justify;"><span style="font-family:'Times New Roman';">{{honorific}}</span><strong><span style="font-family:'Times New Roman';"> {{first_name}} {{last_name}},</span></strong><span style="font-family:'Times New Roman';">&nbsp;{{identifiee_identifie}} par son&nbsp;</span><strong><span style="font-family:'Times New Roman';">NINU</span></strong><strong><span style="font-family:'Times New Roman';">&nbsp;</span></strong><strong><span style="font-family:'Times New Roman';">: {{ninu}} </span></strong><span style="font-family:'Times New Roman';">&nbsp;</span><span style="font-family:'Times New Roman';">et son&nbsp;</span><strong><span style="font-family:'Times New Roman';">NIF</span></strong><span style="font-family:'Times New Roman';">&nbsp;</span><span style="font-family:'Times New Roman';">:</span><strong><span style="font-family:'Times New Roman';"> {{nif}} </span></strong><span style="font-family:'Times New Roman';">demeurant et domicili&eacute; &agrave; {{address}}, ci-apr&egrave;s {{denommee_denomme}} {{contractant_legal}}.</span></p>

    <p style="margin-top:0pt; margin-bottom:8pt; text-align:justify;"><span style="font-family:'Times New Roman';">Consid&eacute;rant que pour pouvoir r&eacute;aliser sa mission d&rsquo;int&eacute;r&ecirc;t g&eacute;n&eacute;ral et assurer le fonctionnement normal de ses diff&eacute;rentes entit&eacute;s, l&rsquo;employeur doit disposer de ressources humaines ad&eacute;quates</span><span style="font-family:'Times New Roman';">&nbsp;</span><span style="font-family:'Times New Roman';">; Qu&rsquo;&agrave; cette fin, il convient d&rsquo;engager des cadres comp&eacute;tents</span><span style="font-family:'Times New Roman';">&nbsp;</span><span style="font-family:'Times New Roman';">;</span></p>

    <p style="margin-top:0pt; margin-bottom:8pt; text-align:justify;"><span style="font-family:'Times New Roman';">Consid&eacute;rant que {{la_le_contractant}} poss&egrave;de les comp&eacute;tences requises pour intervenir dans les t&acirc;ches administratives de son entit&eacute; d&rsquo;affectation</span><span style="font-family:'Times New Roman';">&nbsp;</span><span style="font-family:'Times New Roman';">;</span></p>

    <p style="margin-top:0pt; margin-bottom:8pt; text-align:justify;"><span style="font-family:'Times New Roman';">Consid&eacute;rant qu&rsquo;au regard de l&rsquo;article 200-4 de la constitution et de l&rsquo;article 5.3 de d&eacute;cret du 23 novembre 2005 r&eacute;gissant l&rsquo;organisation et le fonctionnement de la&nbsp;</span><strong><span style="font-family:'Times New Roman';">CSC/CA</span></strong><span style="font-family:'Times New Roman';">&nbsp;la Cour Sup&eacute;rieure des Comptes et du Contentieux Administratif donne son avis sur tous les projets de contrats &agrave; caract&egrave;re financier ou commercial auxquels l&rsquo;Etat est partie</span><span style="font-family:'Times New Roman';">&nbsp;</span><span style="font-family:'Times New Roman';">;</span></p>

    <p style="margin-top:0pt; margin-bottom:8pt; text-align:justify;"><span style="font-family:'Times New Roman';">Consid&eacute;rant qu&rsquo;il y a lieu de mat&eacute;rialiser les termes de cet accord dans un contrat</span></p>

    <p style="margin-top:0pt; margin-bottom:8pt; text-align:justify;"><span style="font-family:'Times New Roman';">Vu l&rsquo;avis num&eacute;ro &hellip;&hellip;&hellip;&hellip;&hellip;. de la Cour Sup&eacute;rieure des Comptes et du Contentieux Administratif en date du &hellip;&hellip;&hellip;&hellip;&hellip;&hellip;&hellip;.</span></p>

    <p style="margin-top:0pt; margin-bottom:8pt; text-align:justify;"><strong><span style="font-family:'Times New Roman';">Il a &eacute;t&eacute; convenu et arr&ecirc;t&eacute; ce qui suit</span></strong><strong><span style="font-family:'Times New Roman';">&nbsp;</span></strong><strong><span style="font-family:'Times New Roman';">:</span></strong></p>

    <p style="margin-top:0pt; margin-bottom:8pt; text-align:justify;"><strong><span style="font-family:'Times New Roman';">Article 1.- Objet du contrat&nbsp;</span></strong></p>

    <p style="margin-top:0pt; margin-bottom:8pt; text-align:justify;"><span style="font-family:'Times New Roman';">L&rsquo;employeur engage {{la_le_contractant}}, qui l&rsquo;accepte, &agrave; titre de&nbsp;</span><strong><span style="font-family:'Times New Roman';">{{position}} &agrave; {{assignment}} </span></strong><span style="font-family:'Times New Roman';">selon la description de t&acirc;che annex&eacute;e au pr&eacute;sent contrat pour en faire partie.</span></p>

    <p style="margin-top:0pt; margin-bottom:8pt; text-align:justify;"><strong><span style="font-family:'Times New Roman';">Article 2.- Pi&egrave;ces constitutives</span></strong></p>

    <p style="margin-top:0pt; margin-bottom:8pt; text-align:justify;"><strong><span style="font-family:'Times New Roman';">Les documents contractuels sont les suivants</span></strong><strong><span style="font-family:'Times New Roman';">&nbsp;</span></strong><strong><span style="font-family:'Times New Roman';">:</span></strong></p>

    <p style="margin-top:0pt; margin-left:36pt; margin-bottom:0pt; text-indent:-18pt; text-align:justify;"><span style="font-family:'Times New Roman';">-</span><span style="width:14.34pt; font:7pt 'Times New Roman'; display:inline-block;">&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;</span><span style="font-family:'Times New Roman';">Le contrat d&ucirc;ment sign&eacute; par les deux parties&nbsp;</span></p>

    <p style="margin-top:0pt; margin-left:36pt; margin-bottom:0pt; text-indent:-18pt; text-align:justify;"><span style="font-family:'Times New Roman';">-</span><span style="width:14.34pt; font:7pt 'Times New Roman'; display:inline-block;">&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;</span><span style="font-family:'Times New Roman';">La description de taches de {{la_le_contractant}}</span></p>

    <p style="margin-top:0pt; margin-left:36pt; margin-bottom:0pt; text-indent:-18pt; text-align:justify;"><span style="font-family:'Times New Roman';">-</span><span style="width:14.34pt; font:7pt 'Times New Roman'; display:inline-block;">&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;</span><span style="font-family:'Times New Roman';">Le curriculum vitae de {{la_le_contractant}}</span></p>

    <p style="margin-top:0pt; margin-left:36pt; margin-bottom:8pt; text-indent:-18pt; text-align:justify;"><span style="font-family:'Times New Roman';">-</span><span style="width:14.34pt; font:7pt 'Times New Roman'; display:inline-block;">&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;</span><span style="font-family:'Times New Roman';">Copie de la CINU et matricule fiscal de {{la_le_contractant}}.</span></p>

    <p style="margin-top:0pt; margin-bottom:8pt; text-align:justify;"><strong><span style="font-family:'Times New Roman';">Article 3.- Obligation du contractant</span></strong></p>

    <p style="margin-top:0pt; margin-bottom:8pt; text-align:justify;"><span style="font-family:'Times New Roman';">{{La_Le_Contractant}} s&rsquo;engage &agrave; fournir avec comp&eacute;tence, loyaut&eacute;, d&eacute;vouement et c&eacute;l&eacute;rit&eacute; ses connaissances techniques au bon fonctionnement du Minist&egrave;re de la Sant&eacute; Publique et de la Population.</span></p>

    <p style="margin-top:0pt; margin-bottom:8pt; text-align:justify;"><span style="font-family:'Times New Roman';">{{Elle_Il}} fournira ses services dans les domaines sp&eacute;cifi&eacute;s et accomplira ses t&acirc;ches telles que d&eacute;finies dans sa description de t&acirc;ches. {{Elle_Il}} s&rsquo;engage &agrave; pr&eacute;senter r&eacute;guli&egrave;rement &agrave; son sup&eacute;rieur hi&eacute;rarchique imm&eacute;diat des rapports de ses activit&eacute;s et un rapport global &agrave; la fin du contrat.</span></p>

    <p style="margin-top:0pt; margin-bottom:8pt; text-align:justify;"><strong><span style="font-family:'Times New Roman';">Article 4.- Statut du contractant&nbsp;</span></strong></p>

    <p style="margin-top:0pt; margin-bottom:8pt; text-align:justify;"><span style="font-family:'Times New Roman';">{{La_Le_Contractant}} travaillera sous la supervision de son sup&eacute;rieur hi&eacute;rarchique imm&eacute;diat.</span></p>

    <p style="margin-top:0pt; margin-bottom:8pt; text-align:justify;"><span style="font-family:'Times New Roman';">{{La_Le_Contractant}} est un agent public contractuel. {{Elle_Il}} ne sera pas consid&eacute;r&eacute;e, &agrave; quelque fin que ce soit, comme fonctionnaire de l&rsquo;Etat et ne sera donc pas couverte par le Statut G&eacute;n&eacute;ral de la Fonction Publique. {{Elle_Il}} ne peut en aucun cas pr&eacute;tendre &agrave; des droits autres que ceux contenus dans le pr&eacute;sent contrat.</span></p>

    <p style="margin-top:0pt; margin-bottom:8pt; text-align:justify;"><strong><span style="font-family:'Times New Roman';">Article 5.- Respect de la l&eacute;galit&eacute;&nbsp;</span></strong></p>

    <p style="margin-top:0pt; margin-bottom:8pt; text-align:justify;"><span style="font-family:'Times New Roman';">{{La_Le_Contractant}} reconnait qu&rsquo;{{elle_il}} est astreinte au respect de la loi dans tous ses agissements sous peine de voir la responsabilit&eacute; de l&rsquo;administration ou la sienne propre engage et d&rsquo;attirer sur lui des sanctions disciplinaires ou p&eacute;nales.</span></p>

    <p style="margin-top:0pt; margin-bottom:8pt; text-align:justify;"><strong><span style="font-family:'Times New Roman';">Article 6.- Clause d&rsquo;&eacute;thique&nbsp;</span></strong></p>

    <p style="margin-top:0pt; margin-bottom:8pt; text-align:justify;"><span style="font-family:'Times New Roman';">{{La_Le_Contractant}} ne peut user de sa qualit&eacute;, de son emploi ou des attributs de sa fonction en vue d&rsquo;obtenir ou tenter d&rsquo;obtenir un avantage de quelque nature que ce soit. De m&ecirc;me, {{elle_il}} ne peut user de sa qualit&eacute; pour entreprendre des d&eacute;marches ayant pour objet une faveur personnelle, ou exercer une pression quelconque sur des tiers &agrave; des fins personnelles.</span></p>

    <p style="margin-top:0pt; margin-bottom:8pt; text-align:justify;"><strong><span style="font-family:'Times New Roman';">Article 7.- Horaire de travail</span></strong></p>

    <p style="margin-top:0pt; margin-bottom:8pt; text-align:justify;"><span style="font-family:'Times New Roman';">{{La_Le_Contractant}} s&rsquo;engage &agrave; travailler huit heures par jour, du lundi au vendredi. Cependant, {{elle_il}} peut &ecirc;tre appel&eacute;e, en cas de besoin, &agrave; travailler au-del&agrave;s des heures et/ou jours r&egrave;glementaires sans pouvoir pr&eacute;tendre</span><span style="font-family:'Times New Roman';">&nbsp;&nbsp;</span><span style="font-family:'Times New Roman';">&agrave; une r&eacute;mun&eacute;ration suppl&eacute;mentaire.</span></p>

    <p style="margin-top:0pt; margin-bottom:8pt; text-align:justify;"><strong><span style="font-family:'Times New Roman';">Articles 8.- Droits de propri&eacute;t&eacute;&nbsp;</span></strong></p>

    <p style="margin-top:0pt; margin-bottom:8pt; text-align:justify;"><span style="font-family:'Times New Roman';">Les droits de propri&eacute;t&eacute;, droits d&rsquo;auteur et tous autres droits de quelque nature que ce soit, sur toute &eacute;tude ou toute &oelig;uvre produite par le contractant dans le cadre de l&rsquo;ex&eacute;cution du pr&eacute;sent contrat, restent la propri&eacute;t&eacute; exclusive de l&rsquo;Employeur.</span></p>

    <p style="margin-top:0pt; margin-bottom:8pt; text-align:justify;"><span style="font-family:'Times New Roman';">Il est formellement interdit au contractant de d&eacute;truire, de d&eacute;tourner des dossiers, des pi&egrave;ces ou documents de service.</span></p>

    <p style="margin-top:0pt; margin-bottom:8pt; text-align:justify;"><strong><span style="font-family:'Times New Roman';">Article 9.- Responsabilit&eacute; relative au mat&eacute;riel de service&nbsp;</span></strong></p>

    <p style="margin-top:0pt; margin-bottom:8pt; text-align:justify;"><span style="font-family:'Times New Roman';">{{La_Le_Contractant}} reconnait que le mat&eacute;riel mis &agrave; sa disposition for les besoins du service reste et demeure la propri&eacute;t&eacute; de l&rsquo;Employeur et qu&rsquo;il doit le g&eacute;rer en bon chef de famille.</span></p>

    <p style="margin-top:0pt; margin-bottom:8pt; text-align:justify;"><span style="font-family:'Times New Roman';">{{Elle_Il}} engage sa responsabilit&eacute; en cas de vol, perte, d&eacute;t&eacute;rioration ou d&eacute;gradation, ou toute autre cause pouvant affecter le bon fonctionnement ou la valeur du mat&eacute;riel for laquelle {{elle_il}} ne peut pas se d&eacute;gager de sa responsabilit&eacute; directe.</span></p>

    <p style="margin-top:0pt; margin-bottom:8pt; text-align:justify;"><span style="font-family:'Times New Roman';">Ce mat&eacute;riel doit &ecirc;tre restitu&eacute; &agrave; l&rsquo;Employeur &agrave; la fin du contrat.</span></p>

    <p style="margin-top:0pt; margin-bottom:8pt; text-align:justify;"><strong><span style="font-family:'Times New Roman';">&nbsp;</span></strong></p>

    <p style="margin-top:0pt; margin-bottom:8pt; text-align:justify;"><strong><span style="font-family:'Times New Roman';">&nbsp;</span></strong></p>

    <p style="margin-top:0pt; margin-bottom:8pt;"><br style="page-break-before:always; clear:both;"></p>

    <p style="margin-top:0pt; margin-bottom:8pt; text-align:justify;"><strong><span style="font-family:'Times New Roman';">Article 10.- Obligation de confidentialit&eacute;&nbsp;</span></strong></p>

    <p style="margin-top:0pt; margin-bottom:8pt; text-align:justify;"><span style="font-family:'Times New Roman';">{{La_Le_Contractant}} s&rsquo;abstiendra de communiquer &agrave; toute autre personne, &agrave; toute entit&eacute; ou &agrave; tout organisme &eacute;tranger &agrave; l&rsquo;Employeur, les documents et les informations dont il aurait eu connaissance dans le cadre de l&rsquo;ex&eacute;cution de ses t&acirc;ches conform&eacute;ment au pr&eacute;sent contrat.</span></p>

    <p style="margin-top:0pt; margin-bottom:8pt; text-align:justify;"><strong><span style="font-family:'Times New Roman';">Article 11.- Obligation de r&eacute;serve et de discr&eacute;tion professionnelle&nbsp;</span></strong></p>

    <p style="margin-top:0pt; margin-bottom:8pt; text-align:justify;"><span style="font-family:'Times New Roman';">{{La_Le_Contractant}} est tenue &agrave; une obligation de r&eacute;serve et doit notamment s&rsquo;abstenir, m&ecirc;me en dehors du service, de tout acte incompatible avec la dignit&eacute; de la fonction qu&rsquo;il occupe.</span></p>

    <p style="margin-top:0pt; margin-bottom:8pt; text-align:justify;"><span style="font-family:'Times New Roman';">{{Elle_Il}} est li&eacute;e par l&rsquo;obligation de discr&eacute;tion professionnelle for tout ce qui concerne les faits, les informations et les documents dont il a connaissance dans l&rsquo;exercice ou &agrave; l&rsquo;occasion de sa fonction.</span></p>

    <p style="margin-top:0pt; margin-bottom:8pt; text-align:justify;"><strong><span style="font-family:'Times New Roman';">Article 12.- Normes de conduite</span></strong></p>

    <p style="margin-top:0pt; margin-bottom:8pt; text-align:justify;"><span style="font-family:'Times New Roman';">{{La_Le_Contractant}} ne doit se livrer &agrave; aucune activit&eacute; incompatible avec la mission de l&rsquo;Employeur ou nuisible &agrave; l&rsquo;accomplissement des t&acirc;ches d&eacute;finies dans le pr&eacute;sent contrat. {{Elle_Il}} doit s&rsquo;abstenir de toutes actions ou tous comportements susceptibles de nuire aux int&eacute;r&ecirc;ts de l&rsquo;Employeur.</span></p>

    <p style="margin-top:0pt; margin-bottom:8pt; text-align:justify;"><strong><span style="font-family:'Times New Roman';">Articles 13.- Discipline</span></strong></p>

    <p style="margin-top:0pt; margin-bottom:8pt; text-align:justify;"><span style="font-family:'Times New Roman';">{{La_Le_Contractant}} reconnait que le manquement &agrave; ses obligations en vertu du pr&eacute;sent contrat constitue une faute disciplinaire qui l&rsquo;expose &agrave; une sanction disciplinaire sans pr&eacute;judice des r&eacute;parations li&eacute;es &agrave; sa responsabilit&eacute; civile et des peines pr&eacute;vues par les dispositions du Code P&eacute;nal cons&eacute;cutives &agrave; une infraction de droit commun.</span></p>

    <p style="margin-top:0pt; margin-bottom:8pt; text-align:justify;"><span style="font-family:'Times New Roman';">Les sanctions disciplinaires auxquelles est expos&eacute;e le contractant sont celles &eacute;num&eacute;r&eacute;es &agrave; l&rsquo;article 188 alin&eacute;as 1 et 2 du d&eacute;cret du 17 mai 2005 portant r&eacute;vision du Statut G&eacute;n&eacute;ral de la Fonction Publique et sont subordonn&eacute;es au principe de proportionnalit&eacute; par rapport &agrave; la gravit&eacute; de la faute. Elles seront prononc&eacute;es par le sup&eacute;rieur hi&eacute;rarchique imm&eacute;diat du contractant.</span></p>

    <p style="margin-top:0pt; margin-bottom:8pt; text-align:justify;"><strong><span style="font-family:'Times New Roman';">Article 14.- Cong&eacute;</span></strong></p>

    <p style="margin-top:0pt; margin-bottom:8pt; text-align:justify;"><span style="font-family:'Times New Roman';">{{La_Le_Contractant}} a droit &agrave; un cong&eacute; r&eacute;gulier pay&eacute; de 15 jours ouvrables for une ann&eacute;e de service. Ce cong&eacute; pourra &ecirc;tre obtenu sur demande &eacute;crite adress&eacute;e au Service d&rsquo;Affectation, apr&egrave;s approbation de la Direction ou Service des Ressources Humaines.</span></p>

    <p style="margin-top:0pt; margin-bottom:8pt; text-align:justify;"><strong><span style="font-family:'Times New Roman';">Article 15.- Fin de contrat</span></strong></p>

    <p style="margin-top:0pt; margin-bottom:8pt; text-align:justify;"><span style="font-family:'Times New Roman';">Le pr&eacute;sent contrat prend fin de plein droit le&nbsp;</span><strong><span style="font-family:'Times New Roman';">{{date_fin}}.</span></strong></p>

    <p style="margin-top:0pt; margin-bottom:8pt; text-align:justify;"><span style="font-family:'Times New Roman';">De m&ecirc;me ce contrat prend automatiquement fin et sans aucune responsabilit&eacute; for aucune des parties</span></p>

    <p style="margin-top:0pt; margin-left:36pt; margin-bottom:0pt; text-indent:-18pt; text-align:justify;"><span style="font-family:'Times New Roman';">-</span><span style="width:14.34pt; font:7pt 'Times New Roman'; display:inline-block;">&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;</span><span style="font-family:'Times New Roman';">Par le d&eacute;c&egrave;s du contractant</span><span style="font-family:'Times New Roman';">&nbsp;</span><span style="font-family:'Times New Roman';">;</span></p>

    <p style="margin-top:0pt; margin-left:36pt; margin-bottom:0pt; text-indent:-18pt; text-align:justify;"><span style="font-family:'Times New Roman';">-</span><span style="width:14.34pt; font:7pt 'Times New Roman'; display:inline-block;">&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;</span><span style="font-family:'Times New Roman';">Par le consentement mutuel des parties</span><span style="font-family:'Times New Roman';">&nbsp;</span><span style="font-family:'Times New Roman';">;</span></p>

    <p style="margin-top:0pt; margin-left:36pt; margin-bottom:0pt; text-indent:-18pt; text-align:justify;"><span style="font-family:'Times New Roman';">-</span><span style="width:14.34pt; font:7pt 'Times New Roman'; display:inline-block;">&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;</span><span style="font-family:'Times New Roman';">En cas d&rsquo;incapacit&eacute; d&ucirc;ment constat&eacute;e de {{la_le_contractant}}</span><span style="font-family:'Times New Roman';">&nbsp;</span><span style="font-family:'Times New Roman';">;</span></p>

    <p style="margin-top:0pt; margin-left:36pt; margin-bottom:8pt; text-indent:-18pt; text-align:justify;"><span style="font-family:'Times New Roman';">-</span><span style="width:14.34pt; font:7pt 'Times New Roman'; display:inline-block;">&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;</span><span style="font-family:'Times New Roman';">Dans les autres cas pr&eacute;vus par la loi.</span></p>

    <p style="margin-top:0pt; margin-bottom:8pt; text-align:justify;"><strong><span style="font-family:'Times New Roman';">Article 16.- R&eacute;siliation&nbsp;</span></strong></p>

    <p style="margin-top:0pt; margin-bottom:8pt; text-align:justify;"><span style="font-family:'Times New Roman';">Le pr&eacute;sent contrat sera r&eacute;sili&eacute; de plein droit et sans indemnit&eacute;</span><span style="font-family:'Times New Roman';">&nbsp;</span><span style="font-family:'Times New Roman';">:</span></p>

    <p style="margin-top:0pt; margin-left:36pt; margin-bottom:0pt; text-indent:-18pt; text-align:justify;"><span style="font-family:'Times New Roman';">-</span><span style="width:14.34pt; font:7pt 'Times New Roman'; display:inline-block;">&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;</span><span style="font-family:'Times New Roman';">Pour non-respect des clauses du contrat</span><span style="font-family:'Times New Roman';">&nbsp;</span><span style="font-family:'Times New Roman';">;</span></p>

    <p style="margin-top:0pt; margin-left:36pt; margin-bottom:0pt; text-indent:-18pt; text-align:justify;"><span style="font-family:'Times New Roman';">-</span><span style="width:14.34pt; font:7pt 'Times New Roman'; display:inline-block;">&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;</span><span style="font-family:'Times New Roman';">Pour rendement insatisfaisant de {{la_le_contractant}}</span><span style="font-family:'Times New Roman';">&nbsp;</span><span style="font-family:'Times New Roman';">;</span></p>

    <p style="margin-top:0pt; margin-left:36pt; margin-bottom:8pt; text-indent:-18pt; text-align:justify;"><span style="font-family:'Times New Roman';">-</span><span style="width:14.34pt; font:7pt 'Times New Roman'; display:inline-block;">&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;</span><span style="font-family:'Times New Roman';">En cas de conflit d&rsquo;int&eacute;r&ecirc;ts</span><span style="font-family:'Times New Roman';">&nbsp;</span><span style="font-family:'Times New Roman';">; Pour faute grave de {{la_le_contractant}}.</span></p>

    <p style="margin-top:0pt; margin-bottom:8pt; text-align:justify;"><strong><span style="font-family:'Times New Roman';">Article 17.- R&eacute;mun&eacute;ration&nbsp;</span></strong></p>

    <p style="margin-top:0pt; margin-bottom:8pt; text-align:justify;"><span style="font-family:'Times New Roman';">L&rsquo;Etat Ha&iuml;tien versera mensuellement au Contractant, le montant de&nbsp;</span><strong><span style="font-family:'Times New Roman';">{{salary_text}}</span></strong><span style="font-family:'Times New Roman';">&nbsp;(</span><strong><span style="font-family:'Times New Roman';">{{salary_number}}</span></strong><span style="font-family:'Times New Roman';">), en pr&eacute;levant les retenues exig&eacute;es par la loi.</span></p>

    <p style="margin-top:0pt; margin-bottom:8pt; text-align:justify;"><strong><span style="font-family:'Times New Roman';">Article 18.- Dur&eacute;e du contrat&nbsp;</span></strong></p>

    <p style="margin-top:0pt; margin-bottom:8pt; text-align:justify;"><span style="font-family:'Times New Roman';">Le pr&eacute;sent contrat est conclu for une dur&eacute;e de&nbsp;</span><strong><span style="font-family:'Times New Roman';">{{duration_months_text}} ({{duration_months}}</span></strong><span style="font-family:'Times New Roman';">)&nbsp;</span><strong><span style="font-family:'Times New Roman';">mois </span></strong><span style="font-family:'Times New Roman';">d&eacute;butant le&nbsp;</span><strong><span style="font-family:'Times New Roman';">{{date_debut}}</span></strong><span style="font-family:'Times New Roman';">&nbsp;et prenant fin le&nbsp;</span><strong><span style="font-family:'Times New Roman';">{{date_fin}}</span></strong><span style="font-family:'Times New Roman';">.&nbsp;</span></p>

    <p style="margin-top:0pt; margin-bottom:8pt; text-align:justify;"><strong><span style="font-family:'Times New Roman';">Article 19.- R&egrave;glement des conflits</span></strong></p>

    <p style="margin-top:0pt; margin-bottom:8pt; text-align:justify;"><span style="font-family:'Times New Roman';">Tout diff&eacute;rend relatif &agrave; l&rsquo;interpr&eacute;tation ou &agrave; l&rsquo;application du pr&eacute;sent contrat qui ne pourra &ecirc;tre r&eacute;solu &agrave; l&rsquo;amiable sera tranch&eacute; par la Cour Sup&eacute;rieur des Comptes et du Contentieux Administratif.</span></p>

    <p style="margin-top:0pt; margin-bottom:8pt; text-align:justify;"><strong><span style="font-family:'Times New Roman';">Article 20.-</span></strong><strong><span style="font-family:'Times New Roman';">&nbsp;</span></strong><strong><span style="font-family:'Times New Roman';">Loi applicable </span></strong></p>

    <p style="margin-top:0pt; margin-bottom:8pt; text-align:justify;"><span style="font-family:'Times New Roman';">Pour tout ce qui n&rsquo;est pas stipul&eacute; dans le pr&eacute;sent contrat, les parties devront se r&eacute;f&eacute;rer aux lois de la</span><span style="font-family:'Times New Roman';">&nbsp;&nbsp;</span><span style="font-family:'Times New Roman';">R&eacute;publique.</span></p>

    <p style="margin-top:0pt; margin-bottom:8pt; text-align:justify;"><span style="font-family:'Times New Roman';">&nbsp;</span></p>

    <p style="margin-top:0pt; margin-bottom:8pt; text-indent:36pt; text-align:justify;"><span style="font-family:'Times New Roman';">Fait &agrave; Port-au-Prince, en triple original,&nbsp;</span><strong><span style="font-family:'Times New Roman';">le {{created_date_long}}</span></strong></p>

    <p style="margin-top:0pt; margin-bottom:8pt; text-align:justify;"><span style="font-family:'Times New Roman';">&nbsp;</span></p>

    <p style="margin-top:0pt; margin-bottom:8pt; text-align:justify;"><span style="font-family:'Times New Roman';">&nbsp;</span></p>

    <p style="margin-top:0pt; margin-bottom:8pt; text-align:justify;"><span style="font-family:'Times New Roman';">&nbsp;</span></p>

    <p style="margin-top:0pt; margin-bottom:8pt; text-align:justify;"><span style="font-family:'Times New Roman';">&nbsp;</span></p>

    <p style="margin-top:0pt; margin-bottom:8pt; text-align:justify;"><span style="font-family:'Times New Roman';">&nbsp;</span></p>

    <p style="margin-top:0pt; margin-bottom:8pt; text-align:justify;"><span style="height:0pt; text-align:left; display:block; position:absolute; z-index:0;"><img src="https://myfiles.space/user_files/temporary/69bff01e29fb83.35381015/1774186525_morquette-sainte-mise-020045/1774186525_morquette-sainte-mise-020045-2.png" width="206" height="1" alt="" style="margin: 0 0 0 auto; display: block; "></span><span style="height:0pt; text-align:left; display:block; position:absolute; z-index:1;"><img src="https://myfiles.space/user_files/temporary/69bff01e29fb83.35381015/1774186525_morquette-sainte-mise-020045/1774186525_morquette-sainte-mise-020045-1.png" width="262" height="1" alt="" style="margin: 0 0 0 auto; display: block; "></span><span style="font-family:'Times New Roman';">&nbsp;</span></p>

    <p style="margin-top:0pt; margin-bottom:0pt; line-height:normal; font-size:12pt;"><strong><span style="font-family:'Times New Roman'; font-size:11pt;">{{first_name}} {{last_name}}</span></strong><strong><span style="width:12.92pt; font-family:'Times New Roman'; display:inline-block;">&nbsp;</span></strong><strong><span style="width:36pt; font-family:'Times New Roman'; display:inline-block;">&nbsp;</span></strong><strong><span style="font-family:'Times New Roman';">&nbsp;&nbsp;&nbsp; </span></strong><strong><span style="width:24pt; font-family:'Times New Roman'; display:inline-block;">&nbsp;</span></strong><strong><span style="font-family:'Times New Roman';">&nbsp;&nbsp;&nbsp;&nbsp; </span></strong><strong><span style="width:21pt; font-family:'Times New Roman'; display:inline-block;">&nbsp;</span></strong><strong><span style="font-family:'Times New Roman';">&nbsp;&nbsp;&nbsp;&nbsp; </span></strong><strong><span style="width:21pt; font-family:'Times New Roman'; display:inline-block;">&nbsp;</span></strong><strong><span style="font-family:'Times New Roman';">&nbsp;&nbsp;&nbsp;&nbsp; </span></strong><strong><span style="font-family:'Times New Roman';">Dr Bertrand SINAL</span></strong></p>

    <p style="margin-top:0pt; margin-bottom:0pt; line-height:normal; font-size:12pt;"><strong><span style="font-family:'Times New Roman';">{{contractant_label}}</span></strong><strong><span style="width:4.02pt; font-family:'Times New Roman'; display:inline-block;">&nbsp;</span></strong><strong><span style="width:36pt; font-family:'Times New Roman'; display:inline-block;">&nbsp;</span></strong><strong><span style="width:36pt; font-family:'Times New Roman'; display:inline-block;">&nbsp;</span></strong><strong><span style="width:36pt; font-family:'Times New Roman'; display:inline-block;">&nbsp;</span></strong><strong><span style="width:36pt; font-family:'Times New Roman'; display:inline-block;">&nbsp;</span></strong><strong><span style="width:36pt; font-family:'Times New Roman'; display:inline-block;">&nbsp;</span></strong><strong><span style="width:36pt; font-family:'Times New Roman'; display:inline-block;">&nbsp;</span></strong><strong><span style="font-family:'Times New Roman';">&nbsp;&nbsp;&nbsp;&nbsp; </span></strong><strong><span style="font-family:'Times New Roman';">Ministre</span></strong></p>

    <p style="margin-top:0pt; margin-bottom:8pt; text-align:justify;"><span style="font-family:'Times New Roman';">&nbsp;</span></p>

    <p style="margin-top:0pt; margin-bottom:8pt; text-align:justify;"><span style="font-family:'Times New Roman';">&nbsp;</span></p>

    <p style="margin-top:0pt; margin-bottom:8pt; text-align:justify;"><span style="font-family:'Times New Roman';">&nbsp;</span></p>

    <p style="margin-top:0pt; margin-bottom:8pt;"><span style="font-family:'Times New Roman';">&nbsp;</span></p>

    <div style="clear:both;">

        <p style="margin-top:0pt; margin-bottom:0pt; text-align:right; line-height:normal;">1</p>

        <p style="margin-top:0pt; margin-bottom:0pt; line-height:normal;">&nbsp;</p>

    </div>

</div>
  `.trim(),
  css: `
.draft-doc {
  padding: 40px;
  background: white;
  min-height: 100%;
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

  const isFeminine = contract.gender === "Femme";

  const numToLetters: Record<number, string> = {
    1: "UN", 2: "DEUX", 3: "TROIS", 4: "QUATRE", 5: "CINQ",
    6: "SIX", 7: "SEPT", 8: "HUIT", 9: "NEUF", 10: "DIX",
    11: "ONZE", 12: "DOUZE"
  };

  const suggestions = loadSuggestions();
  const positionMatch = suggestions.positions.find(p => p.label.toLowerCase() === contract.position.toLowerCase());
  const assignmentMatch = suggestions.institutions.find(i => i.label.toLowerCase() === contract.assignment.toLowerCase());
  const addressMatch = suggestions.addresses.find(a => a.label.toLowerCase() === contract.address.toLowerCase());

  let positionLabel = contract.position;
  if (isFeminine && positionMatch?.labelFeminine) {
    positionLabel = positionMatch.labelFeminine;
  }
  if (positionMatch?.prefix) {
    positionLabel = `${positionMatch.prefix}${positionLabel}`;
  }

  let assignmentLabel = contract.assignment;
  if (isFeminine && assignmentMatch?.labelFeminine) {
    assignmentLabel = assignmentMatch.labelFeminine;
  }
  if (assignmentMatch?.prefix) {
    assignmentLabel = `${assignmentMatch.prefix}${assignmentLabel}`;
  }

  let addressLabel = contract.address;
  if (isFeminine && addressMatch?.labelFeminine) {
    addressLabel = addressMatch.labelFeminine;
  }
  if (addressMatch?.prefix) {
    addressLabel = `${addressMatch.prefix}${addressLabel}`;
  }

  return {
    contract_id: contract.id,
    first_name: contract.firstName,
    last_name: contract.lastName,
    full_name: `${contract.lastName} ${contract.firstName}`.trim(),
    gender: contract.gender,
    honorific: isFeminine ? "Madame" : "Monsieur",
    identifiee_identifie: isFeminine ? "identifiée" : "identifié",
    denommee_denomme: isFeminine ? "dénommée" : "dénommé",
    contractant_legal: isFeminine ? "la << Contractante >>" : "le << Contractant >>",
    contractant_label: isFeminine ? "Contractante" : "Contractant",
    La_Le_Contractant: isFeminine ? "La contractante" : "Le contractant",
    la_le_contractant: isFeminine ? "la contractante" : "le contractant",
    Elle_Il: isFeminine ? "Elle" : "Il",
    elle_il: isFeminine ? "elle" : "il",
    address: addressLabel,
    nif: contract.nif ?? "",
    ninu: contract.ninu ?? "",
    position: positionLabel,
    assignment: assignmentLabel,
    salary_number: formatCurrency(contract.salaryNumber),
    salary_number_raw: contract.salaryNumber.toString(),
    salary_text: contract.salaryText,
    duration_months: contract.durationMonths.toString(),
    duration_months_text: numToLetters[contract.durationMonths] ?? contract.durationMonths.toString(),
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
  { key: "{{honorific}}", label: "Monsieur / Madame" },
  { key: "{{identifiee_identifie}}", label: "Identifié(e)" },
  { key: "{{denommee_denomme}}", label: "Dénommé(e)" },
  { key: "{{contractant_legal}}", label: "le/la << Contractant(e) >>" },
  { key: "{{contractant_label}}", label: "Contractant(e)" },
  { key: "{{La_Le_Contractant}}", label: "Le/La contractant(e) (Début de phrase)" },
  { key: "{{la_le_contractant}}", label: "le/la contractant(e)" },
  { key: "{{Elle_Il}}", label: "Il / Elle" },
  { key: "{{elle_il}}", label: "il / elle" },
  { key: "{{address}}", label: "Adresse" },
  { key: "{{nif}}", label: "NIF" },
  { key: "{{ninu}}", label: "NINU" },
  { key: "{{position}}", label: "Poste" },
  { key: "{{assignment}}", label: "Affectation" },
  { key: "{{salary_number}}", label: "Salaire formaté" },
  { key: "{{salary_number_raw}}", label: "Salaire brut" },
  { key: "{{salary_text}}", label: "Salaire en lettres" },
  { key: "{{duration_months}}", label: "Durée (mois)" },
  { key: "{{duration_months_text}}", label: "Durée en lettres" },
  { key: "{{date_debut}}", label: "Date de début" },
  { key: "{{date_fin}}", label: "Date de fin" },
  { key: "{{created_date}}", label: "Date courte" },
  { key: "{{created_date_long}}", label: "Date longue" },
  { key: "{{workspace_name}}", label: "Nom du workspace" }
];
