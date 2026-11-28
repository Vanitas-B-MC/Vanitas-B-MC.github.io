// js/ui-ranch.js — interface de « Vallée Néon » (la logique est dans ranch.js, les dessins dans ranch-art.js).
//
// Vue du dessus qui suit le fermier. Clavier : flèches / ZQSD (ou WASD) pour marcher, Espace ou E pour agir sur la case
// devant soi (maintenir pour charger la houe et l'arrosoir améliorés), 1 à 0 pour choisir un objet, R pour manger.
// Souris / doigt : toucher une case voisine agit dessus ; toucher plus loin y fait marcher le fermier.
// Le temps s'arrête pendant les menus (boutique, expédition…) et quand on quitte le jeu.

import * as R from "./ranch.js";
import { drawGround, drawSoil, drawCrop, drawObject, drawBuilding, drawFarmer, drawAnimal, drawIcon } from "./ranch-art.js";
import { h, fmt, fmtShort, prefersReducedMotion } from "./ui.js";

const { TILE, MAP_W, MAP_H } = R;
const SPEED = 4.6;               // cases par seconde
const ACT_REPEAT = 290;          // ms entre deux coups quand on maintient l'action
const CHARGE_STEP = 420;         // ms par niveau de charge
const SAVE_EVERY = 4000;
const TOOL_COLORS = { hoe: "#9aa0a8", can: "#3a8ac8", axe: "#c8d0dc", pick: "#9aa0a8", scythe: "#d0d8e0" };

function stat(label, valueEl) { return h("div", {}, h("dt", {}, label), h("dd", {}, valueEl)); }

