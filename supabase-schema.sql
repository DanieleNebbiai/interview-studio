-- Tabella per le registrazioni
CREATE TABLE recordings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  room_id UUID REFERENCES rooms(id),
  participant_session_id TEXT NOT NULL,
  daily_recording_id TEXT NOT NULL,
  daily_instance_id TEXT NOT NULL,
  recording_url TEXT,
  duration INTEGER, -- in seconds
  file_size BIGINT, -- in bytes
  status TEXT DEFAULT 'processing' CHECK (status IN ('processing', 'downloaded', 'transcribed', 'failed')),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Tabella per le trascrizioni
CREATE TABLE transcriptions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  recording_id UUID REFERENCES recordings(id) ON DELETE CASCADE,
  transcript_text TEXT NOT NULL,
  word_timestamps JSONB, -- Array of {word, start, end} objects
  language TEXT DEFAULT 'it',
  confidence FLOAT,
  processing_time INTEGER, -- in milliseconds
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Indici per performance
CREATE INDEX idx_recordings_room_id ON recordings(room_id);
CREATE INDEX idx_recordings_status ON recordings(status);
CREATE INDEX idx_transcriptions_recording_id ON transcriptions(recording_id);

-- Trigger per aggiornare updated_at automaticamente
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';

CREATE TRIGGER update_recordings_updated_at 
BEFORE UPDATE ON recordings 
FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Tabella per i focus segments (inclusi quelli generati dall'AI)
CREATE TABLE focus_segments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  room_id UUID REFERENCES rooms(id) ON DELETE CASCADE,
  start_time FLOAT NOT NULL, -- in seconds
  end_time FLOAT NOT NULL, -- in seconds
  focused_participant_id UUID REFERENCES recordings(id),
  created_by TEXT DEFAULT 'user', -- 'user' or 'ai_system'
  reason TEXT, -- Explanation why this segment should be focused
  confidence FLOAT, -- AI confidence score (0-1)
  segment_type TEXT CHECK (segment_type IN ('monologue', 'conversation', 'silence')),
  ai_generated BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Tabella per le sessioni di editing AI
CREATE TABLE ai_editing_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  room_id UUID REFERENCES rooms(id) ON DELETE CASCADE,
  total_duration FLOAT NOT NULL,
  focus_segments_count INTEGER DEFAULT 0,
  analysis_confidence FLOAT,
  ai_recommendations JSONB, -- Array of recommendation strings
  processing_time INTEGER, -- in milliseconds
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Indici per performance
CREATE INDEX idx_focus_segments_room_id ON focus_segments(room_id);
CREATE INDEX idx_focus_segments_time ON focus_segments(start_time, end_time);
CREATE INDEX idx_focus_segments_ai_generated ON focus_segments(ai_generated);
CREATE INDEX idx_ai_editing_sessions_room_id ON ai_editing_sessions(room_id);

-- Trigger per aggiornare updated_at sui focus segments
CREATE TRIGGER update_focus_segments_updated_at 
BEFORE UPDATE ON focus_segments 
FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();