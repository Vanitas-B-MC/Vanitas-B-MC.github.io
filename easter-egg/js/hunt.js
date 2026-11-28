// js/hunt.js — logique pure de « Chasse aux Titans » (aucun accès au DOM).
//
// Un RPG de capture au tour par tour, façon Pokémon : on capture des créatures mécaniques, on monte une équipe de 6,
// et on affronte des dresseurs, 8 Gardiens, le Conseil des Titans et les Titans légendaires.
// Tactique : 14 types et leurs faiblesses, attaques physiques / spéciales, PP, priorité, vitesse, statuts, stats
// modifiables en combat, météo, talents, objets tenus, pièges, changements de créature (l'IA en fait aussi).
//
// Le combat produit une liste d'événements (message, PV, animation, envoi d'une créature…) que l'interface
// rejoue un par un : la logique reste testable sans navigateur.

import { TYPES, CHART, MOVES, STATUS, WEATHER, STAT_NAMES, ABILITIES, ITEMS, ITEM_IDS, SPECIES, SPECIES_IDS, STARTERS, ZONES, LEADERS, COUNCIL, LEGENDS } from "./hunt-data.js";

export { TYPES, MOVES, STATUS, WEATHER, STAT_NAMES, ABILITIES, ITEMS, ITEM_IDS, SPECIES, SPECIES_IDS, STARTERS, ZONES, LEADERS, COUNCIL, LEGENDS };

export const MAX_LEVEL = 70;
export const TEAM_MAX = 6;
export const BOX_MAX = 300;
export const RELEARN_COST = 300;
export const STAT_KEYS = ["atk", "def", "spa", "spd", "spe"];
const STRUGGLE = { id: "lutte", name: "Lutte", type: null, cat: "phys", pow: 50, acc: null, pp: 1, pri: 0, c: true, crit: 0, fx: [{ k: "rc", f: 0.25 }] };

/* =========================================================
   CRÉATURES : stats, expérience, attaques
========================================================= */

export const xpFor = (lv) => (lv <= 1 ? 0 : Math.floor(0.6 * lv ** 3));
export const speciesOf = (mon) => SPECIES[mon.s];
export const nameOf = (mon) => mon.n || SPECIES[mon.s].name;
export const typesOf = (mon) => SPECIES[mon.s].types;
export const abilityOf = (mon) => SPECIES[mon.s].ability;

// [PV, Atq, Déf, Atq Spé, Déf Spé, Vit] calculés comme dans Pokémon (sans natures ni EV).
export function statsOf(mon) {
  const b = SPECIES[mon.s].base;
  const iv = mon.iv;
  const lv = mon.lv;
  const other = (i) => Math.floor(((2 * b[i] + iv[i]) * lv) / 100) + 5;
  return {
    hp: Math.floor(((2 * b[0] + iv[0]) * lv) / 100) + lv + 10,
    atk: other(1), def: other(2), spa: other(3), spd: other(4), spe: other(5)
  };
}
export const maxHpOf = (mon) => statsOf(mon).hp;

// Les 4 dernières attaques apprises à ce niveau.
export function movesAt(speciesId, lv) {
  const seen = [];
  for (const [at, id] of SPECIES[speciesId].learn) {
    if (at > lv) break;
    const i = seen.indexOf(id);
    if (i >= 0) seen.splice(i, 1);
    seen.push(id);
  }
  return seen.slice(-4);
}

export function createMon(speciesId, lv, rng = Math.random, { moves = null, uid = 0 } = {}) {
  const mon = {
    u: uid, s: speciesId, lv, xp: xpFor(lv), hp: 0, st: "", sl: 0, it: "",
    iv: Array.from({ length: 6 }, () => Math.floor(rng() * 32)),
    m: (moves || movesAt(speciesId, lv)).filter((id) => MOVES[id]).slice(0, 4).map((id) => [id, MOVES[id].pp])
  };
  mon.hp = maxHpOf(mon);
  return mon;
}

// Qualité des IV, de 0 à 5 étoiles (affichage).
export const ivStars = (mon) => Math.round((mon.iv.reduce((s, v) => s + v, 0) / (31 * 6)) * 5);

export function healMon(mon) {
  mon.hp = maxHpOf(mon);
  mon.st = "";
  mon.sl = 0;
  for (const mv of mon.m) mv[1] = MOVES[mv[0]].pp;
}

// Fait gagner de l'expérience. Renvoie les événements : niveaux gagnés et attaques apprises / à apprendre.
export function gainXp(mon, amount) {
  const out = { levels: [], learned: [], toLearn: [] };
  if (mon.lv >= MAX_LEVEL) return out;
  mon.xp = Math.min(mon.xp + Math.max(0, Math.floor(amount)), xpFor(MAX_LEVEL));
  while (mon.lv < MAX_LEVEL && mon.xp >= xpFor(mon.lv + 1)) {
    const before = maxHpOf(mon);
    mon.lv += 1;
    if (mon.hp > 0) mon.hp += maxHpOf(mon) - before;
    out.levels.push(mon.lv);
    for (const [at, id] of SPECIES[mon.s].learn) {
      if (at !== mon.lv || mon.m.some((mv) => mv[0] === id)) continue;
      if (mon.m.length < 4) { mon.m.push([id, MOVES[id].pp]); out.learned.push(id); }
      else out.toLearn.push(id);
    }
  }
  return out;
}

export const canEvolve = (mon) => { const e = SPECIES[mon.s].evo; return !!e && mon.lv >= e[0]; };

export function evolve(mon) {
  const e = SPECIES[mon.s].evo;
  if (!e) return null;
  const lost = maxHpOf(mon) - mon.hp;
  mon.s = e[1];
  if (mon.hp > 0) mon.hp = Math.max(1, maxHpOf(mon) - lost);
  return e[1];
}

// Remplace l'attaque n° slot (0 à 3) par moveId (ou l'ajoute s'il reste de la place).
export function teachMove(mon, moveId, slot) {
  if (!MOVES[moveId] || mon.m.some((mv) => mv[0] === moveId)) return false;
  if (mon.m.length < 4) mon.m.push([moveId, MOVES[moveId].pp]);
  else if (slot >= 0 && slot < 4) mon.m[slot] = [moveId, MOVES[moveId].pp];
  else return false;
  return true;
}

// Attaques déjà accessibles par niveau mais oubliées (Atelier des capacités).
export const relearnable = (mon) => [...new Set(SPECIES[mon.s].learn.filter(([at]) => at <= mon.lv).map(([, id]) => id))]
  .filter((id) => !mon.m.some((mv) => mv[0] === id));

/* =========================================================
   TYPES
========================================================= */

export function effectiveness(moveType, defTypes) {
  if (!moveType) return 1;
  let m = 1;
  for (const t of defTypes) m *= CHART[moveType]?.[t] ?? 1;
  return m;
}

