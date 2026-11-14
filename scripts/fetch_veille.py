#!/usr/bin/env python3
"""Relève de veille : lit les flux RSS/Atom de content/veille-sources.json
et écrit content/veille.json (articles récents + court résumé).

- Aucune dépendance : uniquement la bibliothèque standard de Python.
- Lancé automatiquement par GitHub Actions (voir .github/workflows/veille.yml),
  mais utilisable à la main :  python scripts/fetch_veille.py
- Si un flux est indisponible, ses anciens articles sont conservés.
"""

import html
import json
import re
import sys
from datetime import datetime, timedelta, timezone
from email.utils import parsedate_to_datetime
from pathlib import Path
from urllib.parse import urlparse
from urllib.request import Request, urlopen
import xml.etree.ElementTree as ET

ROOT = Path(__file__).resolve().parent.parent
SOURCES_FILE = ROOT / "content" / "veille-sources.json"
OUTPUT_FILE = ROOT / "content" / "veille.json"

MAX_PER_FEED = 10        # articles gardés par source
MAX_TOTAL = 90           # articles gardés au total
MAX_AGE_DAYS = 45        # on oublie les articles plus vieux que ça
SUMMARY_LENGTH = 240     # longueur max du résumé (caractères)
TIMEOUT = 20             # secondes par flux
MAX_BYTES = 5 * 1024 * 1024

USER_AGENT = ("Mozilla/5.0 (compatible; portfolio-veille/1.0; "
              "+https://github.com/Vanitas-B-MC)")


# ----------------------------------------------------------------- réseau

def fetch(url: str) -> bytes:
    request = Request(url, headers={
        "User-Agent": USER_AGENT,
        "Accept": "application/rss+xml, application/atom+xml, application/xml;q=0.9, text/xml;q=0.8, */*;q=0.5",
    })
    with urlopen(request, timeout=TIMEOUT) as response:
        data = response.read(MAX_BYTES + 1)
    if len(data) > MAX_BYTES:
        raise ValueError("flux trop volumineux")
    return data


# ---------------------------------------------------------------- analyse

def local(tag) -> str:
    """Nom d'une balise sans son espace de noms."""
    return tag.rsplit("}", 1)[-1] if isinstance(tag, str) else ""


def child_text(element, *names):
    for child in element:
        if local(child.tag) in names:
            text = "".join(child.itertext()).strip()
            if text:
                return text
    return ""


def entry_link(element) -> str:
    # Atom : <link rel="alternate" href="..."/>   |   RSS : <link>...</link>
    fallback = ""
    for child in element:
        if local(child.tag) != "link":
            continue
        href = child.get("href")
        if href:
            if child.get("rel") in (None, "", "alternate"):
                return href.strip()
            fallback = fallback or href.strip()
        elif (child.text or "").strip():
            return child.text.strip()
    return fallback


def parse_date(text: str):
    text = (text or "").strip()
    if not text:
        return None
    try:
        date = parsedate_to_datetime(text)          # RSS : « Fri, 13 Nov 2026 10:00:00 GMT »
    except (TypeError, ValueError, IndexError):
        try:
            date = datetime.fromisoformat(text.replace("Z", "+00:00"))   # Atom / Dublin Core
        except ValueError:
            return None
    if date.tzinfo is None:
        date = date.replace(tzinfo=timezone.utc)
    return date.astimezone(timezone.utc)


TAG_RE = re.compile(r"<[^>]+>")
SPACE_RE = re.compile(r"\s+")
BOILERPLATE = [
    re.compile(r"\s*The post .{0,200}? appeared first on .*$", re.I | re.S),
    re.compile(r"\s*Cet article .{0,200}? est apparu en premier sur .*$", re.I | re.S),
    re.compile(r"\s*(Lire la suite|Read more|Continue reading|Read the full article)\b.*$", re.I | re.S),
    re.compile(r"\s*\[\s*(…|\.\.\.)\s*\]\s*$"),
]


def clean_text(raw: str) -> str:
    text = re.sub(r"<(script|style)\b.*?</\1>", " ", raw or "", flags=re.I | re.S)
    text = TAG_RE.sub(" ", text)
    text = html.unescape(text)
    text = SPACE_RE.sub(" ", text).strip()
    for pattern in BOILERPLATE:
        text = pattern.sub("", text).strip()
    return text


