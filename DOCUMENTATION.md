# Interview Studio - Documentazione Tecnica

## Panoramica
Interview Studio è una webapp per registrare e editare video interviste professionali. Permette agli utenti di creare room di registrazione, invitare partecipanti, processare automaticamente le registrazioni con trascrizione AI, e editare il video finale prima del download.

## Architettura Tecnica

### Stack Tecnologico
- **Frontend**: Next.js 14, React, TypeScript, Tailwind CSS
- **Backend**: Next.js API Routes
- **Database**: Supabase (PostgreSQL)
- **Video Recording**: Daily.co API
- **Trascrizione**: OpenAI Whisper API
- **File Storage**: Locale per processing, cloud per export

### Flusso Principale

#### 1. Recording (Pagina Home)
- Creazione room Daily.co
- Invito partecipanti tramite link
- Registrazione video/audio multi-partecipante
- Avvio automatico processing al termine

#### 2. Processing Pipeline (`/processing/[roomId]`)
**Step essenziali:**
1. **Fetch Recordings**: Download da Daily.co con polling automatico
2. **Transcribe**: Trascrizione con OpenAI Whisper
3. **Save**: Salvataggio su Supabase database

**Step disabilitati:**
- AI Editing: Generazione automatica focus segments (problematico)

#### 3. Video Editing (`/edit/[roomId]`)
**Funzionalità core:**
- Timeline video sincronizzata con tutti i partecipanti
- Gestione sezioni video (delete, speed, focus)
- Split points interattivi con drag & drop
- Auto-save delle modifiche
- Preview real-time con focus switching

#### 4. Export System
- Generazione video finale con modifiche applicate
- Multiple opzioni di qualità
- Download diretto

## Database Schema (Supabase)

### Tabelle Essenziali

#### `rooms`
```sql
- id (UUID, PK)
- daily_room_name (text)
- created_at (timestamp)
```

#### `video_sections`
```sql
- id (UUID, PK)
- room_id (UUID, FK)
- section_id (text) -- ID univoco sezione
- start_time (numeric)
- end_time (numeric)
- is_deleted (boolean)
- playback_speed (numeric, default 1.0)
- focused_participant_id (UUID, nullable) -- Focus su partecipante specifico
- created_by (text) -- 'ai' o 'user'
- user_modified (boolean, default false)
```

#### `recordings`
```sql
- id (UUID, PK)
- room_id (UUID, FK)
- daily_session_id (text)
- daily_recording_id (text)
- participant_session_id (text)
- file_path (text)
- duration (numeric)
- start_ts (timestamp) -- Timestamp inizio da Daily.co
```

#### `transcriptions`
```sql
- id (UUID, PK)
- recording_id (UUID, FK)
- text (text)
- segments (jsonb) -- Array segmenti Whisper con timestamps
```

## API Endpoints Critici

### `/api/recordings/fetch-by-room` (POST)
- Input: `{ roomId: string }`
- Output: Lista registrazioni scaricate da Daily.co
- Polling automatico per registrazioni finite

### `/api/recordings/transcribe` (POST)
- Input: `{ roomId: string, recordings: array }`
- Process: Invio file a OpenAI Whisper
- Output: Trascrizioni con segmenti temporali

### `/api/recordings/save` (POST)
- Input: `{ roomId, recordings, transcriptions }`
- Process: Salvataggio dati su Supabase
- Output: Conferma salvataggio

### `/api/edit/save` (POST)
- Input: `{ roomId: string, editState: EditState }`
- Process: Upsert video_sections con focused_participant_id
- Output: Statistiche modifiche salvate

### `/api/edit/save` (GET)
- Input: `?roomId=string`
- Process: Caricamento stato editing da database
- Output: EditState con video_sections convertite

## Componenti Chiave

### Timeline Editor (`/app/edit/[roomId]/page.tsx`)
**Funzionalità essenziali:**
- Sincronizzazione video multi-partecipante
- Gestione sezioni con proprietà (delete, speed, focus)
- Split points interattivi con drag & drop
- Context menu per azioni rapide
- Auto-save con debouncing

**Stato principale:**
```typescript
interface EditState {
  videoSections: VideoSection[]
  zoomRanges: ZoomRange[] // LEGACY - non usato
  splitPoints: number[]
}

interface VideoSection {
  id: string
  startTime: number
  endTime: number
  isDeleted: boolean
  playbackSpeed: number
  focusedParticipantId?: string // Focus su partecipante
}
```

### Processing Monitor (`/app/processing/[roomId]/page.tsx`)
- UI per monitoring step-by-step
- Gestione errori e retry automatici
- Redirect automatico a editor al completamento

## Flusso Dati Critico

### 1. Recording → Processing
```
Daily.co Recording → Download → Whisper Transcription → Supabase Storage
```

### 2. Editing → Export
```
Load EditState → Apply User Changes → Generate Video Sections → Export with Cuts
```

### 3. Focus System
```
VideoSection.focusedParticipantId → checkFocusState() → Switch Active Video Stream
```

## Configurazione Ambiente

### Variabili Essenziali
```env
NEXT_PUBLIC_SUPABASE_URL=your_supabase_url
NEXT_PUBLIC_SUPABASE_ANON_KEY=your_supabase_key
DAILY_API_KEY=your_daily_key
OPENAI_API_KEY=your_openai_key
```

### Daily.co Setup
- Account Daily.co con API access
- Webhook per notifiche fine registrazione (opzionale)
- Domain configurato per rooms

### Supabase Setup
- Database PostgreSQL
- Tabelle create con schema sopra
- RLS policies per sicurezza
- Storage bucket per file (se necessario)

## Note Implementative

### Sistema Focus
- **CORRENTE**: Basato su `video_sections.focused_participant_id`
- **LEGACY RIMOSSO**: Tabella `focus_segments` e `zoomRanges`
- Focus applicato automaticamente durante playback via `checkFocusState()`

### Split Points
- Punti di divisione timeline gestiti interattivamente
- Drag & drop per riposizionamento
- Context menu per eliminazione
- Auto-rigenerazione sezioni quando modificati

### AI Editing
- **STATO**: Temporaneamente disabilitato
- **MOTIVO**: Problemi con generazione focus segments su Supabase
- **FUTURO**: Re-implementazione con logica migliorata

### Performance
- Auto-save con debouncing (500ms)
- Polling intelligente per registrazioni Daily.co
- Context menu con gestione click outside
- Timeout estesi per trascrizioni lunghe (5 minuti)

## Troubleshooting

### Errori Comuni
1. **Registrazioni non trovate**: Verificare Daily.co API key e room name
2. **Trascrizione fallita**: Controllare OpenAI API key e quota
3. **Database errors**: Verificare schema Supabase e permissions
4. **Focus non funziona**: Controllare `focused_participant_id` nel database
5. **Split drag issues**: Verificare `recreateSectionsFromSplits()` logic

### Debug Tools
- Console logs dettagliati per ogni step
- Network tab per API calls
- Supabase dashboard per query inspection
- Daily.co dashboard per recording status