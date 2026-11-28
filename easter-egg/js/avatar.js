// js/avatar.js — logique pure de l'onglet « Personnage » : catalogue de personnalisation, prix, exploits, sauvegarde.
// (aucun accès au DOM ; le dessin est dans avatar-art.js, l'interface dans ui-avatar.js)
//
// Chaque objet appartient à une catégorie (= un emplacement de l'avatar). Il est gratuit, payé dans une des
// 7 monnaies de l'arcade, ou débloqué par un exploit réalisé dans un des jeux.

/* =====================================================================
   Monnaies
===================================================================== */

export const CURRENCIES = {
  credits:  { name: "crédits",        short: "¤", color: "#fcee0a" },
  blue:     { name: "pièces bleues",  short: "●", color: "#5aa9ff" },
  trophies: { name: "trophées",       short: "✦", color: "#c38bff" },
  souls:    { name: "âmes",           short: "☽", color: "#7dffb0" },
  gold:     { name: "or",             short: "◆", color: "#ffb347" },
  pearls:   { name: "perles",         short: "○", color: "#9be7ff" },
  cores:    { name: "noyaux",         short: "◈", color: "#b06bff" },
  shards:   { name: "éclats",         short: "❖", color: "#ff7ad9" }
};
export const CURRENCY_IDS = Object.keys(CURRENCIES);

// Solde d'une monnaie dans la sauvegarde de l'arcade
export function balanceOf(data, cur) {
  switch (cur) {
    case "credits": return data.credits || 0;
    case "blue": return data.blue || 0;
    case "trophies": return data.trophies || 0;
    case "souls": return data.dungeon?.souls || 0;
    case "gold": return data.ranch?.gold || 0;
    case "pearls": return data.angler?.pearls || 0;
    case "cores": return data.sv?.cores || 0;
    case "shards": return data.deck?.shards || 0;
    default: return 0;
  }
}

/* =====================================================================
   Catégories (dans l'ordre d'affichage)
===================================================================== */

export const CATS = [
  { id: "bg",      name: "Fond",            icon: "▦" },
  { id: "frame",   name: "Cadre",           icon: "▢" },
  { id: "aura",    name: "Effet",           icon: "✧" },
  { id: "body",    name: "Silhouette",      icon: "♙" },
  { id: "skin",    name: "Peau",            icon: "◐" },
  { id: "face",    name: "Visage",          icon: "◯" },
  { id: "eyes",    name: "Yeux",            icon: "◉" },
  { id: "brows",   name: "Sourcils",        icon: "⌒" },
  { id: "mouth",   name: "Expression",      icon: "◡" },
  { id: "beard",   name: "Pilosité",        icon: "≋" },
  { id: "marks",   name: "Tatouages",       icon: "✎" },
  { id: "cyber",   name: "Cyberware",       icon: "⌬" },
  { id: "hairFront", name: "Cheveux avant",  icon: "♒" },
  { id: "hairBack",  name: "Cheveux arrière", icon: "∿" },
  { id: "top",     name: "Haut",            icon: "▲" },
  { id: "bottom",  name: "Bas",             icon: "▼" },
  { id: "shoes",   name: "Chaussures",      icon: "◣" },
  { id: "neck",    name: "Cou",             icon: "⊂" },
  { id: "hat",     name: "Couvre-chef",     icon: "⌂" },
  { id: "glasses", name: "Lunettes, masque", icon: "◎" },
  { id: "ears",    name: "Boucles",         icon: "∘" },
  { id: "back",    name: "Dos (ailes, cape)", icon: "♆" },
  { id: "weapon",  name: "Arme",            icon: "⚔" },
  { id: "pet",     name: "Familier",        icon: "♞" },
  { id: "title",   name: "Titre",           icon: "✪" }
];
export const CAT_IDS = CATS.map((c) => c.id);

// Emplacements de couleur, choisis dans les palettes débloquées
export const COLOR_SLOTS = [
  { id: "hairColor",   name: "Cheveux et pilosité" },
  { id: "eyeColor",    name: "Yeux" },
  { id: "topColor",    name: "Haut" },
  { id: "bottomColor", name: "Bas et chaussures" },
  { id: "accentColor", name: "Néon (accents, cyberware, effets)" }
];

