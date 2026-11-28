// js/city.js — logique de « Cité des Âges », le city builder de l'arcade (aucun dessin ici : voir city-art.js).
//
// Une carte de N × N cases vue en isométrique. On part d'un foyer de tribu à la préhistoire et on fait grandir la ville
// à travers 8 ères jusqu'au Cyberpunk. Chaque ère débloque de nouveaux bâtiments et transforme l'apparence des maisons,
// des routes et du centre-ville.
//
// Le temps avance par « mois » (un tick). À chaque mois :
//   1. l'énergie produite est comparée à la demande (à partir de l'ère industrielle) ;
//   2. les bâtiments produisent selon les travailleurs disponibles, leur site (forêt, roche, minerai…) et l'énergie ;
//   3. la population mange, paie l'impôt, et chaque maison grandit ou se vide selon son bonheur ;
//   4. une maison monte de niveau (1 à 3) quand assez de services la couvrent (eau, culte, santé, école…).

export const N = 44;                      // taille de la carte
export const SAVE_VERSION = 1;

/* ===================== Terrain ===================== */

export const T = { GRASS: 0, WATER: 1, FOREST: 2, ROCK: 3, ORE: 4, SAND: 5 };
export const TERRAIN_NAMES = ["Prairie", "Eau", "Forêt", "Roche", "Filon de minerai", "Sable"];

/* ===================== Ères ===================== */

export const ERAS = [
  { id: "stone", name: "Préhistoire", short: "Préhistoire", year: -10000, tax: 0.3, cap: 5 },
  { id: "antiq", name: "Antiquité", short: "Antiquité", year: -800, tax: 0.5, cap: 8 },
  { id: "medieval", name: "Moyen Âge", short: "Moyen Âge", year: 900, tax: 0.8, cap: 11 },
  { id: "renais", name: "Renaissance", short: "Renaissance", year: 1500, tax: 1.2, cap: 14 },
  { id: "indus", name: "Ère industrielle", short: "Industrielle", year: 1820, tax: 1.9, cap: 20 },
  { id: "modern", name: "Ère moderne", short: "Moderne", year: 1950, tax: 2.8, cap: 27 },
  { id: "digital", name: "Ère numérique", short: "Numérique", year: 2005, tax: 4, cap: 35 },
  { id: "cyber", name: "Cyberpunk", short: "Cyberpunk", year: 2077, tax: 6, cap: 46 }
];

// Ce qu'il faut pour passer à l'ère suivante (index = ère visée). `pop` est un seuil, le reste est dépensé.
export const ADVANCE = [
  null,
  { pop: 40, cost: { know: 120, wood: 150, stone: 60 } },
  { pop: 150, cost: { know: 1500, stone: 900, gold: 900 } },
  { pop: 400, cost: { know: 5000, stone: 2000, metal: 250, gold: 5000 } },
  { pop: 900, cost: { know: 25000, metal: 3000, gold: 40000 } },
  { pop: 2000, cost: { know: 120000, metal: 9000, gold: 400000 } },
  { pop: 4000, cost: { know: 500000, metal: 35000, gold: 1500000 } },
  { pop: 7000, cost: { know: 2500000, metal: 120000, gold: 6000000 } }
];

/* ===================== Ressources et services ===================== */

export const RES = ["food", "wood", "stone", "metal", "gold", "know"];
export const RES_NAMES = { food: "Nourriture", wood: "Bois", stone: "Pierre", metal: "Métal", gold: "Or", know: "Savoir", energy: "Énergie" };
export const RES_ICONS = { food: "🌾", wood: "🪵", stone: "🪨", metal: "⚙️", gold: "🪙", know: "📜", energy: "⚡" };

export const NEEDS = ["eau", "foi", "sante", "savoir", "loisir", "commerce", "ordre"];
export const NEED_NAMES = { eau: "Eau", foi: "Culte", sante: "Santé", savoir: "Éducation", loisir: "Loisirs", commerce: "Commerce", ordre: "Sécurité" };

export const CATS = [
  ["house", "Habitat"], ["food", "Nourriture"], ["prod", "Production"], ["service", "Services"],
  ["energy", "Énergie"], ["decor", "Décor"], ["wonder", "Merveilles"]
];

// Coût d'une case de route selon l'ère.
export const ROAD_COST = [{ wood: 1 }, { stone: 1 }, { stone: 2 }, { stone: 2 }, { gold: 5 }, { gold: 8 }, { gold: 12 }, { gold: 18 }];
export const ROAD_NAMES = ["Sentier", "Voie pavée", "Chemin empierré", "Rue pavée", "Rue", "Route", "Avenue", "Voie néon"];

/* ===================== Bâtiments =====================
   size : côté en cases · cost : coût · jobs : emplois · prod / use : par mois (avec tous les travailleurs)
   energy : + produit / − consomme · cover : services apportés dans un rayon r · happy : bonus de bonheur local (décor)
   pol : pollution dans un rayon · site : besoin d'un terrain voisin · cap : habitants (maisons) · h : hauteur du dessin */

const B = (o) => ({ size: 1, cost: {}, jobs: 0, prod: {}, use: {}, energy: 0, cover: [], r: 0, happy: 0, hr: 0, pol: 0, pr: 0, h: 60, ...o });

