# Easter eggs du portfolio

> ⚠️ **Ce fichier divulgue tous les secrets du site.** Si tu veux les trouver toi-même, arrête-toi ici.

Le portfolio cache des codes secrets, des thèmes de couleur, des effets, une **salle d'arcade de 17 jeux** et un **jeu d'action caché**. Tout est fait en JavaScript natif et dessiné au canvas, sans bibliothèque ni image externe (sauf quelques icônes).

---

## Sommaire

1. [Comment ça marche](#1-comment-ça-marche)
2. [Liste des codes secrets](#2-liste-des-codes-secrets)
3. [Les thèmes de couleur](#3-les-thèmes-de-couleur)
4. [Les effets spéciaux](#4-les-effets-spéciaux)
5. [L'arcade (« awesome »)](#5-larcade--awesome-)
6. [Crypte Néon (« supersecret »)](#6-crypte-néon--supersecret-)
7. [Sauvegarde de la progression](#7-sauvegarde-de-la-progression)
8. [Fichiers et fonctionnement technique](#8-fichiers-et-fonctionnement-technique)
9. [Ajouter un easter egg](#9-ajouter-un-easter-egg)

---

## 1. Comment ça marche

Il suffit de **taper un code au clavier** n'importe où sur le site : sur la page d'accueil, sur la page Veille ou dans l'arcade. Il n'y a aucun champ à remplir, les lettres sont simplement « écoutées ».

- Rien ne s'affiche pendant qu'on tape : le code se déclenche dès que la dernière lettre est tapée.
- Majuscules et minuscules sont acceptées, quelle que soit la disposition du clavier (AZERTY, QWERTY…).
- Les codes ne réagissent pas quand on écrit dans un champ (par exemple la recherche de la page Veille).
- Il faut un clavier : sur téléphone, les codes ne marchent qu'avec un clavier branché. Le secret du code-barres (voir plus bas) marche au toucher.

## 2. Liste des codes secrets

| Code | Effet |
| --- | --- |
| `awesome` | Ouvre la salle d'arcade cachée (`easter-egg/arcade.html`) |
| `supersecret` | Ouvre la 2e page cachée : le jeu d'action **Crypte Néon** (`easter-egg/supersecret.html`) |
| `edgerunner` | Thème **Edgerunners** (rouge et vert) |
| `neon` | Thème **Neon** (rose électrique et cyan) |
| `blackwall` | Thème **Blackwall** (noir, rouge sang, ambre) avec alerte NetWatch |
| `arasaka` | Thème **Arasaka** (noir, blanc clinique, vermillon) |
| `militech` | Thème **Militech** (vert olive, HUD militaire) |
| `afterlife` | Thème **Afterlife** (turquoise et vert pâle, comme le bar du jeu) |
| `braindance` | Thème **Braindance** (bleu glacé, point « REC ») |
| `dogtown` | Thème **Dogtown** (orange poussière et sarcelle) |
| `chatquipue` | Thème **Chat qui pue** : une private joke, avec un chat en pixel-art |
| `cyberpsychosis` (ou `cyberpsycho`) | La page se disloque pendant quelques secondes |
| *5 clics sur le code-barres* | La fiche de profil change d'identité pendant 5 secondes |

## 3. Les thèmes de couleur

Chaque thème recolore **tout le site** (portfolio, page Veille et arcade) en remplaçant les variables de couleur CSS. Tous sont inspirés de l'univers de **Cyberpunk 2077**.

- **Retaper le même code désactive le thème** et on revient aux couleurs d'origine (jaune et cyan).
- **Un seul thème est actif à la fois** : taper un autre code remplace le précédent.
- Le thème choisi est **mémorisé** : il reste actif quand on change de page ou qu'on revient plus tard.
- La plupart des thèmes affichent une **courte alerte** à l'activation (par exemple « > netwatch : brèche détectée » pour Blackwall) et un message en bas de l'écran.
- **Dans l'arcade**, chaque thème a **sa propre musique** originale, générée en direct (sans fichier audio) :

| Thème | Ambiance | Musique dans l'arcade |
| --- | --- | --- |
| Edgerunners | Rouge et vert de l'anime *Cyberpunk: Edgerunners* | Lent et mélancolique (16 mesures) |
| Neon | Rose électrique, cyan glacé, violet profond, grille lumineuse | Rapide, brillant et dansant |
| Blackwall | Noir de vide, rouge sang, ambre | Sombre et industriel, avec une « brèche » où la musique se déchire |
| Arasaka | Noir, blanc clinique, vermillon, kanji en filigrane | Taiko et koto |
| Militech | Vert olive, HUD de visière | Marche militaire et cuivres |
| Afterlife | Turquoise, vert-jaune pâle, enseigne blanche | Piano électrique, basse chaude, saxophone |
| Braindance | Bleu glacé, point REC | Arpèges et souvenirs qui « bégaient » |
| Dogtown | Orange poussière, sarcelle | Basse sale, claps, cordes pincées du désert |
| Chat qui pue | Vert néon, un chat en pixel-art qui veille sur le fond avec ses volutes d'odeur | Chiptune avec des miaulements |

## 4. Les effets spéciaux

### Le code-barres de la fiche de profil

Sur la page d'accueil, il faut **cliquer (ou toucher) 5 fois de suite** sur le code-barres de la fiche de profil. Un glitch se produit et la fiche affiche une autre identité pendant 5 secondes, celle de **« Vanitas B. Blade », mercenaire edgerunner**, avec la phrase *« Who's Ready For Tomorrow »*. Puis un nouveau glitch remet tout en ordre.

### Cyberpsychose

Le code `cyberpsychosis` fait se disloquer la page de plus en plus pendant environ 6 secondes : décalages, séparation rouge/cyan, caractères qui se corrompent. Une alerte affiche la « part d'humanité » qui chute (« implants en surcharge », « contrôle moteur perdu »…), puis la synchronisation se rétablit.
**Échap** ou un clic arrête l'effet tout de suite. Si « réduire les animations » est activé dans le système, seule l'alerte s'affiche, sans secousses.

## 5. L'arcade (« awesome »)

Taper `awesome` ouvre **`easter-egg/arcade.html`** : une salle d'arcade de **17 jeux**, avec un portefeuille commun, des succès et une **musique synthwave générée en direct** (bouton « Musique », coupée au départ).

### Les monnaies

| Monnaie | Comment l'obtenir | À quoi elle sert |
| --- | --- | --- |
| **Crédits** | Mineur de données (clicker), Pare-feu, Survivor Arena, Breach Protocol, Démineur, jeux de mise… | Blackjack, Plinko, Crash, Machine à sous, Courses d'IA, déblocage des tours, cartes et héros du Pare-feu, personnages de Survivor Arena |
| **Pièces bleues** | Data Snake (pièce rare), Tetris (1 toutes les 6 lignes), longues parties de Survivor Arena, piratages complets, succès de la ferme, bestiaire de la pêche | Roulette, améliorations spéciales du Clicker, graine de fruit ancien, canne néon quantique |
| **Trophées ✦** | Chasse aux Titans uniquement | Forge de l'équipement du RPG |
| **Âmes** | Donjon | Améliorations permanentes, classes, armes et ultimes du Donjon |
| **Or** | Vallée Néon (ventes de la ferme) | Graines, outils, bâtiments et animaux de la ferme |
| **Perles** | Grand Bleu (vente des poissons) | Cannes, appâts, accessoires et lieux de pêche |

Le **gain passif du Clicker** continue de tourner pendant qu'on joue aux autres jeux. Les gros montants s'affichent en abrégé (K, M, B, T, Qa, Qi, Sx, Sp, Oc, No, Dc, Ud…) jusqu'à 1e66.
Plusieurs jeux donnent des récompenses **proportionnelles à ta fortune**, pour que les gains restent intéressants même quand on est très riche.

### Les 17 jeux

| # | Jeu | Type | En bref |
| --- | --- | --- | --- |
| 01 | **Data Snake** | Arcade | Le Snake classique. Une pièce bleue rare apparaît parfois. |
| 02 | **Blackjack** | Cartes | Battre le croupier sans dépasser 21. Mise en crédits, montant libre. |
| 03 | **Roulette** | Casino | Roulette européenne, mise en pièces bleues (numéro, couleur…). |
| 04 | **Mineur de données** | Clicker | 38 améliorations en crédits, 4 améliorations en pièces bleues, arbre de compétences (10 nœuds) et **Rebirth** (formatage) avec éclats et arbre permanent (7 nœuds). Source principale de crédits. |
| 05 | **Tetris** | Arcade | Une pièce bleue toutes les 6 lignes. |
| 06 | **Pare-feu** | Tower defense | 14 cartes, 24 tours et 5 héros à débloquer en crédits, améliorations propres à chaque tour (niveau 5 « ultime »), tours Beacon (boost) et Data Miner (revenu), frappe orbitale. |
| 07 | **Survivor Arena** | Action | Vagues d'ennemis, tir automatique, une amélioration à chaque niveau, 5 personnages, élites et boss. |
| 08 | **Breach Protocol** | Réflexion | Le mini-jeu de piratage de Cyberpunk 2077 : enchaîner les codes de la matrice avant la fin du temps. |
| 09 | **Chasse aux Titans** | RPG | Façon Monster Hunter, au tour par tour : 8 monstres, 3 familles d'armes, équipement forgé avec des trophées et des matériaux de monstres. |
| 10 | **Donjon** | Roguelite | Façon *The Binding of Isaac* : voir le détail plus bas. |
| 11 | **Plinko** | Casino | 24 cases, mise libre, 3 niveaux de risque, jusqu'à ×20 000 sur les bords. |
| 12 | **Vallée Néon** | Ferme | Façon *Stardew Valley* : voir le détail plus bas. |
| 13 | **Grand Bleu** | Pêche | Un vrai jeu de pêche avec bestiaire : voir le détail plus bas. |
| 14 | **Courses d'IA** | Paris | 6 robots, des cotes calculées sur des milliers de courses simulées. Pari sur la victoire ou le podium. |
| 15 | **Démineur** | Réflexion | 3 difficultés, records de temps, gains en crédits. |
| 16 | **Crash** | Casino | Un multiplicateur grimpe puis s'effondre : encaisser à temps (ou fixer un encaissement automatique). |
| 17 | **Machine à sous** | Casino | 5 rouleaux, 10 lignes, wilds et scatters. Trois ✸ déclenchent des tours gratuits à gains doublés. |

### Donjon (en détail)

Un roguelite en temps réel vu du dessus :

- Carte de salles générée à chaque partie (couloirs, carrefours, gouffres à pont, galeries de piques…), grandes salles avec caméra qui suit le joueur, passages secrets derrière des murs fissurés.
- **4 classes**, **34 armes** au choix au départ (et d'autres via des reliques), **16 attaques ultimes** (touche Espace), **100+ améliorations** de montée de niveau.
- Objets de raretés **Commun, Rare, Épique, Légendaire, Mythique** et **19 synergies** entre armes (Choc thermique, Plasma, Plein arsenal…).
- Des dizaines d'ennemis, de plus en plus variés avec les étages, et plusieurs décors (Jungle, Désert, Néon, Abysses, Citadelle infernale…).
- **Un grand boss tous les 10 étages** (10 boss à 4 phases, chacun avec son arène) et **un Titan tous les 50 étages** (8 phases).
- Un boss secret, **L'Éclipse sans nom**, et un boss super secret, **Ultra Greed**, à trouver…
- Un **hub** (royaume médiéval et royaume cyberpunk) avec des PNJ qui donnent des quêtes payées en pièces bleues.
- Les **âmes** gagnées servent aux améliorations permanentes. Option déplacement à la souris et bouton plein écran.

### Vallée Néon (en détail)

Une vraie ferme vue du dessus, façon *Stardew Valley* :

- **Le travail** : dégager le terrain (herbes, pierres, branches, souches, arbres), labourer, semer, arroser, récolter. Les récoltes ont une qualité (normal, argent, or, iridium).
- **Le temps** : une journée va de 6 h à 2 h du matin (environ 12 minutes) ; il y a 4 saisons de 14 jours et la météo change (soleil, pluie, orage, neige). On va se coucher dans la maison, sinon on s'évanouit à 2 h.
- **Les cultures** : 30 cultures, chacune avec sa ou ses saisons ; certaines repoussent après la récolte. Hors saison, elles fanent, sauf dans la serre.
- **L'économie** : la caisse d'expédition est payée pendant la nuit, et un panneau propose une demande par jour.
- **La progression** :
  - outils améliorables avec le minerai de la carrière (cuivre, fer, or) ;
  - poulailler et grange (poules, canards, vaches, chèvres, moutons) ;
  - 11 recettes d'artisanat (épouvantail, engrais, arroseurs, bocal, fût, presse, métier à tisser…) ;
  - 3 compétences (agriculture, foresterie, minage) et une serre à réparer.
- **L'ambiance** : la lumière change avec l'heure (aube dorée, coucher orangé, nuit bleue avec fenêtres éclairées), avec des papillons, des pétales ou des feuilles qui tombent et des lucioles l'été.
- **Les commandes** : ZQSD/WASD/flèches pour marcher, Espace ou E pour agir (maintenir pour charger la houe et l'arrosoir améliorés), 1 à 0 pour choisir un objet, R pour manger. À la souris ou au doigt, toucher une case voisine agit dessus, toucher plus loin y fait marcher le fermier.
- **Le lien avec l'arcade** : l'or expédié rapporte aussi des crédits, et 11 succès donnent des pièces bleues.

### Grand Bleu (en détail)

Un vrai jeu de pêche avec bestiaire :

- **Les lieux** : 6 lieux à débloquer, l'Étang des Saules, la Rivière Claire (avec sa cascade), le Lac de la Montagne, la Côte Néon (la ville et son phare), les Égouts de Night City et la Fosse Abyssale.
- **Les espèces** : 54, de *commun* à *mythique*, chacune avec ses lieux, ses moments de la journée (aube, jour, crépuscule, nuit) et sa météo (soleil, pluie, brouillard, orage). Une liste « Ça mord en ce moment » aide à savoir quoi chercher, et le bouton « Attendre 1 h » fait avancer le temps.
- **Une prise** : maintenir pour charger le lancer et relâcher au sommet, ferrer au « ! », puis le mini-jeu façon *Stardew Valley*, où il faut garder le poisson dans la barre verte jusqu'à remplir la jauge. Un coffre au trésor apparaît parfois, et une prise parfaite améliore la qualité.
- **Le bestiaire** : les espèces inconnues sont en silhouette ; chaque fiche donne la description, les conditions, la taille record et le nombre de prises.
- **La boutique** : 5 cannes, 3 appâts (dont l'appât magique, qui ignore l'heure et la météo), 5 accessoires et un totem de pluie. Le capitaine du port propose aussi 3 quêtes par jour.
- **Le lien avec l'arcade** : chaque nouvelle espèce rapporte des crédits ; les paliers du bestiaire, les poissons légendaires et certains coffres donnent des pièces bleues.

## 6. Crypte Néon (« supersecret »)

Taper `supersecret` ouvre **`easter-egg/supersecret.html`** : un **jeu d'action en 2D façon *Dead Cells*** (plateformes, roguelite), complètement séparé de l'arcade.

- **6 étages** générés aléatoirement, avec un boss intermédiaire à l'étage 3 et un boss final au 6e. Les niveaux sont de grandes cartes non linéaires, avec minimap, verticalité, passages secrets, portes et sols destructibles, pièges et téléporteurs de fin de niveau.
- **Les déplacements** : course, double saut, saut mural, escalade, roulade, descente à travers les plateformes.
- **Le combat** : 2 armes équipées (on change avec R), un arc à flèches limitées (récupérées sur les ennemis tués), un bouclier avec parade parfaite qui étourdit, et des compétences tactiques.
- **La progression permanente** : des **cellules** pour les améliorations (vitalité, brutalité, tactique, fioles de soin), des **runes** qui ouvrent de nouvelles zones (dont la rune d'araignée) et des **plans** d'armes trouvés en jeu puis débloqués.

**Commandes**

| Touche | Action |
| --- | --- |
| ZQSD / flèches | Courir |
| Z / ↑ / Espace | Sauter (double saut, saut mural) |
| ↓ / S | Traverser une plateforme |
| J | Attaquer / bloquer |
| K | Roulade |
| R | Changer d'arme |
| U / I | Compétences |
| F | Prendre, acheter, entrer |
| E | Se soigner |
| M | Couper le son |
| Échap | Pause |

Sur téléphone, des boutons tactiles s'affichent à l'écran. Le jeu a aussi un bouton plein écran. Sa progression est enregistrée à part, sous la clé `mc-supersecret-v1`.

## 7. Sauvegarde de la progression

Toute la progression de l'arcade est enregistrée **dans le navigateur** (`localStorage`, clé `mc-arcade-wallet-v1`). Il n'y a ni compte ni serveur. Si on change de navigateur ou qu'on efface ses données, on repart de zéro, sauf si on a exporté sa sauvegarde.

Les protections mises en place :

- **Copies automatiques** : une copie à l'ouverture de l'arcade puis toutes les 10 minutes. Les 6 dernières sont gardées (`mc-arcade-backups`). Elles se restaurent depuis le bouton **« Sauvegardes »**, en bas de l'accueil de l'arcade.
- **Export / import** : le même menu permet de **télécharger sa sauvegarde** dans un fichier `.json` et de la réimporter, même dans un autre navigateur.
- **Un seul onglet sauvegarde à la fois** (`mc-arcade-owner`) : si l'arcade est ouverte deux fois, l'onglet le plus ancien se met en pause avec un bouton « Jouer dans cet onglet ». Avant, le gain passif du Clicker d'un vieil onglet pouvait écraser la progression faite dans un autre.
- **Protection contre les vieilles versions** : la sauvegarde retient la version du code qui l'a écrite (`BUILD` dans `js/wallet.js`). Un onglet resté sur une ancienne version (souvent à cause du cache après une mise à jour) arrête de sauvegarder et demande de recharger.
- **Rien n'est jeté** : ce que le code ne reconnaît pas dans une sauvegarde (une tour, une carte ou un jeu d'une autre version) est gardé tel quel.
- **« Tout remettre à zéro »** fait d'abord une copie, ce qui permet de revenir en arrière.

## 8. Fichiers et fonctionnement technique

```
easter-egg/
├── arcade.html            page de l'arcade (code « awesome »)
├── supersecret.html       page de Crypte Néon (code « supersecret »)
├── css/arcade.css         style de l'arcade
├── css/supersecret.css    style de Crypte Néon
└── js/
    ├── secret-code.js     écoute le clavier et déclenche tous les codes (thèmes, pages, effets)
    ├── barcode-egg.js     les 5 clics sur le code-barres
    ├── cyberpsychosis.js  l'effet « cyberpsychosis »
    ├── arcade.js          navigation entre les jeux, portefeuille affiché, gain passif du Clicker, sauvegardes
    ├── wallet.js          portefeuille et progression communs à tous les jeux (sauvegarde, onglets, copies)
    ├── limits.js          plafond des crédits
    ├── rewards.js         récompenses proportionnelles à la fortune
    ├── ui.js              outils partagés (création d'éléments, format des nombres…)
    ├── music.js, music-themes.js   musique synthwave générée en direct (Web Audio), un morceau par thème
    ├── <jeu>.js           logique de chaque jeu (règles, calculs), sans affichage
    ├── ui-<jeu>.js        affichage et commandes de chaque jeu
    ├── ranch-art.js, fishing-art.js, td-art.js, td-fx.js   dessins de la ferme, de la pêche et du tower defense
    ├── dungeon.js, enemies2.js, items.js, weapons.js, synergy.js, hub.js   contenu du Donjon
    └── supersecret.js     tout Crypte Néon (un seul fichier, canvas)
```

Côté site, `js/theme.js` applique le thème (une classe sur la balise `<html>`, mémorisée dans `localStorage` sous la clé `mc-theme`). Les feuilles `css/<thème>.css` à la racine contiennent les couleurs de chaque thème. Un petit script dans le `<head>` de chaque page remet le thème avant l'affichage, pour éviter un flash de couleurs au chargement.

Quelques principes suivis dans le code :

- **La logique est séparée de l'affichage** : les fichiers `<jeu>.js` ne touchent jamais à la page, ce qui permet de les tester seuls.
- **Pas de dépendance** : tout est en modules JavaScript natifs. Les graphismes sont dessinés au canvas et la musique est générée avec Web Audio.
- **Les sauvegardes sont vérifiées** au chargement : une valeur absurde ou modifiée à la main est corrigée.
- **L'accessibilité est prise en compte** : réglage « réduire les animations » respecté, navigation au clavier, textes pour les lecteurs d'écran.

## 9. Ajouter un easter egg

- **Un nouveau thème** :
  1. Créer `css/<nom>.css` en s'inspirant de `css/edgerunners.css` (tout est limité à `html.<nom>`).
  2. Ajouter le lien dans le `<head>` des pages.
  3. Ajouter le nom dans la liste `THEMES` de `js/theme.js` et dans le petit script du `<head>`.
  4. Ajouter une entrée dans `THEME_CODES` de `easter-egg/js/secret-code.js`, avec son alerte, et éventuellement un morceau dans `music-themes.js`.
- **Un nouveau jeu dans l'arcade** :
  1. Créer `<jeu>.js` pour la logique et `ui-<jeu>.js` pour l'affichage (qui renvoie `activate()` / `deactivate()`).
  2. Ajouter une carte et une section dans `arcade.html`, puis l'enregistrer dans `arcade.js`.
  3. Si le jeu a une progression, l'ajouter dans `freshData()` et `sanitize()` de `wallet.js`.
- **À chaque mise à jour qui ajoute du contenu** : augmenter `BUILD` dans `easter-egg/js/wallet.js`, puis recharger avec **Ctrl + F5** après le push.
