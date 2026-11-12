#!/usr/bin/env bash
# Prepare a video for the website before it is uploaded to the CMS media library.
#
#   scripts/prepare-video.sh <input> [output.mp4] [--logo logo.png] [--audio] [--max-width 1920] [--crf 24]
#
# What it does
#   - H.264 MP4, 8-bit 4:2:0, at most --max-width wide: plays on every browser and phone.
#   - `+faststart`: playback starts before the whole file is downloaded, and seeking works.
#   - No audio track unless --audio: the site's player is muted.
#   - --logo: a semi-transparent logo in the bottom-right corner (15% of the width).
#     Put the watermark on EVERY public video; a copy taken from the site keeps it.
#
# The result should be 10 to 30 MB for a 10 to 20 second clip. The script warns when it
# is over 50 MB and stops when it is over 100 MB (the upload limit of the proxied
# storage host, see docs/deploy-digitalocean.md). Needs ffmpeg and ffprobe.
set -euo pipefail

MAX_WIDTH=1920
CRF=24
KEEP_AUDIO=0
LOGO=""
WARN_MB=50
LIMIT_MB=100
LOGO_SHARE=0.15
LOGO_OPACITY=0.7
LOGO_MARGIN=24

die() {
  printf 'error: %s\n' "$*" >&2
  exit 1
}

usage() {
  sed -n '2,17p' "$0" | sed 's/^# \{0,1\}//'
  exit "${1:-0}"
}

input=""
output=""
while [ "$#" -gt 0 ]; do
  case "$1" in
    -h | --help) usage 0 ;;
    --logo)
      LOGO="${2:-}"
      shift 2
      ;;
    --audio)
      KEEP_AUDIO=1
      shift
      ;;
    --max-width)
      MAX_WIDTH="${2:-}"
      shift 2
      ;;
    --crf)
      CRF="${2:-}"
      shift 2
      ;;
    -*) die "unknown option: $1 (see --help)" ;;
    *)
      if [ -z "$input" ]; then input="$1"; elif [ -z "$output" ]; then output="$1"; else die "too many arguments"; fi
      shift
      ;;
  esac
done

[ -n "$input" ] || usage 1
command -v ffmpeg >/dev/null || die "ffmpeg is not installed (brew install ffmpeg)"
command -v ffprobe >/dev/null || die "ffprobe is not installed (it comes with ffmpeg)"
[ -f "$input" ] || die "no such file: $input"
[ -z "$LOGO" ] || [ -f "$LOGO" ] || die "no such logo file: $LOGO"
case "$MAX_WIDTH" in '' | *[!0-9]*) die "--max-width must be a number" ;; esac
case "$CRF" in '' | *[!0-9]*) die "--crf must be a number" ;; esac
ffprobe -v error -select_streams v:0 -show_entries stream=codec_name -of csv=p=0 "$input" | grep -q . ||
  die "$input has no video track"
# A picture also has a "video stream", but no length.
in_duration=$(ffprobe -v error -show_entries format=duration -of csv=p=0 "$input" 2>/dev/null || true)
awk -v d="${in_duration:-0}" 'BEGIN { exit !(d + 0 >= 0.5) }' || die "$input is not a video (no duration)"

if [ -z "$output" ]; then
  base="${input%.*}"
  output="${base}-web.mp4"
fi
[ "$output" != "$input" ] || die "the output file must differ from the input"

audio_args=(-an)
if [ "$KEEP_AUDIO" = 1 ]; then
  audio_args=(-c:a aac -b:a 128k)
fi

# Never enlarge: min(MAX_WIDTH, input width), rounded to an even number (H.264 needs it).
scale="scale='min(${MAX_WIDTH},iw)':-2"

common=(-c:v libx264 -preset slow -crf "$CRF" -pix_fmt yuv420p -movflags +faststart)

if [ -n "$LOGO" ]; then
  # The logo is sized from the finished video's width, then blended in.
  filter="[0:v]${scale}[v];[1:v][v]scale2ref=w=ref_w*${LOGO_SHARE}:h=ow/mdar[wm][vid];"
  filter+="[wm]format=rgba,colorchannelmixer=aa=${LOGO_OPACITY}[wm2];"
  filter+="[vid][wm2]overlay=W-w-${LOGO_MARGIN}:H-h-${LOGO_MARGIN}:format=auto,format=yuv420p[out]"
  ffmpeg -hide_banner -loglevel error -stats -y -i "$input" -i "$LOGO" \
    -filter_complex "$filter" -map "[out]" $([ "$KEEP_AUDIO" = 1 ] && echo "-map 0:a?") \
    "${common[@]}" "${audio_args[@]}" "$output"
else
  ffmpeg -hide_banner -loglevel error -stats -y -i "$input" -vf "$scale" "${common[@]}" "${audio_args[@]}" "$output"
fi

size_bytes=$(wc -c <"$output" | tr -d ' ')
size_mb=$((size_bytes / 1048576))
size_label=$(awk -v b="$size_bytes" 'BEGIN { printf "%.1f", b / 1048576 }')
duration=$(ffprobe -v error -show_entries format=duration -of csv=p=0 "$output" | cut -d. -f1)
dims=$(ffprobe -v error -select_streams v:0 -show_entries stream=width,height -of csv=s=x:p=0 "$output")
printf 'written %s: %s MB, %ss, %s\n' "$output" "$size_label" "${duration:-?}" "$dims"

if [ "$size_mb" -ge "$LIMIT_MB" ]; then
  rm -f "$output"
  die "over ${LIMIT_MB} MB: it cannot be uploaded. Use a higher --crf (28), a smaller --max-width (1280) or a shorter clip."
fi
if [ "$size_mb" -ge "$WARN_MB" ]; then
  printf 'warning: over %s MB. Visitors download all of it: try --crf 28 or --max-width 1280.\n' "$WARN_MB" >&2
fi