export const BUILDINGS = [
  // ---------- Préhistoire ----------
  B({ id: "center", era: 0, cat: "special", size: 2, name: "Centre de la cité", desc: "Le cœur de la ville. Son aspect change à chaque ère.", happy: 6, hr: 5, prod: { know: 0.5 }, h: 150, fixed: true }),
  B({ id: "house", era: 0, cat: "house", name: "Habitation", desc: "Accueille des habitants. Monte de niveau quand elle est couverte par assez de services.", cost: { wood: 6 }, cap: 1, h: 230 }),
  B({ id: "hunter", era: 0, cat: "food", name: "Camp de chasseurs", desc: "Chasse dans les forêts proches (rayon 3) : plus il y a d'arbres, plus il rapporte.", cost: { wood: 12 }, jobs: 2, prod: { food: 3.2 }, site: { t: T.FOREST, r: 3, need: 0 }, h: 40 }),
  B({ id: "gather", era: 0, cat: "food", name: "Cueilleurs", desc: "Récoltent baies et racines. Rendement modeste mais sûr.", cost: { wood: 8 }, jobs: 2, prod: { food: 2 }, h: 34 }),
  B({ id: "lumber", era: 0, cat: "prod", name: "Bûcheron", desc: "Coupe du bois. Doit être à 2 cases d'une forêt. Gratuit, pour ne jamais rester bloqué sans bois.", cost: {}, jobs: 2, prod: { wood: 2.6 }, site: { t: T.FOREST, r: 2, need: 1 }, h: 40 }),
  B({ id: "stonecut", era: 0, cat: "prod", name: "Tailleur de pierre", desc: "Extrait de la pierre. Doit être à 2 cases d'une roche.", cost: { wood: 12 }, jobs: 2, prod: { stone: 1.6 }, site: { t: T.ROCK, r: 2, need: 1 }, h: 36 }),
  B({ id: "shaman", era: 0, cat: "service", name: "Hutte du chaman", desc: "Produit du savoir et apporte le culte.", cost: { wood: 18, stone: 6 }, jobs: 1, prod: { know: 0.8 }, cover: ["foi"], r: 5, h: 60 }),
  B({ id: "fire", era: 0, cat: "service", name: "Feu de camp", desc: "Lieu de rassemblement : apporte les loisirs.", cost: { wood: 8 }, cover: ["loisir"], r: 4, h: 34 }),
  B({ id: "healer", era: 0, cat: "service", name: "Guérisseuse", desc: "Plantes et remèdes : apporte la santé.", cost: { wood: 15, stone: 4 }, jobs: 1, cover: ["sante"], r: 5, h: 44 }),
  B({ id: "totem", era: 0, cat: "decor", name: "Totem", desc: "Embellit le voisinage.", cost: { wood: 10 }, happy: 4, hr: 2, h: 56 }),
  B({ id: "w0", era: 0, cat: "wonder", size: 2, name: "Cercle de pierres", desc: "Merveille : +5 de bonheur partout, du savoir, et le culte dans un grand rayon.", cost: { stone: 110, wood: 60 }, prod: { know: 2 }, cover: ["foi"], r: 9, wonder: 5, h: 60 }),

  // ---------- Antiquité ----------
  B({ id: "farm", era: 1, cat: "food", size: 2, name: "Ferme", desc: "Champs cultivés. Rapporte beaucoup de nourriture.", cost: { wood: 25, stone: 10 }, jobs: 4, prod: { food: 10 }, h: 50 }),
  B({ id: "fishery", era: 1, cat: "food", name: "Pêcherie", desc: "Doit toucher l'eau.", cost: { wood: 20 }, jobs: 2, prod: { food: 5.5 }, site: { t: T.WATER, r: 1, need: 1 }, h: 44 }),
  B({ id: "well", era: 1, cat: "service", name: "Puits", desc: "Apporte l'eau.", cost: { stone: 12 }, cover: ["eau"], r: 4, h: 34 }),
  B({ id: "market", era: 1, cat: "service", name: "Marché", desc: "Commerce et un peu d'or.", cost: { wood: 30, stone: 15 }, jobs: 3, prod: { gold: 3 }, cover: ["commerce"], r: 5, h: 44 }),
  B({ id: "temple", era: 1, cat: "service", name: "Temple", desc: "Grand rayon de culte.", cost: { stone: 70, gold: 20 }, jobs: 2, prod: { know: 1 }, cover: ["foi"], r: 7, h: 70 }),
  B({ id: "library", era: 1, cat: "service", name: "Bibliothèque", desc: "Beaucoup de savoir et l'éducation.", cost: { stone: 50, wood: 30, gold: 30 }, jobs: 3, prod: { know: 3.5 }, cover: ["savoir"], r: 5, h: 64 }),
  B({ id: "baths", era: 1, cat: "service", name: "Thermes", desc: "Apportent la santé.", cost: { stone: 80, gold: 40 }, jobs: 2, cover: ["sante"], r: 7, h: 54 }),
  B({ id: "amphi", era: 1, cat: "service", size: 2, name: "Amphithéâtre", desc: "Loisirs dans un grand rayon, un peu d'or.", cost: { stone: 140, gold: 60 }, jobs: 3, prod: { gold: 2 }, cover: ["loisir"], r: 8, h: 60 }),
  B({ id: "garden", era: 1, cat: "decor", name: "Jardin", desc: "Embellit et réduit la pollution.", cost: { wood: 4, gold: 8 }, happy: 5, hr: 2, pol: -1, pr: 2, h: 40 }),
  B({ id: "statue", era: 1, cat: "decor", name: "Statue", desc: "Embellit le voisinage.", cost: { stone: 25 }, happy: 6, hr: 3, h: 70 }),
  B({ id: "w1", era: 1, cat: "wonder", size: 2, name: "Grande Pyramide", desc: "Merveille : +6 de bonheur partout et de l'or chaque mois.", cost: { stone: 480, gold: 280 }, prod: { gold: 8 }, wonder: 6, h: 110 }),

  // ---------- Moyen Âge ----------
  B({ id: "mine", era: 2, cat: "prod", name: "Mine", desc: "Extrait du métal. Doit être à 2 cases d'un filon.", cost: { wood: 40, stone: 30 }, jobs: 4, prod: { metal: 1.8 }, site: { t: T.ORE, r: 2, need: 1 }, h: 50 }),
  B({ id: "forge", era: 2, cat: "prod", name: "Forge", desc: "Transforme bois et métal en or.", cost: { stone: 40, wood: 30 }, jobs: 3, use: { wood: 1, metal: 0.5 }, prod: { gold: 7 }, h: 56 }),
  B({ id: "mill", era: 2, cat: "food", name: "Moulin", desc: "Moulin à vent : nourriture.", cost: { wood: 60, stone: 20 }, jobs: 2, prod: { food: 6 }, h: 90 }),
  B({ id: "guard", era: 2, cat: "service", name: "Tour de garde", desc: "Apporte la sécurité.", cost: { stone: 60 }, jobs: 2, cover: ["ordre"], r: 6, h: 90 }),
  B({ id: "tavern", era: 2, cat: "service", name: "Taverne", desc: "Loisirs et un peu d'or.", cost: { wood: 50, stone: 20 }, jobs: 2, prod: { gold: 3 }, cover: ["loisir"], r: 6, h: 60 }),
  B({ id: "abbey", era: 2, cat: "service", size: 2, name: "Abbaye", desc: "Culte dans un très grand rayon et beaucoup de savoir.", cost: { stone: 260, wood: 80, gold: 100 }, jobs: 4, prod: { know: 6 }, cover: ["foi"], r: 9, h: 140 }),
  B({ id: "w2", era: 2, cat: "wonder", size: 2, name: "Château fort", desc: "Merveille : +6 de bonheur partout et la sécurité dans un immense rayon.", cost: { stone: 1100, metal: 140, gold: 550 }, cover: ["ordre"], r: 14, wonder: 6, h: 150 }),

  // ---------- Renaissance ----------
  B({ id: "workshop", era: 3, cat: "prod", name: "Atelier", desc: "Artisans : transforme le bois en or et en savoir.", cost: { wood: 80, stone: 60, gold: 100 }, jobs: 4, use: { wood: 1.5 }, prod: { gold: 9, know: 1.5 }, h: 64 }),
  B({ id: "bank", era: 3, cat: "service", name: "Banque", desc: "Beaucoup d'or et du commerce.", cost: { stone: 200, metal: 40, gold: 300 }, jobs: 4, prod: { gold: 16 }, cover: ["commerce"], r: 7, h: 80 }),
  B({ id: "theater", era: 3, cat: "service", name: "Théâtre", desc: "Loisirs dans un grand rayon.", cost: { stone: 180, gold: 250 }, jobs: 3, prod: { gold: 4 }, cover: ["loisir"], r: 9, h: 84 }),
  B({ id: "hospice", era: 3, cat: "service", name: "Hôtel-Dieu", desc: "Santé dans un grand rayon.", cost: { stone: 160, gold: 200 }, jobs: 4, cover: ["sante"], r: 9, h: 80 }),
  B({ id: "univ", era: 3, cat: "service", size: 2, name: "Université", desc: "Énormément de savoir et l'éducation.", cost: { stone: 400, metal: 60, gold: 600 }, jobs: 6, prod: { know: 18 }, cover: ["savoir"], r: 10, h: 130 }),
  B({ id: "fountain", era: 3, cat: "decor", name: "Fontaine", desc: "Embellit et apporte l'eau autour.", cost: { stone: 40, gold: 40 }, happy: 6, hr: 3, cover: ["eau"], r: 3, h: 50 }),
  B({ id: "w3", era: 3, cat: "wonder", size: 2, name: "Grand Dôme", desc: "Merveille : +7 de bonheur partout et beaucoup de savoir.", cost: { stone: 1900, metal: 280, gold: 2300 }, prod: { know: 15 }, wonder: 7, h: 170 }),

  // ---------- Ère industrielle ----------
  B({ id: "coal", era: 4, cat: "energy", size: 2, name: "Centrale à charbon", desc: "Beaucoup d'énergie mais pollue énormément. Brûle de la pierre (charbon).", cost: { metal: 200, stone: 300, gold: 800 }, jobs: 6, use: { stone: 2 }, energy: 90, pol: 4, pr: 6, h: 150 }),
  B({ id: "factory", era: 4, cat: "prod", size: 2, name: "Usine", desc: "Produit du métal et de l'or avec du bois. Pollue.", cost: { metal: 250, stone: 200, gold: 900 }, jobs: 12, use: { wood: 2 }, prod: { metal: 5, gold: 22 }, energy: -12, pol: 3, pr: 5, h: 140 }),
  B({ id: "station", era: 4, cat: "service", size: 2, name: "Gare", desc: "Commerce dans un grand rayon et de l'or.", cost: { metal: 200, stone: 300, gold: 1000 }, jobs: 6, prod: { gold: 14 }, cover: ["commerce"], r: 10, energy: -5, h: 100 }),
  B({ id: "watertower", era: 4, cat: "service", name: "Château d'eau", desc: "L'eau dans un grand rayon.", cost: { metal: 60, stone: 80, gold: 300 }, cover: ["eau"], r: 9, energy: -2, h: 110 }),
  B({ id: "police", era: 4, cat: "service", name: "Commissariat", desc: "Sécurité dans un grand rayon.", cost: { stone: 150, gold: 400 }, jobs: 4, cover: ["ordre"], r: 9, energy: -2, h: 70 }),
  B({ id: "school", era: 4, cat: "service", name: "École", desc: "Éducation et savoir.", cost: { stone: 150, gold: 350 }, jobs: 4, prod: { know: 8 }, cover: ["savoir"], r: 8, energy: -2, h: 70 }),
  B({ id: "w4", era: 4, cat: "wonder", size: 2, name: "Tour de fer", desc: "Merveille : +8 de bonheur partout et beaucoup d'or.", cost: { metal: 2600, gold: 20000 }, prod: { gold: 50 }, wonder: 8, h: 260 }),

  // ---------- Ère moderne ----------
  B({ id: "wind", era: 5, cat: "energy", name: "Éolienne", desc: "Énergie propre.", cost: { metal: 60, gold: 300 }, energy: 14, h: 130 }),
  B({ id: "nuclear", era: 5, cat: "energy", size: 2, name: "Centrale nucléaire", desc: "Énormément d'énergie, mais coûte cher à entretenir.", cost: { metal: 1200, gold: 9000 }, jobs: 12, use: { gold: 40 }, energy: 450, h: 150 }),
  B({ id: "recycle", era: 5, cat: "prod", name: "Centre de recyclage", desc: "Récupère du métal et réduit un peu la pollution autour.", cost: { metal: 150, gold: 3000 }, jobs: 6, prod: { metal: 14 }, pol: -1, pr: 3, energy: -15, h: 70 }),
  B({ id: "lab", era: 5, cat: "prod", name: "Laboratoire", desc: "Beaucoup de savoir.", cost: { metal: 200, gold: 2500 }, jobs: 6, prod: { know: 40 }, energy: -12, h: 90 }),
  B({ id: "hospital", era: 5, cat: "service", size: 2, name: "Hôpital", desc: "Santé dans un très grand rayon.", cost: { metal: 400, gold: 4000 }, jobs: 10, cover: ["sante"], r: 13, energy: -20, h: 120 }),
  B({ id: "stadium", era: 5, cat: "service", size: 2, name: "Stade", desc: "Loisirs dans un immense rayon, et de l'or.", cost: { metal: 600, gold: 5000 }, jobs: 8, prod: { gold: 30 }, cover: ["loisir"], r: 14, energy: -20, h: 80 }),
  B({ id: "mall", era: 5, cat: "service", size: 2, name: "Centre commercial", desc: "Commerce et beaucoup d'or.", cost: { metal: 400, gold: 4500 }, jobs: 14, prod: { gold: 60 }, cover: ["commerce"], r: 10, energy: -25, h: 80 }),
  B({ id: "park", era: 5, cat: "decor", name: "Parc urbain", desc: "Embellit beaucoup et absorbe la pollution.", cost: { gold: 500 }, happy: 8, hr: 4, pol: -3, pr: 4, h: 50 }),
  B({ id: "w5", era: 5, cat: "wonder", size: 2, name: "Tour Horizon", desc: "Merveille : gratte-ciel record. +8 de bonheur partout et énormément d'or.", cost: { metal: 8000, gold: 120000 }, prod: { gold: 200 }, wonder: 8, h: 330 }),

  // ---------- Ère numérique ----------
  B({ id: "solar", era: 6, cat: "energy", name: "Ferme solaire", desc: "Énergie propre et fiable.", cost: { metal: 100, gold: 1200 }, energy: 32, h: 40 }),
  B({ id: "vfarm", era: 6, cat: "food", name: "Ferme verticale", desc: "Énormément de nourriture sur une seule case.", cost: { metal: 600, gold: 6000 }, jobs: 8, prod: { food: 70 }, energy: -30, h: 170 }),
  B({ id: "metro", era: 6, cat: "service", name: "Station de métro", desc: "Commerce, de l'or, et réduit la pollution autour.", cost: { metal: 500, gold: 5000 }, jobs: 4, prod: { gold: 20 }, cover: ["commerce"], r: 12, pol: -2, pr: 6, energy: -15, h: 60 }),
  B({ id: "datacenter", era: 6, cat: "prod", size: 2, name: "Data center", desc: "Énormément de savoir et de l'or. Très gourmand en énergie.", cost: { metal: 1500, gold: 15000 }, jobs: 10, prod: { know: 120, gold: 80 }, energy: -120, h: 90 }),
  B({ id: "campus", era: 6, cat: "service", size: 2, name: "Campus tech", desc: "Or, savoir et éducation dans un grand rayon.", cost: { metal: 1200, gold: 12000 }, jobs: 20, prod: { gold: 160, know: 40 }, cover: ["savoir"], r: 12, energy: -60, h: 170 }),
  B({ id: "w6", era: 6, cat: "wonder", size: 2, name: "Spatioport", desc: "Merveille : une fusée vers les étoiles. +8 de bonheur partout et énormément de savoir.", cost: { metal: 20000, gold: 400000 }, prod: { know: 300 }, wonder: 8, h: 300 }),

  // ---------- Cyberpunk ----------
  B({ id: "fusion", era: 7, cat: "energy", size: 2, name: "Réacteur à fusion", desc: "Une énergie presque illimitée.", cost: { metal: 6000, gold: 80000 }, jobs: 10, use: { gold: 200 }, energy: 2600, h: 170 }),
  B({ id: "arco", era: 7, cat: "house", size: 2, name: "Arcologie", desc: "Une ville dans une tour : loge huit fois plus d'habitants qu'une habitation.", cost: { metal: 8000, gold: 120000 }, cap: 8, energy: -60, h: 380 }),
  B({ id: "nightmarket", era: 7, cat: "service", name: "Marché de nuit", desc: "Commerce et beaucoup d'or.", cost: { metal: 400, gold: 12000 }, jobs: 8, prod: { gold: 120 }, cover: ["commerce"], r: 10, energy: -20, h: 70 }),
  B({ id: "braindance", era: 7, cat: "service", name: "Club de braindance", desc: "Loisirs et énormément d'or.", cost: { metal: 800, gold: 20000 }, jobs: 6, prod: { gold: 150 }, cover: ["loisir"], r: 12, energy: -40, h: 130 }),
  B({ id: "ripper", era: 7, cat: "service", name: "Charcudoc", desc: "Implants et soins : santé et or.", cost: { metal: 600, gold: 15000 }, jobs: 4, prod: { gold: 80 }, cover: ["sante"], r: 11, energy: -20, h: 70 }),
  B({ id: "drones", era: 7, cat: "service", name: "Hub de drones", desc: "Sécurité dans un immense rayon.", cost: { metal: 1500, gold: 30000 }, jobs: 6, cover: ["ordre"], r: 15, energy: -40, h: 120 }),
  B({ id: "aicore", era: 7, cat: "prod", size: 2, name: "Noyau IA", desc: "Une intelligence artificielle qui produit un savoir colossal.", cost: { metal: 10000, gold: 200000 }, jobs: 12, prod: { know: 1500 }, energy: -400, h: 200 }),
  B({ id: "nanofab", era: 7, cat: "prod", size: 2, name: "Nano-fabrique", desc: "Des essaims de nanomachines assemblent du métal à partir de rien (ou presque).", cost: { metal: 3000, gold: 60000 }, jobs: 10, prod: { metal: 220 }, energy: -150, h: 120 }),
  B({ id: "holo", era: 7, cat: "decor", name: "Hologramme", desc: "Embellit beaucoup le quartier.", cost: { gold: 3000 }, happy: 10, hr: 4, energy: -5, h: 120 }),
  B({ id: "w7", era: 7, cat: "wonder", size: 2, name: "Méga-tour Néon", desc: "Merveille ultime : la plus haute tour du monde. La construire termine la partie… et on peut continuer.", cost: { metal: 120000, gold: 5000000, know: 3000000 }, prod: { gold: 2000 }, wonder: 12, h: 520 })
];