/* =====================================================================
   Exploits : conditions lues dans la sauvegarde de l'arcade
===================================================================== */

const REQS = {
  snake50:     { text: "Faire 50 points au Data Snake",                    test: (d) => d.bestSnake >= 50 },
  tetris20k:   { text: "Faire 20 000 points au Tetris",                    test: (d) => d.bestTetris >= 20000 },
  wave30:      { text: "Tenir 30 vagues au Pare-feu",                      test: (d) => d.bestWave >= 30 },
  surv10:      { text: "Survivre 10 minutes à Survivor Arena",             test: (d) => d.bestSurvivor >= 600 },
  blackwall:   { text: "Vaincre le Blackwall (Survivor Arena)",           test: (d) => (d.sv?.stats?.blackwall || 0) >= 1 },
  fusion:      { text: "Réaliser une fusion d'armes (Survivor Arena)",     test: (d) => (d.sv?.stats?.fusions || 0) >= 1 },
  dungeon20:   { text: "Atteindre l'étage 20 du Donjon",                   test: (d) => d.bestDungeon >= 20 },
  dungeon50:   { text: "Atteindre l'étage 50 du Donjon",                   test: (d) => d.bestDungeon >= 50 },
  champion:    { text: "Devenir Champion (Chasse aux Titans)",             test: (d) => !!d.hunt?.champion },
  badges4:     { text: "Obtenir 4 badges (Chasse aux Titans)",             test: (d) => (d.hunt?.badges || 0) >= 4 },
  breach:      { text: "Gagner 1 000 crédits en un Breach Protocol",       test: (d) => d.bestBreach >= 1000 },
  rebirth:     { text: "Formater le Mineur de données une fois",           test: (d) => (d.ck?.runs || 0) >= 1 },
  rebirth10:   { text: "Formater le Mineur de données 10 fois",            test: (d) => (d.ck?.runs || 0) >= 10 },
  cyberera:    { text: "Atteindre l'ère Cyberpunk (Cité des Âges)",        test: (d) => (d.city?.era || 0) >= 7 },
  fish30:      { text: "Pêcher 30 espèces (Grand Bleu)",                   test: (d) => Object.keys(d.angler?.dex || {}).length >= 30 },
  farm100:     { text: "Passer 100 jours à la ferme (Vallée Néon)",        test: (d) => (d.ranch?.stats?.days || 0) >= 100 },
  mineshard:   { text: "Gagner une partie de Démineur en Difficile",       test: (d) => (d.mines?.hard || 0) > 0 },
  heat3:       { text: "Débloquer la Surtension 3 (Survivor Arena)",       test: (d) => (d.sv?.heat || 0) >= 3 },
  deckwin:     { text: "Gagner une partie de Grimoire Néon",               test: (d) => (d.deck?.stats?.wins || 0) >= 1 },
  deckasc5:    { text: "Débloquer l'Ascension 5 (Grimoire Néon)",          test: (d) => Object.values(d.deck?.asc || {}).some((n) => n >= 5) }
};
export const reqInfo = (id) => REQS[id];

/* =====================================================================
   Catalogue
   p : prix "monnaie:montant" (absent = gratuit) · req : exploit requis
===================================================================== */

