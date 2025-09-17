# Interview Studio - Documentazione Completa

## 🎯 Panoramica del Progetto

**Interview Studio** è una piattaforma completa per registrare, elaborare e editare video interviste professionali. La webapp permette di:

- **Registrare** interviste multi-partecipante con tracce video/audio separate
- **Processare** automaticamente le registrazioni con trascrizione AI (OpenAI Whisper)
- **Editare** i video con timeline interattiva, gestione focus, velocità e eliminazione sezioni
- **Esportare** video finali con modifiche applicate, sottotitoli sincronizzati e focus dinamico

### 🎥 Funzionalità Principali

#### 1. **Sistema di Registrazione**
- Integrazione con **Daily.co** per video conferencing professionale
- Registrazione **multi-track** separata per ogni partecipante
- **Room management** con inviti via link condivisibile
- Qualità video **broadcast-ready** (fino a 1080p)

#### 2. **Processing Pipeline Automatizzata**
- **Download automatico** registrazioni da Daily.co con polling intelligente
- **Trascrizione AI** con OpenAI Whisper (word-level timestamps)
- **Sincronizzazione video** multi-partecipante basata su timestamp
- **Salvataggio strutturato** su database Supabase

#### 3. **Editor Video Interattivo**
- **Timeline sincronizzata** con anteprima real-time di tutti i partecipanti
- **Gestione sezioni**: eliminazione, modifica velocità (0.5x-3x), focus partecipante
- **Split points** interattivi con drag & drop per divisione timeline
- **Auto-save** con debouncing e gestione conflitti
- **Context menu** per azioni rapide su sezioni e split

#### 4. **Sistema Export Avanzato**
- **Rendering video** con FFmpeg su Railway worker dedicato
- **Gestione memoria** ottimizzata per video lunghi (chunk processing)
- **Focus dinamico**: switch automatico tra partecipanti basato su editing
- **Sottotitoli sincronizzati** con timing corretto per sezioni eliminate
- **Multiple output** con Cloudflare R2 storage e download diretto

#### 5. **Autenticazione e Gestione Utenti**
- Sistema auth con **Supabase Auth** (Google, email/password)
- **Gestione sessioni** e permessi per room private
- **Cronologia registrazioni** personale con metadata dettagliati

### 🏗️ Architettura del Sistema

```
┌─────────────────┐    ┌──────────────────┐    ┌─────────────────┐
│   Frontend      │    │   Backend API    │    │  External APIs  │
│   Next.js 14    │◄──►│  Next.js Routes  │◄──►│   Daily.co      │
│   React/TS      │    │  Supabase        │    │   OpenAI        │
│   Tailwind/UI   │    │  Authentication  │    │   Railway       │
└─────────────────┘    └──────────────────┘    └─────────────────┘
          │                       │                       │
          │                       ▼                       │
          │            ┌──────────────────┐               │
          │            │   Database       │               │
          └───────────►│   PostgreSQL     │◄──────────────┘
                      │   (Supabase)     │
                      └──────────────────┘
                               │
                               ▼
                    ┌─────────────────────┐
                    │   Export Worker     │
                    │   FFmpeg/Node.js    │
                    │   (Railway)         │
                    └─────────────────────┘
                               │
                               ▼
                    ┌─────────────────────┐
                    │   File Storage      │
                    │   Cloudflare R2     │
                    │   (CDN Delivery)    │
                    └─────────────────────┘
```

## 🔧 Stack Tecnologico Completo

### Frontend Stack
- **Framework**: Next.js 14 con App Router
- **UI Library**: React 18 + TypeScript
- **Styling**: Tailwind CSS + shadcn/ui components
- **State Management**: React hooks (useState, useEffect, custom hooks)
- **Animations**: Tailwind transitions + Lucide React icons

### Backend Stack
- **API**: Next.js 14 API Routes (serverless)
- **Database**: Supabase PostgreSQL con RLS (Row Level Security)
- **Authentication**: Supabase Auth (Google OAuth, Email/Password)
- **File Upload**: Multipart form data handling
- **Queue System**: Supabase-based job queue per export

### External Services
- **Video Conferencing**: Daily.co REST API + WebRTC SDK
- **AI Transcription**: OpenAI Whisper API (whisper-1 model)
- **Video Processing**: FFmpeg su Railway worker dedicato
- **File Storage**: Cloudflare R2 (S3-compatible) + CDN
- **Deployment**: Vercel (frontend/API) + Railway (worker)

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