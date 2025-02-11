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
exports.publishCommand = void 0;
const fs_1 = __importDefault(require("fs"));
const path_1 = __importDefault(require("path"));
const credentials_1 = require("../../utils/credentials");
const constants_1 = require("../../constants");
const archiver_1 = __importDefault(require("archiver"));
const crypto_1 = __importDefault(require("crypto"));
const ignore_1 = __importDefault(require("ignore"));
const colors_1 = require("../../utils/colors");
const commander_1 = require("commander");
const NEXTJS_FILES = {
    required: ["package.json", ".next"],
    optional: [
        "package-lock.json",
        "bun.lockb",
        "next.config.js",
        "next.config.mjs",
    ],
};
const MAX_FILE_SIZE = 500 * 1024 * 1024; // 500MB limit
function archiveNextJsProject(archive) {
    return __awaiter(this, void 0, void 0, function* () {
        const { required, optional } = NEXTJS_FILES;
        // Verify required files exist
        const missingFiles = required.filter((file) => !fs_1.default.existsSync(file));
        if (missingFiles.length > 0) {
            throw new Error(`Required files not found: ${missingFiles.join(", ")}. ` +
                "Make sure you're in the correct directory and the project is built.");
        }
        // Archive required files
        for (const file of required) {
            if (file === ".next") {
                archive.directory(".next", ".next", (entry) => {
                    return entry.name.startsWith(".next/cache/") ? false : entry;
                });
            }
            else {
                archive.file(file, { name: file });
            }
        }
        // Archive optional files if they exist
        optional
            .filter((file) => fs_1.default.existsSync(file))
            .forEach((file) => {
            archive.file(file, { name: file });
        });
    });
}
function archiveStandardProject(archive, ig) {
    archive.glob("**/*", {
        ignore: [".git/**", "node_modules/**", ".next/cache/**"],
        dot: true,
        nodir: false,
        mark: true,
    });
}
function retryFetch(url_1, options_1) {
    return __awaiter(this, arguments, void 0, function* (url, options, maxRetries = 3, baseDelay = 1000) {
        for (let attempt = 1; attempt <= maxRetries; attempt++) {
            try {
                const response = yield fetch(url, options);
                if (response.ok)
                    return response;
                // If it's the last attempt, throw the error
                if (attempt === maxRetries) {
                    throw new Error(`Failed after ${maxRetries} attempts: ${yield response.text()}`);
                }
            }
            catch (error) {
                if (attempt === maxRetries)
                    throw error;
            }
            // Exponential backoff delay
            const delay = baseDelay * Math.pow(2, attempt - 1);
            yield new Promise((resolve) => setTimeout(resolve, delay));
        }
        throw new Error("Retry failed"); // Fallback error
    });
}
exports.publishCommand = new commander_1.Command('publish')
    .description('publish or update a pipe to the store')
    .requiredOption('-n, --name <name>', 'name of the pipe')
    .option('-v, --verbose', 'enable verbose logging', false)
    .action((opts) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        if (opts.verbose) {
            console.log(colors_1.colors.dim(`${colors_1.symbols.arrow} starting publish command...`));
        }
        const apiKey = credentials_1.Credentials.getApiKey();
        if (!apiKey) {
            console.error(colors_1.colors.error(`${colors_1.symbols.error} Not logged in. Please login first using ${colors_1.colors.highlight("screenpipe login")}`));
            process.exit(1);
        }
        if (opts.verbose) {
            console.log(colors_1.colors.dim(`${colors_1.symbols.arrow} reading package.json...`));
        }
        // Read package.json
        let packageJson;
        try {
            packageJson = JSON.parse(fs_1.default.readFileSync("package.json", "utf-8"));
        }
        catch (error) {
            console.error(colors_1.colors.error(`${colors_1.symbols.error} Failed to read package.json. Make sure you're in the correct directory.`));
            process.exit(1);
        }
        if (!packageJson.name || !packageJson.version) {
            console.error(colors_1.colors.error(`${colors_1.symbols.error} Package name and version are required in package.json`));
            process.exit(1);
        }
        console.log(colors_1.colors.info(`\n${colors_1.symbols.info} Publishing ${colors_1.colors.highlight(packageJson.name)} v${packageJson.version}...`));
        console.log(colors_1.colors.dim(`${colors_1.symbols.arrow} Creating package archive...`));
        // Create temporary zip file
        const zipPath = path_1.default.join(process.cwd(), `${packageJson.name}-${packageJson.version}.zip`);
        const output = fs_1.default.createWriteStream(zipPath);
        const archive = (0, archiver_1.default)("zip", { zlib: { level: 9 } });
        // Setup .gitignore rules
        const ig = (0, ignore_1.default)();
        if (fs_1.default.existsSync(".gitignore")) {
            ig.add(fs_1.default.readFileSync(".gitignore").toString());
        }
        // Check if it's a Next.js project by looking for next.config.js or next.config.mjs
        const isNextProject = fs_1.default.existsSync("next.config.js") ||
            fs_1.default.existsSync("next.config.mjs") ||
            fs_1.default.existsSync("next.config.ts");
        // Create zip file
        archive.pipe(output);
        if (isNextProject) {
            yield archiveNextJsProject(archive);
        }
        else {
            archiveStandardProject(archive, ig);
        }
        yield new Promise((resolve, reject) => {
            output.on("close", resolve);
            archive.on("error", reject);
            archive.finalize();
        });
        if (opts.verbose) {
            console.log(colors_1.colors.dim(`${colors_1.symbols.arrow} detected project type: ${isNextProject ? "nextjs" : "standard"}`));
            console.log(colors_1.colors.dim(`${colors_1.symbols.arrow} starting archive creation...`));
        }
        // Calculate file hash
        const fileBuffer = fs_1.default.readFileSync(zipPath);
        const hashSum = crypto_1.default.createHash("sha256");
        hashSum.update(fileBuffer);
        const fileHash = hashSum.digest("hex");
        const fileSize = fs_1.default.statSync(zipPath).size;
        if (fileSize > MAX_FILE_SIZE) {
            console.error(colors_1.colors.error(`${colors_1.symbols.error} Package size (${(fileSize / 1024 / 1024).toFixed(2)}MB) exceeds maximum allowed size (${MAX_FILE_SIZE / 1024 / 1024}MB)`));
            fs_1.default.unlinkSync(zipPath); // Clean up the zip file
            process.exit(1);
        }
        let description = null;
        try {
            const readmeContent = fs_1.default.readFileSync("README.md", "utf-8");
            if (readmeContent) {
                description = readmeContent;
            }
        }
        catch (error) {
            console.log(colors_1.colors.dim(`${colors_1.symbols.arrow} No README.md found, required for description`));
        }
        if (!description) {
            console.error(colors_1.colors.error(`${colors_1.symbols.error} Description is required`));
            process.exit(1);
        }
        if (opts.verbose) {
            console.log(colors_1.colors.dim(`${colors_1.symbols.arrow} calculating file hash...`));
        }
        // Replace the upload section with this:
        try {
            // First get the signed URL
            console.log(colors_1.colors.dim(`${colors_1.symbols.arrow} Getting upload URL...`));
            const urlResponse = yield fetch(`${constants_1.API_BASE_URL}/api/plugins/publish`, {
                method: "POST",
                headers: {
                    Authorization: `Bearer ${apiKey}`,
                    "Content-Type": "application/json",
                },
                body: JSON.stringify({
                    name: opts.name,
                    version: packageJson.version,
                    fileSize,
                    fileHash,
                    description,
                }),
            });
            if (!urlResponse.ok) {
                throw new Error(`Failed to get upload URL: ${yield urlResponse.text()}`);
            }
            const { uploadUrl, path } = yield urlResponse.json();
            // Upload directly to Supabase
            console.log(colors_1.colors.dim(`${colors_1.symbols.arrow} Uploading to storage...`));
            const uploadResponse = yield retryFetch(uploadUrl, {
                method: "PUT",
                headers: {
                    "Content-Type": "application/zip",
                },
                body: fileBuffer,
            });
            if (!uploadResponse.ok) {
                const text = yield uploadResponse.text();
                throw new Error(`Failed to upload file to storage: ${text}`);
            }
            // Notify server that upload is complete
            console.log(colors_1.colors.dim(`${colors_1.symbols.arrow} Finalizing upload...`));
            const finalizeResponse = yield fetch(`${constants_1.API_BASE_URL}/api/plugins/publish/finalize`, {
                method: "POST",
                headers: {
                    Authorization: `Bearer ${apiKey}`,
                    "Content-Type": "application/json",
                },
                body: JSON.stringify({
                    name: opts.name,
                    version: packageJson.version,
                    fileHash,
                    storagePath: path,
                    description,
                    fileSize,
                }),
            });
            if (!finalizeResponse.ok) {
                const text = yield finalizeResponse.text();
                throw new Error(`Failed to finalize upload: ${text}`);
            }
            const data = yield finalizeResponse.json();
            // Success messages
            console.log(colors_1.colors.success(`\n${colors_1.symbols.success} Successfully published plugin!`));
            console.log(colors_1.colors.listItem(`${colors_1.colors.label("Name")} ${packageJson.name}`));
            console.log(colors_1.colors.listItem(`${colors_1.colors.label("Version")} ${packageJson.version}`));
            console.log(colors_1.colors.listItem(`${colors_1.colors.label("Size")} ${(fileSize / 1024).toFixed(2)} KB`));
            if (data.message) {
                console.log(colors_1.colors.info(`\n${colors_1.symbols.info} ${data.message}`));
            }
            // Cleanup zip file
            fs_1.default.unlinkSync(zipPath);
            if (opts.verbose) {
                console.log(colors_1.colors.dim(`${colors_1.symbols.arrow} cleaned up temporary zip file`));
            }
        }
        catch (error) {
            // Cleanup zip file even if upload failed
            if (fs_1.default.existsSync(zipPath)) {
                fs_1.default.unlinkSync(zipPath);
                if (opts.verbose) {
                    console.log(colors_1.colors.dim(`${colors_1.symbols.arrow} cleaned up temporary zip file`));
                }
            }
            if (error instanceof Error) {
                console.error(colors_1.colors.error(`\n${colors_1.symbols.error} Publishing failed: ${error.message}`));
            }
            process.exit(1);
        }
    }
    catch (error) {
        if (error instanceof Error) {
            console.error(colors_1.colors.error(`\n${colors_1.symbols.error} Publishing failed: ${error.message}`));
        }
        else {
            console.error(colors_1.colors.error(`\n${colors_1.symbols.error} Publishing failed with unexpected error`));
        }
        process.exit(1);
    }
}));