// Les bâtiments des ères avancées coûtent plus cher (l'économie y est bien plus grosse). Les merveilles ont déjà leur prix.
const COST_MULT = [1, 1, 1, 1, 1.5, 2, 3, 4];
for (const b of BUILDINGS) {
  if (b.wonder) continue;
  for (const k of ["gold", "metal"]) if (b.cost[k]) b.cost[k] = Math.round(b.cost[k] * COST_MULT[b.era]);
}

export const BY_ID = Object.fromEntries(BUILDINGS.map((b) => [b.id, b]));
export const BUILDING_IDS = BUILDINGS.map((b) => b.id);
export const ROAD_FREE = new Set(["decor", "wonder", "special"]);   // pas besoin de route
const isHouse = (def) => def.cat === "house";

export function houseCap(era, level, def = BY_ID.house) { return Math.round(ERAS[era].cap * level * (def.cap || 1)); }

/* ===================== Succès (pièces bleues de l'arcade) ===================== */

export const ACHIEVEMENTS = [
  { id: "era1", name: "Âge du bronze", text: "Atteindre l'Antiquité", blue: 2 },
  { id: "era2", name: "Bâtisseurs de cathédrales", text: "Atteindre le Moyen Âge", blue: 3 },
  { id: "era3", name: "Humanisme", text: "Atteindre la Renaissance", blue: 4 },
  { id: "era4", name: "Vapeur et charbon", text: "Atteindre l'ère industrielle", blue: 5 },
  { id: "era5", name: "Les Trente Glorieuses", text: "Atteindre l'ère moderne", blue: 6 },
  { id: "era6", name: "Connecté", text: "Atteindre l'ère numérique", blue: 8 },
  { id: "era7", name: "Wake up, samurai", text: "Atteindre l'ère Cyberpunk", blue: 12 },
  { id: "pop100", name: "Village", text: "100 habitants", blue: 1 },
  { id: "pop1000", name: "Ville", text: "1 000 habitants", blue: 3 },
  { id: "pop5000", name: "Métropole", text: "5 000 habitants", blue: 6 },
  { id: "pop10000", name: "Mégalopole", text: "10 000 habitants", blue: 10 },
  { id: "house3", name: "Beaux quartiers", text: "Une habitation au niveau 3", blue: 1 },
  { id: "wonder3", name: "Collectionneur", text: "Construire 3 merveilles", blue: 4 },
  { id: "wonder8", name: "Les huit merveilles", text: "Construire les 8 merveilles", blue: 15 },
  { id: "happy90", name: "Utopie", text: "Bonheur moyen à 90 avec 500 habitants", blue: 5 },
  { id: "victory", name: "Night City", text: "Construire la Méga-tour Néon", blue: 25 }
];

