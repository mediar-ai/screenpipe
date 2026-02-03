//! Simulation engine for realistic audio transcription scenarios
//!
//! This module provides building blocks for simulating real-world audio capture
//! including timing, device characteristics, speaker behavior, and transcription noise.

use rand::{rngs::StdRng, Rng, SeedableRng};
use std::collections::HashMap;

// =============================================================================
// CONSTANTS
// =============================================================================

/// Chunk duration in seconds (matches screenpipe default)
pub const CHUNK_DURATION_SECS: f64 = 10.0;

/// Overlap between chunks in seconds (matches screenpipe default)
pub const OVERLAP_SECS: f64 = 2.0;

/// Effective new content per chunk
pub const EFFECTIVE_CHUNK_SECS: f64 = CHUNK_DURATION_SECS - OVERLAP_SECS;

// =============================================================================
// DEVICE SIMULATION
// =============================================================================

/// Simulated audio device
#[derive(Debug, Clone)]
pub struct SimDevice {
    pub name: String,
    pub device_type: SimDeviceType,
    /// Latency in milliseconds (affects timing of transcription arrival)
    pub latency_ms: u64,
    /// Quality factor 0.0-1.0 (affects transcription accuracy)
    pub quality: f64,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash)]
pub enum SimDeviceType {
    Input,  // Microphone
    Output, // Speaker/system audio
}

impl SimDevice {
    pub fn microphone(name: &str) -> Self {
        Self {
            name: name.to_string(),
            device_type: SimDeviceType::Input,
            latency_ms: 50,
            quality: 0.95,
        }
    }

    pub fn speaker(name: &str) -> Self {
        Self {
            name: name.to_string(),
            device_type: SimDeviceType::Output,
            latency_ms: 20,
            quality: 0.98, // Speaker output is typically cleaner
        }
    }

    pub fn with_latency(mut self, latency_ms: u64) -> Self {
        self.latency_ms = latency_ms;
        self
    }

    pub fn with_quality(mut self, quality: f64) -> Self {
        self.quality = quality.clamp(0.0, 1.0);
        self
    }
}

// =============================================================================
// SPEAKER SIMULATION
// =============================================================================

/// Simulated speaker with unique characteristics
#[derive(Debug, Clone)]
pub struct SimSpeaker {
    pub id: usize,
    pub name: String,
    /// Words per minute (affects speech duration)
    pub wpm: f64,
    /// Probability of filler words ("um", "uh", "like")
    pub filler_rate: f64,
    /// Probability of repeating words/phrases
    pub repetition_rate: f64,
}

impl SimSpeaker {
    pub fn new(id: usize, name: &str) -> Self {
        Self {
            id,
            name: name.to_string(),
            wpm: 150.0, // Average speaking rate
            filler_rate: 0.05,
            repetition_rate: 0.02,
        }
    }

    /// Create a fast speaker (200+ WPM)
    pub fn fast(id: usize, name: &str) -> Self {
        Self {
            id,
            name: name.to_string(),
            wpm: 200.0,
            filler_rate: 0.02,
            repetition_rate: 0.01,
        }
    }

    /// Create a slow, deliberate speaker (100 WPM)
    pub fn slow(id: usize, name: &str) -> Self {
        Self {
            id,
            name: name.to_string(),
            wpm: 100.0,
            filler_rate: 0.08,
            repetition_rate: 0.04,
        }
    }

    /// Estimate duration in seconds for speaking given text
    pub fn estimate_duration(&self, text: &str) -> f64 {
        let word_count = text.split_whitespace().count() as f64;
        (word_count / self.wpm) * 60.0
    }
}

// =============================================================================
// TRANSCRIPTION NOISE SIMULATION
// =============================================================================

/// Simulates Whisper transcription variations and errors
#[derive(Debug, Clone)]
pub struct TranscriptionNoise {
    rng: StdRng,
    /// Probability of word-level substitution
    pub word_error_rate: f64,
    /// Probability of punctuation variation
    pub punctuation_variation_rate: f64,
    /// Probability of capitalization variation
    pub capitalization_variation_rate: f64,
    /// Probability of number format variation (e.g., "5" vs "five")
    pub number_format_variation_rate: f64,
}

