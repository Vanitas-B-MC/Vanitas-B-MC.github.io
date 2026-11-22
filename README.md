# Portfolio

Site statique (HTML / CSS / JavaScript) publié avec GitHub Pages.

## Structure

```
index.html                  page principale (thème Cyberpunk)
veille.html                 page « Veille » (thème Cyberpunk, rose et bleu)
css/style.css, css/veille.css
js/main.js, js/veille.js
easter-egg/arcade.html      page cachée : salle d'arcade (accessible en tapant « awesome »)
easter-egg/css/arcade.css   style de l'arcade
easter-egg/js/arcade.js      choix du jeu, portefeuille, gain passif du Clicker
easter-egg/js/*.js          logique pure des jeux (snake, blackjack, roulette, plinko, clicker, tetris, td, survivors, breach, hunt, music) + ui-*.js
js/ui-*.js                  affichage de chaque jeu ; js/ui.js outils partagés
js/wallet.js                pièces bleues, crédits et progression (localStorage)
js/secret-code.js           détecte les codes tapés au clavier
js/theme.js, css/edgerunners.css   mode Edgerunners (« edgerunner »)
content/data.js             contenu du portfolio (textes, projets, contact…)
content/veille-sources.json liste des flux RSS suivis
content/veille.json         articles de la veille (rempli automatiquement)
scripts/fetch_veille.py     relève les flux RSS (Python, sans dépendance)
.github/workflows/veille.yml  lance la relève toutes les 3 heures
assets/                     favicon, images
```

## Easter eggs

- Taper `awesome` sur le site ouvre l'arcade cachée (`easter-egg/arcade.html`) : Data Snake, Blackjack, Roulette, Plinko (24 slots, mise libre en crédits, 3 niveaux de risque),
  Mineur de données, Tetris, Pare-feu (tower defense), Survivor Arena, Breach Protocol, Donjon (action temps réel : étages, boss, coffres, 4 classes, âmes pour les améliorations permanentes) et Chasse aux Titans (RPG au tour par tour : l'équipement se forge avec des trophées ✦, une monnaie propre au RPG, et des matériaux de monstres), avec une musique
  synthwave générée en direct (bouton « Musique », désactivée par défaut).
  Le Clicker a un arbre de compétences (par partie) et un Rebirth (formatage) avec éclats et arbre permanent.
  Pare-feu : 3 cartes et 7 tours (déblocage en crédits). Survivor Arena : 3 personnages (déblocage en crédits), foudre, vol de vie, élites et boss.
  Pièces bleues (Snake, Tetris, longues parties de Survivor Arena, piratages complets) : Roulette et améliorations par paliers du Clicker. Crédits (Clicker, vagues du
  Pare-feu, Survivor Arena, Breach Protocol) : Blackjack et déblocage des tours. La progression est enregistrée dans le navigateur.
- Taper `edgerunner` active (ou désactive) le style Cyberpunk: Edgerunners, rouge et vert, sur tout le site.

## Veille automatique

1. Le workflow GitHub Actions « Mise à jour de la veille » s'exécute toutes les 3 heures.
2. Il lance `scripts/fetch_veille.py`, qui lit les flux de `content/veille-sources.json`,
   nettoie les extraits (résumés) et écrit `content/veille.json`.
3. Si le fichier a changé, le workflow le commit : GitHub Pages republie le site.
