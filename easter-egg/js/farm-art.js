// js/farm-art.js — petits dessins en pixel-art (16 × 16) des cultures, sans fichier image.
// Chaque culture a 3 stades : 1 = le début (jeune pousse), 2 = le milieu (qui grandit), 3 = la fin (mûre, prête à récolter).
// Les dessins sont tracés par du code (ellipses, lignes) puis rendus en SVG par l'interface. Aucun accès au DOM ici.

export const SIZE = 16;
export const STAGES = 3;

// Stade affiché pour une parcelle : par tiers de la pousse (1, 2 puis 3). `progress` va de 0 à 1.
export const stageOf = (progress) => (progress < 1 / 3 ? 1 : progress < 2 / 3 ? 2 : 3);

const DARK = "#1c7c4a";
const MID = "#2fbf71";
const LIGHT = "#82ffb4";
const OUTLINE = "#0b3a22";

/* ---------- Petite boîte à outils de dessin ---------- */

const blank = () => Array.from({ length: SIZE }, () => Array(SIZE).fill(null));

function put(g, x, y, color) {
  const px = Math.round(x);
  const py = Math.round(y);
  if (px >= 0 && px < SIZE && py >= 0 && py < SIZE) g[py][px] = color;
}

function rect(g, x, y, w, h, color) {
  for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) put(g, x + i, y + j, color);
}

// Ellipse pleine centrée en (cx, cy), de rayons rx et ry.
function ellipse(g, cx, cy, rx, ry, color) {
  for (let y = 0; y < SIZE; y++) {
    for (let x = 0; x < SIZE; x++) {
      if (((x - cx) / rx) ** 2 + ((y - cy) / ry) ** 2 <= 1) g[y][x] = color;
    }
  }
}

// Ligne (algorithme de Bresenham), `thick` = 2 pour un trait épais.
function line(g, x0, y0, x1, y1, color, thick = 1) {
  let x = x0;
  let y = y0;
  const dx = Math.abs(x1 - x0);
  const dy = -Math.abs(y1 - y0);
  const sx = x0 < x1 ? 1 : -1;
  const sy = y0 < y1 ? 1 : -1;
  let err = dx + dy;
  for (;;) {
    put(g, x, y, color);
    if (thick > 1) put(g, x + 1, y, color);
    if (x === x1 && y === y1) break;
    const e2 = 2 * err;
    if (e2 >= dy) { err += dy; x += sx; }
    if (e2 <= dx) { err += dx; y += sy; }
  }
}

// Feuille : ellipse claire avec une nervure plus foncée.
function leaf(g, cx, cy, rx, ry, color = MID, vein = DARK) {
  ellipse(g, cx, cy, rx, ry, color);
  put(g, cx, cy, vein);
}

const stem = (g, x, top, bottom = 15, color = MID) => rect(g, x, top, 2, bottom - top + 1, color);

/* ---------- Les 6 cultures ---------- */

