# Cloud Sync Implementation Plan - Next Steps

## Current Status ✅
- Database migration (tables, RPC functions, triggers)
- Backend API routes (init, upload, download, search, status, devices)
- Unit tests (29 passing)
- TypeScript types

---

## Phase 1: Rust Encryption Module

**Location**: `screenpipe-core/src/sync/` (new module)

### 1.1 Crypto Primitives
```rust
// crypto.rs
- argon2id_derive_key(password, salt) -> DerivedKey
- chacha20_encrypt(data, key, nonce) -> EncryptedData
- chacha20_decrypt(encrypted, key, nonce) -> Data
- hmac_sha256(data, key) -> Token
- generate_nonce() -> [u8; 12]
- generate_salt() -> [u8; 32]
```

**Crates needed**:
- `argon2` - key derivation
- `chacha20poly1305` - encryption
- `hmac` + `sha2` - search tokens
- `rand` - nonce/salt generation

### 1.2 Key Management
```rust
// keys.rs
struct SyncKeys {
    master_key: [u8; 32],
    data_key: [u8; 32],      // derived from master
    search_key: [u8; 32],    // derived from master
}

- derive_keys_from_password(password, salt, encrypted_master_key) -> SyncKeys
- generate_new_master_key() -> (MasterKey, EncryptedMasterKey, Salt)
- rotate_master_key(old_keys, new_password) -> NewKeys
```

### 1.3 Blob Encryption
```rust
// blob.rs
struct EncryptedBlob {
    ciphertext: Vec<u8>,
    nonce: [u8; 12],
    checksum: String,  // SHA256 of plaintext
}

- encrypt_blob(data, data_key) -> EncryptedBlob
- decrypt_blob(encrypted, data_key) -> Data
- generate_search_tokens(text, search_key) -> Vec<Token>
```

---

## Phase 2: Sync Client

**Location**: `screenpipe-core/src/sync/client.rs`

### 2.1 API Client
```rust
struct SyncClient {
    base_url: String,
    auth_token: String,
    device_id: String,
}

impl SyncClient {
    // Auth & Init
    async fn init(password, device_info) -> Result<SyncKeys>

    // Upload
    async fn request_upload(blob_meta) -> Result<UploadUrl>
    async fn upload_to_s3(url, encrypted_data) -> Result<()>
    async fn complete_upload(blob_id) -> Result<()>

    // Download
    async fn get_download_urls(blob_ids) -> Result<Vec<DownloadInfo>>
    async fn download_from_s3(url) -> Result<EncryptedData>

    // Search
    async fn search(tokens, time_range) -> Result<Vec<BlobMatch>>

    // Status
    async fn get_status() -> Result<SyncStatus>
    async fn list_devices() -> Result<Vec<Device>>
}
```

### 2.2 Data Packager
```rust
// packager.rs
// Bundles screenpipe data into uploadable blobs

struct BlobPackager {
    db: DatabaseConnection,
    keys: SyncKeys,
}

impl BlobPackager {
    // Package frames from time range into encrypted blob
    async fn package_frames(start, end) -> Result<EncryptedBlob>

    // Package audio chunks
    async fn package_audio(start, end) -> Result<EncryptedBlob>

    // Package transcripts + OCR (text-only, smaller)
    async fn package_text(start, end) -> Result<EncryptedBlob>

    // Extract search tokens from text content
    fn extract_tokens(text) -> Vec<String>
}
```

### 2.3 Data Unpacker
```rust
// unpacker.rs
// Decrypts and imports cloud data into local DB

struct BlobUnpacker {
    db: DatabaseConnection,
    keys: SyncKeys,
}

impl BlobUnpacker {
    async fn unpack_and_import(encrypted_blob, blob_type) -> Result<()>
}
```

---

## Phase 3: Sync Service

**Location**: `screenpipe-server/src/sync_service.rs`

### 3.1 Background Sync Manager
```rust
struct SyncService {
    client: SyncClient,
    packager: BlobPackager,
    config: SyncConfig,
}

struct SyncConfig {
    enabled: bool,
    sync_interval_minutes: u32,
    sync_types: Vec<BlobType>,  // frames, audio, text
    bandwidth_limit_mbps: Option<u32>,
}

impl SyncService {
    // Main sync loop
    async fn start_background_sync(&self)

    // Upload new local data to cloud
    async fn sync_upload(&self) -> Result<SyncReport>

    // Track what's been synced
    async fn get_last_sync_time(&self) -> Option<DateTime>
    async fn mark_synced(&self, blob_id, time_range)
}
```

### 3.2 Sync State Tracking
```sql
-- New local table to track what's synced
CREATE TABLE sync_state (
    id INTEGER PRIMARY KEY,
    blob_type TEXT NOT NULL,
    time_start TIMESTAMP NOT NULL,
    time_end TIMESTAMP NOT NULL,
    cloud_blob_id TEXT NOT NULL,
    synced_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
```

---

## Phase 4: Settings UI

**Location**: `screenpipe-app-tauri/components/settings/sync-settings.tsx`

