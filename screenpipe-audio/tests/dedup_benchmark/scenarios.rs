//! Benchmark scenarios for deduplication testing
//!
//! Each scenario simulates a realistic recording situation and evaluates
//! the deduplication logic's performance under those conditions.

use crate::fixtures::*;
use crate::metrics::*;
use crate::simulation::*;

// =============================================================================
// SCENARIO RUNNER
// =============================================================================

/// Run a benchmark scenario and collect metrics
pub fn run_scenario(
    name: &str,
    description: &str,
    mut session: RecordingSession,
) -> BenchmarkResult {
    let chunks = session.generate_chunks();

    // Track ground truth for duplicate detection
    let mut seen_texts: std::collections::HashSet<String> = std::collections::HashSet::new();

    // Collect chunk data with duplicate labels
    let chunk_data: Vec<(String, bool)> = chunks
        .iter()
        .map(|chunk| {
            let normalized = normalize_for_comparison(&chunk.transcription);
            let is_duplicate = seen_texts.contains(&normalized);
            if !is_duplicate {
                seen_texts.insert(normalized);
            }
            (chunk.transcription.clone(), is_duplicate)
        })
        .collect();

    // Reset seen texts for buggy evaluation
    seen_texts.clear();

    // Evaluate buggy logic
    let mut buggy_handler = DedupHandler::new_buggy();
    let mut buggy_cm = ConfusionMatrix::new();

    for (transcript, _) in &chunk_data {
        // Re-determine if duplicate based on handler state
        let normalized = normalize_for_comparison(transcript);
        let is_duplicate = seen_texts.contains(&normalized);

        let was_blocked = !buggy_handler.process(transcript);
        buggy_cm.record(was_blocked, is_duplicate);

        if !was_blocked {
            seen_texts.insert(normalized);
        }
    }

    // Reset for fixed evaluation
    seen_texts.clear();

    // Evaluate fixed logic
    let mut fixed_handler = DedupHandler::new_fixed();
    let mut fixed_cm = ConfusionMatrix::new();

    for (transcript, _) in &chunk_data {
        let normalized = normalize_for_comparison(transcript);
        let is_duplicate = seen_texts.contains(&normalized);

        let was_blocked = !fixed_handler.process(transcript);
        fixed_cm.record(was_blocked, is_duplicate);

        if !was_blocked {
            seen_texts.insert(normalized);
        }
    }

    BenchmarkResult {
        scenario_name: name.to_string(),
        description: description.to_string(),
        fixed_metrics: DedupMetrics::from_confusion_matrix(fixed_cm),
        buggy_metrics: DedupMetrics::from_confusion_matrix(buggy_cm),
        total_inputs: chunk_data.len(),
        expected_unique: seen_texts.len(),
        duration_secs: session.total_duration(),
        num_devices: session.devices.len(),
        num_speakers: session.speakers.len(),
    }
}

/// Normalize text for comparison (lowercase, remove punctuation)
fn normalize_for_comparison(text: &str) -> String {
    text.to_lowercase()
        .chars()
        .filter(|c| c.is_alphanumeric() || c.is_whitespace())
        .collect::<String>()
        .split_whitespace()
        .collect::<Vec<_>>()
        .join(" ")
}

// =============================================================================
// SCENARIO: EXACT DUPLICATES (CROSS-DEVICE)
// =============================================================================

/// Tests exact duplicate detection from cross-device capture
/// Scenario: Speaker plays audio, microphone picks up the same audio
#[test]
fn scenario_exact_duplicates_cross_device() {
    println!("\n");

    let segments = &MEETING_SEGMENTS[..10];
    let speaker = SimSpeaker::new(0, "Speaker");

    let mut session = RecordingSession::new(42)
        .add_device(SimDevice::speaker("Speaker Output"))
        .add_device(SimDevice::microphone("Microphone Input"))
        .add_speaker(speaker.clone())
        .with_noise(TranscriptionNoise::perfect()); // No variation - exact duplicates

    let mut current_time = 0.0;
    for segment in segments {
        session = session.add_segment(SpeechSegment::speech(
            segment,
            speaker.clone(),
            current_time,
        ));
        current_time += 5.0; // 5 second gap between segments
    }

    let result = run_scenario(
        "Exact Duplicates (Cross-Device)",
        "Speaker output + microphone capture with identical transcriptions",
        session,
    );

    println!("{}", result);

    // Fixed logic should have high recall for exact duplicates
    assert!(
        result.fixed_metrics.recall > 0.8,
        "Fixed logic should detect most exact duplicates, got {:.2}%",
        result.fixed_metrics.recall * 100.0
    );

    // Buggy logic should have poor recall
    assert!(
        result.buggy_metrics.recall < 0.5,
        "Buggy logic should miss most duplicates, got {:.2}%",
        result.buggy_metrics.recall * 100.0
    );
}