export function createRanchUI(root, wallet) {
  const S = () => wallet.data.ranch;
  let active = false;
  let rafId = 0;
  let lastFrame = 0;
  let sel = 0;
  let tab = "bag";
  let modal = null;
  let modalData = null;
  let shopTab = "seeds";
  let moveFrom = -1;               // slot à déplacer (mode « Déplacer »)
  const keys = new Set();
  let path = null;
  let charge = null;               // { start, x, y }
  let actionHeld = false;
  let actTarget = null;            // case fixée par un clic
  let nextAct = 0;
  let swing = 0;
  let walk = 0;
  let mouseTile = null;
  let useMouse = false;
  let floaters = [];
  let particles = [];
  let drops = [];
  const animalPos = [];
  let dirty = true;
  let needSave = false;
  let lastSave = 0;
  let lastHud = 0;
  let lastLate = 0;
  let zoom = 2;
  let cam = { x: 0, y: 0 };
  let viewW = 320, viewH = 200;
  const iconCache = new Map();

  /* ================= Squelette ================= */

  const board = h("canvas", { class: "rv-canvas", "aria-label": "La ferme, vue du dessus", tabindex: "0" });
  const ctx = board.getContext("2d");
  const toast = h("p", { class: "game-toast rv-toast", "aria-live": "polite" });
  const modalEl = h("div", { class: "rv-modal", hidden: true, role: "dialog", "aria-modal": "false" });
  const stage = h("div", { class: "game-stage rv-stage" }, board, toast, modalEl);

  const dateEl = h("strong", {});
  const clockEl = h("strong", {});
  const weatherEl = h("strong", {});
  const goldEl = h("strong", { class: "rv-gold" });
  const waterEl = h("strong", {});
  const energyFill = h("span", { class: "sv-bar-fill rv-energy" });
  const energyText = h("span", { class: "sv-bar-text" });
  const hotbar = h("div", { class: "rv-hotbar", role: "toolbar", "aria-label": "Barre d'objets" });
  const slotEls = Array.from({ length: 12 }, (_, i) => {
    const img = h("span", { class: "rv-slot-icon" });
    const count = h("span", { class: "rv-slot-n" });
    const key = h("span", { class: "rv-slot-key" }, i < 9 ? String(i + 1) : i === 9 ? "0" : i === 10 ? "-" : "=");
    const b = h("button", { class: "rv-slot", type: "button", onclick: () => selectSlot(i) }, img, count, key);
    hotbar.append(b);
    return { b, img, count, last: "" };
  });

  const actionButton = h("button", { class: "button button-primary rv-act", type: "button" }, "Action");
  const eatButton = h("button", { class: "button button-secondary rv-eat", type: "button", onclick: () => eat() }, "Manger");
  const fsButton = h("button", { class: "map-button rv-fs", type: "button", onclick: () => toggleFullscreen() }, "⛶ Plein écran");
  fsButton.hidden = !document.fullscreenEnabled;

  const tabs = [["bag", "Sac"], ["craft", "Artisanat"], ["skills", "Compétences"], ["ach", "Succès"], ["help", "Aide"]];
  const tabBar = h("div", { class: "td-maps rv-tabs", role: "tablist" }, tabs.map(([id, label]) =>
    h("button", { class: "map-button", type: "button", role: "tab", "data-tab": id, onclick: () => { tab = id; moveFrom = -1; dirty = true; renderSide(true); } }, label)));
  const sideBody = h("div", { class: "rv-side-body" });

  root.replaceChildren(
    h("p", { class: "game-rules" },
      "Ta propre ferme, façon Stardew Valley. Dégage le terrain, laboure, plante, arrose chaque jour et récolte ; mets tes produits dans la caisse d'expédition, ils sont payés pendant la nuit. ",
      "Quatre saisons de 14 jours : chaque graine a la sienne. Construis le poulailler et la grange, améliore tes outils avec du minerai de la carrière, fabrique arroseurs et machines, et répare la serre pour cultiver toute l'année. ",
      "Chaque nuit, l'or gagné rapporte aussi des crédits à l'arcade, et les succès donnent des pièces bleues."),
    h("div", { class: "sv-layout rv-layout" },
      h("div", { class: "sv-main" },
        h("dl", { class: "td-stats rv-topbar" },
          stat("Date", dateEl), stat("Heure", clockEl), stat("Météo", weatherEl), stat("Or", goldEl), stat("Arrosoir", waterEl)),
        h("div", { class: "sv-board-wrap chamfer rv-wrap" }, stage),
        h("div", { class: "sv-bars" }, h("div", { class: "sv-bar", role: "img", "aria-label": "Énergie" }, energyFill, energyText)),
        hotbar,
        h("div", { class: "rv-controls" }, actionButton, eatButton, fsButton)),
      h("aside", { class: "sv-side rv-side" }, tabBar, sideBody))
  );

  /* ================= Utilitaires ================= */

  function iconURL(id, tier = 0) {
    const key = `${id}|${tier}`;
    if (iconCache.has(key)) return iconCache.get(key);
    const c = document.createElement("canvas");
    c.width = 32; c.height = 32;
    const g = c.getContext("2d");
    g.imageSmoothingEnabled = false;
    g.scale(2, 2);
    drawIcon(g, id, tier);
    const url = c.toDataURL();
    iconCache.set(key, url);
    return url;
  }
  const tierOf = (id) => (R.UPGRADABLE_TOOLS.includes(id) ? S().tools[id] : 0);
  function icon(id, cls = "rv-icon") {
    const img = h("img", { class: cls, alt: "", src: iconURL(id, tierOf(id)), width: "32", height: "32" });
    return img;
  }
  function itemName(s) {
    const info = R.itemInfo(s.id);
    if (!info) return "?";
    const tier = R.UPGRADABLE_TOOLS.includes(s.id) && S().tools[s.id] ? ` ${R.TOOL_TIERS[S().tools[s.id]]}` : "";
    return `${info.name}${tier}${s.q ? ` (${R.QUALITY[s.q]})` : ""}`;
  }

  let toastTimer = 0;
  function say(text, tone = "") {
    if (!text) return;
    toast.textContent = text;
    toast.dataset.tone = tone;
    toast.classList.add("is-on");
    window.clearTimeout(toastTimer);
    toastTimer = window.setTimeout(() => toast.classList.remove("is-on"), 2600);
  }

  function award(achIds) {
    for (const id of achIds ?? []) {
      const a = R.ACHIEVEMENTS.find((k) => k.id === id);
      if (!a) continue;
      wallet.addBlue(a.blue);
      say(`Succès : ${a.name} ! +${a.blue} pièce${a.blue > 1 ? "s" : ""} bleue${a.blue > 1 ? "s" : ""}`, "win");
    }
  }

  function save(force = false) {
    if (!force && !needSave) return;
    needSave = false;
    lastSave = performance.now();
    wallet.saveRanch();
  }
  const touched = () => { dirty = true; needSave = true; };

  function selectSlot(i) {
    if (i >= S().bag) return;
    if (moveFrom >= 0 && moveFrom !== i) {
      const inv = S().inv;
      [inv[moveFrom], inv[i]] = [inv[i], inv[moveFrom]];
      moveFrom = -1;
      touched();
    }
    sel = i;
    dirty = true;
    renderSide(true);
  }

  /* ================= Plein écran, taille du canvas ================= */

  const fsTarget = () => root.querySelector(".rv-wrap");
  function toggleFullscreen() {
    if (document.fullscreenElement) document.exitFullscreen?.();
    else fsTarget()?.requestFullscreen?.().catch(() => {});
  }
  document.addEventListener("fullscreenchange", () => {
    const on = document.fullscreenElement === fsTarget();
    fsButton.textContent = on ? "✕ Quitter le plein écran" : "⛶ Plein écran";
    fsTarget()?.classList.toggle("is-fullscreen", on);
    resize();
  });

  function resize() {
    const w = board.clientWidth || 640;
    const hh = board.clientHeight || 400;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    board.width = Math.round(w * dpr);
    board.height = Math.round(hh * dpr);
    const tiles = w < 520 ? 11 : w < 800 ? 16 : 21;
    zoom = board.width / (tiles * TILE);
    viewW = board.width / zoom;
    viewH = board.height / zoom;
  }
  if ("ResizeObserver" in window) new ResizeObserver(resize).observe(board);
  window.addEventListener("resize", resize);

  /* ================= Déplacement ================= */

  function blocked(r, x, y) {
    const x0 = Math.floor(x - 0.3), x1 = Math.floor(x + 0.3);
    const y0 = Math.floor(y - 0.35), y1 = Math.floor(y - 0.02);
    for (let ty = y0; ty <= y1; ty++) for (let tx = x0; tx <= x1; tx++) if (R.isSolid(r, tx, ty)) return true;
    return false;
  }

  function findPath(r, gx, gy) {
    const sx = Math.floor(r.px), sy = Math.floor(r.py);
    const goals = new Set();
    if (!R.isSolid(r, gx, gy)) goals.add(R.idx(gx, gy));
    else for (const [dx, dy] of [[0, 1], [0, -1], [1, 0], [-1, 0]]) if (R.inMap(gx + dx, gy + dy) && !R.isSolid(r, gx + dx, gy + dy)) goals.add(R.idx(gx + dx, gy + dy));
    if (!goals.size) return null;
    const prev = new Int32Array(MAP_W * MAP_H).fill(-2);
    const start = R.idx(sx, sy);
    prev[start] = -1;
    const queue = [start];
    for (let qi = 0; qi < queue.length; qi++) {
      const cur = queue[qi];
      if (goals.has(cur)) {
        const out = [];
        for (let c = cur; c !== -1 && c !== start; c = prev[c]) out.push({ x: c % MAP_W, y: Math.floor(c / MAP_W) });
        return out.reverse();
      }
      const cx = cur % MAP_W, cy = Math.floor(cur / MAP_W);
      for (const [dx, dy] of [[0, 1], [0, -1], [1, 0], [-1, 0]]) {
        const nx = cx + dx, ny = cy + dy;
        if (!R.inMap(nx, ny)) continue;
        const n = R.idx(nx, ny);
        if (prev[n] !== -2 || R.isSolid(r, nx, ny)) continue;
        prev[n] = cur;
        queue.push(n);
      }
    }
    return null;
  }

  function move(r, dt) {
    if (modal || charge) return false;
    let dx = 0, dy = 0;
    if (keys.has("left")) dx -= 1;
    if (keys.has("right")) dx += 1;
    if (keys.has("up")) dy -= 1;
    if (keys.has("down")) dy += 1;
    if (dx || dy) path = null;
    else if (path && path.length) {
      const p = path[0];
      const tx = p.x + 0.5, ty = p.y + 0.6;
      const ddx = tx - r.px, ddy = ty - r.py;
      const dist = Math.hypot(ddx, ddy);
      if (dist < 0.08) { r.px = tx; r.py = ty; path.shift(); if (!path.length) path = null; return true; }
      dx = ddx / dist; dy = ddy / dist;
    } else return false;
    const len = Math.hypot(dx, dy) || 1;
    const speed = (r.energy <= 0 ? 2.6 : SPEED) * dt;
    const mx = (dx / len) * speed, my = (dy / len) * speed;
    let moved = false;
    if (mx && !blocked(r, r.px + mx, r.py)) { r.px += mx; moved = true; }
    if (my && !blocked(r, r.px, r.py + my)) { r.py += my; moved = true; }
    if (path && !moved) path = null;
    if (Math.abs(dx) > Math.abs(dy)) r.face = dx > 0 ? 1 : 3;
    else if (dy) r.face = dy > 0 ? 2 : 0;
    return moved;
  }

  /* ================= Animaux ================= */

  function syncAnimals(r, dt, now) {
    animalPos.length = Math.min(animalPos.length, r.animals.length);
    r.animals.forEach((a, k) => {
      const b = R.buildingById(R.animalById(a.kind).home);
      const p = b.pen;
      const box = { x0: p.x + 1.4, x1: p.x + p.w - 1.4, y0: p.y + 1.6, y1: p.y + p.h - 1.2 };
      let s = animalPos[k];
      if (!s || s.kind !== a.kind) {
        s = animalPos[k] = { kind: a.kind, x: box.x0 + Math.random() * (box.x1 - box.x0), y: box.y0 + Math.random() * (box.y1 - box.y0), tx: 0, ty: 0, wait: Math.random() * 2, flip: false };
        s.tx = s.x; s.ty = s.y;
      }
      if (s.wait > 0) { s.wait -= dt; return; }
      const dx = s.tx - s.x, dy = s.ty - s.y;
      const d = Math.hypot(dx, dy);
      if (d < 0.05) {
        s.wait = 1 + Math.random() * 4;
        s.tx = box.x0 + Math.random() * (box.x1 - box.x0);
        s.ty = box.y0 + Math.random() * (box.y1 - box.y0);
        return;
      }
      const v = (a.kind === "poule" || a.kind === "canard" ? 1 : 0.6) * dt;
      s.x += (dx / d) * Math.min(v, d);
      s.y += (dy / d) * Math.min(v, d);
      s.flip = dx < 0;
    });
  }

  function animalNear(x, y) {
    let best = -1, bd = 1.0;
    animalPos.forEach((s, k) => {
      const d = Math.hypot(s.x - (x + 0.5), s.y - (y + 0.6));
      if (d < bd) { bd = d; best = k; }
    });
    return best;
  }

  /* ================= Actions ================= */

  const reach = (r, x, y) => Math.max(Math.abs(x - Math.floor(r.px)), Math.abs(y - Math.floor(r.py))) <= 1;

  function targetTile(r) {
    if (actTarget) return actTarget;
    if (useMouse && mouseTile && reach(r, mouseTile.x, mouseTile.y)) return mouseTile;
    return R.frontTile(r);
  }

  function faceTo(r, x, y) {
    const dx = x - Math.floor(r.px), dy = y - Math.floor(r.py);
    if (!dx && !dy) return;
    if (Math.abs(dx) >= Math.abs(dy)) r.face = dx > 0 ? 1 : 3;
    else r.face = dy > 0 ? 2 : 0;
  }

  function special(r, x, y) {
    const o = r.obj[R.idx(x, y)];
    return !!R.buildingAt(x, y) || !!R.cropStage(r, R.idx(x, y))?.ready || (o && (o.t === "forage" || R.MACHINES.includes(o.t)))
      || animalNear(x, y) >= 0 || ((R.groundAt(x, y) === R.G.GHDOOR || R.groundAt(x, y) === R.G.GHWALL) && !r.built.greenhouse);
  }

  function pressAction() {
    if (modal) return;
    const r = S();
    const t = targetTile(r);
    faceTo(r, t.x, t.y);
    if (R.chargeable(r, sel) && !special(r, t.x, t.y)) {
      charge = { start: performance.now(), x: t.x, y: t.y };
      return;
    }
    act(t.x, t.y, 0);
    actionHeld = true;
    nextAct = performance.now() + ACT_REPEAT * 1.4;
  }

  function releaseAction() {
    actionHeld = false;
    actTarget = null;
    if (!charge) return;
    const r = S();
    const power = Math.min(r.tools[r.inv[sel]?.id] ?? 0, Math.floor((performance.now() - charge.start) / CHARGE_STEP));
    const { x, y } = charge;
    charge = null;
    act(x, y, power);
  }

  function act(x, y, power) {
    const r = S();
    if (modal) return;
    const k = animalNear(x, y);
    let res;
    if (k >= 0) res = R.petAnimal(r, k);
    else res = R.interact(r, sel, x, y, power);
    handle(res, x, y);
  }

  function handle(res, x, y) {
    const r = S();
    if (res.msg) say(res.msg, res.ok ? "" : "lose");
    for (const g of res.gains) {
      const info = g.id === "foin" ? { name: "Foin" } : R.itemInfo(g.id);
      floaters.push({ x: x * TILE + 8, y: y * TILE, text: `+${g.n} ${info?.name ?? ""}${g.q ? " ★" : ""}`, color: g.q >= 2 ? "#ffd23a" : g.q === 1 ? "#dde4ee" : "#fff", life: 1.4 });
    }
    for (const lv of res.levels) say(`${R.SKILLS[lv.skill].name} : niveau ${lv.lvl} !`, "win");
    for (const f of res.fx) burst(f);
    award(res.ach);
    const id = r.inv[sel]?.id;
    if (res.ok && id && R.isTool(id)) swing = 0.22;
    if (res.open) openModal(res.open, { id: res.building });
    touched();
  }

  function burst(f) {
    if (prefersReducedMotion()) return;
    const colors = { dirt: "#7a4a22", water: "#6ab0ff", chip: f.color ?? "#ccc", leaf: "#5ac04a", splash: "#8ac8ff", harvest: f.color ?? "#fff", fall: "#3a9a4a", seed: "#d8c088", fert: "#c8a060", ship: "#ffd23a" };
    const n = f.kind === "fall" ? 14 : f.kind === "harvest" ? 10 : 6;
    for (let k = 0; k < n; k++) {
      particles.push({ x: f.x * TILE + 8 + (Math.random() - 0.5) * 8, y: f.y * TILE + 8 + (Math.random() - 0.5) * 6,
        vx: (Math.random() - 0.5) * 50, vy: -20 - Math.random() * 40, life: 0.5 + Math.random() * 0.4, color: colors[f.kind] ?? "#fff", sparkle: f.kind === "harvest" });
    }
  }

  function eat() {
    const r = S();
    const s = r.inv[sel];
    if (!s) return;
    const e = R.eatSlot(r, sel);
    if (!e) { say("Ça ne se mange pas.", "lose"); return; }
    say(`Miam ! +${e} énergie.`, "win");
    touched();
  }

  /* ================= Fenêtres (boutique, expédition…) ================= */

  function openModal(type, data = null) {
    const r = S();
    if (type === "shop" && !R.shopOpen(r)) { say("Le kiosque est fermé (ouvert de 8 h à 20 h).", "lose"); return; }
    modal = type;
    modalData = data;
    keys.clear();
    charge = null;
    actionHeld = false;
    path = null;
    renderModal();
    modalEl.hidden = false;
    modalEl.querySelector("button")?.focus({ preventScroll: true });
  }
  function closeModal() {
    if (modal === "report") { modalData = null; }
    modal = null;
    modalEl.hidden = true;
    modalEl.replaceChildren();
    board.focus({ preventScroll: true });
    dirty = true;
  }

  const closeBtn = (label = "Fermer") => h("button", { class: "button button-secondary", type: "button", onclick: closeModal }, label);
  const costText = (entry) => {
    const parts = [];
    if (entry.price) parts.push(entry.currency === "blue" ? `${entry.price} pièce${entry.price > 1 ? "s" : ""} bleue${entry.price > 1 ? "s" : ""}` : `${fmt(entry.price)} or`);
    for (const [id, n] of Object.entries(entry.cost ?? {})) parts.push(`${n} ${R.itemInfo(id).name.toLowerCase()}`);
    return parts.join(" + ");
  };

  function renderModal() {
    const r = S();
    const head = (title, sub) => [h("p", { class: "rv-modal-title" }, title), sub ? h("p", { class: "rv-modal-sub" }, sub) : null];
    let body = [];

    if (modal === "sleep") {
      const late = r.time >= R.MIDNIGHT;
      body = [...head("Aller au lit ?", `Il est ${R.clockText(r.time)}. La journée se termine : la caisse d'expédition (${fmt(R.binValue(r))} or) sera payée, les cultures arrosées pousseront.${late ? " Tu t'es couché tard : tu auras moins d'énergie demain." : ""}`),
        h("div", { class: "rv-modal-actions" },
          h("button", { class: "button button-primary", type: "button", onclick: () => doSleep(false) }, "Dormir"),
          closeBtn("Pas encore"))];
    }

    else if (modal === "report") {
      const rep = modalData;
      const list = h("ul", { class: "rv-list" });
      for (const s of rep.shipped) list.append(h("li", {}, icon(s.id), h("span", {}, `${s.n} × ${itemName(s)}`), h("em", {}, `${fmt(R.sellPrice(s.id, s.q) * s.n)} or`)));
      if (!rep.shipped.length) list.append(h("li", { class: "rv-empty" }, "Rien n'a été expédié."));
      body = [...head(rep.passedOut ? "Tu t'es évanoui de fatigue…" : "Bonne nuit !", `${R.dateText(r)} — ${R.WEATHER[r.weather].icon} ${R.WEATHER[r.weather].name} · demain : ${R.WEATHER[r.tomorrow].icon} ${R.WEATHER[r.tomorrow].name}`),
        h("p", { class: "rv-modal-sub" }, "Expédié hier :"), list,
        h("p", { class: "rv-total" }, `Total : +${fmt(rep.gold)} or${rep.credits ? ` · +${fmtShort(rep.credits)} crédits d'arcade` : ""}`),
        rep.lost ? h("p", { class: "rv-warn" }, `Quelqu'un t'a ramené chez toi… et s'est servi : −${fmt(rep.lost)} or.`) : null,
        ...rep.events.map((e) => h("p", { class: "rv-event" }, e)),
        h("div", { class: "rv-modal-actions" }, h("button", { class: "button button-primary", type: "button", onclick: closeModal }, "Commencer la journée"))];
    }

    else if (modal === "ship") {
      const list = h("ul", { class: "rv-list" });
      r.inv.slice(0, r.bag).forEach((s, i) => {
        if (!s || R.isTool(s.id) || R.sellPrice(s.id, s.q) <= 0) return;
        list.append(h("li", {}, icon(s.id), h("span", {}, `${s.n} × ${itemName(s)}`), h("em", {}, `${fmt(R.sellPrice(s.id, s.q))} or pièce`),
          h("button", { class: "button button-secondary rv-mini", type: "button", onclick: () => { R.shipSlot(r, i, 1); touched(); renderModal(); } }, "1"),
          h("button", { class: "button button-secondary rv-mini", type: "button", onclick: () => { R.shipSlot(r, i); touched(); renderModal(); } }, "Tout")));
      });
      if (!list.children.length) list.append(h("li", { class: "rv-empty" }, "Rien à expédier dans ton sac."));
      const bin = h("ul", { class: "rv-list rv-bin" });
      for (const s of r.bin) bin.append(h("li", {}, icon(s.id), h("span", {}, `${s.n} × ${itemName(s)}`), h("em", {}, `${fmt(R.sellPrice(s.id, s.q) * s.n)} or`)));
      body = [...head("Caisse d'expédition", "Ce que tu mets ici est vendu pendant la nuit."), list,
        h("p", { class: "rv-modal-sub" }, `Dans la caisse : ${fmt(R.binValue(r))} or`), bin,
        h("div", { class: "rv-modal-actions" },
          h("button", { class: "button button-secondary", type: "button", disabled: !r.bin.length, onclick: () => { if (!R.unshipLast(r)) say("Pas de place dans le sac.", "lose"); touched(); renderModal(); } }, "Reprendre le dernier"),
          closeBtn())];
    }

    else if (modal === "board") {
      const rq = r.request;
      const info = rq ? R.itemInfo(rq.id) : null;
      const have = rq ? R.countItem(r, rq.id) : 0;
      body = [...head("Panneau des demandes", "Une nouvelle demande chaque matin.")];
      if (rq && info) {
        body.push(h("div", { class: "rv-request" }, icon(rq.id, "rv-icon rv-icon-big"),
          h("div", {}, h("p", {}, `On cherche : ${rq.n} × ${info.name}`), h("p", { class: "rv-modal-sub" }, `Récompense : ${fmt(rq.reward)} or · tu en as ${have}`))));
        if (rq.done) body.push(h("p", { class: "rv-event" }, "Demande remplie. Merci ! Reviens demain."));
      }
      body.push(h("div", { class: "rv-modal-actions" },
        h("button", { class: "button button-primary", type: "button", disabled: !rq || rq.done || have < rq.n, onclick: () => { const res = R.deliverRequest(r); say(res.msg, res.ok ? "win" : "lose"); award(res.ach); touched(); renderModal(); } }, "Livrer"),
        closeBtn()));
    }

    else if (modal === "shop") {
      const tabsShop = [["seeds", "Graines"], ["supplies", "Fournitures"], ["tools", "Outils"], ["build", "Bâtiments"], ["animals", "Animaux"]];
      const bar = h("div", { class: "td-maps" }, tabsShop.map(([id, label]) => h("button", { class: `map-button${shopTab === id ? " is-active" : ""}`, type: "button", onclick: () => { shopTab = id; renderModal(); } }, label)));
      const list = h("ul", { class: "rv-list rv-shop" });
      for (const e of R.shopItems(r).filter((x) => x.tab === shopTab)) list.append(shopRow(r, e));
      if (!list.children.length) list.append(h("li", { class: "rv-empty" }, shopTab === "tools" ? "Tous tes outils sont au maximum !" : "Rien pour l'instant."));
      body = [...head("Kiosque de Robin", `Tu as ${fmt(r.gold)} or · ${fmt(wallet.blue)} pièce${wallet.blue > 1 ? "s" : ""} bleue${wallet.blue > 1 ? "s" : ""}. ${R.SEASONS[r.season]} : graines de saison.`), bar, list,
        h("div", { class: "rv-modal-actions" }, closeBtn())];
    }

    else if (modal === "build") {
      const target = modalData?.id ?? null;
      const entries = R.shopItems(r).filter((e) => e.tab === "build" && (!target || e.build === target));
      const list = h("ul", { class: "rv-list rv-shop" }, entries.map((e) => shopRow(r, e)));
      body = [...head("Chantier", "Robin peut construire ici. Il faut de l'or et des matériaux."), list,
        h("div", { class: "rv-modal-actions" }, closeBtn())];
    }

    else if (modal === "animals") {
      const home = modalData?.id ?? "coop";
      const mine = r.animals.map((a, k) => ({ a, k })).filter(({ a }) => R.animalById(a.kind).home === home);
      const list = h("ul", { class: "rv-list" });
      for (const { a } of mine) {
        const kind = R.animalById(a.kind);
        const hearts = Math.round(a.mood / 51);
        list.append(h("li", {}, h("span", { class: "rv-hearts", "aria-label": `${hearts} cœurs sur 5` }, "♥".repeat(hearts) + "♡".repeat(5 - hearts)),
          h("span", {}, `${a.name} — ${kind.name}`), h("em", {}, a.ready ? `${R.itemInfo(kind.product).name} à ramasser` : a.petted ? "caressé·e aujourd'hui" : "à caresser")));
      }
      if (!mine.length) list.append(h("li", { class: "rv-empty" }, "Aucun animal : achète-en au kiosque de Robin."));
      body = [...head(home === "coop" ? "Poulailler" : "Grange", `${mine.length} / ${R.HOUSE_CAP[home]} animaux · silo : ${r.hay} / ${R.HAY_CAP} foin. Caresse-les chaque jour et ramasse leurs produits dans l'enclos. Beau temps (hors hiver) : ils broutent ; sinon ils mangent du foin.`), list,
        h("div", { class: "rv-modal-actions" }, closeBtn())];
    }

    modalEl.replaceChildren(h("div", { class: "rv-modal-inner chamfer" }, ...body.filter(Boolean)));
  }

  function shopRow(r, e) {
    const name = e.label ?? R.itemInfo(e.item)?.name ?? "?";
    const iconId = e.item ?? (e.tool ? e.tool : e.animal ? (R.animalById(e.animal).product) : e.hay ? "fibre" : e.bag ? "laine" : "bois");
    let desc = "";
    if (e.item?.startsWith("seed:")) {
      const c = R.cropById(e.item.slice(5));
      desc = `${c.days} jours${c.regrow ? `, repousse en ${c.regrow}` : ""} · vente ${c.sell} or${c.yield > 1 ? ` ×${c.yield}` : ""} · ${c.seasons.map((k) => R.SEASONS[k]).join(", ")}${e.offSeason ? " (serre)" : ""}`;
    } else if (e.tool) desc = { hoe: "Maintiens l'action pour labourer plusieurs cases.", can: `Plus d'eau (${R.canCapacity(r.tools.can + 1)}) et arrosage de zone en maintenant.`, axe: "Coupe les arbres en moins de coups.", pick: "Casse les rochers et minerais plus vite." }[e.tool];
    else if (e.animal) { const a = R.animalById(e.animal); desc = `${R.itemInfo(a.product).name} ${a.every === 1 ? "chaque jour" : `tous les ${a.every} jours`}${e.locked ? ` · il faut ${a.home === "coop" ? "le poulailler" : "la grange"}` : e.full ? " · bâtiment plein" : ""}`; }
    else if (e.build === "greenhouse") desc = "Tout pousse en toute saison à l'intérieur (8 × 4 cases).";
    else if (e.build) desc = e.build === "coop" ? "Poules et canards (6 places) + silo à foin." : "Vaches, chèvres et moutons (6 places) + silo à foin.";
    else if (e.n) desc = `Lot de ${e.n}.`;
    if (e.item === "seed:ancien") desc = "Fruit rare : 14 jours puis repousse toutes les 7 nuits, vente 550 or. Printemps, été, automne.";
    const buyTimes = (times) => {
      let res = { ok: false, msg: "" };
      let done = 0;
      for (let k = 0; k < times; k++) {
        res = R.buy(r, e, { blueBalance: wallet.blue, spendBlue: (n) => wallet.spendBlue(n) });
        award(res.ach);
        if (!res.ok) break;
        done += 1;
      }
      say(done > 1 ? `Acheté ×${done}.` : res.ok || !done ? res.msg : `Acheté ×${done}.`, done ? "win" : "lose");
      touched();
      save(true);
      if (modal === "build" && done) closeModal(); else renderModal();
    };
    const bulk = e.item && e.currency === "gold" && !e.n;
    return h("li", {}, icon(iconId), h("div", { class: "rv-shop-text" }, h("strong", {}, name), h("span", {}, desc)),
      h("em", { class: e.currency === "blue" ? "rv-blue" : "" }, costText(e)),
      h("button", { class: "button button-secondary rv-mini", type: "button", disabled: !!(e.locked || e.full), onclick: () => buyTimes(1) }, "Acheter"),
      bulk ? h("button", { class: "button button-secondary rv-mini", type: "button", onclick: () => buyTimes(10) }, "×10") : null);
  }

  function doSleep(passedOut) {
    const r = S();
    const rep = R.sleep(r, { passedOut, balance: wallet.credits });
    rep.passedOut = passedOut;
    if (rep.credits) wallet.addCredits(rep.credits);
    award(rep.ach);
    path = null;
    floaters = [];
    touched();
    save(true);
    modal = null;
    openModal("report", rep);
  }

  /* ================= Panneau latéral ================= */

  let sideKey = "";
  function renderSide(force = false) {
    const r = S();
    tabBar.querySelectorAll("button").forEach((b) => { b.classList.toggle("is-active", b.dataset.tab === tab); b.setAttribute("aria-selected", String(b.dataset.tab === tab)); });
    const key = `${tab}|${sel}|${moveFrom}|${JSON.stringify(r.inv)}|${r.bag}|${JSON.stringify(r.xp)}|${r.ach.length}|${JSON.stringify(r.tools)}`;
    if (!force && key === sideKey) return;
    sideKey = key;
    const out = [];

    if (tab === "bag") {
      const grid = h("div", { class: "rv-bag" });
      for (let i = 0; i < 36; i++) {
        const s = r.inv[i];
        const locked = i >= r.bag;
        grid.append(h("button", { class: `rv-bag-slot${i === sel ? " is-sel" : ""}${i === moveFrom ? " is-move" : ""}${locked ? " is-locked" : ""}`, type: "button", disabled: locked,
          title: s ? itemName(s) : locked ? "Agrandis ton sac au kiosque" : "Vide", onclick: () => selectSlot(i) },
          s ? icon(s.id) : null, s && s.n > 1 ? h("span", { class: "rv-slot-n" }, String(s.n)) : null, s?.q ? h("span", { class: `rv-q rv-q${s.q}` }, "★") : null));
      }
      out.push(h("p", { class: "rv-side-note" }, `Sac : ${r.inv.slice(0, r.bag).filter(Boolean).length} / ${r.bag}. Les 12 premières cases forment la barre rapide.`), grid);
      const s = r.inv[sel];
      if (s) {
        const info = R.itemInfo(s.id);
        const e = R.itemEnergy(s.id, s.q);
        const price = R.sellPrice(s.id, s.q);
        out.push(h("div", { class: "rv-detail" },
          h("p", { class: "rv-detail-name" }, itemName(s)),
          h("p", { class: "rv-detail-sub" }, [price ? `Vente : ${fmt(price)} or` : null, e ? `Énergie : +${e}` : null, info.cat === "tool" ? toolHelp(s.id) : null, info.cat === "place" ? "À poser sur une case libre." : null, info.cat === "seed" ? seedHelp(info.crop) : null].filter(Boolean).join(" · ")),
          h("div", { class: "rv-detail-actions" },
            e ? h("button", { class: "button button-secondary rv-mini", type: "button", onclick: eat }, "Manger (R)") : null,
            h("button", { class: "button button-secondary rv-mini", type: "button", onclick: () => { moveFrom = moveFrom === sel ? -1 : sel; renderSide(true); } }, moveFrom === sel ? "Annuler" : "Déplacer"),
            !R.isTool(s.id) ? h("button", { class: "button button-secondary rv-mini", type: "button", onclick: () => { if (window.confirm(`Jeter ${s.n} × ${info.name} ?`)) { r.inv[sel] = null; touched(); renderSide(true); } } }, "Jeter") : null)));
        if (moveFrom >= 0) out.push(h("p", { class: "rv-side-note" }, "Choisis la case où le mettre."));
      }
    }

    else if (tab === "craft") {
      const lvl = R.skillLevel(r, "farm");
      out.push(h("p", { class: "rv-side-note" }, `Les recettes se débloquent avec le niveau d'agriculture (tu es niveau ${lvl}).`));
      const list = h("ul", { class: "rv-list rv-craft" });
      for (const rec of R.RECIPES) {
        const open = R.recipeUnlocked(r, rec);
        const cost = Object.entries(rec.cost).map(([id, n]) => `${n} ${R.itemInfo(id).name.toLowerCase()} (${R.countItem(r, id)})`).join(", ");
        list.append(h("li", { class: open ? "" : "is-locked" }, icon(rec.id),
          h("div", { class: "rv-shop-text" }, h("strong", {}, `${R.itemInfo(rec.id).name}${rec.out > 1 ? ` ×${rec.out}` : ""}`), h("span", {}, open ? `${rec.desc} Coût : ${cost}.` : `Agriculture niveau ${rec.lvl}.`)),
          h("button", { class: "button button-secondary rv-mini", type: "button", disabled: !R.canCraft(r, rec), onclick: () => { if (R.craft(r, rec)) { say(`Fabriqué : ${R.itemInfo(rec.id).name}.`, "win"); touched(); renderSide(true); } } }, "Fabriquer")));
      }
      out.push(list);
    }

    else if (tab === "skills") {
      for (const [id, sk] of Object.entries(R.SKILLS)) {
        const xp = r.xp[id];
        const lvl = R.levelOf(xp);
        const lo = lvl ? R.XP_LEVELS[lvl - 1] : 0;
        const hi = R.XP_LEVELS[lvl] ?? lo;
        const pct = lvl >= 10 ? 100 : Math.round(((xp - lo) / (hi - lo)) * 100);
        out.push(h("div", { class: "rv-skill" },
          h("p", { class: "rv-detail-name" }, `${sk.name} — niveau ${lvl}`),
          h("div", { class: "sv-bar" }, h("span", { class: "sv-bar-fill sv-xp", style: `width:${pct}%` }), h("span", { class: "sv-bar-text" }, lvl >= 10 ? "Maximum" : `${fmt(xp)} / ${fmt(hi)} XP`)),
          h("p", { class: "rv-detail-sub" }, sk.desc)));
      }
      const tools = R.UPGRADABLE_TOOLS.map((t) => `${R.itemInfo(t).name} ${R.TOOL_TIERS[r.tools[t]]}`).join(" · ");
      out.push(h("h3", { class: "subhead" }, "Outils"), h("p", { class: "rv-detail-sub" }, tools));
      out.push(h("h3", { class: "subhead" }, "Statistiques"), h("dl", { class: "td-stats rv-stats" },
        stat("Jours", h("strong", {}, fmt(r.stats.days))), stat("Récoltes", h("strong", {}, fmt(r.stats.harvests))),
        stat("Or expédié", h("strong", {}, fmtShort(r.stats.shipped))), stat("Meilleure nuit", h("strong", {}, fmtShort(r.stats.best))),
        stat("Objets différents", h("strong", {}, `${r.stats.ids.length} / 30`)), stat("Demandes", h("strong", {}, fmt(r.stats.requests)))));
    }

    else if (tab === "ach") {
      const list = h("ul", { class: "rv-list" });
      for (const a of R.ACHIEVEMENTS) {
        const done = r.ach.includes(a.id);
        list.append(h("li", { class: done ? "is-done" : "" }, h("span", { class: "rv-ach-mark" }, done ? "✔" : "○"),
          h("div", { class: "rv-shop-text" }, h("strong", {}, a.name), h("span", {}, a.desc)), h("em", { class: "rv-blue" }, `+${a.blue} ◆`)));
      }
      out.push(list);
    }

    else if (tab === "help") {
      out.push(h("ul", { class: "game-help rv-help" },
        h("li", {}, h("kbd", {}, "ZQSD"), " / ", h("kbd", {}, "WASD"), " / flèches : marcher"),
        h("li", {}, h("kbd", {}, "Espace"), " ou ", h("kbd", {}, "E"), " : agir devant soi (maintenir = coups répétés, ou charge de la houe / l'arrosoir améliorés)"),
        h("li", {}, h("kbd", {}, "1"), "…", h("kbd", {}, "0"), h("kbd", {}, "-"), h("kbd", {}, "="), " ou molette : choisir l'objet · ", h("kbd", {}, "R"), " : manger"),
        h("li", {}, "Souris ou doigt : touche une case voisine pour agir dessus, plus loin pour y marcher."),
        h("li", {}, "La caisse d'expédition est payée la nuit. Le kiosque ouvre de 8 h à 20 h."),
        h("li", {}, "Va au lit (la porte de la maison) avant 2 h, sinon tu t'évanouis et perds un peu d'or."),
        h("li", {}, "Pluie et neige arrosent pour toi. Hors saison, les cultures fanent (sauf dans la serre)."),
        h("li", {}, "Minerais : dans la carrière à l'est. Le fer apparaît au niveau 2 de minage, l'or au niveau 5.")));
    }
    sideBody.replaceChildren(...out);
  }

  const toolHelp = (id) => ({
    hoe: "Laboure l'herbe.", can: "Arrose la terre ; se remplit au puits ou à l'étang.", axe: "Coupe branches, arbres et souches ; reprend les objets posés.",
    pick: "Casse pierres et minerais ; reprend les objets posés.", scythe: "Coupe les mauvaises herbes, l'herbe haute (foin) et récolte."
  }[id]);
  const seedHelp = (cropId) => { const c = R.cropById(cropId); return `${c.days} jours · ${c.seasons.map((k) => R.SEASONS[k]).join(", ")}${c.regrow ? ` · repousse en ${c.regrow}` : ""}`; };

  /* ================= Barre du haut et barre rapide ================= */

  function renderHud() {
    const r = S();
    dateEl.textContent = R.dateText(r);
    clockEl.textContent = R.clockText(r.time);
    clockEl.classList.toggle("is-late", r.time >= R.MIDNIGHT);
    weatherEl.textContent = `${R.WEATHER[r.weather].icon} → ${R.WEATHER[r.tomorrow].icon}`;
    weatherEl.title = `Aujourd'hui : ${R.WEATHER[r.weather].name} · demain : ${R.WEATHER[r.tomorrow].name}`;
    goldEl.textContent = fmtShort(r.gold);
    goldEl.title = `${fmt(r.gold)} or`;
    waterEl.textContent = `${r.water} / ${R.canCapacity(r.tools.can)}`;
    const e = Math.max(0, r.energy);
    energyFill.style.width = `${(e / R.MAX_ENERGY) * 100}%`;
    energyFill.classList.toggle("is-low", r.energy < 20);
    energyText.textContent = r.energy <= 0 ? "Épuisé : va dormir ou mange quelque chose" : `Énergie ${Math.round(e)} / ${R.MAX_ENERGY}`;
    for (let i = 0; i < 12; i++) {
      const s = r.inv[i];
      const v = slotEls[i];
      const key = `${s?.id}|${s?.n}|${s?.q}|${i === sel}|${i < r.bag}|${s ? tierOf(s.id) : 0}`;
      if (v.last === key) continue;
      v.last = key;
      v.b.classList.toggle("is-sel", i === sel);
      v.b.disabled = i >= r.bag;
      v.b.title = s ? itemName(s) : "Vide";
      v.img.replaceChildren(...(s ? [icon(s.id)] : []));
      v.count.textContent = s && s.n > 1 ? String(s.n) : "";
      v.b.dataset.q = s?.q ? String(s.q) : "";
    }
    const s = r.inv[sel];
    eatButton.disabled = !s || !R.itemEnergy(s.id, s.q);
  }

  /* ================= Dessin ================= */

  function draw(now) {
    const r = S();
    const W = board.width, H = board.height;
    ctx.imageSmoothingEnabled = false;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.fillStyle = "#0a0a12";
    ctx.fillRect(0, 0, W, H);

    cam.x = Math.max(0, Math.min(MAP_W * TILE - viewW, r.px * TILE - viewW / 2));
    cam.y = Math.max(0, Math.min(MAP_H * TILE - viewH, r.py * TILE - 6 - viewH / 2));
    if (viewW > MAP_W * TILE) cam.x = (MAP_W * TILE - viewW) / 2;
    const ox = Math.round(cam.x * zoom), oy = Math.round(cam.y * zoom);
    ctx.setTransform(zoom, 0, 0, zoom, -ox, -oy);

    const x0 = Math.max(0, Math.floor(cam.x / TILE) - 1), x1 = Math.min(MAP_W - 1, Math.ceil((cam.x + viewW) / TILE) + 1);
    const y0 = Math.max(0, Math.floor(cam.y / TILE) - 1), y1 = Math.min(MAP_H - 1, Math.ceil((cam.y + viewH) / TILE) + 2);

    for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
      const t = R.groundAt(x, y);
      drawGround(ctx, t, x, y, r.season, now, r.built.greenhouse);
      const soil = r.soil[R.idx(x, y)];
      if (soil) drawSoil(ctx, x, y, soil, r.season);
    }

    // Objets triés par leur base (les plus bas passent devant).
    const sprites = [];
    for (let y = y0; y <= Math.min(MAP_H - 1, y1 + 2); y++) for (let x = x0; x <= x1; x++) {
      const i = R.idx(x, y);
      const o = r.obj[i];
      if (o) sprites.push({ y: (y + 1) * TILE - (o.t === "weed" || o.t === "grass" || o.t === "branch" || o.t === "forage" ? 4 : 1), draw: () => drawObject(ctx, x, y, o, r.season, now, { morning: r.time < R.DAY_START + 30 }) });
      const c = r.crops[i];
      if (c) { const st = R.cropStage(r, i); sprites.push({ y: (y + 1) * TILE - 3, draw: () => drawCrop(ctx, x, y, c.c, st.stage, c.dead, now) }); }
    }
    const state = { binCount: r.bin.length, requestOpen: r.request && !r.request.done, shopOpen: R.shopOpen(r) };
    for (const b of R.BUILDINGS) {
      if (b.x * TILE > cam.x + viewW + 32 || (b.x + b.w) * TILE < cam.x - 32 || b.y * TILE > cam.y + viewH + 64 || (b.y + b.h) * TILE < cam.y - 32) continue;
      const night = r.time >= 19 * 60;
      sprites.push({ y: (b.y + b.h) * TILE, draw: () => drawBuilding(ctx, b, { ...state, built: r.built[b.id] }, r.season, now, night) });
    }
    r.animals.forEach((a, k) => {
      const s = animalPos[k];
      if (s) sprites.push({ y: s.y * TILE, draw: () => drawAnimal(ctx, a.kind, s.x * TILE, s.y * TILE, s.flip, now + k * 333, a.ready) });
    });
    const tool = r.inv[sel] && R.isTool(r.inv[sel].id) ? TOOL_COLORS[r.inv[sel].id] : null;
    sprites.push({ y: r.py * TILE, draw: () => drawFarmer(ctx, r.px * TILE, r.py * TILE, r.face, walk, swing > 0 ? 1 - swing / 0.22 : 0, tool) });
    sprites.sort((a, b) => a.y - b.y);
    for (const s of sprites) s.draw();

    // Case visée.
    if (!modal) {
      const t = charge ? { x: charge.x, y: charge.y } : targetTile(r);
      const lvl = charge ? Math.min(r.tools[r.inv[sel]?.id] ?? 0, Math.floor((now - charge.start) / CHARGE_STEP)) : 0;
      ctx.lineWidth = 1;
      ctx.strokeStyle = "rgba(255,255,255,.85)";
      for (const p of R.toolArea(t.x, t.y, r.face, lvl)) ctx.strokeRect(p.x * TILE + 0.5, p.y * TILE + 0.5, TILE - 1, TILE - 1);
      if (charge) {
        const max = r.tools[r.inv[sel]?.id] ?? 0;
        const pct = Math.min(1, (now - charge.start) / (CHARGE_STEP * Math.max(1, max)));
        ctx.fillStyle = "rgba(0,0,0,.6)"; ctx.fillRect(r.px * TILE - 10, r.py * TILE - 32, 20, 4);
        ctx.fillStyle = lvl >= max ? "#fcee0a" : "#00f0ff"; ctx.fillRect(r.px * TILE - 10, r.py * TILE - 32, 20 * pct, 4);
      }
    }
    if (path && path.length) {
      const p = path[path.length - 1];
      ctx.fillStyle = "rgba(0,240,255,.35)";
      ctx.fillRect(p.x * TILE + 5, p.y * TILE + 5, 6, 6);
    }

    for (const p of particles) {
      ctx.globalAlpha = Math.max(0, Math.min(1, p.life * 2));
      ctx.fillStyle = p.sparkle && Math.random() < 0.5 ? "#fff" : p.color;
      ctx.fillRect(p.x, p.y, p.sparkle ? 1.5 : 2, p.sparkle ? 1.5 : 2);
    }
    ctx.globalAlpha = 1;
    ctx.font = "bold 7px Rajdhani, system-ui, sans-serif";
    ctx.textAlign = "center";
    for (const f of floaters) {
      ctx.globalAlpha = Math.min(1, f.life);
      ctx.fillStyle = "#000";
      ctx.fillText(f.text, f.x + 0.6, f.y + 0.6);
      ctx.fillStyle = f.color;
      ctx.fillText(f.text, f.x, f.y);
    }
    ctx.globalAlpha = 1;

    // Écran : météo puis nuit.
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    if (r.weather === "rain" || r.weather === "storm" || r.weather === "snow") {
      const snow = r.weather === "snow";
      ctx.strokeStyle = "rgba(170,200,255,.55)";
      ctx.fillStyle = "rgba(255,255,255,.85)";
      ctx.lineWidth = Math.max(1, zoom * 0.5);
      ctx.beginPath();
      for (const d of drops) {
        if (snow) ctx.fillRect(d.x * W, d.y * H, zoom * 1.2, zoom * 1.2);
        else { ctx.moveTo(d.x * W, d.y * H); ctx.lineTo(d.x * W - 3 * zoom, d.y * H + 9 * zoom); }
      }
      if (!snow) ctx.stroke();
      ctx.fillStyle = snow ? "rgba(230,240,255,.08)" : "rgba(30,40,80,.18)";
      ctx.fillRect(0, 0, W, H);
      if (r.weather === "storm" && Math.sin(now / 1700) > 0.995) { ctx.fillStyle = "rgba(255,255,255,.5)"; ctx.fillRect(0, 0, W, H); }
    }
    const dark = r.time < 18 * 60 ? 0 : Math.min(0.62, ((r.time - 18 * 60) / 240) * 0.62);
    if (dark > 0) {
      ctx.fillStyle = `rgba(12,8,40,${dark})`;
      ctx.fillRect(0, 0, W, H);
      ctx.globalCompositeOperation = "lighter";
      const glow = (wx, wy, rad, c) => {
        const sx = wx * zoom - ox, sy = wy * zoom - oy;
        const g = ctx.createRadialGradient(sx, sy, 0, sx, sy, rad * zoom);
        g.addColorStop(0, c); g.addColorStop(1, "rgba(0,0,0,0)");
        ctx.fillStyle = g; ctx.fillRect(sx - rad * zoom, sy - rad * zoom, rad * 2 * zoom, rad * 2 * zoom);
      };
      const k = dark / 0.62;
      glow(5 * TILE + 17, 2 * TILE + 46, 26, `rgba(255,200,90,${0.35 * k})`);
      glow(5 * TILE + 69, 2 * TILE + 46, 26, `rgba(255,200,90,${0.35 * k})`);
      glow(42 * TILE, 3 * TILE, 40, `rgba(255,43,214,${0.25 * k})`);
      glow(r.px * TILE, r.py * TILE - 8, 30, `rgba(0,240,255,${0.12 * k})`);
      ctx.globalCompositeOperation = "source-over";
    }
  }

  /* ================= Boucle ================= */

  function frame(now) {
    rafId = 0;
    if (!active) return;
    const dt = Math.min(0.05, (now - lastFrame) / 1000);
    lastFrame = now;
    const r = S();

    if (!modal) {
      r.time = Math.min(R.DAY_END, r.time + (dt * 1000) / R.REAL_MS_PER_MIN);
      if (r.time >= R.DAY_END) { doSleep(true); }
      else if (r.time >= R.MIDNIGHT && now - lastLate > 60000) { lastLate = now; say("Il est tard… rentre dormir avant 2 h !", "lose"); }
      const moved = move(r, dt);
      walk = moved ? walk + dt * 14 : 0;
      if (actionHeld && !charge && now >= nextAct) { const t = targetTile(r); faceTo(r, t.x, t.y); act(t.x, t.y, 0); nextAct = now + ACT_REPEAT; }
    }
    swing = Math.max(0, swing - dt);
    syncAnimals(r, dt, now);

    for (const p of particles) { p.x += p.vx * dt; p.y += p.vy * dt; p.vy += 140 * dt; p.life -= dt; }
    particles = particles.filter((p) => p.life > 0);
    for (const f of floaters) { f.y -= 14 * dt; f.life -= dt; }
    floaters = floaters.filter((f) => f.life > 0);
    if (r.weather !== "sun") {
      const snow = r.weather === "snow";
      while (drops.length < (snow ? 90 : 140)) drops.push({ x: Math.random() * 1.1, y: Math.random(), v: snow ? 0.08 + Math.random() * 0.06 : 1.2 + Math.random() * 0.5, w: Math.random() * 6 });
      for (const d of drops) { d.y += d.v * dt; d.x += snow ? Math.sin(now / 900 + d.w) * 0.0006 : -0.25 * d.v * dt; if (d.y > 1) { d.y = -0.05; d.x = Math.random() * 1.1; } }
    } else drops = [];

    draw(now);
    if (now - lastHud > 150) { lastHud = now; renderHud(); if (dirty) { dirty = false; renderSide(); } }
    if (needSave && now - lastSave > SAVE_EVERY) save();
    rafId = window.requestAnimationFrame(frame);
  }

  /* ================= Entrées ================= */

  const KEYMAP = { arrowup: "up", z: "up", w: "up", arrowdown: "down", s: "down", arrowleft: "left", q: "left", a: "left", arrowright: "right", d: "right" };
  const typing = (e) => e.target instanceof HTMLElement && (e.target.closest("input, textarea, select") || e.target.isContentEditable);

  window.addEventListener("keydown", (e) => {
    if (!active || typing(e) || e.ctrlKey || e.metaKey || e.altKey) return;
    const k = e.key.toLowerCase();
    if (modal) { if (k === "escape") { e.preventDefault(); closeModal(); } return; }
    if (KEYMAP[k]) { e.preventDefault(); keys.add(KEYMAP[k]); useMouse = false; return; }
    if (k === " " || k === "e") {
      e.preventDefault();
      if (!e.repeat && !actionHeld && !charge) { useMouse = false; pressAction(); }
      return;
    }
    if (/^[0-9]$/.test(k)) { e.preventDefault(); selectSlot(k === "0" ? 9 : Number(k) - 1); return; }
    if (k === "-" || k === ")") { selectSlot(10); return; }
    if (k === "=") { selectSlot(11); return; }
    if (k === "r") { e.preventDefault(); eat(); }
  });
  window.addEventListener("keyup", (e) => {
    const k = e.key.toLowerCase();
    if (KEYMAP[k]) keys.delete(KEYMAP[k]);
    if (k === " " || k === "e") { if (active && !typing(e)) e.preventDefault(); releaseAction(); }
  });
  window.addEventListener("blur", () => { keys.clear(); releaseAction(); });

  function tileFromEvent(e) {
    const rect = board.getBoundingClientRect();
    const sx = (e.clientX - rect.left) * (board.width / rect.width);
    const sy = (e.clientY - rect.top) * (board.height / rect.height);
    const wx = (sx + Math.round(cam.x * zoom)) / zoom, wy = (sy + Math.round(cam.y * zoom)) / zoom;
    return { x: Math.floor(wx / TILE), y: Math.floor(wy / TILE) };
  }
  board.addEventListener("pointermove", (e) => { if (e.pointerType === "mouse") { mouseTile = tileFromEvent(e); useMouse = true; } });
  board.addEventListener("pointerleave", () => { mouseTile = null; });
  board.addEventListener("pointerdown", (e) => {
    if (!active || modal || e.button > 0) return;
    e.preventDefault();
    board.focus({ preventScroll: true });
    const r = S();
    const t = tileFromEvent(e);
    if (!R.inMap(t.x, t.y)) return;
    mouseTile = t;
    if (reach(r, t.x, t.y)) {
      try { board.setPointerCapture(e.pointerId); } catch { /* sans importance */ }
      path = null;
      actTarget = t;
      pressAction();
    } else {
      path = findPath(r, t.x, t.y);
      if (!path) say("On ne peut pas aller là.", "lose");
    }
  });
  const up = () => { if (actionHeld || charge) releaseAction(); };
  board.addEventListener("pointerup", up);
  board.addEventListener("pointercancel", up);
  board.addEventListener("contextmenu", (e) => e.preventDefault());
  board.addEventListener("wheel", (e) => {
    if (!active || modal) return;
    e.preventDefault();
    const r = S();
    const n = Math.min(12, r.bag);
    selectSlot(((sel + (e.deltaY > 0 ? 1 : -1)) % n + n) % n);
  }, { passive: false });

  actionButton.addEventListener("pointerdown", (e) => { e.preventDefault(); useMouse = false; pressAction(); });
  actionButton.addEventListener("pointerup", releaseAction);
  actionButton.addEventListener("pointercancel", releaseAction);
  actionButton.addEventListener("pointerleave", () => { if (actionHeld || charge) releaseAction(); });
  actionButton.addEventListener("click", (e) => { if (e.detail === 0) { pressAction(); releaseAction(); } });

  window.addEventListener("pagehide", () => save(true));
  document.addEventListener("visibilitychange", () => { if (document.hidden) { keys.clear(); save(true); } });
  wallet.subscribe(() => { if (active && modal === "shop") { /* le solde de pièces bleues peut changer */ } });

  resize();
  renderHud();
  renderSide(true);

  return {
    activate() {
      active = true;
      resize();
      renderHud();
      renderSide(true);
      lastFrame = performance.now();
      window.cancelAnimationFrame(rafId);
      rafId = window.requestAnimationFrame(frame);
    },
    deactivate() {
      if (!active) return;
      active = false;
      window.cancelAnimationFrame(rafId);
      rafId = 0;
      keys.clear();
      charge = null;
      actionHeld = false;
      if (modal) closeModal();
      save(true);
    }
  };
}
