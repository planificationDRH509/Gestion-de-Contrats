# Gestion-de-Contrats

Webapp PWA desktop-first pour la redaction, la gestion et l'impression de contrats.

## Setup local

```bash
npm install
npm run dev
```

## Deployment GitHub Pages

Le deploiement est automatique via GitHub Actions (`.github/workflows/deploy-pages.yml`) a chaque push sur `main`.

URL attendue :
- `https://planificationDRH509.github.io/Gestion-de-Contrats/`

Note importante :
- GitHub Pages heberge uniquement le front-end statique. Les routes locales `/api/local/*` (SQLite local + backup SQL + verif MSPP) ne sont pas disponibles en ligne.

Identifiants par defaut (mode local) :
- utilisateur : `admin`
- mot de passe : `admin`

En mode local, les donnees sont stockees dans un fichier SQLite :
- `./.local-data/contribution.sqlite`
- API locale disponible via `/api/local/*` (integree a Vite en dev/preview)

## Variables d'environnement Supabase

Creez un fichier `.env` a la racine :

```bash
VITE_DATA_PROVIDER=local
VITE_SUPABASE_URL="https://YOUR_PROJECT.supabase.co"
VITE_SUPABASE_ANON_KEY="YOUR_SUPABASE_ANON_KEY"
```

- Par defaut, `VITE_DATA_PROVIDER=local` utilise SQLite local (offline, sans Supabase).
- Pour activer Supabase, passez a `VITE_DATA_PROVIDER=supabase`.

## Schema SQLite local

Le mode local cree automatiquement les tables suivantes :
- `identification` : `nif` (PK), `nom`, `prenom`, `sexe`, `ninu` (unique), `adresse`, horodatages
- `contrat` : `id_contrat` (PK), FK `nif` vers `identification`, `duree_contrat`, `salaire`, `annee_fiscale`, `salaire_en_chiffre`, `titre`, `lieu_affectation`, `historique_saisie` (JSON), `dossier_id`
- `dossiers` : table liee aux contrats via `dossier_id` cote `contrat` (et champ `id_contrat` disponible pour liaison directe), avec les champs de pilotage (`priority`, `contract_target_count`, etc.)
- `ministres` : `id`, `nom_complet`, `sexe`, `nif`, `ninu`, `debut_mandat`, `fin_mandat`, `created_at` ; `ministre_actuel` conserve le ministre sélectionné et chaque `contrat.ministre_id` référence son signataire.

Notes :
- `id_contrat` est genere au format `AFAAxxxx` (ex: `25261234`) avec `AFAA = annee fiscale`.
- le `NIF` est obligatoire en mode SQLite (car cle primaire de `identification`).

## Basculer Local -> Supabase

1. Executer les migrations SQL dans Supabase :
   - appliquer tous les fichiers de `supabase/migrations/` dans l'ordre de leur nom ;
   - `013_app_user_roles.sql` ajoute les rôles et promeut le compte `admin` existant ;
   - `014_contract_audit_columns.sql` finalise `historique_saisie` et ajoute le filet de sécurité d'audit.
   - `20260911023257_change_app_user_password.sql` active la modification sécurisée du mot de passe dans les paramètres.
2. Ajouter les variables d'environnement.
3. Passer `VITE_DATA_PROVIDER=supabase`.

## Commandes utiles

```bash
npm run dev       # developpement
npm run build     # build production
npm run preview   # previsualiser le build
npm run test      # tests unitaires
```

## PWA

- Manifest + icones placeholders incluses.
- Service worker genere via `vite-plugin-pwa`.

## DRAFT HTML (template contrat)

Dans l'application, ouvrez **Parametres -> DRAFT HTML** pour modifier le HTML/CSS du contrat.

- Les variables disponibles (ex : `{{first_name}}`, `{{salary_text}}`) sont listees dans l'ecran.
- Les changements sont appliques immediatement aux apercus et impressions.

## Backup SQL

Dans l'application, ouvrez **Parametres -> Backup SQL** pour telecharger un export complet de la base locale SQLite (`.sql`).

## Ministres

**Paramètres → Général → Ministres** permet aux administrateurs d'ajouter un ministre (nom complet, sexe, NIF, NINU et dates de mandat), puis de le sélectionner comme ministre actuel. L'adresse du ministère reste commune. L'ajout seul ne change pas la sélection.

Les contrats existants sont rattachés à Bertrand SINAL avec les identifiants présents dans le modèle d'origine. Chaque nouveau contrat conserve son ministre, y compris dans les imports, les demandes de synchronisation hors ligne, les aperçus et les réimpressions. Changer le ministre actuel ne modifie aucun ancien contrat. L'identité d'un ministre enregistré n'est pas modifiable depuis l'application et le ministre d'un contrat existant ne peut pas être remplacé.

Le début de mandat est obligatoire à l'ajout, et la fin peut rester vide tant que le mandat est en cours. **Modifier le mandat** permet de corriger les dates ou de clôturer le mandat sans modifier les contrats. Bertrand SINAL est initialisé au **1er janvier 2020**, sans date de fin. Une alerte non bloquante signale une **date de début de contrat** antérieure au début du mandat ou postérieure à sa fin (bornes incluses). Elle utilise la date imprimée, avec les dates personnalisées de l'espace de travail, et apparaît dans la saisie, le tableur, l'import, la liste et les aperçus. Elle n'est pas imprimée sur le contrat. Les dates actualisées du catalogue priment sur une ancienne copie hors ligne.