### 4.1 Components
```
SyncSettings
├── SyncToggle (enable/disable)
├── SyncLogin (email/password for cloud account)
├── SyncStatus
│   ├── StorageUsage (progress bar: 30GB / 100GB)
│   ├── LastSyncTime
│   └── SyncHealth (connected, syncing, error)
├── DeviceList
│   ├── CurrentDevice
│   └── OtherDevices (with remove button)
├── SyncOptions
│   ├── SyncFrequency (dropdown: 5min, 15min, 1hr, manual)
│   ├── DataTypes (checkboxes: frames, audio, transcripts)
│   └── BandwidthLimit (optional)
└── DangerZone
    ├── DeleteCloudData
    └── UnlinkDevice
```

### 4.2 Tauri Commands
```rust
// src-tauri/src/commands/sync.rs
#[tauri::command]
async fn sync_init(password: String) -> Result<SyncInitResponse>

#[tauri::command]
async fn sync_get_status() -> Result<SyncStatus>

#[tauri::command]
async fn sync_trigger_now() -> Result<()>

#[tauri::command]
async fn sync_set_config(config: SyncConfig) -> Result<()>

#[tauri::command]
async fn sync_list_devices() -> Result<Vec<Device>>

#[tauri::command]
async fn sync_remove_device(device_id: String) -> Result<()>
```

---

## Phase 5: AI Integration

**Location**: Modify existing AI/chat flow

### 5.1 Query Flow
```
User: "What did I work on in January?"
                ↓
Check local DB for January data
                ↓
If gaps exist (data in cloud but not local):
                ↓
    1. Generate search tokens for query
    2. Search cloud index
    3. Download matching blobs
    4. Decrypt and cache locally (temp)
    5. Merge with local results
                ↓
Send combined context to AI
```

### 5.2 Cloud Query Helper
```rust
// screenpipe-server/src/cloud_query.rs
struct CloudQueryHelper {
    sync_client: SyncClient,
    unpacker: BlobUnpacker,
    keys: SyncKeys,
}

impl CloudQueryHelper {
    // Check if time range has cloud data not yet local
    async fn needs_cloud_data(&self, start, end) -> bool

    // Fetch and decrypt cloud data for time range
    async fn fetch_cloud_data(&self, start, end, query_keywords) -> Result<Vec<Frame/Audio/Text>>

    // Merge local + cloud results
    async fn query_all(&self, start, end, keywords) -> Result<MergedResults>
}
```

### 5.3 Modify Existing Search
```rust
// In screenpipe-server/src/server.rs or wherever search lives
// Add cloud fallback to existing search endpoint

async fn search(query: SearchQuery) -> Result<SearchResults> {
    let local_results = search_local_db(&query).await?;

    if sync_enabled && query.include_cloud {
        let cloud_results = cloud_helper.fetch_cloud_data(
            query.start,
            query.end,
            query.keywords
        ).await?;

        return Ok(merge_results(local_results, cloud_results));
    }

    Ok(local_results)
}
```

---

## Phase 6: Stripe Integration

**Location**: `screen-pipe-website/app/api/webhooks/stripe/`

### 6.1 New Products
```
Sync Starter - $5/mo
  - 20 GB storage
  - 3 devices
  - 6 months retention

Sync Pro - $15/mo
  - 100 GB storage
  - 10 devices
  - Unlimited retention

Sync Team - $30/mo
  - 500 GB storage
  - Unlimited devices
  - Priority support
```

### 6.2 Webhook Handler Update
```typescript
// Handle subscription created/updated
if (event.type === 'customer.subscription.created' ||
    event.type === 'customer.subscription.updated') {

    const syncTier = getSyncTierFromPrice(subscription.items[0].price.id);

    if (syncTier) {
        await supabase
            .from('cloud_subscriptions')
            .upsert({
                user_id: userId,
                sync_tier: syncTier,
                storage_limit_bytes: TIER_LIMITS[syncTier].storage,
                device_limit: TIER_LIMITS[syncTier].devices,
                status: 'active'
            });
    }
}
```

---

## Implementation Order

1. **Phase 1** - Rust Encryption (foundation, everything depends on this)
2. **Phase 2** - Sync Client (API communication)
3. **Phase 3** - Sync Service (background uploads)
4. **Phase 4** - Settings UI (user can enable/configure)
5. **Phase 6** - Stripe (monetization)
6. **Phase 5** - AI Integration (query cloud data)

---

## Files to Create/Modify

### New Files
```
screenpipe-core/src/sync/
├── mod.rs
├── crypto.rs
├── keys.rs
├── blob.rs
├── client.rs
├── packager.rs
└── unpacker.rs

screenpipe-server/src/
├── sync_service.rs
└── cloud_query.rs

screenpipe-app-tauri/
├── components/settings/sync-settings.tsx
└── src-tauri/src/commands/sync.rs

screen-pipe-website/
└── (already done - API routes)
```

### Modified Files
```
screenpipe-core/src/lib.rs          # Export sync module
screenpipe-server/src/server.rs     # Add cloud search fallback
screenpipe-app-tauri/src-tauri/
├── src/main.rs                     # Register sync commands
└── Cargo.toml                      # Add crypto crates
```

---

## Estimated Effort

| Phase | Effort |
|-------|--------|
| Phase 1 - Encryption | 1-2 days |
| Phase 2 - Client | 1-2 days |
| Phase 3 - Sync Service | 1 day |
| Phase 4 - Settings UI | 1 day |
| Phase 5 - AI Integration | 1 day |
| Phase 6 - Stripe | 0.5 day |
| **Total** | **~1 week** |

---

## Start Command

When ready, say "start phase 1" and I'll implement the Rust encryption module.
