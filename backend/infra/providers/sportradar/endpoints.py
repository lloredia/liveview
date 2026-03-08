"""
SportRadar API endpoint builders and league configuration.
"""
from __future__ import annotations

from typing import Dict

CURRENT_NFL_SEASON_YEAR = 2024

BASE_URL = "https://api.sportradar.com"

# League slug -> (sport_prefix, league_id for SportRadar).
# sport_prefix: soccer-trial, nba-trial, nhl-trial, mlb-trial, nfl-trial.
LEAGUE_CONFIGS: Dict[str, tuple[str, str]] = {
    "eng.1": ("soccer", "sr:competition:17"),
    "eng.2": ("soccer", "sr:competition:18"),
    "eng.fa": ("soccer", "sr:competition:29"),
    "eng.league_cup": ("soccer", "sr:competition:23"),
    "usa.1": ("soccer", "sr:competition:242"),
    "esp.1": ("soccer", "sr:competition:23"),
    "ger.1": ("soccer", "sr:competition:35"),
    "ita.1": ("soccer", "sr:competition:23"),
    "fra.1": ("soccer", "sr:competition:34"),
    "ned.1": ("soccer", "sr:competition:37"),
    "por.1": ("soccer", "sr:competition:38"),
    "tur.1": ("soccer", "sr:competition:52"),
    "sco.1": ("soccer", "sr:competition:40"),
    "sau.1": ("soccer", "sr:competition:102"),
    "uefa.champions": ("soccer", "sr:competition:7"),
    "uefa.europa": ("soccer", "sr:competition:679"),
    "uefa.europa.conf": ("soccer", "sr:competition:1030"),
    "nba": ("basketball", "nba"),
    "wnba": ("basketball", "wnba"),
    "mens-college-basketball": ("basketball", "ncaamb"),
    "womens-college-basketball": ("basketball", "ncaaw"),
    "nhl": ("hockey", "nhl"),
    "mlb": ("baseball", "mlb"),
    "nfl": ("football", "nfl"),
}

# Access level suffix for URL path (trial vs production).
ACCESS_LEVEL_SUFFIX: Dict[str, str] = {
    "trial": "trial",
    "production": "production",
}


def schedule_url(
    base_url: str,
    sport_prefix: str,
    access_level: str,
    league_id: str,
    date_str: str,
    api_key: str,
) -> str:
    """Build schedule endpoint URL for the given sport/league/date."""
    level = ACCESS_LEVEL_SUFFIX.get(access_level, "trial")
    if sport_prefix == "soccer":
        path = f"/soccer-{level}/v4/en/sport_events/schedule.json"
    elif sport_prefix == "basketball":
        path = f"/{sport_prefix}-{level}/v7/en/games/{date_str}/schedule.json"
    elif sport_prefix == "hockey":
        path = f"/{sport_prefix}-{level}/v6/en/games/{date_str}/schedule.json"
    elif sport_prefix == "baseball":
        path = f"/{sport_prefix}-{level}/v7/en/games/{date_str}/schedule.json"
    elif sport_prefix == "football":
        path = f"/{sport_prefix}-{level}/v2/{CURRENT_NFL_SEASON_YEAR}/reg/1/schedule.json"
    else:
        path = f"/{sport_prefix}-{level}/v4/en/sport_events/schedule.json"
    sep = "&" if "?" in path else "?"
    if sport_prefix == "soccer":
        return f"{base_url}{path}?api_key={api_key}&league_id={league_id}&date={date_str}"
    return f"{base_url}{path}{sep}api_key={api_key}"
