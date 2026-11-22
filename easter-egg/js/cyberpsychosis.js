// js/cyberpsychosis.js — easter egg : taper « cyberpsychosis ».
// Pendant ~6 s la page se disloque de plus en plus (décalages, séparation rouge/cyan),
// un HUD d'alerte affiche la « part d'humanité » qui chute, puis tout se rétablit.
// Échap ou un clic arrête l'effet tout de suite. Avec prefers-reduced-motion : HUD seul, sans secousses.
// Chargé à la demande par secret-code.js.

const RAMP_MS = 6000;    // montée en intensité
const OUTRO_MS = 1500;   // message « synchronisation rétablie » puis fondu
const TICK_MS = 90;      // fréquence des secousses
const TITLE = "CYBERPSYCHOSE";
const GLYPHS = "█▓▒░#%&@$?!/\\";

const STAGES = [
  [0.3, "synchronisation instable"],
  [0.6, "implants en surcharge"],
  [0.85, "contrôle moteur perdu"],
  [1.01, "signal perdu"],
];

const STYLE = `
.psy-overlay {
  --psy: 0;
  --human: 1;
  position: fixed;
  inset: 0;
  z-index: 2000;
  pointer-events: none;
  opacity: 1;
  transition: opacity .6s ease;
  font-family: var(--font-mono, ui-monospace, Consolas, monospace);
}
.psy-overlay.is-leaving { opacity: 0; }
.psy-vignette {
  position: absolute;
  inset: 0;
  box-shadow: inset 0 0 calc(40px + 160px * var(--psy)) calc(10px + 50px * var(--psy))
    rgba(255, 32, 60, calc(.15 + .5 * var(--psy)));
  transition: box-shadow .6s ease;
}
.psy-scan {
  position: absolute;
  inset: 0;
  background: repeating-linear-gradient(0deg,
    rgba(255, 32, 60, calc(.03 + .08 * var(--psy))) 0 1px, transparent 1px 3px);
}
.psy-hud {
  position: absolute;
  top: max(16px, env(safe-area-inset-top, 0px));
  left: 16px;
  right: 16px;
  color: #ff2a3c;
  font-size: 12px;
  letter-spacing: .18em;
  text-transform: uppercase;
  text-shadow: 0 0 10px rgba(255, 32, 60, .8);
}
.psy-alert { margin: 0; opacity: .85; }
.psy-title {
  margin: 4px 0;
  font-family: var(--font-display, "Arial Narrow", system-ui, sans-serif);
  font-size: clamp(24px, 6vw, 44px);
  font-weight: 700;
  letter-spacing: .08em;
  line-height: 1.1;
}
.psy-status, .psy-human { margin: 0; }
.psy-bar {
  width: min(260px, 70vw);
  height: 4px;
  margin-top: 8px;
  background: rgba(255, 32, 60, .22);
}
.psy-bar-fill {
  height: 100%;
  background: currentColor;
  transform-origin: left;
  transform: scaleX(var(--human));
}
.psy-hint { margin: 8px 0 0; font-size: 11px; opacity: .55; }
.psy-overlay.is-restored .psy-hud {
  color: var(--cyan, #00f0ff);
  text-shadow: 0 0 10px rgba(0, 240, 255, .7);
}
.psy-overlay.is-restored .psy-vignette { box-shadow: inset 0 0 40px 0 rgba(0, 240, 255, 0); }
.psy-overlay.is-restored .psy-scan { opacity: 0; }
`;

let running = false;

function addStyle() {
  if (document.getElementById("psy-style")) return;
  const style = document.createElement("style");
  style.id = "psy-style";
  style.textContent = STYLE;
  document.head.append(style);
}

const el = (tag, className, text) => {
  const node = document.createElement(tag);
  node.className = className;
  if (text) node.textContent = text;
  return node;
};

// Remplace quelques lettres du titre par des symboles, pour l'effet « corrompu ».
function scramble(text, count) {
  const chars = [...text];
  for (let n = 0; n < count; n++) {
    const i = Math.floor(Math.random() * chars.length);
    chars[i] = GLYPHS[Math.floor(Math.random() * GLYPHS.length)];
  }
  return chars.join("");
}