export function effLabel(m) {
  if (m === 0) return "Aucun effet";
  if (m >= 4) return "Ultra efficace";
  if (m >= 2) return "Super efficace";
  if (m <= 0.25) return "Très peu efficace";
  if (m < 1) return "Peu efficace";
  return "";
}

/* =========================================================
   COMBAT
========================================================= */

const freshVol = () => ({ st: { atk: 0, def: 0, spa: 0, spd: 0, spe: 0 }, conf: 0, leech: false, prot: 0, protecting: false, flinch: false, usedProtect: false, turns: 0 });
const stageMult = (n) => (n >= 0 ? (2 + n) / 2 : 2 / (2 - n));

function makeSide(mons, extra) {
  return { mons, active: 0, vol: freshVol(), hazard: false, potions: 0, lastSwitch: -9, ...extra };
}

// kind : "wild" | "trainer" | "leader" | "council" | "legend"
// trainer : { name, title, skill, potions, reward, quote } pour les combats de dresseurs.
export function createBattle(hunt, foes, { kind = "wild", trainer = null, rng = Math.random, id = null } = {}) {
  const b = {
    kind, id, trainer, rng, hunt,
    sides: [
      makeSide(hunt.team, { player: true }),
      makeSide(foes, { player: false, skill: trainer ? trainer.skill ?? 1 : 0, potions: trainer?.potions ?? 0 })
    ],
    weather: null, weatherTurns: 0,
    turn: 0, over: false, result: null, needSwitch: false,
    ev: [], learn: [], seen: new Set(), part: new Set(), used: new Set(), runs: 0,
    caught: null, xpTotal: 0
  };
  b.sides[0].active = Math.max(0, hunt.team.findIndex((m) => m.hp > 0));
  return b;
}

export const active = (b, side) => b.sides[side].mons[b.sides[side].active];
export const isWild = (b) => b.kind === "wild" || b.kind === "legend";
export const aliveCount = (b, side) => b.sides[side].mons.filter((m) => m.hp > 0).length;

const say = (b, text) => b.ev.push({ t: "msg", text });
const hpEv = (b, side) => { const m = active(b, side); b.ev.push({ t: "hp", side, hp: m.hp, max: maxHpOf(m) }); };
const view = (mon) => ({ s: mon.s, name: nameOf(mon), lv: mon.lv, hp: mon.hp, max: maxHpOf(mon), st: mon.st, xp: mon.xp });
const sendEv = (b, side) => b.ev.push({ t: "send", side, mon: view(active(b, side)) });
const statusEv = (b, side) => b.ev.push({ t: "status", side, st: active(b, side).st, conf: b.sides[side].vol.conf > 0 });
const stagesEv = (b, side) => b.ev.push({ t: "stages", side, st: { ...b.sides[side].vol.st } });
const teamEv = (b, side) => b.ev.push({ t: "team", side, balls: b.sides[side].mons.map((m) => (m.hp > 0 ? (m.st ? "st" : "ok") : "ko")) });
const owner = (b, side) => (side === 0 ? "" : isWild(b) ? " sauvage" : " ennemi");
const label = (b, side) => `${nameOf(active(b, side))}${owner(b, side)}`;

function hurt(b, side, dmg) {
  const m = active(b, side);
  m.hp = Math.max(0, m.hp - Math.max(1, Math.floor(dmg)));
  hpEv(b, side);
}
function heal(b, side, amount) {
  const m = active(b, side);
  const before = m.hp;
  m.hp = Math.min(maxHpOf(m), m.hp + Math.max(1, Math.floor(amount)));
  hpEv(b, side);
  return m.hp - before;
}
const indirectOk = (mon) => abilityOf(mon) !== "gardemagique";

function setWeather(b, w, by) {
  if (b.weather === w) return false;
  b.weather = w;
  b.weatherTurns = 5;
  b.ev.push({ t: "weather", w });
  say(b, WEATHER[w].start);
  return true;
}

function changeStages(b, side, changes, quiet = false) {
  const vol = b.sides[side].vol;
  let any = false;
  for (const [k, d] of Object.entries(changes)) {
    const before = vol.st[k];
    vol.st[k] = Math.max(-6, Math.min(6, before + d));
    const name = `${STAT_NAMES[k]} de ${label(b, side)}`;
    if (vol.st[k] === before) { if (!quiet) say(b, `${name} ne peut plus ${d > 0 ? "monter" : "baisser"} !`); continue; }
    any = true;
    say(b, `${name} ${d > 0 ? "monte" : "baisse"}${Math.abs(d) >= 2 ? " beaucoup" : ""} !`);
  }
  if (any) { stagesEv(b, side); b.ev.push({ t: "anim", side, kind: Object.values(changes)[0] > 0 ? "up" : "down" }); }
  return any;
}

function applyStatus(b, side, s, loud = true) {
  const m = active(b, side);
  const vol = b.sides[side].vol;
  if (m.hp <= 0) return false;
  if (s === "conf") {
    if (vol.conf > 0) { if (loud) say(b, `${label(b, side)} est déjà confus.`); return false; }
    vol.conf = 2 + Math.floor(b.rng() * 4);
    say(b, `${label(b, side)} devient confus !`);
    statusEv(b, side);
    return true;
  }
  const types = typesOf(m);
  const immune = (s === "brn" && types.includes("plasma")) || (s === "par" && types.includes("volt"))
    || (s === "frz" && types.includes("cryo")) || (s === "psn" && (types.includes("virus") || types.includes("acier")))
    || (s === "frz" && b.weather === "sun");
  if (m.st || immune) { if (loud) say(b, m.st ? `${label(b, side)} a déjà un statut.` : `Ça n'affecte pas ${label(b, side)}…`); return false; }
  m.st = s;
  if (s === "slp") m.sl = 2 + Math.floor(b.rng() * 3);
  const verb = { brn: "est brûlé", par: "est paralysé ! Il aura du mal à attaquer", psn: "est empoisonné", slp: "s'endort", frz: "est gelé" }[s];
  say(b, `${label(b, side)} ${verb} !`);
  b.ev.push({ t: "anim", side, kind: "status", type: s });
  statusEv(b, side);
  teamEv(b, side);
  return true;
}

function speedOf(b, side) {
  const m = active(b, side);
  let v = statsOf(m).spe * stageMult(b.sides[side].vol.st.spe);
  if (m.st === "par") v *= 0.5;
  return v;
}

