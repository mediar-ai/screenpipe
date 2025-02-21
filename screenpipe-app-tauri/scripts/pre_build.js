import { $ } from 'bun'
import fs from 'fs/promises'
import os from 'os'
import path from 'path'

const isDevMode = process.env.SCREENPIPE_APP_DEV === 'true' || false;

const originalCWD = process.cwd()
// Change CWD to src-tauri
process.chdir(path.join(__dirname, '../src-tauri'))
const platform = {
	win32: 'windows',
	darwin: 'macos',
	linux: 'linux',
}[os.platform()]
const cwd = process.cwd()
console.log('cwd', cwd)


const config = {
	ffmpegRealname: 'ffmpeg',
	windows: {
		ffmpegName: 'ffmpeg-7.0.2-full_build-shared',
		ffmpegUrl: 'https://www.gyan.dev/ffmpeg/builds/packages/ffmpeg-7.0.2-full_build-shared.7z',
		vcpkgPackages: ['opencl', 'onnxruntime-gpu'],
	},
	linux: {
		aptPackages: [
			'tesseract-ocr',
			'libtesseract-dev',
			'ffmpeg',
			'pkg-config',
			'build-essential',
			'libglib2.0-dev',
			'libgtk-3-dev',
			'libwebkit2gtk-4.1-dev',
			'clang',
			'cmake', // Tauri
			'libavutil-dev',
			'libavformat-dev',
			'libavfilter-dev',
			'libavdevice-dev', // FFMPEG
			'libasound2-dev', // cpal
			'libxdo-dev'
		],
	},
	macos: {
		ffmpegName: 'ffmpeg-7.0-macOS-default',
		ffmpegUrl: 'https://master.dl.sourceforge.net/project/avbuild/macOS/ffmpeg-7.0-macOS-default.tar.xz?viasf=1',
	},
}

async function findWget() {
	const possiblePaths = [
		'C:\\ProgramData\\chocolatey\\bin\\wget.exe',
		'C:\\Program Files\\Git\\mingw64\\bin\\wget.exe',
		'C:\\msys64\\usr\\bin\\wget.exe',
		'C:\\Windows\\System32\\wget.exe',
		'C:\\wget\\wget.exe',
		'wget' // This will work if wget is in PATH
	];

	for (const wgetPath of possiblePaths) {
		try {
			await $`${wgetPath} --version`.quiet();
			console.log(`wget found at: ${wgetPath}`);
			return wgetPath;
		} catch (error) {
			// wget not found at this path, continue searching
		}
	}

	console.error('wget not found. Please install wget and make sure it\'s in your PATH.');
	process.exit(1);
}

// Export for Github actions
const exports = {
	ffmpeg: path.join(cwd, config.ffmpegRealname),
	libClang: 'C:\\Program Files\\LLVM\\bin',
	cmake: 'C:\\Program Files\\CMake\\bin',
}

