// js/synergy.js — étiquettes des armes et synergies entre armes (arme principale + armes secondaires obtenues via les reliques).
// Une synergie s'active dès que la combinaison d'étiquettes est réunie, une seule fois par partie (bonus de stats permanents).

import { specText } from "./items.js";

export const TAGS = {
  sword: ["melee"], dagger: ["melee", "fast"], axe: ["melee", "heavy"], spear: ["melee", "pierce"], hammer: ["melee", "heavy", "shock"],
  whip: ["melee"], scythe: ["melee"], katana: ["melee", "fast"], gauntlet: ["melee", "lightning", "fast"],
  bow: ["ranged", "pierce"], wand: ["ranged", "arcane"], crossbow: ["ranged", "pierce", "heavy"], shotgun: ["ranged", "spray"], smg: ["ranged", "spray", "fast"],
  boomerang: ["ranged", "bounce"], chakram: ["ranged", "bounce", "pierce"], saw: ["ranged", "bounce", "pierce"], missiles: ["ranged", "explosive"],
  fireball: ["ranged", "fire", "explosive"], frost: ["ranged", "ice"], lightning: ["ranged", "lightning", "energy"], laser: ["energy", "beam", "pierce"],
  railgun: ["energy", "beam", "pierce", "heavy"], spiral: ["ranged", "arcane", "spray"], nova: ["ranged", "arcane", "spray"], mine: ["explosive"],
  grenade: ["explosive"], flame: ["fire", "spray"], meteor: ["fire", "explosive", "heavy"], hole: ["gravity", "arcane"], poison: ["poison"],
  tesla: ["lightning", "energy"], drone: ["summon", "energy"], echo: ["ranged", "arcane", "fast"]
};

export const TAG_NAMES = { melee: "mêlée", ranged: "distance", fire: "feu", ice: "glace", lightning: "foudre", poison: "poison", explosive: "explosif", gravity: "gravité",
  pierce: "perforant", bounce: "ricochet", spray: "gerbe", summon: "invocation", arcane: "arcane", energy: "énergie", beam: "rayon", fast: "rapide", heavy: "lourd", shock: "choc" };

// need(c, n) : c(tag) = nombre d'armes portant l'étiquette ; n = nombre total d'armes.
export const SYNERGIES = [
  { id: "thermal",   name: "Choc thermique",     hint: "feu + glace",           need: (c) => c("fire") >= 1 && c("ice") >= 1,           spec: { thermal: 0.4, burn: 1 } },
  { id: "gas",       name: "Gaz inflammable",    hint: "poison + feu",          need: (c) => c("poison") >= 1 && c("fire") >= 1,        spec: { burn: 2, damage: 1.1 } },
  { id: "stormy",    name: "Tempête électrique", hint: "2 armes de foudre",     need: (c) => c("lightning") >= 2,                       spec: { rate: 1.15, crit: 0.08 } },
  { id: "conduct",   name: "Eau conductrice",    hint: "glace + foudre",        need: (c) => c("ice") >= 1 && c("lightning") >= 1,      spec: { crit: 0.1, critDmg: 0.5 } },
  { id: "plasma",    name: "Plasma",             hint: "feu + foudre",          need: (c) => c("fire") >= 1 && c("lightning") >= 1,     spec: { damage: 1.15, pierce: 1 } },
  { id: "cryotoxin", name: "Cryotoxine",         hint: "glace + poison",        need: (c) => c("ice") >= 1 && c("poison") >= 1,         spec: { frost: 1, leech: 0.02 } },
  { id: "singular",  name: "Effondrement",       hint: "gravité + explosif",    need: (c) => c("gravity") >= 1 && c("explosive") >= 1,  spec: { bomb: 2, pierce: 1 } },
  { id: "toxpit",    name: "Fosse toxique",      hint: "poison + gravité",      need: (c) => c("poison") >= 1 && c("gravity") >= 1,     spec: { slowAura: 1, damage: 1.1 } },
  { id: "shells",    name: "Pluie d'obus",       hint: "2 armes explosives",    need: (c) => c("explosive") >= 2,                       spec: { bomb: 2, damage: 1.1 } },
  { id: "master",    name: "Maître d'armes",     hint: "2 armes de mêlée",      need: (c) => c("melee") >= 2,                           spec: { damage: 1.2, arc: 1.15 } },
  { id: "barrage",   name: "Barrage",            hint: "2 armes à distance",    need: (c) => c("ranged") >= 2,                          spec: { shots: 1 } },
  { id: "ricochet",  name: "Ricochet perforant", hint: "ricochet + perforant",  need: (c) => c("bounce") >= 1 && c("pierce") >= 1,      spec: { pierce: 2, projSpeed: 1.1 } },
  { id: "focus",     name: "Faisceau focalisé",  hint: "rayon + arcane",        need: (c) => c("beam") >= 1 && c("arcane") >= 1,        spec: { pierce: 2, crit: 0.08 } },
  { id: "legion",    name: "Légion",             hint: "invocation + une autre arme", need: (c, n) => c("summon") >= 1 && n >= 2,       spec: { orbs: 2 } },
  { id: "twin",      name: "Lames jumelles",     hint: "2 armes rapides",       need: (c) => c("fast") >= 2,                            spec: { rate: 1.2 } },
  { id: "heavy",     name: "Poids lourds",       hint: "2 armes lourdes",       need: (c) => c("heavy") >= 2,                           spec: { damage: 1.3, execute: 0.5 } },
  { id: "versatile", name: "Guerrier polyvalent", hint: "mêlée + distance",     need: (c) => c("melee") >= 1 && (c("ranged") + c("energy") + c("explosive") + c("fire")) >= 1, spec: { speed: 1.08, vampire: 1 } },
  { id: "arsenal",   name: "Arsenal",            hint: "3 armes",               need: (c, n) => n >= 3,                                 spec: { damage: 1.15, rate: 1.1 } },
  { id: "full",      name: "Plein arsenal",      hint: "4 armes",               need: (c, n) => n >= 4,                                 spec: { damage: 1.25, shots: 1, maxHp: 40 } }
];
SYNERGIES.forEach((s) => { s.text = specText(s.spec); });

export function activeSynergies(weaponIds) {
  const tags = weaponIds.map((id) => TAGS[id] || []);
  const c = (t) => tags.filter((a) => a.includes(t)).length;
  return SYNERGIES.filter((s) => s.need(c, weaponIds.length));
}
