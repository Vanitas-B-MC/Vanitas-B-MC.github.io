// js/barcode-egg.js — easter egg : 5 clics (ou 5 taps) sur le code-barres de la fiche de profil.
// Effet de glitch, la fiche affiche une autre identité pendant 5 secondes, nouveau glitch, retour à la normale.
// Chargé sur index.html uniquement (<script type="module" src="js/barcode-egg.js"></script>).

const CLICKS = 5;          // nombre de clics nécessaires
const CLICK_WINDOW = 1500; // délai max entre deux clics (ms)
const SHOW_MS = 5000;      // durée de l'identité alternative
const GLITCH_MS = 500;     // durée de chaque glitch

// Contenu alternatif : modifie-le librement.
const ALTER = {
  // [libellé, valeur, icône facultative]
  fields: [
    ["Nom", "Vanitas B. Blade"],
    ["Rôle", "Mercenaire"],
    ["Statut", "Edgerunner", "assets/edgerunner-symbol.png"],
  ],
  // Texte affiché sous les champs (une ligne par élément). Mets ici le texte de ton choix.
  lines: [
    "Who's Ready For Tomorrow",
  ],
};

const STYLE = `
.mc-glitch {
  animation: mc-glitch ${GLITCH_MS}ms steps(1, end) both;
}
@keyframes mc-glitch {
  0%   { transform: none; filter: none; clip-path: inset(0); }
  10%  { transform: translate(-5px, 1px); clip-path: inset(8% 0 58% 0);
         filter: drop-shadow(4px 0 var(--cyan, #00f0ff)) drop-shadow(-4px 0 var(--yellow, #fcee0a)); }
  20%  { transform: translate(6px, -2px); clip-path: inset(62% 0 6% 0);
         filter: drop-shadow(-4px 0 var(--cyan, #00f0ff)) drop-shadow(4px 0 var(--yellow, #fcee0a)); }
  30%  { transform: translate(-3px, 0); clip-path: inset(0); opacity: .75;
         filter: drop-shadow(3px 0 var(--cyan, #00f0ff)); }
  45%  { transform: translate(4px, 2px); clip-path: inset(30% 0 35% 0); opacity: 1;
         filter: drop-shadow(-3px 0 var(--yellow, #fcee0a)); }
  60%  { transform: translate(-6px, -1px); clip-path: inset(0 0 70% 0);
         filter: drop-shadow(5px 0 var(--cyan, #00f0ff)) drop-shadow(-5px 0 var(--yellow, #fcee0a)); }
  75%  { transform: translate(2px, 0); clip-path: inset(48% 0 20% 0); opacity: .8; filter: none; }
  90%  { transform: translate(-2px, 1px); clip-path: inset(0); opacity: 1;
         filter: drop-shadow(2px 0 var(--cyan, #00f0ff)); }
  100% { transform: none; filter: none; clip-path: inset(0); opacity: 1; }
}
.alter-icon {
  display: inline-block;
  height: 1.2em;
  width: auto;
  margin-right: .5em;
  vertical-align: -.22em;
}
.alter-lines {
  margin: 14px 0 0;
  color: var(--cyan, #00f0ff);
  font-family: var(--font-mono, ui-monospace, Consolas, monospace);
  font-size: 13px;
  line-height: 1.6;
  white-space: pre-line;
}
`;

const wait = (ms) => new Promise((resolve) => window.setTimeout(resolve, ms));

function init() {
  const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  let count = 0;
  let lastClick = 0;
  let busy = false;

  function addStyle() {
    if (document.getElementById("barcode-egg-style")) return;
    const style = document.createElement("style");
    style.id = "barcode-egg-style";
    style.textContent = STYLE;
    document.head.append(style);
  }

  // Joue le glitch ; `swap` est appelé à mi-chemin, quand l'écran est « brouillé ».
  async function glitch(target, swap) {
    if (reduceMotion) { swap(); return; }
    target.classList.add("mc-glitch");
    await wait(GLITCH_MS / 2);
    swap();
    await wait(GLITCH_MS / 2);
    target.classList.remove("mc-glitch");
  }

  // Même structure que renderHero() dans main.js : <div><dt>…</dt><dd>…</dd></div>
  function buildAlterFields() {
    return ALTER.fields.map(([label, value, icon]) => {
      const row = document.createElement("div");
      const dt = document.createElement("dt");
      dt.textContent = label;
      const dd = document.createElement("dd");
      if (icon) {
        const img = document.createElement("img");
        img.className = "alter-icon";
        img.src = icon;
        img.alt = "";
        dd.append(img);
      }
      dd.append(value);
      row.append(dt, dd);
      return row;
    });
  }

  async function run() {
    const list = document.getElementById("profile-list");
    const body = document.querySelector(".profile-card .card-body");
    if (!list || !body || busy) return;

    busy = true;
    addStyle();

    const original = [...list.childNodes];   // on garde les vrais nœuds pour les remettre tels quels
    let lines = null;

    try {
      await glitch(body, () => {
        list.replaceChildren(...buildAlterFields());
        if (ALTER.lines.length) {
          lines = document.createElement("p");
          lines.className = "alter-lines";
          lines.textContent = ALTER.lines.join("\n");
          list.after(lines);
        }
      });

      await wait(SHOW_MS);

      await glitch(body, () => {
        lines?.remove();
        list.replaceChildren(...original);
      });
    } finally {
      // Quoi qu'il arrive, la fiche revient à la normale.
      body.classList.remove("mc-glitch");
      lines?.remove();
      if (list.firstChild !== original[0]) list.replaceChildren(...original);
      busy = false;
    }
  }

  document.addEventListener("click", (event) => {
    if (!(event.target instanceof Element) || !event.target.closest(".barcode")) return;

    const now = Date.now();
    count = now - lastClick > CLICK_WINDOW ? 1 : count + 1;
    lastClick = now;

    if (count < CLICKS) return;
    count = 0;
    run();
  });
}

if (typeof document !== "undefined") init();
