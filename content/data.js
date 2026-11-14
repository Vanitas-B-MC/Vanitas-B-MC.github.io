// content/data.js — TOUT le contenu du portfolio se modifie ici.
// Le fichier js/main.js lit ces données et construit la page.

export const portfolio = {
  name: "Mathieu",
  fullName: "Mathieu Contamin",

  github: "https://github.com/Vanitas-B-MC",
  githubHandle: "Vanitas-B-MC",
  email: "mathieu.contamin@ellabts.com",
  cv: "assets/CV-Mathieu-Contamin.pdf",

  hero: {
    tagline: "Développeur · Étudiant en BTS SIO option SLAM",
    description:
      "Développeur passionné par la création et le développement de projets numériques."
  },

  // Fiche affichée à côté de l'accueil
  profile: [
    { label: "Nom", value: "Mathieu Contamin" },
    { label: "Rôle", value: "Développeur" },
    { label: "Formation", value: "BTS SIO · option SLAM" },
    { label: "Niveau", value: "2e année" },
    { label: "Zone", value: "Auvergne-Rhône-Alpes" }
  ],

  about: {
    paragraphs: [
      "Je m'appelle Mathieu Contamin, j'ai 19 ans et je suis développeur en Auvergne-Rhône-Alpes. J'aime explorer de nouvelles idées, apprendre et concevoir des projets informatiques.",
      "Mon bac dans le domaine de la santé et du social m'a sensibilisé aux besoins concrets des utilisateurs, un atout pour concevoir des applications métiers adaptées.",
      "Ce portfolio présente mon parcours et mes réalisations."
    ],

    seeking: "Actuellement à la recherche d’un stage en présentiel du 11 janvier au 12 février",

    interests: ["Monster Hunter", "Terraria", "Cyberpunk 2077"]
  },

  timeline: [
    {
      period: "Actuellement",
      title: "BTS SIO — option SLAM, 2e année",
      text: "Services Informatiques aux Organisations · Solutions Logicielles et Applications Métiers"
    },
    {
      period: "Avant",
      title: "Baccalauréat ST2S",
      text: "Sciences et Technologies de la Santé et du Social"
    }
  ],

  skills: ["C#", "HTML", "CSS", "JavaScript", "PHP", "SQL", "Python", "Git / GitHub"],

  // ne pas oublier
  // status : "completed" | "in-progress" (optionnel)
  // image  : chemin d'une capture dans assets/ (optionnel), ex : "assets/scrabble.png"
  // tags   : technologies du projet (optionnel), ex : ["C#", "WinForms"]
  projects: [
    {
      name: "Scrabble 2J",
      description: "Un projet de jeu de Scrabble pour deux joueurs.",
      category: "Projet réalisé",
      status: "completed",
      tags: [],
      image: "",
      github: "https://github.com/Vanitas-B-MC/PRJ_Scrabble2J"
    },
    {
      name: "MULTIBURO",
      description: "Projet réalisé dans le cadre de ma formation.",
      category: "Projet de formation",
      tags: [],
      image: "assets/scrabble.png",
      github: "https://github.com/Vanitas-B-MC/MULTIBURO"
    }
  ]
};
