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

## Structure rapide

- `src/features/contracts` : ecrans, formulaire, impression
- `src/data` : repositories + providers (local / supabase)
- `supabase/migrations` : schema SQL + RLS

## Listes de contrats

La page **Listes** du menu latéral permet de créer des lots de durée commune (1 à 12 mois), avec un numéro de visa facultatif. Les contrats sont classés par nom, puis prénom, selon l’ordre alphabétique français. Le nom du lot se recalcule automatiquement : `LOT-<quantité>-<NOM>-<Prénom>`. Une liste vide porte le nom `LOT-0`, avec une référence distincte.

- Un contrat appartient à une seule liste. L’attribution et le déplacement groupés sont atomiques : une incompatibilité annule toute l’opération.
- Depuis **Contrats**, le clic droit sur une carte sélectionnée ou le bouton **Actions** ouvre les actions de toute la sélection. Le menu permet d’attribuer les contrats à un lot existant ou de créer et remplir un nouveau lot en une seule opération, avec aperçu du nom, du total et saisie du visa facultatif.
- Le total mensuel additionne les salaires ; le montant total multiplie cette somme par la durée commune.
- Une liste en préparation n’affiche pas de statut. Une liste **Scellée** porte un badge vert, également affiché sur les cartes des contrats.
- Le scellement protège la composition, le visa, les montants, la durée et les informations contractuelles et d’identité. Les états de suivi, tags et commentaires restent utilisables.
- Seul un administrateur peut rouvrir un lot, avec un motif conservé dans son historique. Une liste doit être vide et ouverte pour être supprimée.
- En mode Supabase, les modifications de listes exigent une connexion et une session applicative valide. Les changements de contrats en attente doivent être synchronisés avant une opération sur les listes. Les listes déjà chargées restent dans le cache de consultation.

Schéma : `supabase/migrations/20260920151424_contract_lists.sql`. Les tables sont protégées par RLS et sans accès direct aux rôles API ; les deux RPC vérifient les sessions opaques de l’application, les rôles et l’espace de travail. Des déclencheurs protègent aussi les contrats modifiés via les écrans existants. Le stockage SQLite applique les mêmes règles métier et inclut les listes dans la sauvegarde SQL.

Vérification : `npm test -- src/features/lists` et `npm run build`. Le script `supabase/tests/contract_lists.sql` teste les RPC et leurs protections dans une transaction annulée, sans conserver les données d’essai.
