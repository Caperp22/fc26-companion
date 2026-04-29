#!/usr/bin/env python3
"""
FC 26 Player Data Fetcher
=========================
Descarga el dataset de jugadores de FC 26 desde Kaggle y genera
el archivo players.json compatible con la app fc26-companion.

PREREQUISITOS:
  pip install -r scripts/requirements.txt

USO (automático - descarga desde Kaggle):
  export KAGGLE_USERNAME=tu_usuario
  export KAGGLE_KEY=tu_api_key
  python scripts/fetch_players.py

USO (manual - si ya tienes el CSV descargado):
  python scripts/fetch_players.py --local ruta/al/archivo.csv

OBTENER CREDENCIALES DE KAGGLE:
  1. Ve a https://www.kaggle.com/ → tu perfil → Settings → API
  2. Clic en "Create New Token" → descarga kaggle.json
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
# Configuración                                                                #
# --------------------------------------------------------------------------- #

# Dataset principal de FC 26 (18,000+ jugadores, actualizado por la comunidad)
KAGGLE_DATASET = "rovnez/fc-26-fifa-26-player-data"

# Datasets alternativos si el principal falla
KAGGLE_FALLBACKS = [
    "flynn28/eafc26-player-database",
    "talhademirezen/fc-26-player-stats",
]

OUTPUT_FILE = Path(__file__).parent.parent / "players.json"
TMP_DIR = Path(__file__).parent.parent / "tmp_kaggle"

# Posibles nombres de columnas según el dataset
NAME_COLS     = ["short_name", "name", "Name", "player_name", "Player"]
OVERALL_COLS  = ["overall", "Overall", "OVA", "ova", "Rating"]
POTENTIAL_COLS = ["potential", "Potential", "POT", "pot"]
AGE_COLS      = ["age", "Age"]
POSITION_COLS = ["player_positions", "positions", "Position", "position", "BP", "BestPos"]
VALUE_COLS    = ["value_eur", "value", "Value", "ValueEUR", "MarketValue"]

# Normalización de posiciones al formato de la app
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

def find_col(df: pd.DataFrame, candidates: list) -> str | None:
    """Devuelve el primer nombre de columna que exista en el DataFrame."""
    return next((c for c in candidates if c in df.columns), None)


def normalize_position(raw: str) -> str:
    """'ST, CF' → 'ST'  (toma la posición principal y la normaliza)."""
    if not raw or pd.isna(raw):
        return "CM"
    first = str(raw).split(",")[0].strip()
    return POSITION_MAP.get(first, first[:3].upper())


def find_csv(folder: Path) -> Path:
    """Encuentra el CSV principal en la carpeta descargada."""
    csvs = list(folder.glob("*.csv"))
    if not csvs:
        raise FileNotFoundError(f"No se encontró ningún CSV en {folder}")
    # Preferir el que tenga "player" en el nombre
    players_csv = [f for f in csvs if "player" in f.name.lower()]
    return players_csv[0] if players_csv else csvs[0]


# --------------------------------------------------------------------------- #
# Descarga desde Kaggle                                                        #
# --------------------------------------------------------------------------- #

def download_from_kaggle(dataset: str) -> Path:
    """Descarga un dataset de Kaggle y devuelve la carpeta con los archivos."""
    folder = TMP_DIR / dataset.replace("/", "_")
    folder.mkdir(parents=True, exist_ok=True)

    print(f"[>] Descargando {dataset} desde Kaggle...")
    try:
        api = KaggleApi()
        api.authenticate()
        api.dataset_download_files(dataset, path=str(folder), unzip=True, quiet=False)
        print("    OK: descarga completada.")
        return folder
    except Exception as e:
        print(f"    ERROR: {e}")
        return None


def get_csv_path() -> Path:
    """Intenta descargar el dataset principal; si falla, prueba los alternativos."""
    folder = download_from_kaggle(KAGGLE_DATASET)
    if folder:
        return find_csv(folder)

    for fallback in KAGGLE_FALLBACKS:
        print(f"    [>] Intentando fallback: {fallback}")
        folder = download_from_kaggle(fallback)
        if folder:
            return find_csv(folder)

    print("ERROR: No se pudo descargar ningun dataset. Revisa tus credenciales de Kaggle.")
    sys.exit(1)


# --------------------------------------------------------------------------- #
# Conversión CSV → JSON                                                        #
# --------------------------------------------------------------------------- #

def convert_csv_to_json(csv_path: Path) -> list[dict]:
    """Lee el CSV y devuelve la lista de jugadores en el formato de la app."""
    print(f"[>] Procesando {csv_path.name}...")
    df = pd.read_csv(csv_path, low_memory=False)
    print(f"    Filas: {len(df):,} | Columnas: {len(df.columns)}")

    name_col     = find_col(df, NAME_COLS)
    overall_col  = find_col(df, OVERALL_COLS)
    potential_col = find_col(df, POTENTIAL_COLS)
    age_col      = find_col(df, AGE_COLS)
    position_col = find_col(df, POSITION_COLS)
    value_col    = find_col(df, VALUE_COLS)

    if not name_col or not overall_col:
        print(f"   Columnas detectadas: {list(df.columns)}")
        raise ValueError("No se encontraron las columnas obligatorias (nombre / overall).")

    players = []
    skipped = 0

    for _, row in df.iterrows():
        try:
            name = str(row[name_col]).strip()
            if not name or name in ("nan", "NaN"):
                skipped += 1
                continue

            overall   = int(row[overall_col])   if pd.notna(row.get(overall_col, None))  else 70
            potential = int(row[potential_col]) if potential_col and pd.notna(row.get(potential_col, None)) else overall
            age       = int(row[age_col])       if age_col  and pd.notna(row.get(age_col, None))  else 25
            position  = normalize_position(row[position_col]) if position_col else "CM"
            market_value = float(row[value_col]) if value_col and pd.notna(row.get(value_col, None)) else 0.0

            players.append({
                "name":        name,
                "overall":     overall,
                "potential":   potential,
                "age":         age,
                "position":    position,
                "marketValue": market_value,
            })
        except (ValueError, TypeError, KeyError):
            skipped += 1

    players.sort(key=lambda p: p["overall"], reverse=True)

    if skipped:
        print(f"    AVISO: {skipped} filas omitidas (datos invalidos).")
    print(f"    OK: {len(players):,} jugadores procesados.")
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
            print(f"ERROR: Archivo no encontrado: {csv_path}")
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
    print(f"\n[OK] {OUTPUT_FILE.name} generado: {len(players):,} jugadores ({size_kb:.0f} KB)")
    print("\nProximos pasos:")
    print("  1. Sube players.json a tu repo de GitHub")
    print("  2. Copia la URL raw y pegala en .env como EXPO_PUBLIC_PLAYERS_URL")
    print("  3. Pulsa 'Actualizar Plantillas' en la app")


if __name__ == "__main__":
    main()
