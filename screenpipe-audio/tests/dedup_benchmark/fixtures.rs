//! Test fixtures with realistic transcription samples
//!
//! Contains representative samples of different speech patterns,
//! meeting scenarios, and edge cases for comprehensive testing.

// =============================================================================
// MEETING TRANSCRIPTS
// =============================================================================

/// Typical business meeting segments
pub const MEETING_SEGMENTS: &[&str] = &[
    "good morning everyone thank you for joining todays meeting",
    "lets start with a quick review of last weeks action items",
    "the development team completed the authentication module",
    "we are still waiting on the design mockups from the ui team",
    "any updates on the customer feedback survey results",
    "yes we received over five hundred responses so far",
    "the main concerns are around performance and usability",
    "we should prioritize these issues in the next sprint",
    "agreed lets create tickets for the top ten issues",
    "moving on to the quarterly roadmap discussion",
    "we have three major features planned for this quarter",
    "the first is the new dashboard with analytics",
    "second is the improved search functionality",
    "and third is the mobile app performance optimization",
    "any questions or concerns about the timeline",
    "i think we need more resources for the mobile work",
    "lets discuss that in the resource planning section",
    "before we move on are there any blockers to discuss",
    "the third party api integration is causing some issues",
    "we should schedule a technical deep dive for that",
    "alright lets take a five minute break and reconvene",
    "welcome back lets continue with the budget review",
    "the current spend is within the projected estimates",
    "we have some room for additional contractor support",
    "that could help with the mobile optimization work",
    "sounds good lets proceed with the hiring process",
    "any other business before we wrap up",
    "just a reminder about the company all hands next week",
    "thank you everyone for your time today",
    "see you all at the next meeting",
];

/// Technical discussion segments
pub const TECHNICAL_SEGMENTS: &[&str] = &[
    "the api endpoint is returning a four hundred error",
    "we need to add proper error handling for edge cases",
    "the database query is taking too long to execute",
    "lets add an index on the user id column",
    "the memory usage is spiking during peak hours",
    "we should implement connection pooling",
    "the test coverage is currently at eighty percent",
    "we need to add more integration tests",
    "the deployment pipeline failed on the staging environment",
    "it looks like a configuration issue with the secrets",
    "the latency is higher than our sla requirements",
    "we should consider adding a caching layer",
    "the websocket connection keeps dropping",
    "we need to implement proper reconnection logic",
    "the log files are growing too quickly",
    "lets set up log rotation and archiving",
];

/// Casual conversation segments
pub const CASUAL_SEGMENTS: &[&str] = &[
    "hey how was your weekend",
    "it was great we went hiking in the mountains",
    "that sounds amazing the weather was perfect for it",
    "yeah we got some beautiful photos",
    "have you seen the new coffee machine in the break room",
    "no i havent tried it yet is it good",
    "its actually really impressive makes great espresso",
    "nice ill have to check it out later",
    "are you going to the team lunch tomorrow",
    "yes im looking forward to it",
    "i heard they picked that new italian place",
    "oh perfect i love their pasta",
];

// =============================================================================
// SPEAKER PROFILES
// =============================================================================

/// Speaker profile for realistic multi-speaker simulation
pub struct SpeakerProfile {
    pub name: &'static str,
    pub typical_phrases: &'static [&'static str],
    pub speaking_style: SpeakingStyle,
}

#[derive(Debug, Clone, Copy)]
pub enum SpeakingStyle {
    Formal,    // Business-like, complete sentences
    Casual,    // Relaxed, informal
    Technical, // Precise, jargon-heavy
    Verbose,   // Long explanations
    Concise,   // Short, to the point
}

pub const SPEAKER_PROFILES: &[SpeakerProfile] = &[
    SpeakerProfile {
        name: "Manager",
        typical_phrases: &[
            "lets move forward with this plan",
            "what are the key blockers here",
            "i need an update by end of week",
            "can we align on the priorities",
            "lets schedule a follow up meeting",
        ],
        speaking_style: SpeakingStyle::Formal,
    },
    SpeakerProfile {
        name: "Developer",
        typical_phrases: &[
            "the code review is pending approval",
            "i pushed the fix to the feature branch",
            "we need to refactor this module",
            "the unit tests are passing now",
            "let me check the logs for that error",
        ],
        speaking_style: SpeakingStyle::Technical,
    },
    SpeakerProfile {
        name: "Designer",
        typical_phrases: &[
            "the mockups are ready for review",
            "i think we need more whitespace here",
            "the color contrast might be an issue",
            "lets do some user testing first",
            "the interaction feels a bit clunky",
        ],
        speaking_style: SpeakingStyle::Casual,
    },
    SpeakerProfile {
        name: "Product Owner",
        typical_phrases: &[
            "the customer feedback shows a clear pattern",
            "we should prioritize this feature higher",
            "the analytics data supports this decision",
            "lets validate this with user research",
            "the market opportunity is significant",
        ],
        speaking_style: SpeakingStyle::Verbose,
    },
    SpeakerProfile {
        name: "QA Engineer",
        typical_phrases: &[
            "i found a regression in the latest build",
            "the test suite passed on all browsers",
            "we need to add more edge case coverage",
            "the performance benchmarks look good",
            "i can reproduce the issue consistently",
        ],
        speaking_style: SpeakingStyle::Technical,
    },
    SpeakerProfile {
        name: "Intern",
        typical_phrases: &[
            "im still learning how this works",
            "could you explain that again please",
            "i think i understand now thanks",
            "let me try implementing that",
            "is this the right approach",
        ],
        speaking_style: SpeakingStyle::Casual,
    },
];

