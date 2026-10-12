# Calepinage carrelage

Application web pour préparer la pose d'un carrelage : plan de pose, nombre de carreaux à acheter, liste des coupes et réutilisation des chutes.

Elle fonctionne entièrement dans le navigateur : il n'y a rien à installer, aucun serveur à lancer et aucune connexion internet nécessaire.

## Démarrage

Ouvrir `index.html` dans un navigateur récent (Chrome, Edge ou Firefox).

> Si l'affichage semble ancien après une mise à jour des fichiers, recharger la page avec `Ctrl+F5`.

## Écran

| Zone | Contenu |
|------|---------|
| En-tête | Nom de la pièce, boutons Retour / Avant, Nouveau, Ouvrir un JSON, Enregistrer en JSON |
| Panneau de gauche | Réglages : géométrie, carreaux, carreau de départ, optimisation, achat |
| Centre | Plan interactif du calepinage |
| Panneau de droite | Résultats et liste des coupes |

Toutes les cotes sont en **millimètres**. Le repère du plan a l'axe X vers la droite et l'axe Y vers le haut.

---

## 1. Géométrie de la pièce

La pièce est un **polygone quelconque** : rectangle, L, T, U, pan coupé, murs en biais… Il n'y a pas de limite au nombre de sommets.

### Modèles

La liste « Modèle » suivie du bouton **Appliquer à la pièce** remplace la pièce par une forme de départ, à ajuster ensuite.

### Saisie dans le tableau

Deux modes au choix :

- **Coordonnées X / Y** : on saisit la position de chaque sommet.
- **Murs (longueur / angle)** : on saisit chaque mur comme on le mesure sur place, en tournant autour de la pièce.
  - Angle : 0° = vers la droite, 90° = vers le haut, 180° = vers la gauche, 270° = vers le bas.
  - Modifier un mur décale tous les sommets suivants.
  - Le dernier mur, affiché en gris, est calculé automatiquement pour refermer la pièce.

Le bouton **+ Ajouter un sommet** ajoute un sommet au milieu du dernier mur. La croix **×** supprime un sommet. Une forme garde toujours au moins 3 sommets.

### Édition sur le plan

| Action | Effet |
|--------|-------|
| Glisser un sommet (carré bleu) | Déplace le sommet |
| Double-clic sur un mur | Ajoute un sommet à cet endroit |
| Clic droit sur un sommet | Supprime le sommet |
| Maintenir `Alt` pendant le déplacement | Désactive le magnétisme |

