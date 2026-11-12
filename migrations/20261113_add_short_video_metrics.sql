-- Wrangler applies each migration atomically. Preserve every original playback.
-- Rebuild only this metrics table to expand its former single-video CHECK.
CREATE TABLE video_playbacks_v2 (
  video_id TEXT NOT NULL CHECK (video_id IN (
    'festa60-pr',
    'festa60-short-pr01',
    'festa60-short-pr02',
    'festa60-short-pr03',
    'festa60-short-pr04',
    'festa60-short-pr05',
    'festa60-short-pr06',
    'festa60-short-pr07',
    'festa60-short-pr08',
    'festa60-short-pr09',
    'festa60-short-pr10',
    'festa60-short-h01',
    'festa60-short-h02',
    'festa60-short-h03',
    'festa60-short-h04',
    'festa60-short-h05',
    'festa60-short-h06',
    'festa60-short-h07',
    'festa60-short-h08',
    'festa60-short-h09',
    'festa60-short-h10',
    'festa60-short-h11',
    'festa60-short-h12',
    'festa60-short-h13',
    'festa60-short-h14'
  )),
  playback_id TEXT NOT NULL,
  started_at TEXT NOT NULL,
  completed_at TEXT,
  PRIMARY KEY (video_id, playback_id)
);
INSERT INTO video_playbacks_v2 (video_id, playback_id, started_at, completed_at)
  SELECT video_id, playback_id, started_at, completed_at FROM video_playbacks;
DROP TABLE video_playbacks;
ALTER TABLE video_playbacks_v2 RENAME TO video_playbacks;
CREATE INDEX idx_video_playbacks_started_at ON video_playbacks (started_at, video_id);
CREATE INDEX idx_video_playbacks_completed_at ON video_playbacks (completed_at, video_id)
  WHERE completed_at IS NOT NULL;
