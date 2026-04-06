#!/usr/bin/env bash
# Convert MP4 videos with white backgrounds to WebM VP9 + Alpha channel.
#
# Prerequisites: ffmpeg with libvpx-vp9 support
#   Windows: choco install ffmpeg  OR  winget install ffmpeg
#   macOS:   brew install ffmpeg
#
# Usage:
#   bash scripts/convert-videos.sh              # convert all mp4 in videos/
#   bash scripts/convert-videos.sh --dry-run    # preview commands only

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
SRC_DIR="$SCRIPT_DIR/../videos"
DST_DIR="$SCRIPT_DIR/../app/src-tauri/resources/videos"
DRY_RUN=false

[[ "${1:-}" == "--dry-run" ]] && DRY_RUN=true

mkdir -p "$DST_DIR"

count=0
total=$(find "$SRC_DIR" -maxdepth 1 -name '*.mp4' | wc -l)

echo "Converting $total MP4 files → WebM VP9+Alpha (384x384, 15fps)"
echo "Source: $SRC_DIR"
echo "Output: $DST_DIR"
echo ""

for src in "$SRC_DIR"/*.mp4; do
  basename="$(basename "$src" .mp4)"
  dst="$DST_DIR/${basename}.webm"
  count=$((count + 1))

  if [[ -f "$dst" ]]; then
    echo "[$count/$total] SKIP (exists): $basename.webm"
    continue
  fi

  echo "[$count/$total] Converting: $basename.mp4 → $basename.webm"

  if [[ "$DRY_RUN" == "true" ]]; then
    echo "  ffmpeg -i \"$src\" -filter_complex ... -c:v libvpx-vp9 \"$dst\""
    continue
  fi

  ffmpeg -y -i "$src" \
    -filter_complex "[0:v]colorkey=0xFFFFFF:0.3:0.08,format=yuva420p,scale=384:384,fps=15[out]" \
    -map "[out]" \
    -c:v libvpx-vp9 \
    -pix_fmt yuva420p \
    -crf 35 \
    -b:v 0 \
    -an \
    -auto-alt-ref 0 \
    "$dst" \
    2>/dev/null

  size=$(du -h "$dst" | cut -f1)
  echo "  → $size"
done

echo ""
echo "Done! $count files processed."
echo "Output directory: $DST_DIR"

if [[ "$DRY_RUN" == "false" ]]; then
  total_size=$(du -sh "$DST_DIR" | cut -f1)
  echo "Total size: $total_size"
fi
