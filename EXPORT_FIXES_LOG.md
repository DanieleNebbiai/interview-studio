# Railway Export Worker - Documentazione Completa

## 🎯 Panoramica Sistema Export

Il sistema di export di Interview Studio utilizza un **worker dedicato** su Railway per il processing video intensivo, separato dal frontend Next.js su Vercel per ottimizzare performance e gestire i limiti di memoria.

### 🏗️ Architettura Export
```
┌─────────────────┐    ┌──────────────────┐    ┌─────────────────┐
│   Frontend      │    │   Supabase       │    │   Railway       │
│   (Vercel)      │────►│   Job Queue      │────►│   FFmpeg Worker │
│   /api/export   │    │   export_jobs    │    │   Node.js       │
└─────────────────┘    └──────────────────┘    └─────────────────┘
          │                       │                       │
          │                       │                       ▼
          │                       │            ┌─────────────────┐
          │                       │            │  Cloudflare R2  │
          └───────────────────────┼───────────►│   File Storage  │
                                  │            │   CDN Delivery  │
                                  │            └─────────────────┘
                                  │
                    ┌─────────────┴──────────┐
                    │    Status Polling      │
                    │  /api/export/status/   │
                    │   Real-time Updates    │
                    └────────────────────────┘
```

## ⚙️ Worker Railway - Funzionamento Interno

### Limitazioni Tecniche Critiche
- **Memoria Massima**: ~512MB prima di SIGKILL
- **CPU**: Condivisa, non dedicata
- **Storage Temporaneo**: Limitato, cleanup automatico necessario
- **Timeout**: Max 30 minuti per job
- **Concorrenza**: Un job alla volta per gestire memoria

### Pipeline di Processing

#### **Phase 1: Chunk Processing (Memory-Safe)**
```javascript
// Break video into manageable chunks
const CHUNK_MAX_DURATION = 30; // seconds
const chunks = createChunksFromSections(videoSections, CHUNK_MAX_DURATION);

// Process each chunk sequentially
for (const chunk of chunks) {
  await processChunk(chunk); // Max 128MB memory usage
  await gcDelay(2000); // Force garbage collection
}
```

#### **Phase 2: Concatenation & Export**
```javascript
// File-based concatenation (memory efficient)
await concatenateChunksMemorySafe(chunkFiles);

// Add subtitles in separate pass
await addSubtitlesToVideo(tempFile, finalFile, subtitleFile);

// Upload to Cloudflare R2
await uploadToStorage(finalFile);
```

## ⚠️ Punti Critici di Attenzione

### 🔥 Memory Management (PRIORITÀ MASSIMA)
- **SIGKILL Railway**: Se memoria >512MB → processo terminato istantaneamente
- **Chunk Size**: NEVER >30 secondi per chunk
- **Processing**: SEMPRE sequenziale, mai parallelo
- **GC Strategy**: Pause 2s + `global.gc()` tra ogni chunk
- **Monitoring**: Log memory usage ad ogni step

```javascript
// ✅ CORRETTO - Memory safe
const CHUNK_MAX_DURATION = 30;
await processChunk(chunk);
await new Promise(resolve => setTimeout(resolve, 2000));
if (global.gc) global.gc();

// ❌ ERRORE - Causa SIGKILL
const chunks = await Promise.all(chunkArray.map(processChunk));
```

### 🎬 Focus System (Già Risolto)
- **Mapping**: `recording.id` → `video_sections.focused_participant_id`
- **Timeline**: Focus applica full-screen overlay durante export
- **Conversione**: `recordingVideoMap[recording.id] = videoIndex`

### ⏱️ Subtitle Timing (Già Risolto)
- **Problema**: Timing sbagliato con sezioni eliminate
- **Soluzione**: `convertTimestampToFinalVideo()` function
- **Logica**: Mappa timeline originale → timeline finale post-editing