const RAW = {
  bg: [
    ["void", "Grille sombre"], ["alley", "Ruelle néon", "credits:2e3"], ["skyline", "Skyline de Night City", "blue:6"],
    ["rain", "Pluie acide", "pearls:400"], ["matrix", "Pluie de données", "credits:5e7"], ["sunset", "Coucher synthwave", "gold:8000"],
    ["arasaka", "Tour Arasaka", "credits:1e12"], ["badlands", "Badlands", "souls:150"], ["space", "Station orbitale", "cores:120"],
    ["sakura", "Jardin de sakuras", "trophies:300"], ["blackwall", "Au-delà du Blackwall", null, "blackwall"], ["afterlife", "Bar l'Afterlife", "blue:25"],
    ["heaven", "Paradis céleste", "trophies:800"], ["temple", "Temple des dieux", "souls:700"], ["forest", "Forêt enchantée", "gold:22000"],
    ["ocean", "Abysses", "pearls:5000"], ["circuit", "Carte mère", "credits:1e18"], ["throne", "Salle du trône", null, "champion"]
  ],
  frame: [
    ["none", "Aucun"], ["simple", "Néon simple", "credits:500"], ["chamfer", "Biseauté", "blue:3"], ["gold", "Doré", "gold:20000"],
    ["glitch", "Corrompu", "cores:250"], ["thorns", "Ronces", "souls:400"], ["holo", "Holographique", "credits:1e24"], ["legend", "Légende", null, "dungeon50"],
    ["pixel", "Pixel", "credits:1e6"], ["shell", "Coquillages", "pearls:1500"]
  ],
  aura: [
    ["none", "Aucun"], ["glow", "Lueur néon", "credits:1e5"], ["glitch", "Glitch", "blue:15"], ["rain", "Pluie", "pearls:800"],
    ["sparks", "Étincelles", "credits:1e9"], ["fire", "Flammes", "souls:300"], ["binary", "Code binaire", "cores:200"], ["sakura", "Pétales", "trophies:500"],
    ["lightning", "Éclairs", "credits:1e15"], ["stars", "Étoiles", "gold:50000"], ["halo", "Aura divine", "credits:1e30"], ["void", "Néant", null, "blackwall"],
    ["bubbles", "Bulles", "pearls:2500"], ["leaves", "Feuilles d'automne", "gold:15000"]
  ],
  body: [["a", "Silhouette fine"], ["b", "Carrure"]],
  skin: [
    ["s1", "Porcelaine"], ["s2", "Clair"], ["s3", "Rosé"], ["s4", "Doré"], ["s5", "Mat"], ["s6", "Olive"], ["s7", "Brun"], ["s8", "Ébène"],
    ["pale", "Pâle cadavérique", "souls:120"], ["chrome", "Chromé intégral", "credits:1e15"], ["holo", "Hologramme", "cores:500"],
    ["synth", "Peau synthétique bleue", "blue:30"], ["green", "Mutant", "gold:30000"], ["red", "Démon", "souls:600"], ["gold", "Statue d'or", "credits:1e33"]
  ],
  face: [["oval", "Ovale"], ["long", "Oblong", "credits:1e4"], ["square", "Carré"], ["rect", "Rectangle", "credits:1e4"], ["round", "Rond"], ["triangle", "Triangle", "credits:5e4"], ["sharp", "Triangle inversé (cœur)"], ["diamond", "Diamant", "blue:3"]],
  eyes: [
    ["normal", "Normaux"], ["almond", "En amande"], ["round", "Ronds"], ["sleepy", "Endormis"], ["sharp", "Perçants", "credits:5e3"],
    ["anime", "Anime", "blue:4"], ["cat", "Félins", "pearls:600"], ["closed", "Fermés"], ["wink", "Clin d'œil", "credits:1e8"],
    ["glow", "Lumineux (sans pupille)", "cores:100"], ["spiral", "Hypnotiques", "trophies:400"], ["hearts", "Cœurs", "gold:12000"]
  ],
  brows: [["normal", "Normaux"], ["thick", "Épais"], ["thin", "Fins"], ["angry", "Froncés"], ["raised", "Étonnés"], ["none", "Aucun"], ["slit", "Rasure", "credits:2e5"]],
  mouth: [
    ["neutral", "Neutre"], ["smile", "Sourire"], ["grin", "Grand sourire"], ["smirk", "Rictus"], ["frown", "Moue"], ["open", "Surpris"],
    ["tongue", "Langue tirée", "blue:3"], ["fangs", "Crocs", "souls:200"], ["teeth", "Dents serrées", "credits:1e7"], ["cyber", "Grille de chrome", "cores:150"],
    ["lipstick", "Rouge à lèvres", "pearls:300"]
  ],
  beard: [
    ["none", "Aucune"], ["stubble", "Barbe de 3 jours"], ["goatee", "Bouc", "credits:3e3"], ["mustache", "Moustache", "credits:3e3"],
    ["full", "Barbe fournie", "gold:5000"], ["neon", "Barbe néon", "blue:12"], ["braided", "Barbe tressée", "souls:250"]
  ],
  marks: [
    ["none", "Aucun"], ["scar", "Cicatrice", "souls:60"], ["tribal", "Tatouage tribal néon", "blue:8"], ["barcode", "Code-barres", "credits:1e6"],
    ["tears", "Larmes tatouées", "trophies:150"], ["circuit", "Circuits", "cores:80"], ["freckles", "Taches de rousseur"], ["blush", "Joues rosées"],
    ["warpaint", "Peinture de guerre", "souls:350"], ["sakura", "Fleur de cerisier", "trophies:350"], ["moon", "Croissant de lune", "pearls:900"],
    ["dragon", "Dragon", "credits:1e21"], ["qr", "QR code", "credits:1e10"], ["clown", "Maquillage de clown", "gold:9000"]
  ],
  cyber: [
    ["none", "Aucun"], ["kiroshi", "Optiques Kiroshi", "credits:1e4"], ["jaw", "Plaque de mâchoire", "credits:1e8"], ["temple", "Implant de tempe", "blue:5"],
    ["antenna", "Antenne", "gold:6000"], ["halfchrome", "Demi-visage chromé", "cores:300"], ["port", "Port neural", "credits:1e3"],
    ["cheek", "LED de pommette", "pearls:700"], ["mantis", "Visière Mantis", "souls:500"], ["eyepatch", "Œil cybernétique", "trophies:250"],
    ["sandevistan", "Sandevistan (dos)", "credits:1e20"], ["skull", "Crâne apparent", "credits:1e27"], ["arasaka", "Implants Arasaka", null, "cyberera"]
  ],
  // Cheveux avant : frange, mèches sur le visage, dessus de la tête
  hairFront: [
    ["short", "Frange courte"], ["buzz", "Rasés"], ["bald", "Chauve"], ["undercut", "Undercut"], ["bob", "Frange droite"], ["long", "Frange longue"],
    ["ponytail", "Front dégagé"], ["curtain", "Raie au milieu"], ["hime", "Frange princesse (hime)", "credits:5e3"],
    ["bun", "Chignon", "credits:2e3"], ["mohawk", "Crête", "blue:5"], ["spiky", "Hérissés", "credits:1e5"],
    ["afro", "Afro", "gold:4000"], ["braids", "Frange tressée", "pearls:500"], ["sideshave", "Rasés d'un côté", "credits:1e7"], ["emo", "Mèche emo", "souls:100"],
    ["dreads", "Dreadlocks", "trophies:200"], ["twintails", "Frange en pointes", "blue:10"], ["samurai", "Chignon de samouraï", "souls:450"], ["wild", "Crinière sauvage", "credits:1e13"]
  ],
  // Cheveux arrière : longueur et coiffure derrière la tête
  hairBack: [
    ["none", "Aucun"], ["nape", "Nuque courte"], ["bob", "Carré"], ["long", "Longs"], ["ponytail", "Queue de cheval"],
    ["emo", "Mi-longs", "souls:100"], ["wavy", "Longs ondulés", "credits:5e4"], ["hime", "Très longs (hime)", "credits:5e5"],
    ["twintails", "Couettes", "blue:10"], ["braids", "Tresses", "pearls:500"], ["sideshave", "Queue sur le côté", "credits:1e7"],
    ["dreads", "Dreadlocks", "trophies:200"], ["afro", "Afro", "gold:4000"], ["wild", "Crinière sauvage", "credits:1e13"]
  ],
  top: [
    ["tee", "T-shirt"], ["hoodie", "Sweat à capuche"], ["tank", "Débardeur"], ["jacket", "Veste en cuir", "credits:5e3"],
    ["samurai", "Veste Samurai", "blue:12"], ["trench", "Trench-coat", "credits:1e9"], ["netrunner", "Combinaison netrunner", "cores:180"],
    ["armor", "Armure Militech", "credits:1e14"], ["kimono", "Kimono", "trophies:350"], ["suit", "Costume Arasaka", "credits:1e19"],
    ["bomber", "Blouson aviateur", "gold:10000"], ["nomad", "Tenue de nomade", "souls:220"], ["cape", "Cape de mage", "souls:700"],
    ["diver", "Combinaison de plongée", "pearls:2000"], ["farmer", "Salopette", "gold:3000"], ["king", "Manteau royal", null, "champion"],
    ["survivor", "Tenue de survivant", null, "surv10"], ["edgerunner", "Veste d'Edgerunner", "credits:1e36"],
    ["toga", "Toge divine", "trophies:700"], ["paladin", "Armure de paladin", "souls:800"], ["priest", "Robe de prêtresse", "pearls:2500"],
    ["school", "Uniforme scolaire", "blue:6"], ["witch", "Robe de sorcière", "souls:450"]
  ],
  bottom: [
    ["jeans", "Jean"], ["shorts", "Short"], ["skirt", "Jupe"], ["cargo", "Pantalon cargo", "credits:5e3"], ["sweat", "Jogging"],
    ["leggings", "Leggings néon", "blue:6"], ["pleated", "Jupe plissée", "pearls:500"], ["hakama", "Hakama", "trophies:300"],
    ["tights", "Collant de netrunner", "cores:120"], ["greaves", "Jambières d'armure", "credits:1e13"], ["longrobe", "Robe longue", "souls:300"],
    ["divine", "Voile divin", null, "champion"]
  ],
  shoes: [
    ["sneakers", "Baskets"], ["boots", "Bottes"], ["combat", "Rangers", "credits:2e4"], ["cyber", "Bottes cyber lumineuses", "cores:150"],
    ["geta", "Geta", "trophies:150"], ["sandals", "Sandales", "gold:2500"], ["heels", "Talons", "pearls:700"], ["armored", "Solerets d'armure", "credits:1e12"],
    ["winged", "Sandales ailées", "souls:600"], ["barefoot", "Pieds nus"]
  ],
  neck: [
    ["none", "Rien"], ["chain", "Chaîne", "credits:1e4"], ["choker", "Ras-du-cou", "blue:3"], ["scarf", "Écharpe", "gold:2500"],
    ["neon", "Col lumineux", "cores:90"], ["pendant", "Pendentif", "pearls:1200"], ["dogtag", "Plaques militaires", "credits:1e11"], ["fur", "Col en fourrure", "souls:280"]
  ],
  hat: [
    ["none", "Rien"], ["cap", "Casquette", "credits:1e3"], ["beanie", "Bonnet", "gold:2000"], ["bandana", "Bandeau", "blue:2"],
    ["cowboy", "Chapeau de cowboy", "gold:18000"], ["helmet", "Casque de moto", "credits:1e10"], ["crown", "Couronne", "credits:1e25"],
    ["catears", "Oreilles de chat néon", "blue:20"], ["halo", "Auréole", "trophies:600"], ["horns", "Cornes", "souls:350"],
    ["netrunner", "Casque de netrunner", "cores:350"], ["straw", "Chapeau de paille", "gold:1500"], ["wizard", "Chapeau de sorcier", "souls:900"],
    ["hood", "Capuche", "credits:1e6"], ["blackcrown", "Couronne du Blackwall", null, "blackwall"], ["fishhat", "Bob de pêcheur", "pearls:400"]
  ],
  glasses: [
    ["none", "Rien"], ["round", "Lunettes rondes", "credits:2e3"], ["aviator", "Aviateur", "gold:4000"], ["visor", "Visière néon", "blue:8"],
    ["shades", "Lunettes noires", "credits:1e5"], ["mask", "Masque respiratoire", "souls:150"], ["oni", "Masque oni", "souls:500"],
    ["bandana", "Bandana", "credits:1e7"], ["monocle", "Monocle", "pearls:800"], ["goggles", "Lunettes de soudeur", "gold:7000"],
    ["vr", "Casque VR", "credits:1e16"], ["kitsune", "Masque de renard", "trophies:450"], ["hacker", "Lunettes de hacker", null, "breach"],
    ["skull", "Masque crâne", "credits:1e29"], ["scuba", "Masque de plongée", null, "fish30"]
  ],
  ears: [
    ["none", "Rien"], ["stud", "Clous", "credits:1e3"], ["hoop", "Créoles", "gold:2000"], ["cross", "Croix", "souls:80"],
    ["neon", "Pendants néon", "blue:4"], ["cyber", "Écouteurs cyber", "cores:60"], ["feather", "Plume", "trophies:120"], ["pearl", "Perles", "pearls:600"]
  ],
  back: [
    ["none", "Rien"], ["angel", "Ailes d'ange", "trophies:1200"], ["demon", "Ailes de démon", "souls:900"], ["mech", "Ailes mécaniques", "credits:1e22"],
    ["cape", "Cape", "gold:6000"], ["butterfly", "Ailes de papillon", "pearls:3500"], ["sheath", "Katana dans le dos", "credits:1e9"],
    ["jetpack", "Jetpack", "cores:400"], ["ring", "Anneau divin", null, "dungeon50"], ["fairy", "Ailes de fée", "blue:30"],
    ["dragon", "Ailes de dragon", null, "champion"], ["data", "Ailes de données", null, "blackwall"]
  ],
  weapon: [
    ["none", "Rien"], ["katana", "Katana", "credits:1e6"], ["pistol", "Pistolet", "credits:1e4"], ["sword", "Épée", "gold:8000"],
    ["staff", "Bâton de mage", "souls:250"], ["mantis", "Lames Mantis", "cores:300"], ["bow", "Arc", "trophies:400"], ["scythe", "Faux", "souls:1200"],
    ["rifle", "Fusil d'assaut", "credits:1e15"], ["shield", "Bouclier", "gold:12000"], ["tome", "Grimoire", "pearls:1800"],
    ["energy", "Épée d'énergie", "blue:40"], ["wand", "Baguette magique", "trophies:250"], ["deck", "Cyberdeck", null, "breach"],
    ["godblade", "Lame des dieux", "credits:1e35"]
  ],
  pet: [
    ["none", "Aucun"], ["cat", "Chat noir", "gold:5000"], ["drone", "Drone compagnon", "credits:1e7"], ["slime", "Slime", "blue:8"],
    ["fox", "Renard spirituel", "trophies:600"], ["dragon", "Bébé dragon", "souls:1500"], ["ghost", "Petit fantôme", "souls:200"],
    ["phoenix", "Phénix", "credits:1e27"], ["owl", "Chouette", "pearls:1500"], ["fairy", "Fée", "blue:20"], ["robot", "Robot", "cores:250"],
    ["fish", "Poisson-lune", null, "fish30"], ["chick", "Poussin", null, "farm100"]
  ],
  title: [
    ["none", "Aucun"], ["choom", "Choom"], ["merc", "Mercenaire", "credits:1e4"], ["netrunner", "Netrunner", "blue:5"],
    ["edgerunner", "Edgerunner", "credits:1e12"], ["legend", "Légende de Night City", "credits:1e30"], ["gambler", "Flambeur", "credits:1e8"],
    ["fisher", "Maître pêcheur", null, "fish30"], ["farmer", "Fermier de l'année", null, "farm100"], ["hunter", "Dresseur de Titans", null, "badges4"],
    ["champion", "Champion des Titans", null, "champion"], ["delver", "Explorateur des profondeurs", null, "dungeon20"],
    ["abyss", "Seigneur de l'abîme", null, "dungeon50"], ["survivor", "Survivant", null, "surv10"], ["slayer", "Tueur de Blackwall", null, "blackwall"],
    ["fuser", "Alchimiste des armes", null, "fusion"], ["miner", "Mineur de données", null, "rebirth"], ["tycoon", "Magnat du réseau", null, "rebirth10"],
    ["architect", "Architecte du futur", null, "cyberera"], ["snake", "Charmeur de serpents", null, "snake50"], ["tetris", "Maître des blocs", null, "tetris20k"],
    ["firewall", "Pare-feu humain", null, "wave30"], ["deminer", "Démineur d'élite", null, "mineshard"], ["overheat", "Surtension", null, "heat3"],
    ["grimoire", "Lecteur de grimoires", "shards:150"], ["archmagus", "Archimage du Réseau", "shards:600"], ["godslayer", "Tueur de dieux", null, "deckwin"], ["ascended", "Ascensionné", null, "deckasc5"],
    ["ghost", "Fantôme du réseau", "cores:400"], ["ronin", "Rōnin", "souls:500"], ["mermaid", "Sirène", "pearls:3000"], ["baron", "Baron de la terre", "gold:40000"],
    ["chosen", "L'Élu", "trophies:900"], ["rich", "Ultra-riche", "credits:1e39"]
  ]
};