impl TranscriptionNoise {
    pub fn new(seed: u64) -> Self {
        Self {
            rng: StdRng::seed_from_u64(seed),
            word_error_rate: 0.02,
            punctuation_variation_rate: 0.10,
            capitalization_variation_rate: 0.15,
            number_format_variation_rate: 0.20,
        }
    }

    /// No noise - perfect transcription
    pub fn perfect() -> Self {
        Self {
            rng: StdRng::seed_from_u64(0),
            word_error_rate: 0.0,
            punctuation_variation_rate: 0.0,
            capitalization_variation_rate: 0.0,
            number_format_variation_rate: 0.0,
        }
    }

    /// High noise - poor quality audio
    pub fn high_noise(seed: u64) -> Self {
        Self {
            rng: StdRng::seed_from_u64(seed),
            word_error_rate: 0.08,
            punctuation_variation_rate: 0.30,
            capitalization_variation_rate: 0.40,
            number_format_variation_rate: 0.50,
        }
    }

    /// Apply noise to a transcript
    pub fn apply(&mut self, transcript: &str) -> String {
        let words: Vec<&str> = transcript.split_whitespace().collect();
        let mut result: Vec<String> = Vec::with_capacity(words.len());

        for word in words {
            let mut w = word.to_string();

            // Punctuation variation
            if self.rng.random::<f64>() < self.punctuation_variation_rate {
                w = self.vary_punctuation(&w);
            }

            // Capitalization variation
            if self.rng.random::<f64>() < self.capitalization_variation_rate {
                w = self.vary_capitalization(&w);
            }

            // Word error (substitution with similar sounding word)
            if self.rng.random::<f64>() < self.word_error_rate {
                w = self.substitute_word(&w);
            }

            result.push(w);
        }

        result.join(" ")
    }

    fn vary_punctuation(&mut self, word: &str) -> String {
        let mut w = word.to_string();

        // Remove or add trailing punctuation
        if w.ends_with('.') || w.ends_with(',') || w.ends_with('!') || w.ends_with('?') {
            if self.rng.random::<f64>() < 0.5 {
                w.pop();
            }
        } else if self.rng.random::<f64>() < 0.3 {
            let puncts = ['.', ',', '!', '?'];
            w.push(puncts[self.rng.random_range(0..puncts.len())]);
        }

        w
    }

    fn vary_capitalization(&mut self, word: &str) -> String {
        if self.rng.random::<f64>() < 0.5 {
            word.to_lowercase()
        } else {
            word.to_uppercase()
        }
    }

    fn substitute_word(&self, word: &str) -> String {
        // Common Whisper misheard substitutions
        let substitutions: HashMap<&str, &str> = [
            ("their", "there"),
            ("there", "they're"),
            ("your", "you're"),
            ("to", "too"),
            ("its", "it's"),
            ("then", "than"),
            ("affect", "effect"),
            ("accept", "except"),
        ]
        .into_iter()
        .collect();

        let lower = word.to_lowercase();
        if let Some(sub) = substitutions.get(lower.as_str()) {
            sub.to_string()
        } else {
            word.to_string()
        }
    }
}

// =============================================================================
// SPEECH SEGMENT
// =============================================================================

/// A segment of speech with timing and metadata
#[derive(Debug, Clone)]
pub struct SpeechSegment {
    /// Ground truth transcription
    pub ground_truth: String,
    /// Speaker who produced this speech
    pub speaker: SimSpeaker,
    /// Start time in seconds from recording start
    pub start_time: f64,
    /// End time in seconds
    pub end_time: f64,
    /// Whether this is actual speech or silence
    pub is_speech: bool,
}

impl SpeechSegment {
    pub fn speech(text: &str, speaker: SimSpeaker, start_time: f64) -> Self {
        let duration = speaker.estimate_duration(text);
        Self {
            ground_truth: text.to_string(),
            speaker,
            start_time,
            end_time: start_time + duration,
            is_speech: true,
        }
    }

    pub fn silence(start_time: f64, duration: f64) -> Self {
        Self {
            ground_truth: String::new(),
            speaker: SimSpeaker::new(0, "silence"),
            start_time,
            end_time: start_time + duration,
            is_speech: false,
        }
    }