// Dégâts d'une attaque (sans les appliquer). roll : 0,85 à 1. Renvoie { dmg, eff, crit, absorb }.
export function damageOf(b, atkSide, move, { crit = false, roll = 0.925 } = {}) {
  const defSide = 1 - atkSide;
  const a = active(b, atkSide);
  const d = active(b, defSide);
  const defTypes = typesOf(d);
  const ab = abilityOf(a);
  const db = abilityOf(d);
  let eff = effectiveness(move.type, defTypes);
  if (move.type === "seisme" && db === "levitation") eff = 0;
  if (move.type === "volt" && db === "absorbevolt") return { dmg: 0, eff: 0, crit: false, absorb: true };
  if (eff === 0) return { dmg: 0, eff: 0, crit: false };
  const phys = move.cat === "phys";
  const sa = statsOf(a);
  const sd = statsOf(d);
  let aSt = b.sides[atkSide].vol.st[phys ? "atk" : "spa"];
  let dSt = b.sides[defSide].vol.st[phys ? "def" : "spd"];
  if (crit) { aSt = Math.max(0, aSt); dSt = Math.min(0, dSt); }
  let A = (phys ? sa.atk : sa.spa) * stageMult(aSt);
  let D = (phys ? sd.def : sd.spd) * stageMult(dSt);
  if (phys && a.st === "brn") A *= 0.5;
  if (!phys && b.weather === "sand" && defTypes.includes("seisme")) D *= 1.5;
  if (!phys && d.it === "gilet") D *= 1.5;
  let dmg = Math.floor(Math.floor((Math.floor((2 * a.lv) / 5 + 2) * move.pow * A) / D) / 50) + 2;
  if (b.weather === "sun") { if (move.type === "plasma") dmg *= 1.5; if (move.type === "hydro") dmg *= 0.5; }
  if (b.weather === "rain") { if (move.type === "hydro") dmg *= 1.5; if (move.type === "plasma") dmg *= 0.5; }
  if (crit) dmg *= ab === "sniper" ? 2.25 : 1.5;
  dmg *= roll;
  if (move.type && typesOf(a).includes(move.type)) dmg *= ab === "adaptabilite" ? 2 : 1.5;
  dmg *= eff;
  const pinch = ABILITIES[ab]?.pinch;
  if (pinch && pinch === move.type && a.hp <= maxHpOf(a) / 3) dmg *= 1.5;
  if (db === "isograisse" && (move.type === "plasma" || move.type === "cryo")) dmg *= 0.5;
  if (a.it === "orbevie") dmg *= 1.3;
  if (a.it === "bandeau" && phys) dmg *= 1.2;
  if (a.it === "lunettes" && !phys) dmg *= 1.2;
  return { dmg: Math.max(1, Math.floor(dmg)), eff, crit };
}

const targetsFoe = (move) => move.cat !== "stat" || move.fx.some((f) => f.k === "st" || f.k === "fs" || f.k === "lc");

