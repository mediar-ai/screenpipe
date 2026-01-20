# Data Manager Pipe

A screenpipe pipe for managing and cleaning up your local screenpipe data storage.

## Features

- **Storage Overview**: View total storage used by video chunks, audio chunks, and OCR text entries
- **Quick Cleanup**: Delete data older than a specified number of days (1, 7, 14, 30, or 90 days)
- **Delete Preview**: See exactly what will be deleted before confirming
- **Date Range Display**: Shows the date range of your stored data
- **Safe Deletion**: Confirmation modal prevents accidental data loss
- **Retention Policy**: Configure automatic data retention settings (days to keep, max storage limit)
- **Export Summary**: Export your data statistics and daily summary as JSON for backup/analysis

## Getting Started

Make sure screenpipe is running on port 3030, then:

```bash
bun i
bun dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser.

## How It Works

The pipe connects to your local screenpipe instance via the `/raw_sql` endpoint to:

1. Query storage statistics (video chunks, audio chunks, OCR entries)
2. Calculate estimated storage sizes
3. Preview data that will be deleted based on age
4. Execute cleanup operations in the correct order to maintain database integrity

## Storage Estimates

- Video chunks: ~5MB per chunk
- Audio chunks: ~500KB per chunk

## Delete Order

When cleaning up, data is deleted in this order to maintain referential integrity:

1. OCR text entries
2. Frames
3. Orphaned video chunks
4. Audio transcriptions
5. Audio chunks

## Deploy on screenpipe

Install this pipe through the [screenpipe Platform](https://screenpi.pe) or check out the [pipe deployment documentation](https://docs.screenpi.pe/plugins).