### 🔄 Speed Adjustment (Funzionante)
- **Chunk Level**: `setpts=PTS/${playbackSpeed}` + `atempo=${playbackSpeed}`
- **Audio Sync**: SEMPRE applicare atempo insieme a setpts
- **Concatenation**: File-based concat preserva timing

## 🚨 Cronologia Problemi Risolti
3. **Subtitle Issue**: Subtitles missing in some approaches
4. **Memory Issue**: SIGKILL errors with large videos (1+ hour content)

---

## Attempts Made (Chronological Order)

### ❌ ATTEMPT 1: FFmpeg Filter Speed Adjustment (FAILED)
**Date**: Initial approach
**Method**: Used complex FFmpeg filters with `setpts=PTS/1.5`
```ffmpeg
[0:v]trim=0:21.5,crop=720:720:280:0,scale=640:720,setpts=PTS/1.5[v0]
```
**Result**: 62 seconds duration
**Issue**: setpts with concatenation doesn't work properly

---

### ❌ ATTEMPT 2: Modified Speed Filters (FAILED)
**Method**: Changed from `setpts=PTS/1.5` to `fps=45,setpts=PTS*0.6667`
**Result**: Still 62 seconds
**Issue**: FPS approach doesn't actually change playback speed

---

### ❌ ATTEMPT 3: Two-Pass Processing (MEMORY KILLED)
**Method**:
- Process each section separately
- Concatenate using `concatenateSections()` function
- Memory monitoring during processing
**Result**: Sections processed correctly but SIGKILL during concatenation
**Issue**: Memory exhaustion on Railway (>512MB limit)

---

### ✅ ATTEMPT 4: Memory-Safe Chunk Processing (PARTIAL SUCCESS)
**Method**:
- Break sections into 30-second chunks
- Process sequentially with garbage collection
- Use `copy` codecs for concatenation
- Memory limit: 128MB sustained
**Result**:
- ✅ No SIGKILL errors
- ❌ Still 57 seconds duration
- ❌ Missing subtitles
- ✅ Audio correctly stops at ~35s (speed working)

---

### ✅ ATTEMPT 5: Added Subtitle Pass (SUBTITLE FIXED)
**Method**:
- Phase 1: Process chunks
- Phase 2: Concatenate with copy codecs
- Phase 3: Add subtitles in separate pass
**Result**:
- ✅ Subtitles now present
- ❌ Still 57 seconds duration
- ❌ Focus overlays missing

---

### ❌ ATTEMPT 6: Filter-Based Concatenation (SIGKILL)
**Method**:
- Changed from file-based concat demuxer to filter-based
- Use `[0:v][0:a][1:v][1:a]concat=n=2:v=1:a=1[outv][outa]`
- Re-encode during concatenation instead of copy
- Fix focus segment filtering (intersection vs containment)
**Result**: SIGKILL during concatenation phase
**Issue**: Filter-based concatenation uses too much memory (153MB → SIGKILL)
**Note**: ✅ Focus segments now detected correctly in chunks

---

### ❌ ATTEMPT 7: File-Based Concat with Re-Encoding (PARTIAL)
**Method**:
- Back to file-based concat demuxer (to save memory)
- BUT force re-encoding instead of copy (to preserve speed)
- Ultra-low bitrates and buffer sizes to minimize memory
- Settings: CRF 28, 200k video bitrate, 64k audio bitrate
**Result**: ✅ SIGKILL resolved, ❌ Still 57 seconds duration
**Issue**: Speed adjustments in chunks get lost during file-based concatenation

---

### ❌ ATTEMPT 8: Speed-During-Concatenation (SIGKILL)
**Method**:
- Process chunks WITHOUT speed adjustments (just raw segments)
- Apply speed adjustments DURING concatenation phase
- Use complex filter to apply setpts/atempo during concat
- Memory-efficient: single thread, small buffers
**Result**: SIGKILL during concatenation phase again
**Issue**: Any complex filter (even with small buffers) causes memory spike on Railway
**Note**: ✅ Chunks process fine (113MB), ❌ Complex filter concatenation fails

---

