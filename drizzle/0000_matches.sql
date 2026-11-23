CREATE TABLE matches (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  import_key TEXT NOT NULL UNIQUE,
  club TEXT NOT NULL,
  match_date TEXT NOT NULL,
  competition TEXT NOT NULL,
  reference TEXT NOT NULL,
  home TEXT NOT NULL,
  away TEXT NOT NULL,
  home_score INTEGER NOT NULL CHECK (home_score >= 0),
  away_score INTEGER NOT NULL CHECK (away_score >= 0),
  home_formation TEXT NOT NULL,
  away_formation TEXT NOT NULL,
  home_xg REAL NOT NULL CHECK (home_xg >= 0),
  away_xg REAL NOT NULL CHECK (away_xg >= 0),
  home_ovr REAL NOT NULL CHECK (home_ovr >= 0),
  away_ovr REAL NOT NULL CHECK (away_ovr >= 0)
);
