// js/secret-code.js — ouvre la page cachée quand on tape la bonne suite de touches.
// Chargé sur index.html et veille.html. Rien n'est visible tant que le code n'est pas tapé.

export const SECRET_CODE = "awesome";
export const SECRET_PAGE = "arcade.html";

// Garde les dernières lettres tapées ; renvoie true quand elles forment le code.
export function createMatcher(code = SECRET_CODE) {
  let buffer = "";
  return function push(char) {
    buffer = (buffer + char.toLowerCase()).slice(-code.length);
    if (buffer !== code) return false;
    buffer = "";
    return true;
  };
}

// On ne réagit pas quand la personne écrit dans un champ (ex. la recherche de la page Veille).
function isTypingField(target) {
  return target instanceof Element &&
    Boolean(target.closest("input, textarea, select, [contenteditable]:not([contenteditable='false'])"));
}

const STYLE = `
.secret-unlock {
  position: fixed;
  inset: 0;
  z-index: 1000;
  display: grid;
  place-content: center;
  justify-items: center;
  gap: 10px;
  padding: 24px;
  text-align: center;
  background: rgba(7, 7, 11, .92);
  animation: secret-in .25s ease both;
}
.secret-unlock-line {
  color: var(--cyan, #00f0ff);
  font-family: var(--font-mono, ui-monospace, Consolas, monospace);
  font-size: 13px;
  letter-spacing: .2em;
  text-transform: uppercase;
}
.secret-unlock-title {
  color: var(--yellow, #fcee0a);
  font-family: var(--font-display, "Arial Narrow", system-ui, sans-serif);
  font-size: clamp(36px, 9vw, 72px);
  font-weight: 700;
  letter-spacing: .05em;
  line-height: 1;
  text-transform: uppercase;
  text-shadow: 0 0 28px rgba(252, 238, 10, .35);
}
@keyframes secret-in { from { opacity: 0; } to { opacity: 1; } }
@media (prefers-reduced-motion: reduce) { .secret-unlock { animation: none; } }
`;

function init() {
  const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const push = createMatcher();
  let overlay = null;
  let timer = 0;

  function unlock() {
    if (overlay) return;

    const style = document.createElement("style");
    style.textContent = STYLE;

    const line = document.createElement("p");
    line.className = "secret-unlock-line";
    line.textContent = "> séquence reconnue";

    const title = document.createElement("p");
    title.className = "secret-unlock-title";
    title.textContent = "Accès autorisé";

    overlay = document.createElement("div");
    overlay.className = "secret-unlock";
    overlay.setAttribute("role", "status");
    overlay.append(style, line, title);
    document.body.append(overlay);

    timer = window.setTimeout(() => { window.location.href = SECRET_PAGE; }, reduceMotion ? 300 : 900);
  }

  document.addEventListener("keydown", (event) => {
    if (event.isComposing || event.repeat) return;
    if (event.ctrlKey || event.metaKey || event.altKey) return;
    if (event.key.length !== 1) return;          // ignore Shift, flèches, etc.
    if (isTypingField(event.target)) return;

    if (push(event.key)) unlock();
  });

  // Retour arrière du navigateur : la page revient telle quelle, on retire le message.
  window.addEventListener("pageshow", (event) => {
    if (!event.persisted || !overlay) return;
    window.clearTimeout(timer);
    overlay.remove();
    overlay = null;
  });
}

if (typeof document !== "undefined") init();
