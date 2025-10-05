# Screenpipe Archive Feature Design

## Problem Statement
Screenpipe data grows rapidly (30GB/month at 1 FPS, 150GB/month at 5 FPS). Users need:
- Configurable data retention
- Control over storage growth
- Privacy-focused data management
- Ability to archive or delete old data

## Current Architecture

### Data Storage
- **Database**: SQLite at `$HOME/.screenpipe/db.sqlite`
  - `video_chunks` - references to video files
  - `frames` - individual frame records with timestamps
  - `ocr_text` - OCR results linked to frames
  - `audio_chunks` - references to audio files
  - `audio_transcriptions` - transcription data with timestamps

- **Files**: Video and audio files stored on disk
  - Referenced by `file_path` column in chunks tables
  - Located in data directory

### Existing Cleanup
- Frame cache: 7 days retention, 10GB max size
- **No retention for main database/files**

## Proposed Solution: Simple Version (Phase 1)

### Overview
Add configurable data retention with automatic cleanup of old data. Start simple, iterate based on feedback.

### UX Design

#### Option 1: CLI Flags (Recommended for v1)
```bash
# Set retention period
screenpipe --data-retention-days 30

# Disable automatic cleanup (keep all data)
screenpipe --data-retention-days 0

# Run cleanup manually
screenpipe cleanup --older-than 30d
```

#### Option 2: Configuration File
Create `$HOME/.screenpipe/config.json`:
```json
{
  "retention": {
    "enabled": true,
    "days": 30,
    "cleanup_interval_hours": 24,
    "delete_files": true
  }
}
```

#### Option 3: API Endpoint (Future)
```bash
# Query retention status
GET /api/retention/status

# Update retention settings
POST /api/retention/config
{
  "days": 30,
  "enabled": true
}

# Trigger manual cleanup
POST /api/retention/cleanup?older_than=30d
```

### Implementation Details

#### 1. Database Schema Changes
Add to existing tables:
```sql
-- Track deletion status (for soft delete in future)
ALTER TABLE frames ADD COLUMN deleted_at TIMESTAMP NULL;
ALTER TABLE audio_chunks ADD COLUMN deleted_at TIMESTAMP NULL;
```

#### 2. Core Components

**A. Retention Configuration**
- Add to `cli.rs`:
  ```rust
  #[arg(long, default_value_t = 0)]
  pub data_retention_days: u64,
  ```

**B. Cleanup Service**
- Background task running every 24h (configurable)
- Deletes data older than retention period
- Deletes both DB records AND files

**C. Cleanup Logic**
```rust
async fn cleanup_old_data(
    db: &DatabaseManager,
    retention_days: u64,
    delete_files: bool,
) -> Result<CleanupStats> {
    let cutoff_time = Utc::now() - Duration::days(retention_days as i64);

    // 1. Find old video chunks
    let old_video_chunks = db.get_video_chunks_before(cutoff_time).await?;

    // 2. Delete files if enabled
    if delete_files {
        for chunk in &old_video_chunks {
            fs::remove_file(&chunk.file_path).await?;
        }
    }

    // 3. Delete from database (cascades to frames, ocr_text)
    db.delete_video_chunks_before(cutoff_time).await?;

    // 4. Same for audio chunks
    let old_audio_chunks = db.get_audio_chunks_before(cutoff_time).await?;
    if delete_files {
        for chunk in &old_audio_chunks {
            fs::remove_file(&chunk.file_path).await?;
        }
    }
    db.delete_audio_chunks_before(cutoff_time).await?;

    Ok(CleanupStats { /* ... */ })
}
```

#### 3. Safety Features
- Dry-run mode: preview what would be deleted
- Confirmation prompt for manual cleanup
- Logging of all deletions
- Ability to disable auto-cleanup (retention_days = 0)

### User Interface

#### CLI Output
```
Screenpipe v0.x.x
Data retention: 30 days
Next cleanup: in 23h 45m

Storage usage:
  Database: 2.3 GB
  Video files: 45.2 GB
  Audio files: 12.8 GB
  Total: 60.3 GB

Retention status:
  Keeping data since: 2025-09-05
  Eligible for cleanup: 15.2 GB (25%)
```

#### Manual Cleanup Command
```bash
$ screenpipe cleanup --older-than 30d --dry-run

Cleanup Preview (dry-run mode)
==============================
Cutoff date: 2025-09-05

Would delete:
  Video chunks: 1,234 files (12.3 GB)
  Audio chunks: 567 files (2.9 GB)
  Database records:
    - 45,678 frames
    - 12,345 audio transcriptions

Total space to free: 15.2 GB

Run without --dry-run to execute cleanup.
```

### Validation & Testing

#### Test Cases
1. Data older than retention period is deleted
2. Data within retention period is kept
3. Files are deleted when delete_files=true
4. Files are kept when delete_files=false
5. Cleanup runs on schedule
6. Manual cleanup works correctly
7. Dry-run mode doesn't delete anything
8. retention_days=0 disables cleanup

#### Edge Cases
- Empty database
- Missing files (already deleted manually)
- Database locks during cleanup
- Interrupted cleanup (atomicity)

## Future Enhancements (Phase 2+)

### Archive to Cloud
```rust
pub enum RetentionStrategy {
    Delete,
    ArchiveToS3 { bucket: String, prefix: String },
    ArchiveToGoogleDrive { folder_id: String },
}
```

### Per-Pipe Configuration
Allow pipes to specify their own retention:
```json
{
  "pipe_id": "my-important-pipe",
  "retention": {
    "override": true,
    "days": 90
  }
}
```

### Soft Delete / Trash
- Add `deleted_at` timestamp instead of hard delete
- Allow recovery within grace period
- Permanent deletion after grace period

### AI-Powered Pruning
- Analyze content importance
- Keep important moments, delete redundant frames
- User-configurable importance criteria

### Selective Archiving
- Archive by app (e.g., keep Slack, archive browsing)
- Archive by time of day (e.g., keep work hours)
- Archive by content (e.g., keep frames with faces)

## Migration Path

### Existing Users
- Default retention_days=0 (disabled) for backward compatibility
- Opt-in to retention
- One-time cleanup of very old data

### New Users
- Suggest sensible default (e.g., 30 days)
- Show storage projections during setup

## Metrics & Monitoring

Track and expose:
- Total storage used
- Data age distribution
- Cleanup statistics (records/files deleted)
- Storage savings from cleanup
- Time to next cleanup

## Open Questions

1. Should we compress old data before archiving?
2. Should cleanup be pause-able/cancel-able?
3. Should we support retention policies by data type (video vs audio)?
4. Should we warn users before first cleanup?

## Recommendations for v1

**Start with CLI flags approach:**
- `--data-retention-days <DAYS>` (default: 0 = disabled)
- `screenpipe cleanup` subcommand
- Background cleanup task (if retention > 0)
- Delete both DB records and files
- Dry-run mode for safety
- Clear logging and confirmation prompts

**Iterate based on feedback:**
- Add config file support
- Add API endpoints
- Add archive-to-cloud
- Add soft delete/trash
- Add per-pipe configuration

This keeps the initial implementation simple, safe, and easy to test while leaving room for future enhancements.
