#!/usr/bin/env bash
# screenpipe — AI that knows everything you've seen, said, or heard
# https://screenpipe.com
set -euo pipefail
cd "$(git rev-parse --show-toplevel)"
command -v curl >/dev/null
command -v ffmpeg >/dev/null
mkdir -p work/bark-bench
for number in 1 2 3 4 5; do
  original="work/bark-bench/accuracy${number}-original.wav"
  curl --fail --location --silent --show-error \
    "https://media.githubusercontent.com/media/screenpipe/screenpipe/91d862d80/crates/screenpipe-audio/test_data/accuracy${number}.wav" \
    --output "$original"
  ffmpeg -y -loglevel error -i "$original" -ar 16000 -ac 1 -c:a pcm_s16le \
    "work/bark-bench/accuracy${number}.wav"
done