function useMove(b, side, slot) {
  const me = active(b, side);
  const vol = b.sides[side].vol;
  const foeSide = 1 - side;

  // Peur, sommeil, gel, paralysie, confusion
  if (vol.flinch) { say(b, `${label(b, side)} a peur et ne bouge pas !`); return; }
  if (me.st === "slp") {
    me.sl -= 1;
    if (me.sl > 0) { say(b, `${label(b, side)} dort profondément.`); return; }
    me.st = ""; me.sl = 0; statusEv(b, side); teamEv(b, side);
    say(b, `${label(b, side)} se réveille !`);
  }
  if (me.st === "frz") {
    if (b.rng() < 0.2) { me.st = ""; statusEv(b, side); teamEv(b, side); say(b, `${label(b, side)} dégèle !`); }
    else { say(b, `${label(b, side)} est gelé !`); return; }
  }
  if (me.st === "par" && b.rng() < 0.25) { say(b, `${label(b, side)} est paralysé ! Il ne peut pas attaquer !`); return; }
  if (vol.conf > 0) {
    vol.conf -= 1;
    if (vol.conf === 0) { say(b, `${label(b, side)} n'est plus confus.`); statusEv(b, side); }
    else {
      say(b, `${label(b, side)} est confus…`);
      if (b.rng() < 1 / 3) {
        const s = statsOf(me);
        const raw = Math.floor(Math.floor((Math.floor((2 * me.lv) / 5 + 2) * 40 * s.atk * stageMult(vol.st.atk)) / (s.def * stageMult(vol.st.def))) / 50) + 2;
        say(b, "Il se blesse dans sa confusion !");
        b.ev.push({ t: "anim", side, kind: "hit" });
        hurt(b, side, raw * (0.85 + b.rng() * 0.15));
        if (me.hp <= 0) faint(b, side);
        return;
      }
    }
  }

  // Attaque choisie (ou Lutte s'il n'y a plus de PP)
  let move;
  const usable = me.m.some((mv) => mv[1] > 0);
  if (!usable || slot < 0) move = STRUGGLE;
  else {
    const mv = me.m[slot] && me.m[slot][1] > 0 ? me.m[slot] : me.m.find((x) => x[1] > 0);
    mv[1] -= 1;
    move = MOVES[mv[0]];
  }
  say(b, `${label(b, side)} utilise ${move.name} !`);
  const isProtect = move.fx.some((f) => f.k === "pr");
  if (!isProtect) vol.prot = 0;

  const foeVol = b.sides[foeSide].vol;
  const foe = active(b, foeSide);
  const hitsFoe = move.pow > 0 || targetsFoe(move);

  if (hitsFoe && foe.hp <= 0) { say(b, "Mais il n'y a pas de cible…"); return; }
  if (hitsFoe && foeVol.protecting) { say(b, `${label(b, foeSide)} se protège !`); return; }

  // Précision
  const sure = move.acc === null || (move.rainSure && b.weather === "rain") || (move.hailSure && b.weather === "hail");
  if (!sure && b.rng() * 100 >= move.acc) { say(b, `${label(b, foeSide)} évite l'attaque !`); return; }

  if (move.pow > 0) {
    const critStage = move.crit + (me.it === "lentille" ? 1 : 0);
    const crit = b.rng() < [1 / 24, 1 / 8, 1 / 2, 1][Math.min(3, critStage)];
    const res = damageOf(b, side, move, { crit, roll: 0.85 + b.rng() * 0.15 });
    if (res.absorb) {
      say(b, `${label(b, foeSide)} absorbe l'électricité !`);
      if (foe.hp < maxHpOf(foe)) heal(b, foeSide, maxHpOf(foe) / 4);
      return;
    }
    if (res.eff === 0) { say(b, `Ça n'affecte pas ${label(b, foeSide)}…`); return; }
    let dmg = Math.min(res.dmg, foe.hp);
    const full = foe.hp === maxHpOf(foe);
    if (dmg >= foe.hp && full && foe.hp > 1) {
      if (abilityOf(foe) === "fermete") { dmg = foe.hp - 1; b.ev.push({ t: "later", text: `${label(b, foeSide)} tient bon grâce à Fermeté !` }); }
      else if (foe.it === "ceinture" && !b.used.has(foe)) { dmg = foe.hp - 1; b.used.add(foe); b.ev.push({ t: "later", text: `${label(b, foeSide)} tient bon grâce à sa Ceinture Force !` }); }
    }
    b.ev.push({ t: "anim", side, kind: "attack", type: move.type || "chrome", cat: move.cat });
    b.ev.push({ t: "anim", side: foeSide, kind: "hit", eff: res.eff });
    hurt(b, foeSide, dmg);
    if (res.crit) say(b, "Coup critique !");
    const lbl = effLabel(res.eff);
    if (lbl) say(b, `${lbl} !`);
    const later = b.ev.findIndex((e) => e.t === "later");
    if (later >= 0) { const e = b.ev.splice(later, 1)[0]; say(b, e.text); }
    if (move.type === "plasma" && foe.st === "frz" && foe.hp > 0) { foe.st = ""; statusEv(b, foeSide); teamEv(b, foeSide); say(b, `${label(b, foeSide)} dégèle !`); }

    // Talents de contact
    const fab = abilityOf(foe);
    if (move.c && me.hp > 0 && (fab === "statique" || fab === "corpsardent") && b.rng() < 0.3) {
      say(b, `${ABILITIES[fab].name} de ${label(b, foeSide)} !`);
      applyStatus(b, side, fab === "statique" ? "par" : "brn", false);
    }
    // Drain, contrecoup, Orbe Vie
    for (const f of move.fx) {
      if (f.k === "dr" && me.hp > 0 && me.hp < maxHpOf(me)) { heal(b, side, dmg * f.f); say(b, `${label(b, foeSide)} perd de l'énergie !`); }
      if (f.k === "rc" && me.hp > 0 && indirectOk(me)) { hurt(b, side, dmg * f.f); say(b, `${label(b, side)} subit le contrecoup !`); }
    }
    if (me.it === "orbevie" && me.hp > 0 && indirectOk(me)) { hurt(b, side, maxHpOf(me) / 10); say(b, `${label(b, side)} perd des PV à cause de l'Orbe Vie.`); }

    // Effets secondaires sur la cible
    if (foe.hp > 0) {
      for (const f of move.fx) {
        if (f.ch !== undefined && b.rng() >= f.ch) continue;
        if (f.k === "st") applyStatus(b, foeSide, f.s, false);
        else if (f.k === "fs") changeStages(b, foeSide, f.st, true);
        else if (f.k === "fl" && !b.acted.has(foeSide)) foeVol.flinch = true;
      }
      berryCheck(b, foeSide);
    }
    if (me.hp > 0) {
      for (const f of move.fx) {
        if (f.k !== "ss" || (f.ch !== undefined && b.rng() >= f.ch)) continue;
        changeStages(b, side, f.st, true);
      }
      berryCheck(b, side);
    }
    if (foe.hp <= 0) {
      faint(b, foeSide);
      if (me.hp > 0 && abilityOf(me) === "impudence") { say(b, `Impudence de ${label(b, side)} !`); changeStages(b, side, { atk: 1 }, true); }
    }
    if (me.hp <= 0) faint(b, side);
    return;
  }

  // Attaques de statut
  let worked = false;
  for (const f of move.fx) {
    switch (f.k) {
      case "st": worked = applyStatus(b, foeSide, f.s) || worked; break;
      case "fs": worked = changeStages(b, foeSide, f.st) || worked; break;
      case "ss": worked = changeStages(b, side, f.st) || worked; break;
      case "hl": {
        if (me.hp >= maxHpOf(me)) { say(b, `Les PV de ${label(b, side)} sont déjà au max !`); worked = true; break; }
        let part = f.f;
        if (f.sun) part = b.weather === "sun" ? 2 / 3 : b.weather ? 0.25 : 0.5;
        heal(b, side, maxHpOf(me) * part);
        say(b, `${label(b, side)} récupère des PV.`);
        worked = true;
        break;
      }
      case "pr": {
        const chance = 1 / 3 ** vol.prot;
        if (b.rng() < chance) { vol.protecting = true; vol.prot += 1; vol.usedProtect = true; say(b, `${label(b, side)} se protège !`); b.ev.push({ t: "anim", side, kind: "shield" }); worked = true; }
        else { vol.prot = 0; }
        break;
      }
      case "wx": worked = setWeather(b, f.w) || worked; break;
      case "lc": {
        if (typesOf(foe).includes("bio")) { say(b, `Ça n'affecte pas ${label(b, foeSide)}…`); worked = true; }
        else if (!foeVol.leech) { foeVol.leech = true; say(b, `${label(b, foeSide)} est infecté par Vampigraine !`); worked = true; }
        break;
      }
      case "hz": {
        const opp = b.sides[foeSide];
        if (!opp.hazard) { opp.hazard = true; say(b, "Des pics de données se dispersent autour de l'adversaire !"); b.ev.push({ t: "hazard", side: foeSide, on: true }); worked = true; }
        break;
      }
      case "rest": {
        if (me.hp >= maxHpOf(me)) break;
        me.st = "slp"; me.sl = 3;
        heal(b, side, maxHpOf(me));
        say(b, `${label(b, side)} s'endort et récupère tous ses PV !`);
        statusEv(b, side); teamEv(b, side);
        worked = true;
        break;
      }
      default: break;
    }
  }
  if (!worked) say(b, "Mais cela échoue !");
}

function berryCheck(b, side) {
  const m = active(b, side);
  if (m.it !== "baie" || b.used.has(m) || m.hp <= 0 || m.hp > maxHpOf(m) / 2) return;
  b.used.add(m);
  heal(b, side, maxHpOf(m) / 4);
  say(b, `${label(b, side)} mange sa Baie Sitrus et récupère des PV !`);
}

function faint(b, side) {
  const m = active(b, side);
  if (m._fainted) return;
  m._fainted = true;
  m.st = ""; m.sl = 0;
  say(b, `${label(b, side)} est K.O. !`);
  b.ev.push({ t: "faint", side });
  teamEv(b, side);
  b.sides[side].vol = freshVol();
  if (side === 1) awardXp(b, m);
}

// Expérience : pleine pour ceux qui ont combattu ce monstre, moitié pour le reste de l'équipe (Multi-Exp intégré).
function awardXp(b, foe) {
  const base = SPECIES[foe.s].xp * foe.lv / 4 * (isWild(b) ? 1 : 1.5);
  for (const mon of b.sides[0].mons) {
    if (mon.hp <= 0 || mon.lv >= MAX_LEVEL) continue;
    const share = b.part.has(mon) ? 1 : 0.5;
    const amount = Math.max(1, Math.floor(base * share));
    const res = gainXp(mon, amount);
    b.xpTotal += amount;
    if (b.part.has(mon)) say(b, `${nameOf(mon)} gagne ${amount.toLocaleString("fr-FR")} points d'expérience !`);
    if (mon === active(b, 0)) b.ev.push({ t: "xp", mon: view(mon) });
    for (const lv of res.levels) {
      say(b, `${nameOf(mon)} monte au niveau ${lv} !`);
      if (mon === active(b, 0)) { b.ev.push({ t: "send", side: 0, mon: view(mon), quiet: true }); b.ev.push({ t: "anim", side: 0, kind: "up" }); }
    }
    for (const id of res.learned) say(b, `${nameOf(mon)} apprend ${MOVES[id].name} !`);
    for (const id of res.toLearn) if (!b.learn.some((l) => l.mon === mon && l.move === id)) b.learn.push({ mon, move: id });
  }
  b.part = new Set([active(b, 0)].filter((m) => m && m.hp > 0));
}

