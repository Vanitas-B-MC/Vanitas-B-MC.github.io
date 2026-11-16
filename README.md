# Portfolio

Site statique (HTML / CSS / JavaScript) publié avec GitHub Pages.

## Structure

```
index.html                  page principale (thème Cyberpunk)
veille.html                 page « Veille » (thème Cyberpunk, rose et bleu)
css/style.css, css/veille.css
js/main.js, js/veille.js
content/data.js             contenu du portfolio (textes, projets, contact…)
content/veille-sources.json liste des flux RSS suivis
content/veille.json         articles de la veille (rempli automatiquement)
scripts/fetch_veille.py     relève les flux RSS (Python, sans dépendance)
.github/workflows/veille.yml  lance la relève toutes les 3 heures
assets/                     favicon, images
```

## Veille automatique

1. Le workflow GitHub Actions « Mise à jour de la veille » s'exécute toutes les 3 heures.
2. Il lance `scripts/fetch_veille.py`, qui lit les flux de `content/veille-sources.json`,
   nettoie les extraits (résumés) et écrit `content/veille.json`.
3. Si le fichier a changé, le workflow le commit : GitHub Pages republie le site.