// Objets indexés : ITEMS["hair:long"] = { id, cat, key, name, cur, price, req }
export const ITEMS = {};
for (const [cat, list] of Object.entries(RAW)) {
  for (const [key, name, p, req] of list) {
    const [cur, n] = p ? p.split(":") : [null, 0];
    ITEMS[`${cat}:${key}`] = { id: `${cat}:${key}`, cat, key, name, cur, price: Number(n) || 0, req: req || null };
  }
}
export const itemsOf = (cat) => Object.values(ITEMS).filter((it) => it.cat === cat);
export const isFree = (it) => !it.cur && !it.req;

/* =====================================================================
   Couleurs, débloquées par palettes
   Valeurs spéciales : "holo" (arc-en-ciel animé), "chrome" (dégradé métallique), "void" (noir à reflets violets)
===================================================================== */

export const PALETTES = [
  { id: "base",  name: "Basique",   cur: null,       price: 0,    colors: ["#1a1a1a", "#4a3020", "#8a5a2b", "#d8b26e", "#f2f2f2", "#9a9aa8", "#b33a3a", "#2e5aa8", "#3d8a4a", "#e07a2e"] },
  { id: "neon",  name: "Néon",      cur: "blue",     price: 15,   colors: ["#ff2a6d", "#00f0ff", "#fcee0a", "#3dff8f", "#b06bff", "#ff8a1f"] },
  { id: "pastel", name: "Pastel",   cur: "pearls",   price: 1000, colors: ["#ffb3c7", "#b3e5ff", "#fff3b0", "#c8ffd4", "#dcc8ff", "#ffd8b0"] },
  { id: "metal", name: "Métaux",    cur: "gold",     price: 25000, colors: ["#d4af37", "#c0c0c0", "#b87333", "#e5e4e2", "chrome"] },
  { id: "dark",  name: "Ténèbres",  cur: "souls",    price: 400,  colors: ["#3a0010", "#0a0a2a", "#1f0030", "#002a1a", "void"] },
  { id: "holo",  name: "Holographique", cur: "cores", price: 300, colors: ["holo", "#7df9ff", "#ff6ad5"] },
  { id: "royal", name: "Royale",    cur: "credits",  price: 1e21, colors: ["#5a0a8a", "#0a3a8a", "#8a0a2a", "#ffd700"] }
];
export const PALETTE_IDS = PALETTES.map((p) => p.id);
export const paletteOf = (color) => PALETTES.find((p) => p.colors.includes(color));

