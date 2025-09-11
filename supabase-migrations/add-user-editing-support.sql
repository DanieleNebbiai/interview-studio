-- Add user approval fields to speed_recommendations
ALTER TABLE speed_recommendations 
ADD COLUMN IF NOT EXISTS user_approved BOOLEAN NULL,
ADD COLUMN IF NOT EXISTS applied BOOLEAN DEFAULT TRUE;

-- Create index for querying user-approved speed recommendations
CREATE INDEX IF NOT EXISTS idx_speed_recommendations_user_approved 
ON speed_recommendations(room_id, user_approved, applied);

-- Add trigger for updated_at on speed_recommendations if not exists
DROP TRIGGER IF EXISTS update_speed_recommendations_updated_at ON speed_recommendations;
CREATE TRIGGER update_speed_recommendations_updated_at 
  BEFORE UPDATE ON speed_recommendations 
  FOR EACH ROW 
  EXECUTE FUNCTION update_updated_at_column();

-- Create video_sections table to store user's final video structure
CREATE TABLE IF NOT EXISTS video_sections (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  room_id UUID NOT NULL REFERENCES rooms(id) ON DELETE CASCADE,
  section_id TEXT NOT NULL, -- 'section-0-120' format from frontend
  start_time DOUBLE PRECISION NOT NULL,
  end_time DOUBLE PRECISION NOT NULL,
  is_deleted BOOLEAN NOT NULL DEFAULT FALSE,
  playback_speed DOUBLE PRECISION NOT NULL DEFAULT 1.0,
  created_by TEXT NOT NULL DEFAULT 'user',
  ai_generated BOOLEAN DEFAULT FALSE,
  user_modified BOOLEAN DEFAULT FALSE, -- TRUE if user changed from AI suggestion
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  
  -- Ensure unique section per room
  UNIQUE(room_id, section_id)
);

-- Create indexes for video_sections
CREATE INDEX IF NOT EXISTS idx_video_sections_room_id ON video_sections(room_id);
CREATE INDEX IF NOT EXISTS idx_video_sections_time ON video_sections(room_id, start_time, end_time);
CREATE INDEX IF NOT EXISTS idx_video_sections_deleted ON video_sections(room_id, is_deleted);

-- Add RLS policies
ALTER TABLE video_sections ENABLE ROW LEVEL SECURITY;

-- Allow users to read/write video sections
CREATE POLICY "Users can manage video sections" ON video_sections
  FOR ALL USING (true);

-- Add updated_at trigger
CREATE TRIGGER update_video_sections_updated_at 
  BEFORE UPDATE ON video_sections 
  FOR EACH ROW 
  EXECUTE FUNCTION update_updated_at_column();

-- Add comments
COMMENT ON TABLE video_sections IS 'Stores video sections with user modifications (splits, deletes, speed changes)';
COMMENT ON COLUMN video_sections.section_id IS 'Frontend section identifier like section-16.78-20';
COMMENT ON COLUMN video_sections.is_deleted IS 'TRUE if section should be cut from final video';
COMMENT ON COLUMN video_sections.playback_speed IS '1.0=normal, 0.5=half speed, 2.0=double speed';
COMMENT ON COLUMN video_sections.user_modified IS 'TRUE if user changed this from original AI suggestion';