// Add this function to copy the Bun binary
async function copyBunBinary() {
	console.log('checking bun binary for tauri...');

	let bunSrc, bunDest1, bunDest2;
	if (platform === 'windows') {
		// Get and log npm global prefix
		const npmGlobalPrefix = (await $`npm config get prefix`.text()).trim();
		console.log('npm global prefix:', npmGlobalPrefix);

		// Try to find bun location using system commands
		let bunPathFromSystem;
		try {
			bunPathFromSystem = (await $`where.exe bun`.text()).trim().split('\n')[0];
		} catch {
			try {
				bunPathFromSystem = (await $`which bun`.text()).trim();
			} catch {
				console.log('could not find bun using where.exe or which');
			}
		}

		if (bunPathFromSystem) {
			console.log('found bun using system command at:', bunPathFromSystem);
		}

		const possibleBunPaths = [
			// Add system-found path if it exists
			bunPathFromSystem,
			// Bun's default installer location
			path.join(os.homedir(), '.bun', 'bin', 'bun.exe'),
			// npm global paths
			path.join(npmGlobalPrefix, 'node_modules', 'bun', 'bin', 'bun.exe'),
			path.join(npmGlobalPrefix, 'bun.exe'),
			path.join(npmGlobalPrefix, 'bin', 'bun.exe'),
			// AppData paths
			path.join(os.homedir(), 'AppData', 'Local', 'bun', 'bun.exe'),
			// Direct paths
			'C:\\Program Files\\bun\\bun.exe',
			'C:\\Program Files (x86)\\bun\\bun.exe',
			// System path
			'bun.exe'
		].filter(Boolean);

		console.log('searching bun in these locations:');
		possibleBunPaths.forEach(p => console.log('- ' + p));

		bunSrc = null;
		for (const possiblePath of possibleBunPaths) {
			try {
				await fs.access(possiblePath);
				console.log('found bun at:', possiblePath);
				bunSrc = possiblePath;
				break;
			} catch {
				continue;
			}
		}

		if (!bunSrc) {
			throw new Error('Could not find bun.exe in any expected location. Please check if bun is installed correctly');
		}

		// Define the destination path
		bunDest1 = path.join(cwd, 'bun-x86_64-pc-windows-msvc.exe');
		console.log('copying bun from:', bunSrc);
		console.log('copying bun to:', bunDest1);
	} else if (platform === 'macos') {
		bunSrc = path.join(os.homedir(), '.bun', 'bin', 'bun');
		bunDest1 = path.join(cwd, 'bun-aarch64-apple-darwin');
		bunDest2 = path.join(cwd, 'bun-x86_64-apple-darwin');
	} else if (platform === 'linux') {
		bunSrc = path.join(os.homedir(), '.bun', 'bin', 'bun');
		bunDest1 = path.join(cwd, 'bun-x86_64-unknown-linux-gnu');
	}

	if (await fs.exists(bunDest1)) {
		console.log('bun binary already exists for tauri.');
		return;
	}

	try {
		await fs.access(bunSrc);
		await copyFile(bunSrc, bunDest1);
		console.log(`bun binary copied successfully from ${bunSrc} to ${bunDest1}`);

		if (platform === 'macos') {
			await copyFile(bunSrc, bunDest2);
			console.log(`bun binary also copied to ${bunDest2}`);
		}
	} catch (error) {
		console.error('failed to copy bun binary:', error);
		console.error('source path:', bunSrc);
		process.exit(1);
	}
}


// Helper function to copy file and set permissions
async function copyFile(src, dest) {
	await fs.copyFile(src, dest);
	await fs.chmod(dest, 0o755); // ensure the binary is executable
}

/* ########## Linux ########## */
if (platform == 'linux') {
	// Install APT packages
	try {
		await $`sudo apt-get update`;

		for (const name of config.linux.aptPackages) {
			await $`sudo apt-get install -y ${name}`;
		}
	} catch (error) {
		console.error("error installing apps via apt, %s", error.message);
	}


	// Copy screenpipe binary
	console.log('copying screenpipe binary for linux...');
	const potentialPaths = [
		path.join(__dirname, '..', '..', '..', '..', 'target', 'release', 'screenpipe'),
		path.join(__dirname, '..', '..', '..', '..', 'target', 'x86_64-unknown-linux-gnu', 'release', 'screenpipe'),
		path.join(__dirname, '..', '..', '..', 'target', 'release', 'screenpipe'),
		path.join(__dirname, '..', '..', 'target', 'release', 'screenpipe'),
		path.join(__dirname, '..', 'target', 'release', 'screenpipe'),
		'/home/runner/work/screenpipe/screenpipe/target/release/screenpipe',
	];

	let copied = false;
	for (const screenpipeSrc of potentialPaths) {
		if (process.env['SKIP_SCREENPIPE_SETUP']) {
			copied = true;
			break;
		}
		const screenpipeDest = path.join(cwd, 'screenpipe-x86_64-unknown-linux-gnu');
		try {
			await fs.copyFile(screenpipeSrc, screenpipeDest);
			console.log(`screenpipe binary copied successfully from ${screenpipeSrc}`);
			copied = true;
			break;
		} catch (error) {
			console.warn(`failed to copy screenpipe binary from ${screenpipeSrc}:`, error);
		}
	}

	if (!copied) {
		console.error("failed to copy screenpipe binary from any potential path.");
		// uncomment the following line if you want the script to exit on failure
		// process.exit(1);
	}
}

