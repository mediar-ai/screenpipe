## Improvements
- Eliminated 65% frame drop rate in recording pipeline (event-driven frame tracking replaces naive retry)
- Smooth crossfade transitions between frames in timeline (canvas double-buffering)
- Timeline never shows blank/gray loading screens — always displays last good frame

## Bug Fixes
- Fixed timeline frame jumping caused by auto-skip on video errors
- Fixed video chunk failures permanently blacklisting chunks (now retries after 30s)
- Fixed macOS native gray background bleeding through timeline frame container

#### **Full Changelog:** [58f26bc3..HEAD](https://github.com/mediar-ai/screenpipe/compare/58f26bc3..HEAD)
