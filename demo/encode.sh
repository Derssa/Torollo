#!/usr/bin/env bash
# Derives every deliverable from the composed frame sequence:
#   out/torollo-demo-master.webm  lossless VP9 master (archival, not shipped)
#   out/torollo-demo.webm         website WebM (VP9)
#   out/torollo-demo.mp4          website MP4 fallback (H.264, yuv420p, faststart)
#   out/torollo-demo.gif          README GIF (< 5 MB, palette-optimized)
set -euo pipefail
cd "$(dirname "$0")"
# ffmpeg-static (npm devDependency) ships libx264 + libvpx-vp9 on every platform;
# distro builds (e.g. Fedora's) often lack H.264. Override with FFMPEG=/path/to/ffmpeg.
FFMPEG="${FFMPEG:-$(node -p "require('ffmpeg-static')")}"
FPS="${FPS:-30}"
GIF_FPS="${GIF_FPS:-15}"
GIF_WIDTH="${GIF_WIDTH:-1280}"

python3 compose.py --fps "$FPS"

$FFMPEG -y -loglevel error -framerate "$FPS" -i out/cfr/%05d.png \
  -c:v libvpx-vp9 -lossless 1 -pix_fmt yuv444p -row-mt 1 \
  out/torollo-demo-master.webm

$FFMPEG -y -loglevel error -i out/torollo-demo-master.webm \
  -c:v libvpx-vp9 -crf 24 -b:v 0 -deadline good -cpu-used 1 -row-mt 1 -pix_fmt yuv420p -an \
  out/torollo-demo.webm

$FFMPEG -y -loglevel error -i out/torollo-demo-master.webm \
  -c:v libx264 -preset slow -crf 19 -tune animation -pix_fmt yuv420p -movflags +faststart -an \
  out/torollo-demo.mp4

$FFMPEG -y -loglevel error -i out/torollo-demo-master.webm \
  -filter_complex "[0:v]fps=${GIF_FPS},scale=${GIF_WIDTH}:-2:flags=lanczos,split[a][b];[a]palettegen=max_colors=256:stats_mode=diff[p];[b][p]paletteuse=dither=bayer:bayer_scale=4:diff_mode=rectangle" \
  out/torollo-demo.gif

# Poster for the website <video>: the opening frame.
$FFMPEG -y -loglevel error -i out/torollo-demo-master.webm -frames:v 1 -q:v 2 out/torollo-demo-poster.jpg

for f in out/torollo-demo-master.webm out/torollo-demo.webm out/torollo-demo.mp4 out/torollo-demo.gif; do
  printf '%-32s %8.2f MB  ' "$f" "$(echo "$(stat -c %s "$f") / 1048576" | bc -l)"
  { $FFMPEG -hide_banner -i "$f" 2>&1 || true; } | grep -oE 'Duration: [0-9:.]+|Video: [a-z0-9]+.*? [0-9]+x[0-9]+' | tr '\n' ' '
  echo
done
