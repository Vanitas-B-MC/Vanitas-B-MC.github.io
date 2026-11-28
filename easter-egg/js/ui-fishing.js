// js/ui-fishing.js — interface de « Grand Bleu » (la logique est dans fishing.js).
//
// Un seul bouton (ou Espace, ou un appui sur la scène) : maintenir pour charger le lancer, relâcher au sommet ;
// attendre la touche et appuyer pour ferrer ; puis maintenir pour faire monter la barre verte et garder le poisson dedans.
// La scène (ciel, décor, eau, météo) est dessinée au canvas selon le lieu, l'heure et le temps qu'il fait.

import * as F from "./fishing.js";
import { h, fmt, fmtShort, prefersReducedMotion } from "./ui.js";

import { drawFish, createScene } from "./fishing-art.js";

function stat(label, valueEl) { return h("div", {}, h("dt", {}, label), h("dd", {}, valueEl)); }

/* ================= Interface ================= */

export function createFishingUI(root, wallet) {
  const A = () => wallet.data.angler;
  let active = false;
  let rafId = 0;
  let lastFrame = 0;
  let state = "idle";                 // idle → charging → waiting → bite → reel → result → idle
  let chargeStart = 0;
  let power = 0;
  let quality = 0;
  let bite = null;                    // { fish } ou { junk }
  let reel = null;                    // { params, s }
  let held = false;
  let biteTimer = 0, missTimer = 0;
  let castX = 380;
  let lineOut = 0;                    // animation du lancer (0 → 1)
  const scene = createScene();
  let bookLoc = "all";
  let bookSel = null;
  let lowerTab = "book";
  const iconCache = new Map();

  /* ---------- Squelette ---------- */

  const board = h("canvas", { class: "gb-canvas", "aria-label": "Scène de pêche" });
  const ctx = board.getContext("2d");
  const card = h("div", { class: "gb-card", hidden: true, role: "status", "aria-live": "polite" });
  const stage = h("div", { class: "game-stage gb-stage" }, board, card);

  const locEl = h("strong", {});
  const clockEl = h("strong", {});
  const weatherEl = h("strong", {});
  const pearlsEl = h("strong", { class: "gb-pearls" });
  const levelEl = h("strong", {});
  const xpFill = h("span", { class: "sv-bar-fill sv-xp" });
  const xpText = h("span", { class: "sv-bar-text" });
  const status = h("p", { class: "gb-status", "aria-live": "polite" }, "Maintiens le bouton pour lancer, relâche au sommet de la jauge.");
  const castButton = h("button", { class: "button button-primary gb-cast", type: "button" }, "Maintenir pour lancer");
  const waitButton = h("button", { class: "map-button", type: "button", onclick: () => skipHour() }, "⏩ Attendre 1 h");
  const fsButton = h("button", { class: "map-button", type: "button", onclick: () => toggleFullscreen() }, "⛶ Plein écran");
  fsButton.hidden = !document.fullscreenEnabled;

  const locList = h("div", { class: "gb-locs" });
  const gearBox = h("div", { class: "gb-gear" });
  const availBox = h("div", { class: "gb-avail" });
  const lowerTabs = h("div", { class: "td-maps gb-tabs" }, [["book", "Bestiaire"], ["shop", "Boutique"], ["quests", "Quêtes du capitaine"]].map(([id, label]) =>
    h("button", { class: "map-button", type: "button", "data-tab": id, onclick: () => { lowerTab = id; renderLower(); } }, label)));
  const lowerBody = h("div", { class: "gb-lower-body" });

  root.replaceChildren(
    h("p", { class: "game-rules" },
      "Un vrai jeu de pêche : 6 lieux et 54 espèces à découvrir, chacune avec ses moments de la journée et sa météo. Lance, ferre à temps, puis garde le poisson dans la barre verte jusqu'à remplir la jauge — les poissons rares se débattent comme des fous. ",
      "Les prises se vendent en perles : achète cannes, appâts, accessoires et de nouveaux lieux. Chaque nouvelle espèce rapporte des crédits à l'arcade, les paliers du bestiaire et les légendaires des pièces bleues."),
    h("div", { class: "sv-layout gb-layout" },
      h("div", { class: "sv-main" },
        h("dl", { class: "td-stats gb-topbar" }, stat("Lieu", locEl), stat("Heure", clockEl), stat("Météo", weatherEl), stat("Perles", pearlsEl), stat("Niveau", levelEl)),
        h("div", { class: "sv-board-wrap chamfer gb-wrap" }, stage),
        h("div", { class: "sv-bars" }, h("div", { class: "sv-bar", role: "img", "aria-label": "Expérience de pêcheur" }, xpFill, xpText)),
        status, castButton,
        h("div", { class: "gb-tools" }, waitButton, fsButton)),
      h("aside", { class: "sv-side gb-side" },
        h("h3", { class: "subhead" }, "Lieux"), locList,
        h("h3", { class: "subhead" }, "Équipement"), gearBox,
        h("h3", { class: "subhead" }, "Ça mord en ce moment"), availBox)),
    h("section", { class: "gb-lower" }, lowerTabs, lowerBody)
  );

  /* ---------- Outils ---------- */

  function fishIcon(f, w = 64, hgt = 40) {
    const key = `${f.id}|${w}`;
    if (iconCache.has(key)) return iconCache.get(key);
    const c = document.createElement("canvas");
    c.width = w * 2; c.height = hgt * 2;
    const g = c.getContext("2d");
    g.scale(2, 2);
    drawFish(g, f.shape, f.color, w / 2, hgt / 2 + (f.shape === "jelly" ? -4 : 0), w * 0.8);
    const url = c.toDataURL();
    iconCache.set(key, url);
    return url;
  }
  const img = (f, cls, w, hh) => h("img", { class: cls, alt: "", src: fishIcon(f, w, hh), width: String(w), height: String(hh) });

  let statusTimer = 0;
  function say(text, tone = "") { status.textContent = text; status.dataset.tone = tone; window.clearTimeout(statusTimer); }
  const save = () => wallet.saveAngler();

  const fsTarget = () => root.querySelector(".gb-wrap");
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
    const w = board.clientWidth || 640, hh = board.clientHeight || 360;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    board.width = Math.round(w * dpr);
    board.height = Math.round(hh * dpr);
  }
  if ("ResizeObserver" in window) new ResizeObserver(resize).observe(board);

  function newDayCheck(changed) {
    if (!changed) return;
    const a = A();
    say(`Jour ${a.day} : ${F.WEATHERS[a.weather].icon} ${F.WEATHERS[a.weather].name}. Le capitaine a de nouvelles demandes.`, "push");
    renderLower();
  }

  function skipHour() {
    if (state !== "idle") return;
    newDayCheck(F.advance(A(), 60));
    save();
    renderSide();
    renderHud();
  }

  /* ---------- Pêche ---------- */

  const LABELS = { idle: "Maintenir pour lancer", charging: "Relâche au sommet !", waiting: "Remonter la ligne", bite: "FERRER !", reel: "Maintiens pour monter la barre", result: "Continuer" };
  function setState(s) {
    state = s;
    castButton.textContent = LABELS[s];
    castButton.classList.toggle("is-alert", s === "bite");
    waitButton.disabled = s !== "idle";
    locList.querySelectorAll("button").forEach((b) => { b.disabled = s !== "idle" || b.dataset.locked === "1"; });
  }

  function clearTimers() { window.clearTimeout(biteTimer); window.clearTimeout(missTimer); }

  function press() {
    if (state === "idle") { state = "charging"; chargeStart = performance.now(); setState("charging"); say("Relâche quand la jauge est au maximum !"); }
    else if (state === "waiting") { clearTimers(); setState("idle"); say("Tu as remonté la ligne trop tôt.", "lose"); lineOut = 0; }
    else if (state === "bite") hook();
    else if (state === "result") dismiss();
  }
  function release() {
    if (state === "charging") cast(F.castPower(performance.now() - chargeStart));
  }

  function cast(p) {
    const a = A();
    power = p;
    quality = F.castQuality(p);
    castX = 250 + p * 320;
    lineOut = 0.001;
    setState("waiting");
    const q = ["Lancer faible…", "Bon lancer.", "Lancer parfait !"][quality];
    say(`${q} La ligne est à l'eau. Patience…`, quality === 2 ? "win" : "");
    biteTimer = window.setTimeout(onBite, F.biteDelay(a, quality));
  }

  function onBite() {
    const a = A();
    bite = F.rollBite(a, quality);
    if (bite.fish) F.useBait(a);
    setState("bite");
    const sonar = F.hasTackle(a, "sonar") && bite.fish;
    say(sonar ? `Sonar : ${bite.fish.name} (${F.RARITY[bite.fish.rarity].name.toLowerCase()}) a mordu ! FERRE !` : "Ça mord ! FERRE !", "push");
    if (navigator.vibrate) try { navigator.vibrate(60); } catch { /* sans importance */ }
    splashAt(castX, 214, 10);
    missTimer = window.setTimeout(() => {
      setState("idle");
      lineOut = 0;
      say(bite.fish ? "Trop lent… le poisson a recraché l'hameçon." : "Trop lent… c'était sûrement une vieille botte.", "lose");
      bite = null;
    }, F.hookWindow(a));
  }

  function hook() {
    clearTimers();
    const a = A();
    if (bite.junk) {
      const res = F.landJunk(a, bite.junk);
      save();
      showResult({ junk: res.junk, value: res.value });
      return;
    }
    const params = F.reelParams(a, bite.fish);
    reel = { params, s: F.newReel(params) };
    setState("reel");
    say(`${F.hasTackle(a, "sonar") ? bite.fish.name : "Un poisson"} est ferré ! Garde-le dans la barre verte.`);
  }

  function endReel(won) {
    const a = A();
    const s = reel.s;
    const fish = bite.fish;
    let treasure = null;
    if (s.treasure?.got) { treasure = F.openTreasure(a); if (treasure.blue) wallet.addBlue(treasure.blue); }
    if (!won) {
      a.stats.escaped += 1;
      save();
      reel = null;
      setState("idle");
      lineOut = 0;
      say(`${F.hasTackle(a, "sonar") ? fish.name : "Le poisson"} s'est échappé !${treasure ? ` Mais tu as gardé le coffre : ${treasure.loot.map((l) => l.text).join(", ")}.` : ""}`, "lose");
      renderSide(); renderLower();
      return;
    }
    const size = F.rollSize(fish, F.luckOf(a, quality));
    const res = F.landFish(a, fish, size, s.perfect, { balance: wallet.credits });
    if (res.credits) wallet.addCredits(res.credits);
    if (res.blue) wallet.addBlue(res.blue);
    save();
    reel = null;
    showResult({ ...res, treasure });
  }

  function showResult(res) {
    setState("result");
    lineOut = 0;
    const parts = [];
    if (res.junk) {
      parts.push(h("p", { class: "gb-card-title" }, res.junk.name), h("p", { class: "gb-card-sub" }, `Pas un poisson… +${res.value} perle${res.value > 1 ? "s" : ""}.`));
      say(`Tu as pêché : ${res.junk.name}.`, "");
    } else {
      const f = res.fish;
      const r = F.RARITY[f.rarity];
      card.style.setProperty("--rc", r.color);
      parts.push(
        res.isNew ? h("p", { class: "gb-card-new" }, "Nouvelle espèce !") : res.record ? h("p", { class: "gb-card-new" }, "Nouveau record !") : null,
        img(f, "gb-card-img", 160, 90),
        h("p", { class: "gb-card-title" }, f.name),
        h("p", { class: "gb-card-rar" }, `${r.name}${res.q ? ` · ${"★".repeat(res.q)} ${F.QUALITY[res.q]}` : ""}${res.perfect ? " · Prise parfaite" : ""}`),
        h("p", { class: "gb-card-sub" }, `${res.size.toLocaleString("fr-FR")} cm · +${fmt(res.value)} perles · +${res.xp} XP`),
        res.credits ? h("p", { class: "gb-card-sub gb-cyan" }, `+${fmtShort(res.credits)} crédits d'arcade`) : null,
        res.blue ? h("p", { class: "gb-card-sub gb-blue" }, `+${res.blue} pièce${res.blue > 1 ? "s" : ""} bleue${res.blue > 1 ? "s" : ""} !`) : null,
        ...res.milestones.map((m) => h("p", { class: "gb-card-sub gb-blue" }, `Bestiaire : ${m.n} espèces !`)),
        ...res.quests.map((q) => h("p", { class: "gb-card-sub" }, `Quête réussie : ${F.questText(q)} (+${fmt(q.reward)} perles)`)),
        res.levelUp ? h("p", { class: "gb-card-new" }, `Niveau ${res.levelUp} !`) : null);
      say(`${f.name} — ${res.size.toLocaleString("fr-FR")} cm !`, f.rarity >= 2 ? "win" : "push");
    }
    if (res.treasure) parts.push(h("p", { class: "gb-card-sub gb-gold" }, `Coffre : ${res.treasure.loot.map((l) => l.text).join(", ")}`));
    parts.push(h("button", { class: "button button-secondary", type: "button", onclick: dismiss }, "Continuer"));
    card.replaceChildren(...parts.filter(Boolean));
    card.hidden = false;
    renderSide(); renderLower(); renderHud();
  }

  function dismiss() {
    card.hidden = true;
    bite = null;
    setState("idle");
    say("Maintiens le bouton pour relancer.");
  }

  function splashAt(x, y, n) {
    if (!prefersReducedMotion()) scene.splash(x, y, n);
  }

  /* ---------- Entrées ---------- */

  castButton.addEventListener("pointerdown", (e) => { e.preventDefault(); try { castButton.setPointerCapture(e.pointerId); } catch { /* rien */ } held = true; press(); });
  const up = () => { if (!held) return; held = false; release(); };
  castButton.addEventListener("pointerup", up);
  castButton.addEventListener("pointercancel", up);
  castButton.addEventListener("click", (e) => { if (e.detail === 0) { if (state === "idle") { press(); cast(0.7); } else press(); } });
  board.addEventListener("pointerdown", (e) => { if (!active) return; e.preventDefault(); try { board.setPointerCapture(e.pointerId); } catch { /* rien */ } held = true; press(); });
  board.addEventListener("pointerup", up);
  board.addEventListener("pointercancel", up);
  board.addEventListener("contextmenu", (e) => e.preventDefault());

  // Espace sert toujours à pêcher (même si un bouton du magasin a gardé le focus) ; Entrée active les boutons.
  const typing = (e) => e.target instanceof HTMLElement && !!e.target.closest("input, textarea, select");
  window.addEventListener("keydown", (e) => {
    if (!active || e.key !== " " || typing(e)) return;
    e.preventDefault();
    if (e.repeat || held) return;
    held = true;
    press();
  });
  window.addEventListener("keyup", (e) => { if (e.key === " " && active) { e.preventDefault(); up(); } });
  window.addEventListener("blur", up);

  /* ---------- Dessin de la scène (voir fishing-art.js) ---------- */

  function drawScene(now, dt) {
    if (state === "waiting" || state === "bite" || state === "reel") {
      const before = lineOut;
      lineOut = Math.min(1, lineOut + dt * 2.2);
      if (before < 1 && lineOut >= 1) splashAt(castX, 214, 7);
    }
    if (state === "charging") power = F.castPower(performance.now() - chargeStart);
    scene.draw(ctx, board.width, board.height, A(), {
      state, castX, lineOut, power, chargeT: performance.now() - chargeStart,
      reel: reel && bite?.fish ? { s: reel.s, params: reel.params, fish: bite.fish } : null
    }, now, dt, prefersReducedMotion());
  }

  /* ---------- Boucle ---------- */

  let lastHud = 0;
  function frame(now) {
    rafId = 0;
    if (!active) return;
    const dt = Math.min(0.05, (now - lastFrame) / 1000);
    lastFrame = now;
    const a = A();
    if (state !== "reel" && state !== "result") newDayCheck(F.advance(a, dt * F.MIN_PER_REAL_SEC));
    if (state === "reel" && reel) {
      F.reelStep(reel.s, dt, held, reel.params);
      if (reel.s.status === "won") endReel(true);
      else if (reel.s.status === "lost") endReel(false);
    }
    drawScene(now, dt);
    if (now - lastHud > 250) { lastHud = now; renderHud(); if (state === "idle") renderAvail(); }
    rafId = window.requestAnimationFrame(frame);
  }

  /* ---------- Panneaux ---------- */

  function renderHud() {
    const a = A();
    const loc = F.locById(a.loc);
    locEl.textContent = loc.name;
    const p = F.period(a.time);
    clockEl.textContent = `${F.clockText(a.time)} · ${F.TIMES[p].name}`;
    const w = F.currentWeather(a);
    weatherEl.textContent = `${F.WEATHERS[w].icon} ${F.WEATHERS[w].name}${a.totem ? " (totem)" : ""}`;
    pearlsEl.textContent = fmtShort(a.pearls);
    pearlsEl.title = `${fmt(a.pearls)} perles`;
    const lvl = F.level(a);
    levelEl.textContent = String(lvl);
    const lo = lvl ? F.XP_LEVELS[lvl - 1] : 0, hi = F.XP_LEVELS[lvl] ?? lo;
    xpFill.style.width = `${lvl >= 10 ? 100 : ((a.xp - lo) / (hi - lo)) * 100}%`;
    xpText.textContent = lvl >= 10 ? "Pêcheur légendaire (niveau max)" : `Niveau ${lvl} — ${fmt(a.xp)} / ${fmt(hi)} XP`;
  }

  let availKey = "";
  function renderAvail() {
    const a = A();
    const bait = F.baitById(a.baitOn);
    const magic = !!(bait?.magic && a.bait[bait.id]);
    const list = F.available(a.loc, a.time, F.currentWeather(a), magic);
    const key = `${a.loc}|${list.map((f) => f.id).join()}|${Object.keys(a.dex).length}`;
    if (key === availKey) return;
    availKey = key;
    availBox.replaceChildren(h("ul", { class: "gb-avail-list" }, list.map((f) => {
      const known = !!a.dex[f.id];
      return h("li", { style: `--rc:${F.RARITY[f.rarity].color}` }, known ? img(f, "gb-mini", 40, 24) : h("span", { class: "gb-mini gb-unknown" }, "?"),
        h("span", {}, known ? f.name : "???"), h("em", {}, F.RARITY[f.rarity].name));
    })), h("p", { class: "gb-note" }, magic ? "Appât magique : moment et météo ignorés." : "Change l'heure ou attends une autre météo pour d'autres espèces."));
  }

  function renderSide() {
    const a = A();
    locList.replaceChildren(...F.LOCATIONS.map((l) => {
      const open = a.unlocked.includes(l.id);
      const total = F.FISH.filter((f) => f.loc === l.id).length;
      const got = F.FISH.filter((f) => f.loc === l.id && a.dex[f.id]).length;
      const b = h("button", { class: `map-button gb-loc${a.loc === l.id ? " is-active" : ""}${open ? "" : " is-locked"}`, type: "button", "data-locked": open ? "0" : "1",
        title: l.desc, onclick: () => { if (!open || state !== "idle") return; a.loc = l.id; availKey = ""; save(); renderSide(); renderHud(); renderAvail(); } },
        h("strong", {}, l.name), h("span", {}, open ? `${got} / ${total} espèces` : `Boutique · ${fmt(l.price)} perles${l.lvl ? ` · niv. ${l.lvl}` : ""}`));
      b.disabled = !open || state !== "idle";
      return b;
    }));

    const rod = F.rodById(a.rod);
    const rodSel = h("select", { class: "gb-select", "aria-label": "Canne" }, a.rods.map((id) => h("option", { value: id, selected: id === a.rod }, F.rodById(id).name)));
    rodSel.addEventListener("change", () => { F.equipRod(a, rodSel.value); save(); renderSide(); });
    const baitSel = h("select", { class: "gb-select", "aria-label": "Appât" },
      h("option", { value: "", selected: !a.baitOn }, "Sans appât"),
      F.BAITS.filter((b) => a.bait[b.id]).map((b) => h("option", { value: b.id, selected: a.baitOn === b.id }, `${b.name} (${a.bait[b.id]})`)));
    baitSel.addEventListener("change", () => { a.baitOn = baitSel.value || null; availKey = ""; save(); renderSide(); renderAvail(); });
    const tackles = F.TACKLE.filter((t) => a.tackle[t.id]);
    gearBox.replaceChildren(
      h("label", { class: "gb-field" }, h("span", {}, "Canne"), rodSel),
      h("p", { class: "gb-note" }, `Barre ${Math.round(F.barSize(a) * 100)} % · ${rod.slots} accessoire${rod.slots > 1 ? "s" : ""} · chance +${Math.round(F.luckOf(a) * 100)} %`),
      h("label", { class: "gb-field" }, h("span", {}, "Appât"), baitSel),
      h("p", { class: "gb-field-title" }, `Accessoires (${a.tackleOn.length} / ${rod.slots})`),
      tackles.length ? h("div", { class: "gb-tackles" }, tackles.map((t) => h("button", { class: `map-button${a.tackleOn.includes(t.id) ? " is-active" : ""}`, type: "button", title: t.desc,
        disabled: !a.tackleOn.includes(t.id) && a.tackleOn.length >= rod.slots,
        onclick: () => { F.toggleTackle(a, t.id); save(); renderSide(); } }, `${t.name} · ${a.tackle[t.id]}`))) : h("p", { class: "gb-note" }, rod.slots ? "Aucun accessoire : achète-en à la boutique." : "La canne en bambou n'accepte pas d'accessoire."));
    locList.querySelectorAll("button").forEach((b) => { b.disabled = state !== "idle" || b.dataset.locked === "1"; });
  }

  function renderLower() {
    const a = A();
    lowerTabs.querySelectorAll("button").forEach((b) => b.classList.toggle("is-active", b.dataset.tab === lowerTab));
    const out = [];
    if (lowerTab === "book") {
      const species = Object.keys(a.dex).length;
      const next = F.MILESTONES.find((m) => !a.milestones.includes(m.n));
      out.push(h("p", { class: "gb-note gb-book-head" }, `${species} / ${F.FISH.length} espèces · ${fmt(a.stats.caught)} prises · ${fmt(a.stats.perfect)} parfaites · ${fmt(a.stats.treasure)} coffres · ${fmt(a.junk)} déchets${next ? ` · prochain palier : ${next.n} espèces (+${next.blue} pièce${next.blue > 1 ? "s" : ""} bleue${next.blue > 1 ? "s" : ""})` : " · bestiaire complet !"}`));
      out.push(h("div", { class: "td-maps" }, [["all", "Tous"], ...F.LOCATIONS.map((l) => [l.id, l.name])].map(([id, label]) =>
        h("button", { class: `map-button${bookLoc === id ? " is-active" : ""}`, type: "button", onclick: () => { bookLoc = id; renderLower(); } }, label))));
      const sel = bookSel && F.fishById(bookSel);
      if (sel) out.push(detail(a, sel));
      const grid = h("div", { class: "gb-book" });
      for (const f of F.FISH.filter((x) => bookLoc === "all" || x.loc === bookLoc)) {
        const d = a.dex[f.id];
        grid.append(h("button", { class: `gb-entry${d ? "" : " is-unknown"}${bookSel === f.id ? " is-sel" : ""}`, type: "button", style: `--rc:${F.RARITY[f.rarity].color}`,
          onclick: () => { bookSel = bookSel === f.id ? null : f.id; renderLower(); } },
          img(f, "gb-entry-img", 64, 40), h("strong", {}, d ? f.name : "???"), h("span", {}, d ? `×${fmt(d.n)} · ${d.best.toLocaleString("fr-FR")} cm` : F.RARITY[f.rarity].name)));
      }
      out.push(grid);
    }
    else if (lowerTab === "shop") {
      const lvl = F.level(a);
      const row = (name, desc, price, disabled, onclick, extra = "") => h("li", {}, h("div", { class: "rv-shop-text" }, h("strong", {}, name), h("span", {}, desc)),
        h("em", {}, `${price}${extra}`), h("button", { class: "button button-secondary rv-mini", type: "button", disabled, onclick }, "Acheter"));
      const act = (fn) => () => { const res = fn(); say(res.msg ?? "", res.ok ? "win" : "lose"); save(); renderLower(); renderSide(); renderHud(); availKey = ""; renderAvail(); };
      out.push(h("p", { class: "gb-note" }, `Tu as ${fmt(a.pearls)} perles · ${fmt(wallet.blue)} pièces bleues · niveau ${lvl}.`));
      out.push(h("h3", { class: "subhead" }, "Cannes"), h("ul", { class: "rv-list rv-shop" }, F.RODS.filter((r) => r.price).map((r) =>
        row(r.name, `Barre +${Math.round(r.bar * 100)} pts · ${r.slots} accessoire${r.slots > 1 ? "s" : ""} · touche ${Math.round((1 - r.bite) * 100)} % plus rapide${r.lvl ? ` · niveau ${r.lvl}` : ""}`,
          a.rods.includes(r.id) ? "Possédée" : `${fmt(r.price)} perles`, a.rods.includes(r.id) || lvl < r.lvl,
          act(() => F.buyRod(a, r.id, { blueBalance: wallet.blue, spendBlue: (n) => wallet.spendBlue(n) })), r.blue && !a.rods.includes(r.id) ? ` + ${r.blue} ◆` : ""))));
      out.push(h("h3", { class: "subhead" }, "Appâts"), h("ul", { class: "rv-list rv-shop" }, F.BAITS.map((b) =>
        row(`${b.name} ×${b.n}`, `${b.desc}${b.lvl ? ` · niveau ${b.lvl}` : ""} · tu en as ${a.bait[b.id] ?? 0}`, `${fmt(b.price)} perles`, lvl < b.lvl, act(() => F.buyBait(a, b.id))))));
      out.push(h("h3", { class: "subhead" }, "Accessoires"), h("ul", { class: "rv-list rv-shop" }, F.TACKLE.map((t) =>
        row(t.name, `${t.desc} ${t.uses} prises${t.lvl ? ` · niveau ${t.lvl}` : ""}`, `${fmt(t.price)} perles`, lvl < t.lvl, act(() => F.buyTackle(a, t.id))))));
      out.push(h("h3", { class: "subhead" }, "Lieux"), h("ul", { class: "rv-list rv-shop" }, F.LOCATIONS.filter((l) => l.price).map((l) =>
        row(l.name, `${l.desc}${l.lvl ? ` · niveau ${l.lvl}` : ""}`, a.unlocked.includes(l.id) ? "Débloqué" : `${fmt(l.price)} perles`, a.unlocked.includes(l.id) || lvl < l.lvl, act(() => F.unlockLoc(a, l.id))))));
      out.push(h("h3", { class: "subhead" }, "Divers"), h("ul", { class: "rv-list rv-shop" },
        row("Totem de pluie", F.RAIN_TOTEM.desc, `${F.RAIN_TOTEM.price} perles`, false, act(() => F.buyTotem(a)))));
    }
    else if (lowerTab === "quests") {
      out.push(h("p", { class: "gb-note" }, "Le capitaine du port affiche 3 demandes chaque jour (à 6 h). Elles se valident toutes seules à la prise, et rapportent perles et crédits d'arcade."));
      const list = h("ul", { class: "rv-list" });
      for (const q of a.quests) list.append(h("li", { class: q.done ? "is-done" : "" }, h("span", { class: "rv-ach-mark" }, q.done ? "✔" : "○"),
        h("div", { class: "rv-shop-text" }, h("strong", {}, F.questText(q)), h("span", {}, `${q.p} / ${q.n}`)), h("em", {}, `${fmt(q.reward)} perles`)));
      out.push(list);
    }
    lowerBody.replaceChildren(...out);
  }

  function detail(a, f) {
    const d = a.dex[f.id];
    const r = F.RARITY[f.rarity];
    const when = f.times.length ? f.times.map((t) => F.TIMES[t].name).join(", ") : "À toute heure";
    const weather = f.weather.length ? f.weather.map((w) => F.WEATHERS[w].name).join(", ") : "Par tous les temps";
    return h("div", { class: "gb-detail", style: `--rc:${r.color}` },
      d ? img(f, "gb-detail-img", 160, 90) : h("div", { class: "gb-detail-img gb-unknown" }, "?"),
      h("div", {},
        h("p", { class: "gb-detail-name" }, d ? f.name : "Espèce inconnue"),
        h("p", { class: "gb-detail-rar" }, `${r.name} · ${F.locById(f.loc).name}`),
        h("p", { class: "gb-detail-desc" }, d ? f.desc : "Attrape-la pour en savoir plus."),
        h("dl", { class: "td-stats gb-detail-stats" },
          stat("Moment", h("strong", {}, d ? when : "???")), stat("Météo", h("strong", {}, d ? weather : "???")),
          stat("Taille", h("strong", {}, d ? `${f.min}–${f.max} cm` : "???")), stat("Record", h("strong", {}, d ? `${d.best.toLocaleString("fr-FR")} cm` : "—")),
          stat("Comportement", h("strong", {}, d ? `${F.BEHAVIORS[f.behavior].name} (${f.diff})` : "???")), stat("Prix", h("strong", {}, d ? `${fmt(f.price)} perles` : "???")),
          stat("Prises", h("strong", {}, d ? fmt(d.n) : "0")), stat("Meilleure qualité", h("strong", {}, d?.q ? F.QUALITY[d.q] : "—")))));
  }

  wallet.subscribe(() => { if (active && lowerTab === "shop") { /* le solde de pièces bleues est relu au prochain affichage */ } });
  window.addEventListener("pagehide", () => save());

  resize();
  setState("idle");

  return {
    activate() {
      active = true;
      const a = A();
      if (!a.quests.length) a.quests = F.makeQuests(a);
      resize();
      renderHud(); renderSide(); renderLower(); availKey = ""; renderAvail();
      lastFrame = performance.now();
      window.cancelAnimationFrame(rafId);
      rafId = window.requestAnimationFrame(frame);
    },
    deactivate() {
      if (!active) return;
      active = false;
      window.cancelAnimationFrame(rafId);
      rafId = 0;
      clearTimers();
      held = false;
      if (state === "reel" || state === "bite" || state === "waiting" || state === "charging") { reel = null; bite = null; lineOut = 0; setState("idle"); }
      if (state === "result") dismiss();
      save();
    }
  };
}
