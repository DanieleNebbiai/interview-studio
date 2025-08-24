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