#!/usr/bin/env python3
"""
Agrega el campo 'league' a players.json basado en el club.
Cubre las principales ligas del mundo (EA FC 26).
"""
import json
from pathlib import Path

OUTPUT_FILE = Path(__file__).parent.parent / "players.json"

CLUB_LEAGUE = {
    # ── Premier League ────────────────────────────────────────────
    "Arsenal": "Premier League", "Aston Villa": "Premier League",
    "AFC Bournemouth": "Premier League", "Brentford": "Premier League",
    "Brighton & Hove Albion": "Premier League", "Chelsea": "Premier League",
    "Crystal Palace": "Premier League", "Everton": "Premier League",
    "Fulham": "Premier League", "Ipswich Town": "Premier League",
    "Leicester City": "Premier League", "Liverpool": "Premier League",
    "Manchester City": "Premier League", "Manchester United": "Premier League",
    "Newcastle United": "Premier League", "Nottingham Forest": "Premier League",
    "Southampton": "Premier League", "Tottenham Hotspur": "Premier League",
    "West Ham United": "Premier League", "Wolverhampton Wanderers": "Premier League",

    # ── EFL Championship ─────────────────────────────────────────
    "Leeds United": "Championship", "Burnley": "Championship",
    "Sunderland": "Championship", "Sheffield United": "Championship",
    "Middlesbrough": "Championship", "Coventry City": "Championship",
    "Watford": "Championship", "Norwich City": "Championship",
    "West Bromwich Albion": "Championship", "Stoke City": "Championship",
    "Bristol City": "Championship", "Millwall": "Championship",
    "Preston North End": "Championship", "Hull City": "Championship",
    "Derby County": "Championship", "Cardiff City": "Championship",
    "Swansea City": "Championship", "Queens Park Rangers": "Championship",
    "Plymouth Argyle": "Championship", "Luton Town": "Championship",
    "Blackburn Rovers": "Championship", "Sheffield Wednesday": "Championship",
    "Oxford United": "Championship", "Portsmouth": "Championship",

    # ── La Liga ───────────────────────────────────────────────────
    "FC Barcelona": "La Liga", "Real Madrid": "La Liga",
    "Atletico de Madrid": "La Liga", "Atlético de Madrid": "La Liga",
    "Athletic Club": "La Liga", "Real Sociedad": "La Liga",
    "Villarreal CF": "La Liga", "Real Betis": "La Liga",
    "Sevilla FC": "La Liga", "Valencia CF": "La Liga",
    "Getafe CF": "La Liga", "Osasuna": "La Liga",
    "Celta de Vigo": "La Liga", "Rayo Vallecano": "La Liga",
    "Girona FC": "La Liga", "UD Las Palmas": "La Liga",
    "Deportivo Alaves": "La Liga", "Deportivo Alavés": "La Liga",
    "RCD Mallorca": "La Liga", "RCD Espanyol": "La Liga",
    "CD Leganes": "La Liga", "CD Leganés": "La Liga",
    "Real Valladolid CF": "La Liga",

    # ── La Liga 2 ─────────────────────────────────────────────────
    "SD Eibar": "La Liga 2", "RC Deportivo": "La Liga 2",
    "SD Huesca": "La Liga 2", "Real Zaragoza": "La Liga 2",
    "Granada CF": "La Liga 2", "Sporting de Gijon": "La Liga 2",

    # ── Bundesliga ────────────────────────────────────────────────
    "FC Bayern München": "Bundesliga", "Borussia Dortmund": "Bundesliga",
    "Bayer 04 Leverkusen": "Bundesliga", "RB Leipzig": "Bundesliga",
    "Eintracht Frankfurt": "Bundesliga", "VfB Stuttgart": "Bundesliga",
    "SC Freiburg": "Bundesliga", "1. FC Union Berlin": "Bundesliga",
    "Borussia Mönchengladbach": "Bundesliga", "TSG 1899 Hoffenheim": "Bundesliga",
    "Werder Bremen": "Bundesliga", "VfL Wolfsburg": "Bundesliga",
    "FC Augsburg": "Bundesliga", "1. FSV Mainz 05": "Bundesliga",
    "VfL Bochum": "Bundesliga", "FC St. Pauli": "Bundesliga",
    "Holstein Kiel": "Bundesliga", "1. FC Heidenheim 1846": "Bundesliga",
    "1. FC Heidenheim": "Bundesliga",

    # ── 2. Bundesliga ─────────────────────────────────────────────
    "Hamburger SV": "2. Bundesliga", "Fortuna Düsseldorf": "2. Bundesliga",
    "Karlsruher SC": "2. Bundesliga", "1. FC Nürnberg": "2. Bundesliga",
    "1. FC Köln": "2. Bundesliga", "Hannover 96": "2. Bundesliga",
    "SV Darmstadt 98": "2. Bundesliga", "1. FC Kaiserslautern": "2. Bundesliga",

    # ── Serie A ───────────────────────────────────────────────────
    "Juventus": "Serie A", "Inter": "Serie A",
    "AC Milan": "Serie A", "SSC Napoli": "Serie A",
    "AS Roma": "Serie A", "Lazio": "Serie A",
    "Atalanta": "Serie A", "Fiorentina": "Serie A",
    "Bologna FC 1909": "Serie A", "Torino FC": "Serie A",
    "AC Monza": "Serie A", "Udinese Calcio": "Serie A",
    "Genoa CFC": "Serie A", "Cagliari Calcio": "Serie A",
    "Hellas Verona FC": "Serie A", "Lecce": "Serie A",
    "Parma Calcio 1913": "Serie A", "Como 1907": "Serie A",
    "Venezia FC": "Serie A", "Empoli FC": "Serie A",

    # ── Serie B ───────────────────────────────────────────────────
    "Palermo FC": "Serie B", "SS Lazio": "Serie A",
    "Sampdoria": "Serie B", "Pisa Sporting Club": "Serie B",

    # ── Ligue 1 ───────────────────────────────────────────────────
    "Paris Saint-Germain": "Ligue 1", "Olympique de Marseille": "Ligue 1",
    "AS Monaco": "Ligue 1", "OGC Nice": "Ligue 1",
    "Stade Rennais FC": "Ligue 1", "Olympique Lyonnais": "Ligue 1",
    "OL Lyonnes": "Ligue 1", "RC Lens": "Ligue 1",
    "LOSC Lille": "Ligue 1", "Stade de Reims": "Ligue 1",
    "RC Strasbourg Alsace": "Ligue 1", "Montpellier HSC": "Ligue 1",
    "FC Nantes": "Ligue 1", "Le Havre AC": "Ligue 1",
    "Toulouse FC": "Ligue 1", "AJ Auxerre": "Ligue 1",
    "Angers SCO": "Ligue 1", "Saint-Etienne": "Ligue 1",

    # ── Eredivisie ───────────────────────────────────────────────
    "AFC Ajax": "Eredivisie", "PSV Eindhoven": "Eredivisie",
    "Feyenoord": "Eredivisie", "AZ Alkmaar": "Eredivisie",
    "FC Twente": "Eredivisie", "FC Utrecht": "Eredivisie",
    "SC Heerenveen": "Eredivisie", "NEC Nijmegen": "Eredivisie",
    "Sparta Rotterdam": "Eredivisie", "Go Ahead Eagles": "Eredivisie",
    "Heracles Almelo": "Eredivisie", "PEC Zwolle": "Eredivisie",
    "ADO Den Haag": "Eredivisie", "Vitesse": "Eredivisie",
    "RKC Waalwijk": "Eredivisie", "Willem II": "Eredivisie",

    # ── Primeira Liga (Portugal) ──────────────────────────────────
    "FC Porto": "Primeira Liga", "SL Benfica": "Primeira Liga",
    "Benfica": "Primeira Liga", "Sporting CP": "Primeira Liga",
    "SC Braga": "Primeira Liga", "Vitória SC": "Primeira Liga",
    "CF Belenenses": "Primeira Liga", "FC Famalicão": "Primeira Liga",
    "Moreirense FC": "Primeira Liga", "CD Santa Clara": "Primeira Liga",
    "Rio Ave FC": "Primeira Liga", "GD Estoril Praia": "Primeira Liga",
    "FC Arouca": "Primeira Liga", "Casa Pia AC": "Primeira Liga",

    # ── Scottish Premiership ──────────────────────────────────────
    "Celtic": "Scottish Premiership", "Rangers": "Scottish Premiership",
    "Heart of Midlothian": "Scottish Premiership", "Hibernian": "Scottish Premiership",
    "Aberdeen": "Scottish Premiership", "Motherwell": "Scottish Premiership",

    # ── Belgian Pro League ────────────────────────────────────────
    "Club Brugge KV": "Belgian Pro League", "RSC Anderlecht": "Belgian Pro League",
    "KAA Gent": "Belgian Pro League", "R. Union Saint-Gilloise": "Belgian Pro League",
    "Standard de Liège": "Belgian Pro League", "KRC Genk": "Belgian Pro League",

    # ── Saudi Pro League ──────────────────────────────────────────
    "Al-Hilal": "Saudi Pro League", "Al Hilal": "Saudi Pro League",
    "Al-Nassr": "Saudi Pro League", "Al Nassr": "Saudi Pro League",
    "Al-Ittihad": "Saudi Pro League", "Al Ittihad": "Saudi Pro League",
    "Al-Ahli": "Saudi Pro League", "Al Ahli": "Saudi Pro League",
    "Al-Qadsiah": "Saudi Pro League", "Al-Fayha": "Saudi Pro League",
    "Al-Shabab": "Saudi Pro League", "Al Shabab": "Saudi Pro League",
    "Al-Fateh": "Saudi Pro League", "Al-Raed": "Saudi Pro League",
    "Al-Khaleej": "Saudi Pro League", "Al-Taawoun": "Saudi Pro League",
    "Al-Ettifaq": "Saudi Pro League", "Al Ettifaq": "Saudi Pro League",
    "Al-Wehda": "Saudi Pro League", "Al Wehda": "Saudi Pro League",

    # ── MLS ──────────────────────────────────────────────────────
    "LA Galaxy": "MLS", "Inter Miami CF": "MLS",
    "LAFC": "MLS", "Seattle Sounders FC": "MLS",
    "FC Cincinnati": "MLS", "Columbus Crew": "MLS",
    "New England Revolution": "MLS", "Philadelphia Union": "MLS",
    "Portland Timbers": "MLS", "Atlanta United FC": "MLS",
    "New York City FC": "MLS", "New York Red Bulls": "MLS",
    "Orlando City SC": "MLS", "CF Montréal": "MLS",
    "Toronto FC": "MLS", "Chicago Fire FC": "MLS",
    "D.C. United": "MLS", "Real Salt Lake": "MLS",
    "Minnesota United FC": "MLS", "FC Dallas": "MLS",
    "Houston Dynamo FC": "MLS", "Colorado Rapids": "MLS",
    "San Jose Earthquakes": "MLS", "Vancouver Whitecaps FC": "MLS",
    "Sporting Kansas City": "MLS", "Austin FC": "MLS",
    "Nashville SC": "MLS", "Charlotte FC": "MLS",
    "St. Louis City SC": "MLS", "San Diego FC": "MLS",
    "San Diego Wave FC": "MLS", "Orlando Pride": "NWSL",
    "Portland Thorns FC": "NWSL", "NJ/NY Gotham FC": "NWSL",
    "Gotham FC": "NWSL", "Washington Spirit": "NWSL",

    # ── Liga MX ───────────────────────────────────────────────────
    "Club América": "Liga MX", "Chivas": "Liga MX",
    "Club Deportivo Guadalajara": "Liga MX", "Cruz Azul": "Liga MX",
    "UNAM Pumas": "Liga MX", "Tigres UANL": "Liga MX",
    "CF Monterrey": "Liga MX", "Atlas FC": "Liga MX",
    "Club León": "Liga MX", "Pachuca": "Liga MX",
    "Toluca FC": "Liga MX", "Santos Laguna": "Liga MX",

    # ── Brasileirão ───────────────────────────────────────────────
    "Flamengo": "Brasileirão", "Palmeiras": "Brasileirão",
    "Atletico Mineiro": "Brasileirão", "Atlético Mineiro": "Brasileirão",
    "Fluminense": "Brasileirão", "Botafogo": "Brasileirão",
    "São Paulo FC": "Brasileirão", "Grêmio": "Brasileirão",
    "Internacional": "Brasileirão", "Corinthians": "Brasileirão",
    "Vasco da Gama": "Brasileirão", "Cruzeiro": "Brasileirão",
    "Athletico Paranaense": "Brasileirão", "Bragantino": "Brasileirão",

    # ── Argentine Primera División ────────────────────────────────
    "River Plate": "Primera División", "Boca Juniors": "Primera División",
    "Racing Club": "Primera División", "San Lorenzo": "Primera División",
    "Independiente": "Primera División", "Estudiantes": "Primera División",
    "Vélez Sársfield": "Primera División", "Lanús": "Primera División",
    "Huracán": "Primera División", "Talleres": "Primera División",

    # ── Süper Lig (Turquía) ───────────────────────────────────────
    "Galatasaray": "Süper Lig", "Fenerbahçe": "Süper Lig",
    "Besiktas JK": "Süper Lig", "Beşiktaş JK": "Süper Lig",
    "Trabzonspor": "Süper Lig", "Basaksehir FK": "Süper Lig",

    # ── Süper Lig (Grecia) ────────────────────────────────────────
    "Olympiacos": "Super League Greece", "PAOK": "Super League Greece",
    "AEK Athens": "Super League Greece", "Panathinaikos": "Super League Greece",

    # ── Liga Profesional Colombia ─────────────────────────────────
    "Atletico Nacional": "Liga BetPlay", "Millonarios FC": "Liga BetPlay",
    "América de Cali": "Liga BetPlay", "Junior FC": "Liga BetPlay",
    "Independiente Medellín": "Liga BetPlay",

    # ── Women's Leagues ───────────────────────────────────────────
    "FC Barcelona (W)": "Liga F", "Real Madrid (W)": "Liga F",
    "Atletico de Madrid (W)": "Liga F",
    "Arsenal (W)": "WSL", "Chelsea FC W": "WSL",
    "Manchester City (W)": "WSL", "Manchester United (W)": "WSL",
    "OL Lyonnes": "Division 1 Féminine",
    "Paris Saint-Germain (W)": "Division 1 Féminine",
    "FC Bayern München (W)": "Frauen-Bundesliga",
    "Wolfsburg (W)": "Frauen-Bundesliga", "VfL Wolfsburg (W)": "Frauen-Bundesliga",
    "Juventus (W)": "Serie A Femminile",
    "NG - FA Women": "WSL",
    "London City Lionesses": "WSL",
    "Gotham FC": "NWSL", "NJ/NY Gotham FC": "NWSL",

    # ── Otros ─────────────────────────────────────────────────────
    "Celtic (W)": "SWPL", "Leyton Orient": "League One",
    "AFC Wimbledon": "League One", "FC Anyang": "K League 2",
    "Jeonbuk Hyundai Motors": "K League 1", "FC Seoul": "K League 1",
    "Ulsan HD FC": "K League 1", "Cerezo Osaka": "J1 League",
    "Urawa Red Diamonds": "J1 League", "Gamba Osaka": "J1 League",
    "Yokohama F. Marinos": "J1 League", "Kashima Antlers": "J1 League",
    "Kawasaki Frontale": "J1 League",
    "Strømsgodset Toppfotball": "Eliteserien",
    "Rosenborg BK": "Eliteserien",
    "Malmö FF": "Allsvenskan", "AIK": "Allsvenskan",
    "IFK Göteborg": "Allsvenskan",
    "AGF": "Superliga", "FC Kobenhavn": "Superliga",
    "FC København": "Superliga", "Brøndby IF": "Superliga",
    "Universitatea Cluj": "Superliga Romania",
    "Metaloglobus Bucuresti": "Liga II Romania",
    "Cerro Largo": "Primera División Uruguay",
    "Botafogo": "Brasileirão",
    "Charlotte FC": "MLS", "San Diego Wave FC": "NWSL",
    "Academia Puerto Cabello": "Liga FUTVE",
    "Cienciano": "Liga 1 Peru",
    "Atletico Tucuman": "Primera División",
}

def normalize(club):
    return club.strip()

def main():
    data = json.loads(OUTPUT_FILE.read_text(encoding="utf-8"))
    updated = 0
    no_match = set()

    for p in data:
        club = normalize(p.get("club", ""))
        if not club:
            continue
        league = CLUB_LEAGUE.get(club, "")
        if league:
            if p.get("league", "") != league:
                p["league"] = league
                updated += 1
        else:
            no_match.add(club)

    OUTPUT_FILE.write_text(
        json.dumps(data, ensure_ascii=False, separators=(",", ":")),
        encoding="utf-8"
    )

    print(f"[OK] {updated} jugadores actualizados con liga")
    print(f"     {len(no_match)} clubs sin mapeo (mostrando 20):")
    for c in sorted(no_match)[:20]:
        print(f"       {c}")

if __name__ == "__main__":
    main()
