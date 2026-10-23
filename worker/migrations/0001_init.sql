-- MingTab sync: one row per synced record (space, collection, card, tag), per user.
-- `seq` is a per-user change counter: a device asks for "everything after seq N".

CREATE TABLE users (
  id          TEXT PRIMARY KEY,
  google_sub  TEXT NOT NULL UNIQUE,
  email       TEXT NOT NULL,
  created_at  INTEGER NOT NULL
);

-- Each signed-in device holds a random token; only its SHA-256 is stored.
CREATE TABLE sessions (
  token_hash    TEXT PRIMARY KEY,
  user_id       TEXT NOT NULL REFERENCES users(id),
  device_name   TEXT NOT NULL,
  created_at    INTEGER NOT NULL,
  last_seen_at  INTEGER NOT NULL
);
CREATE INDEX sessions_user ON sessions(user_id);

CREATE TABLE records (
  user_id     TEXT NOT NULL,
  tbl         TEXT NOT NULL,
  id          TEXT NOT NULL,
  data        TEXT NOT NULL,   -- the full record as JSON
  updated_at  INTEGER NOT NULL,
  deleted_at  INTEGER,
  seq         INTEGER NOT NULL,
  PRIMARY KEY (user_id, tbl, id)
);
CREATE INDEX records_user_seq ON records(user_id, seq);