/* ===================== Hasard reproductible ===================== */

export function rng(seed) {
  let s = (seed >>> 0) || 1;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function valueNoise(seed, scale) {
  const r = rng(seed);
  const G = Math.ceil(N / scale) + 2;
  const grid = Array.from({ length: G * G }, () => r());
  const at = (gx, gy) => grid[gy * G + gx];
  const smooth = (t) => t * t * (3 - 2 * t);
  return (x, y) => {
    const fx = x / scale, fy = y / scale;
    const x0 = Math.floor(fx), y0 = Math.floor(fy);
    const tx = smooth(fx - x0), ty = smooth(fy - y0);
    const a = at(x0, y0) * (1 - tx) + at(x0 + 1, y0) * tx;
    const b = at(x0, y0 + 1) * (1 - tx) + at(x0 + 1, y0 + 1) * tx;
    return a * (1 - ty) + b * ty;
  };
}

/* ===================== Carte de départ ===================== */

export const CENTER = { x: Math.floor(N / 2) - 1, y: Math.floor(N / 2) - 1 };

export function generateTerrain(seed) {
  const r = rng(seed ^ 0x9e3779b9);
  const n1 = valueNoise(seed + 1, 9), n2 = valueNoise(seed + 2, 4);
  const f1 = valueNoise(seed + 3, 6), f2 = valueNoise(seed + 4, 3);
  const k1 = valueNoise(seed + 5, 5);
  const t = new Array(N * N).fill(T.GRASS);

  // une rivière qui serpente d'un bord à l'autre
  const horizontal = r() < 0.5;
  let pos = Math.floor(N * (0.15 + r() * 0.2)) * (r() < 0.5 ? 1 : -1);
  if (pos < 0) pos += N;
  const width = 1.3 + r() * 0.8;
  for (let i = 0; i < N; i++) {
    pos += (r() - 0.5) * 1.4;
    pos = Math.max(3, Math.min(N - 4, pos));
    for (let d = -3; d <= 3; d++) {
      const j = Math.round(pos + d);
      if (j < 0 || j >= N) continue;
      if (Math.abs(d) <= width) t[horizontal ? j * N + i : i * N + j] = T.WATER;
    }
  }
  // un lac
  const lx = r() < 0.5 ? 6 + r() * 6 : N - 12 + r() * 5, ly = r() < 0.5 ? 6 + r() * 6 : N - 12 + r() * 5, lr = 2.5 + r() * 2.5;
  for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
    const d = Math.hypot(x - lx, y - ly) + (n2(x, y) - 0.5) * 3;
    if (d < lr) t[y * N + x] = T.WATER;
  }
  for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
    const i = y * N + x;
    if (t[i] === T.WATER) continue;
    const forest = f1(x, y) * 0.7 + f2(x, y) * 0.3;
    const rock = k1(x, y) * 0.75 + n2(x, y) * 0.25;
    if (rock > 0.73) t[i] = rock > 0.8 && n1(x, y) > 0.55 ? T.ORE : T.ROCK;
    else if (forest > 0.58) t[i] = T.FOREST;
  }
  // sable au bord de l'eau
  for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
    const i = y * N + x;
    if (t[i] !== T.GRASS) continue;
    let w = 0;
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const xx = x + dx, yy = y + dy;
      if (xx >= 0 && yy >= 0 && xx < N && yy < N && t[yy * N + xx] === T.WATER) w++;
    }
    if (w && r() < 0.55) t[i] = T.SAND;
  }
  // une clairière autour du centre, avec forêt, roche et filon pas trop loin (sinon la partie est bloquée)
  const cx = CENTER.x + 1, cy = CENTER.y + 1;
  for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
    if (Math.max(Math.abs(x - cx), Math.abs(y - cy)) <= 3) t[y * N + x] = T.GRASS;
  }
  const ensure = (type, min, max, count, blob) => {
    let found = 0;
    for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
      const d = Math.max(Math.abs(x - cx), Math.abs(y - cy));
      if (d >= min && d <= max && t[y * N + x] === type) found++;
    }
    if (found >= count) return;
    const a = r() * Math.PI * 2, d = min + 1 + r() * (max - min - 2);
    const bx = Math.round(cx + Math.cos(a) * d), by = Math.round(cy + Math.sin(a) * d);
    for (let y = by - blob; y <= by + blob; y++) for (let x = bx - blob; x <= bx + blob; x++) {
      if (x < 0 || y < 0 || x >= N || y >= N) continue;
      if (Math.hypot(x - bx, y - by) <= blob + 0.3 && t[y * N + x] !== T.WATER) t[y * N + x] = type;
    }
  };
  ensure(T.FOREST, 4, 9, 14, 2);
  ensure(T.ROCK, 5, 11, 6, 1);
  ensure(T.ORE, 7, 14, 2, 1);
  return t;
}

