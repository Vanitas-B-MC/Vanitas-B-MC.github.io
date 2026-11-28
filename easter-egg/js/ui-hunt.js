// js/ui-hunt.js — affichage de « Chasse aux Titans », RPG de capture au tour par tour (logique dans hunt.js).
// Écrans : choix du starter, camp (carte, équipe, boutique, Titadex), combat, fin de combat.
// Le combat rejoue les événements du moteur un par un (messages, barres de PV, animations) ;
// un clic sur la boîte de texte ou Espace accélère. Tout se joue au doigt, à la souris et au clavier.

import {
  TYPES, MOVES, STATUS, WEATHER, STAT_NAMES, ABILITIES, ITEMS, ITEM_IDS, SPECIES, SPECIES_IDS, STARTERS, ZONES, LEADERS, COUNCIL, LEGENDS,
  TEAM_MAX, MAX_LEVEL, RELEARN_COST, STAT_KEYS,
  statsOf, maxHpOf, nameOf, typesOf, abilityOf, xpFor, ivStars, effectiveness, effLabel, relearnable, teachMove, canEvolve, evolve,
  createBattle, startBattle, playTurn, replaceFainted, checkAction, finishBattle, active as activeMon, isWild,
  wildEncounter, trainerEncounter, leaderTeam, legendOpen, createMon, chooseStarter, healTeam, teamReady
} from "./hunt.js";
import { monImg, monSrc } from "./hunt-art.js";
import { h, fmt, fmtShort, prefersReducedMotion } from "./ui.js";

const ZONE_BG = {
  ruelles: ["#1a0f2a", "#3a1450"], egouts: ["#08202a", "#0f3a40"], serres: ["#0c2414", "#1e4a24"], centrale: ["#22200a", "#3a3010"],
  desert: ["#2a1e0c", "#5a3e18"], fonderie: ["#2a0e08", "#5a1e0c"], pic: ["#0e1e2e", "#3a5a70"], datacentre: ["#0c0a1e", "#24124a"],
  conseil: ["#120818", "#3a0a2a"], coeur: ["#05030a", "#2a0a3a"]
};
const CAT_ICON = { phys: "⚔", spec: "✦", stat: "◎" };
const CAT_NAME = { phys: "Physique", spec: "Spéciale", stat: "Statut" };
const STATUS_VERB = { brn: "brûler", par: "paralyser", psn: "empoisonner", slp: "endormir", frz: "geler", conf: "rendre confuse" };
const SHOP_GROUPS = [
  ["Soins", ["potion", "superpotion", "hyperpotion", "potionmax", "totalsoin", "rappel", "elixir"]],
  ["Capture", ["module", "supermodule", "hypermodule", "moduletitan"]],
  ["Stimulants (combat)", ["stimatk", "stimspa", "stimdef", "stimspe"]],
  ["Objets à tenir", ["restes", "orbevie", "ceinture", "baie", "lentille", "bandeau", "lunettes", "gilet"]]
];

const pct = (n) => `${Math.round(n * 100)} %`;
const cap = (s) => s.charAt(0).toUpperCase() + s.slice(1);

/* ---------- Petits composants ---------- */

const typeChip = (t) => h("span", { class: "tt-type", style: `--tc:${TYPES[t].color}` }, TYPES[t].name);
const typeChips = (types) => h("span", { class: "tt-types" }, types.map(typeChip));
const statusChip = (st) => (st ? h("span", { class: "tt-status", style: `--tc:${STATUS[st].color}`, title: STATUS[st].name }, STATUS[st].short) : null);

function hpBar(frac, extraClass = "") {
  const fill = h("span", { class: "tt-hp-fill" });
  const el = h("span", { class: `tt-hp ${extraClass}` }, h("em", {}, "PV"), h("span", { class: "tt-hp-track" }, fill));
  setHp(fill, frac);
  return { el, fill };
}
function setHp(fill, frac) {
  const f = Math.max(0, Math.min(1, frac));
  fill.style.width = `${f * 100}%`;
  fill.dataset.level = f > 0.5 ? "high" : f > 0.2 ? "mid" : "low";
}
const xpFrac = (mon) => (mon.lv >= MAX_LEVEL ? 1 : (mon.xp - xpFor(mon.lv)) / Math.max(1, xpFor(mon.lv + 1) - xpFor(mon.lv)));

export function moveDesc(mv) {
  const out = [];
  if (mv.pri > 0) out.push("Frappe en premier (priorité).");
  if (mv.crit) out.push("Taux de critique élevé.");
  if (mv.acc === null && mv.pow > 0) out.push("Ne rate jamais.");
  if (mv.rainSure) out.push("Touche toujours sous la pluie.");
  if (mv.hailSure) out.push("Touche toujours sous la grêle.");
  for (const f of mv.fx) {
    const chance = f.ch !== undefined ? `${Math.round(f.ch * 100)} % de chances de ` : "";
    if (f.k === "st") out.push(cap(`${chance}${STATUS_VERB[f.s]} la cible.`));
    if (f.k === "fs") out.push(cap(`${chance}baisser ${Object.keys(f.st).map((k) => STAT_NAMES[k]).join(" et ")} de la cible${Object.values(f.st)[0] <= -2 ? " (fortement)" : ""}.`));
    if (f.k === "ss") {
      const ups = Object.entries(f.st);
      out.push(cap(`${chance}${ups[0][1] > 0 ? "augmenter" : "baisser"} ${ups.map(([k]) => STAT_NAMES[k]).join(" et ")} du lanceur${Math.abs(ups[0][1]) >= 2 ? " (fortement)" : ""}.`));
    }
    if (f.k === "dr") out.push("Rend la moitié des dégâts infligés.");
    if (f.k === "rc") out.push(`Contrecoup : ${f.f < 0.3 ? "1/4" : "1/3"} des dégâts infligés.`);
    if (f.k === "hl") out.push(f.sun ? "Rend 50 % des PV (2/3 au soleil, 1/4 sous une autre météo)." : "Rend 50 % des PV.");
    if (f.k === "pr") out.push("Bloque les attaques adverses ce tour (de moins en moins fiable si répété).");
    if (f.k === "wx") out.push(`Déclenche « ${WEATHER[f.w].name} » pendant 5 tours.`);
    if (f.k === "lc") out.push("Draine 1/8 des PV de la cible à chaque fin de tour.");
    if (f.k === "hz") out.push("Pose des pics : chaque créature adverse qui entre est blessée.");
    if (f.k === "rest") out.push("S'endort 2 tours et récupère tous ses PV et son statut.");
    if (f.k === "fl") out.push(cap(`${chance}faire peur à la cible (si le lanceur agit en premier).`));
  }
  return out.join(" ") || "Une attaque sans effet particulier.";
}

const weatherHelp = {
  sun: "Plasma ×1,5, Hydro ×0,5, personne ne gèle.",
  rain: "Hydro ×1,5, Plasma ×0,5, Fatal-Foudre touche toujours.",
  sand: "Blesse tout le monde sauf Séisme et Acier ; Déf. Spé des Séisme ×1,5.",
  hail: "Blesse tout le monde sauf Cryo ; Blizzard touche toujours."
};