/* =====================================================================
   Sauvegarde (wallet.data.avatar)
===================================================================== */

export const DEFAULT_LOOK = {
  bg: "void", frame: "none", aura: "none", skin: "s3", face: "oval", eyes: "normal", brows: "normal", mouth: "smile",
  beard: "none", marks: "none", cyber: "none", hairFront: "short", hairBack: "nape", top: "hoodie", neck: "none", hat: "none", glasses: "none", ears: "none", title: "choom",
  body: "a", bottom: "jeans", shoes: "sneakers", back: "none", weapon: "none", pet: "none",
  hairColor: "#4a3020", eyeColor: "#2e5aa8", topColor: "#2e5aa8", bottomColor: "#1a1a1a", accentColor: "#ff2a6d"
};
const COLOR_KEYS = COLOR_SLOTS.map((c) => c.id);

export function freshAvatar() {
  return { name: "Choom", look: { ...DEFAULT_LOOK }, owned: [], palettes: ["base"], outfits: [null, null, null] };
}

const validColor = (c) => typeof c === "string" && PALETTES.some((p) => p.colors.includes(c));

// Anciennes sauvegardes : une seule « coiffure » → cheveux avant + cheveux arrière équivalents
const OLD_HAIR_BACK = { long: "long", bob: "bob", wild: "wild", afro: "afro", ponytail: "ponytail", twintails: "twintails", braids: "braids", dreads: "dreads", sideshave: "sideshave", emo: "emo" };
function migrateHair(raw) {
  if (typeof raw.hair !== "string" || raw.hairFront !== undefined) return raw;
  return { ...raw, hairFront: raw.hair, hairBack: OLD_HAIR_BACK[raw.hair] || "none" };
}