function switchIn(b, side, idx, { first = false } = {}) {
  const s = b.sides[side];
  const prev = active(b, side);
  if (!first && prev && prev.hp > 0) {
    if (abilityOf(prev) === "regenerateur" && prev.hp < maxHpOf(prev)) prev.hp = Math.min(maxHpOf(prev), prev.hp + Math.floor(maxHpOf(prev) / 3));
    say(b, side === 0 ? `${nameOf(prev)}, reviens !` : `${b.trainer?.name || "L'adversaire"} rappelle ${nameOf(prev)}.`);
    b.ev.push({ t: "recall", side });
  }
  s.active = idx;
  s.vol = freshVol();
  s.lastSwitch = b.turn;
  const m = active(b, side);
  delete m._fainted;
  if (side === 1) b.seen.add(m.s);
  else b.part.add(m);
  if (side === 0) say(b, `En avant, ${nameOf(m)} !`);
  else if (isWild(b)) say(b, `Un ${nameOf(m)} sauvage apparaît !`);
  else say(b, `${b.trainer.name} envoie ${nameOf(m)} !`);
  sendEv(b, side);
  stagesEv(b, side);
  statusEv(b, side);
  teamEv(b, side);
  entryEffects(b, side);
}

function entryEffects(b, side) {
  const s = b.sides[side];
  const m = active(b, side);
  if (s.hazard && indirectOk(m)) {
    const eff = effectiveness("acier", typesOf(m));
    if (eff > 0) {
      say(b, `Les pics de données blessent ${label(b, side)} !`);
      b.ev.push({ t: "anim", side, kind: "hit" });
      hurt(b, side, (maxHpOf(m) / 8) * eff);
      if (m.hp <= 0) { faint(b, side); return; }
    }
  }
  const ab = abilityOf(m);
  const foeSide = 1 - side;
  if (ab === "intimidation" && active(b, foeSide)?.hp > 0) { say(b, `Intimidation de ${label(b, side)} !`); changeStages(b, foeSide, { atk: -1 }); }
  if (ab === "ensablement") setWeather(b, "sand");
  if (ab === "secheresse") setWeather(b, "sun");
  if (ab === "blizzardeur") setWeather(b, "hail");
}

// Début du combat : renvoie les événements de l'entrée en scène.
export function startBattle(b) {
  b.ev = [];
  if (b.trainer) {
    say(b, `${b.trainer.title ? `${b.trainer.title} ` : ""}${b.trainer.name} veut se battre !`);
    if (b.trainer.quote) say(b, `« ${b.trainer.quote} »`);
  }
  switchIn(b, 1, 0, { first: true });
  switchIn(b, 0, b.sides[0].active, { first: true });
  return b.ev;
}

/* ---------- IA ---------- */

function bestEffAgainst(attackerMon, defTypes) {
  let best = 0;
  for (const [id] of attackerMon.m) { const mv = MOVES[id]; if (mv.pow > 0) best = Math.max(best, effectiveness(mv.type, defTypes)); }
  for (const t of typesOf(attackerMon)) best = Math.max(best, effectiveness(t, defTypes));
  return best;
}

function scoreMove(b, side, move) {
  const me = active(b, side);
  const foeSide = 1 - side;
  const foe = active(b, foeSide);
  const vol = b.sides[side].vol;
  const fvol = b.sides[foeSide].vol;
  if (move.pow > 0) {
    const { dmg, eff } = damageOf(b, side, move);
    if (eff === 0) return 0;
    const acc = move.acc === null ? 1 : move.acc / 100;
    let score = Math.min(1.2, dmg / Math.max(1, foe.hp)) * acc;
    if (dmg >= foe.hp) score += 0.6 + (move.pri > 0 ? 0.3 : 0);
    if (move.fx.some((f) => f.k === "rc")) score *= 0.9;
    return score;
  }
  let score = 0;
  for (const f of move.fx) {
    if (f.k === "st") {
      if (f.s === "conf") score += fvol.conf ? 0 : 0.2;
      else if (!foe.st) score += f.s === "slp" ? 0.55 : f.s === "brn" && statsOf(foe).atk > statsOf(foe).spa ? 0.45 : 0.32;
    }
    if (f.k === "ss") { const up = Object.entries(f.st).some(([k, d]) => d > 0 && vol.st[k] < 2); if (up && me.hp > maxHpOf(me) * 0.6) score += 0.42; }
    if (f.k === "fs") score += Object.keys(f.st).some((k) => fvol.st[k] > -2) ? 0.15 : 0;
    if (f.k === "hl" && me.hp < maxHpOf(me) * 0.5) score += 0.55;
    if (f.k === "rest" && me.hp < maxHpOf(me) * 0.35) score += 0.6;
    if (f.k === "pr") score += vol.prot ? 0 : 0.08;
    if (f.k === "wx" && b.weather !== f.w) score += 0.25;
    if (f.k === "lc" && !fvol.leech && !typesOf(foe).includes("bio")) score += 0.3;
    if (f.k === "hz" && !b.sides[foeSide].hazard && aliveCount(b, foeSide) > 1) score += 0.3;
  }
  return score;
}

function chooseMove(b, side) {
  const me = active(b, side);
  const options = me.m.map((mv, i) => [i, mv]).filter(([, mv]) => mv[1] > 0);
  if (!options.length) return -1;
  const skill = b.sides[side].skill;
  if (!skill) return options[Math.floor(b.rng() * options.length)][0];
  const noise = skill === 1 ? 0.8 : skill === 2 ? 0.45 : 0.15;
  let best = options[0][0];
  let bestScore = -1;
  for (const [i, mv] of options) {
    const s = scoreMove(b, side, MOVES[mv[0]]) * (1 + (b.rng() - 0.5) * noise);
    if (s > bestScore) { bestScore = s; best = i; }
  }
  return best;
}

// Meilleur remplaçant : celui qui encaisse le mieux les attaques de l'adversaire et le frappe le plus fort.
function bestReplacement(b, side) {
  const s = b.sides[side];
  const foe = active(b, 1 - side);
  let best = -1;
  let bestScore = -Infinity;
  s.mons.forEach((m, i) => {
    if (m.hp <= 0 || i === s.active) return;
    let score = m.hp / maxHpOf(m);
    if (foe && foe.hp > 0 && s.skill >= 2) {
      score -= bestEffAgainst(foe, typesOf(m)) * 0.6;
      score += bestEffAgainst(m, typesOf(foe)) * 0.5;
    }
    if (s.skill < 2) score = b.rng();
    if (score > bestScore) { bestScore = score; best = i; }
  });
  return best;
}