export function freshCity(seed = Math.floor(Math.random() * 1e9)) {
  const terr = generateTerrain(seed);
  const road = new Array(N * N).fill(0);
  // une petite croix de sentiers autour du centre
  const { x: cx, y: cy } = CENTER;
  for (let i = -3; i <= 4; i++) {
    road[(cy + 2) * N + cx + i] = 1;
  }
  for (let i = -2; i <= 2; i++) road[(cy + i) * N + cx - 1] = 1;
  return {
    v: SAVE_VERSION,
    seed,
    era: 0,
    month: 0,
    em: 0,
    terr: terr.join(""),
    road: road.join(""),
    b: [{ t: "center", x: cx, y: cy, p: 0, l: 1, v: 1 }],
    res: { food: 40, wood: 70, stone: 20, metal: 0, gold: 40, know: 0 },
    tax: 8,
    ach: [],
    best: 0,
    stats: { built: 0, fires: 0 },
    festival: 0,
    cam: null,
    won: false
  };
}

const num = (v, min, max, d) => { const n = Number(v); return Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : d; };
const int = (v, min, max, d) => Math.floor(num(v, min, max, d));

// Reprend une sauvegarde en vérifiant tout. Une ville abîmée repart de zéro plutôt que de planter.
export function sanitizeCity(raw) {
  if (!raw || typeof raw !== "object" || raw.v !== SAVE_VERSION) return freshCity();
  const c = freshCity(int(raw.seed, 0, 2 ** 31, 1234));
  if (typeof raw.terr === "string" && raw.terr.length === N * N && /^[0-5]+$/.test(raw.terr)) c.terr = raw.terr;
  if (typeof raw.road === "string" && raw.road.length === N * N && /^[01]+$/.test(raw.road)) c.road = raw.road;
  c.era = int(raw.era, 0, ERAS.length - 1, 0);
  c.month = int(raw.month, 0, 1e9, 0);
  c.em = int(raw.em, 0, c.month, 0);
  c.tax = int(raw.tax, 0, 20, 8);
  c.best = int(raw.best, 0, 1e9, 0);
  c.festival = int(raw.festival, 0, 100, 0);
  c.won = !!raw.won;
  for (const k of RES) c.res[k] = num(raw.res?.[k], 0, 1e15, c.res[k]);
  if (Array.isArray(raw.ach)) c.ach = raw.ach.filter((id) => ACHIEVEMENTS.some((a) => a.id === id));
  if (raw.stats && typeof raw.stats === "object") for (const k of Object.keys(c.stats)) c.stats[k] = int(raw.stats[k], 0, 1e9, 0);
  if (raw.cam && typeof raw.cam === "object") c.cam = { x: num(raw.cam.x, -1e4, 1e4, 0), y: num(raw.cam.y, -1e4, 1e4, 0), z: num(raw.cam.z, 0.4, 3, 1) };
  if (Array.isArray(raw.b)) {
    const occ = new Int16Array(N * N).fill(-1);
    const list = [];
    let hasCenter = false;
    for (const b of raw.b.slice(0, N * N)) {
      const def = BY_ID[b?.t];
      if (!def) continue;
      const x = int(b.x, 0, N - def.size, -1), y = int(b.y, 0, N - def.size, -1);
      if (x < 0 || y < 0) continue;
      if (def.id === "center") { if (hasCenter) continue; hasCenter = true; }
      let free = true;
      for (let j = 0; j < def.size && free; j++) for (let i = 0; i < def.size; i++) if (occ[(y + j) * N + x + i] >= 0) { free = false; break; }
      if (!free) continue;
      for (let j = 0; j < def.size; j++) for (let i = 0; i < def.size; i++) occ[(y + j) * N + x + i] = list.length;
      list.push({ t: def.id, x, y, p: int(b.p, 0, 1e6, 0), l: int(b.l, 1, 3, 1), v: int(b.v, 0, 999, 0), ...(b.f ? { f: int(b.f, 0, 60, 0) } : {}) });
    }
    if (!hasCenter) list.unshift(c.b[0]);
    c.b = list;
    // une route sous un bâtiment (sauvegarde bricolée) : on retire la route
    const road = c.road.split("");
    for (let i = 0; i < N * N; i++) if (occ[i] >= 0 && road[i] === "1") road[i] = "0";
    c.road = road.join("");
  }
  return c;
}

/* ===================== Monde dérivé (recalculé quand la carte change) ===================== */

export const idx = (x, y) => y * N + x;
export const inside = (x, y) => x >= 0 && y >= 0 && x < N && y < N;

export function makeWorld(S) {
  const W = {
    terr: Uint8Array.from(S.terr, (ch) => ch.charCodeAt(0) - 48),
    road: Uint8Array.from(S.road, (ch) => ch.charCodeAt(0) - 48),
    occ: new Int16Array(N * N).fill(-1),
    cover: Object.fromEntries(NEEDS.map((n) => [n, new Uint8Array(N * N)])),
    decor: new Float32Array(N * N),
    pol: new Float32Array(N * N),
    site: [],        // facteur de site par bâtiment
    access: [],      // a une route à côté
    rates: { food: 0, wood: 0, stone: 0, metal: 0, gold: 0, know: 0 },
    energy: { prod: 0, need: 0, ratio: 1 },
    jobs: 0, workers: 0, emp: 1, pop: 0, happy: 50, houses: 0,
    breakdown: {},
    dirty: true,
    version: 0       // augmente à chaque changement de carte (pour les dessins)
  };
  rebuild(S, W);
  return W;
}

