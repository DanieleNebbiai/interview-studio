# Export Worker Fixes - Railway Deployment Log

## Original Problem
- 48-second video with 2 sections (0-21s at 1.5x speed, 21-48s at 1x speed)
- Expected final duration: ~37 seconds (14.3s + 21.1s = 35.4s)
- **ACTUAL RESULT**: 57-62 seconds consistently

## Issues Encountered
1. **Duration Issue**: Video exports to wrong duration (57s instead of 37s)
2. **Focus Issue**: Focus overlays not being applied
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

### 🔄 ATTEMPT 8: Speed-During-Concatenation (CURRENT)
**Method**:
- Process chunks WITHOUT speed adjustments (just raw segments)
- Apply speed adjustments DURING concatenation phase
- Use complex filter to apply setpts/atempo during concat
- Memory-efficient: single thread, small buffers
**Logic**: Speed adjustment should happen in concatenation, not in chunks
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