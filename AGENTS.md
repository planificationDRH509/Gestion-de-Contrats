# Consignes du projet

Dans les interfaces, ne pas ajouter de libellés d’explication sans demande de l’utilisateur.

## Constitution de l’impression des contrats

**Un contrat imprimé ne doit JAMAIS contenir un élément de l’interface de l’application.**

- Seuls le contenu contractuel, ses signatures et sa pagination peuvent figurer sur le papier ou dans le PDF.
- Aucun bouton, lien de navigation, infobulle, menu, alerte, notification, marque ou décoration de l’application ne doit apparaître, y compris en bas des pages.
- L’impression doit exclure par défaut tout élément situé hors des documents contractuels. Une liste de classes à masquer, ou le seul ajout de `no-print` aux nouveaux composants, ne suffit pas.
- Réserver `.contract-document` au document contractuel. Placer tous les contrôles et messages de l’application à l’extérieur de cette zone.
- La protection doit fonctionner avec le bouton Imprimer et avec Ctrl/Cmd+P, pour un contrat, un lot, une sélection partielle, une sélection vide et pendant le chargement. Sans document prêt, aucun élément de l’interface ne doit être imprimé.
- Préserver le texte, les signatures, la sélection des pages et la pagination. Conserver les fonctions d’accessibilité à l’écran.
- Toute modification de l’interface globale, des styles, des modèles ou de l’impression doit passer `npm run test:print` avant livraison. Le contrôle compare les PDF réels avec et sans éléments parasites ajoutés autour des contrats.
- Ne pas désactiver ce contrôle pour faire passer un déploiement. En cas d’échec, corriger la cause puis vérifier le rendu imprimé.

Protection : `src/styles/print.css`. Vérifications : `tests/browser/contracts-print-isolation.spec.ts` et `tests/browser/contracts-print.spec.ts`. Le workflow `.github/workflows/deploy-pages.yml` impose ces vérifications avant le déploiement.