export function createHuntUI(root, wallet) {
  let active = false;
  let screen = "camp";            // starter | camp | battle | after
  let tab = "map";                // map | team | shop | dex
  let notice = "";
  let selected = null;            // { where: "team" | "box", i }
  let dexPick = null;
  let relearnFor = null;          // id d'attaque choisie dans l'Atelier
  let b = null;                   // combat en cours
  let mode = null;                // { kind, leader, council, legend, zone }
  let menu = "none";
  let bagItem = null;
  let busy = false;
  let skip = null;
  let bv = null;                  // éléments du combat
  let shown = [null, null];
  let lastType = "chrome";
  let after = null;               // file des choses à régler après le combat

  const hunt = () => wallet.data.hunt;
  const save = () => wallet.saveHunt();
  const fast = () => hunt().fast || prefersReducedMotion();

  /* =========================================================
     STARTER
  ========================================================= */

  function renderStarter() {
    root.replaceChildren(
      h("div", { class: "tt-starter" },
        h("p", { class: "game-rules" }, "Bienvenue, chasseur. Dans cette ville, les machines ont pris vie : capture-les, entraîne ton équipe, bats les 8 Gardiens et le Conseil, puis pars à la chasse aux Titans légendaires. Choisis ta première créature :"),
        h("div", { class: "tt-starter-row" }, STARTERS.map((id) => {
          const sp = SPECIES[id];
          return h("button", { class: "tt-starter-card chamfer", type: "button", "data-starter": id, onclick: () => pickStarter(id) },
            monImg(id, 120), h("strong", {}, sp.name), typeChips(sp.types), h("span", { class: "tt-muted" }, sp.desc));
        })),
        h("p", { class: "hint" }, "Astuce : Plasma bat Bio, Bio bat Hydro, Hydro bat Plasma.")));
  }

  function pickStarter(id) {
    const mon = chooseStarter(hunt(), id);
    if (!mon) return;
    save();
    screen = "camp";
    tab = "map";
    notice = `${nameOf(mon)} rejoint ton équipe ! Va explorer les Ruelles Néon pour capturer d'autres créatures.`;
    render();
  }

  /* =========================================================
     CAMP
  ========================================================= */

  function render() {
    if (!hunt().team.length && !hunt().box.length) { screen = "starter"; renderStarter(); return; }
    if (screen === "camp") renderCamp();
  }

  function renderCamp() {
    const hd = hunt();
    const caught = hd.dex.caught.length;
    const healthy = hd.team.every((m) => m.hp === maxHpOf(m) && !m.st && m.m.every(([id, pp]) => pp === MOVES[id].pp));
    const tabs = [["map", "Carte"], ["team", `Équipe (${hd.team.length}/${TEAM_MAX})`], ["shop", "Boutique"], ["dex", `Titadex (${caught}/${SPECIES_IDS.length})`]];
    root.replaceChildren(
      h("div", { class: "tt-camp" },
        h("div", { class: "tt-header chamfer" },
          h("span", { class: "tt-trophies", id: "tt-trophies" }, `${fmtShort(wallet.trophies)} `, h("span", { class: "trophy" }, "✦")),
          h("span", { class: "tt-badges", title: "Badges des Gardiens" },
            LEADERS.map((l, i) => h("span", { class: `tt-badge${i < hd.badges ? " is-on" : ""}`, style: `--tc:${TYPES[l.type].color}`, title: i < hd.badges ? l.badge : "???" })),
            hd.champion ? h("span", { class: "tt-champion" }, "★ Champion") : null),
          h("span", { class: "tt-team-dots" }, hd.team.map((m) => h("span", { class: `tt-dot${m.hp <= 0 ? " is-ko" : m.st || m.hp < maxHpOf(m) ? " is-hurt" : ""}`, title: `${nameOf(m)} : ${m.hp}/${maxHpOf(m)} PV` }))),
          h("button", { class: "button button-secondary tt-heal", type: "button", id: "tt-heal", disabled: healthy, onclick: () => { healTeam(hunt()); save(); notice = "Centre de soin : ton équipe est en pleine forme !"; renderCamp(); } }, healthy ? "Équipe en forme" : "Centre de soin"),
          h("label", { class: "tt-fast" }, h("input", { type: "checkbox", checked: hd.fast, onchange: (e) => { hunt().fast = e.target.checked; save(); } }), "Texte rapide")),
        h("div", { class: "tt-tabs", role: "tablist" }, tabs.map(([id, text]) =>
          h("button", { class: `tt-tab${tab === id ? " is-active" : ""}`, type: "button", role: "tab", "aria-selected": String(tab === id), "data-tab": id, onclick: () => { tab = id; notice = ""; renderCamp(); } }, text))),
        notice ? h("p", { class: "tt-notice", role: "status", id: "tt-notice" }, notice) : null,
        tab === "map" ? renderMap() : tab === "team" ? renderTeam() : tab === "shop" ? renderShop() : renderDex()));
  }

  /* ---------- Carte ---------- */

  function renderMap() {
    const hd = hunt();
    const cards = ZONES.map((z, i) => {
      const open = i <= hd.badges;
      const leader = LEADERS[i];
      const beaten = i < hd.badges;
      const species = [...new Set(z.wild.map(([id]) => id))];
      const legend = LEGENDS.find((l) => l.zone === z.id);
      return h("li", { class: `tt-zone chamfer${open ? "" : " is-locked"}`, style: `--z1:${ZONE_BG[z.id][0]};--z2:${ZONE_BG[z.id][1]}`, "data-zone": z.id },
        h("div", { class: "tt-zone-head" },
          h("strong", {}, `${i + 1}. ${z.name}`),
          h("span", { class: "tt-muted" }, `Niv. ${z.lv[0]}–${z.lv[1]}`)),
        h("p", { class: "tt-muted" }, open ? z.desc : `Bats ${LEADERS[i - 1].name} (${LEADERS[i - 1].title}) pour ouvrir cette zone.`),
        open ? h("div", { class: "tt-zone-mons" }, species.map((id) => {
          const seen = hd.dex.seen.includes(id);
          const img = monImg(id, 34, { silhouette: !seen });
          img.title = seen ? SPECIES[id].name : "???";
          if (hd.dex.caught.includes(id)) img.classList.add("is-caught");
          return img;
        })) : null,
        open ? h("div", { class: "tt-zone-actions" },
          h("button", { class: "button button-primary", type: "button", "data-act": "wild", onclick: () => goWild(z) }, "Explorer"),
          h("button", { class: "button button-secondary", type: "button", "data-act": "trainer", onclick: () => goTrainer(z) }, "Dresseur"),
          h("button", { class: `button ${beaten ? "button-secondary" : "button-primary"} tt-leader-btn`, type: "button", "data-act": "leader", style: `--tc:${TYPES[leader.type].color}`, onclick: () => goLeader(i) },
            beaten ? `Revanche : ${leader.name}` : `Gardien : ${leader.name}`),
          legend && legendOpen(hd, legend) ? h("button", { class: "button button-primary tt-legend-btn", type: "button", "data-act": "legend", title: legend.hint, onclick: () => goLegend(legend) }, `Traque : ${SPECIES[legend.id].name}`) : null) : null,
        open && !beaten ? h("p", { class: "tt-leader-info" }, typeChip(leader.type), ` ${leader.title} — équipe niv. ${leader.team[0][1]}–${Math.max(...leader.team.map((t) => t[1]))}`) : null);
    });

    const council = hd.badges >= LEADERS.length;
    const omega = LEGENDS.find((l) => l.id === "titanomega");
    cards.push(h("li", { class: `tt-zone chamfer tt-council${council ? "" : " is-locked"}`, style: `--z1:${ZONE_BG.conseil[0]};--z2:${ZONE_BG.conseil[1]}` },
      h("div", { class: "tt-zone-head" }, h("strong", {}, "Conseil des Titans"), h("span", { class: "tt-muted" }, "Niv. 50–59")),
      h("p", { class: "tt-muted" }, council
        ? "5 combats d'affilée (Vex, Boréa, Krag, Lyra puis le Champion Axel), sans passer par le Centre de soin. Tes objets restent utilisables."
        : "Il faut les 8 badges des Gardiens pour défier le Conseil."),
      council ? h("div", { class: "tt-zone-actions" },
        h("button", { class: "button button-primary", type: "button", "data-act": "council", onclick: () => goCouncil(0) }, hd.champion ? "Revanche du Conseil" : "Défier le Conseil"),
        legendOpen(hd, omega) ? h("button", { class: "button button-primary tt-legend-btn", type: "button", "data-act": "omega", title: omega.hint, onclick: () => goLegend(omega) }, "Cœur du réseau : Titan Omega") : null) : null));

    return h("div", {},
      h("p", { class: "game-rules" }, "Explore pour capturer des créatures (affaiblis-les d'abord), affronte des dresseurs pour gagner des trophées ✦, puis bats le Gardien de la zone pour ouvrir la suivante. Les types comptent : une attaque super efficace fait ×2, et une attaque du même type que son lanceur fait ×1,5."),
      h("ul", { class: "tt-zones" }, cards));
  }

  /* ---------- Équipe & box ---------- */

  function monCard(mon, where, i) {
    const isSel = selected && selected.where === where && selected.i === i;
    const bar = hpBar(mon.hp / maxHpOf(mon));
    return h("button", { class: `tt-mon-card${isSel ? " is-selected" : ""}${mon.hp <= 0 ? " is-ko" : ""}`, type: "button", "data-mon": `${where}-${i}`, onclick: () => { selected = { where, i }; relearnFor = null; renderCamp(); } },
      monImg(mon.s, 56),
      h("span", { class: "tt-mon-card-info" },
        h("strong", {}, nameOf(mon)),
        h("span", { class: "tt-muted" }, `Niv. ${mon.lv}`, mon.it ? ` · ${ITEMS[mon.it].name}` : ""),
        typeChips(typesOf(mon)),
        bar.el,
        h("span", { class: "tt-hp-num" }, `${mon.hp} / ${maxHpOf(mon)}`, " ", statusChip(mon.st))));
  }

  function renderTeam() {
    const hd = hunt();
    if (selected && !(selected.where === "team" ? hd.team : hd.box)[selected.i]) selected = null;
    if (!selected && hd.team.length) selected = { where: "team", i: 0 };
    return h("div", { class: "tt-team-layout" },
      h("section", {},
        h("h3", { class: "subhead" }, "Équipe"),
        h("p", { class: "hint" }, "La première créature part au combat. Les autres gagnent quand même la moitié de l'expérience."),
        h("div", { class: "tt-mon-grid" }, hd.team.map((m, i) => monCard(m, "team", i))),
        h("h3", { class: "subhead" }, `Box (${hd.box.length})`),
        hd.box.length ? h("div", { class: "tt-mon-grid tt-box" }, hd.box.map((m, i) => monCard(m, "box", i))) : h("p", { class: "hint" }, "Les créatures capturées quand l'équipe est pleine arrivent ici.")),
      h("section", { class: "tt-detail chamfer" }, selected ? renderDetail() : h("p", { class: "hint" }, "Choisis une créature.")));
  }

  function renderDetail() {
    const hd = hunt();
    const list = selected.where === "team" ? hd.team : hd.box;
    const i = selected.i;
    const mon = list[i];
    const sp = SPECIES[mon.s];
    const stats = statsOf(mon);
    const ab = ABILITIES[abilityOf(mon)];
    const maxStat = 230;
    const held = ITEM_IDS.filter((id) => ITEMS[id].cat === "held" && (hd.bag[id] || 0) > 0);

    const statRows = [["PV", stats.hp, sp.base[0]], ...STAT_KEYS.map((k, j) => [STAT_NAMES[k], stats[k], sp.base[j + 1]])].map(([n, v, base]) =>
      h("div", { class: "tt-stat" }, h("span", {}, n), h("strong", {}, String(v)), h("span", { class: "tt-stat-track" }, h("span", { style: `width:${Math.min(100, (base / maxStat) * 100 * 1.6)}%` }))));

    const moves = mon.m.map(([id, pp], slot) => {
      const mv = MOVES[id];
      return h("li", { class: "tt-move-row" },
        h("div", {}, typeChip(mv.type), " ", h("strong", {}, mv.name), h("span", { class: "tt-muted" }, ` ${CAT_ICON[mv.cat]} ${CAT_NAME[mv.cat]}${mv.pow ? ` · Puiss. ${mv.pow}` : ""} · Préc. ${mv.acc ?? "—"} · PP ${pp}/${mv.pp}`)),
        h("p", { class: "tt-muted" }, moveDesc(mv)),
        relearnFor ? h("button", { class: "button button-secondary tt-small", type: "button", onclick: () => relearn(mon, relearnFor, slot) }, `Remplacer par ${MOVES[relearnFor].name}`) : null);
    });

    const forgot = relearnable(mon);
    const actions = [];
    if (selected.where === "team") {
      if (i > 0) actions.push(h("button", { class: "button button-secondary tt-small", type: "button", onclick: () => { [hd.team[i - 1], hd.team[i]] = [hd.team[i], hd.team[i - 1]]; selected.i = i - 1; save(); renderCamp(); } }, i === 1 ? "Mettre en tête" : "Monter"));
      if (i < hd.team.length - 1) actions.push(h("button", { class: "button button-secondary tt-small", type: "button", onclick: () => { [hd.team[i + 1], hd.team[i]] = [hd.team[i], hd.team[i + 1]]; selected.i = i + 1; save(); renderCamp(); } }, "Descendre"));
      if (hd.team.length > 1) actions.push(h("button", { class: "button button-secondary tt-small", type: "button", onclick: () => { hd.box.push(...hd.team.splice(i, 1)); selected = { where: "box", i: hd.box.length - 1 }; save(); renderCamp(); } }, "Déposer au box"));
    } else {
      if (hd.team.length < TEAM_MAX) actions.push(h("button", { class: "button button-primary tt-small", type: "button", onclick: () => { hd.team.push(...hd.box.splice(i, 1)); selected = { where: "team", i: hd.team.length - 1 }; save(); renderCamp(); } }, "Prendre dans l'équipe"));
      else actions.push(h("span", { class: "hint" }, "Équipe pleine : dépose d'abord une créature."));
      actions.push(h("button", { class: "button button-secondary tt-small tt-danger", type: "button", onclick: (e) => {
        if (e.currentTarget.dataset.armed) { hd.box.splice(i, 1); selected = null; notice = `${nameOf(mon)} a été relâché.`; save(); renderCamp(); return; }
        e.currentTarget.dataset.armed = "1"; e.currentTarget.textContent = "Confirmer : relâcher ?";
      } }, "Relâcher"));
    }
    if (canEvolve(mon)) actions.push(h("button", { class: "button button-primary tt-small", type: "button", onclick: () => { const from = nameOf(mon); evolve(mon); save(); notice = `${from} a évolué en ${SPECIES[mon.s].name} !`; renderCamp(); } }, `Faire évoluer en ${SPECIES[sp.evo[1]].name}`));

    return h("div", { class: "tt-detail-body" },
      h("div", { class: "tt-detail-head" },
        monImg(mon.s, 120),
        h("div", {},
          h("h3", { class: "tt-detail-name" }, nameOf(mon)),
          h("p", { class: "tt-muted" }, `n° ${String(sp.no).padStart(3, "0")} · Niv. ${mon.lv} · Potentiel ${"★".repeat(ivStars(mon))}${"☆".repeat(5 - ivStars(mon))}`),
          typeChips(sp.types),
          hpBar(mon.hp / maxHpOf(mon)).el,
          h("p", { class: "tt-hp-num" }, `${mon.hp} / ${maxHpOf(mon)} PV `, statusChip(mon.st)),
          h("span", { class: "tt-xp", title: "Expérience" }, h("span", { style: `width:${xpFrac(mon) * 100}%` })),
          h("p", { class: "tt-muted" }, mon.lv >= MAX_LEVEL ? "Niveau maximum" : `${fmt(xpFor(mon.lv + 1) - mon.xp)} XP avant le niveau ${mon.lv + 1}`))),
      h("p", {}, h("strong", {}, `Talent : ${ab.name}`), h("span", { class: "tt-muted" }, ` — ${ab.desc}`)),
      h("div", { class: "tt-stats" }, statRows),
      h("h4", { class: "tt-h4" }, "Attaques"),
      h("ul", { class: "tt-moves-list" }, moves),
      h("h4", { class: "tt-h4" }, "Atelier des capacités"),
      forgot.length
        ? h("div", { class: "tt-relearn" },
          h("p", { class: "hint" }, `Réapprendre une attaque déjà accessible : ${fmt(RELEARN_COST)} ✦.${mon.m.length >= 4 ? " Choisis-la, puis l'attaque à remplacer." : ""}`),
          h("div", { class: "tt-chip-row" }, forgot.map((id) => h("button", {
            class: `tt-move-chip${relearnFor === id ? " is-active" : ""}`, type: "button", title: `${CAT_NAME[MOVES[id].cat]} · ${moveDesc(MOVES[id])}`, style: `--tc:${TYPES[MOVES[id].type].color}`,
            onclick: () => { if (mon.m.length < 4) relearn(mon, id, -1); else { relearnFor = relearnFor === id ? null : id; renderCamp(); } }
          }, `${MOVES[id].name}${MOVES[id].pow ? ` (${MOVES[id].pow})` : ""}`))))
        : h("p", { class: "hint" }, "Aucune autre attaque disponible à ce niveau."),
      h("h4", { class: "tt-h4" }, "Objet tenu"),
      h("div", { class: "tt-chip-row" },
        mon.it ? h("span", {}, h("strong", {}, ITEMS[mon.it].name), h("span", { class: "tt-muted" }, ` — ${ITEMS[mon.it].desc} `),
          h("button", { class: "button button-secondary tt-small", type: "button", onclick: () => { hd.bag[mon.it] = (hd.bag[mon.it] || 0) + 1; mon.it = ""; save(); renderCamp(); } }, "Reprendre")) : null,
        held.length ? held.map((id) => h("button", { class: "tt-move-chip", type: "button", title: ITEMS[id].desc, onclick: () => {
          if (mon.it) hd.bag[mon.it] = (hd.bag[mon.it] || 0) + 1;
          hd.bag[id] -= 1; mon.it = id; save(); renderCamp();
        } }, `Donner : ${ITEMS[id].name} (${hd.bag[id]})`)) : (!mon.it ? h("span", { class: "hint" }, "Achète des objets à tenir à la boutique.") : null)),
      h("div", { class: "tt-detail-actions" }, actions),
      h("p", { class: "tt-muted tt-flavor" }, sp.desc));
  }

  function relearn(mon, id, slot) {
    if (wallet.trophies < RELEARN_COST) { notice = "Il manque des trophées pour l'Atelier."; renderCamp(); return; }
    if (!teachMove(mon, id, slot)) return;
    wallet.spendTrophies(RELEARN_COST);
    relearnFor = null;
    notice = `${nameOf(mon)} apprend ${MOVES[id].name} !`;
    save();
    renderCamp();
  }

  /* ---------- Boutique ---------- */

  function renderShop() {
    const hd = hunt();
    return h("div", {},
      h("p", { class: "game-rules" }, "Tout se paie en trophées ✦, gagnés uniquement dans ce jeu (dresseurs, Gardiens, captures). Les objets à tenir se donnent depuis l'onglet Équipe."),
      SHOP_GROUPS.map(([title, ids]) => h("section", { class: "tt-shop-group" },
        h("h3", { class: "subhead" }, title),
        h("ul", { class: "tt-shop" }, ids.map((id) => {
          const it = ITEMS[id];
          const buy = (n) => {
            const cost = it.price * n;
            if (!wallet.spendTrophies(cost)) { notice = "Pas assez de trophées."; renderCamp(); return; }
            hd.bag[id] = (hd.bag[id] || 0) + n;
            notice = `+${n} ${it.name}`;
            save();
            renderCamp();
          };
          return h("li", { class: "tt-shop-item", "data-item": id },
            h("div", {}, h("strong", {}, it.name), h("span", { class: "tt-muted" }, ` — ${it.desc}`), h("div", { class: "tt-meta" }, `${fmt(it.price)} ✦ · possédé : ${hd.bag[id] || 0}`)),
            h("div", { class: "tt-shop-actions" },
              h("button", { class: "button button-secondary tt-small", type: "button", disabled: wallet.trophies < it.price, onclick: () => buy(1) }, "×1"),
              it.cat !== "held" ? h("button", { class: "button button-secondary tt-small", type: "button", disabled: wallet.trophies < it.price * 5, onclick: () => buy(5) }, "×5") : null));
        })))));
  }

  /* ---------- Titadex ---------- */

  function renderDex() {
    const hd = hunt();
    const cells = SPECIES_IDS.map((id) => {
      const sp = SPECIES[id];
      const seen = hd.dex.seen.includes(id) || hd.dex.caught.includes(id);
      const caught = hd.dex.caught.includes(id);
      return h("button", { class: `tt-dex-cell${caught ? " is-caught" : ""}${dexPick === id ? " is-selected" : ""}`, type: "button", disabled: !seen, onclick: () => { dexPick = id; renderCamp(); } },
        monImg(id, 56, { silhouette: !seen }),
        h("span", { class: "tt-muted" }, `${String(sp.no).padStart(3, "0")}`),
        h("span", {}, seen ? sp.name : "???"));
    });
    let info = h("p", { class: "hint" }, "Choisis une créature déjà rencontrée.");
    if (dexPick) {
      const sp = SPECIES[dexPick];
      const caught = hd.dex.caught.includes(dexPick);
      const where = ZONES.filter((z) => z.wild.some(([id]) => id === dexPick)).map((z) => z.name);
      const legend = LEGENDS.find((l) => l.id === dexPick);
      info = h("div", { class: "tt-detail-body" },
        h("div", { class: "tt-detail-head" }, monImg(dexPick, 120),
          h("div", {}, h("h3", { class: "tt-detail-name" }, sp.name), typeChips(sp.types),
            h("p", { class: "tt-muted" }, caught ? "Capturé" : "Seulement aperçu"),
            h("p", {}, h("strong", {}, `Talent : ${ABILITIES[sp.ability].name}`)),
            h("p", { class: "tt-muted" }, `Faible contre : ${weaknesses(sp.types)}`))),
        h("p", {}, sp.desc),
        caught ? h("div", { class: "tt-stats" }, ["PV", ...STAT_KEYS.map((k) => STAT_NAMES[k])].map((n, j) =>
          h("div", { class: "tt-stat" }, h("span", {}, n), h("strong", {}, String(sp.base[j])), h("span", { class: "tt-stat-track" }, h("span", { style: `width:${Math.min(100, sp.base[j] / 1.5)}%` }))))) : null,
        sp.evo ? h("p", { class: "tt-muted" }, `Évolue au niveau ${sp.evo[0]}.`) : null,
        h("p", { class: "tt-muted" }, legend ? `Titan légendaire : ${legend.hint}` : where.length ? `Habitat : ${where.join(", ")}` : "Introuvable à l'état sauvage."));
    }
    return h("div", { class: "tt-team-layout" },
      h("div", { class: "tt-dex" }, cells),
      h("section", { class: "tt-detail chamfer" }, info));
  }

  function weaknesses(types) {
    const list = Object.keys(TYPES).map((t) => [t, effectiveness(t, types)]).filter(([, m]) => m > 1);
    return list.length ? list.map(([t, m]) => `${TYPES[t].name}${m >= 4 ? " (×4)" : ""}`).join(", ") : "rien";
  }

  /* =========================================================
     LANCEMENT DES COMBATS
  ========================================================= */

  function needTeam() {
    if (teamReady(hunt())) return true;
    notice = "Toute ton équipe est K.O. : passe d'abord au Centre de soin.";
    renderCamp();
    return false;
  }

  function goWild(zone) {
    if (!needTeam()) return;
    begin(wildEncounter(zone), { kind: "wild" }, { kind: "wild", zone: zone.id });
  }
  function goTrainer(zone) {
    if (!needTeam()) return;
    const { team, trainer } = trainerEncounter(zone);
    begin(team, { kind: "trainer", trainer }, { kind: "trainer", zone: zone.id });
  }
  function goLeader(i) {
    if (!needTeam()) return;
    const def = LEADERS[i];
    const rematch = i < hunt().badges;
    const trainer = { name: def.name, title: def.title, skill: def.skill, potions: def.potions, reward: rematch ? Math.round(def.reward / 2) : def.reward, quote: def.quote };
    begin(leaderTeam(def, Math.random, rematch ? 4 : 0), { kind: "leader", trainer }, { kind: "leader", leader: i, zone: ZONES[i].id, rematch });
  }
  function goCouncil(step) {
    if (step === 0 && !needTeam()) return;
    const def = COUNCIL[step];
    const trainer = { name: def.name, title: def.title, skill: def.skill, potions: def.potions, reward: def.reward, quote: def.quote };
    begin(leaderTeam(def, Math.random, hunt().champion ? 3 : 0), { kind: "council", trainer }, { kind: "council", council: step, zone: step === 4 ? "coeur" : "conseil" });
  }
  function goLegend(def) {
    if (!needTeam()) return;
    begin([createMon(def.id, def.lv, Math.random)], { kind: "legend", id: def.id }, { kind: "legend", legend: def.id, zone: def.zone === "coeur" ? "coeur" : def.zone });
  }

  function begin(foes, opts, m) {
    mode = m;
    b = createBattle(hunt(), foes, opts);
    screen = "battle";
    shown = [null, null];
    menu = "none";
    bagItem = null;
    buildBattle();
    scrollBattle();
    const ev = startBattle(b);
    play(ev).then(next);
  }

  /* =========================================================
     COMBAT
  ========================================================= */

  // Sur téléphone, amène l'arène sous l'en-tête fixe du site.
  function scrollBattle() {
    const el = root.querySelector(".tt-battle");
    if (!el || !window.matchMedia("(max-width: 760px)").matches) return;
    const header = parseFloat(getComputedStyle(document.documentElement).getPropertyValue("--header-h")) || 70;
    window.scrollTo({ top: Math.max(0, el.getBoundingClientRect().top + window.scrollY - header - 8), behavior: prefersReducedMotion() ? "auto" : "smooth" });
  }

  function infoCard(side) {
    const name = h("strong", { class: "tt-info-name" });
    const lv = h("span", { class: "tt-info-lv" });
    const types = h("span", { class: "tt-types" });
    const st = h("span", { class: "tt-info-st" });
    const bar = hpBar(1);
    const hpText = h("span", { class: "tt-hp-num" });
    const xp = h("span", { class: "tt-xp" }, h("span", {}));
    const stages = h("span", { class: "tt-stages" });
    const balls = h("span", { class: "tt-balls" });
    const el = h("div", { class: `tt-info tt-info-${side ? "foe" : "me"} chamfer`, hidden: true },
      h("div", { class: "tt-info-top" }, name, st, lv),
      types, bar.el, side === 0 ? hpText : null, side === 0 ? xp : null, stages, balls);
    return { el, name, lv, types, st, bar, hpText, xp: xp.firstChild, stages, balls };
  }

  function buildBattle() {
    const zone = mode.zone || "ruelles";
    const [z1, z2] = ZONE_BG[zone] || ZONE_BG.ruelles;
    const foeImg = h("img", { class: "tt-sprite", alt: "", width: "150", height: "150", draggable: "false" });
    const meImg = h("img", { class: "tt-sprite", alt: "", width: "150", height: "150", draggable: "false" });
    const foeWrap = h("div", { class: "tt-mon tt-mon-foe", hidden: true }, foeImg, h("span", { class: "tt-fx" }));
    const meWrap = h("div", { class: "tt-mon tt-mon-me", hidden: true }, meImg, h("span", { class: "tt-fx" }));
    const ball = h("span", { class: "tt-capsule", hidden: true });
    const weather = h("span", { class: "tt-weather", hidden: true });
    const hazards = [h("span", { class: "tt-hazard tt-hazard-me", hidden: true, title: "Pics de données" }, "▲▲▲"), h("span", { class: "tt-hazard tt-hazard-foe", hidden: true, title: "Pics de données" }, "▲▲▲")];
    const field = h("div", { class: "tt-field", style: `--z1:${z1};--z2:${z2}` },
      h("span", { class: "tt-platform tt-platform-foe" }), h("span", { class: "tt-platform tt-platform-me" }),
      foeWrap, meWrap, ball, weather, ...hazards);
    const info = [infoCard(0), infoCard(1)];
    field.append(info[1].el, info[0].el);
    const text = h("p", { class: "tt-text", id: "tt-text", "aria-live": "polite", onclick: () => skip?.() });
    const menuEl = h("div", { class: "tt-menu", id: "tt-menu" });
    const help = h("p", { class: "tt-help", id: "tt-help" });
    bv = { field, imgs: [meImg, foeImg], wraps: [meWrap, foeWrap], ball, weather, hazards, info, text, menu: menuEl, help };
    root.replaceChildren(h("div", { class: "tt-battle" }, field, h("div", { class: "tt-console chamfer" }, text, menuEl, help)));
    if (b.weather) showWeather(b.weather);
  }

  function updateInfo(side) {
    const s = shown[side];
    const c = bv.info[side];
    if (!s) { c.el.hidden = true; return; }
    c.el.hidden = false;
    c.name.textContent = s.mon.name;
    c.lv.textContent = `Niv. ${s.mon.lv}`;
    c.types.replaceChildren(...SPECIES[s.mon.s].types.map(typeChip));
    c.st.replaceChildren(...[statusChip(s.st), s.conf ? h("span", { class: "tt-status", style: "--tc:#ff5ab0" }, "CONF") : null].filter(Boolean));
    setHp(c.bar.fill, s.hp / s.mon.max);
    c.hpText.textContent = `${s.hp} / ${s.mon.max}`;
    if (side === 0) {
      const lvXp = xpFor(s.mon.lv);
      c.xp.style.width = `${s.mon.lv >= MAX_LEVEL ? 100 : Math.max(0, Math.min(100, ((s.mon.xp - lvXp) / (xpFor(s.mon.lv + 1) - lvXp)) * 100))}%`;
    }
    c.stages.replaceChildren(...Object.entries(s.stages || {}).filter(([, v]) => v).map(([k, v]) =>
      h("span", { class: `tt-stage ${v > 0 ? "is-up" : "is-down"}` }, `${STAT_NAMES[k].replace("Atq. Spé", "AtqS").replace("Déf. Spé", "DéfS").slice(0, 4)} ${v > 0 ? "+" : ""}${v}`)));
    c.balls.replaceChildren(...(s.balls || []).map((state) => h("span", { class: `tt-ball is-${state}` })));
    c.balls.hidden = side === 1 && isWild(b);
  }

  function anim(side, cls, ms) {
    const el = bv.wraps[side];
    el.classList.remove(cls);
    void el.offsetWidth;
    el.classList.add(cls);
    setTimeout(() => el.classList.remove(cls), ms);
  }
  function fx(side, color, kind) {
    const el = bv.wraps[side].querySelector(".tt-fx");
    el.style.setProperty("--fx", color);
    el.dataset.kind = kind;
    el.classList.remove("is-on");
    void el.offsetWidth;
    el.classList.add("is-on");
  }

  function showWeather(w) {
    bv.weather.hidden = !w;
    bv.field.dataset.weather = w || "";
    if (w) { bv.weather.textContent = WEATHER[w].name; bv.weather.title = weatherHelp[w]; }
  }

  function wait(ms) {
    return new Promise((resolve) => {
      const done = () => { clearTimeout(t); if (skip === done) skip = null; resolve(); };
      const t = setTimeout(done, ms);
      skip = done;
    });
  }

  async function play(events) {
    busy = true;
    renderMenu();
    const f = fast();
    const T = { msg: f ? 520 : 1000, hp: f ? 280 : 520, anim: f ? 200 : 380 };
    for (const e of events) {
      if (!bv) break;
      switch (e.t) {
        case "msg": bv.text.textContent = e.text; await wait(T.msg); break;
        case "send": {
          const prev = shown[e.side];
          shown[e.side] = { mon: e.mon, hp: e.mon.hp, st: e.mon.st, stages: prev && e.quiet ? prev.stages : {}, balls: prev?.balls, conf: false };
          bv.imgs[e.side].src = monSrc(e.mon.s, 150, { flip: e.side === 1 });
          bv.imgs[e.side].alt = e.mon.name;
          bv.wraps[e.side].hidden = false;
          bv.wraps[e.side].classList.remove("is-faint", "is-recall", "is-caught");
          updateInfo(e.side);
          if (!e.quiet) { anim(e.side, "is-enter", 500); await wait(T.anim + 120); }
          break;
        }
        case "recall": bv.wraps[e.side].classList.add("is-recall"); await wait(T.anim + 60); break;
        case "hp":
          if (shown[e.side]) { shown[e.side].hp = e.hp; updateInfo(e.side); }
          await wait(T.hp);
          break;
        case "faint": bv.wraps[e.side].classList.add("is-faint"); await wait(T.anim + 200); break;
        case "status": if (shown[e.side]) { shown[e.side].st = e.st; shown[e.side].conf = e.conf; updateInfo(e.side); } break;
        case "stages": if (shown[e.side]) { shown[e.side].stages = e.st; updateInfo(e.side); } break;
        case "team": if (shown[e.side]) { shown[e.side].balls = e.balls; updateInfo(e.side); } break;
        case "weather": showWeather(e.w); break;
        case "hazard": bv.hazards[e.side].hidden = !e.on; break;
        case "xp": if (shown[0] && e.mon.name === shown[0].mon.name) { shown[0].mon = { ...shown[0].mon, xp: e.mon.xp, lv: e.mon.lv, max: e.mon.max }; updateInfo(0); await wait(T.hp); } break;
        case "anim": {
          if (e.kind === "attack") { lastType = e.type; anim(e.side, e.side === 0 ? "is-lunge-me" : "is-lunge-foe", 400); await wait(T.anim * 0.7); }
          else if (e.kind === "hit") { fx(e.side, TYPES[lastType]?.color || "#fff", "hit"); anim(e.side, e.eff >= 2 ? "is-hit-big" : "is-hit", 500); await wait(T.anim); }
          else if (e.kind === "status") { fx(e.side, STATUS[e.type]?.color || "#fff", "ring"); await wait(T.anim); }
          else if (e.kind === "up" || e.kind === "down") { fx(e.side, e.kind === "up" ? "#3ddc84" : "#ff5a7a", e.kind); await wait(T.anim); }
          else if (e.kind === "shield") { fx(e.side, "#3aa9ff", "ring"); await wait(T.anim); }
          break;
        }
        case "ball": {
          bv.wraps[1].classList.add("is-caught");
          bv.ball.hidden = false;
          bv.ball.className = "tt-capsule is-thrown";
          await wait(f ? 380 : 650);
          for (let i = 0; i < e.shakes; i++) {
            bv.ball.classList.remove("is-shake"); void bv.ball.offsetWidth; bv.ball.classList.add("is-shake");
            await wait(f ? 420 : 700);
          }
          if (e.ok) { bv.ball.classList.add("is-locked"); await wait(f ? 400 : 700); }
          else { bv.ball.hidden = true; bv.wraps[1].classList.remove("is-caught"); anim(1, "is-enter", 400); await wait(T.anim); }
          break;
        }
        default: break;
      }
    }
    busy = false;
  }

  function next() {
    if (!b || screen !== "battle") return;
    if (b.over) { endBattle(); return; }
    if (b.needSwitch) { menu = "force"; bv.text.textContent = "Quelle créature envoyer ?"; renderMenu(); return; }
    menu = "main";
    bv.text.textContent = `Que doit faire ${nameOf(activeMon(b, 0))} ?`;
    renderMenu();
  }

  async function act(action) {
    if (busy || !b || b.over) return;
    const err = checkAction(b, action);
    if (err) { bv.text.textContent = err; return; }
    const ev = playTurn(b, action);
    if (!ev) return;
    menu = "none";
    await play(ev);
    next();
  }

  async function sendReplacement(i) {
    if (busy) return;
    const ev = replaceFainted(b, i);
    if (!ev) return;
    menu = "none";
    await play(ev);
    next();
  }

  function btn(label, onclick, { cls = "button-secondary", disabled = false, title = null, key = null, style = null, data = null } = {}) {
    return h("button", { class: `button ${cls}`, type: "button", disabled, title, style, "data-key": key, "data-btn": data, onclick }, label);
  }

  function renderMenu() {
    if (!bv) return;
    bv.help.textContent = "";
    if (busy || menu === "none") { bv.menu.replaceChildren(); bv.menu.hidden = true; return; }
    bv.menu.hidden = false;
    const me = activeMon(b, 0);
    const foe = activeMon(b, 1);
    let items = [];
    let cls = "tt-menu-main";

    if (menu === "main") {
      items = [
        btn("Attaque", () => { menu = "moves"; renderMenu(); }, { cls: "button-primary", key: "A", data: "fight" }),
        btn("Équipe", () => { menu = "team"; renderMenu(); }, { key: "E", data: "team" }),
        btn("Sac", () => { menu = "bag"; renderMenu(); }, { key: "S", data: "bag" }),
        btn(isWild(b) ? "Fuite" : "Fuite (impossible)", () => act({ k: "run" }), { key: "F", disabled: !isWild(b), data: "run" })
      ];
      bv.help.textContent = "Raccourcis : A attaque · E équipe · S sac · F fuite · Échap retour · Espace accélère le texte.";
    } else if (menu === "moves") {
      cls = "tt-menu-moves";
      const any = me.m.some(([, pp]) => pp > 0);
      if (!any) items.push(btn("Lutte (plus de PP)", () => act({ k: "move", i: -1 }), { cls: "button-primary", data: "struggle" }));
      me.m.forEach(([id, pp], i) => {
        const mv = MOVES[id];
        let eff = 1;
        if (mv.pow > 0) {
          eff = effectiveness(mv.type, typesOf(foe));
          if (mv.type === "seisme" && abilityOf(foe) === "levitation" && hunt().dex.caught.includes(foe.s)) eff = 0;
        }
        const stab = mv.pow > 0 && typesOf(me).includes(mv.type);
        const lbl = mv.pow > 0 ? effLabel(eff) : "";
        const b2 = h("button", {
          class: `tt-move-btn${eff >= 2 ? " is-super" : eff === 0 ? " is-immune" : eff < 1 ? " is-weak" : ""}`, type: "button", disabled: pp <= 0,
          style: `--tc:${TYPES[mv.type].color}`, "data-move": String(i), title: moveDesc(mv),
          onclick: () => act({ k: "move", i }),
          onmouseenter: () => { bv.help.textContent = `${mv.name} — ${CAT_NAME[mv.cat]}${mv.pow ? `, puissance ${mv.pow}` : ""}, précision ${mv.acc ?? "—"}. ${moveDesc(mv)}`; },
          onfocus: () => { bv.help.textContent = `${mv.name} — ${CAT_NAME[mv.cat]}${mv.pow ? `, puissance ${mv.pow}` : ""}, précision ${mv.acc ?? "—"}. ${moveDesc(mv)}`; }
        },
          h("span", { class: "tt-move-top" }, h("strong", {}, `${i + 1}. ${mv.name}`), h("span", { class: "tt-move-pp" }, `PP ${pp}/${mv.pp}`)),
          h("span", { class: "tt-move-sub" }, typeChip(mv.type), ` ${CAT_ICON[mv.cat]}${mv.pow ? ` ${mv.pow}` : ""}${stab ? " · STAB" : ""}`, lbl ? h("em", {}, ` ${lbl}`) : null));
        items.push(b2);
      });
      items.push(btn("Retour", () => { menu = "main"; renderMenu(); }, { data: "back" }));
      bv.help.textContent = "1 à 4 : attaque · STAB = même type que le lanceur (×1,5).";
    } else if (menu === "team" || menu === "force" || menu === "target") {
      cls = "tt-menu-team";
      const forced = menu === "force";
      const item = menu === "target" ? ITEMS[bagItem] : null;
      b.sides[0].mons.forEach((m, i) => {
        const isActive = i === b.sides[0].active;
        let disabled;
        let onclick;
        if (item) {
          const err = checkAction(b, { k: "item", id: bagItem, target: i });
          disabled = !!err;
          onclick = () => act({ k: "item", id: bagItem, target: i });
        } else {
          disabled = m.hp <= 0 || (isActive && !forced) || (forced && m.hp <= 0);
          onclick = forced ? () => sendReplacement(i) : () => act({ k: "switch", i });
        }
        const bar = hpBar(m.hp / maxHpOf(m));
        items.push(h("button", { class: `tt-team-btn${isActive ? " is-active" : ""}`, type: "button", disabled, "data-slot": String(i), onclick, title: `${nameOf(m)} — ${typesOf(m).map((t) => TYPES[t].name).join("/")} · faiblesses : ${weaknesses(typesOf(m))}` },
          monImg(m.s, 40),
          h("span", { class: "tt-team-btn-info" },
            h("strong", {}, `${nameOf(m)} `, h("span", { class: "tt-muted" }, `Niv. ${m.lv}`)),
            typeChips(typesOf(m)),
            bar.el,
            h("span", { class: "tt-hp-num" }, `${m.hp}/${maxHpOf(m)} `, statusChip(m.st), isActive ? h("em", {}, " au combat") : null))));
      });
      if (!forced) items.push(btn("Retour", () => { menu = item ? "bag" : "main"; renderMenu(); }, { data: "back" }));
      bv.help.textContent = forced ? "Ta créature est K.O. : choisis la suivante (changer ne coûte pas de tour ici)."
        : item ? `Sur qui utiliser ${item.name} ?` : "Changer de créature prend ton tour : l'adversaire attaque celle qui entre.";
    } else if (menu === "bag") {
      cls = "tt-menu-bag";
      const bag = hunt().bag;
      const ids = ITEM_IDS.filter((id) => (bag[id] || 0) > 0 && ITEMS[id].cat !== "held");
      if (!ids.length) items.push(h("p", { class: "hint" }, "Ton sac est vide. Achète des objets à la boutique du camp."));
      for (const id of ids) {
        const it = ITEMS[id];
        const ball = it.cat === "ball";
        const onTarget = ["heal", "cure", "revive", "pp"].includes(it.cat);
        const err = ball || onTarget ? (ball ? checkAction(b, { k: "item", id }) : "") : checkAction(b, { k: "item", id });
        items.push(btn(`${it.name} ×${bag[id]}`, () => {
          if (onTarget) { bagItem = id; menu = "target"; renderMenu(); return; }
          act({ k: "item", id });
        }, { disabled: !!err, title: err || it.desc, data: `item-${id}` }));
      }
      if (isWild(b)) {
        const f = activeMon(b, 1);
        const sp = SPECIES[f.s];
        bv.help.textContent = `Capture : plus ${sp.name} est affaibli (et endormi, gelé, paralysé…), plus c'est facile.${sp.rate <= 3 ? " Un Titan ne se laisse presque jamais capturer : utilise des Modules Titan." : ""}`;
      } else bv.help.textContent = "On ne capture pas les créatures des dresseurs.";
      items.push(btn("Retour", () => { menu = "main"; renderMenu(); }, { data: "back" }));
    }
    bv.menu.className = `tt-menu ${cls}`;
    bv.menu.replaceChildren(...items);
  }

  /* =========================================================
     FIN DE COMBAT
  ========================================================= */

  function endBattle() {
    const hd = hunt();
    const out = finishBattle(hd, b);
    const result = b.result;
    const lines = [];
    let title = "";
    let lost = 0;
    if (result === "win") {
      title = "Victoire !";
      if (mode.kind === "leader") {
        const def = LEADERS[mode.leader];
        if (!mode.rematch && hd.badges === mode.leader) {
          hd.badges += 1;
          lines.push(`Tu reçois le ${def.badge} !`);
          if (ZONES[mode.leader + 1]) lines.push(`Nouvelle zone : ${ZONES[mode.leader + 1].name}.`);
          else lines.push("Les 8 badges ! Le Conseil des Titans t'attend.");
          const legend = LEGENDS.find((l) => l.need === hd.badges);
          if (legend) lines.push(`Une présence étrange se fait sentir : ${ZONES.find((z) => z.id === legend.zone)?.name || "quelque part"}…`);
        }
      }
      if (mode.kind === "council" && mode.council === COUNCIL.length - 1) {
        if (!hd.champion) lines.push("Tu deviens Champion des Titans ! Le cœur du réseau s'est ouvert…");
        hd.champion = true;
        title = "Champion !";
      }
      if (mode.kind === "legend") lines.push("Le Titan s'enfuit… Il faudra le capturer pour qu'il rejoigne ton équipe.");
    } else if (result === "caught") {
      title = "Capture réussie !";
      lines.push(`${SPECIES[out.caught.s].name} rejoint ${out.where === "team" ? "ton équipe" : "ton box"} !`);
    } else if (result === "lose") {
      title = "Défaite…";
      lost = Math.min(Math.floor(wallet.trophies * 0.05), 50000);
      lines.push("Tu ramènes ton équipe au Centre de soin.");
      if (lost) lines.push(`Tu perds ${fmt(lost)} ✦ dans la panique.`);
    } else {
      title = "Fuite";
      lines.push("Tu t'es enfui sans dommage.");
    }
    if (out.trophies) lines.unshift(`+${fmt(out.trophies)} ✦ trophées`);
    if (b.xpTotal) lines.push(`Expérience gagnée par l'équipe : ${fmt(b.xpTotal)}`);
    wallet.data.bestHunt = hd.badges;
    if (out.trophies) wallet.addTrophies(out.trophies);
    if (lost) wallet.spendTrophies(lost);
    save();

    const councilNext = mode.kind === "council" && result === "win" && mode.council < COUNCIL.length - 1 ? mode.council + 1 : null;
    after = { title, lines, queue: [...out.learn.map((l) => ({ k: "learn", ...l })), ...out.evolutions.map((mon) => ({ k: "evo", mon }))], councilNext, result };
    b = null;
    bv = null;
    screen = "after";
    renderAfter();
  }

  function renderAfter() {
    const a = after;
    const task = a.queue[0];
    let taskEl = null;
    if (task?.k === "learn") {
      const mv = MOVES[task.move];
      taskEl = h("div", { class: "tt-task chamfer" },
        h("p", {}, h("strong", {}, nameOf(task.mon)), ` veut apprendre `, typeChip(mv.type), ` `, h("strong", {}, mv.name), ` (${CAT_NAME[mv.cat]}${mv.pow ? `, puissance ${mv.pow}` : ""}). Mais il connaît déjà 4 attaques.`),
        h("p", { class: "tt-muted" }, moveDesc(mv)),
        h("div", { class: "tt-chip-row" },
          task.mon.m.map(([id], slot) => h("button", { class: "button button-secondary tt-small", type: "button", "data-forget": String(slot), title: moveDesc(MOVES[id]), onclick: () => {
            teachMove(task.mon, task.move, slot); save(); a.lines.push(`${nameOf(task.mon)} oublie ${MOVES[id].name} et apprend ${mv.name} !`); a.queue.shift(); renderAfter();
          } }, `Oublier ${MOVES[id].name}`)),
          h("button", { class: "button button-primary tt-small", type: "button", "data-forget": "none", onclick: () => { a.lines.push(`${nameOf(task.mon)} n'apprend pas ${mv.name}.`); a.queue.shift(); renderAfter(); } }, "Ne pas apprendre")),
        h("p", { class: "hint" }, "Tu pourras toujours la réapprendre plus tard à l'Atelier des capacités (onglet Équipe)."));
    } else if (task?.k === "evo") {
      const mon = task.mon;
      const to = SPECIES[mon.s].evo?.[1];
      if (!to || !canEvolve(mon)) { a.queue.shift(); renderAfter(); return; }
      const img = monImg(mon.s, 140);
      taskEl = h("div", { class: "tt-task tt-evo chamfer" },
        img,
        h("p", {}, `Quoi ? ${nameOf(mon)} évolue !`),
        h("div", { class: "tt-chip-row" },
          h("button", { class: "button button-primary", type: "button", id: "tt-evolve", onclick: async (e) => {
            e.currentTarget.disabled = true;
            img.classList.add("is-evolving");
            await new Promise((r) => setTimeout(r, fast() ? 700 : 1800));
            const from = nameOf(mon);
            evolve(mon);
            save();
            img.src = monSrc(mon.s, 140);
            img.classList.remove("is-evolving");
            img.classList.add("is-evolved");
            a.lines.push(`${from} a évolué en ${SPECIES[mon.s].name} !`);
            await new Promise((r) => setTimeout(r, fast() ? 500 : 1100));
            a.queue.shift();
            renderAfter();
          } }, "Évoluer"),
          h("button", { class: "button button-secondary", type: "button", onclick: () => { a.lines.push(`${nameOf(mon)} n'a pas évolué (tu pourras le faire évoluer depuis l'équipe).`); a.queue.shift(); renderAfter(); } }, "Pas maintenant")));
    }

    const done = !a.queue.length;
    root.replaceChildren(
      h("div", { class: "tt-result chamfer", id: "tt-result" },
        h("p", { class: "overlay-title" }, a.title),
        h("ul", { class: "tt-result-lines" }, a.lines.map((l) => h("li", {}, l))),
        taskEl,
        done ? h("div", { class: "tt-zone-actions" },
          a.councilNext !== null
            ? h("button", { class: "button button-primary", type: "button", id: "tt-next", onclick: () => goCouncil(a.councilNext) }, `Combat suivant : ${COUNCIL[a.councilNext].name}`)
            : null,
          a.councilNext !== null ? h("p", { class: "hint" }, "Pas de Centre de soin pendant le Conseil : soigne-toi avec ton sac pendant les combats.") : null,
          h("button", { class: `button ${a.councilNext !== null ? "button-secondary" : "button-primary"}`, type: "button", id: "tt-camp", onclick: () => { screen = "camp"; after = null; notice = a.councilNext !== null ? "Tu as quitté le Conseil : il faudra recommencer depuis le début." : ""; renderCamp(); } },
            a.councilNext !== null ? "Abandonner le Conseil" : "Retour au camp")) : null));
    root.querySelector("#tt-next, #tt-camp, #tt-evolve, [data-forget]")?.focus({ preventScroll: true });
  }

  /* =========================================================
     CLAVIER
  ========================================================= */

  document.addEventListener("keydown", (event) => {
    if (!active || screen !== "battle" || !bv || event.ctrlKey || event.metaKey || event.altKey) return;
    const key = event.key.toLowerCase();
    const onButton = event.target instanceof Element && event.target.closest("a, button, input");
    if (busy) {
      if (key === " " || key === "enter") { event.preventDefault(); skip?.(); }
      return;
    }
    if (onButton && (key === "enter" || key === " ")) return;
    const click = (sel) => { const el = bv.menu.querySelector(sel); if (el && !el.disabled) { event.preventDefault(); el.click(); } };
    if (key === "escape" || key === "backspace") click('[data-btn="back"]');
    else if (menu === "main") {
      if (key === "a") click('[data-btn="fight"]');
      else if (key === "e") click('[data-btn="team"]');
      else if (key === "s") click('[data-btn="bag"]');
      else if (key === "f") click('[data-btn="run"]');
    } else if (menu === "moves" && /^[1-4]$/.test(key)) click(`[data-move="${Number(key) - 1}"]`);
    else if ((menu === "team" || menu === "force" || menu === "target") && /^[1-6]$/.test(key)) click(`[data-slot="${Number(key) - 1}"]`);
  });

  // Le revenu passif du Clicker notifie le portefeuille chaque seconde : on ne touche qu'au compteur de trophées.
  let lastTrophies = wallet.trophies;
  wallet.subscribe(() => {
    if (wallet.trophies === lastTrophies) return;
    lastTrophies = wallet.trophies;
    const el = root.querySelector("#tt-trophies");
    if (el && screen === "camp") el.firstChild.textContent = `${fmtShort(wallet.trophies)} `;
  });

  render();

  return {
    activate() {
      active = true;
      if (screen === "camp" || screen === "starter") render();
    },
    deactivate() { active = false; }   // un combat en cours reste tel quel (au tour par tour, rien ne s'écoule)
  };
}
