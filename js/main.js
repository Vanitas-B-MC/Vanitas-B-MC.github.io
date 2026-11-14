// js/main.js — construit la page à partir de content/data.js
// + menu mobile, apparition au scroll, lien actif et petits effets.

import { portfolio as data } from "../content/data.js";

const $ = (selector, root = document) => root.querySelector(selector);
const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

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

// Un bloc qui plante ne doit pas empêcher les autres de s'afficher
function safe(fn) {
  try { fn(); } catch (error) { console.error(`[portfolio] ${fn.name} :`, error); }
}

const pad = (n) => String(n).padStart(2, "0");

/* ---------- Accueil ---------- */

function typeInto(el, text) {
  el.textContent = "";
  const readable = h("span", { class: "sr-only" }, text);
  const visible = h("span", { "aria-hidden": "true" });
  const caret = h("span", { class: "caret", "aria-hidden": "true" });
  el.append(readable, visible, caret);

  if (reduceMotion) {
    visible.textContent = text;
    return;
  }

  let i = 0;
  const step = () => {
    visible.textContent = text.slice(0, ++i);
    if (i < text.length) setTimeout(step, 24 + Math.random() * 34);
  };
  setTimeout(step, 450);
}

function renderHero() {
  const name = $("#hero-name");
  name.textContent = data.name;
  name.dataset.text = data.name;

  $("#hero-description").textContent = data.hero.description;
  typeInto($("#hero-tagline"), data.hero.tagline);

  $("#profile-handle").textContent = data.githubHandle;

  const list = $("#profile-list");
  list.replaceChildren(
    ...data.profile.map((row) =>
      h("div", {}, h("dt", {}, row.label), h("dd", {}, row.value))
    )
  );
}

/* ---------- À propos ---------- */

function renderAbout() {
  const box = $("#about-text");
  box.replaceChildren(...data.about.paragraphs.map((text) => h("p", {}, text)));

  if (data.about.seeking) {
    box.append(h("div", { class: "about-seeking" }, h("strong", {}, "Je recherche"), data.about.seeking));
  }

  if (data.about.interests?.length) {
    box.append(
      h("div", { class: "interests" },
        h("span", { class: "interests-label" }, "En dehors du code"),
        data.about.interests.map((item) => h("span", { class: "chip" }, item))
      )
    );
  }

  $("#timeline").replaceChildren(
    ...data.timeline.map((item) =>
      h("li", {},
        h("span", { class: "timeline-period" }, item.period),
        h("strong", {}, item.title),
        item.text && h("p", {}, item.text)
      )
    )
  );

  $("#skills-list").replaceChildren(
    ...data.skills.map((skill) => h("li", { class: "skill-tag" }, skill))
  );
}

/* ---------- Projets ---------- */

const STATUS_LABELS = {
  completed: "Terminé",
  "in-progress": "En cours"
};

function projectCard(project, index) {
  const status = STATUS_LABELS[project.status];

  return h("li", { class: "project reveal" },
    h("article", { class: "project-card chamfer" },
      project.image && h("div", { class: "project-media" },
        h("img", { src: project.image, alt: `Capture d'écran de ${project.name}`, loading: "lazy" })
      ),
      h("div", { class: "project-top" },
        h("span", { class: "project-index" }, `// ${pad(index + 1)}`),
        project.category && h("span", { class: "project-category" }, project.category)
      ),
      h("h3", {}, project.name),
      h("p", {}, project.description || "Description à venir."),
      project.tags?.length > 0 && h("ul", { class: "tags" }, project.tags.map((t) => h("li", {}, t))),
      status && h("span", { class: "project-status", "data-status": project.status }, status),
      project.github && h("a", {
        class: "project-link",
        href: project.github,
        target: "_blank",
        rel: "noopener noreferrer"
      }, "Accéder au dépôt", h("span", { "aria-hidden": "true" }, "↗"))
    )
  );
}

function renderProjects() {
  $("#projects-list").replaceChildren(...data.projects.map(projectCard));
}

/* ---------- Contact, liens, pied de page ---------- */

function renderLinks() {
  document.querySelectorAll("[data-github]").forEach((a) => { a.href = data.github; });

  const email = $("#contact-email");
  email.href = `mailto:${data.email}`;
  email.textContent = data.email;
  $("#contact-mail-button").href = `mailto:${data.email}`;

  $("#contact-github-link").textContent = data.github.replace(/^https?:\/\//, "");

  const cv = $("#contact-cv");
  if (data.cv) {
    cv.href = data.cv;
    cv.hidden = false;
  }

  $("#year").textContent = new Date().getFullYear();
  $("#footer-name").textContent = data.fullName;
}

/* ---------- Comportements ---------- */

function setupMenu() {
  const toggle = $(".menu-toggle");
  const nav = $("#main-nav");
  if (!toggle || !nav) return;

  const setOpen = (open) => {
    nav.classList.toggle("is-open", open);
    toggle.setAttribute("aria-expanded", String(open));
    toggle.setAttribute("aria-label", open ? "Fermer le menu" : "Ouvrir le menu");
  };

  toggle.addEventListener("click", () => setOpen(toggle.getAttribute("aria-expanded") !== "true"));
  nav.addEventListener("click", (e) => { if (e.target.closest("a")) setOpen(false); });
  document.addEventListener("keydown", (e) => { if (e.key === "Escape") setOpen(false); });
  document.addEventListener("click", (e) => {
    if (!e.target.closest(".header")) setOpen(false);
  });
  window.matchMedia("(min-width: 801px)").addEventListener("change", () => setOpen(false));
}

function setupHeaderState() {
  const header = $(".site-header");
  const update = () => header.classList.toggle("is-scrolled", window.scrollY > 8);
  update();
  window.addEventListener("scroll", update, { passive: true });
}

function setupReveal() {
  const items = document.querySelectorAll(".reveal");
  if (!("IntersectionObserver" in window) || reduceMotion) {
    items.forEach((el) => el.classList.add("is-visible"));
    return;
  }
  const observer = new IntersectionObserver((entries) => {
    for (const entry of entries) {
      if (entry.isIntersecting) {
        entry.target.classList.add("is-visible");
        observer.unobserve(entry.target);
      }
    }
  }, { threshold: 0.12, rootMargin: "0px 0px -6% 0px" });
  items.forEach((el) => observer.observe(el));
}

function setupActiveLink() {
  if (!("IntersectionObserver" in window)) return;
  const links = [...document.querySelectorAll(".main-nav a[href^='#']")];
  const byId = new Map(links.map((a) => [a.getAttribute("href").slice(1), a]));

  const observer = new IntersectionObserver((entries) => {
    for (const entry of entries) {
      if (!entry.isIntersecting) continue;
      links.forEach((a) => { a.classList.remove("is-active"); a.removeAttribute("aria-current"); });
      const active = byId.get(entry.target.id);
      if (active) { active.classList.add("is-active"); active.setAttribute("aria-current", "true"); }
    }
  }, { rootMargin: "-45% 0px -50% 0px" });

  byId.forEach((_, id) => { const section = document.getElementById(id); if (section) observer.observe(section); });
}

/* ---------- Démarrage ---------- */

document.documentElement.classList.add("js-ready");

[renderHero, renderAbout, renderProjects, renderLinks].forEach(safe);
[setupMenu, setupHeaderState, setupReveal, setupActiveLink].forEach(safe);
