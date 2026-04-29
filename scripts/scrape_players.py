#!/usr/bin/env python3
"""
FC 26 Player Scraper  —  sofifa.com
=====================================
Scrapea jugadores de EA FC 26 desde SoFIFA y genera players.json
con el mismo formato que usa la app fc26-companion.

PREREQUISITOS:
  pip install requests beautifulsoup4 lxml cloudscraper

USO:
  python scripts/scrape_players.py                 # todos los jugadores
  python scripts/scrape_players.py --max 2000      # solo los 2000 primeros (por OVR)
  python scripts/scrape_players.py --resume        # continuar desde checkpoint
  python scripts/scrape_players.py --no-checkpoint # ignorar checkpoint anterior

NOTAS:
  - El scraping completo lleva ~2 horas (18 000 jugadores, 300+ páginas).
  - Se guarda checkpoint cada 10 páginas en tmp_scrape_checkpoint.json.
  - Si la sesión se interrumpe usa --resume para continuar.
"""

import argparse
import json
import random
import sys
import time
from pathlib import Path

import cloudscraper
from bs4 import BeautifulSoup

# --------------------------------------------------------------------------- #
# Configuración                                                                #
# --------------------------------------------------------------------------- #

OUTPUT_FILE     = Path(__file__).parent.parent / "players.json"
CHECKPOINT_FILE = Path(__file__).parent.parent / "tmp_scrape_checkpoint.json"

SOFIFA_BASE = "https://sofifa.com"

# Columnas en orden exacto que devuelve sofifa con estos showCol:
# td[0]=foto  td[1]=nombre/posiciones/nac  td[2]=edad  td[3]=overall
# td[4]=potencial  td[5]=club  td[6]=mejor_pos  td[7]=valor
# td[8]=pac  td[9]=sho  td[10]=pas  td[11]=dri  td[12]=def  td[13]=phy
LIST_URL_TPL = (
    SOFIFA_BASE + "/players"
    "?v=FC26"
    "&type[]=0"        # solo cartas base (gold regular) — excluye TOTS, TOTY, Icons, etc.
    "&showCol[]=oa"    # overall
    "&showCol[]=pt"    # potential
    "&showCol[]=ae"    # age
    "&showCol[]=bp"    # best position
    "&showCol[]=vl"    # market value
    "&showCol[]=pac"   # pace
    "&showCol[]=sho"   # shooting
    "&showCol[]=pas"   # passing
    "&showCol[]=dri"   # dribbling
    "&showCol[]=def"   # defending
    "&showCol[]=phy"   # physic
    "&offset={offset}"
)
PAGE_SIZE = 60
DELAY_MIN = 1.8
DELAY_MAX = 3.5

POSITION_MAP = {
    "GK":  "GK",
    "CB":  "CB",  "LCB": "CB",  "RCB": "CB",
    "LB":  "LB",  "LWB": "LWB",
    "RB":  "RB",  "RWB": "RWB",
    "CDM": "CDM", "DM":  "CDM",
    "CM":  "CM",  "LCM": "CM",  "RCM": "CM",
    "CAM": "CAM", "AM":  "CAM",
    "LM":  "LM",  "RM":  "RM",
    "LW":  "LW",  "LF":  "LW",
    "RW":  "RW",  "RF":  "RW",
    "ST":  "ST",  "LS":  "ST",  "RS": "ST",
    "CF":  "CF",
}

# --------------------------------------------------------------------------- #
# HTTP Session                                                                 #
# --------------------------------------------------------------------------- #

def make_session():
    s = cloudscraper.create_scraper(
        browser={"browser": "chrome", "platform": "windows", "mobile": False}
    )
    s.headers.update({
        "Accept-Language": "es-ES,es;q=0.9,en-US;q=0.8,en;q=0.7",
    })
    return s


def fetch_page(session, url, retries=3):
    for attempt in range(retries):
        try:
            resp = session.get(url, timeout=30)
            if resp.status_code == 429:
                wait = 45 + 30 * attempt
                print(f"    Rate-limited. Esperando {wait}s...")
                time.sleep(wait)
                continue
            if resp.status_code in (403, 503):
                if attempt < retries - 1:
                    wait = 20 + 15 * attempt
                    print(f"    Bloqueado ({resp.status_code}). Esperando {wait}s...")
                    time.sleep(wait)
                    continue
                print(f"    Acceso bloqueado ({resp.status_code}). Reintenta con --resume en unos minutos.")
                return None
            resp.raise_for_status()
            return resp.text
        except Exception as exc:
            if attempt == retries - 1:
                print(f"    ERROR: {exc}")
                return None
            time.sleep(6 * (attempt + 1))
    return None


# --------------------------------------------------------------------------- #
# Parsing                                                                      #
# --------------------------------------------------------------------------- #

def parse_int(text, default=0):
    """Extrae el PRIMER número del texto (evita concatenar '83+1' → 831)."""
    import re
    try:
        m = re.search(r'\d+', str(text).strip())
        return int(m.group()) if m else default
    except (ValueError, TypeError):
        return default


