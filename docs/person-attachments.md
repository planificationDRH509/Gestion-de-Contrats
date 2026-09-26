# Pièces jointes des personnes

Le bouton trombone au bas des cartes contrat ouvre les pièces jointes. Elles sont communes aux contrats d’une même personne (identification/NIF), dans le même espace de travail.

- Fichier : import puis téléchargement, maximum 10 Mio, fichiers vides refusés.
- Lien : URL HTTP ou HTTPS, ouverture dans un nouvel onglet.
- Chemin externe : référence textuelle (disque, partage réseau, stockage externe), copiable ; aucun fichier externe n’est transféré ni supprimé.

Tous les rôles, y compris `reader`, peuvent lister et télécharger. Les rôles disposant de `contracts.edit` peuvent ajouter et supprimer. L’accès exige une session applicative valide et l’accès à l’espace du contrat.

## Persistance

En mode Supabase, les métadonnées et les octets (`bytea`) résident dans `attachment_private.documents`. Ce choix utilise la connexion existante par sessions opaques, sans bucket public ni clés privilégiées côté navigateur. L’API `manage_person_attachments` valide la session, le rôle et l’espace à chaque appel. Le contenu est transféré en base64 seulement à l’ajout et au téléchargement ; les listes excluent les octets. Les UUID rendent une nouvelle tentative d’ajout identique sans duplication.

Ce stockage consomme l’espace de la base Supabase, pas un bucket Storage. Pour des volumes importants ou de gros fichiers, prévoir un bucket privé et une fonction serveur qui vérifie les mêmes sessions avant de produire des URL signées.

Les fichiers Supabase nécessitent une connexion ; ils ne sont pas mis en cache hors ligne. Le fournisseur local conserve les fichiers dans IndexedDB sur le navigateur courant uniquement.

## Vérification

- `npx vitest run src/features/attachments/attachmentsRepository.test.ts`
- `npx playwright test tests/browser/attachments.spec.ts`
- `supabase/tests/person_attachments.sql` : transaction annulée, couvre les trois sources, accès lecteur, refus hors espace/sans session, téléchargement, suppression, isolation des personnes et validation.