function sanitizeLook(raw, fallback = DEFAULT_LOOK) {
  const look = { ...fallback };
  if (!raw || typeof raw !== "object") return look;
  raw = migrateHair(raw);
  for (const cat of CAT_IDS) if (typeof raw[cat] === "string" && ITEMS[`${cat}:${raw[cat]}`]) look[cat] = raw[cat];
  for (const k of COLOR_KEYS) if (validColor(raw[k])) look[k] = raw[k];
  return look;
}

export function sanitizeAvatar(raw) {
  const a = freshAvatar();
  if (!raw || typeof raw !== "object") return a;
  if (typeof raw.name === "string") a.name = cleanName(raw.name) || a.name;
  if (Array.isArray(raw.owned)) {
    // une coiffure achetée avant la séparation donne les cheveux avant et arrière correspondants
    const ids = raw.owned.flatMap((id) => {
      if (typeof id !== "string" || !id.startsWith("hair:")) return [id];
      const key = id.slice(5);
      return [`hairFront:${key}`, ...(OLD_HAIR_BACK[key] ? [`hairBack:${OLD_HAIR_BACK[key]}`] : [])];
    });
    a.owned = [...new Set(ids.filter((id) => typeof id === "string" && ITEMS[id]))];
  }
  if (Array.isArray(raw.palettes)) for (const id of raw.palettes) if (PALETTE_IDS.includes(id) && !a.palettes.includes(id)) a.palettes.push(id);
  a.look = sanitizeLook(raw.look);
  if (Array.isArray(raw.outfits)) a.outfits = [0, 1, 2].map((i) => (raw.outfits[i] && typeof raw.outfits[i] === "object" ? sanitizeLook(raw.outfits[i]) : null));
  return a;
}