def parse_market_value(text):
    """'€90.5M' → 90_500_000.0  |  '€550K' → 550_000.0"""
    text = str(text).replace("€", "").replace(",", "").strip()
    try:
        if text.endswith("M"):
            return float(text[:-1]) * 1_000_000
        if text.endswith("K"):
            return float(text[:-1]) * 1_000
        return float(text)
    except (ValueError, TypeError):
        return 0.0


def normalize_position(pos):
    pos = str(pos).strip()
    return POSITION_MAP.get(pos, pos[:3].upper() if pos else "CM")


def build_positions_str(primary, extras):
    """Devuelve 'ST,CF,LW' sin duplicados, primary primero."""
    seen = []
    for p in [primary] + list(extras):
        mapped = normalize_position(p)
        if mapped and mapped not in seen:
            seen.append(mapped)
    return ",".join(seen) if seen else "CM"


def td_text(tds, idx):
    return tds[idx].get_text(strip=True) if idx < len(tds) else ""


def parse_player_row(row):
    """
    Estructura real de sofifa con los showCol del LIST_URL_TPL:
      td[0]  foto      (img data-src)
      td[1]  nombre    (a[data-tippy-content]) + flag imgs + span.pos badges
      td[2]  edad
      td[3]  overall
      td[4]  potential
      td[5]  club      (a[href=/team/...])
      td[6]  best pos  (texto plano)
      td[7]  valor     (€90.5M)
      td[8]  pace
      td[9]  shooting
      td[10] passing
      td[11] dribbling
      td[12] defending
      td[13] physic
      td[14] vacío
    """
    tds = row.find_all("td")
    if len(tds) < 8:
        return None

    # ── Foto ──────────────────────────────────────────────────────────────
    img = tds[0].find("img") if tds else None
    face_url = ""
    if img:
        src = img.get("data-src") or img.get("src") or ""
        # Descartar placeholders genéricos de sofifa
        if src and "player_0.png" not in src and "empty.png" not in src:
            face_url = src

    # ── Nombre ────────────────────────────────────────────────────────────
    name_td = tds[1]
    name_link = name_td.find("a", attrs={"data-tippy-content": True})
    if not name_link:
        return None
    # data-tippy-content tiene el nombre completo sin abreviar
    name = name_link.get("data-tippy-content") or name_link.get_text(strip=True)
    if not name:
        return None

    # ── Nacionalidad (primera bandera, no la "secondary") ─────────────────
    flag_imgs = name_td.find_all("img", class_="flag")
    nationality = flag_imgs[0].get("title", "") if flag_imgs else ""

    # ── Posiciones (span.pos dentro de td[1]) ─────────────────────────────
    pos_spans = name_td.find_all("span", class_=lambda c: c and "pos" in c.split())
    pos_texts = [s.get_text(strip=True) for s in pos_spans if s.get_text(strip=True)]

    # ── Stats numéricos por índice ────────────────────────────────────────
    age       = parse_int(td_text(tds, 2))
    overall   = parse_int(td_text(tds, 3))
    potential = parse_int(td_text(tds, 4)) or overall

    # ── Club ──────────────────────────────────────────────────────────────
    club_link = tds[5].find("a", href=lambda h: h and "/team/" in h) if len(tds) > 5 else None
    club = club_link.get_text(strip=True) if club_link else ""

    # ── Mejor posición ────────────────────────────────────────────────────
    best_pos = td_text(tds, 6)

    # ── Valor de mercado ──────────────────────────────────────────────────
    market_value = parse_market_value(td_text(tds, 7))

    # ── Stats ─────────────────────────────────────────────────────────────
    pace      = parse_int(td_text(tds, 8))
    shooting  = parse_int(td_text(tds, 9))
    passing   = parse_int(td_text(tds, 10))
    dribbling = parse_int(td_text(tds, 11))
    defending = parse_int(td_text(tds, 12))
    physic    = parse_int(td_text(tds, 13))

    if overall == 0:
        return None

    primary = best_pos or (pos_texts[0] if pos_texts else "CM")
    primary_norm = normalize_position(primary)
    positions_str = build_positions_str(primary, pos_texts)

    return {
        "name":        name,
        "overall":     overall,
        "potential":   potential,
        "age":         age,
        "position":    primary_norm,
        "positions":   positions_str,
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


def parse_list_page(html):
    soup = BeautifulSoup(html, "lxml")
    players = []

    table = soup.find("table")
    if not table:
        if "captcha" in html.lower():
            print("    AVISO: Posible captcha detectado.")
        return players

    tbody = table.find("tbody")
    if not tbody:
        return players

    for tr in tbody.find_all("tr"):
        try:
            p = parse_player_row(tr)
            if p:
                players.append(p)
        except Exception:
            continue

    return players


def has_next_page(html):
    soup = BeautifulSoup(html, "lxml")
    # sofifa muestra botón Next deshabilitado en la última página
    disabled = soup.find("a", attrs={"aria-disabled": "true"})
    if disabled and "next" in disabled.get_text(strip=True).lower():
        return False
    # Si la tabla no tiene filas tampoco hay más
    table = soup.find("table")
    if not table or not table.find("tbody") or not table.find("tbody").find("tr"):
        return False
    return True


# --------------------------------------------------------------------------- #
# Checkpoint                                                                   #
# --------------------------------------------------------------------------- #

def load_checkpoint():
    if CHECKPOINT_FILE.exists():
        try:
            with open(CHECKPOINT_FILE, "r", encoding="utf-8") as f:
                return json.load(f)
        except Exception:
            pass
    return {"offset": 0, "players": []}


def save_checkpoint(offset, players):
    with open(CHECKPOINT_FILE, "w", encoding="utf-8") as f:
        json.dump({"offset": offset, "players": players}, f, ensure_ascii=False)


def clear_checkpoint():
    if CHECKPOINT_FILE.exists():
        CHECKPOINT_FILE.unlink()


# --------------------------------------------------------------------------- #
# Bucle principal                                                              #
# --------------------------------------------------------------------------- #

def scrape(session, max_players=None, resume=False):
    state   = load_checkpoint() if resume else {"offset": 0, "players": []}
    offset  = state["offset"]
    players = list(state["players"])

    if resume and players:
        print(f"[>] Reanudando desde offset={offset} ({len(players)} jugadores guardados).")

    consecutive_empty = 0

    while True:
        if max_players and len(players) >= max_players:
            print(f"    Límite de {max_players} jugadores alcanzado.")
            break

        url = LIST_URL_TPL.format(offset=offset)
        print(f"[>] offset={offset:>6}  |  total={len(players):>5}", end="", flush=True)

        html = fetch_page(session, url)
        if html is None:
            print("  ← ERROR. Checkpoint guardado.")
            save_checkpoint(offset, players)
            break

        page_players = parse_list_page(html)

        if not page_players:
            consecutive_empty += 1
            print("  ← sin jugadores.")
            if consecutive_empty >= 2 or not has_next_page(html):
                print("    Fin del listado.")
                break
        else:
            consecutive_empty = 0
            players.extend(page_players)
            print(f"  +{len(page_players)}")

        offset += PAGE_SIZE

        if (offset // PAGE_SIZE) % 10 == 0:
            save_checkpoint(offset, players)

        time.sleep(random.uniform(DELAY_MIN, DELAY_MAX))

    return players


# --------------------------------------------------------------------------- #
# Main                                                                         #
# --------------------------------------------------------------------------- #

def main():
    parser = argparse.ArgumentParser(description="FC 26 scraper → players.json")
    parser.add_argument("--max", type=int, default=None, metavar="N",
                        help="Máximo de jugadores (default: todos)")
    parser.add_argument("--resume", action="store_true",
                        help="Continuar desde checkpoint")
    parser.add_argument("--no-checkpoint", action="store_true",
                        help="Borrar checkpoint y empezar desde cero")
    args = parser.parse_args()

    if args.no_checkpoint and CHECKPOINT_FILE.exists():
        CHECKPOINT_FILE.unlink()
        print("[>] Checkpoint eliminado.")

    session = make_session()

    # Warm-up: establece cookies y verifica que el sitio responde
    print("[>] Conectando con sofifa.com...")
    warmup_url = LIST_URL_TPL.format(offset=0)
    warmup_html = fetch_page(session, warmup_url)
    if not warmup_html:
        print("ERROR: No se pudo conectar con sofifa.com")
        sys.exit(1)

    warmup_players = parse_list_page(warmup_html)
    print(f"    OK. Primera página: {len(warmup_players)} jugadores.")

    if not warmup_players:
        print("ERROR: Parser no encontró jugadores. El formato de la página puede haber cambiado.")
        sys.exit(1)

    # Guardar primera página y continuar desde offset=60
    if not args.resume:
        save_checkpoint(PAGE_SIZE, warmup_players)

    time.sleep(random.uniform(1.5, 2.5))

    players = scrape(session, max_players=args.max, resume=True)

    if not players:
        print("ERROR: No se obtuvo ningún jugador.")
        sys.exit(1)

    # Filtrar: solo jugadores con club (descarta íconos/promos sin equipo)
    players = [p for p in players if p.get("club", "").strip()]

    # Ordenar desc y deduplicar por nombre → queda solo la carta con OVR más alto
    players.sort(key=lambda p: p["overall"], reverse=True)
    seen, unique = set(), []
    for p in players:
        key = p["name"].lower()
        if key not in seen:
            seen.add(key)
            unique.append(p)
    players = unique

    with open(OUTPUT_FILE, "w", encoding="utf-8") as f:
        json.dump(players, f, ensure_ascii=False, separators=(",", ":"))

    size_kb = OUTPUT_FILE.stat().st_size / 1024
    print()
    print(f"[OK] {OUTPUT_FILE.name}  →  {len(players)} jugadores  ({round(size_kb)} KB)")
    print()
    print("Próximos pasos:")
    print("  1. git add players.json; git commit -m 'update players fc26'; git push")
    print("  2. En la app: Scouting → 'Actualizar BD'")

    clear_checkpoint()


if __name__ == "__main__":
    main()