/* ########## Windows ########## */
if (platform == 'windows') {
	const wgetPath = await findWget();

	console.log('Copying screenpipe binary...');

	const potentialPaths = [
		path.join(__dirname, '..', '..', 'target', 'release', 'screenpipe.exe'),
		path.join(__dirname, '..', '..', 'target', 'x86_64-pc-windows-msvc', 'release', 'screenpipe.exe'),
		path.join(__dirname, '..', 'target', 'release', 'screenpipe.exe'),
		path.join(__dirname, '..', '..', 'target', 'release', 'screenpipe.exe'),
		'D:\\a\\screenpipe\\screenpipe\\target\\release\\screenpipe.exe',
	];

	let copied = false;
	for (const screenpipeSrc of potentialPaths) {
		if (process.env['SKIP_SCREENPIPE_SETUP']) {
			copied = true;
			break;
		}
		const screenpipeDest = path.join(cwd, 'screenpipe-x86_64-pc-windows-msvc.exe');
		try {
			await fs.copyFile(screenpipeSrc, screenpipeDest);
			console.log(`Screenpipe binary copied successfully from ${screenpipeSrc}`);
			copied = true;
			break;
		} catch (error) {
			console.warn(`Failed to copy screenpipe binary from ${screenpipeSrc}:`, error);
		}
	}

	if (!copied) {
		console.error("Failed to copy screenpipe binary from any potential path.");
		// Uncomment the following line if you want the script to exit on failure
		// process.exit(1);
	}

	// Setup FFMPEG
	if (!(await fs.exists(config.ffmpegRealname))) {
		await $`${wgetPath} --no-config --tries=10 --retry-connrefused --waitretry=10 --secure-protocol=auto --no-check-certificate --show-progress ${config.windows.ffmpegUrl} -O ${config.windows.ffmpegName}.7z`
		await $`'C:\\Program Files\\7-Zip\\7z.exe' x ${config.windows.ffmpegName}.7z`
		await $`mv ${config.windows.ffmpegName} ${config.ffmpegRealname}`
		await $`rm -rf ${config.windows.ffmpegName}.7z`
	}

	// Setup vcpkg packages with environment variables set inline
	// TODO is this even used? dont we use build.rs for this?
	// await $`SystemDrive=${process.env.SYSTEMDRIVE} SystemRoot=${process.env.SYSTEMROOT} windir=${process.env.WINDIR} ${process.env.VCPKG_ROOT}\\vcpkg.exe install ${config.windows.vcpkgPackages}`.quiet()
}

async function getMostRecentBinaryPath(targetArch, paths) {
	const validPaths = await Promise.all(paths.map(async (path) => {
		if (await fs.exists(path)) {
			const { stdout } = await $`file ${path}`.quiet();
			const binaryArch = stdout.includes('arm64') ? 'arm64' :
				stdout.includes('x86_64') ? 'x86_64' : null;
			if (binaryArch === targetArch) {
				const stat = await fs.stat(path);
				return { path, mtime: stat.mtime };
			}
		}
		return null;
	}));

	const filteredPaths = validPaths.filter(Boolean);

	if (filteredPaths.length === 0) {
		return null;
	}

	return filteredPaths.reduce((mostRecent, current) =>
		current.mtime > mostRecent.mtime ? current : mostRecent
	).path;
}
/* ########## macOS ########## */
if (platform == 'macos') {
	const architectures = ['arm64', 'x86_64'];
	for (const arch of architectures) {
		if (process.env['SKIP_SCREENPIPE_SETUP']) {
			break;
		}
		console.log(`Setting up screenpipe bin for ${arch}...`);
		if (arch === 'arm64') {
			const paths = [
				"../../target/aarch64-apple-darwin/release/screenpipe",
				"../../target/release/screenpipe"
			];
			const mostRecentPath = await getMostRecentBinaryPath('arm64', paths);
			if (mostRecentPath) {
				await $`cp ${mostRecentPath} screenpipe-aarch64-apple-darwin`;
				console.log(`Copied most recent arm64 screenpipe binary from ${mostRecentPath}`);
			} else {
				console.error("No suitable arm64 screenpipe binary found");
			}
		} else if (arch === 'x86_64') {
			// copy screenpipe binary (more recent one)
			const paths = [
				"../../target/x86_64-apple-darwin/release/screenpipe",
				"../../target/release/screenpipe"
			];
			const mostRecentPath = await getMostRecentBinaryPath('x86_64', paths);
			if (mostRecentPath) {
				await $`cp ${mostRecentPath} screenpipe-x86_64-apple-darwin`;
				console.log(`Copied most recent x86_64 screenpipe binary from ${mostRecentPath}`);
			} else {
				console.error("No suitable x86_64 screenpipe binary found");
			}
		}
		console.log(`screenpipe for ${arch} set up successfully.`);
	}

	// Setup FFMPEG
	if (!(await fs.exists(config.ffmpegRealname))) {
		await $`wget --no-config -nc ${config.macos.ffmpegUrl} -O ${config.macos.ffmpegName}.tar.xz`
		await $`tar xf ${config.macos.ffmpegName}.tar.xz`
		await $`mv ${config.macos.ffmpegName} ${config.ffmpegRealname}`
		await $`rm ${config.macos.ffmpegName}.tar.xz`
	} else {
		console.log('FFMPEG already exists');
	}


	console.log('Moved and renamed ffmpeg binary for externalBin');

	// Setup Swift UI monitoring
	console.log('Setting up Swift UI monitoring...');
	try {
		const swiftSrc = path.join(cwd, '../../screenpipe-vision/src/ui_monitoring_macos.swift');
		const architectures = ['arm64', 'x86_64'];

		for (const arch of architectures) {
			console.log(`Compiling Swift UI monitor for ${arch}...`);

			const binaryName = `ui_monitor-${arch === 'arm64' ? 'aarch64' : 'x86_64'}-apple-darwin`;
			const outputPath = path.join(cwd, binaryName);

			// Compile directly to the final destination
			await $`swiftc -O -whole-module-optimization -enforce-exclusivity=unchecked -num-threads 8 -target ${arch}-apple-macos11.0 -o ${outputPath} ${swiftSrc} -framework Cocoa -framework ApplicationServices -framework Foundation`;

			// Sign with ad-hoc signature first - this ensures the binary is at least signed
			// Tauri will re-sign it later with the proper identity
			// await $`codesign --force --sign - ${outputPath}`;

			console.log(`Swift UI monitor for ${arch} compiled successfully`);
			await fs.chmod(outputPath, 0o755);
		}
	} catch (error) {
		console.error('Error setting up Swift UI monitoring:', error);
		console.log('Current working directory:', cwd);
		console.log('Expected Swift source path:', path.join(cwd, '../../screenpipe-vision/src/ui_monitoring_macos.swift'));
		throw error; // Rethrow to fail the build if Swift compilation fails
	}
}