// Termine les tableaux du monde : occupation, couverture des services, pollution, décor, accès aux routes.
export function rebuild(S, W) {
  W.occ.fill(-1);
  S.b.forEach((b, i) => {
    const s = BY_ID[b.t].size;
    for (let j = 0; j < s; j++) for (let k = 0; k < s; k++) W.occ[idx(b.x + k, b.y + j)] = i;
  });
  for (const n of NEEDS) W.cover[n].fill(0);
  W.decor.fill(0);
  W.pol.fill(0);
  W.site = [];
  W.access = [];
  S.b.forEach((b, i) => {
    const def = BY_ID[b.t];
    const s = def.size;
    const cx = b.x + s / 2, cy = b.y + s / 2;
    W.access[i] = ROAD_FREE.has(def.cat) || touchesRoad(W, b.x, b.y, s);
    W.site[i] = siteFactor(W, def, b.x, b.y);
    const working = W.access[i] && !b.f;
    if (def.cover.length && def.r && working) area(cx, cy, def.r, (j) => { for (const n of def.cover) W.cover[n][j] = Math.min(255, W.cover[n][j] + 1); });
    if (def.happy && def.hr) area(cx, cy, def.hr + 0.5, (j, d) => { W.decor[j] += def.happy * (1 - d / (def.hr + 1.5)); });
    if (def.pol && def.pr && working) area(cx, cy, def.pr + 0.5, (j, d) => { W.pol[j] += def.pol * (1 - d / (def.pr + 1.5)); });
  });
  for (let i = 0; i < N * N; i++) W.pol[i] = Math.max(0, W.pol[i]);
  W.dirty = false;
  W.version++;
}

function area(cx, cy, r, fn) {
  const x0 = Math.max(0, Math.floor(cx - r)), x1 = Math.min(N - 1, Math.ceil(cx + r));
  const y0 = Math.max(0, Math.floor(cy - r)), y1 = Math.min(N - 1, Math.ceil(cy + r));
  for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
    const d = Math.hypot(x + 0.5 - cx, y + 0.5 - cy);
    if (d <= r) fn(idx(x, y), d);
  }
}

export function touchesRoad(W, x, y, s) {
  for (let i = 0; i < s; i++) {
    for (const [xx, yy] of [[x + i, y - 1], [x + i, y + s], [x - 1, y + i], [x + s, y + i]]) {
      if (inside(xx, yy) && W.road[idx(xx, yy)]) return true;
    }
  }
  return false;
}

export function countNear(W, type, x, y, s, r) {
  let n = 0;
  for (let yy = y - r; yy < y + s + r; yy++) for (let xx = x - r; xx < x + s + r; xx++) {
    if (inside(xx, yy) && W.terr[idx(xx, yy)] === type && W.occ[idx(xx, yy)] < 0) n++;
  }
  return n;
}

export function siteFactor(W, def, x, y) {
  if (!def.site) return 1;
  const n = countNear(W, def.site.t, x, y, def.size, def.site.r);
  if (n < def.site.need) return 0;
  if (def.site.t === T.WATER) return 1;
  if (def.site.t === T.ORE) return Math.min(1.5, 0.7 + n * 0.25);
  return Math.min(1.5, 0.45 + n / 7);
}

/* ===================== Construction ===================== */

export const techMult = (S, def) => 1 + 0.3 * Math.max(0, S.era - def.era);

export function canAfford(S, cost, times = 1) {
  return Object.entries(cost).every(([k, v]) => (S.res[k] ?? 0) + 1e-9 >= v * times);
}
function pay(S, cost) { for (const [k, v] of Object.entries(cost)) S.res[k] = Math.max(0, S.res[k] - v); }

// Peut-on poser ce bâtiment ici ? Renvoie "" si oui, sinon la raison.
export function placeError(S, W, id, x, y) {
  const def = BY_ID[id];
  if (!def || def.fixed) return "Bâtiment inconnu.";
  if (def.era > S.era) return `Disponible à l'ère « ${ERAS[def.era].name} ».`;
  const s = def.size;
  if (!inside(x, y) || !inside(x + s - 1, y + s - 1)) return "Hors de la carte.";
  for (let j = 0; j < s; j++) for (let i = 0; i < s; i++) {
    const k = idx(x + i, y + j);
    if (W.occ[k] >= 0) return "La place est déjà prise.";
    if (W.road[k]) return "Il y a une route.";
    const t = W.terr[k];
    if (t === T.WATER) return "On ne construit pas sur l'eau.";
    if (t === T.ROCK || t === T.ORE) return "Terrain rocheux : démolis-le d'abord (sauf les filons).";
  }
  if (def.wonder && S.b.some((b) => b.t === id)) return "Merveille déjà construite.";
  if (def.site && siteFactor(W, def, x, y) <= 0) {
    return { [T.FOREST]: "Il faut une forêt à 2 cases.", [T.ROCK]: "Il faut une roche à 2 cases.", [T.ORE]: "Il faut un filon de minerai à 2 cases.", [T.WATER]: "Doit toucher l'eau." }[def.site.t];
  }
  if (!canAfford(S, def.cost)) return "Pas assez de ressources.";
  return "";
}

export function place(S, W, id, x, y) {
  const err = placeError(S, W, id, x, y);
  if (err) return err;
  const def = BY_ID[id];
  pay(S, def.cost);
  const t = S.terr.split("");
  let wood = 0;
  for (let j = 0; j < def.size; j++) for (let i = 0; i < def.size; i++) {
    const k = idx(x + i, y + j);
    if (t[k] === String(T.FOREST)) { t[k] = String(T.GRASS); wood += 2; }
  }
  S.terr = t.join("");
  W.terr = Uint8Array.from(S.terr, (ch) => ch.charCodeAt(0) - 48);
  S.res.wood += wood;
  S.b.push({ t: id, x, y, p: 0, l: 1, v: Math.floor(Math.random() * 1000) });
  S.stats.built++;
  rebuild(S, W);
  return "";
}

export function roadError(S, W, x, y) {
  if (!inside(x, y)) return "Hors de la carte.";
  const k = idx(x, y);
  if (W.road[k]) return "Déjà une route.";
  if (W.occ[k] >= 0) return "La place est prise.";
  const t = W.terr[k];
  if (t === T.WATER) return "On ne construit pas sur l'eau.";
  if (t === T.ROCK || t === T.ORE) return "Terrain rocheux.";
  if (!canAfford(S, ROAD_COST[S.era])) return "Pas assez de ressources.";
  return "";
}

// Pose une ligne de routes (glisser). Renvoie le nombre de cases posées.
export function placeRoads(S, W, cells) {
  let n = 0;
  const road = S.road.split("");
  const terr = S.terr.split("");
  for (const [x, y] of cells) {
    if (roadError(S, W, x, y)) continue;
    pay(S, ROAD_COST[S.era]);
    const k = idx(x, y);
    road[k] = "1";
    W.road[k] = 1;
    if (terr[k] === String(T.FOREST)) { terr[k] = String(T.GRASS); W.terr[k] = T.GRASS; S.res.wood += 1; }
    n++;
  }
  if (n) { S.road = road.join(""); S.terr = terr.join(""); rebuild(S, W); }
  return n;
}