const DRAW = {
  radis(g, stage) {
    if (stage === 1) {
      stem(g, 7, 11);
      leaf(g, 5, 11, 2, 1);
      leaf(g, 10, 11, 2, 1);
      leaf(g, 7.5, 9, 1, 1.6, LIGHT);
    } else if (stage === 2) {
      stem(g, 7, 8);
      leaf(g, 4, 10, 3, 1.2);
      leaf(g, 11, 10, 3, 1.2);
      leaf(g, 5, 7, 2, 1.6, LIGHT);
      leaf(g, 10, 7, 2, 1.6, LIGHT);
      leaf(g, 7.5, 5, 1.2, 2);
      put(g, 7, 15, "#ff6b8a"); put(g, 8, 15, "#ff6b8a");
    } else {
      stem(g, 7, 6);
      leaf(g, 3, 8, 3, 1.5);
      leaf(g, 12, 8, 3, 1.5);
      leaf(g, 5, 4, 2, 2, LIGHT);
      leaf(g, 10, 4, 2, 2, LIGHT);
      leaf(g, 7.5, 2, 1.4, 2.2);
      ellipse(g, 7.5, 14, 3.4, 2.6, "#ff3d6e");
      put(g, 6, 13, "#ffa0b4"); put(g, 7, 12, "#ffa0b4");
      put(g, 7, 15, "#ffffff"); put(g, 8, 15, "#ffffff");
    }
  },

  carotte(g, stage) {
    // frondes : une ligne fine par pointe, avec une foliole et un bout plus clair
    const frond = (ex, ey, color = MID) => {
      line(g, 7, 15, ex, ey, color);
      put(g, ex, ey, LIGHT);
      put(g, ex + (ex < 7 ? 1 : -1), ey + 2, color);
    };
    if (stage === 1) {
      frond(5, 11); frond(8, 10); frond(10, 11);
    } else if (stage === 2) {
      frond(3, 9); frond(5, 6); frond(8, 4); frond(10, 6); frond(12, 9);
      put(g, 7, 15, "#ff9a3d"); put(g, 8, 15, "#ff9a3d");
    } else {
      frond(1, 8); frond(3, 5); frond(5, 2); frond(8, 1); frond(10, 2); frond(12, 5); frond(14, 8);
      ellipse(g, 7.5, 14.6, 3, 2.2, "#ff8a1f");
      put(g, 6, 14, "#ffc27a"); put(g, 7, 13, "#ffc27a");
    }
  },

  mais(g, stage) {
    if (stage === 1) {
      stem(g, 7, 10);
      leaf(g, 4, 11, 2.5, 1);
      leaf(g, 11, 12, 2.5, 1);
    } else if (stage === 2) {
      stem(g, 7, 4);
      line(g, 7, 9, 2, 5, MID, 2); line(g, 8, 8, 13, 4, MID, 2);
      line(g, 7, 12, 2, 10, LIGHT, 2); line(g, 8, 12, 13, 10, LIGHT, 2);
    } else {
      stem(g, 7, 2);
      line(g, 7, 9, 1, 4, MID, 2); line(g, 8, 8, 14, 3, MID, 2);
      line(g, 7, 12, 1, 10, LIGHT, 2); line(g, 8, 13, 14, 11, LIGHT, 2);
      ellipse(g, 11.5, 8, 2, 3.4, MID);
      ellipse(g, 11, 8, 1.4, 3, "#ffd23d");
      put(g, 10, 7, "#fff3a8"); put(g, 10, 9, "#fff3a8");
      put(g, 7, 1, "#d9b24a"); put(g, 8, 0, "#d9b24a"); put(g, 6, 2, "#d9b24a"); put(g, 9, 2, "#d9b24a");
    }
  },

  citrouille(g, stage) {
    if (stage === 1) {
      stem(g, 7, 10);
      leaf(g, 3.5, 12, 2.5, 1.6);
      leaf(g, 11.5, 12, 2.5, 1.6);
      leaf(g, 7.5, 8.5, 1, 1.5, LIGHT);
    } else if (stage === 2) {
      stem(g, 7, 8);
      leaf(g, 4, 12, 3, 2.4);
      leaf(g, 5, 7, 2.5, 2, LIGHT);
      ellipse(g, 11, 13, 2.8, 2.3, "#6bbf4a");
      put(g, 10, 12, "#a8e87f");
    } else {
      leaf(g, 2.5, 12, 2.5, 2);
      ellipse(g, 8, 11.5, 5.4, 4, "#ff8a1f");
      for (const x of [5, 8, 11]) rect(g, x, 8, 1, 7, "#e0620a");
      put(g, 6, 9, "#ffc27a"); put(g, 6, 10, "#ffc27a");
      rect(g, 7, 6, 2, 3, "#2f8f4a"); put(g, 9, 6, "#2f8f4a");
      leaf(g, 13, 12, 2, 1.6, LIGHT);
    }
  },

  melon(g, stage) {
    if (stage === 1) {
      stem(g, 7, 10);
      leaf(g, 4, 13, 3, 1.4);
      leaf(g, 11, 12, 2.5, 1.6);
      leaf(g, 7.5, 8.5, 1, 1.5, LIGHT);
    } else if (stage === 2) {
      stem(g, 6, 8);
      leaf(g, 3, 12, 3, 2.4);
      leaf(g, 4, 7, 2.5, 2, LIGHT);
      ellipse(g, 10.5, 12.5, 3.4, 3, "#9be15d");
      put(g, 9, 11, "#d6ffb0");
    } else {
      leaf(g, 2, 12, 2, 2);
      ellipse(g, 8, 11, 5.6, 4.6, "#ffd23d");
      for (let i = 0; i < 6; i++) { put(g, 4 + i * 1.4, 8 + (i % 2) * 3, "#e0a800"); put(g, 5 + i * 1.4, 10 + (i % 2) * 3, "#e0a800"); }
      put(g, 5, 8, "#fff3a8"); put(g, 5, 9, "#fff3a8"); put(g, 6, 7, "#fff3a8");
      rect(g, 7, 5, 2, 2, "#2f8f4a");
      leaf(g, 14, 12, 1.8, 2, LIGHT);
    }
  },

  orchidee(g, stage) {
    if (stage === 1) {
      line(g, 7, 15, 7, 11, MID, 2);
      leaf(g, 4, 13, 2.5, 1);
      leaf(g, 11, 13, 2.5, 1);
    } else if (stage === 2) {
      line(g, 7, 15, 7, 9, MID, 2); line(g, 8, 9, 10, 5, MID);
      leaf(g, 3, 13, 3, 1.2); leaf(g, 12, 13, 3, 1.2); leaf(g, 5, 10, 2.5, 1, LIGHT);
      ellipse(g, 10, 4, 1.4, 2, "#c77dff"); put(g, 10, 3, "#ecc9ff");
    } else {
      line(g, 7, 15, 7, 9, MID, 2); line(g, 8, 9, 10, 4, MID); line(g, 7, 10, 4, 6, MID);
      leaf(g, 3, 13, 3, 1.2); leaf(g, 12, 13, 3, 1.2); leaf(g, 5, 11, 2.5, 1, LIGHT);
      const flower = (x, y, petals, center) => {
        for (const [dx, dy] of [[-1, 0], [1, 0], [0, -1], [0, 1], [-1, -1], [1, -1]]) put(g, x + dx, y + dy, petals);
        put(g, x, y, center);
      };
      flower(10, 3, "#ff5fd2", "#fcee0a");
      flower(4, 5, "#c77dff", "#fcee0a");
      flower(12, 7, "#ff9bea", "#fcee0a");
    }
  }
};

