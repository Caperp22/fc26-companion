#!/usr/bin/env python3
"""
FC 26 Player Scraper — fifaindex.com
=====================================
Descarga jugadores desde fifaindex.com y los fusiona con players.json existente.

Modo por defecto (complemento): solo descarga la ficha completa de los jugadores
que NO están ya en players.json. Ideal para completar los que falta sofifa.

PREREQUISITOS:
  pip install cloudscraper beautifulsoup4 lxml

USO:
  python scripts/scrape_fifaindex.py              # solo los que faltan en players.json
  python scripts/scrape_fifaindex.py --full       # todos (muy lento, ~18k fichas)
  python scripts/scrape_fifaindex.py --debug-list # muestra HTML de la primera página
  python scripts/scrape_fifaindex.py --debug-detail <url> # muestra HTML de una ficha
"""

import argparse
import json
import re
import sys
import time
import random
from pathlib import Path

import cloudscraper
from bs4 import BeautifulSoup

# --------------------------------------------------------------------------- #
# Configuración                                                                #
# --------------------------------------------------------------------------- #

OUTPUT_FILE = Path(__file__).parent.parent / "players.json"

BASE_URL  = "https://fifaindex.com"
LIST_URL  = BASE_URL + "/players/?r=26&order=-rating&page={page}"

DELAY_MIN = 2.2
DELAY_MAX = 4.5

POSITION_MAP = {
    "GK": "GK",
    "CB": "CB", "LCB": "CB", "RCB": "CB",
    "LB": "LB", "LWB": "LWB",
    "RB": "RB", "RWB": "RWB",
    "CDM": "CDM", "DM": "CDM",
    "CM": "CM", "LCM": "CM", "RCM": "CM",
    "CAM": "CAM", "AM": "CAM",
    "LM": "LM", "RM": "RM",
    "LW": "LW", "LF": "LW",
    "RW": "RW", "RF": "RW",
    "ST": "ST", "LS": "ST", "RS": "ST", "CF": "CF",
}

def norm_pos(p):
    return POSITION_MAP.get(p.strip().upper(), p.strip().upper()[:3] if p.strip() else "CM")

# --------------------------------------------------------------------------- #
# HTTP                                                                         #
# --------------------------------------------------------------------------- #

def make_session():
    s = cloudscraper.create_scraper(
        browser={"browser": "chrome", "platform": "windows", "mobile": False}
    )
    s.headers.update({"Accept-Language": "es-ES,es;q=0.9,en;q=0.8"})
    return s

def fetch(session, url, retries=3):
    for attempt in range(retries):
        try:
            r = session.get(url, timeout=30)
            if r.status_code == 429:
                wait = 60 + 30 * attempt
                print(f"    Rate-limited. Esperando {wait}s...")
                time.sleep(wait)
                continue
            if r.status_code in (403, 503):
                wait = 25 + 20 * attempt
                print(f"    Bloqueado ({r.status_code}). Esperando {wait}s...")
                time.sleep(wait)
                continue
            r.raise_for_status()
            return r.text
        except Exception as e:
            if attempt == retries - 1:
                print(f"    ERROR: {e}")
                return None
            time.sleep(8 * (attempt + 1))
    return None

# --------------------------------------------------------------------------- #
# Parseo del listado                                                           #
# --------------------------------------------------------------------------- #

