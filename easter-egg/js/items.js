// js/items.js — 100 améliorations supplémentaires du Donjon (+ 8 objets légendaires du boss secret).
// Chaque entrée : [id, nom, max, effets]. Les effets sont des modificateurs de statistiques :
//   multiplicateurs (damage, rate, speed, projSpeed, magnet, range, arc, skillCd) ; ajouts (le reste) ;
//   maxHp s'ajoute et soigne d'autant ; shield ajoute des charges de bouclier ; frost active le givre.

const MULT = new Set(["damage", "rate", "speed", "projSpeed", "magnet", "range", "arc", "skillCd"]);
const LABEL = {
  damage: (v) => `${v >= 1 ? "+" : "−"}${Math.round(Math.abs(v - 1) * 100)} % de dégâts`,
  rate: (v) => `${v >= 1 ? "+" : "−"}${Math.round(Math.abs(v - 1) * 100)} % de vitesse d'attaque`,
  speed: (v) => `${v >= 1 ? "+" : "−"}${Math.round(Math.abs(v - 1) * 100)} % de vitesse de déplacement`,
  projSpeed: (v) => `+${Math.round((v - 1) * 100)} % de vitesse des projectiles`,
  magnet: (v) => `+${Math.round((v - 1) * 100)} % de portée de ramassage`,
  range: (v) => `+${Math.round((v - 1) * 100)} % de portée (mêlée)`,
  arc: (v) => `+${Math.round((v - 1) * 100)} % d'arc (mêlée)`,
  skillCd: (v) => `ultime rechargé ${Math.round((1 - v) * 100)} % plus vite`,
  crit: (v) => `+${Math.round(v * 100)} % de critiques`,
  critDmg: (v) => `+${Math.round(v * 100)} % de dégâts critiques`,
  vampire: (v) => `+${v} PV par ennemi vaincu`,
  burn: (v) => `brûlure +${v}`,
  frost: () => "tes coups ralentissent",
  regen: (v) => `+${v} PV/s`,
  orbs: (v) => `+${v} orbe${v > 1 ? "s" : ""} gardien${v > 1 ? "s" : ""}`,
  thorns: (v) => `épines +${v}`,
  berserk: (v) => `sang chaud +${v}`,
  coinMul: (v) => `+${Math.round(v * 100)} % de pièces`,
  shots: (v) => `+${v} projectile`,
  pierce: (v) => `+${v} perforation`,
  bomb: (v) => `détonateur +${v}`,
  maxHp: (v) => `${v >= 0 ? "+" : "−"}${Math.abs(v)} PV max`,
  shield: (v) => `+${v} charge${v > 1 ? "s" : ""} de bouclier`,
  armor: (v) => `−${Math.round(v * 100)} % de dégâts subis`,
  dodge: (v) => `${Math.round(v * 100)} % d'esquive`,
  leech: (v) => `${(v * 100).toFixed(1)} % des dégâts rendus en PV`,
  execute: (v) => `+${Math.round(v * 100)} % de dégâts sous 25 % de vie`,
  bossDmg: (v) => `+${Math.round(v * 100)} % de dégâts aux boss`,
  eliteDmg: (v) => `+${Math.round(v * 100)} % de dégâts aux élites`,
  heartDrop: (v) => `+${Math.round(v * 100)} % de cœurs lâchés`,
  skillPower: (v) => `+${Math.round(v * 100)} % de puissance d'ultime`,
  slowAura: () => "ralentit les ennemis proches",
  burnAura: () => "brûle les ennemis proches",
  invBonus: (v) => `+${v.toFixed(2)} s d'invulnérabilité après un coup`,
  bounty: (v) => `+${v} pièce par ennemi`
};
const cap = (s) => s.charAt(0).toUpperCase() + s.slice(1);