export const CROP_ART_IDS = Object.keys(DRAW);

// Dessin d'une culture à un stade (1 à 3) : tableau de 16 lignes de 16 couleurs (ou null = transparent).
export function spriteFor(cropId, stage) {
  const g = blank();
  (DRAW[cropId] ?? DRAW.radis)(g, Math.min(STAGES, Math.max(1, stage)));
  return g;
}

// Regroupe les pixels voisins de même couleur en bandes : moins de formes à dessiner en SVG.
export function spriteRuns(sprite) {
  const runs = [];
  for (let y = 0; y < SIZE; y++) {
    let x = 0;
    while (x < SIZE) {
      const color = sprite[y][x];
      if (!color) { x++; continue; }
      let w = 1;
      while (x + w < SIZE && sprite[y][x + w] === color) w++;
      runs.push({ x, y, w, color });
      x += w;
    }
  }
  return runs;
}

export const pixelCount = (sprite) => sprite.flat().filter(Boolean).length;

/* ---------- Poissons (pour le mini-jeu de pêche) ---------- */

// Éclaircit (amount > 0) ou assombrit (amount < 0) une couleur "#rrggbb".
export function shade(hex, amount) {
  const n = parseInt(hex.slice(1), 16);
  const to = amount >= 0 ? 255 : 0;
  const t = Math.abs(amount);
  const mix = (c) => Math.round(c + (to - c) * t);
  const r = mix((n >> 16) & 255);
  const g = mix((n >> 8) & 255);
  const b = mix(n & 255);
  return `#${((1 << 24) | (r << 16) | (g << 8) | b).toString(16).slice(1)}`;
}

// Petit poisson de profil, tourné vers la gauche (la tête est à gauche, la queue à droite).
export function fishSprite(color) {
  const g = blank();
  const belly = shade(color, 0.45);
  const fin = shade(color, -0.32);
  ellipse(g, 7, 8, 5.6, 3.3, color);
  ellipse(g, 7, 9.8, 4.4, 1.4, belly);
  for (let x = 12; x <= 15; x++) {                       // queue en triangle
    const half = x - 11;
    for (let y = 8 - half; y <= 8 + half; y++) put(g, x, y, fin);
  }
  rect(g, 6, 4, 3, 1, fin); put(g, 7, 3, fin);          // nageoire dorsale
  put(g, 8, 10, fin); put(g, 9, 11, fin);               // nageoire ventrale
  put(g, 4, 7, "#ffffff"); put(g, 3, 7, "#0b0b12");     // œil
  put(g, 1, 9, fin);                                    // bouche
  return g;
}
