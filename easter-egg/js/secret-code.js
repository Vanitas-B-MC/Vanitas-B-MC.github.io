// easter-egg/js/secret-code.js — codes secrets tapés au clavier. Rien n'est visible tant qu'on n'en tape pas.
//   « awesome »    ouvre la page cachée (easter-egg/arcade.html)
//   « edgerunner » active / désactive le style Edgerunners (rouge, vert)
//   « neon »       active / désactive le style Neon (rose néon, cyan)
//   « blackwall »  active / désactive le style Blackwall (rouge sang, orange, noir) et lance son morceau de musique
//   « cyberpsychosis » glitch progressif de la page pendant quelques secondes (js/cyberpsychosis.js)
// Chargé sur index.html, veille.html et easter-egg/arcade.html.

import { toggleTheme, currentTheme } from "../../js/theme.js";
import { sharedMusic } from "./music.js";

export const SECRET_CODE = "awesome";
export const SECRET_PAGE = "easter-egg/arcade.html";
export const THEME_CODE = "edgerunner";
export const NEON_CODE = "neon";
export const BLACKWALL_CODE = "blackwall";
export const PSYCHO_CODES = ["cyberpsycho", "cyberpsychosis"];

// Un code par thème : `theme` est le nom de la classe sur <html> (voir theme.js).
export const THEME_CODES = [
  { code: THEME_CODE, theme: "edgerunners", label: "edgerunner" },
  { code: NEON_CODE, theme: "neon", label: "neon" },
  { code: BLACKWALL_CODE, theme: "blackwall", label: "blackwall" },
];

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
  text-shadow: 0 0 28px currentColor;
}
.secret-toast {
  position: fixed;
  left: 50%;
  bottom: 28px;
  z-index: 1000;
  transform: translateX(-50%);
  max-width: calc(100% - 32px);
  padding: 12px 22px;
  background: var(--bg, #07070b);
  border: 1px solid var(--yellow, #fcee0a);
  box-shadow: 0 0 24px -4px var(--yellow, #fcee0a);
  color: var(--cyan, #00f0ff);
  font-family: var(--font-mono, ui-monospace, Consolas, monospace);
  font-size: 13px;
  letter-spacing: .16em;
  text-transform: uppercase;
  text-align: center;
  animation: secret-toast 2.2s ease both;
}
@keyframes secret-in { from { opacity: 0; } to { opacity: 1; } }
@keyframes secret-toast {
  0% { opacity: 0; transform: translate(-50%, 12px); }
  12%, 85% { opacity: 1; transform: translate(-50%, 0); }
  100% { opacity: 0; transform: translate(-50%, 0); }
}
@media (prefers-reduced-motion: reduce) {
  .secret-unlock, .secret-toast { animation: none; }
}
`;

function init() {
  const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const pushPage = createMatcher(SECRET_CODE);
  const psychoMatchers = PSYCHO_CODES.map((code) => createMatcher(code));
  const themeMatchers = THEME_CODES.map((entry) => ({ ...entry, push: createMatcher(entry.code) }));
  const onArcade = document.body.classList.contains("arcade-page");
  let overlay = null;
  let timer = 0;
  let toastTimer = 0;
  let wallStartedMusic = false;   // la musique a été lancée par le code « blackwall » (et pas par le joueur)

  function addStyle() {
    if (document.getElementById("secret-style")) return;
    const style = document.createElement("style");
    style.id = "secret-style";
    style.textContent = STYLE;
    document.head.append(style);
  }

  function unlock() {
    if (overlay) return;
    addStyle();

    const line = document.createElement("p");
    line.className = "secret-unlock-line";
    line.textContent = "> séquence reconnue";

    const title = document.createElement("p");
    title.className = "secret-unlock-title";
    title.textContent = "Accès autorisé";

    overlay = document.createElement("div");
    overlay.className = "secret-unlock";
    overlay.setAttribute("role", "status");
    overlay.append(line, title);
    document.body.append(overlay);

    timer = window.setTimeout(() => { window.location.href = SECRET_PAGE; }, reduceMotion ? 300 : 900);
  }

  function themeToast(label, on) {
    addStyle();
    document.querySelector(".secret-toast")?.remove();

    const toast = document.createElement("p");
    toast.className = "secret-toast";
    toast.setAttribute("role", "status");
    toast.textContent = `> mode ${label} : ${on ? "activé" : "désactivé"}`;
    document.body.append(toast);

    window.clearTimeout(toastTimer);
    toastTimer = window.setTimeout(() => toast.remove(), 2200);
  }

  // Le morceau Blackwall démarre avec le thème. Appelé pendant l'événement clavier : le navigateur autorise alors le son.
  // Si le joueur écoutait déjà de la musique, on ne touche à rien : le morceau change tout seul avec le thème.
  function startWallMusic() {
    try {
      const music = sharedMusic();
      if (music.on) return;
      music.start();
      wallStartedMusic = music.on;
    } catch (error) {
      console.error("[blackwall]", error);
    }
  }

  // Quand on quitte le thème (même en tapant un autre code), on coupe la musique qu'on avait lancée.
  window.addEventListener("mc-theme", () => {
    if (!wallStartedMusic || currentTheme() === "blackwall") return;
    wallStartedMusic = false;
    try { sharedMusic().stop(); } catch { /* rien à couper */ }
  });

  document.addEventListener("keydown", (event) => {
    if (event.isComposing || event.repeat) return;
    if (event.ctrlKey || event.metaKey || event.altKey) return;
    if (event.key.length !== 1) return;          // ignore Shift, flèches, etc.
    if (isTypingField(event.target)) return;

    // On alimente toujours tous les détecteurs : chacun suit sa propre suite de lettres.
    const page = pushPage(event.key);
    const psycho = psychoMatchers.map((push) => push(event.key)).some(Boolean);
    const hit = themeMatchers.map((matcher) => matcher.push(event.key) && matcher).find(Boolean);

    if (page && !onArcade) unlock();
    if (hit) {
      const on = toggleTheme(hit.theme);
      themeToast(hit.label, on);
      if (on && hit.theme === "blackwall") startWallMusic();
    }
    if (psycho) {
      // Chargé seulement quand on en a besoin.
      // Chemin relatif à ce fichier (easter-egg/js/secret-code.js), donc valable depuis toutes les pages.
      import("./cyberpsychosis.js")
        .then((module) => module.startCyberpsychosis())
        .catch((error) => console.error("[cyberpsychosis]", error));
    }
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
