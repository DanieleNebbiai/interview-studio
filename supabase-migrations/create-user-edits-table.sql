-- Create user_edits table to store user's editing modifications
CREATE TABLE IF NOT EXISTS user_edits (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  room_id UUID NOT NULL REFERENCES rooms(id) ON DELETE CASCADE,
  
  -- Video sections with user modifications
  video_sections JSONB NOT NULL DEFAULT '[]'::jsonb,
  
  -- Zoom/focus ranges defined by user
  zoom_ranges JSONB NOT NULL DEFAULT '[]'::jsonb,
  
  -- Split points where user divided the timeline
  split_points JSONB NOT NULL DEFAULT '[]'::jsonb,
  
  -- Metadata
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  
  -- Ensure one edit state per room
  UNIQUE(room_id)
);

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_user_edits_room_id ON user_edits(room_id);
CREATE INDEX IF NOT EXISTS idx_user_edits_updated_at ON user_edits(updated_at);

-- Add RLS policies
ALTER TABLE user_edits ENABLE ROW LEVEL SECURITY;

-- Allow users to read/write their own room edits
CREATE POLICY "Users can manage their room edits" ON user_edits
  FOR ALL USING (true);

-- Add comment
COMMENT ON TABLE user_edits IS 'Stores user modifications to video editing (sections, splits, zoom ranges)';
COMMENT ON COLUMN user_edits.video_sections IS 'Array of video sections with startTime, endTime, isDeleted, playbackSpeed';
COMMENT ON COLUMN user_edits.zoom_ranges IS 'Array of focus/zoom segments with participant focus';
COMMENT ON COLUMN user_edits.split_points IS 'Array of timeline split points (timestamps)';