// Démolit ce qui se trouve sur une case. Renvoie un petit message (ou "").
export function bulldoze(S, W, x, y) {
  if (!inside(x, y)) return "";
  const k = idx(x, y);
  const bi = W.occ[k];
  if (bi >= 0) {
    const b = S.b[bi];
    const def = BY_ID[b.t];
    if (def.fixed) return "Le centre ne peut pas être démoli.";
    for (const [r, v] of Object.entries(def.cost)) if (r !== "know") S.res[r] += Math.floor(v * 0.25);
    S.b.splice(bi, 1);
    rebuild(S, W);
    return `${def.name} démoli (25 % remboursés).`;
  }
  if (W.road[k]) {
    const road = S.road.split(""); road[k] = "0"; S.road = road.join(""); W.road[k] = 0;
    rebuild(S, W);
    return "route";
  }
  const t = W.terr[k];
  if (t === T.FOREST || t === T.ROCK) {
    const terr = S.terr.split(""); terr[k] = String(T.GRASS); S.terr = terr.join(""); W.terr[k] = T.GRASS;
    if (t === T.FOREST) S.res.wood += 3; else S.res.stone += 3;
    rebuild(S, W);
    return t === T.FOREST ? "+3 bois" : "+3 pierre";
  }
  return "";
}

/* ===================== Simulation d'un mois ===================== */

export function wonderBonus(S) {
  return S.b.reduce((a, b) => a + (BY_ID[b.t].wonder || 0), 0);
}

// Bonheur d'une maison (0–100), avec le détail pour l'inspecteur.
export function houseHappiness(S, W, b) {
  const def = BY_ID[b.t];
  const cx = b.x, cy = b.y, s = def.size;
  const covered = [];
  for (const n of NEEDS) {
    let ok = false;
    for (let j = 0; j < s && !ok; j++) for (let i = 0; i < s; i++) if (W.cover[n][idx(cx + i, cy + j)]) { ok = true; break; }
    if (ok) covered.push(n);
  }
  let decor = 0, pol = 0;
  for (let j = 0; j < s; j++) for (let i = 0; i < s; i++) { decor = Math.max(decor, W.decor[idx(cx + i, cy + j)]); pol = Math.max(pol, W.pol[idx(cx + i, cy + j)]); }
  const parts = {
    base: 42,
    services: covered.length * 7,
    decor: Math.min(15, decor),
    wonders: Math.min(30, wonderBonus(S)),
    pollution: -Math.min(30, pol * 5),
    tax: S.tax > 8 ? -(S.tax - 8) * 2.5 : (8 - S.tax) * 1,
    food: S.res.food <= 0 ? -25 : 0,
    energy: S.era >= 4 ? -Math.round(18 * (1 - W.energy.ratio)) : 0,
    jobs: -Math.round(18 * Math.max(0, 1 - (W.workers ? W.jobs / W.workers : 1)) * (W.workers > 20 ? 1 : 0)),
    festival: S.festival > 0 ? 10 : 0
  };
  const total = Math.max(0, Math.min(100, Object.values(parts).reduce((a, v) => a + v, 0)));
  return { total, parts, covered, pol };
}

export function houseLevelFor(covered, happy, pol) {
  if (covered.length >= 5 && happy >= 55 && pol < 3) return 3;
  if (covered.length >= 2 && happy >= 40) return 2;
  return 1;
}

const EVENT_TEXT = {
  caravan: "Une caravane marchande fait halte : +{n} or.",
  harvest: "Récolte exceptionnelle : +{n} nourriture.",
  festival: "Grande fête en ville : +10 de bonheur pendant 12 mois !",
  plague: "Une épidémie frappe la ville : −{n} habitants.",
  fire: "Incendie : {b} brûle ! Clique dessus pour l'éteindre (ou couvre la ville en eau).",
  hack: "Cyberattaque ! Des données volées : −{n} savoir.",
  meteor: "Pluie d'étoiles filantes : les savants prennent des notes (+{n} savoir)."
};