function aiAction(b) {
  const s = b.sides[1];
  const me = active(b, 1);
  const foe = active(b, 0);
  if (s.potions > 0 && me.hp > 0 && me.hp < maxHpOf(me) * 0.25 && b.rng() < 0.7) return { k: "potion" };
  if (s.skill >= 2 && b.turn - s.lastSwitch > 2 && aliveCount(b, 1) > 1) {
    const danger = bestEffAgainst(foe, typesOf(me));
    const offense = Math.max(...me.m.map(([id]) => (MOVES[id].pow > 0 ? scoreMove(b, 1, MOVES[id]) : 0)));
    if (danger >= 2 && offense < 0.4 && b.rng() < (s.skill === 3 ? 0.75 : 0.45)) {
      const idx = bestReplacement(b, 1);
      if (idx >= 0 && bestEffAgainst(foe, typesOf(s.mons[idx])) <= 1) return { k: "switch", i: idx };
    }
  }
  return { k: "move", i: chooseMove(b, 1) };
}

/* ---------- Tour de jeu ---------- */

// Vérifie une action du joueur. Renvoie un message d'erreur, ou "" si l'action est possible.
export function checkAction(b, action) {
  if (b.over) return "Le combat est terminé.";
  const me = active(b, 0);
  const bag = b.hunt.bag;
  switch (action.k) {
    case "move":
      if (action.i >= 0 && (!me.m[action.i] || me.m[action.i][1] <= 0) && me.m.some((mv) => mv[1] > 0)) return "Plus de PP pour cette attaque.";
      return "";
    case "switch": {
      const m = b.sides[0].mons[action.i];
      if (!m) return "Créature introuvable.";
      if (action.i === b.sides[0].active) return `${nameOf(m)} est déjà au combat !`;
      if (m.hp <= 0) return `${nameOf(m)} est K.O. !`;
      return "";
    }
    case "run":
      return isWild(b) ? "" : "Impossible de fuir un combat de dresseur !";
    case "item": {
      const item = ITEMS[action.id];
      if (!item || !(bag[action.id] > 0)) return "Tu n'as plus cet objet.";
      const t = b.sides[0].mons[action.target ?? b.sides[0].active];
      if (item.cat === "ball") {
        if (!isWild(b)) return "On ne capture pas la créature d'un dresseur !";
        if (b.hunt.team.length >= TEAM_MAX && b.hunt.box.length >= BOX_MAX) return "Ton équipe et ton box sont pleins.";
        return "";
      }
      if (!t) return "Choisis une créature.";
      if (item.cat === "revive") return t.hp > 0 ? `${nameOf(t)} n'est pas K.O.` : "";
      if (t.hp <= 0) return `${nameOf(t)} est K.O. : il faut un Rappel.`;
      if (item.cat === "heal" && t.hp >= maxHpOf(t)) return `Les PV de ${nameOf(t)} sont déjà au max.`;
      if (item.cat === "cure" && !t.st) return `${nameOf(t)} n'a pas de statut.`;
      if (item.cat === "pp" && t.m.every(([id, pp]) => pp >= MOVES[id].pp)) return "Ses PP sont déjà au max.";
      if (item.cat === "boost" && b.sides[0].vol.st[item.st] >= 6) return "Cette stat est déjà au max.";
      if (item.cat === "held") return "Cet objet se donne à tenir depuis le camp.";
      return "";
    }
    default:
      return "Action inconnue.";
  }
}

function useItem(b, action) {
  const item = ITEMS[action.id];
  const bag = b.hunt.bag;
  bag[action.id] -= 1;
  if (item.cat === "ball") { throwBall(b, item); return; }
  const idx = action.target ?? b.sides[0].active;
  const t = b.sides[0].mons[idx];
  const isActive = idx === b.sides[0].active;
  say(b, `Tu utilises ${item.name} sur ${nameOf(t)}.`);
  if (item.cat === "heal") {
    const before = t.hp;
    t.hp = Math.min(maxHpOf(t), t.hp + item.heal);
    if (isActive) hpEv(b, 0);
    say(b, `${nameOf(t)} récupère ${t.hp - before} PV.`);
  } else if (item.cat === "revive") {
    t.hp = Math.floor(maxHpOf(t) / 2);
    delete t._fainted;
    say(b, `${nameOf(t)} est ranimé !`);
  } else if (item.cat === "cure") {
    t.st = ""; t.sl = 0;
    if (isActive) { b.sides[0].vol.conf = 0; statusEv(b, 0); }
    say(b, `${nameOf(t)} va beaucoup mieux.`);
  } else if (item.cat === "pp") {
    for (const mv of t.m) mv[1] = Math.min(MOVES[mv[0]].pp, mv[1] + 10);
    say(b, `Les PP de ${nameOf(t)} sont restaurés.`);
  } else if (item.cat === "boost") {
    changeStages(b, 0, { [item.st]: 2 });
  }
  teamEv(b, 0);
}

function throwBall(b, item) {
  const foe = active(b, 1);
  const sp = SPECIES[foe.s];
  say(b, `Tu lances un ${item.name} !`);
  const max = maxHpOf(foe);
  const status = foe.st === "slp" || foe.st === "frz" ? 2.5 : foe.st ? 1.5 : 1;
  const a = ((3 * max - 2 * foe.hp) / (3 * max)) * sp.rate * item.rate * status;
  const p = Math.min(1, a / 255);
  const shakeP = p ** 0.25;
  let shakes = 0;
  while (shakes < 4 && b.rng() < shakeP) shakes += 1;
  const ok = shakes >= 4;
  b.ev.push({ t: "ball", shakes: Math.min(3, shakes), ok });
  if (ok) {
    say(b, `Et hop ! ${sp.name} est capturé !`);
    b.over = true;
    b.result = "caught";
    b.caught = foe;
  } else {
    say(b, ["Oh non ! Il s'est libéré !", "Raah ! Ça y était presque !", "Mince ! Presque !", "Argh ! Si près du but !"][shakes]);
  }
}

function tryRun(b) {
  b.runs += 1;
  const mine = speedOf(b, 0);
  const theirs = speedOf(b, 1);
  const chance = mine >= theirs ? 1 : Math.min(1, (mine * 128 / theirs + 30 * b.runs) / 256);
  if (b.rng() < chance) {
    say(b, "Tu prends la fuite !");
    b.over = true;
    b.result = "fled";
  } else say(b, "Impossible de s'enfuir !");
}