Le catalogue et la sélection sont partagés par Supabase (ou par SQLite en mode local). En mode Supabase, les créations hors ligne utilisent la dernière sélection téléchargée ; il faut avoir chargé le catalogue au moins une fois. Les anciens modèles HTML enregistrés utilisant les coordonnées de Bertrand SINAL sont adaptés aux variables `{{minister_name}}`, `{{minister_signature}}`, `{{minister_nif}}`, `{{minister_ninu}}`, `{{minister_identified}}` et `{{minister_domiciled}}` sans remplacer leur mise en page.

Migrations : `supabase/migrations/20261010155650_contract_ministers.sql` et `supabase/migrations/20261010161426_minister_mandate_dates.sql`. Les deux nouvelles tables ont RLS activé et leurs accès API directs sont révoqués ; seules les RPC validant la session de l'application y accèdent. SQLite migre automatiquement et inclut ces tables dans le backup SQL. Vérifications : `supabase/tests/ministers.sql` (transaction annulée), tests unitaires et `tests/browser/ministers.spec.ts`.

## Structure rapide

- `src/features/contracts` : ecrans, formulaire, impression
- `src/data` : repositories + providers (local / supabase)
- `supabase/migrations` : schema SQL + RLS

## Listes de contrats

La page **Listes** du menu latéral permet de créer des lots de durée commune (1 à 12 mois), avec un numéro de visa facultatif. Les contrats sont classés par nom, puis prénom, selon l’ordre alphabétique français. Le nom du lot se recalcule automatiquement : `LOT-<quantité>-<NOM>-<Prénom>`. Une liste vide porte le nom `LOT-0`, avec une référence distincte.

- Sur grand écran, un navigateur de listes avec recherche et filtres reste visible à côté du lot sélectionné. Le visa, l’ajout de contrats et les confirmations disposent de fenêtres dédiées. Sur mobile, la page permet uniquement de consulter les listes et de télécharger leur Excel, selon les droits d’export du compte.
- L’export Excel renseigne « Département » depuis l’institution d’affectation et « Formation » depuis le type de poste de la grille salariale (« Universitaire » ou « Technique »). Les titres masculins, féminins et les alias enregistrés sont reconnus ; les références absentes ou les formations ambiguës restent vides.
- Un contrat appartient à une seule liste. L’attribution et le déplacement groupés sont atomiques : une incompatibilité annule toute l’opération.
- Depuis **Contrats**, le clic droit sur une carte sélectionnée ou le bouton **Actions** ouvre les actions de toute la sélection. Le menu permet d’attribuer les contrats à un lot existant ou de créer et remplir un nouveau lot en une seule opération, avec aperçu du nom, du total et saisie du visa facultatif.
- Le total mensuel additionne les salaires ; le montant total multiplie cette somme par la durée commune.
- Une liste en préparation n’affiche pas de statut. Une liste **Scellée** porte un badge vert, également affiché sur les cartes des contrats.
- Le scellement protège la composition, le visa, les montants, la durée et les informations contractuelles et d’identité. Les états de suivi, tags et commentaires restent utilisables.
- Seul un administrateur peut rouvrir un lot, avec un motif conservé dans son historique. Une liste doit être vide et ouverte pour être supprimée.
- En mode Supabase, les listes sont téléchargées avec le cache hors ligne. Création, attribution, visa, scellement, réouverture et suppression sont enregistrés durablement sur l’appareil puis synchronisés dans l’ordre au retour du réseau, avec le compte ayant effectué les changements. Les exports Excel utilisent les contrats téléchargés. Une modification concurrente du même lot bloque sa synchronisation et conserve la copie locale ; les tentatives répétées ne créent pas de doublons.

Schéma : `supabase/migrations/20260920151424_contract_lists.sql`. Les tables sont protégées par RLS et sans accès direct aux rôles API ; les deux RPC vérifient les sessions opaques de l’application, les rôles et l’espace de travail. Des déclencheurs protègent aussi les contrats modifiés via les écrans existants. Le stockage SQLite applique les mêmes règles métier et inclut les listes dans la sauvegarde SQL.

La migration `supabase/migrations/20260925014004_offline_contract_lists.sql` ajoute la reprise idempotente des opérations hors ligne et la détection des conflits.

Vérification : `npm test` et `npm run build`. Les scripts `supabase/tests/contract_lists.sql` et `supabase/tests/offline_contract_lists.sql` testent les RPC et leurs protections dans des transactions annulées, sans conserver les données d’essai.


### Résolution des conflits de synchronisation

Les identifications, contrats et dossiers conservent `modified_at`, la date de la modification utilisateur, séparément de `updated_at`, la version d’écriture sur le serveur. Les opérations en attente conservent également `modifiedAt`, indépendamment de leur position dans la file. Une modification arrivée plus tard ne remplace donc pas une modification plus récente. Les champs non modifiés localement restent préservés ; à dates égales, le client conserve la version serveur. Les conflits déjà enregistrés sont réévalués automatiquement, et une correction reçoit une nouvelle date sans déplacer ses dépendances.

Un NINU concurrent est attribué à l’identification modifiée le plus récemment, en une transaction ; les NIF et leurs contrats restent distincts. Les droits d’accès, les listes scellées, le ministre immuable et les validations métier continuent de s’appliquer. Cette règle ne remplace pas les protocoles propres aux listes et aux référentiels.

Appliquer `supabase/migrations/20261015014503_automatic_latest_edit_wins.sql` avant de déployer le client correspondant. La migration ajoute les horloges et les RPC atomiques sans modifier les politiques RLS. Vérification : `supabase/tests/latest_edit_wins.sql` (fixtures annulées), tests de reprise dans `offlineCreation.test.ts`, de fusion IndexedDB et d’horodatage des anciennes corrections.
