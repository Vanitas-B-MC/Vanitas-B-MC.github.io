// js/veille.js — page « Veille » : lit content/veille.json (rempli automatiquement
// par GitHub Actions) et affiche les articles avec filtres et recherche.

const ITEMS_URL = "content/veille.json";
const SOURCES_URL = "content/veille-sources.json";
const PAGE_SIZE = 12;
const FRESH_HOURS = 24;

const $ = (selector, root = document) => root.querySelector(selector);
const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

const state = {
  items: [],
  sources: [],
  category: "all",
  source: "all",
  query: "",
  shown: PAGE_SIZE
};

/* ---------- Utilitaires ---------- */

// Crée un élément DOM (le texte est toujours inséré comme texte : pas d'injection HTML)
function h(tag, props = {}, ...children) {
  const node = document.createElement(tag);
  for (const [key, value] of Object.entries(props)) {
    if (value === undefined || value === null || value === false) continue;
    if (key === "class") node.className = value;
    else node.setAttribute(key, value);
  }
  for (const child of children.flat()) {
    if (child === undefined || child === null || child === false) continue;
    node.append(child instanceof Node ? child : document.createTextNode(child));
  }
  return node;
}

const normalize = (text) =>
  String(text || "").toLowerCase().normalize("NFD").replace(/\p{M}/gu, "");

// "Cybersécurité" → "cybersecurite" (sert aux couleurs par catégorie dans le CSS)
const slug = (text) => normalize(text).replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");

const pad = (n) => String(n).padStart(2, "0");

function safeLink(url) {
  try {
    const parsed = new URL(url);
    return ["http:", "https:"].includes(parsed.protocol) ? parsed.href : null;
  } catch {
    return null;
  }
}

const dateFormat = new Intl.DateTimeFormat("fr-FR", { day: "numeric", month: "short", year: "numeric" });
const relativeFormat = new Intl.RelativeTimeFormat("fr", { numeric: "auto" });

function formatDate(iso) {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  const hours = (Date.now() - date.getTime()) / 36e5;
  if (hours >= 0 && hours < 1) return "à l'instant";
  if (hours >= 0 && hours < 24) return relativeFormat.format(-Math.round(hours), "hour");
  if (hours >= 24 && hours < 48) return "hier";
  return dateFormat.format(date);
}

function formatSync(iso) {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "—";
  const hours = (Date.now() - date.getTime()) / 36e5;
  if (hours < 1) return "à l'instant";
  if (hours < 48) return relativeFormat.format(-Math.round(hours), "hour");
  return dateFormat.format(date);
}

const isFresh = (iso) => {
  const age = (Date.now() - new Date(iso).getTime()) / 36e5;
  return age >= 0 && age < FRESH_HOURS;
};

/* ---------- Chargement ---------- */

async function loadJson(url) {
  const response = await fetch(url, { cache: "no-cache" });
  if (!response.ok) throw new Error(`${url} : HTTP ${response.status}`);
  return response.json();
}

/* ---------- Rendu ---------- */

function emptyState(title, text) {
  return h("li", { class: "empty" }, h("h3", {}, title), h("p", {}, text));
}

function shardCard(item, index) {
  const link = safeLink(item.link);
  const title = link
    ? h("a", { href: link, target: "_blank", rel: "noopener noreferrer" }, item.title)
    : item.title;

  return h("li", { class: "shard", "data-cat": slug(item.category) },
    h("article", { class: "shard-card chamfer" },
      h("div", { class: "shard-top" },
        h("span", { class: "shard-id" },
          `// ${pad(index + 1)}`,
          item.published && isFresh(item.published) && h("span", { class: "shard-new" }, "Nouveau")
        ),
        h("span", { class: "shard-cat" }, item.category || "Actualités")
      ),
      h("h3", {}, title),
      item.summary && h("p", { class: "shard-summary" }, item.summary),
      h("div", { class: "shard-meta" },
        h("span", { class: "shard-source" },
          h("b", {}, item.source),
          item.lang && h("span", { class: "lang", title: item.lang === "fr" ? "Français" : "Anglais" }, item.lang)
        ),
        item.published && h("time", { datetime: item.published }, formatDate(item.published))
      ),
      link && h("a", { class: "shard-link", href: link, target: "_blank", rel: "noopener noreferrer" },
        "Lire l'article", h("span", { "aria-hidden": "true" }, "↗"))
    )
  );
}

