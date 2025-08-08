/* eslint-disable no-console */
const { spawn } = require('child_process');
const path = require('node:path');

function fileName(title) {
	return encodeURIComponent(title.trim().replace(/\s+/g, '-'));
}

class TestRecorder {
	ffmpeg;
	isRecording = false;
	stopPromise = null;
	stopResolve = null;

	constructor() {}

	stop() {
		if (!this.isRecording || !this.ffmpeg) {
			return Promise.resolve();
		}

		// If we already have a stop operation in progress, return that promise
		if (this.stopPromise) {
			return this.stopPromise;
		}

		// Create a new promise for this stop operation
		this.stopPromise = new Promise((resolve) => {
			this.stopResolve = resolve;
			
			// Set a timeout to force kill if graceful shutdown doesn't work
			const forceKillTimeout = setTimeout(() => {
				console.log('[ffmpeg] Force killing ffmpeg process after timeout');
				this.ffmpeg.kill('SIGKILL');
			}, 5000);

			// Handle the close event to resolve the promise
			this.ffmpeg.once('close', (code, signal) => {
				clearTimeout(forceKillTimeout);
				this.isRecording = false;
				this.ffmpeg = null;
				this.stopPromise = null;
				this.stopResolve = null;
				resolve();
			});

			// On Windows, sending 'q' to stdin is more reliable than SIGINT
			// This tells ffmpeg to quit gracefully and finalize the output file
			console.log('[ffmpeg] Sending quit command for graceful shutdown');
			try {
				this.ffmpeg.stdin.write('q');
			} catch (err) {
				console.log('[ffmpeg] Failed to send quit command, falling back to SIGINT');
				this.ffmpeg.kill('SIGINT');
			}
		});

		return this.stopPromise;
	}

	start(test, videoPath) {
		if (!videoPath || !test) {
			throw new Error('Cannot start recording without a test and path for the video file.');
		}

		// If we're already recording, stop the previous recording first
		if (this.isRecording) {
			console.log('[ffmpeg] Stopping previous recording before starting a new one');
			this.stop().then(() => this._startRecording(test, videoPath));
		} else {
			this._startRecording(test, videoPath);
		}
	}

	_startRecording(test, videoPath) {
		const parsedPath = path.join(
			videoPath,
			`${fileName(test.parent)}-${fileName(test.title)}.mp4`
		);

		console.log(`[ffmpeg] Starting recording: ${parsedPath}`);

		const isWindows = process.platform === 'win32';
		const ffmpegArgs = isWindows ? [
			'-f',
			'gdigrab',
			'-framerate',
			'30',
			'-i',
			'desktop',
			'-loglevel',
			'error',
			'-y',
			'-pix_fmt',
			'yuv420p',
			'-thread_queue_size',
			'1024',
			parsedPath
		] : [
			'-f',
			'x11grab',
			'-video_size',
			'1920x1080',
			'-i',
			process.env.DISPLAY || ':0.0',
			'-loglevel',
			'error',
			'-y',
			'-pix_fmt',
			'yuv420p',
			'-thread_queue_size',
			'1024',
			parsedPath
		];

		this.ffmpeg = spawn('ffmpeg', ffmpegArgs);

		this.isRecording = true;

		function logBuffer(buffer, prefix) {
			const lines = buffer.toString().trim().split('\n');
			lines.forEach(function (line) {
				console.log(prefix + line);
			});
		}

		this.ffmpeg.stdout.on('data', (data) => {
			logBuffer(data, '[ffmpeg:stdout] ');
		});

		this.ffmpeg.stderr.on('data', (data) => {
			logBuffer(data, '[ffmpeg:error] ');
		});

		this.ffmpeg.on('close', (code, signal) => {
			if (code) {
				console.log(`[ffmpeg] exited with code ${code}: ${parsedPath}`);
			}
			if (signal) {
				console.log(`[ffmpeg] received signal ${signal}: ${parsedPath}`);
			}
		});
	}
}

module.exports = { TestRecorder }; 