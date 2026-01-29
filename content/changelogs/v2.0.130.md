## Bug Fixes
- Fixed search results showing wrong images: OCR text now correctly matches video frames even under heavy load
- Fixed timeline audio duplication: audio entries no longer repeat for each text region on screen

## Improvements
- FrameWriteTracker: New architecture ensures video frame offsets stay synchronized with database entries
- Better frame dropping behavior: frames dropped from video queue are now properly skipped in database

#### **Full Changelog:** [7060274d..HEAD](https://github.com/mediar-ai/screenpipe/compare/7060274d..HEAD)
