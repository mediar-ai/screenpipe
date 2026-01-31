# Screenpipe Cloud Sync - Implementation Plan

## Executive Summary

This document outlines the implementation plan for encrypted cloud sync in Screenpipe, enabling users to:
1. Sync screen/audio recording data across devices
2. Keep data private with end-to-end encryption (E2E)
3. Allow AI to query historical data from the cloud
4. Support cross-platform sync (macOS, Windows, Linux)

**Key Principle**: Zero-knowledge architecture - Screenpipe servers never see plaintext data.

---

## Table of Contents

1. [Architecture Overview](#1-architecture-overview)
2. [Database Schema Changes](#2-database-schema-changes)
3. [Backend API Implementation](#3-backend-api-implementation)
4. [Desktop App Changes](#4-desktop-app-changes)
5. [Encryption Implementation](#5-encryption-implementation)
6. [AI Integration](#6-ai-integration)
7. [Cross-Platform Sync](#7-cross-platform-sync)
8. [Pricing & Stripe Integration](#8-pricing--stripe-integration)
9. [Implementation Phases](#9-implementation-phases)
10. [File-by-File Changes](#10-file-by-file-changes)

---

## 1. Architecture Overview

### High-Level Data Flow

```
┌─────────────────────────────────────────────────────────────────────────┐
│                           USER DEVICE                                    │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                          │
│  ┌──────────────┐    ┌──────────────┐    ┌──────────────────────────┐  │
│  │ Local SQLite │───▶│ Encryption   │───▶│ Sync Manager             │  │
│  │ Database     │    │ Layer        │    │ (Rust/Tauri)             │  │
│  └──────────────┘    └──────────────┘    └──────────────────────────┘  │
│         │                   │                        │                  │
│         │                   │                        │                  │
│  ┌──────▼──────┐    ┌───────▼──────┐    ┌───────────▼─────────────┐   │
│  │ Hot Cache   │    │ Key Manager  │    │ Background Sync Service │   │
│  │ (7-30 days) │    │ (libsodium)  │    │ (tokio async)           │   │
│  └─────────────┘    └──────────────┘    └─────────────────────────┘   │
│                                                     │                   │
└─────────────────────────────────────────────────────│───────────────────┘
                                                      │
                                          HTTPS + E2E Encrypted
                                                      │
                                                      ▼
┌─────────────────────────────────────────────────────────────────────────┐
│                        SCREENPIPE CLOUD                                  │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                          │
│  ┌──────────────────┐    ┌──────────────────┐    ┌──────────────────┐  │
│  │ Supabase         │    │ S3/R2 Storage    │    │ Sync API         │  │
│  │ (Postgres)       │    │ (Encrypted Blobs)│    │ (Next.js)        │  │
│  │                  │    │                  │    │                  │  │
│  │ - sync_devices   │    │ - /sync/{user}/  │    │ - /api/sync/*    │  │
│  │ - sync_metadata  │    │   ├── frames/    │    │                  │  │
│  │ - sync_index     │    │   ├── audio/     │    │                  │  │
│  │ - sync_keys      │    │   └── index/     │    │                  │  │
│  └──────────────────┘    └──────────────────┘    └──────────────────┘  │
│                                                                          │
│  WE NEVER SEE PLAINTEXT - Only encrypted blobs + hashed search tokens   │
│                                                                          │
└─────────────────────────────────────────────────────────────────────────┘
```

### Key Components

| Component | Location | Purpose |
|-----------|----------|---------|
| Sync Manager | `screenpipe-app-tauri/src-tauri/src/sync/` | Coordinates sync operations |
| Encryption Layer | `screenpipe-core/src/encryption/` | E2E encryption/decryption |
| Key Manager | `screenpipe-app-tauri/src-tauri/src/sync/keys.rs` | Key derivation & storage |
| Sync API | `screen-pipe-website/app/api/sync/` | Cloud endpoints |
| Sync Worker | `screenpipe-app-tauri/src-tauri/src/sync/worker.rs` | Background sync |

---

## 2. Database Schema Changes

### 2.1 New Tables in Supabase (screen-pipe-website)

```sql
-- Migration: 20260201_add_cloud_sync_tables.sql

-- User encryption keys (stores encrypted master key, not plaintext)
CREATE TABLE sync_keys (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,

  -- Key derivation parameters (public, needed to re-derive key)
  salt BYTEA NOT NULL,                    -- 32 bytes, random per user
  kdf_algorithm TEXT NOT NULL DEFAULT 'argon2id',
  kdf_iterations INTEGER NOT NULL DEFAULT 3,
  kdf_memory INTEGER NOT NULL DEFAULT 65536,  -- 64MB

  -- Encrypted master key (encrypted with password-derived key)
  encrypted_master_key BYTEA NOT NULL,    -- AES-256-GCM encrypted
  master_key_nonce BYTEA NOT NULL,        -- 12 bytes

  -- Key version for rotation
  key_version INTEGER NOT NULL DEFAULT 1,

  created_at TIMESTAMPTZ DEFAULT NOW(),
  rotated_at TIMESTAMPTZ,

  UNIQUE(user_id)
);

-- Registered sync devices
CREATE TABLE sync_devices (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,

  device_id TEXT NOT NULL,                -- Unique device identifier
  device_name TEXT,                       -- User-friendly name
  device_os TEXT,                         -- 'macos', 'windows', 'linux'
  device_os_version TEXT,

  -- Device-specific key (for secure key exchange)
  device_public_key BYTEA,                -- X25519 public key

  last_sync_at TIMESTAMPTZ,
  last_ip INET,

  created_at TIMESTAMPTZ DEFAULT NOW(),

  UNIQUE(user_id, device_id)
);

-- Encrypted data blobs metadata
CREATE TABLE sync_blobs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,

  blob_type TEXT NOT NULL,                -- 'frames', 'audio', 'transcripts', 'ocr'
  s3_key TEXT NOT NULL,                   -- Path in S3: sync/{user_id}/{blob_type}/{id}

  -- Time range this blob covers
  time_start TIMESTAMPTZ NOT NULL,
  time_end TIMESTAMPTZ NOT NULL,

  -- Encryption metadata
  encryption_nonce BYTEA NOT NULL,        -- 12 bytes
  key_version INTEGER NOT NULL,           -- Which master key version

  -- Integrity
  size_bytes BIGINT NOT NULL,
  checksum TEXT NOT NULL,                 -- SHA-256 of plaintext (before encryption)

  -- Source device
  source_device_id TEXT NOT NULL,

  created_at TIMESTAMPTZ DEFAULT NOW(),

  INDEX idx_sync_blobs_user_time (user_id, time_start, time_end),
  INDEX idx_sync_blobs_type (user_id, blob_type)
);

-- Encrypted search index (for finding data without decrypting everything)
CREATE TABLE sync_search_index (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  blob_id UUID NOT NULL REFERENCES sync_blobs(id) ON DELETE CASCADE,

  -- Hashed search tokens (deterministic, can match but not reverse)
  -- Generated as: HMAC-SHA256(search_key, lowercase(keyword))
  search_token BYTEA NOT NULL,            -- 32 bytes

  -- Approximate timestamp for time-based filtering
  timestamp_bucket TIMESTAMPTZ NOT NULL,  -- Rounded to nearest hour

  INDEX idx_sync_search_token (user_id, search_token),
  INDEX idx_sync_search_time (user_id, timestamp_bucket)
);

-- Sync operation log (for conflict resolution and debugging)
CREATE TABLE sync_operations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  device_id TEXT NOT NULL,

  operation TEXT NOT NULL,                -- 'upload', 'download', 'delete', 'key_rotation'
  blob_type TEXT,
  blob_count INTEGER,
  bytes_transferred BIGINT,

  status TEXT NOT NULL,                   -- 'pending', 'success', 'failed'
  error_message TEXT,

  started_at TIMESTAMPTZ DEFAULT NOW(),
  completed_at TIMESTAMPTZ,

  INDEX idx_sync_ops_user (user_id, started_at DESC)
);

-- Storage usage tracking
CREATE TABLE sync_storage (
  user_id UUID PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,

  total_bytes BIGINT NOT NULL DEFAULT 0,
  blob_count INTEGER NOT NULL DEFAULT 0,

  -- Per-type breakdown
  frames_bytes BIGINT NOT NULL DEFAULT 0,
  audio_bytes BIGINT NOT NULL DEFAULT 0,
  transcripts_bytes BIGINT NOT NULL DEFAULT 0,

  last_calculated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Update cloud_subscriptions to include sync tier
ALTER TABLE cloud_subscriptions
ADD COLUMN sync_tier TEXT DEFAULT NULL,           -- 'starter', 'pro', 'team'
ADD COLUMN storage_limit_bytes BIGINT DEFAULT 0,  -- Based on tier
ADD COLUMN device_limit INTEGER DEFAULT 0;        -- Based on tier

-- RLS Policies
ALTER TABLE sync_keys ENABLE ROW LEVEL SECURITY;
ALTER TABLE sync_devices ENABLE ROW LEVEL SECURITY;
ALTER TABLE sync_blobs ENABLE ROW LEVEL SECURITY;
ALTER TABLE sync_search_index ENABLE ROW LEVEL SECURITY;
ALTER TABLE sync_operations ENABLE ROW LEVEL SECURITY;
ALTER TABLE sync_storage ENABLE ROW LEVEL SECURITY;

-- Users can only access their own data
CREATE POLICY sync_keys_user_policy ON sync_keys
  FOR ALL USING (user_id = auth.uid());

CREATE POLICY sync_devices_user_policy ON sync_devices
  FOR ALL USING (user_id = auth.uid());

CREATE POLICY sync_blobs_user_policy ON sync_blobs
  FOR ALL USING (user_id = auth.uid());

-- ... (similar policies for other tables)
```

### 2.2 RPC Functions

```sql
-- Check storage quota
CREATE OR REPLACE FUNCTION check_sync_quota(p_user_id UUID)
RETURNS TABLE(
  storage_used BIGINT,
  storage_limit BIGINT,
  device_count INTEGER,
  device_limit INTEGER,
  can_sync BOOLEAN
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    COALESCE(s.total_bytes, 0) as storage_used,
    COALESCE(cs.storage_limit_bytes, 0) as storage_limit,
    (SELECT COUNT(*)::INTEGER FROM sync_devices WHERE user_id = p_user_id) as device_count,
    COALESCE(cs.device_limit, 0) as device_limit,
    (COALESCE(s.total_bytes, 0) < COALESCE(cs.storage_limit_bytes, 0)
     AND (SELECT COUNT(*) FROM sync_devices WHERE user_id = p_user_id) <= COALESCE(cs.device_limit, 0)) as can_sync
  FROM users u
  LEFT JOIN sync_storage s ON s.user_id = u.id
  LEFT JOIN cloud_subscriptions cs ON cs.user_id = u.id AND cs.status = 'active'
  WHERE u.id = p_user_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Update storage after upload
CREATE OR REPLACE FUNCTION update_sync_storage()
RETURNS TRIGGER AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    INSERT INTO sync_storage (user_id, total_bytes, blob_count)
    VALUES (NEW.user_id, NEW.size_bytes, 1)
    ON CONFLICT (user_id) DO UPDATE SET
      total_bytes = sync_storage.total_bytes + NEW.size_bytes,
      blob_count = sync_storage.blob_count + 1,
      last_calculated_at = NOW();
  ELSIF TG_OP = 'DELETE' THEN
    UPDATE sync_storage SET
      total_bytes = GREATEST(0, total_bytes - OLD.size_bytes),
      blob_count = GREATEST(0, blob_count - 1),
      last_calculated_at = NOW()
    WHERE user_id = OLD.user_id;
  END IF;
  RETURN NULL;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER sync_storage_trigger
AFTER INSERT OR DELETE ON sync_blobs
FOR EACH ROW EXECUTE FUNCTION update_sync_storage();
```

---

## 3. Backend API Implementation

### 3.1 New API Routes (screen-pipe-website/app/api/sync/)

```
app/api/sync/
├── init/
│   └── route.ts              # Initialize encryption for user
├── devices/
│   ├── route.ts              # List/register devices
│   └── [deviceId]/
│       └── route.ts          # Device management
├── upload/
│   └── route.ts              # Get presigned URL + register blob
├── download/
│   └── route.ts              # Get presigned URL for download
├── search/
│   └── route.ts              # Search encrypted index
├── status/
│   └── route.ts              # Sync status & storage usage
├── key-rotation/
│   └── route.ts              # Rotate encryption keys
└── webhook/
    └── route.ts              # Stripe webhook for sync subscriptions
```

### 3.2 API Endpoint Details

#### POST /api/sync/init
Initialize encryption for a new user or device.

```typescript
// Request
{
  device_id: string,
  device_name: string,
  device_os: "macos" | "windows" | "linux",
  device_public_key: string,  // Base64 X25519 public key

  // For new users: encrypted master key
  encrypted_master_key?: string,
  master_key_nonce?: string,
  salt?: string,
}

// Response
{
  success: true,
  salt: string,
  kdf_params: { algorithm: string, iterations: number, memory: number },
  encrypted_master_key: string,  // For existing users
  master_key_nonce: string,
  key_version: number,
}
```

#### POST /api/sync/upload
Get presigned URL for uploading encrypted blob.

```typescript
// Request
{
  blob_type: "frames" | "audio" | "transcripts" | "ocr",
  time_start: string,  // ISO timestamp
  time_end: string,
  size_bytes: number,
  checksum: string,    // SHA-256 of plaintext
  device_id: string,
  key_version: number,

  // For search index
  search_tokens?: string[],  // Base64 HMAC tokens
}

// Response
{
  success: true,
  blob_id: string,
  upload_url: string,  // Presigned S3 URL
  expires_in: number,
}
```

#### POST /api/sync/download
Get presigned URLs for downloading encrypted blobs.

```typescript
// Request
{
  blob_ids?: string[],           // Specific blobs
  time_range?: { start: string, end: string },
  blob_types?: string[],
  limit?: number,
}

// Response
{
  success: true,
  blobs: [{
    blob_id: string,
    blob_type: string,
    download_url: string,
    encryption_nonce: string,
    key_version: number,
    size_bytes: number,
    checksum: string,
  }],
}
```

#### POST /api/sync/search
Search encrypted index.

```typescript
// Request
{
  search_tokens: string[],  // Base64 HMAC tokens (generated client-side)
  time_range?: { start: string, end: string },
  blob_types?: string[],
  limit?: number,
}

// Response
{
  success: true,
  matches: [{
    blob_id: string,
    blob_type: string,
    time_start: string,
    time_end: string,
    match_count: number,
  }],
}
```

### 3.3 Implementation Example

```typescript
// app/api/sync/upload/route.ts
import { NextResponse } from "next/server";
import { verifyToken } from "@clerk/backend";
import { createClient } from "@supabase/supabase-js";
import { createSignedUploadUrlWithContentType } from "@/app/utils/s3";

export async function POST(request: Request) {
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_KEY!
  );

  try {
    // 1. Authenticate
    const authHeader = request.headers.get("authorization");
    const token = authHeader?.replace("Bearer ", "");
    if (!token) {
      return NextResponse.json({ error: "unauthorized" }, { status: 401 });
    }

    const payload = await verifyToken(token, {
      secretKey: process.env.CLERK_SECRET_KEY,
    });

    // 2. Get user
    const { data: user } = await supabase
      .from("users")
      .select("id")
      .eq("clerk_id", payload.sub)
      .single();

    if (!user) {
      return NextResponse.json({ error: "user not found" }, { status: 404 });
    }

    // 3. Check quota
    const { data: quota } = await supabase
      .rpc("check_sync_quota", { p_user_id: user.id });

    if (!quota?.can_sync) {
      return NextResponse.json({ error: "quota exceeded" }, { status: 403 });
    }

    // 4. Parse request
    const body = await request.json();
    const {
      blob_type,
      time_start,
      time_end,
      size_bytes,
      checksum,
      device_id,
      key_version,
      search_tokens,
    } = body;

    // 5. Generate blob ID and S3 key
    const blobId = crypto.randomUUID();
    const s3Key = `sync/${user.id}/${blob_type}/${blobId}.enc`;

    // 6. Create blob record
    const { error: insertError } = await supabase
      .from("sync_blobs")
      .insert({
        id: blobId,
        user_id: user.id,
        blob_type,
        s3_key: s3Key,
        time_start,
        time_end,
        encryption_nonce: body.encryption_nonce,
        key_version,
        size_bytes,
        checksum,
        source_device_id: device_id,
      });

    if (insertError) {
      throw insertError;
    }

    // 7. Insert search tokens
    if (search_tokens?.length) {
      const searchRecords = search_tokens.map((token: string) => ({
        user_id: user.id,
        blob_id: blobId,
        search_token: Buffer.from(token, "base64"),
        timestamp_bucket: new Date(time_start).toISOString(),
      }));

      await supabase.from("sync_search_index").insert(searchRecords);
    }

    // 8. Generate presigned upload URL
    const { data: urlData } = await createSignedUploadUrlWithContentType(
      s3Key,
      "application/octet-stream",
      300
    );

    // 9. Log operation
    await supabase.from("sync_operations").insert({
      user_id: user.id,
      device_id,
      operation: "upload",
      blob_type,
      blob_count: 1,
      bytes_transferred: size_bytes,
      status: "pending",
    });

    return NextResponse.json({
      success: true,
      blob_id: blobId,
      upload_url: urlData?.signedUrl,
      expires_in: 300,
    });

  } catch (error) {
    console.error("sync upload error:", error);
    return NextResponse.json(
      { error: "internal server error" },
      { status: 500 }
    );
  }
}
```

---

## 4. Desktop App Changes

### 4.1 New Rust Modules

```
screenpipe-app-tauri/src-tauri/src/
├── sync/
│   ├── mod.rs                # Module exports
│   ├── manager.rs            # SyncManager - main coordinator
│   ├── encryption.rs         # Encryption/decryption using libsodium
│   ├── keys.rs               # Key derivation and storage
│   ├── worker.rs             # Background sync worker
│   ├── protocol.rs           # Sync protocol implementation
│   ├── conflict.rs           # Conflict resolution
│   └── types.rs              # Shared types
```

### 4.2 Tauri Commands

```rust
// src-tauri/src/commands/sync.rs

#[tauri::command]
pub async fn sync_init(
    password: String,
    device_name: String,
    state: State<'_, AppState>,
) -> Result<SyncInitResult, String> {
    // Initialize encryption with user password
    // Returns: salt, encrypted_master_key, etc.
}

#[tauri::command]
pub async fn sync_unlock(
    password: String,
    state: State<'_, AppState>,
) -> Result<bool, String> {
    // Derive key from password, unlock sync
}

#[tauri::command]
pub async fn sync_now(
    state: State<'_, AppState>,
) -> Result<SyncStatus, String> {
    // Trigger immediate sync
}

#[tauri::command]
pub async fn sync_status(
    state: State<'_, AppState>,
) -> Result<SyncStatus, String> {
    // Get current sync status
}

#[tauri::command]
pub async fn sync_search_historical(
    query: String,
    time_range: Option<TimeRange>,
    state: State<'_, AppState>,
) -> Result<Vec<SearchResult>, String> {
    // Search local cache + cloud index
}

#[tauri::command]
pub async fn sync_download_blob(
    blob_id: String,
    state: State<'_, AppState>,
) -> Result<Vec<u8>, String> {
    // Download and decrypt specific blob
}

#[tauri::command]
pub async fn sync_list_devices(
    state: State<'_, AppState>,
) -> Result<Vec<SyncDevice>, String> {
    // List registered devices
}

#[tauri::command]
pub async fn sync_remove_device(
    device_id: String,
    state: State<'_, AppState>,
) -> Result<(), String> {
    // Remove a device from sync
}
```

### 4.3 Core Encryption Implementation

```rust
// screenpipe-core/src/encryption/mod.rs

use chacha20poly1305::{
    aead::{Aead, KeyInit},
    ChaCha20Poly1305, Nonce,
};
use argon2::{Argon2, Params};
use rand::RngCore;

pub struct EncryptionKey([u8; 32]);

impl EncryptionKey {
    /// Derive key from password using Argon2id
    pub fn derive_from_password(password: &str, salt: &[u8; 32]) -> Result<Self> {
        let params = Params::new(65536, 3, 1, Some(32))?;
        let argon2 = Argon2::new(argon2::Algorithm::Argon2id, argon2::Version::V0x13, params);

        let mut key = [0u8; 32];
        argon2.hash_password_into(password.as_bytes(), salt, &mut key)?;

        Ok(Self(key))
    }

    /// Generate random key
    pub fn generate() -> Self {
        let mut key = [0u8; 32];
        rand::thread_rng().fill_bytes(&mut key);
        Self(key)
    }

    /// Encrypt data
    pub fn encrypt(&self, plaintext: &[u8]) -> Result<EncryptedData> {
        let cipher = ChaCha20Poly1305::new_from_slice(&self.0)?;

        let mut nonce_bytes = [0u8; 12];
        rand::thread_rng().fill_bytes(&mut nonce_bytes);
        let nonce = Nonce::from_slice(&nonce_bytes);

        let ciphertext = cipher.encrypt(nonce, plaintext)?;

        Ok(EncryptedData {
            ciphertext,
            nonce: nonce_bytes,
        })
    }

    /// Decrypt data
    pub fn decrypt(&self, encrypted: &EncryptedData) -> Result<Vec<u8>> {
        let cipher = ChaCha20Poly1305::new_from_slice(&self.0)?;
        let nonce = Nonce::from_slice(&encrypted.nonce);

        let plaintext = cipher.decrypt(nonce, encrypted.ciphertext.as_slice())?;

        Ok(plaintext)
    }
}

pub struct EncryptedData {
    pub ciphertext: Vec<u8>,
    pub nonce: [u8; 12],
}

/// Generate search tokens (deterministic, for server-side matching)
pub fn generate_search_token(search_key: &[u8; 32], keyword: &str) -> [u8; 32] {
    use hmac::{Hmac, Mac};
    use sha2::Sha256;

    type HmacSha256 = Hmac<Sha256>;

    let mut mac = HmacSha256::new_from_slice(search_key).unwrap();
    mac.update(keyword.to_lowercase().as_bytes());

    let result = mac.finalize();
    let mut token = [0u8; 32];
    token.copy_from_slice(&result.into_bytes());
    token
}
```

### 4.4 Sync Manager

```rust
// screenpipe-app-tauri/src-tauri/src/sync/manager.rs

pub struct SyncManager {
    api_client: SyncApiClient,
    encryption_key: Option<EncryptionKey>,
    search_key: Option<[u8; 32]>,
    device_id: String,
    db_path: PathBuf,

    // State
    is_syncing: AtomicBool,
    last_sync: RwLock<Option<DateTime<Utc>>>,
}

impl SyncManager {
    pub async fn new(config: SyncConfig) -> Result<Self> {
        let device_id = Self::get_or_create_device_id().await?;

        Ok(Self {
            api_client: SyncApiClient::new(config.api_url, config.token),
            encryption_key: None,
            search_key: None,
            device_id,
            db_path: config.db_path,
            is_syncing: AtomicBool::new(false),
            last_sync: RwLock::new(None),
        })
    }

    /// Initialize encryption with password
    pub async fn init_encryption(&mut self, password: &str) -> Result<()> {
        // 1. Check if user has existing keys on server
        let existing = self.api_client.get_sync_keys().await?;

        if let Some(keys) = existing {
            // Derive key from password using stored salt
            let password_key = EncryptionKey::derive_from_password(
                password,
                &keys.salt,
            )?;

            // Decrypt master key
            let master_key = password_key.decrypt(&EncryptedData {
                ciphertext: keys.encrypted_master_key,
                nonce: keys.master_key_nonce,
            })?;

            self.encryption_key = Some(EncryptionKey::from_bytes(&master_key)?);
            self.search_key = Some(self.derive_search_key(&master_key)?);
        } else {
            // New user - generate keys
            let salt = generate_random_salt();
            let master_key = EncryptionKey::generate();
            let password_key = EncryptionKey::derive_from_password(password, &salt)?;

            // Encrypt master key with password-derived key
            let encrypted_master = password_key.encrypt(&master_key.as_bytes())?;

            // Store on server
            self.api_client.init_sync_keys(SyncKeysInit {
                salt,
                encrypted_master_key: encrypted_master.ciphertext,
                master_key_nonce: encrypted_master.nonce,
                device_id: self.device_id.clone(),
                device_name: Self::get_device_name(),
                device_os: Self::get_device_os(),
            }).await?;

            self.encryption_key = Some(master_key);
            self.search_key = Some(self.derive_search_key(&master_key.as_bytes())?);
        }

        Ok(())
    }

    /// Sync local data to cloud
    pub async fn sync_up(&self) -> Result<SyncResult> {
        if !self.is_syncing.compare_exchange(false, true, Ordering::SeqCst, Ordering::SeqCst).is_ok() {
            return Err(SyncError::AlreadySyncing);
        }

        let _guard = scopeguard::guard((), |_| {
            self.is_syncing.store(false, Ordering::SeqCst);
        });

        let encryption_key = self.encryption_key.as_ref()
            .ok_or(SyncError::NotInitialized)?;

        // 1. Find data that needs syncing
        let pending = self.find_pending_sync_data().await?;

        let mut uploaded = 0;
        let mut bytes = 0;

        for batch in pending.chunks(100) {
            // 2. Serialize and encrypt batch
            let plaintext = self.serialize_batch(batch)?;
            let checksum = sha256(&plaintext);
            let encrypted = encryption_key.encrypt(&plaintext)?;

            // 3. Generate search tokens
            let tokens = self.extract_search_tokens(batch)?;

            // 4. Get upload URL from server
            let upload_info = self.api_client.request_upload(UploadRequest {
                blob_type: batch[0].blob_type.clone(),
                time_start: batch.first().unwrap().timestamp,
                time_end: batch.last().unwrap().timestamp,
                size_bytes: encrypted.ciphertext.len(),
                checksum,
                device_id: self.device_id.clone(),
                key_version: 1,
                encryption_nonce: encrypted.nonce.to_vec(),
                search_tokens: tokens,
            }).await?;

            // 5. Upload to S3
            self.upload_to_s3(&upload_info.upload_url, &encrypted.ciphertext).await?;

            // 6. Mark as synced locally
            self.mark_synced(&batch, &upload_info.blob_id).await?;

            uploaded += batch.len();
            bytes += encrypted.ciphertext.len();
        }

        *self.last_sync.write().await = Some(Utc::now());

        Ok(SyncResult {
            uploaded_count: uploaded,
            uploaded_bytes: bytes,
            errors: vec![],
        })
    }

    /// Search historical data (local + cloud)
    pub async fn search(&self, query: &str, time_range: Option<TimeRange>) -> Result<Vec<SearchResult>> {
        let search_key = self.search_key.as_ref()
            .ok_or(SyncError::NotInitialized)?;

        // 1. Search local cache first
        let local_results = self.search_local(&query, time_range).await?;

        // 2. Generate search tokens for cloud query
        let keywords = self.extract_keywords(query);
        let tokens: Vec<_> = keywords.iter()
            .map(|kw| generate_search_token(search_key, kw))
            .collect();

        // 3. Search cloud index
        let cloud_matches = self.api_client.search(SearchRequest {
            search_tokens: tokens.iter().map(|t| base64::encode(t)).collect(),
            time_range,
            limit: Some(100),
        }).await?;

        // 4. Download matching blobs if not in cache
        let mut all_results = local_results;

        for match_info in cloud_matches {
            if !self.is_blob_cached(&match_info.blob_id).await {
                // Download in background or on-demand
                all_results.push(SearchResult::Pending {
                    blob_id: match_info.blob_id,
                    time_range: (match_info.time_start, match_info.time_end),
                    estimated_download_time: self.estimate_download_time(match_info.size_bytes),
                });
            }
        }

        Ok(all_results)
    }
}
```

---

## 5. Encryption Implementation

### 5.1 Key Hierarchy

```
User Password (never stored)
       │
       ▼
   Argon2id (salt, 3 iterations, 64MB memory)
       │
       ▼
Password-Derived Key (32 bytes)
       │
       ▼
   Encrypts ──────────────────────────────────┐
       │                                       │
       ▼                                       ▼
Master Key (32 bytes, random)          Device Keys (for future use)
       │
       ├──► Data Encryption (ChaCha20-Poly1305)
       │         └── Each blob gets unique nonce
       │
       └──► Search Key Derivation (HKDF)
                 └── HMAC-SHA256 for search tokens
```

### 5.2 Dependencies

Add to `screenpipe-core/Cargo.toml`:

```toml
[dependencies]
chacha20poly1305 = "0.10"
argon2 = "0.5"
hmac = "0.12"
sha2 = "0.10"
hkdf = "0.12"
rand = "0.8"
base64 = "0.21"
```

### 5.3 Security Considerations

1. **Password never leaves device** - Only used for key derivation
2. **Master key encrypted at rest** - Protected by password-derived key
3. **Unique nonce per encryption** - 12 random bytes, never reused
4. **Authenticated encryption** - ChaCha20-Poly1305 provides integrity
5. **Search tokens are one-way** - Cannot reverse HMAC to get keywords
6. **Key rotation supported** - `key_version` tracks which key encrypted data

---

## 6. AI Integration

### 6.1 Tool Definition for AI

```typescript
// In AI chat context
const tools = [{
  name: "search_historical_screen_data",
  description: "Search user's encrypted screen recording history stored in the cloud",
  parameters: {
    type: "object",
    properties: {
      query: {
        type: "string",
        description: "Natural language search query"
      },
      time_range: {
        type: "object",
        properties: {
          start: { type: "string", description: "ISO timestamp" },
          end: { type: "string", description: "ISO timestamp" }
        }
      },
      content_types: {
        type: "array",
        items: { enum: ["ocr", "audio", "all"] }
      }
    },
    required: ["query"]
  }
}];
```

### 6.2 Handling Slow Cloud Queries

```typescript
// In AI response handler
async function handleHistoricalSearch(params: SearchParams): Promise<SearchResponse> {
  // 1. Search local cache (fast)
  const localResults = await searchLocal(params);

  // 2. Search cloud (may be slow)
  const cloudPromise = searchCloud(params);

  // 3. Race with timeout
  const cloudResults = await Promise.race([
    cloudPromise,
    new Promise(resolve => setTimeout(() => resolve({ timeout: true }), 3000))
  ]);

  if (cloudResults.timeout) {
    // Return partial results, continue in background
    return {
      results: localResults,
      status: "fetching_more",
      message: "Found recent results. Still searching older data...",
      callback_id: startBackgroundFetch(params)
    };
  }

  return {
    results: [...localResults, ...cloudResults],
    status: "complete"
  };
}
```

### 6.3 Progressive Loading UI

```tsx
// In chat component
function SearchResultsMessage({ results, status, onMoreLoaded }) {
  const [additionalResults, setAdditionalResults] = useState([]);

  useEffect(() => {
    if (status === "fetching_more") {
      // Listen for background fetch completion
      const unsubscribe = listen("search-results-ready", (event) => {
        setAdditionalResults(event.payload.results);
        onMoreLoaded?.(event.payload.results);
      });
      return unsubscribe;
    }
  }, [status]);

  return (
    <div>
      {results.map(r => <SearchResult key={r.id} result={r} />)}

      {status === "fetching_more" && (
        <div className="flex items-center gap-2 text-muted-foreground">
          <Loader2 className="animate-spin h-4 w-4" />
          <span>Fetching older data from cloud...</span>
        </div>
      )}

      {additionalResults.map(r => <SearchResult key={r.id} result={r} />)}
    </div>
  );
}
```

---

## 7. Cross-Platform Sync

### 7.1 What Syncs Across Platforms

| Data Type | Cross-Platform? | Notes |
|-----------|-----------------|-------|
| OCR text | Yes | Universal |
| Audio transcriptions | Yes | Universal |
| Timestamps | Yes | UTC everywhere |
| App names | Yes | May differ slightly |
| Window titles | Yes | Universal |
| Frame thumbnails | Yes | Resolution may vary |
| Full frames | Yes | Quality may vary |

### 7.2 Platform-Specific Considerations

```rust
// In sync protocol
#[derive(Serialize, Deserialize)]
pub struct SyncableFrame {
    pub id: i64,
    pub timestamp: DateTime<Utc>,

    // Universal fields
    pub ocr_text: String,
    pub window_title: String,

    // Platform-tagged fields
    pub app_name: String,
    pub source_os: String,  // "macos", "windows", "linux"
    pub source_device_id: String,

    // Optional: normalized app identifier
    pub app_identifier: Option<String>,  // e.g., "com.google.Chrome"
}
```

### 7.3 Unified Timeline View

```tsx
// Timeline shows data from all devices
function UnifiedTimeline({ frames }) {
  return (
    <div>
      {frames.map(frame => (
        <TimelineFrame
          key={frame.id}
          frame={frame}
          deviceBadge={
            <DeviceBadge
              os={frame.source_os}
              deviceName={frame.source_device_name}
            />
          }
        />
      ))}
    </div>
  );
}
```

---

## 8. Pricing & Stripe Integration

### 8.1 Pricing Tiers

| Tier | Price | Storage | Devices | Retention |
|------|-------|---------|---------|-----------|
| Free | $0 | Local only | 1 | - |
| Sync Starter | $12/mo | 20 GB | 3 | 6 months |
| Sync Pro | $24/mo | 100 GB | 10 | 2 years |
| Sync Team | $49/mo | 500 GB | Unlimited | Unlimited |

### 8.2 Stripe Product Setup

```typescript
// Create products in Stripe
const products = [
  {
    name: "Screenpipe Sync Starter",
    metadata: {
      tier: "starter",
      storage_bytes: String(20 * 1024 * 1024 * 1024), // 20 GB
      device_limit: "3",
      retention_days: "180",
    },
    default_price: {
      unit_amount: 1200, // $12.00
      currency: "usd",
      recurring: { interval: "month" },
    },
  },
  // ... similar for Pro and Team
];
```

### 8.3 Webhook Handler

```typescript
// app/api/sync/webhook/route.ts (or extend existing stripe-webhook-cloud)

case "customer.subscription.created":
case "customer.subscription.updated":
  const subscription = event.data.object as Stripe.Subscription;
  const priceId = subscription.items.data[0].price.id;

  // Look up tier from price metadata
  const price = await stripe.prices.retrieve(priceId);
  const product = await stripe.products.retrieve(price.product as string);

  const tier = product.metadata.tier;
  const storageLimit = parseInt(product.metadata.storage_bytes);
  const deviceLimit = parseInt(product.metadata.device_limit);

  // Update cloud_subscriptions
  await supabase.from("cloud_subscriptions").upsert({
    user_id: userId,
    stripe_subscription_id: subscription.id,
    status: subscription.status,
    sync_tier: tier,
    storage_limit_bytes: storageLimit,
    device_limit: deviceLimit,
    // ...
  });
  break;
```

---

## 9. Implementation Phases

### Phase 1: Foundation (Weeks 1-3)

**Goal**: Basic encryption infrastructure

- [ ] Add encryption dependencies to `screenpipe-core`
- [ ] Implement `EncryptionKey` with Argon2id + ChaCha20-Poly1305
- [ ] Create `sync_keys` table migration
- [ ] Implement `/api/sync/init` endpoint
- [ ] Add `sync_init` and `sync_unlock` Tauri commands
- [ ] Basic key storage in Tauri secure store

**Deliverable**: User can set sync password and derive encryption keys

### Phase 2: Upload Pipeline (Weeks 4-6)

**Goal**: Encrypted upload to cloud

- [ ] Create remaining database migrations
- [ ] Implement `/api/sync/upload` endpoint
- [ ] Add S3 bucket configuration for sync data
- [ ] Implement `SyncManager.sync_up()` in Rust
- [ ] Background sync worker with scheduling
- [ ] Storage quota tracking

**Deliverable**: Local data automatically uploads encrypted to cloud

### Phase 3: Download & Search (Weeks 7-8)

**Goal**: Retrieve and search cloud data

- [ ] Implement `/api/sync/download` endpoint
- [ ] Implement `/api/sync/search` endpoint
- [ ] Search token generation and matching
- [ ] Local blob cache management
- [ ] `SyncManager.search()` implementation

**Deliverable**: User can search historical data from cloud

### Phase 4: Multi-Device (Weeks 9-10)

**Goal**: Sync across devices

- [ ] Device registration and management
- [ ] Key exchange protocol for new devices
- [ ] Conflict resolution for concurrent edits
- [ ] Device list UI in settings
- [ ] Cross-device timeline view

**Deliverable**: Data syncs between multiple devices

### Phase 5: AI Integration (Weeks 11-12)

**Goal**: AI can query cloud data

- [ ] Tool definition for historical search
- [ ] Progressive loading in chat UI
- [ ] Background fetch with notifications
- [ ] Latency handling (timeout, partial results)

**Deliverable**: AI assistant can answer questions about old screen data

### Phase 6: Polish & Launch (Weeks 13-14)

**Goal**: Production ready

- [ ] Stripe integration for sync tiers
- [ ] Settings UI for sync management
- [ ] Storage usage dashboard
- [ ] Error handling and retry logic
- [ ] Documentation
- [ ] Beta testing

**Deliverable**: Feature ready for public launch

---

## 10. File-by-File Changes

### Backend (screen-pipe-website)

| File | Action | Description |
|------|--------|-------------|
| `supabase/migrations/20260201_add_cloud_sync.sql` | Create | Database schema |
| `types_db.ts` | Modify | Add new table types (regenerate) |
| `app/api/sync/init/route.ts` | Create | Key initialization |
| `app/api/sync/devices/route.ts` | Create | Device management |
| `app/api/sync/upload/route.ts` | Create | Upload presigned URLs |
| `app/api/sync/download/route.ts` | Create | Download presigned URLs |
| `app/api/sync/search/route.ts` | Create | Search encrypted index |
| `app/api/sync/status/route.ts` | Create | Sync status |
| `app/api/sync/key-rotation/route.ts` | Create | Key rotation |
| `app/api/stripe-webhook-cloud/route.ts` | Modify | Handle sync tiers |
| `app/api/tauri/route.ts` | Modify | Return sync status |
| `app/utils/s3.ts` | Modify | Add sync bucket functions |
| `middleware.ts` | Modify | Add sync routes |

### Desktop App (screenpipe-app-tauri)

| File | Action | Description |
|------|--------|-------------|
| `src-tauri/Cargo.toml` | Modify | Add crypto dependencies |
| `src-tauri/src/sync/mod.rs` | Create | Module exports |
| `src-tauri/src/sync/manager.rs` | Create | Main sync coordinator |
| `src-tauri/src/sync/encryption.rs` | Create | Encryption wrapper |
| `src-tauri/src/sync/keys.rs` | Create | Key management |
| `src-tauri/src/sync/worker.rs` | Create | Background worker |
| `src-tauri/src/sync/protocol.rs` | Create | API client |
| `src-tauri/src/commands/sync.rs` | Create | Tauri commands |
| `src-tauri/src/lib.rs` | Modify | Register sync commands |
| `components/settings/sync-settings.tsx` | Create | Sync settings UI |
| `lib/hooks/use-sync.ts` | Create | Sync React hook |
| `lib/utils/tauri.ts` | Modify | Add sync command types |

### Core Library (screenpipe-core)

| File | Action | Description |
|------|--------|-------------|
| `Cargo.toml` | Modify | Add crypto dependencies |
| `src/encryption/mod.rs` | Create | Encryption primitives |
| `src/encryption/keys.rs` | Create | Key derivation |
| `src/encryption/search.rs` | Create | Search token generation |
| `src/lib.rs` | Modify | Export encryption module |

---

## Appendix: Security Audit Checklist

Before launch, verify:

- [ ] Password never transmitted to server
- [ ] Master key never stored in plaintext
- [ ] All network traffic over HTTPS
- [ ] Nonces never reused
- [ ] Auth tags verified on decrypt
- [ ] RLS policies enforce user isolation
- [ ] Rate limiting on sync endpoints
- [ ] Audit logging for all operations
- [ ] Key rotation works correctly
- [ ] Device removal revokes access
- [ ] Data deletion is complete