    pub fn duration(&self) -> f64 {
        self.end_time - self.start_time
    }
}

// =============================================================================
// AUDIO CHUNK SIMULATION
// =============================================================================

/// Simulated audio chunk as would be processed by the transcription pipeline
#[derive(Debug, Clone)]
pub struct SimAudioChunk {
    /// Device that captured this chunk
    pub device: SimDevice,
    /// Chunk start time in seconds
    pub start_time: f64,
    /// Chunk end time in seconds
    pub end_time: f64,
    /// Transcribed text (potentially with noise)
    pub transcription: String,
    /// Ground truth text (for evaluation)
    pub ground_truth: String,
    /// Whether this chunk represents a duplicate of another
    pub is_duplicate_of: Option<usize>,
    /// Speaker ID if identifiable
    pub speaker_id: Option<usize>,
}

impl SimAudioChunk {
    pub fn duration(&self) -> f64 {
        self.end_time - self.start_time
    }
}

// =============================================================================
// RECORDING SESSION SIMULATION
// =============================================================================

/// Simulates a complete recording session with multiple devices and speakers
#[derive(Debug)]
pub struct RecordingSession {
    /// All devices capturing audio
    pub devices: Vec<SimDevice>,
    /// All speakers in the session
    pub speakers: Vec<SimSpeaker>,
    /// Speech segments (ground truth timeline)
    pub segments: Vec<SpeechSegment>,
    /// Transcription noise generator
    pub noise: TranscriptionNoise,
    /// Random number generator
    rng: StdRng,
}

impl RecordingSession {
    pub fn new(seed: u64) -> Self {
        Self {
            devices: Vec::new(),
            speakers: Vec::new(),
            segments: Vec::new(),
            noise: TranscriptionNoise::new(seed),
            rng: StdRng::seed_from_u64(seed),
        }
    }

    pub fn add_device(mut self, device: SimDevice) -> Self {
        self.devices.push(device);
        self
    }

    pub fn add_speaker(mut self, speaker: SimSpeaker) -> Self {
        self.speakers.push(speaker);
        self
    }

    pub fn add_segment(mut self, segment: SpeechSegment) -> Self {
        self.segments.push(segment);
        self
    }

    pub fn with_noise(mut self, noise: TranscriptionNoise) -> Self {
        self.noise = noise;
        self
    }

    /// Get total duration of the recording
    pub fn total_duration(&self) -> f64 {
        self.segments
            .iter()
            .map(|s| s.end_time)
            .max_by(|a, b| a.partial_cmp(b).unwrap())
            .unwrap_or(0.0)
    }

    /// Generate simulated audio chunks as they would be produced by screenpipe
    pub fn generate_chunks(&mut self) -> Vec<SimAudioChunk> {
        let total_duration = self.total_duration();
        let mut chunks = Vec::new();
        let mut chunk_id: usize = 0;

        // For each device, generate chunks with appropriate timing
        for device in &self.devices {
            let mut current_time = 0.0;

            while current_time < total_duration {
                let chunk_start = current_time;
                let chunk_end = (current_time + CHUNK_DURATION_SECS).min(total_duration);

                // Find speech segments that overlap with this chunk
                let overlapping_segments: Vec<&SpeechSegment> = self
                    .segments
                    .iter()
                    .filter(|s| s.is_speech && s.start_time < chunk_end && s.end_time > chunk_start)
                    .collect();

                // Combine transcriptions from overlapping segments
                let ground_truth: String = overlapping_segments
                    .iter()
                    .map(|s| s.ground_truth.as_str())
                    .collect::<Vec<_>>()
                    .join(" ");

                if !ground_truth.is_empty() {
                    // Apply device quality factor to noise
                    let transcription = if device.quality < 1.0 {
                        self.noise.apply(&ground_truth)
                    } else {
                        ground_truth.clone()
                    };

                    // Determine if this is a cross-device duplicate
                    let is_duplicate = if device.device_type == SimDeviceType::Input {
                        // Microphone might pick up speaker output
                        Some(chunk_id.saturating_sub(1))
                    } else {
                        None
                    };

                    chunks.push(SimAudioChunk {
                        device: device.clone(),
                        start_time: chunk_start,
                        end_time: chunk_end,
                        transcription,
                        ground_truth: ground_truth.clone(),
                        is_duplicate_of: is_duplicate,
                        speaker_id: overlapping_segments.first().map(|s| s.speaker.id),
                    });
                }

                chunk_id += 1;
                current_time += EFFECTIVE_CHUNK_SECS;
            }
        }

        // Sort chunks by time (simulating interleaved device capture)
        chunks.sort_by(|a, b| {
            a.start_time
                .partial_cmp(&b.start_time)
                .unwrap()
                .then_with(|| a.device.latency_ms.cmp(&b.device.latency_ms))
        });

        chunks
    }
}

