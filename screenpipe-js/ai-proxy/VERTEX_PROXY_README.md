# Vertex AI Proxy for Claude Agent SDK

This proxy allows the Claude Agent SDK to use Vertex AI without requiring users to set up GCP credentials. Users just log in to Screenpipe, and the proxy handles authentication with Vertex AI using Screenpipe's service account.

## How It Works

1. User logs in to Screenpipe desktop app
2. Desktop app configures Agent SDK with environment variables:
   - `CLAUDE_CODE_USE_VERTEX=1`
   - `ANTHROPIC_VERTEX_BASE_URL=https://ai-proxy.i-f9f.workers.dev` (or your worker URL)
   - `CLAUDE_CODE_SKIP_VERTEX_AUTH=1`
3. Agent SDK sends requests to the proxy
4. Proxy validates user's auth token (via Clerk)
5. Proxy authenticates with Vertex AI using service account
6. Proxy forwards request and returns response

## Setup (Worker)

### 1. Create GCP Service Account

1. Go to [GCP Console](https://console.cloud.google.com/)
2. Create a new service account or use existing
3. Grant "Vertex AI User" role
4. Create and download JSON key

### 2. Configure Worker Secrets

```bash
cd screenpipe-js/ai-proxy

# Set the service account JSON (paste entire JSON, escape quotes)
wrangler secret put VERTEX_SERVICE_ACCOUNT_JSON

# Set project ID
wrangler secret put VERTEX_PROJECT_ID
```

### 3. Deploy

```bash
wrangler deploy
```

## Local Development

1. Copy `.dev.vars.example` to `.dev.vars`
2. Fill in your credentials
3. Run `npm run dev`
4. Test with `./test-vertex-local.sh`

## Desktop App Integration

In your Tauri app, when spawning the Agent SDK:

```typescript
// Set environment variables for Agent SDK
const env = {
  CLAUDE_CODE_USE_VERTEX: '1',
  ANTHROPIC_VERTEX_BASE_URL: 'https://ai-proxy.i-f9f.workers.dev',
  CLAUDE_CODE_SKIP_VERTEX_AUTH: '1',
  // User's auth token for the proxy
  SCREENPIPE_AUTH_TOKEN: userAuthToken,
};

// The Agent SDK will use these env vars automatically
```

## API Endpoints

### POST /v1/messages

Proxies Anthropic Messages API requests to Vertex AI.

**Headers:**
- `Authorization: Bearer <user-token>` - User's Screenpipe auth token
- `Content-Type: application/json`

**Body:** Standard Anthropic Messages API format

**Example:**
```bash
curl -X POST https://ai-proxy.i-f9f.workers.dev/v1/messages \
  -H "Authorization: Bearer $USER_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "model": "claude-3-5-sonnet-v2@20241022",
    "max_tokens": 1024,
    "messages": [{"role": "user", "content": "Hello"}]
  }'
```

## Supported Models

Models depend on what's enabled in your GCP project. Common options:

- `claude-sonnet-4@20250514` (recommended, default)
- `claude-opus-4@20250514`
- `claude-3-5-sonnet-v2@20241022`
- `claude-3-5-haiku@20241022`

To check available models, visit the [Vertex AI Model Garden](https://console.cloud.google.com/vertex-ai/model-garden) in your GCP Console.

## Troubleshooting

### "Vertex AI service account not configured"
- Ensure `VERTEX_SERVICE_ACCOUNT_JSON` secret is set in the worker

### "Failed to get access token"
- Check service account JSON is valid
- Ensure service account has "Vertex AI User" role
- Check region is correct (us-east5 is recommended)

### "Vertex AI error: 403"
- Service account doesn't have permission
- Project doesn't have Vertex AI API enabled
- Quota exceeded
