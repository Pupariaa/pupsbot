# Managers

Ce dossier contient les gestionnaires qui orchestrent plusieurs composants pour réaliser des tâches complexes.

## AlgorithmManager.js

Gère l'exécution des algorithmes de calcul de PP avec un système de fallback multi-niveaux :

- **Tier 1 (Strict)** : Critères stricts pour des correspondances optimales
- **Tier 2 (Relaxed)** : Critères relâchés si aucune correspondance parfaite n'est trouvée  
- **Tier 3 (Forced)** : Accepte n'importe quel résultat valide pour garantir une suggestion

Supporte 5 algorithmes : Conservative, Balanced, Aggressive, Base, Dynamic.

Fait partie du système de recommandation de beatmaps du worker osu.js.
