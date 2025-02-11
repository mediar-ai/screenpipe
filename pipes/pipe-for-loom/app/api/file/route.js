"use strict";
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.GET = GET;
const fs_1 = __importDefault(require("fs"));
const path_1 = __importDefault(require("path"));
const server_1 = require("next/server");
let isAudio = false;
function GET(req) {
    return __awaiter(this, void 0, void 0, function* () {
        const videoPath = req.nextUrl.searchParams.get('path');
        if (!videoPath || typeof videoPath !== 'string') {
            return server_1.NextResponse.json({ error: 'file path is required' }, { status: 400 });
        }
        try {
            const fullPath = path_1.default.resolve(videoPath);
            console.log(`attempting to access file: ${fullPath}`);
            if (fullPath.includes('input') || fullPath.includes('output')) {
                isAudio = true;
            }
            const fileStream = fs_1.default.createReadStream(fullPath);
            const contentType = getContentType(fullPath);
            const headers = new Headers();
            headers.set('Content-Type', contentType);
            headers.set('Accept-Ranges', 'bytes');
            const transform = new TransformStream();
            const writer = transform.writable.getWriter();
            fileStream.on('data', (chunk) => writer.write(chunk));
            fileStream.on('end', () => writer.close());
            return new Response(transform.readable, { headers });
        }
        catch (error) {
            console.error('Error fetching file:', error);
            if (error.code === 'ENOENT') {
                console.error('Error: File not found');
                return server_1.NextResponse.json({ error: 'File not found' }, { status: 404 });
            }
            else if (error.code === 'EACCES') {
                console.error('Error: Permission denied');
                return server_1.NextResponse.json({ error: 'Permission denied' }, { status: 403 });
            }
            else {
                console.error('Unexpected error:', error);
                return server_1.NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
            }
        }
    });
}
function getContentType(filePath) {
    const ext = path_1.default.extname(filePath).toLowerCase();
    switch (ext) {
        case '.mp4':
            return 'video/mp4';
        case '.webm':
            return 'video/webm';
        case '.mp3':
            return 'audio/mpeg';
        case '.wav':
            return 'audio/wav';
        default:
            return isAudio ? "audio/mpeg" : "video/mp4";
            ;
    }
}
