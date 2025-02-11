"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.RateLimiter = void 0;
const langfuse_node_1 = require("langfuse-node");
const backend_1 = require("@clerk/backend");
const providers_1 = require("./providers");
const Sentry = __importStar(require("@sentry/cloudflare"));
const sdk_1 = require("@deepgram/sdk");
// Add cache for subscription status
class SubscriptionCache {
    constructor() {
        this.CACHE_TTL = 5 * 60 * 1000; // 5 minutes in milliseconds
        this.cache = new Map();
    }
    get(userId) {
        const entry = this.cache.get(userId);
        if (!entry)
            return null;
        if (Date.now() - entry.timestamp > this.CACHE_TTL) {
            this.cache.delete(userId);
            return null;
        }
        return entry.isValid;
    }
    set(userId, isValid) {
        this.cache.set(userId, {
            isValid,
            timestamp: Date.now(),
        });
    }
}
const subscriptionCache = new SubscriptionCache();
function validateSubscription(env, userId) {
    return __awaiter(this, void 0, void 0, function* () {
        console.log('validating user id has cloud sub', userId);
        // Check cache first
        const cached = subscriptionCache.get(userId);
        if (cached !== null) {
            return cached;
        }
        const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
        if (UUID_REGEX.test(userId)) {
            try {
                const response = yield fetch(`${env.SUPABASE_URL}/rest/v1/rpc/has_active_cloud_subscription`, {
                    method: 'POST',
                    headers: {
                        apikey: env.SUPABASE_ANON_KEY,
                        Authorization: `Bearer ${env.SUPABASE_ANON_KEY}`,
                        'Content-Type': 'application/json',
                    },
                    body: JSON.stringify({ input_user_id: userId }),
                });
                if (!response.ok) {
                    console.error('Supabase error:', yield response.text());
                    return false;
                }
                if (!response.ok) {
                    console.error('Supabase error:', yield response.text());
                    return false;
                }
                const isValid = yield response.json();
                subscriptionCache.set(userId, isValid);
                return isValid;
            }
            catch (error) {
                console.error('Error checking subscription:', error);
                return false;
            }
        }
        // If not a UUID, return false to allow Clerk verification to proceed
        return false;
    });
}
function verifyClerkToken(env, token) {
    return __awaiter(this, void 0, void 0, function* () {
        console.log('verifying clerk token', token);
        try {
            const payload = yield (0, backend_1.verifyToken)(token, {
                secretKey: env.CLERK_SECRET_KEY,
            });
            return payload.sub !== null;
        }
        catch (error) {
            console.error('clerk verification failed:', error);
            return false;
        }
    });
}
class RateLimiter {
    constructor(state) {
        this.state = state;
        this.requests = new Map();
    }
    fetch(request) {
        return __awaiter(this, void 0, void 0, function* () {
            const ip = request.headers.get('cf-connecting-ip') || 'unknown';
            const url = new URL(request.url);
            const now = Date.now();
            // different limits for different endpoints
            const limits = {
                '/v1/chat/completions': { rpm: 20, window: 60000 }, // 20 requests per minute for openai
                default: { rpm: 60, window: 60000 }, // 60 rpm for other endpoints
            };
            const limit = limits[url.pathname] || limits.default;
            // get or initialize request tracking
            let tracking = this.requests.get(ip) || { count: 0, lastReset: now };
            // reset if window expired
            if (now - tracking.lastReset > limit.window) {
                tracking = { count: 0, lastReset: now };
            }
            tracking.count++;
            this.requests.set(ip, tracking);
            const isAllowed = tracking.count <= limit.rpm;
            return new Response(JSON.stringify({
                allowed: isAllowed,
                remaining: Math.max(0, limit.rpm - tracking.count),
                reset_in: Math.ceil((tracking.lastReset + limit.window - now) / 1000),
            }));
        });
    }
}
exports.RateLimiter = RateLimiter;
function handleChatCompletions(body, env) {
    return __awaiter(this, void 0, void 0, function* () {
        const provider = (0, providers_1.createProvider)(body.model, env);
        if (body.stream) {
            const stream = yield provider.createStreamingCompletion(body);
            return new Response(stream, {
                headers: {
                    'Content-Type': 'text/event-stream',
                    'Cache-Control': 'no-cache',
                    Connection: 'keep-alive',
                },
            });
        }
        return yield provider.createCompletion(body);
    });
}
function handleOptions(request) {
    return __awaiter(this, void 0, void 0, function* () {
        const corsHeaders = {
            'Access-Control-Allow-Origin': '*',
            'Access-Control-Allow-Methods': 'GET, HEAD, POST, OPTIONS',
            'Access-Control-Allow-Headers': '*',
            'Access-Control-Max-Age': '86400',
        };
        // Handle CORS preflight requests
        if (request.headers.get('Origin') !== null &&
            request.headers.get('Access-Control-Request-Method') !== null &&
            request.headers.get('Access-Control-Request-Headers') !== null) {
            return new Response(null, {
                headers: Object.assign(Object.assign({}, corsHeaders), { 'Access-Control-Allow-Headers': request.headers.get('Access-Control-Request-Headers') || '*' }),
            });
        }
        // Handle standard OPTIONS request
        return new Response(null, {
            headers: {
                Allow: 'GET, HEAD, POST, OPTIONS',
            },
        });
    });
}
function handleWebSocketUpgrade(request, env) {
    return __awaiter(this, void 0, void 0, function* () {
        try {
            // Generate a unique request ID
            const requestId = crypto.randomUUID();
            // Create WebSocket pair
            const webSocketPair = new WebSocketPair();
            const [client, server] = Object.values(webSocketPair);
            server.accept();
            let params = new URL(request.url).searchParams;
            let sampleRate = params.get('sample_rate');
            let url = new URL('wss://api.deepgram.com/v1/listen');
            // for each key in params, set the url search param
            for (let [key, value] of params.entries()) {
                url.searchParams.set(key, value);
            }
            let deepgram = null;
            try {
                deepgram = (0, sdk_1.createClient)(env.DEEPGRAM_API_KEY);
            }
            catch (error) {
                console.error('Error creating Deepgram client:', error);
                return new Response(`Deepgram client creation failed: ${error.message}`, { status: 500 });
            }
            if (!deepgram) {
                return new Response('Deepgram client creation failed', { status: 500 });
            }
            let deepgramSocket;
            try {
                deepgramSocket = deepgram.listen.live({}, url.toString());
            }
            catch (error) {
                console.error('Error creating Deepgram socket:', error);
                return new Response(`Deepgram socket creation failed: ${error.message}`, { status: 500 });
            }
            deepgramSocket.on(sdk_1.LiveTranscriptionEvents.Open, () => {
                server.send(JSON.stringify({
                    type: 'connected',
                    message: 'WebSocket connection established',
                }));
            });
            // Simple passthrough: client -> Deepgram
            server.addEventListener('message', (event) => {
                if (deepgramSocket.getReadyState() === WebSocket.OPEN) {
                    deepgramSocket.send(event.data);
                }
            });
            // Simple passthrough: Deepgram -> client
            deepgramSocket.on(sdk_1.LiveTranscriptionEvents.Transcript, (data) => {
                if (server.readyState === WebSocket.OPEN) {
                    server.send(JSON.stringify(data));
                }
            });
            // Handle connection close
            server.addEventListener('close', () => {
                deepgramSocket.requestClose();
            });
            // Handle errors
            deepgramSocket.on(sdk_1.LiveTranscriptionEvents.Error, (error) => {
                if (server.readyState === WebSocket.OPEN) {
                    server.close(1011, 'Deepgram error: ' + error.message);
                }
            });
            return new Response(null, {
                status: 101,
                webSocket: client,
                headers: {
                    'dg-request-id': requestId,
                },
            });
        }
        catch (error) {
            console.error('WebSocket upgrade failed:', error);
            return new Response('WebSocket upgrade failed', { status: 500 });
        }
    });
}
exports.default = Sentry.withSentry((env) => ({
    dsn: 'https://60750a679399e9d0b8631c059fb7578d@o4507617161314304.ingest.us.sentry.io/4508689350983680',
    tracesSampleRate: 0.1,
    environment: env.NODE_ENV || 'development',
    enabled: (env.NODE_ENV || 'development') === 'production',
}), {
    /**
     * This is the standard fetch handler for a Cloudflare Worker
     *
     * @param request - The request submitted to the Worker from the client
     * @param env - The interface to reference bindings declared in wrangler.toml
     * @param ctx - The execution context of the Worker
     * @returns The response to be sent back to the client
     */
    fetch(request, env, ctx) {
        return __awaiter(this, void 0, void 0, function* () {
            var _a, _b;
            const langfuse = new langfuse_node_1.Langfuse({
                publicKey: env.LANGFUSE_PUBLIC_KEY,
                secretKey: env.LANGFUSE_SECRET_KEY,
                baseUrl: 'https://us.cloud.langfuse.com',
            });
            langfuse.debug();
            langfuse.on('error', (error) => {
                console.error('langfuse error:', error);
            });
            // Modify your fetch handler to use this for OPTIONS requests
            if (request.method === 'OPTIONS') {
                return handleOptions(request);
            }
            const ip = request.headers.get('cf-connecting-ip') || 'unknown';
            const rateLimiterId = env.RATE_LIMITER.idFromName(ip);
            const rateLimiter = env.RATE_LIMITER.get(rateLimiterId);
            // Check rate limit
            const rateLimitResponse = yield rateLimiter.fetch(request.url);
            const rateLimitData = (yield rateLimitResponse.json());
            if (!rateLimitData.allowed) {
                const response = new Response(JSON.stringify({
                    error: 'rate limit exceeded',
                    retry_after: 60, // seconds
                }), {
                    status: 429,
                    headers: {
                        'Access-Control-Allow-Origin': '*',
                        'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
                        'Access-Control-Allow-Headers': '*',
                        'Access-Control-Allow-Credentials': 'true',
                        'Access-Control-Max-Age': '86400',
                        'Retry-After': '60',
                    },
                });
                response.headers.append('Vary', 'Origin');
                return response;
            }
            try {
                const url = new URL(request.url);
                const path = url.pathname;
                const upgradeHeader = (_a = request.headers.get('upgrade')) === null || _a === void 0 ? void 0 : _a.toLowerCase();
                if (path === '/v1/listen' && upgradeHeader === 'websocket') {
                    console.log('websocket request to /v1/listen detected, bypassing auth');
                    return yield handleWebSocketUpgrade(request, env);
                }
                // Add auth check for protected routes
                if (path !== '/test') {
                    const authHeader = request.headers.get('Authorization');
                    console.log('authHeader', authHeader);
                    if (!authHeader || !(authHeader.startsWith('Bearer ') || authHeader.startsWith('Token '))) {
                        const response = new Response(JSON.stringify({ error: 'unauthorized' }), {
                            status: 401,
                            headers: {
                                'Access-Control-Allow-Origin': '*',
                                'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
                                'Access-Control-Allow-Headers': '*',
                                'Access-Control-Allow-Credentials': 'true',
                                'Access-Control-Max-Age': '86400',
                            },
                        });
                        response.headers.append('Vary', 'Origin');
                        return response;
                    }
                    const token = authHeader.split(' ')[1];
                    let isValid = yield validateSubscription(env, token);
                    // If not valid, try to verify as a Clerk token
                    if (!isValid) {
                        isValid = yield verifyClerkToken(env, token);
                    }
                    if (!isValid) {
                        console.log('all validation attempts failed');
                        const response = new Response(JSON.stringify({ error: 'invalid subscription' }), {
                            status: 401,
                            headers: {
                                'Access-Control-Allow-Origin': '*',
                                'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
                                'Access-Control-Allow-Headers': '*',
                                'Access-Control-Allow-Credentials': 'true',
                                'Access-Control-Max-Age': '86400',
                            },
                        });
                        response.headers.append('Vary', 'Origin');
                        return response;
                    }
                }
                console.log('path', path);
                if (path === '/test') {
                    const response = new Response('ai proxy is working!', {
                        status: 200,
                        headers: {
                            'Access-Control-Allow-Origin': '*',
                            'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
                            'Access-Control-Allow-Headers': '*',
                            'Access-Control-Allow-Credentials': 'true',
                            'Access-Control-Max-Age': '86400',
                        },
                    });
                    response.headers.append('Vary', 'Origin');
                    return response;
                }
                if (path === '/v1/chat/completions' && request.method === 'POST') {
                    const body = (yield request.json());
                    const trace = langfuse.trace({
                        id: 'ai_call_' + Date.now(),
                        name: 'ai_call',
                        metadata: {
                            model: body.model,
                            streaming: body.stream === true,
                        },
                    });
                    try {
                        const response = yield handleChatCompletions(body, env);
                        trace.update({
                            metadata: {
                                completionStatus: 'success',
                                completionTime: new Date().toISOString(),
                                modelUsed: body.model,
                                isStreaming: body.stream === true,
                            },
                            output: response.statusText,
                        });
                        response.headers.set('Access-Control-Allow-Origin', '*');
                        response.headers.set('Access-Control-Allow-Methods', 'GET, HEAD, POST, OPTIONS');
                        response.headers.append('Vary', 'Origin');
                        return response;
                    }
                    catch (error) {
                        trace.update({
                            metadata: {
                                completionStatus: 'error',
                                errorTime: new Date().toISOString(),
                                errorType: error.name,
                                errorMessage: error.message,
                            },
                            output: error.message,
                        });
                        throw error;
                    }
                }
                if (path === '/v1/listen' && request.method === 'POST') {
                    // Get the raw body instead of form data
                    const audioBuffer = yield request.arrayBuffer();
                    const languages = ((_b = request.headers.get('detect_language')) === null || _b === void 0 ? void 0 : _b.split(',')) || [];
                    const sampleRate = request.headers.get('sample_rate') || '16000';
                    try {
                        const deepgramResponse = yield fetch('https://api.deepgram.com/v1/listen?model=nova-2&smart_format=true&sample_rate=' +
                            sampleRate +
                            (languages.length > 0 ? '&' + languages.map((lang) => `detect_language=${lang}`).join('&') : ''), {
                            method: 'POST',
                            headers: {
                                Authorization: `Token ${env.DEEPGRAM_API_KEY}`,
                                'Content-Type': 'audio/wav', // Set correct content type
                            },
                            body: audioBuffer,
                        });
                        if (!deepgramResponse.ok) {
                            const errorData = yield deepgramResponse.json();
                            throw new Error(`Deepgram API error: ${JSON.stringify(errorData)}`);
                        }
                        const data = yield deepgramResponse.json();
                        const response = new Response(JSON.stringify(data), {
                            headers: {
                                'Access-Control-Allow-Origin': '*',
                                'Access-Control-Allow-Methods': 'GET, HEAD, POST, OPTIONS',
                                'Access-Control-Allow-Headers': '*',
                                'Content-Type': 'application/json',
                            },
                        });
                        response.headers.append('Vary', 'Origin');
                        return response;
                    }
                    catch (error) {
                        console.error('Error in Deepgram request:', error);
                        const response = new Response(JSON.stringify({
                            error: error.message,
                            details: error.stack,
                        }), {
                            status: 500,
                            headers: {
                                'Access-Control-Allow-Origin': '*',
                                'Access-Control-Allow-Methods': 'GET, HEAD, POST, OPTIONS',
                                'Access-Control-Allow-Headers': '*',
                                'Content-Type': 'application/json',
                            },
                        });
                        response.headers.append('Vary', 'Origin');
                        return response;
                    }
                }
                if (path === '/v1/models' && request.method === 'GET') {
                    try {
                        // Create instances of all providers
                        const providers = {
                            anthropic: (0, providers_1.createProvider)('claude-3-5-sonnet-latest', env),
                            openai: (0, providers_1.createProvider)('gpt-4', env),
                            gemini: (0, providers_1.createProvider)('gemini-1.5-pro', env),
                        };
                        // Fetch models from all providers in parallel
                        const results = yield Promise.allSettled([
                            providers.anthropic.listModels(),
                            providers.openai.listModels(),
                            providers.gemini.listModels(),
                        ]);
                        // Combine and filter out failed requests
                        const models = results
                            .filter((result) => result.status === 'fulfilled')
                            .flatMap((result) => result.value);
                        const response = new Response(JSON.stringify({ models }), {
                            headers: {
                                'Access-Control-Allow-Origin': '*',
                                'Access-Control-Allow-Methods': 'GET, HEAD, POST, OPTIONS',
                                'Access-Control-Allow-Headers': '*',
                                'Content-Type': 'application/json',
                            },
                        });
                        response.headers.append('Vary', 'Origin');
                        return response;
                    }
                    catch (error) {
                        console.error('Error fetching models:', error);
                        const response = new Response(JSON.stringify({
                            error: 'Failed to fetch models',
                            details: error instanceof Error ? error.message : 'Unknown error',
                        }), {
                            status: 500,
                            headers: {
                                'Access-Control-Allow-Origin': '*',
                                'Access-Control-Allow-Methods': 'GET, HEAD, POST, OPTIONS',
                                'Access-Control-Allow-Headers': '*',
                                'Content-Type': 'application/json',
                            },
                        });
                        response.headers.append('Vary', 'Origin');
                        return response;
                    }
                }
                const response = new Response('not found', {
                    status: 404,
                    headers: {
                        'Access-Control-Allow-Origin': '*',
                        'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
                        'Access-Control-Allow-Headers': '*',
                        'Access-Control-Max-Age': '86400',
                    },
                });
                response.headers.append('Vary', 'Origin');
                return response;
            }
            catch (error) {
                console.error('error in fetch:', error);
                const response = new Response('an error occurred', {
                    status: 500,
                    headers: {
                        'Access-Control-Allow-Origin': '*',
                        'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
                        'Access-Control-Allow-Headers': '*',
                        'Access-Control-Max-Age': '86400',
                    },
                });
                response.headers.append('Vary', 'Origin');
                return response;
            }
            finally {
                yield langfuse.shutdownAsync();
            }
        });
    },
});
/*
terminal 1

cd screenpipe-actions/ai-proxy
wrangler dev


terminal 2
HOST=https://ai-proxy.i-f9f.workers.dev
HOST=http://localhost:8787
TOKEN=foobar (check app settings)
in
less "$HOME/Library/Application Support/screenpipe/store.bin"


curl $HOST/test


curl -X POST $HOST/v1/listen \
  -H "Content-Type: audio/wav" \
  -H "detect_language: en" \
  -H "Authorization: Bearer $TOKEN" \
  --data-binary "@./screenpipe-audio/test_data/poetic_kapil_gupta.wav"

curl -X POST $HOST/v1/chat/completions \
-H "Content-Type: application/json" \
-H "Authorization: Bearer $TOKEN" \
-d '{
"model": "gpt-4o",
"messages": [
    {
    "role": "system",
    "content": "You are a helpful assistant."
    },
    {
    "role": "user",
    "content": "Tell me a short joke."
    }
],
"stream": true
}' | while read -r line; do
echo "$line" | sed 's/^data: //g' | jq -r '.choices[0].delta.content // empty' 2>/dev/null
done | tr -d '\n'

using anthropic

curl -X POST $HOST/v1/chat/completions \
-H "Content-Type: application/json" \
-H "Authorization: Bearer $TOKEN" \
-d '{
"model": "claude-3-5-sonnet-20240620",
"messages": [
    {
    "role": "system",
    "content": "You are a helpful assistant."
    },
    {
    "role": "user",
    "content": "Tell me a short joke."
    }
],
"stream": true
}' | while read -r line; do
echo "$line" | sed 's/^data: //g' | jq -r '.choices[0].delta.content // empty' 2>/dev/null
done | tr -d '\n'

using gemini

curl -X POST $HOST/v1/chat/completions \
-H "Content-Type: application/json" \
-H "Authorization: Bearer $TOKEN" \
-d '{
"model": "gemini-1.5-flash-latest",
"stream": true,
"messages": [
    {
        "role": "system",
        "content": "You are a helpful assistant."
    },
    {
        "role": "user",
        "content": "Tell me a short joke."
    }
]
}'

deployment

wrangler deploy

rate limit testing

# test openai endpoint (should hit limit faster)
for i in {1..25}; do
  echo "Request $i"
  curl -X POST "$HOST/v1/chat/completions" \
    -H "Content-Type: application/json" \
    -d '{"model":"gpt-4","messages":[{"role":"user","content":"hi"}]}' \
    -w "\nStatus: %{http_code}\n"
  sleep 0.1
done

*/
