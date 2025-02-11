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
var __asyncValues = (this && this.__asyncValues) || function (o) {
    if (!Symbol.asyncIterator) throw new TypeError("Symbol.asyncIterator is not defined.");
    var m = o[Symbol.asyncIterator], i;
    return m ? m.call(o) : (o = typeof __values === "function" ? __values(o) : o[Symbol.iterator](), i = {}, verb("next"), verb("throw"), verb("return"), i[Symbol.asyncIterator] = function () { return this; }, i);
    function verb(n) { i[n] = o[n] && function (v) { return new Promise(function (resolve, reject) { v = o[n](v), settle(resolve, reject, v.done, v.value); }); }; }
    function settle(resolve, reject, d, v) { Promise.resolve(v).then(function(v) { resolve({ value: v, done: d }); }, reject); }
};
Object.defineProperty(exports, "__esModule", { value: true });
const js_1 = require("@screenpipe/js");
const fs = __importStar(require("fs/promises"));
function monitorVision() {
    return __awaiter(this, void 0, void 0, function* () {
        var _a, e_1, _b, _c;
        console.log("starting vision monitor...");
        console.log("------------------------------");
        console.log("to view screenshots:");
        console.log("1. paste this in a new terminal: 'open $(pwd)/screenpipe-js/examples/vision-monitor/screenshots/viewer.html'");
        console.log("2. watch live updates every 1s");
        console.log("------------------------------");
        // create screenshots directory
        yield fs.mkdir("screenshots", { recursive: true });
        // create simple html viewer
        const htmlContent = `
    <!DOCTYPE html>
    <html>
      <head>
        <title>screenpipe vision monitor</title>
        <style>
          body { 
            background: #000;
            color: #fff;
            font-family: monospace;
          }
          img {
            max-width: 90vw;
            margin: 20px auto;
            display: block;
            border: 1px solid #333;
          }
          .info {
            text-align: center;
            opacity: 0.7;
          }
        </style>
        <script>
          setInterval(() => {
            document.getElementById('latest').src = 'latest.png?' + Date.now();
          }, 1000);
        </script>
      </head>
      <body>
        <div class="info">screenpipe vision monitor</div>
        <img id="latest" src="latest.png" />
      </body>
    </html>
  `;
        yield fs.writeFile("screenshots/viewer.html", htmlContent);
        try {
            for (var _d = true, _e = __asyncValues(js_1.pipe.streamVision(true)), _f; _f = yield _e.next(), _a = _f.done, !_a; _d = true) {
                _c = _f.value;
                _d = false;
                const event = _c;
                const { timestamp, window_name, image } = event.data;
                if (image) {
                    const filename = `screenshots/${timestamp}-${window_name}.png`;
                    // save to archive
                    yield fs.writeFile(filename, Buffer.from(image, "base64"));
                    // update latest for viewer
                    yield fs.writeFile("screenshots/latest.png", Buffer.from(image, "base64"));
                    console.log(`saved screenshot: ${filename}`);
                }
                console.log(`window: ${window_name}`);
            }
        }
        catch (e_1_1) { e_1 = { error: e_1_1 }; }
        finally {
            try {
                if (!_d && !_a && (_b = _e.return)) yield _b.call(_e);
            }
            finally { if (e_1) throw e_1.error; }
        }
    });
}
monitorVision().catch(console.error);
