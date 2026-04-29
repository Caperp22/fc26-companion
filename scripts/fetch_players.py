#!/usr/bin/env python3
"""
FC 26 Player Data Fetcher
=========================
Descarga el dataset de jugadores de FC 26 desde Kaggle y genera
el archivo players.json compatible con la app fc26-companion.

PREREQUISITOS:
  pip install -r scripts/requirements.txt

USO (automatico - descarga desde Kaggle):
  export KAGGLE_USERNAME=tu_usuario
  export KAGGLE_KEY=tu_api_key
  python scripts/fetch_players.py

USO (manual - si ya tienes el CSV descargado):
  python scripts/fetch_players.py --local ruta/al/archivo.csv

OBTENER CREDENCIALES DE KAGGLE:
  1. Ve a https://www.kaggle.com/ -> tu perfil -> Settings -> API
  2. Clic en "Create New Token" -> descarga kaggle.json
  3. Copia username y key de ese archivo
"""

import argparse
import json
import os
import sys
from pathlib import Path

import pandas as pd
from kaggle import KaggleApi

# --------------------------------------------------------------------------- #
# Configuracion                                                                #
# --------------------------------------------------------------------------- #

KAGGLE_DATASET = "rovnez/fc-26-fifa-26-player-data"

KAGGLE_FALLBACKS = [
    "flynn28/eafc26-player-database",
    "talhademirezen/fc-26-player-stats",
]

OUTPUT_FILE = Path(__file__).parent.parent / "players.json"
TMP_DIR = Path(__file__).parent.parent / "tmp_kaggle"

# Columnas de identidad
NAME_COLS         = ["short_name", "name", "Name", "player_name", "Player"]
OVERALL_COLS      = ["overall", "Overall", "OVA", "ova", "Rating"]
POTENTIAL_COLS    = ["potential", "Potential", "POT", "pot"]
AGE_COLS          = ["age", "Age"]
POSITION_COLS     = ["player_positions", "positions", "Position", "position", "BP", "BestPos"]
VALUE_COLS        = ["value_eur", "value", "Value", "ValueEUR", "MarketValue"]

# Columnas de enriquecimiento
CLUB_COLS         = ["club_name", "club", "Club", "team", "Team"]
LEAGUE_COLS       = ["league_name", "league", "League", "league_long"]
NATIONALITY_COLS  = ["nationality_name", "nationality", "Nationality", "nation", "Nation"]
FACE_URL_COLS     = ["player_face_url", "face_url", "photo", "Photo", "image_url"]
PACE_COLS         = ["pace", "Pace", "PAC", "pac"]
SHOOTING_COLS     = ["shooting", "Shooting", "SHO", "sho"]
PASSING_COLS      = ["passing", "Passing", "PAS", "pas"]
DRIBBLING_COLS    = ["dribbling", "Dribbling", "DRI", "dri"]
DEFENDING_COLS    = ["defending", "Defending", "DEF", "def"]
PHYSIC_COLS       = ["physic", "Physical", "PHY", "phy"]

POSITION_MAP = {
    "GK": "GK",
    "CB": "CB", "LCB": "CB", "RCB": "CB",
    "LB": "LB", "LWB": "LWB",
    "RB": "RB", "RWB": "RWB",
    "CDM": "CDM", "DM": "CDM",
    "CM": "CM", "LCM": "CM", "RCM": "CM",
    "CAM": "CAM", "AM": "CAM", "SS": "CAM",
    "LM": "LM", "RM": "RM",
    "LW": "LW", "LF": "LW",
    "RW": "RW", "RF": "RW",
    "ST": "ST", "LS": "ST", "RS": "ST",
    "CF": "CF",
}


# --------------------------------------------------------------------------- #
# Helpers                                                                      #
# --------------------------------------------------------------------------- #

def find_col(df, candidates):
    return next((c for c in candidates if c in df.columns), None)


def normalize_position(raw):
    if not raw or pd.isna(raw):
        return "CM"
    first = str(raw).split(",")[0].strip()
    return POSITION_MAP.get(first, first[:3].upper())


def safe_int(row, col, default=0):
    if col is None:
        return default
    val = row.get(col)
    if val is None or (isinstance(val, float) and pd.isna(val)):
        return default
    try:
        return int(val)
    except (ValueError, TypeError):
        return default


def safe_str(row, col, default=""):
    if col is None:
        return default
    val = row.get(col)
    if val is None or (isinstance(val, float) and pd.isna(val)):
        return default
    s = str(val).strip()
    return "" if s.lower() in ("nan", "none", "") else s


def find_csv(folder):
    csvs = list(folder.glob("*.csv"))
    if not csvs:
        raise FileNotFoundError("No se encontro ningun CSV en " + str(folder))
    players_csv = [f for f in csvs if "player" in f.name.lower()]
    return players_csv[0] if players_csv else csvs[0]


# --------------------------------------------------------------------------- #
# Descarga desde Kaggle                                                        #
# --------------------------------------------------------------------------- #

def download_from_kaggle(dataset):
    folder = TMP_DIR / dataset.replace("/", "_")
    folder.mkdir(parents=True, exist_ok=True)

    print("[>] Descargando " + dataset + " desde Kaggle...")
    try:
        api = KaggleApi()
        api.authenticate()
        api.dataset_download_files(dataset, path=str(folder), unzip=True, quiet=False)
        print("    OK: descarga completada.")
        return folder
    except Exception as e:
        print("    ERROR: " + str(e))
        return None