### 🔄 ATTEMPT 9: Ultra-Simple Sequential Processing (CURRENT)
**Method**:
- Process raw chunks (no speed adjustment)
- Apply speed to each chunk individually (one at a time) using basic filters
- Simple file-based concatenation with copy codecs
- Ultra-low settings: 64k buffer, 100k bitrate, CRF 30
**Logic**: Avoid all complex filters, use only basic videoFilters/audioFilters
**Pipeline**: Raw chunks → Individual speed adjustment → Simple concat → Subtitles
**Status**: Testing in progress

---

## Technical Findings

### Duration Calculation
- **Expected Logic**: (21.5s / 1.5) + (21.1s / 1) = 14.3s + 21.1s = 35.4s
- **Chunk Processing**: Each chunk correctly applies speed (logs show proper calculations)
- **Audio Behavior**: Audio correctly stops at ~35s (proves speed adjustment works)
- **Video Duration**: Remains 57s (concatenation issue)

### Memory Management
- **Railway Limit**: ~512MB before SIGKILL
- **Our Usage**: Sustained 128-129MB with chunking approach
- **Chunk Size**: 30 seconds max per chunk
- **GC Strategy**: 2-second pause + explicit garbage collection between chunks

### Focus Overlays
- **Original Logic**: `fs.startTime >= chunk.startTime && fs.endTime <= chunk.endTime` (containment)
- **Fixed Logic**: `fs.startTime < chunk.endTime && fs.endTime > chunk.startTime` (intersection)
- **Issue**: Focus segments likely span chunk boundaries

### Concatenation Methods Tried
1. **Complex Filter Approach**: ❌ Duration issues with setpts
2. **File-based concat demuxer**: ❌ Doesn't preserve speed adjustments
3. **Filter-based concat**: 🔄 Current approach (should work)

---

## Working Configuration (Current)

### Architecture
```
Phase 1: Chunk Processing
├── Break sections into ≤30s chunks
├── Apply speed adjustments (setpts + atempo)
├── Process 50/50 layout + focus overlays
└── Output individual chunk files

Phase 2: Filter-Based Concatenation
├── Use concat filter (not demuxer)
├── Re-encode to preserve timing
└── Output temporary concatenated file

Phase 3: Subtitle Addition
├── Add SRT subtitles with styling
├── Memory-efficient single-pass
└── Output final video
```

### Memory Limits
- **Threads**: 1-2 max
- **Buffers**: 256k-512k
- **Processing**: Sequential only (never parallel)
- **GC**: Explicit garbage collection between phases

### Railway Performance
- **Memory**: Sustained 128MB (well under 512MB limit)
- **Processing Speed**: ~2-3 minutes for 48s video
- **Stability**: No SIGKILL errors with chunking approach

---

## Next Steps if Current Fix Fails

1. **Debug Concatenation Timing**
   - Add explicit duration parameters to concat filter
   - Force output frame rate consistency

2. **Alternative Concatenation**
   - Try intermediate format (like .mkv) for concatenation
   - Use ffmpeg concat protocol instead of filter

3. **Timestamp Investigation**
   - Check PTS (presentation timestamps) in chunk files
   - Verify timing consistency between chunks

4. **Focus Overlay Debug**
   - Add more detailed logging for focus segment processing
   - Verify participant ID mapping is correct

---

## Commands to NOT Try Again

❌ `setpts=PTS*0.6667` - Doesn't work with concatenation
❌ `fps=45` approach - Changes frame rate, not speed
❌ File-based concat demuxer with copy codecs - Ignores speed adjustments
❌ Processing all chunks in parallel - Causes memory issues
❌ Single-pass processing for long videos - SIGKILL on Railway

## Commands That Work

✅ `setpts=PTS/${playbackSpeed}` - Works for individual chunks
✅ `atempo=${playbackSpeed}` - Audio speed adjustment
✅ Sequential chunk processing with GC - Memory stable
✅ Filter-based concatenation - Should preserve timing
✅ Separate subtitle pass - Adds subtitles without memory issues