def shorten(text: str, limit: int = SUMMARY_LENGTH) -> str:
    if len(text) <= limit:
        return text
    cut = text[:limit].rsplit(" ", 1)[0].rstrip(" ,;:.-–—")
    return cut + "…"


def safe_url(url: str) -> str:
    parsed = urlparse(url or "")
    return url if parsed.scheme in ("http", "https") and parsed.netloc else ""


def parse_feed(xml_bytes: bytes, source: dict) -> list:
    """Retourne la liste des articles d'un flux RSS 2.0, RSS 1.0 (RDF) ou Atom."""
    if b"<!ENTITY" in xml_bytes:       # protection contre les flux piégés
        raise ValueError("flux refusé (déclaration d'entité)")

    root = ET.fromstring(xml_bytes)
    entries = [el for el in root.iter() if local(el.tag) in ("item", "entry")]

    items = []
    for entry in entries:
        title = clean_text(child_text(entry, "title"))
        link = safe_url(entry_link(entry))
        if not title or not link:
            continue

        summary_raw = (child_text(entry, "description", "summary")
                       or child_text(entry, "encoded", "content"))
        summary = shorten(clean_text(summary_raw))
        if summary.lower().startswith(title.lower()[:60]) and len(summary) < len(title) + 20:
            summary = ""               # le résumé ne fait que répéter le titre

        published = parse_date(child_text(entry, "pubDate", "published", "updated", "date"))

        items.append({
            "id": child_text(entry, "guid", "id") or link,
            "title": title,
            "link": link,
            "summary": summary,
            "source": source["name"],
            "category": source.get("category", "Actualités"),
            "lang": source.get("lang", "fr"),
            "published": published.isoformat().replace("+00:00", "Z") if published else None,
        })
    return items


# ------------------------------------------------------------ assemblage

def load_json(path: Path, default):
    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except (OSError, ValueError):
        return default


def sort_key(item):
    return item.get("published") or "0000"


def build(sources: list, previous_items: list, fetcher=fetch, now=None):
    now = now or datetime.now(timezone.utc)
    oldest = (now - timedelta(days=MAX_AGE_DAYS)).isoformat().replace("+00:00", "Z")

    collected, status = [], {}
    for source in sources:
        name = source["name"]
        try:
            items = parse_feed(fetcher(source["url"]), source)
            items = sorted(items, key=sort_key, reverse=True)[:MAX_PER_FEED]
            status[name] = {"ok": True, "count": len(items)}
        except Exception as error:                      # un flux en panne n'arrête pas tout
            print(f"[veille] {name} : échec ({error})", file=sys.stderr)
            items = [i for i in previous_items if i.get("source") == name]
            status[name] = {"ok": False, "count": len(items), "error": str(error)[:120]}
        collected.extend(items)

    unique, seen = [], set()
    for item in sorted(collected, key=sort_key, reverse=True):
        key = item["link"]
        if key in seen:
            continue
        seen.add(key)
        # Un article sans date reçoit la date de première relève (maintenant)
        if not item.get("published"):
            previous = next((p for p in previous_items if p.get("link") == key and p.get("published")), None)
            item["published"] = previous["published"] if previous else now.isoformat().replace("+00:00", "Z")
        if item["published"] >= oldest:
            unique.append(item)

    unique.sort(key=sort_key, reverse=True)
    return unique[:MAX_TOTAL], status


def main() -> int:
    config = load_json(SOURCES_FILE, {"sources": []})
    sources = config.get("sources", [])
    if not sources:
        print("[veille] aucune source dans content/veille-sources.json", file=sys.stderr)
        return 1

    old = load_json(OUTPUT_FILE, {"updated": None, "items": []})
    items, status = build(sources, old.get("items", []))

    ok = sum(1 for s in status.values() if s["ok"])
    print(f"[veille] {ok}/{len(sources)} flux lus, {len(items)} articles.")
    if ok == 0:
        print("[veille] tous les flux ont échoué : fichier conservé tel quel.", file=sys.stderr)
        return 1

    if items == old.get("items"):
        print("[veille] rien de nouveau.")
        return 0

    result = {
        "updated": datetime.now(timezone.utc).isoformat(timespec="seconds").replace("+00:00", "Z"),
        "status": status,
        "items": items,
    }
    OUTPUT_FILE.write_text(json.dumps(result, ensure_ascii=False, indent=1) + "\n", encoding="utf-8")
    print(f"[veille] {OUTPUT_FILE.relative_to(ROOT)} mis à jour.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