def get_csv_path():
    folder = download_from_kaggle(KAGGLE_DATASET)
    if folder:
        return find_csv(folder)

    for fallback in KAGGLE_FALLBACKS:
        print("    [>] Intentando fallback: " + fallback)
        folder = download_from_kaggle(fallback)
        if folder:
            return find_csv(folder)

    print("ERROR: No se pudo descargar ningun dataset. Revisa tus credenciales de Kaggle.")
    sys.exit(1)


# --------------------------------------------------------------------------- #
# Conversion CSV -> JSON                                                       #
# --------------------------------------------------------------------------- #

def convert_csv_to_json(csv_path):
    print("[>] Procesando " + csv_path.name + "...")
    df = pd.read_csv(csv_path, low_memory=False)
    print("    Filas: " + str(len(df)) + " | Columnas: " + str(len(df.columns)))

    name_col        = find_col(df, NAME_COLS)
    overall_col     = find_col(df, OVERALL_COLS)
    potential_col   = find_col(df, POTENTIAL_COLS)
    age_col         = find_col(df, AGE_COLS)
    position_col    = find_col(df, POSITION_COLS)
    value_col       = find_col(df, VALUE_COLS)
    club_col        = find_col(df, CLUB_COLS)
    league_col      = find_col(df, LEAGUE_COLS)
    nationality_col = find_col(df, NATIONALITY_COLS)
    face_url_col    = find_col(df, FACE_URL_COLS)
    pace_col        = find_col(df, PACE_COLS)
    shooting_col    = find_col(df, SHOOTING_COLS)
    passing_col     = find_col(df, PASSING_COLS)
    dribbling_col   = find_col(df, DRIBBLING_COLS)
    defending_col   = find_col(df, DEFENDING_COLS)
    physic_col      = find_col(df, PHYSIC_COLS)

    if not name_col or not overall_col:
        print("   Columnas detectadas: " + str(list(df.columns)))
        raise ValueError("No se encontraron las columnas obligatorias (nombre / overall).")

    print("    Columnas detectadas: club=" + str(club_col) + ", liga=" + str(league_col) +
          ", nac=" + str(nationality_col) + ", foto=" + str(face_url_col))

    players = []
    skipped = 0

    for _, row in df.iterrows():
        try:
            name = str(row[name_col]).strip()
            if not name or name.lower() in ("nan", "none"):
                skipped += 1
                continue

            overall   = safe_int(row, overall_col, 70)
            potential = safe_int(row, potential_col, overall)
            age       = safe_int(row, age_col, 25)
            position  = normalize_position(row[position_col]) if position_col else "CM"

            market_value = 0.0
            if value_col:
                raw_val = row.get(value_col)
                if raw_val is not None and not (isinstance(raw_val, float) and pd.isna(raw_val)):
                    try:
                        market_value = float(raw_val)
                    except (ValueError, TypeError):
                        pass

            # Todas las posiciones normalizadas sin espacios: "ST,CF,LW"
            raw_positions = str(row[position_col]) if position_col else position
            all_positions = ",".join(
                POSITION_MAP.get(p.strip(), p.strip()[:3].upper())
                for p in raw_positions.split(",")
                if p.strip() and not pd.isna(p.strip())
            )

            players.append({
                "name":        name,
                "overall":     overall,
                "potential":   potential,
                "age":         age,
                "position":    position,
                "positions":   all_positions,
                "marketValue": market_value,
                "club":        safe_str(row, club_col),
                "league":      safe_str(row, league_col),
                "nationality": safe_str(row, nationality_col),
                "faceUrl":     safe_str(row, face_url_col),
                "pace":        safe_int(row, pace_col),
                "shooting":    safe_int(row, shooting_col),
                "passing":     safe_int(row, passing_col),
                "dribbling":   safe_int(row, dribbling_col),
                "defending":   safe_int(row, defending_col),
                "physic":      safe_int(row, physic_col),
            })
        except (ValueError, TypeError, KeyError):
            skipped += 1

    players.sort(key=lambda p: p["overall"], reverse=True)

    if skipped:
        print("    AVISO: " + str(skipped) + " filas omitidas (datos invalidos).")
    print("    OK: " + str(len(players)) + " jugadores procesados.")
    return players


# --------------------------------------------------------------------------- #
# Main                                                                         #
# --------------------------------------------------------------------------- #

def main():
    parser = argparse.ArgumentParser(description="Genera players.json para fc26-companion")
    parser.add_argument(
        "--local", metavar="CSV_PATH",
        help="Usa un CSV local en lugar de descargar desde Kaggle",
    )
    args = parser.parse_args()

    if args.local:
        csv_path = Path(args.local)
        if not csv_path.exists():
            print("ERROR: Archivo no encontrado: " + str(csv_path))
            sys.exit(1)
    else:
        kaggle_json = Path.home() / ".kaggle" / "kaggle.json"
        if not kaggle_json.exists() and not os.getenv("KAGGLE_USERNAME"):
            print("ERROR: No se encontraron credenciales de Kaggle.")
            print("  Coloca kaggle.json en ~/.kaggle/ o usa --local <ruta_csv>")
            sys.exit(1)

        csv_path = get_csv_path()

    players = convert_csv_to_json(csv_path)

    with open(OUTPUT_FILE, "w", encoding="utf-8") as f:
        json.dump(players, f, ensure_ascii=False, separators=(",", ":"))

    size_kb = OUTPUT_FILE.stat().st_size / 1024
    print("")
    print("[OK] " + OUTPUT_FILE.name + " generado: " + str(len(players)) + " jugadores (" + str(round(size_kb)) + " KB)")
    print("")
    print("Proximos pasos:")
    print("  1. Sube players.json a tu repo de GitHub (git add players.json && git commit && git push)")
    print("  2. En la app pulsa 'Actualizar Plantillas' para importar los nuevos datos")


if __name__ == "__main__":
    main()