Le **magnétisme** (barre d'outils, 10 mm par défaut) cale les points sur une grille. La valeur 0 le désactive.

### Obstacles

Les obstacles sont les zones à ne pas carreler : îlot, colonne, gaine, receveur de douche…

- **+ Obstacle** ajoute un carré de 600 × 600 mm au centre de la pièce.
- La liste **Forme éditée** permet de choisir la forme à modifier : la pièce ou un obstacle.
- Un obstacle se modifie exactement comme la pièce, et peut être renommé.
- Le joint périphérique s'applique aussi autour des obstacles.

> Les obstacles doivent être entièrement à l'intérieur de la pièce et ne pas se chevaucher.

---

## 2. Carreaux et joints

| Paramètre | Description |
|-----------|-------------|
| Longueur / largeur | Dimensions du carreau, carré ou rectangle |
| Pose | Disposition des rangées (voir ci-dessous) |
| Joint entre carreaux | Largeur du joint entre deux carreaux |
| Joint périphérique | Espace laissé le long des murs et autour des obstacles |

### Types de pose

| Pose | Décalage des rangées | Début de rangée contre un mur |
|------|----------------------|-------------------------------|
| Droite | aucun | 100 % |
| Décalée 1/3 | 1/3 de carreau à chaque rangée | 100 % / 66 % / 33 % |
| Décalée 1/3 alternée | 1/3 une rangée sur deux | 100 % / 66 % |
| Décalée 1/2 | 1/2 carreau une rangée sur deux | 100 % / 50 % |

Le décalage se fait toujours dans le sens de la **longueur** du carreau.

---

## 3. Carreau de départ

C'est à partir de ce carreau que toute la pose est construite. Sur le plan, il est encadré en pointillés rouges, une flèche indique le sens de sa longueur et le **point rouge** marque sa position.

| Paramètre | Description |
|-----------|-------------|
| Position X / Y | Coordonnées du point rouge |
| Point du carreau placé | Coin (bas-gauche, bas-droit, haut-gauche, haut-droit) ou centre du carreau qui se trouve sur le point rouge |
| Orientation | Angle de rotation du carreau en degrés (boutons rapides 0°, 90°, 45°) |

Raccourcis :

- **Placer sur le plan** : le clic suivant sur le plan place le carreau. `Échap` annule.
- **Glisser le point rouge** déplace le carreau de départ.
- **Caler dans l'angle** : place le carreau dans l'angle du sommet choisi, joint périphérique compris. Le coin du carreau utilisé est choisi automatiquement.
- **Suivre le mur** : oriente les carreaux parallèlement au mur qui part du sommet choisi. Pratique pour les pièces aux murs non perpendiculaires.
- **Centrer dans la pièce** : centre le carreau dans la pièce, pour obtenir des coupes symétriques.

> Astuce : si les résultats signalent des **coupes fines** (moins de 50 mm), déplacer légèrement le carreau de départ. Ces coupes sont difficiles à réaliser et peu esthétiques.

---

## 4. Optimisation des chutes

| Paramètre | Description |
|-----------|-------------|
| Réutiliser les chutes | Active ou désactive la réutilisation des chutes |
| Épaisseur de coupe | Largeur de matière perdue par le trait de coupe (disque) |
| Chute minimale réutilisable | En dessous de cette dimension, la chute est jetée |
| Autoriser la rotation à 90° | Une chute peut être tournée pour servir ailleurs. À éviter pour les carreaux à motif ou à veinage orienté |

### Principe

1. Chaque morceau à poser est ramené au rectangle qui l'englobe, dans le sens du carreau.
2. Les morceaux sont traités du plus grand au plus petit.
3. Pour chaque morceau, l'application cherche la chute disponible qui lui convient le mieux, c'est-à-dire celle qui laisse le moins de perte. Si aucune ne convient, elle entame un carreau neuf.
4. La découpe se fait en ligne droite d'un bord à l'autre (« guillotine »). Les morceaux restants retournent dans le stock de chutes, épaisseur de coupe déduite.

Exemple : un carreau coupé pour poser un morceau de 55 % laisse une chute d'environ 45 %. Cette chute servira plus loin pour un morceau de 33 %.

---

## 5. Achat

| Paramètre | Description |
|-----------|-------------|
| Marge casse / sécurité | Pourcentage ajouté au nombre de carreaux nécessaires (10 % conseillé, 15 % en pose diagonale) |
| Carreaux par boîte | Pour calculer le nombre de boîtes. La valeur 0 désactive ce calcul |

---

## Résultats

| Ligne | Signification |
|-------|---------------|
| Surface de la pièce | Surface au sol à l'intérieur des murs |
| Obstacles | Surface des obstacles |
| **Surface carrelée** | Pièce moins obstacles |
| Couverte par les carreaux | Surface réellement recouverte de carreaux, joints exclus |
| Joints et jeu périphérique | Différence entre les deux lignes précédentes |
| Carreaux entiers posés | Carreaux posés sans coupe |
| Morceaux coupés | Nombre de morceaux à découper |
| dont taillés dans des chutes | Morceaux découpés dans une chute |
| Carreaux neufs entamés | Carreaux neufs utilisés pour les coupes |
| **Carreaux nécessaires** | Entiers + carreaux neufs entamés |
| Sans réutilisation des chutes | Pour comparer le gain apporté par l'optimisation |
| **À acheter** | Carreaux nécessaires + marge, arrondi au carreau supérieur |
| Boîtes / Surface achetée | Quantité à commander |
| Chutes perdues | Surface de carrelage achetée mais non posée, marge exclue |
| Coupes fines | Nombre de coupes de moins de 50 mm |

### Liste des coupes

Chaque morceau coupé porte un numéro (`C1`, `C2`…), aussi affiché sur le plan. Pour chaque morceau, la liste indique :

- les **dimensions à découper**, longueur × largeur, dans le sens du carreau ;
- la **source** : `Neuf T3` signifie qu'il faut découper le carreau neuf n° 3, `Chute du T3` qu'il faut utiliser la chute restante du carreau n° 3.

Cliquer sur une ligne met le morceau en évidence sur le plan. Survoler un carreau sur le plan affiche ses informations.

### Couleurs du plan

| Couleur | Signification |
|---------|---------------|
| Beige | Carreau entier |
| Orange | Coupe dans un carreau neuf |
| Vert | Coupe dans une chute |
| Gris | Obstacle |

---

## Navigation sur le plan

| Action | Effet |
|--------|-------|
| Molette | Zoom centré sur la souris |
| Glisser dans le vide (ou clic molette) | Déplacer la vue |
| **Ajuster la vue** | Recadrer sur la pièce |
| Cases à cocher de la barre d'outils | Afficher ou masquer les repères des coupes et les cotes des murs |

---

## Sauvegarde et historique

- **Enregistrer en JSON** télécharge un fichier `<nom de la pièce>.json` qui contient tous les paramètres.
- **Ouvrir un JSON…** recharge une pièce précédemment enregistrée.
- Le projet en cours est aussi sauvegardé automatiquement dans le navigateur, et retrouvé à la prochaine ouverture.
- **↶ Retour / Avant ↷** (`Ctrl+Z` / `Ctrl+Y`) annule ou rétablit les modifications. L'historique garde 100 étapes et repart de zéro au rechargement de la page.

### Format du fichier JSON

```json
{
  "version": 1,
  "name": "Salle de bain",
  "room": [ { "x": 0, "y": 0 }, { "x": 4000, "y": 0 }, { "x": 4000, "y": 3000 }, { "x": 0, "y": 3000 } ],
  "obstacles": [
    { "name": "Douche", "points": [ { "x": 0, "y": 0 }, { "x": 900, "y": 0 }, { "x": 900, "y": 900 }, { "x": 0, "y": 900 } ] }
  ],
  "tile": { "length": 600, "width": 300 },
  "pattern": "third",
  "joint": { "inner": 3, "perimeter": 5 },
  "start": { "x": 5, "y": 5, "anchor": "bl", "angle": 0 },
  "optim": { "reuse": true, "kerf": 2, "minOffcut": 20, "allowRotate": false },
  "purchase": { "margin": 10, "tilesPerBox": 6 }
}
```

| Champ | Valeurs |
|-------|---------|
| `pattern` | `straight` (droite), `third` (1/3 : 100/66/33), `twoThirds` (100/66), `half` (1/2) |
| `start.anchor` | `bl` bas-gauche, `br` bas-droit, `tl` haut-gauche, `tr` haut-droit, `c` centre |
| `start.angle` | degrés, sens anti-horaire |

Le fichier peut être modifié à la main. Les valeurs absentes ou invalides sont remplacées par les valeurs par défaut au chargement.

---

## Limites

- Un morceau découpé en biais ou en forme de L est compté comme le rectangle qui l'englobe. Le nombre de carreaux peut donc être légèrement surestimé, jamais sous-estimé.
- Les obstacles doivent être à l'intérieur de la pièce et ne pas se chevaucher.
- L'optimisation ne tient pas compte du côté usine ou du côté coupé des chutes. Placer de préférence le côté coupé contre le mur, il sera caché par la plinthe.
- Avec un joint périphérique très large par rapport à des recoins étroits, le contour carrelé peut devenir incohérent.

## Structure du projet

```
calpinage/
├── index.html        Interface
├── css/style.css     Mise en page
└── js/
    ├── geometry.js   Calculs géométriques (surfaces, découpe des carreaux par la pièce, décalage des contours)
    ├── layout.js     Génération de la pose et calcul des résultats
    ├── optimizer.js  Réutilisation des chutes
    ├── project.js    Paramètres par défaut, contrôle des fichiers JSON, modèles de pièces
    └── app.js        Plan interactif, panneaux et historique
```