def parse_listing(html):
    """
    Extrae lista de {id, name, position, overall, faceUrl, href} de la página de listado.
    La estructura es: div.flex.items-center con un <a> interno + spans para pos y OVR.
    """
    soup = BeautifulSoup(html, "lxml")
    results = []

    # Cada fila es un div que contiene un enlace a /players/ID-slug
    for link in soup.find_all("a", href=re.compile(r"^/players/\d+")):
        href = link.get("href", "")
        m = re.search(r"/players/(\d+)", href)
        if not m:
            continue
        player_id = m.group(1)

        # Nombre: span con 'truncate' dentro del link
        name_span = link.find("span", class_=lambda c: c and "truncate" in c)
        if not name_span:
            continue
        name = name_span.get_text(strip=True)
        if not name:
            continue

        # Foto
        img = link.find("img")
        face_url = ""
        if img:
            face_url = img.get("src") or img.get("data-src") or \
                       f"https://images.fifaindex.com/fc26/players/{player_id}.png"

        # Spans fuera del link (posición y OVR) — son hermanos del link en el div padre
        row = link.parent
        if not row:
            continue
        link_span_ids = {id(s) for s in link.find_all("span")}
        outer_spans = [s for s in row.find_all("span") if id(s) not in link_span_ids]

        position = outer_spans[-2].get_text(strip=True) if len(outer_spans) >= 2 else ""
        try:
            overall = int(outer_spans[-1].get_text(strip=True))
        except (ValueError, IndexError):
            overall = 0

        if overall == 0:
            continue

        results.append({
            "id":       player_id,
            "name":     name,
            "position": norm_pos(position) if position else "CM",
            "overall":  overall,
            "faceUrl":  face_url,
            "href":     href,
        })

    return results

def has_next_page(html, current_page):
    """Devuelve True si hay una página siguiente."""
    soup = BeautifulSoup(html, "lxml")
    # Buscar link a la página siguiente
    next_link = soup.find("a", href=re.compile(rf"page={current_page + 1}"))
    if next_link:
        return True
    # También chequeamos si hay contenido útil (>=10 jugadores)
    players = parse_listing(html)
    return len(players) >= 10

# --------------------------------------------------------------------------- #
# Parseo de la ficha individual                                                #
# --------------------------------------------------------------------------- #

def parse_int_safe(text, default=0):
    m = re.search(r"\d+", str(text).strip())
    return int(m.group()) if m else default

def parse_market_value(text):
    text = str(text).replace("€", "").replace(",", "").strip()
    try:
        if text.endswith("M"): return float(text[:-1]) * 1_000_000
        if text.endswith("K"): return float(text[:-1]) * 1_000
        return float(text) if text else 0.0
    except (ValueError, TypeError):
        return 0.0

def parse_detail(html, basic):
    """
    Extrae datos completos de la ficha de un jugador.
    basic: {id, name, position, overall, faceUrl, href}
    Devuelve dict con el formato de players.json, o None si falla.
    """
    soup = BeautifulSoup(html, "lxml")
    page_text = soup.get_text()

    # ── Nombre completo ─────────────────────────────────────────────────────
    name = basic["name"]
    h1 = soup.find("h1")
    if h1:
        candidate = h1.get_text(strip=True)
        if len(candidate) > 2:
            name = candidate

    # ── Edad ────────────────────────────────────────────────────────────────
    age = 25
    age_m = re.search(r'(\d{1,2})\s*y\.o\.', page_text)
    if age_m:
        age = int(age_m.group(1))

    # ── Stats: formato "69PAC76SHO66PAS73DRI36DEF77PHY" ────────────────────
    stat_m = re.search(
        r'(\d+)PAC(\d+)SHO(\d+)PAS(\d+)DRI(\d+)DEF(\d+)PHY',
        page_text
    )
    if stat_m:
        pace, shooting, passing, dribbling, defending, physic = (
            int(stat_m.group(i)) for i in range(1, 7)
        )
    else:
        pace = shooting = passing = dribbling = defending = physic = 0

    # ── Potencial: "82↘77Potential" → tomar segundo número ─────────────────
    potential = basic["overall"]
    pot_m = re.search(r'\d+\D(\d+)Potential', page_text)
    if pot_m:
        potential = int(pot_m.group(1))

    # ── Club: primer link /teams/\d+- con texto real ────────────────────────
    club = ""
    for a in soup.find_all("a", href=re.compile(r"/teams/\d+")):
        text = a.get_text(strip=True)
        if text and text.lower() not in ("teams", ""):
            club = text
            break

    # ── Nacionalidad: primer link /nations/\d+- con texto real ─────────────
    nationality = ""
    for a in soup.find_all("a", href=re.compile(r"/nations/\d+")):
        img = a.find("img")
        text = img.get("alt", "").strip() if img else a.get_text(strip=True)
        if not text:
            text = a.get_text(strip=True)
        if text and text.lower() not in ("nations", ""):
            nationality = text
            break

    # ── Valor de mercado ────────────────────────────────────────────────────
    market_value = 0.0
    val_m = re.search(r'€\s*([\d,.]+)\s*([MK]?)', page_text)
    if val_m:
        market_value = parse_market_value("€" + val_m.group(1) + val_m.group(2))

    # ── Posiciones alternativas ─────────────────────────────────────────────
    positions_list = [basic["position"]]
    for span in soup.find_all("span"):
        t = span.get_text(strip=True)
        if t in POSITION_MAP:
            normed = norm_pos(t)
            if normed not in positions_list:
                positions_list.append(normed)

    # ── Foto ────────────────────────────────────────────────────────────────
    face_url = f"https://images.fifaindex.com/fc26/players/{basic['id']}.webp"

    return {
        "name":        name,
        "overall":     basic["overall"],
        "potential":   potential,
        "age":         age,
        "position":    basic["position"],
        "positions":   ",".join(positions_list),
        "marketValue": market_value,
        "club":        club,
        "league":      "",
        "nationality": nationality,
        "faceUrl":     face_url,
        "pace":        pace,
        "shooting":    shooting,
        "passing":     passing,
        "dribbling":   dribbling,
        "defending":   defending,
        "physic":      physic,
    }