function filteredItems() {
  const words = normalize(state.query).split(/\s+/).filter(Boolean);
  return state.items.filter((item) => {
    if (state.category !== "all" && item.category !== state.category) return false;
    if (state.source !== "all" && item.source !== state.source) return false;
    if (!words.length) return true;
    const haystack = normalize(`${item.title} ${item.summary} ${item.source} ${item.category}`);
    return words.every((word) => haystack.includes(word));
  });
}

function renderList() {
  const list = $("#quests");
  const count = $("#result-count");
  const more = $("#more-button");
  const filtered = filteredItems();

  if (!state.items.length) {
    list.replaceChildren(emptyState(
      "Flux vide pour le moment",
      "La première synchronisation automatique n'a pas encore eu lieu. Elle se lance toutes les 3 heures, ou à la main depuis l'onglet « Actions » du dépôt GitHub."
    ));
    count.textContent = "";
    more.hidden = true;
    return;
  }

  if (!filtered.length) {
    list.replaceChildren(emptyState("Aucun article trouvé", "Essaie un autre mot-clé ou une autre catégorie."));
    count.textContent = "0 article affiché";
    more.hidden = true;
    return;
  }

  const visible = filtered.slice(0, state.shown);
  list.replaceChildren(...visible.map(shardCard));
  count.textContent = `${visible.length} article${visible.length > 1 ? "s" : ""} affiché${visible.length > 1 ? "s" : ""} sur ${filtered.length}`;
  more.hidden = visible.length >= filtered.length;
}

function resetAndRender() {
  state.shown = PAGE_SIZE;
  renderList();
}

function renderChips() {
  const counts = new Map();
  state.items.forEach((item) => counts.set(item.category, (counts.get(item.category) || 0) + 1));

  const categories = [...new Set([
    ...state.sources.map((s) => s.category),
    ...counts.keys()
  ])].filter(Boolean);

  const make = (value, label, total) =>
    h("button", {
      class: "chip", type: "button", "data-value": value,
      "aria-pressed": String(state.category === value)
    }, label, total !== undefined && h("small", {}, String(total)));

  const box = $("#category-chips");
  box.replaceChildren(
    make("all", "Toutes", state.items.length),
    ...categories.map((category) => make(category, category, counts.get(category) || 0))
  );

  box.addEventListener("click", (event) => {
    const button = event.target.closest(".chip");
    if (!button) return;
    state.category = button.dataset.value;
    box.querySelectorAll(".chip").forEach((chip) =>
      chip.setAttribute("aria-pressed", String(chip === button)));
    resetAndRender();
  });
}

function renderSources() {
  const select = $("#source-select");
  const names = [...new Set([...state.sources.map((s) => s.name), ...state.items.map((i) => i.source)])];
  names.forEach((name) => select.append(h("option", { value: name }, name)));

  const counts = new Map();
  state.items.forEach((item) => counts.set(item.source, (counts.get(item.source) || 0) + 1));

  $("#source-list").replaceChildren(
    ...state.sources.map((source) => {
      const site = safeLink(source.site || source.url);
      const total = counts.get(source.name) || 0;
      const label = `${source.category} · ${source.lang === "fr" ? "FR" : "EN"}${total ? ` · ${total} art.` : ""}`;
      return h("li", {},
        h("a", {
          class: "source-token", "data-cat": slug(source.category),
          href: site || "#", target: "_blank", rel: "noopener noreferrer"
        }, h("strong", {}, source.name), h("span", {}, label))
      );
    })
  );
}