// =============================================================================
// EDGE CASES
// =============================================================================

/// Edge case transcripts that might cause issues
pub const EDGE_CASE_SEGMENTS: &[&str] = &[
    // Single word
    "okay",
    "yes",
    "no",
    "sure",
    "thanks",
    // Repeated words
    "wait wait wait let me think",
    "no no no thats not right",
    "yes yes exactly what i meant",
    // Filler words
    "um so like i was thinking that um maybe we could",
    "you know what i mean like basically",
    "uh well actually i think uh",
    // Numbers and dates
    "the meeting is at three thirty pm",
    "we have a budget of fifty thousand dollars",
    "the deadline is january fifteenth twenty twenty five",
    // Technical jargon
    "the cpu usage is at ninety percent",
    "we need to scale the kubernetes cluster",
    "the oauth two flow is failing",
    // Similar sounding phrases
    "their team is responsible",
    "there team meeting is at four",
    "theyre going to present the results",
    // Very long segment
    "so basically what happened was that we were trying to deploy the new version \
     of the application but then we ran into some issues with the database \
     migration and had to roll back the changes and then we spent the whole \
     afternoon debugging the problem and eventually found that it was a \
     configuration issue with the connection string",
    // Very short with context
    "got it",
    "makes sense",
    "understood",
];

/// Overlapping phrase patterns (simulate chunk boundaries)
pub const OVERLAP_PATTERNS: &[(&str, &str)] = &[
    // Standard overlap at boundary
    (
        "the quick brown fox jumps over",
        "jumps over the lazy dog sleeping in the sun",
    ),
    // Minimal overlap (1-2 words)
    ("hello world", "world peace"),
    ("thank you", "you are welcome"),
    // Large overlap (most of phrase)
    (
        "this is a very important meeting",
        "a very important meeting that we need to attend",
    ),
    // Exact duplicate
    ("hello world this is a test", "hello world this is a test"),
    // Subset overlap
    ("the meeting starts at three", "at three oclock sharp"),
    // No overlap
    (
        "the weather is nice today",
        "lets go for a walk in the park",
    ),
];

// =============================================================================
// SCENARIO GENERATORS
// =============================================================================

use crate::simulation::{RecordingSession, SimDevice, SimSpeaker, SpeechSegment};

/// Generate a meeting scenario with configurable parameters
pub fn generate_meeting_scenario(
    duration_minutes: f64,
    num_speakers: usize,
    speech_density: f64, // 0.0-1.0, percentage of time with speech
    seed: u64,
) -> RecordingSession {
    use rand::{rngs::StdRng, seq::IndexedRandom, Rng, SeedableRng};

    let mut rng = StdRng::seed_from_u64(seed);
    let duration_secs = duration_minutes * 60.0;

    // Create speakers
    let speakers: Vec<SimSpeaker> = (0..num_speakers)
        .map(|i| {
            let profile = &SPEAKER_PROFILES[i % SPEAKER_PROFILES.len()];
            SimSpeaker::new(i, profile.name)
        })
        .collect();

    // Create devices (1 output + 1 input for cross-device capture)
    let mut session = RecordingSession::new(seed)
        .add_device(SimDevice::speaker("MacBook Pro Speakers"))
        .add_device(SimDevice::microphone("MacBook Pro Microphone"));

    for speaker in &speakers {
        session = session.add_speaker(speaker.clone());
    }

    // Generate speech segments
    let mut current_time = 0.0;
    let all_segments: Vec<&str> = MEETING_SEGMENTS
        .iter()
        .chain(TECHNICAL_SEGMENTS.iter())
        .copied()
        .collect();

    while current_time < duration_secs {
        // Decide if this slot has speech (based on density)
        if rng.random::<f64>() < speech_density {
            // Pick a random speaker and segment
            let speaker = speakers.choose(&mut rng).unwrap().clone();
            let text = *all_segments.choose(&mut rng).unwrap();

            session = session.add_segment(SpeechSegment::speech(text, speaker, current_time));

            // Move forward by speech duration + small pause
            let speech_duration = session.segments.last().map(|s| s.duration()).unwrap_or(2.0);
            current_time += speech_duration + rng.random_range(0.5..2.0);
        } else {
            // Silence gap
            let silence_duration = rng.random_range(1.0..5.0);
            session = session.add_segment(SpeechSegment::silence(current_time, silence_duration));
            current_time += silence_duration;
        }
    }

    session
}