export function startCyberpsychosis() {
  if (running || typeof document === "undefined") return;
  running = true;

  const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  addStyle();

  // --- HUD ---
  const alert = el("p", "psy-alert", "// alerte");
  const title = el("p", "psy-title", TITLE);
  const status = el("p", "psy-status", `> ${STAGES[0][1]}`);
  const human = el("p", "psy-human", "> humanité : 100%");
  const bar = el("div", "psy-bar");
  bar.append(el("div", "psy-bar-fill"));
  const hint = el("p", "psy-hint", "[échap] pour arrêter");
  const hud = el("div", "psy-hud");
  hud.append(alert, title, status, human, bar, hint);

  const overlay = el("div", "psy-overlay");
  overlay.setAttribute("role", "status");
  overlay.append(el("div", "psy-vignette"), el("div", "psy-scan"), hud);
  document.documentElement.append(overlay);   // sur <html> : les éléments fixes ne sont pas déplacés par les secousses

  // --- Éléments secoués : les enfants directs de <body> (on garde leur style d'origine) ---
  const targets = reduceMotion ? [] : [...document.body.children]
    .filter((node) => !["SCRIPT", "STYLE", "NOSCRIPT"].includes(node.tagName))
    .map((node) => ({
      node,
      transform: node.style.transform,
      filter: node.style.filter,
    }));

  function restoreTargets() {
    for (const { node, transform, filter } of targets) {
      node.style.transform = transform;
      node.style.filter = filter;
    }
  }

  const rnd = () => Math.random() * 2 - 1;
  const start = performance.now();
  let intervalId = 0;
  let outroTimer = 0;
  let finished = false;

  function tick() {
    const p = Math.min(1, (performance.now() - start) / RAMP_MS);
    const intensity = p ** 1.6;
    const humanity = Math.max(0.08, 1 - 0.9 * intensity + rnd() * 0.02);

    overlay.style.setProperty("--psy", intensity.toFixed(3));
    overlay.style.setProperty("--human", humanity.toFixed(3));
    human.textContent = `> humanité : ${Math.round(humanity * 100)}%`;
    status.textContent = `> ${STAGES.find(([limit]) => p < limit)[1]}`;

    if (!reduceMotion) {
      title.textContent = Math.random() < intensity * 0.6 ? scramble(TITLE, 1 + Math.round(intensity * 2)) : TITLE;

      for (const { node } of targets) {
        const move = Math.random() < 0.3 + 0.5 * intensity;
        const skew = Math.random() < intensity * 0.25 ? ` skewX(${(rnd() * intensity * 5).toFixed(2)}deg)` : "";
        node.style.transform = move
          ? `translate(${(rnd() * intensity * 14).toFixed(1)}px, ${(rnd() * intensity * 3).toFixed(1)}px)${skew}`
          : "";
        const split = (intensity * 5).toFixed(1);
        node.style.filter =
          `drop-shadow(${split}px 0 rgba(255, 32, 60, .7)) drop-shadow(-${split}px 0 rgba(0, 240, 255, .7))`;
      }
    }

    if (p >= 1) stop();
  }

  function stop() {
    if (finished) return;
    finished = true;
    window.clearInterval(intervalId);
    restoreTargets();

    // Retour à la normale : message cyan, puis fondu
    title.textContent = "SYNCHRONISATION RÉTABLIE";
    status.textContent = "> implants stabilisés";
    human.textContent = "> humanité : 100%";
    overlay.style.setProperty("--human", "1");
    overlay.style.setProperty("--psy", "0");
    hint.hidden = true;
    overlay.classList.add("is-restored");

    outroTimer = window.setTimeout(() => overlay.classList.add("is-leaving"), OUTRO_MS - 600);
    window.setTimeout(cleanup, OUTRO_MS);
  }

  function cleanup() {
    window.clearTimeout(outroTimer);
    document.removeEventListener("keydown", onKey);
    document.removeEventListener("pointerdown", stop);
    window.removeEventListener("pagehide", cleanup);
    window.clearInterval(intervalId);
    restoreTargets();
    overlay.remove();
    running = false;
  }

  function onKey(event) {
    if (event.key === "Escape") stop();
  }

  document.addEventListener("keydown", onKey);
  document.addEventListener("pointerdown", stop);
  window.addEventListener("pagehide", cleanup);

  tick();
  intervalId = window.setInterval(tick, TICK_MS);
}