function renderStats(updated) {
  $("#stat-sources").textContent = String(state.sources.length);
  $("#stat-items").textContent = String(state.items.length);
  $("#stat-sync").textContent = updated ? formatSync(updated) : "en attente";

  $("#status").textContent = updated
    ? `// ${state.items.length} articles · ${state.sources.length} sources`
    : "// en attente de la première synchro";
}

/* ---------- Effet : pluie de données (canvas) ---------- */

function setupRain() {
  const canvas = $("#rain");
  if (!canvas || reduceMotion || !canvas.getContext) return;

  const ctx = canvas.getContext("2d");
  const glyphs = "01<>/\\|{}[]#$%&ABCDEF".split("");
  const size = 16;
  let columns = 0;
  let drops = [];
  let visible = true;
  let last = 0;

  // Couleurs de la pluie : celles du thème (elles changent avec le mode Edgerunners).
  let palette = [];
  const readPalette = () => {
    const css = getComputedStyle(document.documentElement);
    const pick = (name, fallback) => css.getPropertyValue(name).trim() || fallback;
    palette = [pick("--pink", "#ff4fa3"), pick("--blue", "#3db8ff"), pick("--violet", "#8a5cff")];
  };
  readPalette();
  window.addEventListener("mc-theme", readPalette);

  const resize = () => {
    const box = canvas.parentElement.getBoundingClientRect();
    canvas.width = Math.max(1, Math.floor(box.width));
    canvas.height = Math.max(1, Math.floor(box.height));
    columns = Math.floor(canvas.width / size);
    drops = Array.from({ length: columns }, () => Math.floor(Math.random() * -40));
    ctx.font = `${size}px "Share Tech Mono", monospace`;
  };

  const draw = (time) => {
    requestAnimationFrame(draw);
    if (!visible || time - last < 60) return;
    last = time;

    // Estompe les traînées (le canvas reste transparent)
    ctx.globalCompositeOperation = "destination-out";
    ctx.fillStyle = "rgba(0, 0, 0, .14)";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.globalCompositeOperation = "source-over";

    for (let i = 0; i < columns; i++) {
      const y = drops[i] * size;
      if (y > 0) {
        ctx.fillStyle = palette[i % 3];
        ctx.fillText(glyphs[Math.floor(Math.random() * glyphs.length)], i * size, y);
      }
      if (y > canvas.height && Math.random() > 0.97) drops[i] = 0;
      else drops[i]++;
    }
  };

  resize();
  let resizeTimer;
  window.addEventListener("resize", () => {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(resize, 200);
  });

  if ("IntersectionObserver" in window) {
    new IntersectionObserver(([entry]) => { visible = entry.isIntersecting; }).observe(canvas.parentElement);
  }

  requestAnimationFrame(draw);
}

/* ---------- Démarrage ---------- */

async function init() {
  $("#year").textContent = new Date().getFullYear();
  setupRain();

  $("#source-select").addEventListener("change", (event) => {
    state.source = event.target.value;
    resetAndRender();
  });

  let timer;
  $("#search-input").addEventListener("input", (event) => {
    clearTimeout(timer);
    timer = setTimeout(() => { state.query = event.target.value; resetAndRender(); }, 180);
  });

  $("#more-button").addEventListener("click", () => {
    state.shown += PAGE_SIZE;
    renderList();
  });

  try {
    const [data, config] = await Promise.all([
      loadJson(ITEMS_URL),
      loadJson(SOURCES_URL).catch(() => ({ sources: [] }))
    ]);
    state.items = (data.items || []).filter((item) => item && item.title);
    state.sources = config.sources || [];

    renderStats(data.updated);
    renderChips();
    renderSources();
    renderList();
  } catch (error) {
    console.error("[veille]", error);
    $("#status").textContent = "// erreur de chargement";
    $("#quests").replaceChildren(emptyState(
      "Chargement impossible",
      "Ouvre le site depuis un serveur (GitHub Pages ou l'extension « Live Server »), pas directement depuis le fichier."
    ));
  }
}

init();
