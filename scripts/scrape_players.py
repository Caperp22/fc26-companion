#!/usr/bin/env python3
"""
FC 26 Player Scraper  —  sofifa.com
=====================================
Scrapea jugadores de EA FC 26 desde SoFIFA y genera players.json
con el mismo formato que usa la app fc26-companion.

PREREQUISITOS:
  pip install requests beautifulsoup4 lxml

USO:
  python scripts/scrape_players.py                 # todos los jugadores
  python scripts/scrape_players.py --max 2000      # solo los 2000 primeros (por OVR)
  python scripts/scrape_players.py --resume        # continuar desde checkpoint
  python scripts/scrape_players.py --no-checkpoint # ignorar checkpoint anterior

NOTAS:
  - El scraping completo lleva ~2 horas (18 000 jugadores, 300+ páginas).
  - Se guarda un checkpoint cada 10 páginas en tmp_scrape_checkpoint.json.
  - Si la sesión se interrumpe usa --resume para continuar.
  - sofifa.com puede pedir verificación captcha en IPs que hacen muchas peticiones.
    Si sucede, espera unos minutos y vuelve a ejecutar con --resume.
"""

import argparse
import json
import random
import sys
import time
from pathlib import Path

import requests
from bs4 import BeautifulSoup

# --------------------------------------------------------------------------- #
# Configuración                                                                #
# --------------------------------------------------------------------------- #

OUTPUT_FILE     = Path(__file__).parent.parent / "players.json"
CHECKPOINT_FILE = Path(__file__).parent.parent / "tmp_scrape_checkpoint.json"

SOFIFA_BASE = "https://sofifa.com"
LIST_URL_TPL = (
    SOFIFA_BASE + "/players"
    "?v=FC26"
    "&showCol[]=oa"   # overall
    "&showCol[]=pt"   # potential
    "&showCol[]=ae"   # age
    "&showCol[]=bp"   # best position
    "&showCol[]=vl"   # market value
    "&showCol[]=wg"   # wage
    "&showCol[]=pac"  # pace
    "&showCol[]=sho"  # shooting
    "&showCol[]=pas"  # passing
    "&showCol[]=dri"  # dribbling
    "&showCol[]=def"  # defending
    "&showCol[]=phy"  # physic
    "&offset={offset}"
)
PAGE_SIZE  = 60
DELAY_MIN  = 1.8   # segundos mínimos entre peticiones
DELAY_MAX  = 3.5   # segundos máximos entre peticiones

POSITION_MAP = {
    "GK": "GK",
    "CB": "CB",  "LCB": "CB",  "RCB": "CB",
    "LB": "LB",  "LWB": "LWB",
    "RB": "RB",  "RWB": "RWB",
    "CDM": "CDM", "DM": "CDM",
    "CM": "CM",  "LCM": "CM",  "RCM": "CM",
    "CAM": "CAM", "AM": "CAM",
    "LM": "LM",  "RM": "RM",
    "LW": "LW",  "LF": "LW",
    "RW": "RW",  "RF": "RW",
    "ST": "ST",  "LS": "ST",   "RS": "ST",
    "CF": "CF",
}

# --------------------------------------------------------------------------- #
# HTTP Session                                                                 #
# --------------------------------------------------------------------------- #

def make_session():
    s = requests.Session()
    s.headers.update({
        "User-Agent": (
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
            "AppleWebKit/537.36 (KHTML, like Gecko) "
            "Chrome/124.0.0.0 Safari/537.36"
        ),
        "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8",
        "Accept-Language": "es-ES,es;q=0.9,en-US;q=0.8,en;q=0.7",
        "Accept-Encoding": "gzip, deflate, br",
        "Connection": "keep-alive",
        "Upgrade-Insecure-Requests": "1",
        "Sec-Fetch-Dest": "document",
        "Sec-Fetch-Mode": "navigate",
        "Sec-Fetch-Site": "none",
    })
    return s


def fetch_page(session, url, retries=3):
    for attempt in range(retries):
        try:
            resp = session.get(url, timeout=25)
            if resp.status_code == 429:
                wait = 45 + 30 * attempt
                print(f"    Rate-limited (429). Esperando {wait}s...")
                time.sleep(wait)
                continue
            if resp.status_code == 403:
                print("    Acceso bloqueado (403). Usa --resume tras unos minutos.")
                return None
            resp.raise_for_status()
            return resp.text
        except requests.RequestException as exc:
            if attempt == retries - 1:
                print(f"    ERROR tras {retries} intentos: {exc}")
                return None
            time.sleep(6 * (attempt + 1))
    return None


