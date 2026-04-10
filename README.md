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
   - `supabase/migrations/001_init.sql`
   - `supabase/migrations/002_rls.sql`
   - `supabase/migrations/003_dossiers.sql`
   - `supabase/migrations/004_dossier_customization.sql`
   - `supabase/migrations/005_dossier_ephemeral.sql`
   - `supabase/migrations/006_dossier_priority.sql`
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
