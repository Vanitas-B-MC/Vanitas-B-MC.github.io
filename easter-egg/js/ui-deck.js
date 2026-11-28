// js/ui-deck.js — interface de « Grimoire Néon » (roguelite deckbuilder ; logique dans deck.js).
// Souris / tactile : clique une carte puis l'ennemi visé. Clavier en combat : 1-9 et 0 choisir une carte,
// E fin du tour, Échap annuler la sélection.

import * as D from "./deck.js";
import { drawEnemy } from "./deck-art.js";
import { drawMini } from "./avatar-art.js";
import { wearable } from "./avatar.js";
import { h, fmt, scrollToPlay, prefersReducedMotion } from "./ui.js";

const SHARD = "❖";
const INTENT_ICON = { attack: "⚔", attackDebuff: "⚔", defend: "⛨", buff: "▲", debuff: "☠", summon: "✚" };
const INTENT_TEXT = {
  attack: "Va attaquer", attackDebuff: "Va attaquer et appliquer un malus", defend: "Va se protéger", buff: "Va se renforcer",
  debuff: "Va appliquer un malus", summon: "Va invoquer des renforts"
};
const TYPE_GLYPH = { attack: "⚔", skill: "⛨", power: "✦", curse: "☠", status: "♨" };
// Illustration de la carte : selon son effet principal
function artGlyph(def) {
  if (def.type === "curse" || def.type === "status") return TYPE_GLYPH[def.type];
  const ops = def.ops;
  const any = (fn) => ops.some(fn);
  const applies = (k) => any((o) => o.apply?.[k] || o.applyAll?.[k] || o.applyRandom?.[k] || o.self?.[k]);
  if (def.type === "power") {
    const k = Object.keys(ops.find((o) => o.self)?.self || {})[0];
    return { pRage: "⟳", pSamurai: "⛩", pFort: "▣", pPyro: "🜂", pCryo: "❅", pIce: "❆", pMage: "✶", pBotnet: "⌘", pCorrupt: "☠", pShadows: "⚚", pFlame: "✺", pEcho: "☯", thorns: "✹", dex: "➶" }[k] || "✦";
  }
  if (applies("burn") || any((o) => ["doubleBurn", "apocalypse", "burnHit"].includes(o.special))) return "🔥";
  if (applies("gel")) return "❄";
  if (applies("poison") || any((o) => ["multPoison", "poisonBurst"].includes(o.special))) return "☣";
  if (any((o) => o.addCard)) return "⚚";
  if (any((o) => o.heal)) return "✚";
  if (any((o) => o.energy)) return "⚡";
  if (any((o) => (o.times || 1) > 2 || (Array.isArray(o.times) && o.times[0] > 2))) return "⚔⚔";
  if (any((o) => o.dmgAll !== undefined)) return "✷";
  if (applies("str") || any((o) => o.special === "doubleStr")) return "💪";
  if (applies("weak") || applies("vuln")) return "◎";
  if (def.type === "attack") return "⚔";
  if (any((o) => o.block !== undefined)) return "⛨";
  if (any((o) => o.draw)) return "🂠";
  return TYPE_GLYPH[def.type] || "✦";
}
const HERO_COLOR = Object.fromEntries(D.HEROES.map((x) => [x.id, x.color]));

