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
  recording_started_at TIMESTAMP WITH TIME ZONE, -- Timestamp esatto di inizio registrazione per sincronizzazione
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

-- Tabella per le raccomandazioni di velocità AI (senza cuts)
CREATE TABLE speed_recommendations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  room_id UUID REFERENCES rooms(id) ON DELETE CASCADE,
  start_time FLOAT NOT NULL,
  end_time FLOAT NOT NULL,
  speed FLOAT NOT NULL CHECK (speed > 0), -- 0.25-4.0 = playback speed (no cuts)
  reason TEXT,
  confidence FLOAT,
  recommendation_type TEXT CHECK (recommendation_type IN ('accelerate', 'slow_down')),
  ai_generated BOOLEAN DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Tabella per i segmenti tagliati/eliminati (AI + utente)
CREATE TABLE cut_segments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  room_id UUID REFERENCES rooms(id) ON DELETE CASCADE,
  start_time FLOAT NOT NULL,
  end_time FLOAT NOT NULL,
  reason TEXT, -- Motivo del taglio (es. "silence", "filler_words", "user_manual")
  confidence FLOAT, -- Solo per AI, NULL per tagli utente
  ai_generated BOOLEAN DEFAULT false, -- true se proposto dall'AI
  user_approved BOOLEAN DEFAULT NULL, -- NULL = non ancora deciso, true = accettato, false = rifiutato
  segment_type TEXT CHECK (segment_type IN ('silence', 'filler_words', 'repetition', 'low_energy', 'user_manual')),
  created_by TEXT DEFAULT 'user', -- 'ai_system' or 'user' or user_id
  applied BOOLEAN DEFAULT true, -- Se il taglio è attualmente applicato
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Indici per performance
CREATE INDEX idx_focus_segments_room_id ON focus_segments(room_id);
CREATE INDEX idx_focus_segments_time ON focus_segments(start_time, end_time);
CREATE INDEX idx_focus_segments_ai_generated ON focus_segments(ai_generated);
CREATE INDEX idx_ai_editing_sessions_room_id ON ai_editing_sessions(room_id);
CREATE INDEX idx_speed_recommendations_room_id ON speed_recommendations(room_id);
CREATE INDEX idx_speed_recommendations_time ON speed_recommendations(start_time, end_time);
CREATE INDEX idx_cut_segments_room_id ON cut_segments(room_id);
CREATE INDEX idx_cut_segments_time ON cut_segments(start_time, end_time);
CREATE INDEX idx_cut_segments_ai_generated ON cut_segments(ai_generated);
CREATE INDEX idx_cut_segments_applied ON cut_segments(applied);

-- Triggers per aggiornare updated_at
CREATE TRIGGER update_focus_segments_updated_at 
BEFORE UPDATE ON focus_segments 
FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_speed_recommendations_updated_at 
BEFORE UPDATE ON speed_recommendations 
FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_cut_segments_updated_at 
BEFORE UPDATE ON cut_segments 
FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();