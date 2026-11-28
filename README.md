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
easter-egg/js/*.js          logique pure des jeux (snake, blackjack, roulette, plinko, crash, slots, ranch, fishing, race, mines, clicker, tetris, td, survivors, breach, hunt, music) + ui-*.js ; ranch-art.js et fishing-art.js : graphismes de la ferme et de la pêche
js/ui-*.js                  affichage de chaque jeu ; js/ui.js outils partagés
js/wallet.js                pièces bleues, crédits et progression (localStorage)
js/secret-code.js           détecte les codes tapés au clavier
js/theme.js, css/edgerunners.css   mode Edgerunners (« edgerunner »)
css/blackwall.css               mode Blackwall (« blackwall ») : noir, rouge sang, ambre, avec alerte NetWatch et musique dédiée (easter-egg/js/music.js)
css/{arasaka,militech,afterlife,braindance,dogtown}.css   autres thèmes secrets (mêmes codes que leur nom), chacun avec une alerte et un morceau dans easter-egg/js/music-themes.js
content/data.js             contenu du portfolio (textes, projets, contact…)
content/veille-sources.json liste des flux RSS suivis
content/veille.json         articles de la veille (rempli automatiquement)
scripts/fetch_veille.py     relève les flux RSS (Python, sans dépendance)
.github/workflows/veille.yml  lance la relève toutes les 3 heures
assets/                     favicon, images
```

## Easter eggs

- Taper `awesome` sur le site ouvre l'arcade cachée (`easter-egg/arcade.html`) : Data Snake, Blackjack, Roulette, Plinko (24 slots, mise libre en crédits, 3 niveaux de risque),
  Crash (multiplicateur à encaisser avant l'effondrement, encaissement automatique), Machine à sous (5 rouleaux, 10 lignes, wilds, scatters, tours gratuits),
  Vallée Néon (ferme façon Stardew Valley : carte en vue du dessus, labour, semis, arrosage, 4 saisons de 14 jours, météo, 30 cultures, animaux, outils améliorables au minerai, artisanat, machines, serre ; l'or expédié rapporte des crédits, les succès des pièces bleues), Grand Bleu (jeu de pêche : 6 lieux, 54 espèces selon l'heure et la météo, mini-jeu façon Stardew, bestiaire, cannes, appâts, accessoires, trésors, quêtes du capitaine), Courses d'IA (paris sur 6 robots, cotes calculées par simulation), Démineur (3 difficultés, records),
  Mineur de données, Tetris, Pare-feu (tower defense), Survivor Arena, Breach Protocol, Donjon (action temps réel : étages, boss, coffres, 4 classes, âmes pour les améliorations permanentes) et Chasse aux Titans (RPG au tour par tour : l'équipement se forge avec des trophées ✦, une monnaie propre au RPG, et des matériaux de monstres), avec une musique
  synthwave générée en direct (bouton « Musique », désactivée par défaut).
  Le Clicker a un arbre de compétences (par partie) et un Rebirth (formatage) avec éclats et arbre permanent.
  Le Clicker compte 38 améliorations en crédits (jusqu'au « Paradoxe du créateur », 200 Sp) ; le plafond des crédits est de 1e66 (1 000 Vg) et les nombres s'affichent jusqu'à Vg (js/limits.js, js/ui.js).
  Pare-feu : 3 cartes et 7 tours (déblocage en crédits). Survivor Arena : 3 personnages (déblocage en crédits), foudre, vol de vie, élites et boss.
  Pièces bleues (Snake, Tetris, longues parties de Survivor Arena, piratages complets) : Roulette et améliorations par paliers du Clicker. Crédits (Clicker, vagues du
  Pare-feu, Survivor Arena, Breach Protocol) : Blackjack et déblocage des tours. La progression est enregistrée dans le navigateur.
- Taper `edgerunner` active (ou désactive) le style Cyberpunk: Edgerunners, rouge et vert, sur tout le site.
- Taper `blackwall` active (ou désactive) le style Blackwall de Cyberpunk 2077 : noir de vide, rouge sang et ambre, avec une alerte NetWatch à l'activation. Dans l'arcade, la musique devient un morceau sombre et industriel de 24 mesures.
- Autres codes secrets, tous dans l'univers de Cyberpunk, chacun avec son style, une courte alerte et sa propre musique dans l'arcade :
  `arasaka` (noir, blanc clinique, vermillon, kanji en filigrane ; taiko et koto), `militech` (vert olive, HUD de visière ; marche militaire et cuivres),
  `afterlife` (turquoise et vert-jaune pâle comme dans le jeu, enseigne blanche ; piano électrique, basse chaude, saxophone), `braindance` (bleu glacé, point REC ; arpèges et souvenirs qui bégaient)
  et `dogtown` (orange poussière et sarcelle ; basse sale, claps, cordes pincées du désert).
  Dernier code, une private joke : `chatquipue` (un chat en pixel-art qui veille sur le fond, avec ses volutes de mauvaise odeur, et tout le reste en vert néon ; musique chiptune avec des miaulements). Retaper un code désactive le thème ; un seul thème est actif à la fois.

## Veille automatique

1. Le workflow GitHub Actions « Mise à jour de la veille » s'exécute toutes les 3 heures.
2. Il lance `scripts/fetch_veille.py`, qui lit les flux de `content/veille-sources.json`,
   nettoie les extraits (résumés) et écrit `content/veille.json`.
3. Si le fichier a changé, le workflow le commit : GitHub Pages republie le site.

- Donjon v14 : 11 nouveaux ennemis pour les étages élevés (Ombre, Tireur d'élite, Prêtre, Colosse, Ver fouisseur, Drones, Ardent, Nécromancien, Magnétar, Berserker + Squelettes invoqués), dangers au sol et nouveaux designs.
- Donjon v15 : salles retravaillées (couloirs, carrefour, gouffre à pont, galerie de piques, serpentin), butin/coffres/trappe toujours sur une case libre, panneau classe/arme repliable, pièces dans les stats, bouton plein écran (PC).
- Donjon v19 : grands boss tous les 10 étages (10 boss à 4 phases, ordre aléatoire par partie, arène dédiée de 32×20 chacun : Hydre des marais, Titan de forge, Architecte, Seigneur des tempêtes, Gardien du Néant, Reine des ruches, Chevalier maudit, Colosse sismique, Nécroroi, Overmind).
- Donjon v20 : 100 nouvelles améliorations (+8 objets légendaires), 16 ultimes (4 par classe, au choix, débloqués en âmes), passages secrets (mur fissuré) vers une salle d'offrandes puis le boss secret « L'Éclipse sans nom », 5 nouveaux décors (Jungle, Désert, Néon, Abysses, Citadelle infernale) avec props et ambiance.
- Donjon v21 : raretés (Commun, Rare, Épique, Légendaire, Mythique) avec tirage pondéré, 34 reliques qui ajoutent une arme secondaire (jusqu'à 3), 19 synergies entre armes (Choc thermique, Plasma, Plein arsenal…), 50 nouveaux ennemis (dessinés par forme), 5 Titans tous les 50 étages (8 phases, 12 attaques, 5 arènes) et le boss super secret Ultra Greed (statue d'avarice de la boutique).

## Sauvegarde de l'arcade

- Tout est dans `localStorage` (clé `mc-arcade-wallet-v1`), avec 6 copies automatiques (`mc-arcade-backups`, une toutes les 10 min au plus) et un export / import en fichier depuis le bouton « Sauvegardes » du hub.
- Un seul onglet écrit la sauvegarde à la fois (`mc-arcade-owner`) : les autres onglets passent en pause.
- `BUILD` (dans `easter-egg/js/wallet.js`) est la version du code. **À augmenter à chaque mise à jour qui ajoute des jeux, tours, cartes, etc.** Un onglet resté sur une ancienne version (cache) voit une sauvegarde plus récente et arrête d'écrire au lieu d'effacer ce qu'il ne connaît pas.
- Ce que le code ne reconnaît pas dans une sauvegarde (identifiants inconnus, jeux d'une autre version) est conservé tel quel.
