CREATE TABLE IF NOT EXISTS page_views (
  page_id TEXT NOT NULL CHECK (page_id IN ('festa60-home', 'festa60-register')),
  view_id TEXT NOT NULL,
  viewed_at TEXT NOT NULL,
  PRIMARY KEY (page_id, view_id)
);
