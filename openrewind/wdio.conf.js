const { TestRecorder } = require('./e2e/record.js');
const { spawn, execSync } = require('node:child_process');
const os = require('node:os');
const path = require('node:path');
const fs = require('node:fs');

const videoRecorder = new TestRecorder();
let tauriDriver;

// Helper function to find the correct executable path
const findExecutablePath = () => {
	const paths = [
		'./src-tauri/target/release/screenpipe-app.exe',
		'./src-tauri/target/x86_64-pc-windows-msvc/release/screenpipe-app.exe',
		'./src-tauri/target/release/screenpipe-app',
		'./src-tauri/target/x86_64-unknown-linux-gnu/release/screenpipe-app'
	];
	
	for (const p of paths) {
		if (fs.existsSync(p)) {
			return p;
		}
	}
	
	throw new Error('Could not find screenpipe-app.exe in any of the expected locations');
};

const executablePath = findExecutablePath();
exports.config = {
	hostname: '127.0.0.1',
	port: 4444,
	specs: ['./e2e/tests/**/*.js'],
	maxInstances: 1,
	capabilities: [
		{
			maxInstances: 1,
			'tauri:options': {
				application: executablePath
			}
		}
	],
	reporters: ['spec'],
	framework: 'mocha',
	mochaOpts: {
		ui: 'bdd',
		timeout: 60000
	},

	waitforTimeout: 10000,
	connectionRetryTimeout: 120000,
	connectionRetryCount: 0,

	before: async function() {
		// Initialize browser object
		// await browser.setWindowSize(1200, 850);
	},

	beforeTest: function (test) {
		const videoPath = path.join(__dirname, '/e2e/videos');
		videoRecorder.start(test, videoPath);
	},

	afterTest: async function () {
		await videoRecorder.stop();
	},

	// ensure we are running `tauri-driver` before the session starts so that we can proxy the webdriver requests
	beforeSession: () =>
		(tauriDriver = spawn(path.resolve(os.homedir(), '.cargo', 'bin', 'tauri-driver'), [], {
			stdio: [null, process.stdout, process.stderr]
		})),

	afterSession: async () => {
		// Make sure to stop the video recorder before killing the tauri driver
		await videoRecorder.stop();
		
		if (tauriDriver) {
			tauriDriver.kill();
		}
	},
}; 