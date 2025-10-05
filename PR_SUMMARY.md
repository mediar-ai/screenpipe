# Data Retention and Cleanup Feature - PR Summary

## Overview
This PR implements a configurable data retention and cleanup system for Screenpipe, addressing issue #929. The implementation provides users with flexible control over their data storage through automated cleanup and manual data management tools.

## Problem Solved
- Data grows rapidly (30GB/month at 1 FPS, 150GB/month at 5 FPS)
- Users need configurable retention to manage storage
- No existing mechanism to delete or archive old data
- Privacy concerns around long-term data retention

## Solution Implemented

### 1. CLI Flags
Added new command-line flags for data retention configuration:

```bash
# Automatic retention (keeps last 30 days, deletes older data)
screenpipe --data-retention-days 30

# Keep all data (default)
screenpipe --data-retention-days 0
```

**File**: `screenpipe-server/src/cli.rs`
- Added `data_retention_days: u64` field (default: 0)
- Comprehensive documentation and examples

### 2. Cleanup Subcommand
Implemented manual cleanup command with dry-run support:

```bash
# Preview what would be deleted (dry-run)
screenpipe cleanup --older-than-days 30 --dry-run

# Actually delete data older than 30 days
screenpipe cleanup --older-than-days 30

# Delete database records but keep files
screenpipe cleanup --older-than-days 30 --delete-files false
```

**File**: `screenpipe-server/src/cli.rs`
- New `Cleanup` command variant with options:
  - `older_than_days`: Override retention period
  - `data_dir`: Specify custom data directory
  - `dry_run`: Preview without deleting
  - `delete_files`: Control file deletion

### 3. Database Cleanup Methods
Added efficient database operations for data retention:

**File**: `screenpipe-db/src/db.rs`

**New Methods**:
- `get_video_chunks_before()`: Query video chunks older than timestamp
- `get_audio_chunks_before()`: Query audio chunks older than timestamp
- `delete_video_chunks_before()`: Delete video data and cascade to frames, OCR
- `delete_audio_chunks_before()`: Delete audio data and transcriptions
- `get_cleanup_stats()`: Get statistics about deletable data

**File**: `screenpipe-db/src/types.rs`
- Added `CleanupStats` struct to track deletion metrics

**Features**:
- Transactional safety (all-or-nothing deletion)
- Cascading deletion (removes related data)
- Efficient timestamp-based queries
- Statistics gathering before deletion

### 4. Cleanup Service
Implemented comprehensive cleanup service with background task support:

**File**: `screenpipe-server/src/cleanup.rs`

**Core Components**:

a) **CleanupConfig**:
```rust
pub struct CleanupConfig {
    pub retention_days: u64,
    pub delete_files: bool,
    pub dry_run: bool,
}
```

b) **CleanupResult**:
```rust
pub struct CleanupResult {
    pub stats: CleanupStats,
    pub video_files_deleted: u64,
    pub audio_files_deleted: u64,
    pub video_files_failed: u64,
    pub audio_files_failed: u64,
    pub bytes_freed: u64,
}
```

c) **Functions**:
- `cleanup_old_data()`: Main cleanup logic
- `format_cleanup_result()`: Pretty-print cleanup summary
- `start_background_cleanup()`: Automated 24h cleanup task
- `delete_file_with_stats()`: Safe file deletion with size tracking

**Features**:
- Dry-run mode for safe preview
- Comprehensive error handling
- File deletion with size tracking
- Missing file tolerance
- Detailed logging and statistics

### 5. Integration
Integrated cleanup into main server flow:

**File**: `screenpipe-server/src/bin/screenpipe-server.rs`

**Changes**:
- Command handler for `cleanup` subcommand
- Background cleanup task initialization (runs every 24 hours)
- Automatic activation when `data_retention_days > 0`

**File**: `screenpipe-server/src/lib.rs`
- Added `cleanup` module to public API

## Usage Examples

### Automatic Cleanup
```bash
# Start server with 30-day retention (auto-cleanup every 24h)
screenpipe --data-retention-days 30
```

### Manual Cleanup
```bash
# Preview cleanup
screenpipe cleanup --older-than-days 7 --dry-run

# Clean up data older than 7 days
screenpipe cleanup --older-than-days 7

# Clean up database but keep files
screenpipe cleanup --older-than-days 30 --delete-files false
```

### Output Example
```
Cleanup Summary
================

Database Records:
  Video chunks:           123
  Frames:                 4,567
  Audio chunks:           89
  Audio transcriptions:   1,234
  Total records:          6,013

Files:
  Video files deleted:    123
  Audio files deleted:    89
  Failed deletions:       0
  Total files:            212

Storage:
  Bytes freed:            2,345.67 MB
```

## Safety Features

1. **Dry-run Mode**: Preview deletions before executing
2. **Transactional**: Database operations are atomic
3. **Error Handling**: Graceful handling of missing files
4. **Logging**: Comprehensive logging of all operations
5. **Default Safety**: Retention disabled by default (0 days = keep all)

## Architecture Decisions

### Why This Approach?
1. **Start Simple**: Basic deletion with clear UX
2. **Iterate Later**: Foundation for future enhancements
3. **User Control**: Explicit configuration required
4. **Safety First**: Disabled by default, dry-run available

### Future Enhancements (Not in this PR)
Outlined in `ARCHIVE_DESIGN.md`:
- Cloud archiving (S3, Google Drive)
- Per-pipe configuration
- Soft delete / trash mechanism
- AI-powered selective pruning
- Compression before archiving

## Files Changed

### New Files
- `screenpipe-server/src/cleanup.rs` - Cleanup service implementation
- `ARCHIVE_DESIGN.md` - Comprehensive design documentation
- `PR_SUMMARY.md` - This document

### Modified Files
- `screenpipe-server/src/cli.rs` - CLI flags and cleanup command
- `screenpipe-server/src/lib.rs` - Module exports
- `screenpipe-server/src/bin/screenpipe-server.rs` - Command handler and integration
- `screenpipe-db/src/db.rs` - Database cleanup methods
- `screenpipe-db/src/types.rs` - CleanupStats type
- `screenpipe-db/src/lib.rs` - Type exports

## Testing Considerations

### Manual Testing
1. Test dry-run mode shows correct stats
2. Verify actual cleanup deletes data
3. Test background cleanup activation
4. Verify file deletion works correctly
5. Test with retention_days = 0 (disabled)
6. Test missing file handling

### Edge Cases Handled
- Empty database
- Missing files (already deleted)
- retention_days = 0 (disabled)
- Database locks during cleanup
- Failed file deletions

## Documentation

- **ARCHIVE_DESIGN.md**: Complete design document with:
  - Problem statement
  - Current architecture
  - Implementation details
  - UX design options
  - Future enhancements
  - Migration path

- **CLI Help**: Built-in documentation via `--help`
- **Code Comments**: Inline documentation for all public APIs

## Breaking Changes
None - Feature is opt-in and disabled by default.

## Performance Impact
- Minimal: Cleanup runs once per 24 hours (configurable)
- Efficient queries using timestamp indexes
- Batch deletion in transactions

## Related Issue
Closes #929

## Bounty Claim
/claim #929
