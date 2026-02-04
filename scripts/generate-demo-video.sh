#!/bin/bash
# Generate screenpipe demo video from real screen data
# Concept #5: "1,000 Screenshots" — rapid montage + search moment
# Concept #3: "Speed" — full day compressed + clarity moment
#
# Usage: ./generate-demo-video.sh [concept3|concept5] [date: 2026-02-03]

set -e

CONCEPT="${1:-concept5}"
DATE="${2:-2026-02-04}"
DATA_DIR="$HOME/.screenpipe/data"
OUT_DIR="$HOME/Desktop/demo-video"
MUSIC_DIR="$OUT_DIR/music"
mkdir -p "$OUT_DIR/frames" "$OUT_DIR/segments" "$MUSIC_DIR"

echo "🎬 Generating $CONCEPT for $DATE"
echo "📁 Output: $OUT_DIR"

# ============================================
# STEP 1: Extract frames from video clips
# ============================================
echo "📸 Step 1: Extracting frames from $DATE clips..."

# Get clips for the target date (monitor_1 = main display)
CLIPS=$(ls "$DATA_DIR"/monitor_*"${DATE}"*.mp4 2>/dev/null | sort)
CLIP_COUNT=$(echo "$CLIPS" | wc -l | tr -d ' ')
echo "   Found $CLIP_COUNT clips"

if [ "$CONCEPT" = "concept5" ]; then
    # Concept 5: Extract 1 frame from every Nth clip (target ~1000 frames)
    N=$((CLIP_COUNT / 1000 + 1))
    [ "$N" -lt 1 ] && N=1
    echo "   Sampling every ${N}th clip for ~1000 frames"
    
    COUNT=0
    IDX=0
    echo "$CLIPS" | while read -r clip; do
        IDX=$((IDX + 1))
        if [ $((IDX % N)) -eq 0 ]; then
            COUNT=$((COUNT + 1))
            ffmpeg -y -v quiet -i "$clip" -vf "select=eq(n\,0)" -frames:v 1 \
                "$OUT_DIR/frames/frame_$(printf '%05d' $COUNT).jpg" 2>/dev/null
        fi
    done
    
    FRAME_COUNT=$(ls "$OUT_DIR/frames/"frame_*.jpg 2>/dev/null | wc -l | tr -d ' ')
    echo "   Extracted $FRAME_COUNT frames"

    # ============================================
    # STEP 2: Create rapid montage (3 frames/sec)
    # ============================================
    echo "🎞️  Step 2: Creating rapid montage..."
    
    ffmpeg -y -framerate 3 -pattern_type glob -i "$OUT_DIR/frames/frame_*.jpg" \
        -vf "scale=1920:1080:force_original_aspect_ratio=decrease,pad=1920:1080:(ow-iw)/2:(oh-ih)/2:black" \
        -c:v libx264 -pix_fmt yuv420p -crf 18 \
        "$OUT_DIR/segments/01_montage.mp4" 2>/dev/null
    
    echo "   ✅ Montage: $(ffprobe -v quiet -show_format "$OUT_DIR/segments/01_montage.mp4" | grep duration | head -1)"

elif [ "$CONCEPT" = "concept3" ]; then
    # Concept 3: Concat all clips at 16x speed
    echo "   Creating clip list for concatenation..."
    
    # Create file list for ffmpeg concat
    echo "$CLIPS" | head -200 | while read -r clip; do
        echo "file '$clip'"
    done > "$OUT_DIR/cliplist.txt"
    
    echo "⚡ Step 2: Concatenating + speeding up 16x..."
    
    # Concat first, then speed up
    ffmpeg -y -v quiet -f concat -safe 0 -i "$OUT_DIR/cliplist.txt" \
        -vf "setpts=PTS/16,scale=1920:1080" \
        -c:v libx264 -pix_fmt yuv420p -crf 23 \
        -t 300 \
        "$OUT_DIR/segments/01_speedup.mp4" 2>/dev/null
    
    echo "   ✅ Speed video created"
fi

# ============================================
# STEP 3: Generate text overlays
# ============================================
echo "✍️  Step 3: Creating text overlays..."

# Opening text: black screen with white text
ffmpeg -y -v quiet -f lavfi -i color=c=black:s=1920x1080:d=3 \
    -vf "drawtext=text='you lived 16 hours today':fontcolor=white:fontsize=72:font=Courier:x=(w-tw)/2:y=(h-th)/2" \
    -c:v libx264 -pix_fmt yuv420p \
    "$OUT_DIR/segments/00_intro_text.mp4" 2>/dev/null

# Closing text
ffmpeg -y -v quiet -f lavfi -i color=c=black:s=1920x1080:d=4 \
    -vf "drawtext=text='remember all of it.':fontcolor=white:fontsize=72:font=Courier:x=(w-tw)/2:y=(h-th)/2" \
    -c:v libx264 -pix_fmt yuv420p \
    "$OUT_DIR/segments/99_closing_text.mp4" 2>/dev/null

# Screenpipe branding
ffmpeg -y -v quiet -f lavfi -i color=c=black:s=1920x1080:d=3 \
    -vf "drawtext=text='screenpi.pe':fontcolor=white:fontsize=60:font=Courier:x=(w-tw)/2:y=(h-th)/2" \
    -c:v libx264 -pix_fmt yuv420p \
    "$OUT_DIR/segments/99_brand.mp4" 2>/dev/null

echo "   ✅ Text overlays created"

# ============================================
# STEP 4: Final assembly
# ============================================
echo "🔧 Step 4: Assembling final video..."

# Create concat list
ls "$OUT_DIR/segments/"*.mp4 | sort | while read -r seg; do
    echo "file '$seg'"
done > "$OUT_DIR/final_list.txt"

ffmpeg -y -v quiet -f concat -safe 0 -i "$OUT_DIR/final_list.txt" \
    -c:v libx264 -pix_fmt yuv420p -crf 18 \
    "$OUT_DIR/demo_no_music.mp4" 2>/dev/null

DURATION=$(ffprobe -v quiet -show_entries format=duration -of csv=p=0 "$OUT_DIR/demo_no_music.mp4" | cut -d. -f1)
echo "   ✅ Video assembled: ${DURATION}s"

echo ""
echo "============================================"
echo "🎬 DONE! Output: $OUT_DIR/demo_no_music.mp4"
echo "============================================"
echo ""
echo "NEXT STEPS (manual):"
echo "1. Download royalty-free classical music to $MUSIC_DIR/"
echo "   - Vivaldi Storm: https://www.youtube.com/results?search_query=vivaldi+four+seasons+storm+royalty+free"
echo "   - Ravel Bolero: public domain"
echo "   - Chopin Nocturne: public domain"
echo ""
echo "2. Add music:"
echo "   ffmpeg -i $OUT_DIR/demo_no_music.mp4 -i $MUSIC_DIR/music.mp3 \\"
echo "     -c:v copy -c:a aac -shortest -map 0:v -map 1:a \\"
echo "     $OUT_DIR/demo_final.mp4"
echo ""
echo "3. Record ONE manual clip: you opening screenpipe search,"
echo "   typing a query, finding the exact moment. Append it"
echo "   before the closing text for the 'clarity from chaos' moment."
echo ""
echo "4. Upload to YouTube with A/B titles from the script."
