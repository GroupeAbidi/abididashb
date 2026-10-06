# ABIDI — Pilotage Stock & Achats

Dashboard local pour analyser le stock, les sorties, les anomalies et préparer les achats du mois suivant.

## Analyses disponibles

- Vue manager avec KPIs, tendance mensuelle, répartition SARL et principaux articles
- Analyse journalière des sorties et classement par nom d'article
- Répartition par SARL, demandeur, centre de coût, projet et gisement
- Analyse du stock par magasin, famille, gisement, article et valeur immobilisée
- Plan d'achat prévisionnel avec stock de sécurité et export CSV
- Contrôles qualité : coûts nuls, stocks négatifs, ruptures, doublons et désignations divergentes
- Filtres par mois, date, SARL, magasin, gisement, famille, demandeur, centre, projet et article

## Lancer l'application

Double-cliquer sur `start-dashboard.bat`, ou utiliser :

```powershell
npm install
npm run start
```

Ouvrir ensuite l'adresse affichée par Vite (normalement `http://127.0.0.1:5173`).

## Actualiser les données fournies avec le projet

Les fichiers chargés dans l'application sont mémorisés dans le navigateur. Pour reconstruire le jeu initial depuis les deux fichiers Excel du dossier source :

```powershell
npm run data:refresh
```

Le calcul d'achat est une estimation opérationnelle, pas une commande automatique. Il utilise les trois derniers mois complets, un poids plus fort sur le mois récent, une réserve de sécurité et le stock disponible. Les prix fournisseurs, délais et quantités minimales ne figurent pas dans les fichiers actuels.
