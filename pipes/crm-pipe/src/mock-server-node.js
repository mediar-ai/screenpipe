// src/mock-server-node.js
const http = require('http');
const url = require('url');

const PORT = 9999;
const CUSTOM_HOST_URL = `http://localhost:${PORT}`;

const CORS_HEADERS = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
};

const server = http.createServer((req, res) => {
    const parsedUrl = url.parse(req.url, true);
    const pathname = parsedUrl.pathname;

    // Set CORS headers
    for (const key in CORS_HEADERS) {
        res.setHeader(key, CORS_HEADERS[key]);
    }

    // Handle CORS preflight
    if (req.method === "OPTIONS") {
        res.writeHead(204); // No content
        res.end();
        return;
    }

    // --- Mock Endpoints ---

    // 1. Health Check
    if (pathname === "/health") {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ 
            status: "healthy", 
            host: CUSTOM_HOST_URL,
            message: "API Host settings validation successful." 
        }));
        return;
    }

    // 2. Search Endpoint
    if (pathname === "/search") {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({
            data: [
                { 
                    type: "ocr", 
                    content: { text: `🎯 SUCCESS: Data retrieved via Custom Host on Port ${PORT}` }, 
                    timestamp: new Date().toISOString() 
                }
            ]
        }));
        return;
    }
    
    // Default Response
    res.writeHead(404, { 'Content-Type': 'text/plain' });
    res.end(`404 Not Found at Mock Server on Port ${PORT}`);
});

server.listen(PORT, 'localhost', () => {
    console.log(`👻 GHOST PROTOCOL: Mock Screenpipe Server running on ${CUSTOM_HOST_URL}`);
});