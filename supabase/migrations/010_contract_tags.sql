-- Table globale pour les tags (sans notion de workspace)
create table if not exists tags (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  color text default '#e2e8f0', -- couleur de fond par défaut (gris clair)
  created_at timestamptz not null default now()
);

-- Table de liaison entre les contrats et les tags
create table if not exists contract_tags (
  contract_id text not null references contrat(id_contrat) on delete cascade,
  tag_id uuid not null references tags(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (contract_id, tag_id)
);

-- Index pour optimiser les requêtes (surtout lors du filtrage ou du chargement)
create index if not exists contract_tags_contract_id_idx on contract_tags(contract_id);
create index if not exists contract_tags_tag_id_idx on contract_tags(tag_id);