// Pseudo : 16 caractères au plus, sans caractères de contrôle
export const cleanName = (s) => String(s).replace(/[\u0000-\u001f\u007f<>]/g, "").trim().slice(0, 16);

/* =====================================================================
   Possession, achat, équipement
===================================================================== */

// "owned" : possédé · "free" : gratuit · "earned" : exploit réussi (gratuit) · "locked" : exploit à faire · "buy" : à acheter
export function itemStatus(avatar, data, it) {
  if (isFree(it) || avatar.owned.includes(it.id)) return "owned";
  if (it.req) return REQS[it.req]?.test(data) ? "earned" : "locked";
  return "buy";
}
export const canUse = (avatar, data, it) => ["owned", "earned"].includes(itemStatus(avatar, data, it));

export const paletteOwned = (avatar, color) => {
  const p = paletteOf(color);
  return !!p && (p.price === 0 || avatar.palettes.includes(p.id));
};

// Le look ne garde que ce que le joueur peut porter (sécurité au chargement)
export function wearable(avatar, data, look) {
  const out = { ...look };
  for (const cat of CAT_IDS) {
    const it = ITEMS[`${cat}:${look[cat]}`];
    if (!it || !canUse(avatar, data, it)) out[cat] = DEFAULT_LOOK[cat];
  }
  for (const k of COLOR_KEYS) if (!paletteOwned(avatar, look[k])) out[k] = DEFAULT_LOOK[k];
  return out;
}

// Tire un avatar au hasard parmi ce que le joueur peut porter
export function randomLook(avatar, data, rng = Math.random) {
  const look = {};
  for (const cat of CAT_IDS) {
    const ok = itemsOf(cat).filter((it) => canUse(avatar, data, it));
    look[cat] = ok[Math.floor(rng() * ok.length)].key;
  }
  const colors = PALETTES.filter((p) => p.price === 0 || avatar.palettes.includes(p.id)).flatMap((p) => p.colors);
  for (const k of COLOR_KEYS) look[k] = colors[Math.floor(rng() * colors.length)];
  return look;
}

// Nombre d'objets possédés (gratuits et exploits compris) / total
export function collection(avatar, data) {
  const all = Object.values(ITEMS);
  return { owned: all.filter((it) => canUse(avatar, data, it)).length, total: all.length };
}