// =============================================================================
// SCENARIO: PARTIAL OVERLAPS (CHUNK BOUNDARIES)
// =============================================================================

/// Tests partial overlap detection at chunk boundaries
/// Scenario: Continuous speech split across 10-second chunks with 2-second overlap
#[test]
fn scenario_partial_overlaps_chunk_boundaries() {
    println!("\n");

    // Simulate continuous speech that spans multiple chunks
    let long_speech = "the quick brown fox jumps over the lazy dog and then \
        runs through the forest where it meets a friendly rabbit who \
        shows the fox the way to the magical garden where all the \
        animals live in harmony and peace together forever and ever";

    let speaker = SimSpeaker::new(0, "Narrator");

    let mut session = RecordingSession::new(42)
        .add_device(SimDevice::speaker("Speaker"))
        .add_speaker(speaker.clone())
        .with_noise(TranscriptionNoise::perfect());

    // Single long speech segment
    session = session.add_segment(SpeechSegment::speech(long_speech, speaker, 0.0));

    let result = run_scenario(
        "Partial Overlaps (Chunk Boundaries)",
        "Continuous speech split across chunks with 2-second overlap",
        session,
    );

    println!("{}", result);

    // Should handle partial overlaps correctly
    assert!(
        result.fixed_metrics.f1_score > 0.5,
        "Fixed logic should handle partial overlaps, got F1 {:.2}%",
        result.fixed_metrics.f1_score * 100.0
    );
}

// =============================================================================
// SCENARIO: NOISY TRANSCRIPTIONS
// =============================================================================

/// Tests deduplication with transcription variations
/// Scenario: Same speech with Whisper transcription noise (capitalization, punctuation)
#[test]
fn scenario_noisy_transcriptions() {
    println!("\n");

    let segments = &MEETING_SEGMENTS[..8];
    let speaker = SimSpeaker::new(0, "Speaker");

    let mut session = RecordingSession::new(42)
        .add_device(SimDevice::speaker("Speaker").with_quality(1.0))
        .add_device(SimDevice::microphone("Microphone").with_quality(0.9))
        .add_speaker(speaker.clone())
        .with_noise(TranscriptionNoise::new(42)); // Add transcription noise

    let mut current_time = 0.0;
    for segment in segments {
        session = session.add_segment(SpeechSegment::speech(
            segment,
            speaker.clone(),
            current_time,
        ));
        current_time += 5.0;
    }

    let result = run_scenario(
        "Noisy Transcriptions",
        "Cross-device capture with transcription variations (punctuation, capitalization)",
        session,
    );

    println!("{}", result);

    // Note: Current dedup logic doesn't handle transcription noise well
    // This test documents the limitation
    println!(
        "Note: Noisy transcription dedup is a known limitation. Current F1: {:.2}%",
        result.fixed_metrics.f1_score * 100.0
    );
}

// =============================================================================
// SCENARIO: MULTIPLE SPEAKERS
// =============================================================================

/// Tests deduplication with multiple concurrent speakers
/// Scenario: 6 speakers in a meeting, some speaking simultaneously
#[test]
fn scenario_multiple_speakers() {
    println!("\n");

    let session = generate_meeting_scenario(
        5.0, // 5 minutes
        6,   // 6 speakers
        0.7, // 70% speech density
        42,
    );

    let result = run_scenario(
        "Multiple Speakers (6)",
        "Meeting with 6 speakers, 70% speech density, cross-device capture",
        session,
    );

    println!("{}", result);

    // Should still improve over buggy logic
    assert!(
        result.f1_improvement() > 0.0,
        "Fixed logic should improve over buggy logic"
    );
}

// =============================================================================
// SCENARIO: INTERMITTENT SPEECH
// =============================================================================

/// Tests deduplication with intermittent speech and long silences
/// Scenario: Bursts of speech separated by long silent periods
#[test]
fn scenario_intermittent_speech() {
    println!("\n");

    let session = generate_intermittent_scenario(
        10.0, // 10 minutes total
        8,    // 8 speech bursts
        15.0, // Average 15 seconds per burst
        42,
    );

    let result = run_scenario(
        "Intermittent Speech",
        "Speech bursts (15s avg) separated by long silences, simulating sporadic conversation",
        session,
    );

    println!("{}", result);

    // Intermittent speech should work well since there's natural separation
    assert!(
        result.fixed_metrics.accuracy > 0.7,
        "Fixed logic should handle intermittent speech well, got accuracy {:.2}%",
        result.fixed_metrics.accuracy * 100.0
    );
}

