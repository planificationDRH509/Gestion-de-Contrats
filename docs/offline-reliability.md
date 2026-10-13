# Fiabilité du mode hors ligne

## Garanties mises en place

- Les modifications métier et leur file d'envoi sont confirmées après une transaction IndexedDB. Les erreurs de stockage remontent à l'appelant ; une sauvegarde qui échoue n'est pas annoncée comme réussie.
- La migration du cache historique conserve l'ancien stockage jusqu'à la confirmation de la nouvelle copie. Les anciens lots de modifications sont séparés par contrat pour permettre une résolution individuelle.
- Les valeurs du cache principal et du cache React Query sont chiffrées avec AES-GCM et une clé d'appareil non exportable. Les clés des enregistrements et métadonnées de stockage restent locales au navigateur. Ce mécanisme ne protège pas contre du code malveillant exécuté dans l'origine ou l'accès à une session navigateur déjà ouverte.
- Les écritures portent uniquement sur les enregistrements modifiés. Une comparaison atomique des versions protège les écritures concurrentes ; des changements divergents sont refusés. BroadcastChannel actualise les copies des autres onglets, et Web Locks sérialise les envois réseau lorsque disponible.
- Les contrats et dossiers comparent les champs locaux à leur version d'origine. Les modifications indépendantes du serveur sont conservées. Les conflits de champs des contrats, de leur état et des dossiers liés peuvent être résolus depuis l'indicateur existant.
- Les tâches disposent d'une clé locale indépendante du jeton de connexion. Les sessions renouvelées migrent les anciens caches et la déconnexion conserve les opérations en attente. Un cache indéchiffrable n'est jamais remplacé silencieusement.
- Après 15 minutes d'inactivité, le déverrouillage vérifie d'abord l'empreinte locale du mot de passe, même avec Internet, et conserve le jeton de session existant. Le serveur intervient si cette vérification locale n'est pas disponible. La limite d'essais, les suspensions connues et les contrôles de compte en arrière-plan restent actifs.
- Les opérations de tâches envoyées sont immuables. Les modifications faites pendant l'envoi restent dans la file. Le serveur conserve un reçu par opération pour empêcher les doublons après une réponse perdue.
- La synchronisation des tâches fonctionne aussi lorsque leur page n'est pas ouverte. L'historique des impressions est mis en attente et envoyé avec un identifiant stable.
- « Disponible hors ligne » nécessite un téléchargement complet. Une vérification de contenu côté serveur évite les transferts complets lorsque rien n'a changé ; elle tient compte des suppressions et des relations. Lorsqu'il y a des changements, le téléchargement reste un instantané complet.
- Les requêtes Supabase ont un délai maximal de 15 secondes ; les erreurs de programmation ne sont plus toutes assimilées à une panne réseau.

## Limites conservées

Le premier chargement, une nouvelle connexion, les changements de mot de passe et certaines fonctions d'administration exigent Internet. Le navigateur doit rester ouvert pour synchroniser. Les mises à jour des autres appareils ne sont connues qu'après connexion. Effacer le profil ou les données du navigateur efface aussi les opérations non synchronisées et les clés : le cache ne remplace pas une sauvegarde.

Une opération sur une liste scellée, une identité incompatible ou un compte dont les droits ont changé peut toujours nécessiter une correction métier. Les changements refusés restent conservés. Les anciens caches privés dont le jeton a déjà été perdu avant cette mise à jour ne peuvent pas être déchiffrés rétroactivement.

## Vérification

- `npm test` : stockage transactionnel, saturation, conflits entre contextes, fusion de champs, reprise, confidentialité et sessions.
- `npm run build` : TypeScript, bundle et précache PWA.
- `npm run test:browser` : Chrome installé ; migration réelle de 5 207 enregistrements, deux contextes simultanés, rotation de session et rechargement de la PWA avec le réseau désactivé. Les profils et données utilisés sont isolés.
- `supabase/tests/offline_tasks.sql` et `supabase/tests/offline_workspace_revision.sql` : tests serveur avec données temporaires et `ROLLBACK`.

Migrations : `20260926134411_harden_offline_sync.sql` et `20260926135601_offline_workspace_revision.sql`. Les deux migrations ont été appliquées au projet configuré et leurs tests SQL ont réussi le 26 septembre 2026. Les fonctions publiques utilisent un wrapper invoker, des fonctions privées et les sessions opaques existantes de l'application. Les reçus ne sont pas accessibles directement aux rôles API.

## Constat serveur distinct

Le contrôle Supabase a signalé neuf tables existantes sans RLS, dont `app_users`, `identification` et `contrat`. Ce problème préexistait aux migrations ci-dessus. Le corriger exige d'adapter les accès directs et l'authentification historique de l'application ; activer RLS sans cette adaptation couperait les accès actuels. Il n'est pas corrigé par le chiffrement du cache.

Référence : https://supabase.com/docs/guides/database/database-linter?lint=0013_rls_disabled_in_public


## Lecture et écriture locales prioritaires

Les contrats actifs (recherche, filtres, pagination et sélection multiple), identités, dossiers et étiquettes sont lus dans le dernier instantané complet, y compris en ligne. Un résultat vide reste un résultat local valide. Le premier chargement sans instantané et les fiches absentes du cache peuvent encore interroger le serveur. Les listes utilisent leur cache dédié.

Les créations et modifications courantes, imports, changements d’état/durée/dossier, suppressions récupérables, étiquettes, tâches et épingles sont enregistrés localement avant toute synchronisation. La réponse attend la persistance locale, pas le réseau. Les tâches déchiffrées et les référentiels en cache s’affichent pendant leur actualisation distante.

La synchronisation vérifie la révision du serveur toutes les 30 secondes lorsque la page est visible, au retour de la connexion et à la réouverture de l’onglet. Elle ne retélécharge l’instantané que si nécessaire. Les modifications locales en attente, y compris leurs effets sur les contrats et les suppressions de tâches, sont conservées lors d’un téléchargement concurrent. Les conflits restent dans les files de synchronisation existantes.

Restent tributaires du serveur : première connexion, administration des comptes, premier chargement des données absentes du cache, pièces jointes et suppression définitive. Aucun nouveau libellé n’est ajouté dans l’interface.


## Référentiels, exports et corbeille

Les adresses, postes, institutions, prépositions, grilles salariales et ministres acceptent des modifications persistées dans la file locale en mode Supabase. Les vues projettent les opérations en attente sur le dernier instantané serveur ; une actualisation ou un redémarrage ne doit pas annuler une modification locale. Les caches de suggestions sont séparés par espace de travail. Le cache historique est conservé et attribué une seule fois à l'espace actif lors de la migration.

Les exports utilisent les références déjà disponibles ; seule une référence jamais téléchargée peut encore nécessiter le réseau. L'apprentissage des suggestions ne retarde plus la sauvegarde d'une ligne. La synchronisation des contrats inclut désormais la corbeille, qui est ensuite consultée localement.

La migration `20261013024743_offline_reference_changes.sql`, appliquée au projet Supabase configuré le 13 octobre 2026 et vérifiée avec des tests SQL annulés par `ROLLBACK`, ajoute une synchronisation atomique avec reçus par compte et opération, vérification des droits et contrôle des versions. Une réponse perdue peut être rejouée sans appliquer deux fois une modification. Les conflits restent conservés dans la file avec l'erreur visible par l'indicateur existant. Les pièces jointes ne sont ni téléchargées automatiquement ni ajoutées à cette file.

Vérifications ciblées : `references.localFirst.test.tsx`, exports des listes, parité des instantanés et `supabase/tests/offline_references.sql` (transactions annulées après les tests).
