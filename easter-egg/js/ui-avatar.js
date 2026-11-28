// js/ui-avatar.js — onglet « Personnage » : avatar personnalisable avec les monnaies de l'arcade.
// Cliquer un objet possédé l'équipe tout de suite ; cliquer un objet à acheter le montre en aperçu,
// avec un bouton pour l'acheter. Les objets « exploit » se débloquent en jouant aux autres jeux.

import {
  CATS, ITEMS, itemsOf, CURRENCIES, CURRENCY_IDS, balanceOf, COLOR_SLOTS, PALETTES, paletteOf, paletteOwned,
  itemStatus, canUse, reqInfo, wearable, randomLook, collection, cleanName, freshAvatar
} from "./avatar.js";
import { drawAvatar, drawMini, AV_W, AV_H, CROPS } from "./avatar-art.js";
import { h, fmt, fmtShort, prefersReducedMotion } from "./ui.js";

const price = (cur, n) => `${fmtShort(n)} ${CURRENCIES[cur].short}`;

export function createAvatarUI(root, wallet) {
  const av = () => wallet.data.avatar || (wallet.data.avatar = freshAvatar());
  let active = false;
  let cat = "hairFront";
  let preview = null;            // { kind: "item", id } | { kind: "color", slot, color } : essai d'un élément pas encore acheté
  let rafId = 0;
  let toastTimer = 0;

  /* ---------- Squelette ---------- */

  const canvas = h("canvas", { class: "av-canvas", width: AV_W * 2, height: AV_H * 2, role: "img", "aria-label": "Ton avatar" });
  const nameInput = h("input", { class: "bet-input av-name", type: "text", maxlength: "16", "aria-label": "Pseudo", spellcheck: "false" });
  const previewBar = h("div", { class: "av-previewbar", hidden: true });
  const toast = h("p", { class: "av-toast", role: "status", "aria-live": "polite" });
  const balances = h("ul", { class: "av-balances" });
  const collectionEl = h("p", { class: "av-collection" });
  const outfitRow = h("div", { class: "av-outfits" });
  const tabs = h("div", { class: "av-tabs", role: "tablist", "aria-label": "Catégories" });
  const listTitle = h("h3", { class: "subhead" });
  const grid = h("div", { class: "av-grid" });

  root.replaceChildren(
    h("p", { class: "game-rules" },
      "Crée ton personnage. Les éléments se paient avec toutes les monnaies de l'arcade (crédits, pièces bleues, trophées, âmes, or, perles, noyaux), et certains se débloquent en réalisant des exploits dans les jeux. Clique un élément pour l'essayer avant de l'acheter."),
    h("div", { class: "av-layout" },
      h("div", { class: "av-left" },
        h("div", { class: "av-frame chamfer" }, canvas),
        previewBar,
        toast,
        h("label", { class: "av-name-row" }, h("span", {}, "Pseudo"), nameInput),
        h("div", { class: "av-actions" },
          h("button", { class: "button button-secondary", type: "button", onclick: () => onRandom() }, "🎲 Aléatoire"),
          h("button", { class: "button button-secondary", type: "button", onclick: () => onDownload() }, "⤓ Image PNG")),
        h("h3", { class: "subhead" }, "Tenues enregistrées"),
        outfitRow,
        collectionEl,
        h("h3", { class: "subhead" }, "Tes monnaies"),
        balances),
      h("div", { class: "av-right" }, tabs, listTitle, grid)));

  /* ---------- Look affiché (tenue + aperçu éventuel) ---------- */

  const current = () => wearable(av(), wallet.data, av().look);
  function shownLook() {
    const look = { ...current() };
    if (preview?.kind === "item") { const it = ITEMS[preview.id]; look[it.cat] = it.key; }
    if (preview?.kind === "color") look[preview.slot] = preview.color;
    return look;
  }
  const titleText = (look) => (look.title && look.title !== "none" ? ITEMS[`title:${look.title}`]?.name : "");

  function drawPreview(t) {
    const ctx = canvas.getContext("2d");
    ctx.setTransform(2, 0, 0, 2, 0, 0);
    const look = shownLook();
    drawAvatar(ctx, look, { t, name: av().name, title: titleText(look) });
  }

  // Animation limitée à ~30 images/s : le dessin (ombres douces) est assez lourd
  let lastFrame = 0;
  function loop(time) {
    rafId = requestAnimationFrame(loop);
    if (time - lastFrame < 32) return;
    lastFrame = time;
    drawPreview(prefersReducedMotion() ? 0.5 : time / 1000);
  }
  function startLoop() { cancelAnimationFrame(rafId); rafId = requestAnimationFrame(loop); }
  function stopLoop() { cancelAnimationFrame(rafId); rafId = 0; }

  function say(text, bad = false) {
    toast.textContent = text;
    toast.classList.toggle("is-bad", bad);
    window.clearTimeout(toastTimer);
    toastTimer = window.setTimeout(() => { toast.textContent = ""; }, 2600);
  }

  /* ---------- Onglets ---------- */

  const TABS = [...CATS, { id: "colors", name: "Couleurs", icon: "◑" }];
  const tabButtons = TABS.map((c) => h("button", {
    class: "av-tab", type: "button", role: "tab", "data-cat": c.id, onclick: () => { cat = c.id; preview = null; render(); }
  }, h("span", { "aria-hidden": "true" }, c.icon), ` ${c.name}`));
  tabs.replaceChildren(...tabButtons);

  /* ---------- Vignettes ---------- */

  // Cadrage des vignettes : zoom sur le visage, le corps entier ou les jambes selon la catégorie
  const HEAD_CATS = new Set(["skin", "face", "eyes", "brows", "mouth", "beard", "marks", "cyber", "hairFront", "neck", "hat", "glasses", "ears"]);
  const LEG_CATS = new Set(["bottom", "shoes"]);
  const cropOf = (c) => (HEAD_CATS.has(c) ? CROPS.head : c === "hairBack" ? CROPS.bust : LEG_CATS.has(c) ? CROPS.legs : CROPS.full);

  // Petite image de l'avatar portant l'élément (rendue une seule fois par affichage de catégorie)
  function thumb(look) {
    const c = h("canvas", { class: "av-thumb", width: 240, height: 300, "aria-hidden": "true" });
    const ctx = c.getContext("2d");
    const [x, y, w, hh] = cropOf(cat);
    ctx.setTransform(240 / w, 0, 0, 300 / hh, (-x * 240) / w, (-y * 300) / hh);
    drawAvatar(ctx, look, { t: 0.5, banner: false });
    return c;
  }

  function costLine(it, status) {
    const d = wallet.data;
    if (status === "owned") return h("em", { class: "av-owned" }, "Possédé");
    if (status === "earned") return h("em", { class: "av-earned" }, "Exploit réussi ✔");
    if (status === "locked") return h("em", { class: "av-locked" }, `🔒 ${reqInfo(it.req).text}`);
    const ok = balanceOf(d, it.cur) >= it.price;
    return h("em", { class: ok ? "av-price" : "av-price is-poor", style: `--cc:${CURRENCIES[it.cur].color}` }, price(it.cur, it.price));
  }

  function renderItems() {
    const look = current();
    const list = itemsOf(cat);
    listTitle.textContent = `${CATS.find((c) => c.id === cat).name} (${list.filter((it) => canUse(av(), wallet.data, it)).length} / ${list.length})`;
    const base = { ...look };
    if ((cat === "hairFront" || cat === "hairBack") && base.hat !== "none") base.hat = "none";          // on voit mieux la coiffure
    if (cat === "hairBack" && base.back !== "none") base.back = "none";
    grid.replaceChildren(...list.map((it) => {
      const status = itemStatus(av(), wallet.data, it);
      const worn = look[cat] === it.key;
      const tried = preview?.kind === "item" && preview.id === it.id;
      return h("button", {
        class: `av-item${worn ? " is-worn" : ""}${tried ? " is-tried" : ""} is-${status}`, type: "button", "data-item": it.id,
        title: it.req ? reqInfo(it.req).text : it.name, onclick: () => onItem(it)
      },
      thumb({ ...base, [cat]: it.key }),
      h("strong", {}, it.name),
      worn ? h("em", { class: "av-worn" }, "Porté") : costLine(it, status));
    }));
  }

  function renderColors() {
    const look = current();
    listTitle.textContent = "Couleurs";
    const blocks = COLOR_SLOTS.map((slot) => {
      const swatches = PALETTES.flatMap((p) => p.colors.map((c) => {
        const owned = p.price === 0 || av().palettes.includes(p.id);
        const on = look[slot.id] === c;
        const tried = preview?.kind === "color" && preview.slot === slot.id && preview.color === c;
        const style = c === "holo" ? "background:linear-gradient(90deg,#ff2a6d,#fcee0a,#3dff8f,#00f0ff,#b06bff)"
          : c === "chrome" ? "background:linear-gradient(135deg,#f8f8ff,#8a8f9e,#e8ecf4,#4a4f5e)"
            : c === "void" ? "background:linear-gradient(135deg,#05000a,#3a0a5a,#05000a)" : `background:${c}`;
        return h("button", {
          class: `av-swatch${on ? " is-on" : ""}${tried ? " is-tried" : ""}${owned ? "" : " is-locked"}`, type: "button", style,
          title: `${p.name}${owned ? "" : ` (palette à débloquer : ${price(p.cur, p.price)})`}`, "aria-label": `${c} — palette ${p.name}`,
          onclick: () => onColor(slot.id, c)
        });
      }));
      return h("div", { class: "av-colorblock" }, h("p", { class: "av-colorname" }, slot.name), h("div", { class: "av-swatches" }, swatches));
    });
    const packs = h("div", { class: "av-packs" }, PALETTES.filter((p) => p.price > 0).map((p) => {
      const owned = av().palettes.includes(p.id);
      const ok = balanceOf(wallet.data, p.cur) >= p.price;
      return h("button", {
        class: `av-pack${owned ? " is-owned" : ""}`, type: "button", disabled: owned || !ok, "data-palette": p.id,
        onclick: () => buyPalette(p.id)
      },
      h("span", { class: "av-pack-dots" }, p.colors.map((c) => h("i", { style: c.startsWith("#") ? `background:${c}` : "background:linear-gradient(90deg,#ff2a6d,#00f0ff)" }))),
      h("strong", {}, p.name),
      h("em", { style: `--cc:${CURRENCIES[p.cur].color}`, class: owned ? "av-owned" : ok ? "av-price" : "av-price is-poor" }, owned ? "Débloquée" : price(p.cur, p.price)));
    }));
    grid.replaceChildren(h("div", { class: "av-colors" }, ...blocks, h("h3", { class: "subhead" }, "Palettes"), packs));
  }

  // Soldes : nœuds créés une fois, seul leur texte change (le Clicker sauvegarde plusieurs fois par seconde)
  const balanceEls = Object.fromEntries(CURRENCY_IDS.map((cur) => [cur, h("strong", {})]));
  balances.replaceChildren(...CURRENCY_IDS.map((cur) => h("li", { style: `--cc:${CURRENCIES[cur].color}` },
    h("span", {}, `${CURRENCIES[cur].short} ${CURRENCIES[cur].name}`), balanceEls[cur])));
  function updateBalances() {
    for (const cur of CURRENCY_IDS) {
      const v = balanceOf(wallet.data, cur);
      const txt = fmtShort(v);
      if (balanceEls[cur].textContent !== txt) { balanceEls[cur].textContent = txt; balanceEls[cur].title = fmt(v); }
    }
  }

  function renderSide() {
    const d = wallet.data;
    updateBalances();
    const col = collection(av(), d);
    collectionEl.textContent = `Collection : ${col.owned} / ${col.total} éléments (${Math.floor((col.owned / col.total) * 100)} %)`;
    outfitRow.replaceChildren(...av().outfits.map((o, i) => h("div", { class: "av-outfit" },
      h("span", {}, `Tenue ${i + 1}`),
      h("button", { class: "map-button", type: "button", onclick: () => saveOutfit(i) }, "Enregistrer"),
      h("button", { class: "map-button", type: "button", disabled: !o, onclick: () => loadOutfit(i) }, "Porter"))));
    if (document.activeElement !== nameInput) nameInput.value = av().name;
  }

  // La barre d'aperçu n'est reconstruite que si son contenu change (sinon le bouton « Acheter » serait recréé en boucle)
  let barKey = "";
  function previewKey() {
    if (!preview) return "";
    const it = preview.kind === "item" ? ITEMS[preview.id] : null;
    const p = preview.kind === "color" ? paletteOf(preview.color) : null;
    const cur = it ? it.cur : p.cur;
    const need = it ? it.price : p.price;
    return `${JSON.stringify(preview)}|${it ? itemStatus(av(), wallet.data, it) : ""}|${cur ? balanceOf(wallet.data, cur) >= need : ""}|${cur ? fmtShort(Math.max(0, need - balanceOf(wallet.data, cur))) : ""}`;
  }
  function renderPreviewBar(force = true) {
    const key = previewKey();
    if (!force && key === barKey) return;
    barKey = key;
    if (!preview) { previewBar.hidden = true; return; }
    previewBar.hidden = false;
    let label;
    let buy = null;
    if (preview.kind === "item") {
      const it = ITEMS[preview.id];
      const status = itemStatus(av(), wallet.data, it);
      label = `Aperçu : ${it.name}`;
      if (status === "buy") {
        const ok = balanceOf(wallet.data, it.cur) >= it.price;
        buy = h("button", { class: "button button-primary", type: "button", disabled: !ok, onclick: () => buyItem(it.id) }, `Acheter · ${price(it.cur, it.price)}`);
        if (!ok) label += ` — il te manque ${price(it.cur, it.price - balanceOf(wallet.data, it.cur))}`;
      } else if (status === "locked") label += ` — ${reqInfo(it.req).text}`;
    } else {
      const p = paletteOf(preview.color);
      label = `Aperçu : couleur de la palette ${p.name}`;
      const ok = balanceOf(wallet.data, p.cur) >= p.price;
      buy = h("button", { class: "button button-primary", type: "button", disabled: !ok, onclick: () => buyPalette(p.id, true) }, `Débloquer la palette · ${price(p.cur, p.price)}`);
    }
    previewBar.replaceChildren(h("span", {}, label), buy, h("button", { class: "button button-secondary", type: "button", onclick: () => { preview = null; render(); } }, "Annuler"));
  }

  function render() {
    for (const b of tabButtons) {
      const on = b.dataset.cat === cat;
      b.classList.toggle("is-active", on);
      b.setAttribute("aria-selected", String(on));
    }
    if (cat === "colors") renderColors(); else renderItems();
    renderSide();
    renderPreviewBar();
    drawPreview(0.5);
  }

  /* ---------- Actions ---------- */

  function equip(catId, key) {
    av().look = { ...current(), [catId]: key };
    wallet.saveAvatar();
  }

  function onItem(it) {
    if (canUse(av(), wallet.data, it)) {
      preview = null;
      equip(it.cat, it.key);
      say(`${it.name} équipé`);
    } else {
      preview = preview?.id === it.id ? null : { kind: "item", id: it.id };
    }
    render();
  }

  function onColor(slot, color) {
    if (paletteOwned(av(), color)) {
      preview = null;
      av().look = { ...current(), [slot]: color };
      wallet.saveAvatar();
    } else preview = { kind: "color", slot, color };
    render();
  }

  function buyItem(id) {
    const it = ITEMS[id];
    if (!it || itemStatus(av(), wallet.data, it) !== "buy") return;
    if (!wallet.spendCurrency(it.cur, it.price)) { say("Solde insuffisant", true); return; }
    av().owned.push(it.id);
    preview = null;
    equip(it.cat, it.key);
    say(`${it.name} acheté et équipé !`);
    render();
  }

  function buyPalette(pid, applyPreview = false) {
    const p = PALETTES.find((x) => x.id === pid);
    if (!p || av().palettes.includes(pid)) return;
    if (!wallet.spendCurrency(p.cur, p.price)) { say("Solde insuffisant", true); return; }
    av().palettes.push(pid);
    if (applyPreview && preview?.kind === "color") av().look = { ...current(), [preview.slot]: preview.color };
    preview = null;
    wallet.saveAvatar();
    say(`Palette ${p.name} débloquée !`);
    render();
  }

  function onRandom() {
    preview = null;
    av().look = randomLook(av(), wallet.data);
    wallet.saveAvatar();
    render();
  }

  function saveOutfit(i) {
    av().outfits[i] = { ...current() };
    wallet.saveAvatar();
    say(`Tenue ${i + 1} enregistrée`);
    renderSide();
  }
  function loadOutfit(i) {
    const o = av().outfits[i];
    if (!o) return;
    preview = null;
    av().look = wearable(av(), wallet.data, o);
    wallet.saveAvatar();
    say(`Tenue ${i + 1} portée`);
    render();
  }

  function onDownload() {
    const out = document.createElement("canvas");
    out.width = AV_W * 3;
    out.height = AV_H * 3;
    const ctx = out.getContext("2d");
    ctx.setTransform(3, 0, 0, 3, 0, 0);
    const look = current();
    drawAvatar(ctx, look, { t: 0.5, name: av().name, title: titleText(look) });
    const a = document.createElement("a");
    a.href = out.toDataURL("image/png");
    a.download = `avatar-${(av().name || "choom").replace(/[^\w-]+/g, "_")}.png`;
    a.click();
  }

  nameInput.addEventListener("input", () => {
    const n = cleanName(nameInput.value);
    if (!n) return;
    av().name = n;
    wallet.saveAvatar();
  });
  nameInput.addEventListener("blur", () => { nameInput.value = av().name; });

  // Sauvegarde modifiée ailleurs (autre jeu qui rapporte des monnaies, autre onglet) : prix et soldes à jour
  wallet.subscribe(() => { if (active) { updateBalances(); renderPreviewBar(false); } });

  render();

  return {
    activate() {
      active = true;
      render();
      startLoop();
    },
    deactivate() {
      active = false;
      preview = null;
      stopLoop();
    }
  };
}

// Petit portrait (portefeuille, hub) : redessiné seulement quand le look ou le pseudo changent.
export function createMiniAvatars(wallet, canvases, onText) {
  let sig = "";
  function update() {
    const a = wallet.data.avatar || freshAvatar();
    const look = wearable(a, wallet.data, a.look);
    const s = JSON.stringify(look) + a.name + a.owned.length + a.palettes.length;
    if (s === sig) return;
    sig = s;
    for (const c of canvases) if (c) drawMini(c, look);
    onText?.(a.name, look.title !== "none" ? ITEMS[`title:${look.title}`]?.name || "" : "", collection(a, wallet.data));
  }
  wallet.subscribe(update);
  update();
  return update;
}