function make(id, name, max, spec, legend = false) {
  const keys = Object.keys(spec);
  const desc = cap(keys.map((k) => LABEL[k](spec[k])).join(", "));
  return [id, {
    name, desc, max, legend,
    apply: (s, p) => {
      for (const k of keys) {
        const v = spec[k];
        if (k === "maxHp") { s.maxHp = Math.max(20, s.maxHp + v); p.hp = Math.min(s.maxHp, v > 0 ? p.hp + v : p.hp); }
        else if (k === "shield") { s.shieldMax += v; p.shield = Math.min(s.shieldMax, p.shield + v); s.shieldCd = Math.max(5, 15 - 2 * (s.shieldMax - 1)); }
        else if (k === "frost") s.frost = 1;
        else if (k === "skillPower") s.skillPower += v;
        else if (MULT.has(k)) s[k] = (s[k] || 0) * v;
        else s[k] = (s[k] || 0) + v;
      }
    }
  }];
}

const ROWS = [
  /* Attaque */
  ["whet", "Pierre à aiguiser", 8, { damage: 1.10 }],
  ["oilblade", "Lame huilée", 6, { damage: 1.08, rate: 1.06 }],
  ["runepow", "Rune de puissance", 5, { damage: 1.15 }],
  ["adrenal", "Adrénaline", 6, { rate: 1.12 }],
  ["nervous", "Gâchette nerveuse", 5, { rate: 1.10, crit: 0.03 }],
  ["bloodpact", "Pacte sanglant", 3, { damage: 1.35, maxHp: -15 }],
  ["eagle", "Œil d'aigle", 5, { crit: 0.06 }],
  ["deadly", "Coup fatal", 4, { critDmg: 0.35 }],
  ["surgeon", "Précision chirurgicale", 4, { crit: 0.04, critDmg: 0.2 }],
  ["headsman", "Bourreau", 4, { execute: 0.5 }],
  ["giantbane", "Tueur de géants", 4, { bossDmg: 0.2 }],
  ["elitehunt", "Chasseur d'élite", 4, { eliteDmg: 0.25 }],
  ["pierceammo", "Munitions perforantes", 3, { pierce: 1 }],
  ["bigmag", "Chargeur étendu", 3, { shots: 1, damage: 0.92 }],
  ["boomammo", "Balles explosives", 3, { bomb: 1 }],
  ["boilingoil", "Huile bouillante", 3, { burn: 1 }],
  ["emberblade", "Lame de braise", 3, { burn: 1, damage: 1.05 }],
  ["polar", "Frisson polaire", 1, { frost: 1 }],
  ["twinblades", "Lames jumelles", 3, { range: 1.12, arc: 1.12 }],
  ["swiftshot", "Projectiles véloces", 4, { projSpeed: 1.15 }],
  ["fury", "Furie", 3, { berserk: 1 }],
  ["bloodthirst", "Soif de sang", 4, { vampire: 1, damage: 1.04 }],
  ["lifesteal", "Vol de vie", 4, { leech: 0.015 }],
  ["seismic", "Frappe sismique", 3, { range: 1.2, damage: 1.05 }],
  ["overload", "Surcharge", 3, { damage: 1.2, rate: 0.95 }],
  /* Défense */
  ["plate", "Plastron renforcé", 5, { armor: 0.05 }],
  ["heavyarm", "Armure lourde", 4, { armor: 0.08, speed: 0.97 }],
  ["dragonheart", "Cœur de dragon", 6, { maxHp: 30 }],
  ["titanheart", "Cœur de titan", 3, { maxHp: 60 }],
  ["stoneskin", "Peau de pierre", 4, { armor: 0.06, maxHp: 10 }],
  ["catreflex", "Réflexes félins", 5, { dodge: 0.05 }],
  ["shadowcape", "Cape d'ombre", 3, { dodge: 0.08, speed: 1.04 }],
  ["twinshield", "Bouclier jumeau", 2, { shield: 1 }],
  ["quantum", "Barrière quantique", 2, { shield: 1, skillCd: 0.95 }],
  ["nanoplus", "Nanobots avancés", 4, { regen: 0.6 }],
  ["regenskin", "Peau régénérante", 3, { regen: 0.4, maxHp: 10 }],
  ["reprieve", "Sursis", 4, { invBonus: 0.15 }],
  ["sharpthorn", "Épines acérées", 4, { thorns: 1 }],
  ["glassthorn", "Épines vitrifiées", 3, { thorns: 2, armor: 0.03 }],
  ["frostaura", "Aura glaciale", 1, { slowAura: 1 }],
  ["flamehalo", "Halo de feu", 3, { burnAura: 1 }],
  ["guardorb", "Orbe protectrice", 4, { orbs: 1 }],
  ["constell", "Constellation", 2, { orbs: 2, damage: 0.95 }],
  ["vest", "Gilet pare-balles", 4, { armor: 0.04, dodge: 0.03 }],
  ["lifetalisman", "Talisman de vie", 3, { heartDrop: 0.06, maxHp: 10 }],
  /* Mobilité & butin */
  ["windsole", "Semelles de vent", 5, { speed: 1.07 }],
  ["leagueboots", "Bottes de sept lieues", 3, { speed: 1.12 }],
  ["strongmag", "Aimant puissant", 4, { magnet: 1.5 }],
  ["bottomless", "Bourse sans fond", 4, { coinMul: 0.3 }],
  ["pillager", "Pillard", 4, { bounty: 1 }],
  ["thiefluck", "Chance du voleur", 3, { heartDrop: 0.05, coinMul: 0.15 }],
  ["clover", "Trèfle à quatre feuilles", 3, { heartDrop: 0.08 }],
  ["goldtooth", "Dent en or", 3, { coinMul: 0.2, bounty: 1 }],
  ["scavenger", "Charognard", 3, { vampire: 1, bounty: 1 }],
  ["lightfoot", "Pas léger", 4, { speed: 1.05, dodge: 0.02 }],
  ["huntinstinct", "Instinct de chasseur", 3, { speed: 1.05, crit: 0.03 }],
  ["swiftcloak", "Manteau véloce", 3, { speed: 1.08, rate: 1.04 }],
  ["pocketwatch", "Aimant à reliques", 3, { magnet: 1.3, coinMul: 0.1 }],
  ["bountyhunter", "Chasseur de primes", 3, { bounty: 2, eliteDmg: 0.15 }],
  ["tinkerer", "Bricoleur", 3, { regen: 0.3, magnet: 1.2 }],
  /* Ultime */
  ["pocketclock", "Horloge de poche", 4, { skillCd: 0.9 }],
  ["amplifier", "Amplificateur", 5, { skillPower: 0.2 }],
  ["masterycrystal", "Cristal de maîtrise", 3, { skillPower: 0.35, skillCd: 0.95 }],
  ["condenser", "Condensateur", 4, { skillCd: 0.88 }],
  ["ultitome", "Grimoire d'ultime", 3, { skillPower: 0.5, damage: 0.95 }],
  ["overdrive", "Surrégime", 3, { skillCd: 0.85, rate: 1.04 }],
  ["focuslens", "Lentille de focalisation", 3, { skillPower: 0.3, crit: 0.03 }],
  ["rechargecell", "Cellule de recharge", 4, { skillCd: 0.92, regen: 0.15 }],
  ["finalform", "Forme finale", 2, { skillPower: 0.6, skillCd: 0.9 }],
  ["tempoamulet", "Amulette du tempo", 3, { skillCd: 0.9, speed: 1.03 }],
  /* Hybrides & spécialités */
  ["knightcode", "Code du chevalier", 3, { armor: 0.05, damage: 1.06, maxHp: 10 }],
  ["rogueblade", "Lame de l'ombre", 3, { crit: 0.05, dodge: 0.04 }],
  ["archerquiver", "Carquois sans fond", 3, { shots: 1, projSpeed: 1.1 }],
  ["magecirclet", "Diadème arcanique", 3, { skillPower: 0.25, pierce: 1 }],
  ["warbanner", "Étendard de guerre", 3, { damage: 1.08, rate: 1.05, armor: 0.02 }],
  ["bloodmoon", "Lune de sang", 3, { leech: 0.01, crit: 0.04, damage: 1.05 }],
  ["thunderstone", "Pierre de foudre", 3, { rate: 1.08, projSpeed: 1.1 }],
  ["frostcore", "Cœur de givre", 2, { frost: 1, armor: 0.04 }],
  ["magmacore", "Noyau de magma", 3, { burn: 1, burnAura: 1 }],
  ["voidshard", "Éclat du néant", 3, { pierce: 1, crit: 0.04 }],
  ["ironwill", "Volonté de fer", 3, { maxHp: 20, armor: 0.04, regen: 0.2 }],
  ["glasscannon2", "Canon de cristal", 2, { damage: 1.4, maxHp: -20 }],
  ["spikebelt", "Ceinture à pointes", 3, { thorns: 1, armor: 0.03 }],
  ["spiritlamp", "Lampe d'esprit", 3, { magnet: 1.25, heartDrop: 0.04 }],
  ["gamblercoin", "Pièce du joueur", 3, { crit: 0.05, coinMul: 0.15 }],
  ["steelnerves", "Nerfs d'acier", 3, { invBonus: 0.1, dodge: 0.03 }],
  ["tideamulet", "Amulette des marées", 3, { regen: 0.35, skillCd: 0.96 }],
  ["duelist", "Gant du duelliste", 3, { crit: 0.04, critDmg: 0.15, rate: 1.04 }],
  ["siegebreaker", "Brise-siège", 3, { bossDmg: 0.15, damage: 1.05 }],
  ["vultureeye", "Œil de vautour", 3, { execute: 0.3, crit: 0.03 }],
  ["tinyfairy", "Fée captive", 3, { heartDrop: 0.05, regen: 0.25 }],
  ["rustyhelm", "Heaume rouillé", 3, { armor: 0.04, maxHp: 15 }],
  ["moonprism", "Prisme lunaire", 2, { shots: 1, damage: 1.05 }],
  ["stormcall", "Appel de la tempête", 3, { rate: 1.06, skillPower: 0.15 }],
  ["plaguemask", "Masque de peste", 3, { burnAura: 1, slowAura: 1 }],
  ["ancientrelic", "Relique antique", 3, { damage: 1.06, maxHp: 15, coinMul: 0.1 }],
  ["chaossigil", "Sceau du chaos", 3, { crit: 0.07, damage: 0.96 }],
  ["ironfist", "Poing de fer", 3, { damage: 1.07, thorns: 1 }],
  ["swiftblood", "Sang rapide", 3, { regen: 0.3, rate: 1.05 }],
  ["goldenaegis", "Égide dorée", 2, { shield: 1, coinMul: 0.15 }]
];
export const LEGENDS = [
  ["crownvoid", "Couronne du Néant", 1, { damage: 1.6, rate: 1.2, maxHp: 50 }],
  ["eclipseheart", "Cœur de l'Éclipse", 1, { maxHp: 150, regen: 2, armor: 0.15 }],
  ["worldblade", "Lame des mondes", 1, { damage: 1.4, crit: 0.2, critDmg: 1 }],
  ["cosmichourglass", "Sablier cosmique", 1, { skillCd: 0.5, skillPower: 1 }],
  ["fallenangel", "Ange déchu", 1, { dodge: 0.2, speed: 1.2, shield: 2 }],
  ["endlesshunger", "Faim insatiable", 1, { leech: 0.05, vampire: 3, execute: 1 }],
  ["thorncrown", "Couronne d'épines", 1, { thorns: 5, orbs: 3, armor: 0.1 }],
  ["starprism", "Prisme d'étoiles", 1, { shots: 2, pierce: 3, bomb: 2 }]
];

export const EXTRA_ITEMS = Object.fromEntries([...ROWS.map((r) => make(...r)), ...LEGENDS.map((r) => make(...r, true))]);
export const EXTRA_COUNT = ROWS.length;
