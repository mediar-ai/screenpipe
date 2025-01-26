import zipExtract from "extract-zip";
import {
	mkdirSync,
	existsSync,
	renameSync,
	rmSync,
	createWriteStream,
} from "fs";
import { join } from "path";
import { finished } from "stream/promises";
import { Readable } from "stream";
import { execSync } from "child_process";
import "dotenv/config";

async function download(url, path) {
	const res = await fetch(url);
	const fileStream = createWriteStream(path, { flags: "wx" });
	return finished(Readable.fromWeb(res.body).pipe(fileStream));
}
// Create bin directory if it doesn't exist to store the Tauri sidecar binaries
const binDir = join(import.meta.dirname, "../", "src-tauri", "bin");
if (!existsSync(binDir)) {
	mkdirSync(binDir);
}

// Clean up old screenpipe binaries, if any
const windowsScreenpipe = join(binDir, "screenpipe-x86_64-pc-windows-msvc.exe");
const linuxScreenpipe = join(binDir, "screenpipe-x86_64-unknown-linux-gnu");
const macScreenpipe = join(binDir, "screenpipe-aarch64-apple-darwin");
if (existsSync(windowsScreenpipe)) rmSync(windowsScreenpipe, { force: true });
if (existsSync(linuxScreenpipe)) rmSync(linuxScreenpipe, { force: true });
if (existsSync(macScreenpipe)) rmSync(macScreenpipe, { force: true });

const linuxTar = join(binDir, "screenpipe-linux.tar.gz");
const windowsZip = join(binDir, "screenpipe-windows.zip");
const macTar = join(binDir, "screenpipe-mac.tar.gz");
try {
	// Download all screenpipe archives
	const linuxDownload = download(
		`https://github.com/mediar-ai/screenpipe/releases/download/v${process.env.SCREENPIPE_VERSION}/screenpipe-${process.env.SCREENPIPE_VERSION}-x86_64-unknown-linux-gnu.tar.gz`,
		linuxTar
	);
	const windowsDownload = download(
		`https://github.com/mediar-ai/screenpipe/releases/download/v${process.env.SCREENPIPE_VERSION}/screenpipe-${process.env.SCREENPIPE_VERSION}-x86_64-pc-windows-msvc.zip`,
		windowsZip
	);
	const macDownload = download(
		`https://github.com/mediar-ai/screenpipe/releases/download/v${process.env.SCREENPIPE_VERSION}/screenpipe-${process.env.SCREENPIPE_VERSION}-aarch64-apple-darwin.tar.gz`,
		macTar
	);
	await Promise.all([linuxDownload, windowsDownload, macDownload]);

	// Using the 'tar' NPM package doesn't seem to work with Mac, so we'll use the 'tar' command directly,
	// should probably fix this in the future
	execSync(`tar -xzf ${linuxTar} -C ${binDir}`);
	renameSync(
		join(binDir, "bin", "screenpipe"),
		join(binDir, "screenpipe-x86_64-unknown-linux-gnu")
	);

	await zipExtract(windowsZip, { dir: binDir });
	renameSync(
		join(binDir, "bin", "screenpipe.exe"),
		join(binDir, "screenpipe-x86_64-pc-windows-msvc.exe")
	);

	execSync(`tar -xzf ${macTar} -C ${binDir}`);
	await renameSync(
		join(binDir, "bin", "screenpipe"),
		join(binDir, "screenpipe-aarch64-apple-darwin")
	);
} finally {
	// Clean up downloaded archives and extra directories
	if (existsSync(linuxTar)) {
		rmSync(linuxTar, { force: true, recursive: true });
	}
	if (existsSync(windowsZip)) {
		rmSync(windowsZip, { force: true, recursive: true });
	}
	if (existsSync(macTar)) {
		rmSync(macTar, { force: true, recursive: true });
	}
	if (existsSync(join(binDir, "bin"))) {
		rmSync(join(binDir, "bin"), { force: true, recursive: true });
	}
}