# --------------------------------------------------------------------------- #
# Parsing                                                                      #
# --------------------------------------------------------------------------- #

def parse_int(text, default=0):
    try:
        cleaned = str(text).strip().replace(",", "").replace(".", "")
        # quitar caracteres no numéricos (ej. sufijos raros)
        digits = "".join(c for c in cleaned if c.isdigit() or c == "-")
        return int(digits) if digits else default
    except (ValueError, TypeError):
        return default


def parse_market_value(text):
    """'€90.5M' → 90_500_000.0  |  '€550K' → 550_000.0"""
    if not text:
        return 0.0
    text = text.replace("€", "").replace(",", "").strip()
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


def build_positions_str(primary, extra_list):
    """Devuelve 'ST,CF,LW' sin duplicados, primary primero."""
    seen = []
    for p in [primary] + extra_list:
        mapped = normalize_position(p)
        if mapped and mapped not in seen:
            seen.append(mapped)
    return ",".join(seen) if seen else "CM"


def col_text(row, col_class):
    td = row.find("td", class_=lambda c: c and col_class in c.split())
    return td.get_text(strip=True) if td else ""


def col_int(row, col_class):
    return parse_int(col_text(row, col_class))


def parse_player_row(row):
    """Extrae un dict de jugador de un <tr> de la tabla de sofifa."""

    # ── Foto ──────────────────────────────────────────────────────────────
    img = row.find("img")
    face_url = ""
    if img:
        face_url = img.get("data-src") or img.get("src") or ""
        # Descartar placeholders internos
        if "avatar" in face_url or "default" in face_url:
            face_url = ""

    # ── Nombre y URL del perfil ───────────────────────────────────────────
    # sofifa: la celda de nombre tiene clase "col-name"
    name_td = row.find("td", class_=lambda c: c and "col-name" in c.split())
    if not name_td:
        return None

    name_link = name_td.find("a", href=lambda h: h and "/player/" in h)
    if not name_link:
        return None
    name = name_link.get_text(strip=True)

    # ── Posiciones (badges dentro de la celda de nombre) ─────────────────
    pos_links = name_td.find_all("a", href=lambda h: h and "position=" in (h or ""))
    pos_texts = [a.get_text(strip=True) for a in pos_links if a.get_text(strip=True)]

    # ── Nacionalidad (flag img) ───────────────────────────────────────────
    flag_img = name_td.find("img", class_=lambda c: c and "flag" in (c or ""))
    if not flag_img:
        # A veces el flag está en otra celda
        flag_img = row.find("img", attrs={"title": True, "class": lambda c: c and "flag" in (c or "")})
    nationality = ""
    if flag_img:
        nationality = flag_img.get("title") or flag_img.get("alt") or ""

    # ── Club y liga ───────────────────────────────────────────────────────
    club = ""
    league = ""
    # La celda de equipo contiene links a /team/ y a /league/
    for td in row.find_all("td"):
        for a in td.find_all("a", href=True):
            href = a["href"]
            if "/team/" in href and not club:
                club = a.get_text(strip=True)
            elif "/league/" in href and not league:
                league = a.get_text(strip=True)

    # ── Stats numéricos ───────────────────────────────────────────────────
    overall   = col_int(row, "col-oa")
    potential = col_int(row, "col-pt") or overall
    age       = col_int(row, "col-ae")
    pace      = col_int(row, "col-pac")
    shooting  = col_int(row, "col-sho")
    passing   = col_int(row, "col-pas")
    dribbling = col_int(row, "col-dri")
    defending = col_int(row, "col-def")
    physic    = col_int(row, "col-phy")

    # ── Valor de mercado ──────────────────────────────────────────────────
    market_value = parse_market_value(col_text(row, "col-vl"))

    # ── Mejor posición ────────────────────────────────────────────────────
    best_pos = col_text(row, "col-bp")
    if not best_pos and pos_texts:
        best_pos = pos_texts[0]

    primary_normalized = normalize_position(best_pos) if best_pos else "CM"
    positions_str = build_positions_str(best_pos, pos_texts)

    if not name or overall == 0:
        return None

    return {
        "name":        name,
        "overall":     overall,
        "potential":   potential,
        "age":         age,
        "position":    primary_normalized,
        "positions":   positions_str,
        "marketValue": market_value,
        "club":        club,
        "league":      league,
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
        # Verificar si hay captcha / bloqueo
        if "captcha" in html.lower() or "verify" in html.lower():
            print("    AVISO: Posible captcha detectado en la respuesta.")
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


def detect_last_page(html):
    """Devuelve True si la paginación indica que no hay más páginas."""
    soup = BeautifulSoup(html, "lxml")
    # sofifa tiene un botón "next" deshabilitado en la última página
    next_btn = soup.find("a", class_=lambda c: c and "next" in (c or "").lower())
    if next_btn and next_btn.get("aria-disabled") == "true":
        return True
    # Si la tabla está vacía ya se detectó en parse_list_page
    return False


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
    state  = load_checkpoint() if resume else {"offset": 0, "players": []}
    offset = state["offset"]
    players = list(state["players"])

    if resume and players:
        print(f"[>] Reanudando: offset={offset}, {len(players)} jugadores ya guardados.")

    consecutive_empty = 0

    while True:
        if max_players and len(players) >= max_players:
            print(f"    Límite de {max_players} jugadores alcanzado.")
            break

        url = LIST_URL_TPL.format(offset=offset)
        print(f"[>] offset={offset:>6}  |  acumulado={len(players):>5} jugadores", end="", flush=True)

        html = fetch_page(session, url)
        if html is None:
            print("  ← ERROR. Guardando checkpoint...")
            save_checkpoint(offset, players)
            break

        page_players = parse_list_page(html)
        if not page_players:
            consecutive_empty += 1
            print("  ← sin jugadores.")
            if consecutive_empty >= 2 or detect_last_page(html):
                print("    Fin del listado.")
                break
        else:
            consecutive_empty = 0
            players.extend(page_players)
            print(f"  +{len(page_players)}")

        offset += PAGE_SIZE

        # Checkpoint cada 10 páginas
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
                        help="Ignorar y borrar checkpoint anterior")
    args = parser.parse_args()

    if args.no_checkpoint and CHECKPOINT_FILE.exists():
        CHECKPOINT_FILE.unlink()
        print("[>] Checkpoint eliminado.")

    session = make_session()

    # Petición inicial para obtener cookies de sesión
    print("[>] Conectando con sofifa.com...")
    warmup = fetch_page(session, SOFIFA_BASE + "/players?v=FC26")
    if not warmup:
        print("ERROR: No se pudo conectar. Comprueba tu conexión o usa una VPN.")
        sys.exit(1)
    players_on_warmup = parse_list_page(warmup)
    print(f"    Conexión OK. Primera página: {len(players_on_warmup)} jugadores.")
    time.sleep(random.uniform(1.5, 2.5))

    # Si no se reanuda, guardar la primera página en checkpoint y continuar
    if not args.resume:
        save_checkpoint(PAGE_SIZE, players_on_warmup)

    players = scrape(session, max_players=args.max, resume=True)

    if not players:
        print("ERROR: No se obtuvo ningún jugador.")
        sys.exit(1)

    # Ordenar por overall desc
    players.sort(key=lambda p: p["overall"], reverse=True)

    # Eliminar duplicados por nombre + overall (por si hay solapamiento de páginas)
    seen_keys = set()
    unique = []
    for p in players:
        key = (p["name"].lower(), p["overall"])
        if key not in seen_keys:
            seen_keys.add(key)
            unique.append(p)
    players = unique

    with open(OUTPUT_FILE, "w", encoding="utf-8") as f:
        json.dump(players, f, ensure_ascii=False, separators=(",", ":"))

    size_kb = OUTPUT_FILE.stat().st_size / 1024
    print()
    print(f"[OK] {OUTPUT_FILE.name}  →  {len(players)} jugadores  ({round(size_kb)} KB)")
    print()
    print("Próximos pasos:")
    print("  1. git add players.json && git commit -m 'update players fc26' && git push")
    print("  2. En la app: pantalla Scouting → 'Actualizar BD'")

    clear_checkpoint()


if __name__ == "__main__":
    main()