// =============================================================================
// SCENARIO: 24/7 CONTINUOUS RECORDING
// =============================================================================

/// Tests deduplication under 24/7 recording conditions
/// Scenario: Varying activity levels throughout the day
#[test]
fn scenario_24h_continuous_recording() {
    println!("\n");

    let session = generate_24h_scenario(42);

    let result = run_scenario(
        "24/7 Continuous Recording",
        "1-hour sample of 24/7 recording with varying activity levels by time of day",
        session,
    );

    println!("{}", result);

    // Should maintain good performance over long periods
    assert!(
        result.fixed_metrics.f1_score > 0.3,
        "Fixed logic should work for continuous recording, got F1 {:.2}%",
        result.fixed_metrics.f1_score * 100.0
    );
}

// =============================================================================
// SCENARIO: EDGE CASES
// =============================================================================

/// Tests deduplication with edge case transcripts
/// Scenario: Single words, filler words, very long segments, repeated words
#[test]
fn scenario_edge_cases() {
    println!("\n");

    let speaker = SimSpeaker::new(0, "Speaker");

    let mut session = RecordingSession::new(42)
        .add_device(SimDevice::speaker("Speaker"))
        .add_device(SimDevice::microphone("Microphone"))
        .add_speaker(speaker.clone())
        .with_noise(TranscriptionNoise::perfect());

    let mut current_time = 0.0;
    for segment in EDGE_CASE_SEGMENTS {
        session = session.add_segment(SpeechSegment::speech(
            segment,
            speaker.clone(),
            current_time,
        ));
        current_time += 3.0;
    }

    let result = run_scenario(
        "Edge Cases",
        "Single words, filler words, very long segments, repeated phrases",
        session,
    );

    println!("{}", result);

    // Document edge case behavior
    println!(
        "Edge case handling - Fixed F1: {:.2}%, Buggy F1: {:.2}%",
        result.fixed_metrics.f1_score * 100.0,
        result.buggy_metrics.f1_score * 100.0
    );
}

// =============================================================================
// SCENARIO: HIGH FREQUENCY SWITCHING
// =============================================================================

/// Tests deduplication with rapid device switching
/// Scenario: Very fast alternation between input and output devices
#[test]
fn scenario_high_frequency_device_switching() {
    println!("\n");

    let segments = &MEETING_SEGMENTS[..15];
    let speaker = SimSpeaker::new(0, "Speaker");

    // Create devices with different latencies to simulate realistic interleaving
    let mut session = RecordingSession::new(42)
        .add_device(SimDevice::speaker("Speaker").with_latency(10))
        .add_device(SimDevice::microphone("Mic 1").with_latency(30))
        .add_device(SimDevice::microphone("Mic 2").with_latency(50))
        .add_speaker(speaker.clone())
        .with_noise(TranscriptionNoise::perfect());

    let mut current_time = 0.0;
    for segment in segments {
        session = session.add_segment(SpeechSegment::speech(
            segment,
            speaker.clone(),
            current_time,
        ));
        current_time += 2.0; // Very short gaps
    }

    let result = run_scenario(
        "High Frequency Device Switching",
        "3 devices (1 speaker + 2 mics) with rapid alternation, 2-second gaps",
        session,
    );

    println!("{}", result);

    // Should handle rapid switching better than buggy logic
    assert!(
        result.f1_improvement() >= 0.0,
        "Fixed logic should not regress on rapid switching"
    );
}

// =============================================================================
// SCENARIO: OVERLAPPING SPEAKERS
// =============================================================================

