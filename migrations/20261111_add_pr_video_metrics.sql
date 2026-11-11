CREATE TABLE IF NOT EXISTS video_playbacks (
  video_id TEXT NOT NULL CHECK (video_id = 'festa60-pr'),
  playback_id TEXT NOT NULL,
  started_at TEXT NOT NULL,
  completed_at TEXT,
  PRIMARY KEY (video_id, playback_id)
);