// =============================================================================
// DEDUPLICATION HANDLER (SIMULATION)
// =============================================================================

use screenpipe_audio::transcription::text_utils::longest_common_word_substring;

/// Simulates the deduplication logic for testing
#[derive(Debug)]
pub struct DedupHandler {
    /// Previous transcript for overlap detection
    previous_transcript: String,
    /// All inserted transcripts
    pub inserted: Vec<String>,
    /// All blocked transcripts (duplicates)
    pub blocked: Vec<String>,
    /// Use fixed logic (true) or buggy logic (false)
    use_fixed_logic: bool,
}

impl DedupHandler {
    pub fn new_fixed() -> Self {
        Self {
            previous_transcript: String::new(),
            inserted: Vec::new(),
            blocked: Vec::new(),
            use_fixed_logic: true,
        }
    }

    pub fn new_buggy() -> Self {
        Self {
            previous_transcript: String::new(),
            inserted: Vec::new(),
            blocked: Vec::new(),
            use_fixed_logic: false,
        }
    }

    /// Process a new transcript, returns true if inserted
    pub fn process(&mut self, transcript: &str) -> bool {
        if transcript.is_empty() {
            return false;
        }

        if let Some((prev_idx, cur_idx, match_len)) =
            longest_common_word_substring(&self.previous_transcript, transcript)
        {
            let curr_words: Vec<&str> = transcript.split_whitespace().collect();

            let new_cur = if self.use_fixed_logic {
                // FIXED: Skip past the overlap
                let skip_until = cur_idx + match_len;
                if skip_until < curr_words.len() {
                    curr_words[skip_until..].join(" ")
                } else {
                    String::new()
                }
            } else {
                // BUGGY: Take from start of overlap (not after it)
                curr_words[cur_idx..].join(" ")
            };

            if new_cur.is_empty() {
                self.blocked.push(transcript.to_string());
                return false;
            }

            self.inserted.push(new_cur);
            self.previous_transcript = transcript.to_string();
            return true;
        }

        // No overlap found, insert as-is
        self.inserted.push(transcript.to_string());
        self.previous_transcript = transcript.to_string();
        true
    }

    /// Reset state (simulate long gap in recording)
    pub fn reset(&mut self) {
        self.previous_transcript.clear();
    }
}

// =============================================================================
// TESTS
// =============================================================================

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_speaker_duration_estimation() {
        let speaker = SimSpeaker::new(1, "Test");
        // 150 WPM = 2.5 words per second
        // "hello world" = 2 words = 0.8 seconds
        let duration = speaker.estimate_duration("hello world");
        assert!((duration - 0.8).abs() < 0.1);
    }

    #[test]
    fn test_transcription_noise_application() {
        let mut noise = TranscriptionNoise::new(42);
        noise.word_error_rate = 0.0;
        noise.punctuation_variation_rate = 0.0;
        noise.capitalization_variation_rate = 0.0;

        let result = noise.apply("hello world");
        assert_eq!(result, "hello world");
    }

    #[test]
    fn test_recording_session_chunk_generation() {
        let speaker = SimSpeaker::new(1, "Speaker1");
        let mut session = RecordingSession::new(42)
            .add_device(SimDevice::speaker("Speaker"))
            .add_segment(SpeechSegment::speech("hello world test", speaker, 0.0));

        let chunks = session.generate_chunks();
        assert!(!chunks.is_empty());
        assert!(chunks[0].transcription.contains("hello"));
    }
}