/// Tests deduplication when multiple speakers talk simultaneously
/// Scenario: Overlapping speech from different speakers
#[test]
fn scenario_overlapping_speakers() {
    println!("\n");

    let speaker1 = SimSpeaker::new(0, "Speaker A");
    let speaker2 = SimSpeaker::new(1, "Speaker B");

    let mut session = RecordingSession::new(42)
        .add_device(SimDevice::speaker("Speaker"))
        .add_device(SimDevice::microphone("Microphone"))
        .add_speaker(speaker1.clone())
        .add_speaker(speaker2.clone())
        .with_noise(TranscriptionNoise::perfect());

    // Create overlapping speech segments
    session = session
        .add_segment(SpeechSegment::speech(
            "hello everyone welcome to the meeting",
            speaker1.clone(),
            0.0,
        ))
        .add_segment(SpeechSegment::speech(
            "yes thank you for having us here",
            speaker2.clone(),
            1.5,
        )) // Overlaps
        .add_segment(SpeechSegment::speech(
            "lets start with the agenda",
            speaker1.clone(),
            4.0,
        ))
        .add_segment(SpeechSegment::speech(
            "sounds good to me",
            speaker2.clone(),
            4.5,
        )) // Overlaps
        .add_segment(SpeechSegment::speech(
            "first item is the project update",
            speaker1.clone(),
            7.0,
        ))
        .add_segment(SpeechSegment::speech(
            "i have some updates to share",
            speaker2.clone(),
            8.0,
        )); // Overlaps

    let result = run_scenario(
        "Overlapping Speakers",
        "2 speakers with overlapping speech (interruptions, simultaneous talking)",
        session,
    );

    println!("{}", result);
}

// =============================================================================
// AGGREGATE BENCHMARK
// =============================================================================

/// Run all scenarios and produce aggregate report
#[test]
fn benchmark_all_scenarios() {
    println!("\n");

    let mut report = AggregateReport::new();

    // Scenario 1: Exact duplicates
    {
        let segments = &MEETING_SEGMENTS[..10];
        let speaker = SimSpeaker::new(0, "Speaker");
        let mut session = RecordingSession::new(42)
            .add_device(SimDevice::speaker("Speaker"))
            .add_device(SimDevice::microphone("Microphone"))
            .add_speaker(speaker.clone())
            .with_noise(TranscriptionNoise::perfect());

        let mut current_time = 0.0;
        for segment in segments {
            session = session.add_segment(SpeechSegment::speech(
                segment,
                speaker.clone(),
                current_time,
            ));
            current_time += 5.0;
        }

        report.add(run_scenario(
            "Exact Duplicates",
            "Cross-device capture",
            session,
        ));
    }

    // Scenario 2: Noisy transcriptions
    {
        let segments = &MEETING_SEGMENTS[..8];
        let speaker = SimSpeaker::new(0, "Speaker");
        let mut session = RecordingSession::new(43)
            .add_device(SimDevice::speaker("Speaker"))
            .add_device(SimDevice::microphone("Microphone").with_quality(0.9))
            .add_speaker(speaker.clone())
            .with_noise(TranscriptionNoise::new(43));

        let mut current_time = 0.0;
        for segment in segments {
            session = session.add_segment(SpeechSegment::speech(
                segment,
                speaker.clone(),
                current_time,
            ));
            current_time += 5.0;
        }

        report.add(run_scenario(
            "Noisy Transcriptions",
            "With Whisper noise",
            session,
        ));
    }

    // Scenario 3: Multiple speakers
    {
        let session = generate_meeting_scenario(5.0, 6, 0.7, 44);
        report.add(run_scenario(
            "6-Speaker Meeting",
            "High activity meeting",
            session,
        ));
    }

    // Scenario 4: Intermittent speech
    {
        let session = generate_intermittent_scenario(10.0, 8, 15.0, 45);
        report.add(run_scenario(
            "Intermittent Speech",
            "Speech bursts with silences",
            session,
        ));
    }

    // Scenario 5: 24/7 recording
    {
        let session = generate_24h_scenario(46);
        report.add(run_scenario(
            "24/7 Recording",
            "Continuous capture",
            session,
        ));
    }

    // Scenario 6: Edge cases
    {
        let speaker = SimSpeaker::new(0, "Speaker");
        let mut session = RecordingSession::new(47)
            .add_device(SimDevice::speaker("Speaker"))
            .add_device(SimDevice::microphone("Microphone"))
            .add_speaker(speaker.clone())
            .with_noise(TranscriptionNoise::perfect());

        let mut current_time = 0.0;
        for segment in EDGE_CASE_SEGMENTS {
            session = session.add_segment(SpeechSegment::speech(
                segment,
                speaker.clone(),
                current_time,
            ));
            current_time += 3.0;
        }

        report.add(run_scenario("Edge Cases", "Unusual transcripts", session));
    }

    println!("{}", report);

    // Overall assertions
    assert!(
        report.avg_f1_improvement() > 0.0,
        "Fixed logic should improve F1 on average"
    );

    println!(
        "\nOVERALL: Fixed logic improves F1 by {:.2}% on average",
        report.avg_f1_improvement() * 100.0
    );
}