/// Generate an intermittent speech scenario (bursts with long silences)
pub fn generate_intermittent_scenario(
    total_duration_minutes: f64,
    burst_count: usize,
    avg_burst_duration_secs: f64,
    seed: u64,
) -> RecordingSession {
    use rand::{rngs::StdRng, seq::IndexedRandom, Rng, SeedableRng};

    let mut rng = StdRng::seed_from_u64(seed);
    let total_secs = total_duration_minutes * 60.0;
    let silence_between =
        (total_secs - (burst_count as f64 * avg_burst_duration_secs)) / burst_count as f64;

    let speaker = SimSpeaker::new(0, "Speaker");
    let mut session = RecordingSession::new(seed)
        .add_device(SimDevice::speaker("Speaker"))
        .add_device(SimDevice::microphone("Microphone"))
        .add_speaker(speaker.clone());

    let mut current_time = 0.0;

    for _ in 0..burst_count {
        // Silence before burst
        let silence = rng.random_range(silence_between * 0.5..silence_between * 1.5);
        session = session.add_segment(SpeechSegment::silence(current_time, silence));
        current_time += silence;

        // Speech burst (multiple segments)
        let segments_in_burst = rng.random_range(2..6);
        for _ in 0..segments_in_burst {
            let text = *CASUAL_SEGMENTS.choose(&mut rng).unwrap();
            session =
                session.add_segment(SpeechSegment::speech(text, speaker.clone(), current_time));
            let duration = session.segments.last().map(|s| s.duration()).unwrap_or(2.0);
            current_time += duration + rng.random_range(0.2..0.8);
        }
    }

    session
}

/// Generate a continuous 24/7 recording scenario with varying activity
pub fn generate_24h_scenario(seed: u64) -> RecordingSession {
    use rand::{rngs::StdRng, seq::IndexedRandom, Rng, SeedableRng};

    let mut rng = StdRng::seed_from_u64(seed);

    // 24 hours = 86400 seconds, but we'll sample representative periods
    // to keep test runtime reasonable
    let sample_duration_secs = 3600.0; // 1 hour sample

    let speakers: Vec<SimSpeaker> = vec![
        SimSpeaker::new(0, "User"),
        SimSpeaker::new(1, "Colleague"),
        SimSpeaker::new(2, "Visitor"),
    ];

    let mut session = RecordingSession::new(seed)
        .add_device(SimDevice::speaker("System Audio"))
        .add_device(SimDevice::microphone("Built-in Mic"));

    for speaker in &speakers {
        session = session.add_speaker(speaker.clone());
    }

    let all_segments: Vec<&str> = MEETING_SEGMENTS
        .iter()
        .chain(CASUAL_SEGMENTS.iter())
        .chain(EDGE_CASE_SEGMENTS.iter())
        .copied()
        .collect();

    let mut current_time = 0.0;

    while current_time < sample_duration_secs {
        // Simulate activity patterns
        let hour_of_day = (current_time / 3600.0) % 24.0;

        // Activity probability varies by hour
        let activity_prob = match hour_of_day as usize {
            0..=5 => 0.05,  // Night: very low activity
            6..=8 => 0.3,   // Morning: moderate
            9..=11 => 0.7,  // Work hours: high
            12..=13 => 0.5, // Lunch: moderate
            14..=17 => 0.7, // Afternoon: high
            18..=21 => 0.4, // Evening: moderate
            _ => 0.1,       // Late night: low
        };

        if rng.random::<f64>() < activity_prob {
            let speaker = speakers.choose(&mut rng).unwrap().clone();
            let text = *all_segments.choose(&mut rng).unwrap();
            session = session.add_segment(SpeechSegment::speech(text, speaker, current_time));
            let duration = session.segments.last().map(|s| s.duration()).unwrap_or(2.0);
            current_time += duration + rng.random_range(0.5..3.0);
        } else {
            let silence = rng.random_range(5.0..30.0);
            current_time += silence;
        }
    }

    session
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_meeting_scenario_generation() {
        let session = generate_meeting_scenario(5.0, 3, 0.6, 42);
        assert!(session.total_duration() > 0.0);
        assert!(!session.segments.is_empty());
    }

    #[test]
    fn test_intermittent_scenario_generation() {
        let session = generate_intermittent_scenario(10.0, 5, 10.0, 42);
        assert!(session.total_duration() > 0.0);
    }

    #[test]
    fn test_24h_scenario_generation() {
        let session = generate_24h_scenario(42);
        assert!(session.total_duration() > 0.0);
    }
}