export function createDeckUI(root, wallet) {
  const save = () => wallet.data.deck || (wallet.data.deck = D.freshDeckSave());
  const run = () => save().run;
  const persist = () => wallet.saveDeck();

  let active = false;
  let sel = null;            // { card: index } ou { potion: slot } : en attente d'une cible
  let endInfo = null;        // résumé de la dernière partie terminée
  let menuHero = save().last.hero;
  let menuAsc = save().last.asc;
  let confirmAbandon = false;
  let lastMapScroll = null;
  let showMenu = false;      // menu ouvert pendant une partie
  let holdCombat = false;    // garde l'écran de combat affiché un instant après le dernier coup
  let portrait = null;

  const wrap = h("div", { class: "dk" });
  const top = h("div", { class: "dk-top" });
  const screen = h("div", { class: "dk-screen" });
  const modal = h("div", { class: "dk-modal", hidden: true, role: "dialog", "aria-modal": "true" });
  wrap.append(top, screen, modal);
  root.replaceChildren(wrap);

  /* =====================================================================
     Petits éléments réutilisables
  ===================================================================== */

  function cardEl(card, { onclick = null, live = false, disabled = false, price = null, sale = false, cls = "", target = null } = {}) {
    const def = D.cardById(card.id);
    const r = run();
    const c = r?.combat;
    const cost = def.unplayable ? null : live && c ? D.effectiveCost(r, card) : D.cardCost(card);
    const baseCost = D.cardCost(card);
    const text = live && c ? D.cardText(card, c.player, target, r) : D.cardText(card);
    const color = HERO_COLOR[def.hero] || (def.hero === "neutral" ? "#c8c8d8" : def.hero === "curse" ? "#8a3a5a" : "#9be7ff");
    return h(onclick ? "button" : "div", {
      class: `dk-card t-${def.type} r-${def.rarity}${card.up ? " is-up" : ""}${disabled ? " is-off" : ""}${cls ? ` ${cls}` : ""}`,
      style: `--hc:${color}`,
      type: onclick ? "button" : undefined,
      onclick: onclick || undefined,
      "aria-disabled": disabled ? "true" : undefined,
      title: `${D.cardName(card)} — ${D.TYPE_NAME[def.type]} ${D.RARITY[def.rarity].toLowerCase()}. ${text}`
    },
    cost === null ? null : h("span", { class: `dk-cost${cost < baseCost ? " is-cheap" : ""}` }, String(cost)),
    h("span", { class: "dk-cname" }, D.cardName(card)),
    h("span", { class: "dk-art", "aria-hidden": "true" }, artGlyph(def)),
    h("span", { class: "dk-ctype" }, `${D.TYPE_NAME[def.type]}${def.rarity !== "starter" && def.rarity !== "special" ? ` · ${D.RARITY[def.rarity]}` : ""}`),
    h("span", { class: "dk-ctext" }, text),
    price !== null ? h("span", { class: `dk-price${sale ? " is-sale" : ""}` }, `◆ ${price}`) : null);
  }

  function statusRow(f) {
    return h("div", { class: "dk-status" }, Object.entries(f.st).filter(([, n]) => n).map(([k, n]) => {
      const s = D.STATUS[k];
      if (!s) return null;
      return h("span", { class: `dk-st is-${s.kind}`, title: `${s.name} ${n} : ${s.text(n)}` }, h("i", { "aria-hidden": "true" }, s.icon), String(n));
    }));
  }

  function hpBar(f, cls = "") {
    const pct = Math.max(0, Math.min(100, (f.hp / f.maxHp) * 100));
    return h("div", { class: `dk-hp ${cls}` },
      h("span", { class: "dk-hp-fill", style: `width:${pct}%` }),
      h("span", { class: "dk-hp-text" }, `${Math.max(0, f.hp)} / ${f.maxHp}`),
      f.block ? h("span", { class: "dk-block", title: `Bouclier : absorbe ${f.block} dégâts` }, `⛨ ${f.block}`) : null);
  }

  function relicChip(id) {
    const rl = D.relicById(id);
    return h("span", { class: `dk-relic tier-${rl.tier}`, title: `${rl.name} : ${rl.text}` }, rl.icon);
  }

  function btn(text, onclick, cls = "button button-secondary", extra = {}) {
    return h("button", { class: cls, type: "button", onclick, ...extra }, text);
  }

  // Portrait de l'avatar de l'onglet Personnage (dessiné une fois par combat)
  function heroPortrait(size = 96) {
    const key = `${run()?.floor}-${run()?.act}`;
    if (portrait?.key === key) return portrait.cv;
    const cv = h("canvas", { class: "dk-hero-pic", width: size * 2, height: size * 2, "aria-hidden": "true" });
    try {
      const av = wallet.data.avatar;
      drawMini(cv, wearable(av, wallet.data, av.look), 0.5);
    } catch { /* portrait facultatif */ }
    portrait = { key, cv };
    return cv;
  }

  /* =====================================================================
     Fenêtre modale : choisir une carte (deck, pioche, retrait, amélioration…)
  ===================================================================== */

  function openPicker({ title, cards, onPick = null, upgradePreview = false, cancelText = "Fermer", extra = null }) {
    const close = () => { modal.hidden = true; modal.replaceChildren(); };
    const grid = h("div", { class: "dk-grid" }, cards.map(({ card, index }) => {
      const shown = upgradePreview ? { ...card, up: true } : card;
      return cardEl(shown, { onclick: onPick ? () => { close(); onPick(index); } : null });
    }));
    modal.replaceChildren(h("div", { class: "dk-modal-box chamfer" },
      h("h3", { class: "dk-h3" }, title),
      cards.length ? grid : h("p", { class: "dk-muted" }, "Aucune carte."),
      h("div", { class: "dk-row" }, extra, btn(cancelText, close))));
    modal.hidden = false;
    modal.querySelector("button")?.focus();
  }

  const deckEntries = (filter = () => true) => run().deck.map((card, index) => ({ card, index })).filter(({ card }) => filter(card));
  const showDeck = () => openPicker({ title: `Ton deck (${run().deck.length} cartes)`, cards: deckEntries().sort((a, b) => D.cardById(a.card.id).type.localeCompare(D.cardById(b.card.id).type)) });

  /* =====================================================================
     Barre du haut (pendant une partie)
  ===================================================================== */

  function renderTop() {
    const r = run();
    if (!r) { top.replaceChildren(); top.hidden = true; return; }
    top.hidden = false;
    const hero = D.heroById(r.hero);
    const hp = r.combat && !r.combat.over ? r.combat.player.hp : r.hp;
    const potions = r.potions.map((id, slot) => {
      const p = D.potionById(id);
      if (!p) return h("span", { class: "dk-potion is-empty", title: "Emplacement de stim vide" }, "○");
      const usable = (r.screen === "combat" && !r.combat?.over) || p.anywhere;
      return h("button", {
        class: `dk-potion${sel?.potion === slot ? " is-sel" : ""}`, type: "button", style: `--pc:${p.color}`,
        title: `${p.name} : ${p.text}${usable ? " (cliquer pour utiliser)" : " (en combat)"}`,
        onclick: () => onPotion(slot)
      }, p.icon);
    });
    top.replaceChildren(
      h("div", { class: "dk-top-main" },
        h("strong", { class: "dk-top-hero", style: `--hc:${hero.color}` }, hero.short),
        h("span", { class: "dk-top-hp", title: "Points de vie" }, `♥ ${Math.max(0, hp)} / ${r.maxHp}`),
        h("span", { class: "dk-top-gold", title: "Or (pour le marchand)" }, `◆ ${fmt(r.gold)}`),
        h("span", { class: "dk-top-floor" }, `Acte ${r.act} · Étage ${r.floor}${r.asc ? ` · Asc. ${r.asc}` : ""}`),
        h("span", { class: "dk-potions", "aria-label": "Stims" }, potions),
        btn(`Deck (${r.deck.length})`, showDeck, "dk-mini-btn"),
        btn("☰ Menu", () => { showMenu = true; sel = null; render(); }, "dk-mini-btn")),
      h("div", { class: "dk-relics", "aria-label": "Reliques" }, r.relics.map(relicChip)));
  }

  function onPotion(slot) {
    const r = run();
    const p = D.potionById(r.potions[slot]);
    if (!p) return;
    if (r.screen !== "combat" || r.combat?.over) {
      if (p.anywhere && D.usePotion(r, slot)) { persist(); render(); }
      return;
    }
    if (p.target === "enemy" && D.alive(r.combat).length > 1) {
      sel = sel?.potion === slot ? null : { potion: slot };
      render();
      return;
    }
    act(() => D.usePotion(r, slot, D.alive(r.combat)[0]?.uid));
  }

  /* =====================================================================
     Menu (choix du héros, méta-progression, codex)
  ===================================================================== */

  function renderMenu() {
    const s = save();
    if (!s.heroes.includes(menuHero)) menuHero = "blade";
    menuAsc = Math.min(menuAsc, s.asc[menuHero] || 0);
    const r = run();
    const parts = [];
    parts.push(h("div", { class: "dk-intro" },
      h("p", {}, "Gravis les trois actes du Réseau divin : combats au tour par tour avec ton deck de cartes, reliques, stims, marchands et événements. Chaque partie rapporte des éclats ", h("b", { class: "dk-shard" }, SHARD), " qui débloquent des améliorations permanentes (et servent aussi dans l'onglet Personnage)."),
      h("p", { class: "dk-balance" }, h("b", { class: "dk-shard" }, `${SHARD} ${fmt(s.shards)}`), " éclats")));
    if (endInfo) {
      parts.push(h("div", { class: `dk-end chamfer ${endInfo.won ? "is-win" : "is-lose"}` },
        h("h3", { class: "dk-h3" }, endInfo.won ? "Victoire ! Le Dieu-Machine est tombé." : `Défaite à l'étage ${endInfo.floor}`),
        h("p", {}, `+${fmt(endInfo.shards)} ${SHARD} éclats`, endInfo.blue ? ` · +${endInfo.blue} pièce${endInfo.blue > 1 ? "s" : ""} bleue${endInfo.blue > 1 ? "s" : ""}` : "",
          endInfo.ascUnlocked ? ` · Ascension ${endInfo.ascUnlocked} débloquée !` : ""),
        h("p", { class: "dk-muted" }, `${endInfo.kills} ennemis vaincus · ${endInfo.cards} cartes jouées · plus gros coup : ${endInfo.maxHit}`)));
    }
    if (r) {
      const hero = D.heroById(r.hero);
      parts.push(h("div", { class: "dk-resume chamfer" },
        h("div", {}, h("strong", {}, "Partie en cours : "), `${hero.name} · Acte ${r.act} (${D.ACT_NAMES[r.act]}) · Étage ${r.floor} · ♥ ${r.hp} / ${r.maxHp}${r.asc ? ` · Ascension ${r.asc}` : ""}`),
        h("div", { class: "dk-row" },
          btn("Continuer", () => { endInfo = null; showMenu = false; render(); scrollToPlay(wrap); }, "button button-primary"),
          confirmAbandon
            ? btn("Confirmer l'abandon", () => { confirmAbandon = false; finish(false); }, "button button-secondary dk-danger")
            : btn("Abandonner", () => { confirmAbandon = true; render(); }))));
    }
    // héros
    parts.push(h("h3", { class: "dk-h3" }, "Choisis ton héros"));
    parts.push(h("div", { class: "dk-heroes" }, D.HEROES.map((hero) => {
      const owned = s.heroes.includes(hero.id);
      const relic = D.relicById(hero.relic);
      return h("div", { class: `dk-heroc chamfer${menuHero === hero.id ? " is-sel" : ""}${owned ? "" : " is-locked"}`, style: `--hc:${hero.color}` },
        h("strong", {}, hero.name),
        h("span", { class: "dk-muted" }, `♥ ${hero.hp} PV · ${hero.deck.length} cartes · Ascension max ${s.asc[hero.id] || 0}`),
        h("p", {}, hero.desc),
        h("p", { class: "dk-muted" }, `Relique : ${relic.icon} ${relic.name} — ${relic.text}`),
        owned
          ? btn(menuHero === hero.id ? "Sélectionné" : "Choisir", () => { menuHero = hero.id; menuAsc = Math.min(menuAsc, s.asc[hero.id] || 0); render(); }, menuHero === hero.id ? "button button-primary" : "button button-secondary", { "aria-pressed": menuHero === hero.id ? "true" : "false" })
          : btn(`Débloquer · ${hero.cost} ${SHARD}`, () => { if (D.buyHero(s, hero.id)) { menuHero = hero.id; persist(); render(); } }, "button button-secondary", { disabled: s.shards < hero.cost }));
    })));
    // ascension
    const maxAsc = s.asc[menuHero] || 0;
    parts.push(h("div", { class: "dk-asc" },
      h("span", { class: "dk-label" }, "Ascension"),
      h("div", { class: "dk-asc-btns" }, Array.from({ length: maxAsc + 1 }, (_, i) =>
        btn(String(i), () => { menuAsc = i; render(); }, `dk-mini-btn${menuAsc === i ? " is-on" : ""}`, { "aria-pressed": menuAsc === i ? "true" : "false" }))),
      h("span", { class: "dk-muted" }, menuAsc ? `Niveaux 1 à ${menuAsc} : ${D.ASCENSIONS.slice(1, menuAsc + 1).join(" ")} (+${menuAsc * 10} % d'éclats)` : "Gagne une partie pour débloquer l'Ascension 1 (plus dur, plus d'éclats).")));
    parts.push(h("div", { class: "dk-row" },
      btn(r ? "Une partie est déjà en cours" : "Commencer la partie", () => startRun(), "button button-primary", { disabled: !!r })));
    // méta-progression
    parts.push(h("h3", { class: "dk-h3" }, `Sanctuaire des éclats ${SHARD}`));
    parts.push(h("div", { class: "dk-meta" }, D.META.map((m) => {
      const rk = D.rank(s, m.id);
      const maxed = rk >= m.max;
      const cost = maxed ? 0 : m.cost(rk);
      return h("div", { class: `dk-metac chamfer${maxed ? " is-max" : ""}` },
        h("strong", {}, `${m.icon} ${m.name}`),
        h("span", { class: "dk-pips" }, Array.from({ length: m.max }, (_, i) => h("i", { class: i < rk ? "on" : "" }))),
        h("p", {}, m.text(rk)),
        maxed ? h("em", { class: "dk-muted" }, "Maximum atteint")
          : btn(`Améliorer · ${cost} ${SHARD}`, () => { if (D.buyMeta(s, m.id)) { persist(); render(); } }, "dk-mini-btn", { disabled: s.shards < cost }));
    })));
    // codex & stats
    const st = s.stats;
    const cardTotal = D.CARD_IDS.filter((id) => !["token", "curse"].includes(D.cardById(id).hero)).length;
    parts.push(h("h3", { class: "dk-h3" }, "Codex et statistiques"));
    parts.push(h("p", { class: "dk-muted" },
      `Cartes découvertes : ${s.seenCards.filter((id) => !["token", "curse"].includes(D.cardById(id).hero)).length} / ${cardTotal} · `,
      `Ennemis rencontrés : ${s.seenEnemies.length} / ${D.ENEMY_IDS.length} · Reliques trouvées : ${s.seenRelics.length} / ${D.RELIC_IDS.length}`));
    parts.push(h("p", { class: "dk-muted" },
      `Parties : ${fmt(st.runs)} · Victoires : ${fmt(st.wins)} · Étage max : ${st.bestFloor} · Ennemis vaincus : ${fmt(st.kills)} · Élites : ${fmt(st.elites)} · Boss : ${fmt(st.bosses)} · Plus gros coup : ${fmt(st.maxHit)} · Éclats gagnés : ${fmt(st.earned)}`));
    screen.replaceChildren(h("div", { class: "dk-menu" }, parts));
  }

  function startRun() {
    const s = save();
    if (s.run) return;
    endInfo = null;
    showMenu = false;
    s.run = D.newRun(s, menuHero, menuAsc);
    s.last = { hero: menuHero, asc: menuAsc };
    persist();
    render();
    scrollToPlay(wrap);
  }

  // Fin de partie : éclats, pièces bleues, statistiques
  function finish(won) {
    const s = save();
    const r = s.run;
    if (!r) return;
    const stats = { kills: r.stats.kills, cards: r.stats.cards, maxHit: r.stats.maxHit };
    const res = D.finishRun(s, r, won);
    const blue = r.stats.bosses * 2 + (won ? 5 : 0);
    endInfo = { ...res, ...stats, blue };
    sel = null;
    showMenu = false;
    holdCombat = false;
    persist();
    if (blue) wallet.addBlue(blue);
    render();
  }

  /* =====================================================================
     Carte des étages
  ===================================================================== */

  function renderMap() {
    const r = run();
    const nodes = r.map.nodes;
    const can = D.reachable(r);
    const isNext = (n) => can.some((m) => m.row === n.row && m.col === n.col);
    const ROW_H = 64;
    const height = (D.ROWS + 1) * ROW_H + 40;
    const X = (col) => `${((col + 0.5) / 7) * 100}%`;
    const Y = (row) => height - 34 - row * ROW_H;
    const visitedRow = r.pos?.row;
    // arêtes
    const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    svg.setAttribute("class", "dk-map-lines");
    svg.setAttribute("viewBox", `0 0 700 ${height}`);
    svg.setAttribute("preserveAspectRatio", "none");
    const line = (x1, y1, x2, y2, cls) => {
      const l = document.createElementNS("http://www.w3.org/2000/svg", "line");
      l.setAttribute("x1", x1); l.setAttribute("y1", y1); l.setAttribute("x2", x2); l.setAttribute("y2", y2);
      l.setAttribute("class", cls);
      svg.append(l);
    };
    const px = (col) => ((col + 0.5) / 7) * 700;
    for (const n of nodes) {
      for (const c of n.next) line(px(n.col), Y(n.row), px(c), Y(n.row + 1), "dk-edge");
      if (n.row === D.ROWS - 1) line(px(n.col), Y(n.row), 350, Y(D.ROWS), "dk-edge is-boss");
    }
    const path = r.visited || [];
    const btns = nodes.map((n) => {
      const info = D.NODE_INFO[n.type];
      const next = isNext(n);
      const done = path.some((p) => p.row === n.row && p.col === n.col);
      const here = r.pos && r.pos.row === n.row && r.pos.col === n.col;
      return h("button", {
        class: `dk-node n-${n.type}${next ? " is-next" : ""}${done ? " is-done" : ""}${here ? " is-here" : ""}`,
        type: "button", style: `left:${X(n.col)};top:${Y(n.row)}px`,
        disabled: !next, title: `${info.name}${next ? " (cliquer pour y aller)" : ""}`,
        "aria-label": `${info.name}, étage ${n.row + 1}`,
        onclick: () => go(n.row, n.col)
      }, info.icon);
    });
    const bossNext = can.some((m) => m.row === "boss");
    const bossDef = D.enemyById({ 1: "archon", 2: "director", 3: "machinegod" }[r.act]);
    btns.push(h("button", {
      class: `dk-node n-boss${bossNext ? " is-next" : ""}`, type: "button", style: `left:50%;top:${Y(D.ROWS)}px`,
      disabled: !bossNext, title: `Boss : ${bossDef.name}`, onclick: () => go("boss", 3)
    }, "♛"));
    const field = h("div", { class: "dk-map", style: `height:${height}px` }, svg, btns);
    const scroller = h("div", { class: "dk-map-scroll" }, field);
    screen.replaceChildren(
      h("div", { class: "dk-map-head" },
        h("h3", { class: "dk-h3" }, `Acte ${r.act} — ${D.ACT_NAMES[r.act]}`),
        h("p", { class: "dk-muted" }, "Choisis ta route vers le boss : ", Object.entries(D.NODE_INFO).map(([k, v]) => h("span", { class: `dk-legend n-${k}` }, `${v.icon} ${v.name}`)))),
      scroller);
    // fait défiler jusqu'à la position actuelle
    requestAnimationFrame(() => {
      const targetRow = visitedRow === undefined || visitedRow === null ? 0 : visitedRow === "boss" ? D.ROWS : visitedRow;
      const y = Y(targetRow) - scroller.clientHeight * 0.6;
      scroller.scrollTop = lastMapScroll ?? Math.max(0, y);
      lastMapScroll = null;
    });
  }

  function go(row, col) {
    const r = run();
    if (!D.enterNode(r, row, col)) return;
    r.visited = [...(r.visited || []), { row, col }];
    if (r.combat) D.noteEnemies(save(), r);
    sel = null;
    persist();
    render();
  }

  /* =====================================================================
     Combat
  ===================================================================== */

  const enemyCanvas = new Map();   // uid → canvas dessiné une fois

  function renderCombat() {
    const r = run();
    const c = r.combat;
    const targeting = sel && (sel.card !== undefined || sel.potion !== undefined);
    const enemies = c.enemies.filter((e) => !e.dead || e.justDied).map((e) => {
      const def = D.enemyById(e.id);
      let cv = enemyCanvas.get(`${r.floor}-${e.uid}`);
      if (!cv) {
        cv = h("canvas", { class: "dk-enemy-pic", width: 240, height: 240, "aria-hidden": "true" });
        drawEnemy(cv, def.art);
        enemyCanvas.set(`${r.floor}-${e.uid}`, cv);
      }
      const it = e.dead ? null : D.intentOf(r, e);
      const intent = it ? h("div", { class: `dk-intent i-${it.kind}`, title: `${INTENT_TEXT[it.kind]} : ${it.name}${it.dmg ? ` (${it.dmg}${it.times > 1 ? ` × ${it.times}` : ""} dégâts)` : ""}` },
        h("i", { "aria-hidden": "true" }, INTENT_ICON[it.kind] || "?"),
        it.dmg || it.kind.startsWith("attack") ? h("b", {}, `${it.dmg}${it.times > 1 ? `×${it.times}` : ""}`) : null) : null;
      return h("button", {
        class: `dk-enemy tier-${def.tier}${e.dead ? " is-dead" : ""}${targeting && !e.dead ? " is-target" : ""}`,
        type: "button", "data-uid": e.uid, disabled: e.dead,
        "aria-label": `${def.name}, ${e.hp} PV sur ${e.maxHp}${it ? `. ${INTENT_TEXT[it.kind]}` : ""}`,
        onclick: () => onEnemy(e.uid)
      }, intent, cv, h("strong", { class: "dk-ename" }, def.name), hpBar(e), statusRow(e));
    });
    const p = c.player;
    const single = D.alive(c).length === 1 ? D.alive(c)[0] : null;
    const hand = c.hand.map((card, i) => {
      const playable = D.cardPlayable(r, card);
      return cardEl(card, {
        live: true, target: single, disabled: !playable, cls: sel?.card === i ? "is-sel" : "",
        onclick: () => onCard(i)
      });
    });
    hand.forEach((el, i) => el.style.setProperty("--i", i - (hand.length - 1) / 2));
    const pile = (label, list, title) => btn(`${label} ${list.length}`, () => openPicker({ title, cards: list.map((card, index) => ({ card, index })) }), "dk-mini-btn");
    screen.replaceChildren(h("div", { class: `dk-battle${c.kind === "boss" ? " is-boss" : ""}` },
      h("div", { class: "dk-enemies" }, enemies),
      h("div", { class: "dk-player", "data-uid": "p" },
        heroPortrait(64),
        h("div", { class: "dk-pinfo" },
          h("strong", {}, D.heroById(r.hero).name),
          hpBar(p, "is-player"),
          statusRow(p)),
        h("div", { class: "dk-energy", title: "Énergie : chaque carte coûte de l'énergie" }, h("b", {}, String(c.energy)), h("span", {}, `/ ${c.maxEnergy}`))),
      h("p", { class: "dk-hint" }, targeting ? "Choisis un ennemi (Échap pour annuler)." : c.log.slice(-2).join(" ")),
      h("div", { class: "dk-hand", "aria-label": "Ta main" }, hand),
      h("div", { class: "dk-controls" },
        pile("Pioche", [...c.draw].sort((a, b) => a.id.localeCompare(b.id)), "Pioche (ordre masqué)"),
        pile("Défausse", c.discard, "Défausse"),
        pile("Épuisées", c.exhaust, "Cartes épuisées"),
        btn("Fin du tour (E)", () => endTurn(), "button button-primary dk-endturn"))));
  }

  function onCard(i) {
    const r = run();
    const c = r.combat;
    const card = c.hand[i];
    if (!card || !D.cardPlayable(r, card)) return;
    if (D.needsTarget(card) && D.alive(c).length > 1) {
      sel = sel?.card === i ? null : { card: i };
      render();
      return;
    }
    sel = null;
    act(() => D.playCard(r, i, D.alive(c)[0]?.uid));
  }

  function onEnemy(uid) {
    const r = run();
    if (!sel) return;
    const s = sel;
    sel = null;
    if (s.card !== undefined) act(() => D.playCard(r, s.card, uid));
    else if (s.potion !== undefined) act(() => D.usePotion(r, s.potion, uid));
  }

  function endTurn() {
    const r = run();
    if (!r?.combat || r.combat.over) return;
    sel = null;
    act(() => { D.endTurn(r); return true; }, true);
  }

  // Joue une action de combat, sauvegarde, réaffiche et anime les dégâts
  function act(fn, enemyTurn = false) {
    const r = run();
    if (!r?.combat) return;
    r.combat.fx = [];
    const before = new Set(r.combat.enemies.filter((e) => e.dead).map((e) => e.uid));
    if (!fn()) { render(); return; }
    for (const e of r.combat.enemies) e.justDied = e.dead && !before.has(e.uid);
    const fxs = r.combat.fx.slice();
    persist();
    if (r.combat.over) {
      // on laisse voir le coup final avant l'écran de récompense (ou de défaite)
      holdCombat = true;
      setTimeout(() => { holdCombat = false; if (active) render(); }, prefersReducedMotion() ? 150 : 900);
    }
    render();
    playFx(fxs, enemyTurn);
    for (const e of r.combat?.enemies || []) delete e.justDied;
  }

  function playFx(list, slow) {
    if (prefersReducedMotion()) return;
    let delay = 0;
    for (const f of list) {
      const el = f.who === "p" ? screen.querySelector(".dk-player") : screen.querySelector(`.dk-enemy[data-uid="${f.who}"]`);
      if (!el) continue;
      const d = delay;
      if (f.t === "act") { setTimeout(() => flash(el, "is-lunge"), d); if (slow) delay += 260; continue; }
      if (f.t === "dmg" || f.t === "heal" || f.t === "block") {
        setTimeout(() => {
          const n = h("span", { class: `dk-float f-${f.t}` }, f.t === "dmg" ? `-${f.n}` : f.t === "heal" ? `+${f.n}` : `⛨${f.n}`);
          n.style.left = `${35 + Math.random() * 30}%`;
          el.append(n);
          setTimeout(() => n.remove(), 900);
          if (f.t === "dmg") flash(el, "is-hit");
        }, d);
        delay += slow ? 90 : 40;
      }
      if (f.t === "die") setTimeout(() => flash(el, "is-dying"), d);
    }
  }
  function flash(el, cls) {
    el.classList.remove(cls);
    void el.offsetWidth;
    el.classList.add(cls);
  }

  /* =====================================================================
     Récompenses, relique de boss
  ===================================================================== */

  function renderReward() {
    const r = run();
    const rw = r.reward;
    const items = rw.items.map((it, i) => {
      if (it.taken) return null;
      if (it.type === "gold") return btn(`◆ ${it.n} or`, () => { D.takeReward(r, i); persist(); render(); }, "dk-reward");
      if (it.type === "potion") {
        const p = D.potionById(it.id);
        const full = !r.potions.includes(null);
        return btn(`${p.icon} ${p.name}${full ? " (emplacements pleins)" : ""}`, () => { if (D.takeReward(r, i)) { persist(); render(); } }, "dk-reward", { disabled: full, title: p.text });
      }
      if (it.type === "relic" && it.id) {
        const rl = D.relicById(it.id);
        return btn(`${rl.icon} ${rl.name}`, () => { D.takeReward(r, i); persist(); render(); }, "dk-reward is-relic", { title: rl.text });
      }
      if (it.type === "cards") return btn("✦ Ajouter une carte à ton deck", () => chooseCard(i), "dk-reward is-cards");
      return null;
    });
    screen.replaceChildren(h("div", { class: "dk-room" },
      h("h3", { class: "dk-h3" }, rw.kind === "boss" ? "Boss vaincu !" : rw.kind === "elite" ? "Élite vaincue !" : "Victoire !"),
      h("div", { class: "dk-rewards" }, items.filter(Boolean).length ? items : h("p", { class: "dk-muted" }, "Tout est ramassé.")),
      h("div", { class: "dk-row" }, btn(rw.kind === "boss" && r.act >= 3 ? "Terminer la partie" : "Continuer", () => { D.leaveReward(r); persist(); render(); }, "button button-primary"))));
  }

  function chooseCard(i) {
    const r = run();
    const it = r.reward.items[i];
    const reroll = r.rerolls > 0 ? btn(`Relancer (${r.rerolls})`, () => { modal.hidden = true; D.rerollCards(r, i); persist(); chooseCard(i); }, "dk-mini-btn") : null;
    openPicker({
      title: "Choisis une carte (ou passe)",
      cards: it.cards.map((card, index) => ({ card, index })),
      onPick: (index) => { D.takeReward(r, i, index); persist(); render(); },
      cancelText: "Passer",
      extra: reroll
    });
  }

  function renderBossRelic() {
    const r = run();
    screen.replaceChildren(h("div", { class: "dk-room" },
      h("h3", { class: "dk-h3" }, "Relique du boss"),
      h("p", { class: "dk-muted" }, "Choisis une relique puissante pour l'acte suivant."),
      h("div", { class: "dk-rewards" }, (r.reward.bossRelics || []).map((id) => {
        const rl = D.relicById(id);
        return btn(h("span", {}, h("b", {}, `${rl.icon} ${rl.name}`), h("small", {}, rl.text)), () => { D.takeBossRelic(r, id); persist(); render(); }, "dk-reward is-relic");
      })),
      h("div", { class: "dk-row" }, btn("Passer", () => { D.takeBossRelic(r, null); persist(); render(); }))));
  }

  /* =====================================================================
     Salles : feu de camp, marchand, trésor, événement
  ===================================================================== */

  function renderRest() {
    const r = run();
    const healN = D.restHeal(r);
    const upg = deckEntries(D.canUpgrade);
    screen.replaceChildren(h("div", { class: "dk-room" },
      h("div", { class: "dk-room-art", "aria-hidden": "true" }, "🔥"),
      h("h3", { class: "dk-h3" }, "Feu de camp"),
      h("p", { class: "dk-muted" }, "Un moment de répit au milieu des circuits. Une seule action possible."),
      h("div", { class: "dk-rewards" },
        btn(`♥ Se reposer : +${Math.min(healN, r.maxHp - r.hp)} PV`, () => { D.rest(r, "heal"); persist(); render(); }, "dk-reward", { disabled: healN <= 0 }),
        btn(`⚒ Améliorer une carte (${upg.length} possibles)`, () => openPicker({
          title: "Améliorer quelle carte ? (aperçu amélioré)", cards: upg, upgradePreview: true, cancelText: "Annuler",
          onPick: (index) => { D.rest(r, "upgrade", index); persist(); render(); }
        }), "dk-reward", { disabled: !upg.length }))));
  }

  function renderShop() {
    const r = run();
    const s = r.shop;
    const removePrice = D.shopPrice(r, r.removeCost);
    const buyBtn = (kind, i) => () => { if (D.buy(r, kind, i)) { persist(); render(); } };
    screen.replaceChildren(h("div", { class: "dk-room dk-shop" },
      h("h3", { class: "dk-h3" }, "¤ Le marchand du Réseau"),
      h("p", { class: "dk-muted" }, `Tu as ◆ ${fmt(r.gold)} or.`),
      h("div", { class: "dk-grid" }, s.cards.map((it, i) => it.sold ? h("div", { class: "dk-card is-sold" }, "Vendu") : cardEl(it, {
        price: D.shopPrice(r, it.price), sale: it.sale, disabled: r.gold < D.shopPrice(r, it.price), onclick: buyBtn("cards", i)
      }))),
      h("div", { class: "dk-shop-row" },
        s.relics.map((it, i) => {
          const rl = D.relicById(it.id);
          const price = D.shopPrice(r, it.price);
          return it.sold ? null : btn(h("span", {}, h("b", {}, `${rl.icon} ${rl.name}`), h("small", {}, rl.text), h("em", {}, `◆ ${price}`)), buyBtn("relics", i), "dk-reward is-relic", { disabled: r.gold < price });
        }),
        s.potions.map((it, i) => {
          const p = D.potionById(it.id);
          const price = D.shopPrice(r, it.price);
          return it.sold ? null : btn(h("span", {}, h("b", {}, `${p.icon} ${p.name}`), h("small", {}, p.text), h("em", {}, `◆ ${price}`)), buyBtn("potions", i), "dk-reward", { disabled: r.gold < price || !r.potions.includes(null) });
        }),
        s.removed ? null : btn(h("span", {}, h("b", {}, "✂ Retirer une carte"), h("small", {}, "Supprime définitivement une carte de ton deck."), h("em", {}, `◆ ${removePrice}`)), () => openPicker({
          title: "Retirer quelle carte ?", cards: deckEntries(), cancelText: "Annuler",
          onPick: (index) => { D.removeCard(r, index); persist(); render(); }
        }), "dk-reward", { disabled: r.gold < removePrice })),
      h("div", { class: "dk-row" }, btn("Quitter la boutique", () => { D.leaveRoom(r); persist(); render(); }, "button button-primary"))));
  }

  function renderTreasure() {
    const r = run();
    const t = r.treasure;
    const rl = t.relic ? D.relicById(t.relic) : null;
    screen.replaceChildren(h("div", { class: "dk-room" },
      h("div", { class: "dk-room-art", "aria-hidden": "true" }, t.opened ? "🔓" : "🧰"),
      h("h3", { class: "dk-h3" }, "Trésor"),
      t.opened
        ? h("p", {}, `Tu trouves ◆ ${t.gold} or`, rl ? ` et ${rl.icon} ${rl.name} (${rl.text})` : "", ".")
        : btn("Ouvrir le coffre", () => { D.openChest(r); persist(); render(); }, "button button-primary"),
      t.opened ? h("div", { class: "dk-row" }, btn("Continuer", () => { D.leaveRoom(r); persist(); render(); }, "button button-primary")) : null));
  }

  function renderEvent() {
    const r = run();
    const ev = D.eventById(r.event.id);
    const res = r.event.result;
    const pk = r.event.pick;
    let body;
    if (res) body = [h("p", { class: "dk-result" }, res), h("div", { class: "dk-row" }, btn("Continuer", () => { D.leaveRoom(r); persist(); render(); }, "button button-primary"))];
    else if (pk) {
      const titles = { remove: "Retirer quelle carte ?", upgrade: "Améliorer quelle carte ?", transform: "Transformer quelle carte ?", card: "Choisis une carte" };
      const cards = pk.pick === "card" ? pk.cards.map((card, index) => ({ card, index })) : pk.pick === "upgrade" ? deckEntries(D.canUpgrade) : deckEntries();
      body = [h("div", { class: "dk-row" },
        btn(titles[pk.pick], () => openPicker({
          title: titles[pk.pick], cards, upgradePreview: pk.pick === "upgrade", cancelText: "Annuler",
          onPick: (index) => { D.eventPick(r, index); persist(); render(); }
        }), "button button-primary"),
        btn("Renoncer", () => { D.skipEventPick(r); persist(); render(); }))];
    } else {
      body = [h("div", { class: "dk-choices" }, ev.choices.map((ch, i) => {
        const ok = !ch.ok || ch.ok(r);
        return btn(ch.text, () => { if (D.chooseEvent(r, i)) { persist(); render(); } }, "dk-reward", { disabled: !ok });
      }))];
    }
    screen.replaceChildren(h("div", { class: "dk-room" },
      h("div", { class: "dk-room-art", "aria-hidden": "true" }, ev.art),
      h("h3", { class: "dk-h3" }, ev.name),
      h("p", { class: "dk-story" }, ev.text),
      body));
  }

  /* =====================================================================
     Rendu général
  ===================================================================== */

  function render() {
    const r = run();
    if (enemyCanvas.size > 40) enemyCanvas.clear();
    if (holdCombat && r?.combat) { renderTop(); renderCombat(); return; }
    if (r && (r.screen === "over" || r.screen === "victory")) { finish(r.screen === "victory"); return; }
    if (!r || showMenu) { top.hidden = true; top.replaceChildren(); renderMenu(); return; }
    endInfo = null;
    renderTop();
    switch (r.screen) {
      case "map": renderMap(); break;
      case "combat": renderCombat(); break;
      case "reward": renderReward(); break;
      case "boss-relic": renderBossRelic(); break;
      case "rest": renderRest(); break;
      case "shop": renderShop(); break;
      case "treasure": renderTreasure(); break;
      case "event": renderEvent(); break;
      default: renderMap();
    }
  }

  /* ---------- Clavier ---------- */

  function onKey(e) {
    if (!active || e.target.closest?.("input, textarea, select")) return;
    if (!modal.hidden) { if (e.key === "Escape") { modal.hidden = true; modal.replaceChildren(); } return; }
    const r = run();
    if (!r || r.screen !== "combat" || r.combat?.over) return;
    if (e.key === "Escape" && sel) { sel = null; render(); e.preventDefault(); return; }
    if (e.key === "e" || e.key === "E") { endTurn(); e.preventDefault(); return; }
    const n = e.key === "0" ? 9 : Number(e.key) - 1;
    if (Number.isInteger(n) && n >= 0 && n < 10 && r.combat.hand[n]) { onCard(n); e.preventDefault(); }
  }
  modal.addEventListener("click", (e) => { if (e.target === modal) { modal.hidden = true; modal.replaceChildren(); } });

  return {
    activate() {
      active = true;
      document.addEventListener("keydown", onKey);
      render();
    },
    deactivate() {
      active = false;
      document.removeEventListener("keydown", onKey);
      modal.hidden = true;
      sel = null;
      confirmAbandon = false;
      showMenu = false;
    }
  };
}