function endOfTurn(b) {
  if (b.weather) {
    for (const side of [0, 1]) {
      const m = active(b, side);
      if (m.hp <= 0 || !indirectOk(m)) continue;
      const t = typesOf(m);
      const hit = (b.weather === "sand" && !t.includes("seisme") && !t.includes("acier")) || (b.weather === "hail" && !t.includes("cryo"));
      if (hit) {
        say(b, `${label(b, side)} est blessé par la ${b.weather === "sand" ? "tempête" : "grêle"}.`);
        hurt(b, side, maxHpOf(m) / 16);
        if (m.hp <= 0) faint(b, side);
      }
    }
    b.weatherTurns -= 1;
    if (b.weatherTurns <= 0) { say(b, WEATHER[b.weather].end); b.weather = null; b.ev.push({ t: "weather", w: null }); }
  }
  for (const side of [0, 1]) {
    const m = active(b, side);
    const vol = b.sides[side].vol;
    vol.flinch = false;
    vol.protecting = false;
    if (!vol.usedProtect) vol.prot = 0;
    vol.usedProtect = false;
    if (m.hp <= 0) continue;
    const other = active(b, 1 - side);
    if (vol.leech && indirectOk(m) && other.hp > 0) {
      const drain = Math.max(1, Math.floor(maxHpOf(m) / 8));
      hurt(b, side, drain);
      if (other.hp < maxHpOf(other)) heal(b, 1 - side, drain);
      say(b, `Vampigraine draine l'énergie de ${label(b, side)} !`);
      if (m.hp <= 0) { faint(b, side); continue; }
    }
    if ((m.st === "brn" || m.st === "psn") && indirectOk(m)) {
      hurt(b, side, maxHpOf(m) / (m.st === "brn" ? 16 : 8));
      say(b, `${label(b, side)} souffre ${m.st === "brn" ? "de sa brûlure" : "du poison"} !`);
      if (m.hp <= 0) { faint(b, side); continue; }
    }
    if (m.it === "restes" && m.hp < maxHpOf(m)) { heal(b, side, maxHpOf(m) / 16); say(b, `${label(b, side)} récupère un peu de PV grâce aux Restes.`); }
    berryCheck(b, side);
    if (abilityOf(m) === "turbo" && vol.turns > 0 && vol.st.spe < 6) changeStages(b, side, { spe: 1 }, true);
    vol.turns += 1;
  }
}

// Après un tour : remplaçants, victoire ou défaite.
function settle(b) {
  if (b.over) return;
  while (active(b, 1).hp <= 0) {
    if (aliveCount(b, 1) === 0) {
      b.over = true;
      b.result = "win";
      if (b.trainer) say(b, `Tu as battu ${b.trainer.name} !`);
      return;
    }
    switchIn(b, 1, bestReplacement(b, 1), { first: true });   // il peut tomber K.O. sur les pièges : on recommence
  }
  if (active(b, 0).hp <= 0) {
    if (aliveCount(b, 0) === 0) {
      b.over = true;
      b.result = "lose";
      say(b, "Toute ton équipe est K.O.…");
      return;
    }
    b.needSwitch = true;
  }
}

// Joue un tour complet. action : { k: "move", i } | { k: "switch", i } | { k: "item", id, target } | { k: "run" }
// Renvoie la liste des événements, ou null si l'action est impossible (voir checkAction).
export function playTurn(b, action) {
  if (b.over || b.needSwitch || checkAction(b, action)) return null;
  b.ev = [];
  b.turn += 1;
  b.acted = new Set();
  const foeAct = aiAction(b);
  const acts = [{ side: 0, ...action }, { side: 1, ...foeAct }];
  const prio = (a) => (a.k === "move" ? (a.i >= 0 ? MOVES[active(b, a.side).m[a.i]?.[0]]?.pri ?? 0 : 0) : 10);
  const speeds = [speedOf(b, 0), speedOf(b, 1)];
  acts.sort((x, y) => prio(y) - prio(x) || speeds[y.side] - speeds[x.side] || (b.rng() < 0.5 ? -1 : 1));
  if (prio(acts[0]) === 10 && prio(acts[1]) === 10 && acts[0].side === 1) acts.reverse();

  for (const a of acts) {
    if (b.over) break;
    const me = active(b, a.side);
    if (a.k === "move") {
      if (me.hp <= 0) continue;
      useMove(b, a.side, a.i);
    } else if (a.k === "switch") {
      switchIn(b, a.side, a.i);
    } else if (a.k === "item") {
      useItem(b, a);
    } else if (a.k === "potion") {
      b.sides[1].potions -= 1;
      say(b, `${b.trainer?.name || "L'adversaire"} utilise une Hyper Potion !`);
      heal(b, 1, 200);
    } else if (a.k === "run") {
      tryRun(b);
    }
    b.acted.add(a.side);
  }
  if (!b.over) endOfTurn(b);
  settle(b);
  return b.ev;
}

// Après un K.O. du joueur : envoie la créature choisie.
export function replaceFainted(b, idx) {
  const m = b.sides[0].mons[idx];
  if (!b.needSwitch || !m || m.hp <= 0) return null;
  b.ev = [];
  b.needSwitch = false;
  switchIn(b, 0, idx, { first: true });
  settle(b);
  return b.ev;
}

/* =========================================================
   RENCONTRES
========================================================= */

const pick = (rng, list) => list[Math.floor(rng() * list.length)];
const between = (rng, [lo, hi]) => lo + Math.floor(rng() * (hi - lo + 1));

function weighted(rng, entries) {
  const total = entries.reduce((s, [, w]) => s + w, 0);
  let r = rng() * total;
  for (const [id, w] of entries) { r -= w; if (r < 0) return id; }
  return entries[0][0];
}

// Une créature sauvage à son niveau : elle a évolué si son niveau le permet.
function wildSpecies(id, lv) {
  let s = id;
  for (let guard = 0; guard < 3; guard++) {
    const e = SPECIES[s].evo;
    if (e && lv >= e[0] + 4) s = e[1]; else break;
  }
  return s;
}

export const zoneById = (id) => ZONES.find((z) => z.id === id);
export const zoneOpen = (hunt, i) => i <= hunt.badges;

export function wildEncounter(zone, rng = Math.random) {
  const lv = between(rng, zone.lv);
  return [createMon(wildSpecies(weighted(rng, zone.wild), lv), lv, rng)];
}

export function trainerEncounter(zone, rng = Math.random) {
  const n = 2 + Math.floor(rng() * 2);
  const team = [];
  for (let i = 0; i < n; i++) {
    const lv = zone.lv[1] - 1 + Math.floor(rng() * 3);
    team.push(createMon(wildSpecies(weighted(rng, zone.wild), lv), lv, rng));
  }
  const level = Math.max(...team.map((m) => m.lv));
  return { team, trainer: { name: pick(rng, zone.trainers), title: "", skill: 1, potions: 0, reward: Math.round(level * n * 18) } };
}

export function leaderTeam(def, rng = Math.random, boost = 0) {
  return def.team.map(([s, lv, moves]) => createMon(s, Math.min(MAX_LEVEL, lv + boost), rng, { moves: moves || null }));
}

