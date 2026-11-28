// Code secret « supersecret » : taper cette suite de caractères au clavier
// ouvre la page cachée easter-egg/supersecret.html (jeu « Crypte Néon »).
// Script indépendant de secret-code.js : il n'interfère pas avec « awesome » ni « edgerunner ».

const CODE = "supersecret";
const TARGET = "supersecret.html";
const RESET_DELAY = 2500; // ms sans frappe avant d'oublier les touches déjà tapées

let buffer = "";
let resetTimer = null;
let opening = false;

function isTyping(el) {
  return !!el && (el.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName));
}

function openSecretPage() {
  if (opening) return;
  opening = true;

  const veil = document.createElement("div");
  veil.setAttribute("aria-hidden", "true");
  veil.textContent = "// ACCÈS AUTORISÉ — DESCENTE EN COURS…";
  veil.style.cssText = [
    "position:fixed", "inset:0", "z-index:99999", "display:flex",
    "align-items:center", "justify-content:center", "background:#05050a",
    "color:#00f0ff", "font:600 clamp(14px,3vw,22px) 'Share Tech Mono',monospace",
    "letter-spacing:.12em", "text-align:center", "padding:24px",
    "opacity:0", "transition:opacity .45s ease",
  ].join(";");
  document.body.appendChild(veil);
  requestAnimationFrame(() => { veil.style.opacity = "1"; });

  setTimeout(() => { window.location.href = TARGET; }, 750);
}

window.addEventListener("keydown", (event) => {
  if (event.ctrlKey || event.metaKey || event.altKey || isTyping(event.target)) return;
  if (!event.key || event.key.length !== 1) return;

  // event.key (et non event.code) : le code fonctionne quelle que soit la disposition du clavier.
  buffer = (buffer + event.key.toLowerCase()).slice(-CODE.length);

  clearTimeout(resetTimer);
  resetTimer = setTimeout(() => { buffer = ""; }, RESET_DELAY);

  if (buffer === CODE) {
    buffer = "";
    openSecretPage();
  }
});