# --------------------------------------------------------------------------- #
# Main                                                                         #
# --------------------------------------------------------------------------- #

def load_existing():
    if OUTPUT_FILE.exists():
        with open(OUTPUT_FILE, "r", encoding="utf-8") as f:
            return json.load(f)
    return []

def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--full", action="store_true",
                        help="Descargar todos los jugadores (muy lento)")
    parser.add_argument("--debug-list", action="store_true",
                        help="Guardar HTML del listado en debug_list.html y salir")
    parser.add_argument("--debug-detail", metavar="URL",
                        help="Guardar HTML de una ficha en debug_detail.html y salir")
    parser.add_argument("--max-new", type=int, default=None,
                        help="Máximo de jugadores nuevos a descargar")
    args = parser.parse_args()

    session = make_session()

    # ── Modo debug ──────────────────────────────────────────────────────────
    if args.debug_list:
        url = LIST_URL.format(page=1)
        print(f"Fetching {url} ...")
        html = fetch(session, url)
        if html:
            Path("debug_list.html").write_text(html, encoding="utf-8")
            players = parse_listing(html)
            print(f"Jugadores parseados: {len(players)}")
            for p in players[:10]:
                print(f"  {p}")
        sys.exit(0)

    if args.debug_detail:
        url = args.debug_detail
        if not url.startswith("http"):
            url = BASE_URL + url
        print(f"Fetching {url} ...")
        html = fetch(session, url)
        if html:
            Path("debug_detail.html").write_text(html, encoding="utf-8")
            print("Guardado en debug_detail.html")
        sys.exit(0)

    # ── Cargar jugadores existentes ──────────────────────────────────────────
    existing = load_existing()
    existing_names = {p["name"].lower() for p in existing}
    print(f"[>] players.json actual: {len(existing)} jugadores")

    if args.full:
        print("[>] Modo FULL: se descargarán fichas de todos los jugadores")
        known_names = set()
    else:
        known_names = existing_names
        print(f"[>] Modo COMPLEMENTO: se omitirán los {len(known_names)} ya conocidos")

    # ── Fase 1: recorrer listado y detectar jugadores nuevos ─────────────────
    print("\n[Fase 1] Recorriendo listado para detectar jugadores nuevos...")
    to_fetch = []          # lista de basic dicts a descargar en detalle
    seen_in_listing = set()
    page = 1
    consec_no_new = 0

    while True:
        url = LIST_URL.format(page=page)
        print(f"  Página {page:>4}  |  pendientes={len(to_fetch):>4}", end="", flush=True)
        html = fetch(session, url)
        if html is None:
            print("  ← ERROR")
            break

        players = parse_listing(html)
        if not players:
            print("  ← sin jugadores (posible fin)")
            break

        new_in_page = 0
        for p in players:
            key = p["name"].lower()
            if key in seen_in_listing:
                continue
            seen_in_listing.add(key)
            if key not in known_names:
                to_fetch.append(p)
                new_in_page += 1

        print(f"  +{new_in_page} nuevos  (página: {len(players)})")

        if new_in_page == 0:
            consec_no_new += 1
            if consec_no_new >= 4:
                print("  4 páginas sin nuevos → fin del listado.")
                break
        else:
            consec_no_new = 0

        if args.max_new and len(to_fetch) >= args.max_new:
            to_fetch = to_fetch[:args.max_new]
            print(f"  Límite de {args.max_new} jugadores nuevos alcanzado.")
            break

        if not has_next_page(html, page):
            print("  No hay página siguiente → fin.")
            break

        page += 1
        time.sleep(random.uniform(DELAY_MIN, DELAY_MAX))

    if not to_fetch:
        print("\n[OK] No hay jugadores nuevos que descargar. players.json está completo.")
        return

    print(f"\n[Fase 2] Descargando ficha de {len(to_fetch)} jugadores nuevos...")

    new_players = []
    errors = []

    for i, basic in enumerate(to_fetch):
        detail_url = BASE_URL + basic["href"] + "?r=26"
        print(f"  [{i+1:>4}/{len(to_fetch)}] {basic['name']:35} OVR={basic['overall']}", end="", flush=True)

        html = fetch(session, detail_url)
        if html is None:
            print("  ← ERROR (omitido)")
            errors.append(basic["name"])
            continue

        player = parse_detail(html, basic)
        if player:
            new_players.append(player)
            club_str = f"  {player['club']}" if player['club'] else "  (sin club)"
            stats_str = f"  PAC={player['pace']} SHO={player['shooting']} PAS={player['passing']}"
            print(f"  OK{club_str}{stats_str}")
        else:
            print("  ← parse fallido")
            errors.append(basic["name"])

        time.sleep(random.uniform(DELAY_MIN, DELAY_MAX))

    # ── Fusionar y guardar ───────────────────────────────────────────────────
    print(f"\n[>] Fusionando: {len(existing)} existentes + {len(new_players)} nuevos")

    merged = existing + new_players
    # Filtrar sin club, dedup por nombre (mayor OVR primero)
    merged = [p for p in merged if p.get("club", "").strip()]
    merged.sort(key=lambda p: p["overall"], reverse=True)
    seen, unique = set(), []
    for p in merged:
        k = p["name"].lower()
        if k not in seen:
            seen.add(k)
            unique.append(p)

    with open(OUTPUT_FILE, "w", encoding="utf-8") as f:
        json.dump(unique, f, ensure_ascii=False, separators=(",", ":"))

    size_kb = OUTPUT_FILE.stat().st_size // 1024
    print(f"\n[OK] {OUTPUT_FILE.name}  ->  {len(unique)} jugadores  ({size_kb} KB)")
    if errors:
        print(f"     {len(errors)} errores: {', '.join(errors[:5])}" +
              (f" ... y {len(errors)-5} más" if len(errors) > 5 else ""))
    print("\nPróximos pasos:")
    print("  1. git add players.json && git commit -m 'players: +fifaindex' && git push")
    print("  2. En la app: Pizarra → 'Actualizar BD'")

if __name__ == "__main__":
    main()