// Fait avancer la ville d'un mois. Renvoie une liste d'évènements { type, text, tone, x, y }.
export function tick(S, W, random = Math.random) {
  if (W.dirty) rebuild(S, W);
  const events = [];
  const era = S.era;
  S.month++;
  if (S.festival > 0) S.festival--;

  // --- population et emplois
  let pop = 0;
  for (const b of S.b) if (isHouse(BY_ID[b.t])) pop += b.p;
  let jobs = 0;
  S.b.forEach((b, i) => { if (W.access[i] && !b.f) jobs += BY_ID[b.t].jobs; });
  const workers = Math.floor(pop * 0.6);
  const emp = jobs ? Math.min(1, workers / jobs) : 1;

  // --- énergie
  let eProd = 0, eNeed = 0;
  S.b.forEach((b, i) => {
    const def = BY_ID[b.t];
    if (!W.access[i] || b.f) return;
    if (def.energy > 0) {
      const fuelOk = Object.entries(def.use).every(([k, v]) => S.res[k] >= v);
      eProd += def.energy * (def.jobs ? emp : 1) * (fuelOk ? 1 : 0.2);
    } else if (def.energy < 0) eNeed -= def.energy;
    if (isHouse(def) && era >= 4) eNeed += b.p * 0.035;
  });
  const eRatio = eNeed ? Math.min(1, eProd / eNeed) : 1;
  W.energy = { prod: eProd, need: eNeed, ratio: eRatio };

  // --- production
  const delta = { food: 0, wood: 0, stone: 0, metal: 0, gold: 0, know: 0 };
  S.b.forEach((b, i) => {
    const def = BY_ID[b.t];
    if (!W.access[i] || b.f || isHouse(def)) return;
    let eff = (def.jobs ? emp : 1) * W.site[i] * techMult(S, def);
    if (def.energy < 0) eff *= eRatio;
    if (eff <= 0) return;
    // matières premières : la production baisse si le stock manque
    for (const [k, v] of Object.entries(def.use)) {
      const need = v * (def.jobs ? emp : 1);
      if (need <= 0) continue;
      const ok = Math.min(1, (S.res[k] + delta[k]) / need);
      if (def.energy <= 0) eff *= Math.max(0, ok);
      delta[k] -= need * Math.max(0, Math.min(1, ok));
    }
    for (const [k, v] of Object.entries(def.prod)) delta[k] += v * eff;
  });
  // impôt, savoir de la population, nourriture mangée, entretien
  delta.gold += pop * (S.tax / 100) * ERAS[era].tax;
  delta.know += pop * 0.004 * (1 + era * 0.5);
  delta.food -= pop * 0.12;
  const upkeep = S.b.reduce((a, b) => {
    const def = BY_ID[b.t];
    if (isHouse(def) || def.fixed) return a;
    return a + ((def.cost.gold || 0) * 0.0015 + (def.cost.stone || 0) * 0.0006 + (def.cost.wood || 0) * 0.0004);
  }, 0);
  delta.gold -= upkeep;
  for (const k of RES) S.res[k] = Math.max(0, Math.min(1e15, S.res[k] + delta[k]));
  W.rates = delta;
  W.upkeep = upkeep;

  // --- maisons : bonheur, niveau et habitants
  W.jobs = jobs; W.workers = workers; W.emp = emp;
  let happySum = 0, houses = 0, newPop = 0, top = 0;
  S.b.forEach((b, i) => {
    const def = BY_ID[b.t];
    if (!isHouse(def)) return;
    houses++;
    const hh = houseHappiness(S, W, b);
    const target = W.access[i] ? houseLevelFor(hh.covered, hh.total, hh.pol) : 1;
    // le niveau monte doucement, descend tout de suite
    if (target > b.l && random() < 0.25) b.l++;
    else if (target < b.l) b.l = target;
    const cap = houseCap(era, b.l, def);
    if (!W.access[i]) b.p = Math.max(0, b.p - Math.ceil(b.p * 0.1));
    else if (S.res.food <= 0 || hh.total < 28) b.p = Math.max(0, b.p - Math.max(1, Math.ceil(b.p * 0.05)));
    else if (hh.total >= 38 && b.p < cap) b.p = Math.min(cap, b.p + Math.max(1, Math.ceil(cap * 0.07 * (hh.total / 70))));
    if (b.p > cap) b.p = cap;
    happySum += hh.total * Math.max(1, b.p);
    newPop += b.p;
    top = Math.max(top, b.l);
  });
  const weight = S.b.reduce((a, b) => a + (isHouse(BY_ID[b.t]) ? Math.max(1, b.p) : 0), 0);
  W.happy = weight ? happySum / weight : 50;
  W.pop = newPop;
  W.houses = houses;
  if (newPop > S.best) S.best = newPop;

  // --- incendies en cours
  S.b.forEach((b, i) => {
    if (!b.f) return;
    const def = BY_ID[b.t];
    const wet = W.cover.eau[idx(b.x, b.y)] > 0;
    b.f -= wet ? 3 : 1;
    if (b.f <= 0) {
      delete b.f;
      if (!wet && random() < 0.5) {
        events.push({ type: "burned", text: `${def.name} a brûlé…`, tone: "bad", x: b.x, y: b.y, remove: i });
      } else events.push({ type: "out", text: `L'incendie (${def.name}) est éteint.`, tone: "", x: b.x, y: b.y });
    }
  });
  const burned = events.filter((e) => e.remove !== undefined).map((e) => e.remove).sort((a, b) => b - a);
  for (const i of burned) S.b.splice(i, 1);
  if (burned.length) W.dirty = true;

  // --- évènements aléatoires (environ tous les 4 ans)
  if (S.month > 24 && random() < 1 / 48) {
    const roll = random();
    const scale = Math.max(20, newPop * (1 + era));
    if (roll < 0.22) { const n = Math.round(scale * 0.8); S.res.gold += n; events.push({ type: "caravan", text: EVENT_TEXT.caravan.replace("{n}", n), tone: "win" }); }
    else if (roll < 0.42) { const n = Math.round(scale * 0.6); S.res.food += n; events.push({ type: "harvest", text: EVENT_TEXT.harvest.replace("{n}", n), tone: "win" }); }
    else if (roll < 0.55) { S.festival = 12; events.push({ type: "festival", text: EVENT_TEXT.festival, tone: "win" }); }
    else if (roll < 0.68 && newPop > 60) {
      let health = 0, total = 0;
      for (const b of S.b) if (isHouse(BY_ID[b.t])) { total++; if (W.cover.sante[idx(b.x, b.y)]) health++; }
      const lost = Math.round(newPop * 0.12 * (1 - (total ? health / total : 0)));
      if (lost > 0) {
        let left = lost;
        for (const b of S.b) if (isHouse(BY_ID[b.t]) && left > 0 && !W.cover.sante[idx(b.x, b.y)]) { const d = Math.min(b.p, Math.ceil(lost / Math.max(1, total - health))); b.p -= d; left -= d; }
        events.push({ type: "plague", text: EVENT_TEXT.plague.replace("{n}", lost), tone: "bad" });
      }
    } else if (roll < 0.88 && era >= 1) {
      const cand = S.b.filter((b) => !BY_ID[b.t].fixed && !BY_ID[b.t].wonder && !b.f && !(W.cover.ordre[idx(b.x, b.y)] && random() < 0.6));
      if (cand.length) {
        const b = cand[Math.floor(random() * cand.length)];
        b.f = 14;
        S.stats.fires++;
        events.push({ type: "fire", text: EVENT_TEXT.fire.replace("{b}", BY_ID[b.t].name), tone: "bad", x: b.x, y: b.y });
      }
    } else if (era >= 6 && roll < 0.95) {
      const safe = W.cover.ordre[idx(CENTER.x, CENTER.y)] > 0;
      const n = Math.round(S.res.know * (safe ? 0.02 : 0.08));
      S.res.know -= n;
      events.push({ type: "hack", text: EVENT_TEXT.hack.replace("{n}", n), tone: "bad" });
    } else {
      const n = Math.round(scale * 0.3);
      S.res.know += n;
      events.push({ type: "meteor", text: EVENT_TEXT.meteor.replace("{n}", n), tone: "win" });
    }
  }

  // --- succès
  const wonders = S.b.filter((b) => BY_ID[b.t].wonder).length;
  const checks = {
    pop100: newPop >= 100, pop1000: newPop >= 1000, pop5000: newPop >= 5000, pop10000: newPop >= 10000,
    house3: top >= 3, wonder3: wonders >= 3, wonder8: wonders >= 8, happy90: newPop >= 500 && W.happy >= 90,
    victory: S.b.some((b) => b.t === "w7")
  };
  for (const [id, ok] of Object.entries(checks)) if (ok && !S.ach.includes(id)) { S.ach.push(id); events.push({ type: "ach", id }); }
  if (checks.victory && !S.won) { S.won = true; events.push({ type: "victory" }); }
  return events;
}

export function extinguish(S, b) {
  const price = Math.max(10, Math.round(25 * (1 + S.era) ** 1.6));
  if (!b?.f) return "";
  if (S.res.gold < price) return `Il faut ${price} or pour éteindre le feu.`;
  S.res.gold -= price;
  delete b.f;
  return `Feu éteint (−${price} or).`;
}
export const extinguishPrice = (S) => Math.max(10, Math.round(25 * (1 + S.era) ** 1.6));

/* ===================== Ères ===================== */

export function advanceInfo(S, W) {
  const next = ADVANCE[S.era + 1];
  if (!next) return null;
  const pop = W.pop;
  const rows = [{ key: "pop", label: "Habitants", have: pop, need: next.pop, ok: pop >= next.pop }];
  for (const [k, v] of Object.entries(next.cost)) rows.push({ key: k, label: RES_NAMES[k], have: S.res[k], need: v, ok: S.res[k] >= v });
  return { era: S.era + 1, rows, ok: rows.every((r) => r.ok) };
}

export function advance(S, W) {
  const info = advanceInfo(S, W);
  if (!info || !info.ok) return false;
  for (const [k, v] of Object.entries(ADVANCE[info.era].cost)) S.res[k] -= v;
  S.era = info.era;
  S.em = S.month;
  const id = `era${S.era}`;
  if (!S.ach.includes(id)) S.ach.push(id);
  W.dirty = true;
  return true;
}

export function yearOf(S) {
  // le temps file plus vite aux époques anciennes
  const speed = [60, 12, 4, 2, 1.5, 1, 0.6, 0.4][S.era];
  return ERAS[S.era].year + Math.floor(((S.month - (S.em || 0)) / 12) * speed);
}