export const legendOpen = (hunt, def) => (def.need === "champion" ? hunt.champion : hunt.badges >= def.need) && !hunt.legends.includes(def.id);

/* =========================================================
   FIN DE COMBAT — récompenses, capture, défaite
========================================================= */

export function nextUid(hunt) { hunt.uid += 1; return hunt.uid; }

export function addMon(hunt, mon) {
  mon.u = nextUid(hunt);
  delete mon._fainted;
  if (hunt.team.length < TEAM_MAX) { hunt.team.push(mon); return "team"; }
  if (hunt.box.length < BOX_MAX) { hunt.box.push(mon); return "box"; }
  return null;
}

const markDex = (list, id) => { if (!list.includes(id)) list.push(id); };

// Applique le résultat d'un combat à la sauvegarde. Renvoie { trophies, lost, where, evolutions, learn }.
export function finishBattle(hunt, b) {
  for (const id of b.seen) markDex(hunt.dex.seen, id);
  for (const m of hunt.team) delete m._fainted;
  const out = { trophies: 0, lost: 0, where: null, learn: b.learn.slice(), evolutions: [] };
  const foes = b.sides[1].mons;
  const topLv = Math.max(...foes.map((m) => m.lv));
  if (b.result === "win") {
    hunt.stats.wins += 1;
    if (isWild(b)) { out.trophies = foes.reduce((s, m) => s + m.lv * 4, 0) * (b.kind === "legend" ? 25 : 1); hunt.stats.wild += 1; }
    else { out.trophies = b.trainer.reward || topLv * 20; hunt.stats.trainers += 1; }
  } else if (b.result === "caught") {
    const mon = b.caught;
    const keep = { ...mon, m: mon.m.map((mv) => mv.slice()), iv: mon.iv.slice() };
    out.where = addMon(hunt, keep);
    markDex(hunt.dex.caught, mon.s);
    markDex(hunt.dex.seen, mon.s);
    hunt.stats.caught += 1;
    out.trophies = mon.lv * 2;
    out.caught = keep;
  } else if (b.result === "lose") {
    hunt.stats.losses += 1;
    for (const m of hunt.team) healMon(m);
  }
  if (b.kind === "legend" && (b.result === "caught")) markDex(hunt.legends, b.id);
  for (const m of hunt.team) if (canEvolve(m)) out.evolutions.push(m);
  return out;
}

/* =========================================================
   SAUVEGARDE
========================================================= */

export const freshHunt = () => ({
  v: 2,
  team: [], box: [],
  bag: { potion: 5, module: 5 },
  badges: 0, champion: false, legends: [],
  dex: { seen: [], caught: [] },
  stats: { wins: 0, losses: 0, wild: 0, trainers: 0, caught: 0 },
  fast: false, uid: 0
});

const int = (v, lo, hi, def = lo) => { const n = Math.floor(Number(v)); return Number.isFinite(n) ? Math.min(hi, Math.max(lo, n)) : def; };

function sanitizeMon(raw) {
  if (!raw || typeof raw !== "object" || !SPECIES[raw.s]) return null;
  const mon = {
    u: int(raw.u, 0, 1e9), s: raw.s, lv: int(raw.lv, 1, MAX_LEVEL, 5), xp: 0, hp: 0,
    st: STATUS[raw.st] ? raw.st : "", sl: int(raw.sl, 0, 4), it: ITEMS[raw.it]?.cat === "held" ? raw.it : "",
    iv: Array.from({ length: 6 }, (_, i) => int(raw.iv?.[i], 0, 31, 15)),
    m: []
  };
  if (typeof raw.n === "string" && raw.n.trim()) mon.n = raw.n.trim().slice(0, 14);
  mon.xp = int(raw.xp, xpFor(mon.lv), xpFor(mon.lv + 1) - 1, xpFor(mon.lv));
  if (mon.lv >= MAX_LEVEL) mon.xp = xpFor(MAX_LEVEL);
  if (Array.isArray(raw.m)) {
    for (const mv of raw.m.slice(0, 4)) {
      if (Array.isArray(mv) && MOVES[mv[0]] && !mon.m.some((x) => x[0] === mv[0])) mon.m.push([mv[0], int(mv[1], 0, MOVES[mv[0]].pp, MOVES[mv[0]].pp)]);
    }
  }
  if (!mon.m.length) mon.m = movesAt(mon.s, mon.lv).map((id) => [id, MOVES[id].pp]);
  mon.hp = int(raw.hp, 0, maxHpOf(mon), maxHpOf(mon));
  if (mon.st === "slp" && !mon.sl) mon.sl = 1;
  if (mon.hp === 0) { mon.st = ""; mon.sl = 0; }
  return mon;
}

// Reprend la sauvegarde du RPG. L'ancienne version (forge et 8 monstres) repart de zéro : les trophées restent.
export function sanitizeHunt(raw) {
  const h = freshHunt();
  if (!raw || typeof raw !== "object" || raw.v !== 2) return h;
  h.team = (Array.isArray(raw.team) ? raw.team : []).map(sanitizeMon).filter(Boolean).slice(0, TEAM_MAX);
  h.box = (Array.isArray(raw.box) ? raw.box : []).map(sanitizeMon).filter(Boolean).slice(0, BOX_MAX);
  h.bag = {};
  if (raw.bag && typeof raw.bag === "object") for (const id of ITEM_IDS) { const n = int(raw.bag[id], 0, 9999); if (n) h.bag[id] = n; }
  h.badges = int(raw.badges, 0, LEADERS.length);
  h.champion = !!raw.champion && h.badges >= LEADERS.length;
  h.legends = Array.isArray(raw.legends) ? raw.legends.filter((id) => LEGENDS.some((l) => l.id === id)) : [];
  for (const k of ["seen", "caught"]) h.dex[k] = Array.isArray(raw.dex?.[k]) ? [...new Set(raw.dex[k].filter((id) => SPECIES[id]))] : [];
  for (const k of Object.keys(h.stats)) h.stats[k] = int(raw.stats?.[k], 0, 1e9);
  h.fast = !!raw.fast;
  h.uid = Math.max(int(raw.uid, 0, 1e9), ...h.team.map((m) => m.u), ...h.box.map((m) => m.u), 0);
  return h;
}

export function chooseStarter(hunt, speciesId, rng = Math.random) {
  if (hunt.team.length || hunt.box.length || !STARTERS.includes(speciesId)) return null;
  const mon = createMon(speciesId, 5, rng);
  addMon(hunt, mon);
  markDex(hunt.dex.seen, speciesId);
  markDex(hunt.dex.caught, speciesId);
  return mon;
}

export const healTeam = (hunt) => { for (const m of hunt.team) healMon(m); };
export const teamReady = (hunt) => hunt.team.some((m) => m.hp > 0);