// Development hints
if (!process.env.GITHUB_ENV) {
	console.log('\nCommands to build 🔨:')
	// Get relative path to screenpipe-app-tauri folder
	const relativePath = path.relative(originalCWD, path.join(cwd, '..'))
	if (originalCWD != cwd && relativePath != '') {
		console.log(`cd ${relativePath}`)
	}
	console.log('bun install')

	if (!process.env.GITHUB_ENV) {
		console.log('bun tauri build')
	}
}

// Config Github ENV
if (process.env.GITHUB_ENV) {
	console.log('Adding ENV')
	if (platform == 'macos' || platform == 'windows') {
		const ffmpeg = `FFMPEG_DIR=${exports.ffmpeg}\n`
		console.log('Adding ENV', ffmpeg)
		await fs.appendFile(process.env.GITHUB_ENV, ffmpeg)
	}
	if (platform == 'macos') {
		const embed_metal = 'WHISPER_METAL_EMBED_LIBRARY=ON'
		await fs.appendFile(process.env.GITHUB_ENV, embed_metal)
	}
	if (platform == 'windows') {
		const openblas = `OPENBLAS_PATH=${exports.openBlas}\n`
		console.log('Adding ENV', openblas)
		await fs.appendFile(process.env.GITHUB_ENV, openblas)
	}
}


// Near the end of the script, call these functions
await copyBunBinary();

// --dev or --build
const action = process.argv?.[2]
if (action?.includes('--build' || action.includes('--dev'))) {
	process.chdir(path.join(cwd, '..'))
	process.env['FFMPEG_DIR'] = exports.ffmpeg
	if (platform === 'windows') {
		process.env['OPENBLAS_PATH'] = exports.openBlas
		process.env['CLBlast_DIR'] = exports.clblast
		process.env['LIBCLANG_PATH'] = exports.libClang
		process.env['PATH'] = `${process.env['PATH']};${exports.cmake}`
	}
	if (platform == 'macos') {
		process.env['WHISPER_METAL_EMBED_LIBRARY'] = 'ON'
	}
	await $`bun install`
	await $`bunx tauri ${action.includes('--dev') ? 'dev' : 'build'}`
}
