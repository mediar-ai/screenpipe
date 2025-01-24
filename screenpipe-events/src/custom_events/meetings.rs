use crate::{send_event, subscribe_to_all_events};
use anyhow::Result;
use chrono::{DateTime, Utc};
use futures::StreamExt;
use serde::{Deserialize, Serialize};
use serde_json;
use std::collections::{HashMap, HashSet};
use std::time::{Duration, Instant};

const MEETING_APPS: &[&str] = &["zoom", "teams", "meet", "webex", "skype", "slack"];
const MEETING_KEYWORDS: &[&str] = &[
    "meeting",
    "call",
    "conference",
    "joining",
    "started",
    "waiting room",
    "lobby",
    "participant",
    "host",
];
const MEETING_END_PHRASES: &[&str] = &[
    "meeting ended",
    "call ended",
    "left the meeting",
    "host has ended",
    "meeting will end",
    "meeting has ended",
];

pub async fn poll_meetings_events() -> Result<()> {
    let mut subscription = subscribe_to_all_events();
    let mut meeting_in_progress = false;
    let mut recent_speakers = HashSet::new();
    let mut last_activity = Instant::now();
    let mut last_meeting_end: Option<Instant> = None;
    const MEETING_RESTART_TIMEOUT: Duration = Duration::from_secs(10);

    while let Some(event) = subscription.next().await {
        let name = event.name;
        let event = event.data;
        match name.as_str() {
            "ui_frame" => {
                let ui_frame: UIFrame = serde_json::from_value(event).unwrap();
                tracing::info!("ui_frame: {:?}", ui_frame.app);

                let is_meeting_app = MEETING_APPS
                    .iter()
                    .any(|app| ui_frame.app.to_lowercase().contains(app));

                let is_meeting_keyword = MEETING_KEYWORDS
                    .iter()
                    .any(|keyword| ui_frame.text_output.to_lowercase().contains(keyword));

                if is_meeting_app
                    && !meeting_in_progress
                    && !ui_frame.window.is_empty()
                    && is_meeting_keyword
                    && last_meeting_end.map_or(true, |t| t.elapsed() >= MEETING_RESTART_TIMEOUT)
                {
                    meeting_in_progress = true;
                    send_event(
                        "meeting_started",
                        MeetingEvent {
                            app: ui_frame.app.clone(),
                            timestamp: Utc::now(),
                        },
                    )?;
                }

                if (is_meeting_app && meeting_in_progress && ui_frame.window.is_empty())
                    || (MEETING_END_PHRASES
                        .iter()
                        .any(|phrase| ui_frame.text_output.to_lowercase().contains(phrase))
                        && meeting_in_progress)
                {
                    meeting_in_progress = false;
                    last_meeting_end = Some(Instant::now());
                    send_event(
                        "meeting_ended",
                        MeetingEvent {
                            app: ui_frame.app.clone(),
                            timestamp: Utc::now(),
                        },
                    )?;
                }
            }
            "window_ocr" => {
                let window_ocr: WindowOcr = serde_json::from_value(event).unwrap();
                tracing::info!("window_ocr: {:?}", window_ocr.app_name);

                // Method 1: Meeting App Detection
                let is_meeting_app = MEETING_APPS
                    .iter()
                    .any(|app| window_ocr.app_name.to_lowercase().contains(app));

                // Method 2: Window Title Analysis
                let has_meeting_keywords = MEETING_KEYWORDS
                    .iter()
                    .any(|keyword| window_ocr.window_name.to_lowercase().contains(keyword));

                // Method 3: UI Element Analysis
                let has_meeting_ui = window_ocr.text_json.iter().any(|elem| {
                    elem.values().any(|text| {
                        text.contains("Mute")
                            || text.contains("Camera")
                            || text.contains("Share Screen")
                            || text.contains("Participants")
                            || text.contains("Recording")
                    })
                });

                if (is_meeting_app && (has_meeting_keywords || has_meeting_ui))
                    && !meeting_in_progress
                    && last_meeting_end.map_or(true, |t| t.elapsed() >= MEETING_RESTART_TIMEOUT)
                {
                    meeting_in_progress = true;
                    send_event(
                        "meeting_started",
                        MeetingEvent {
                            app: window_ocr.app_name.clone(),
                            timestamp: Utc::now(),
                        },
                    )?;
                }

                // Check for meeting end
                let has_end_phrases = MEETING_END_PHRASES
                    .iter()
                    .any(|phrase| window_ocr.text.to_lowercase().contains(phrase));

                if has_end_phrases && meeting_in_progress {
                    meeting_in_progress = false;
                    last_meeting_end = Some(Instant::now());
                    send_event(
                        "meeting_ended",
                        MeetingEvent {
                            app: window_ocr.app_name.clone(),
                            timestamp: Utc::now(),
                        },
                    )?;
                }
            }

            "realtime_transcription" => {
                let transcript: RealtimeTranscriptionEvent = serde_json::from_value(event).unwrap();
                tracing::info!("realtime_transcription: {:?}", transcript.transcription);
                // Method 4: Multiple Speaker Detection
                if transcript.is_final {
                    recent_speakers.insert(transcript.device.clone());
                    last_activity = Instant::now();

                    if recent_speakers.len() >= 2
                        && !meeting_in_progress
                        && last_meeting_end.map_or(true, |t| t.elapsed() >= MEETING_RESTART_TIMEOUT)
                    {
                        meeting_in_progress = true;
                        send_event(
                            "meeting_started",
                            MeetingEvent {
                                app: "Unknown (detected via audio)".to_string(),
                                timestamp: Utc::now(),
                            },
                        )?;
                    }
                }

                // Method 5: Meeting Phrase Detection
                let lower_transcript = transcript.transcription.to_lowercase();
                if MEETING_KEYWORDS
                    .iter()
                    .any(|k| lower_transcript.contains(k))
                {
                    last_activity = Instant::now();
                }

                // Clean up old speakers after inactivity
                if last_activity.elapsed() > Duration::from_secs(300) {
                    // 5 minutes
                    recent_speakers.clear();
                }

                // Check for meeting end phrases in transcription
                if MEETING_END_PHRASES
                    .iter()
                    .any(|phrase| lower_transcript.contains(phrase))
                    && meeting_in_progress
                {
                    meeting_in_progress = false;
                    last_meeting_end = Some(Instant::now());
                    send_event(
                        "meeting_ended",
                        MeetingEvent {
                            app: "Unknown (detected via audio)".to_string(),
                            timestamp: Utc::now(),
                        },
                    )?;
                }
            }
            _ => {}
        }
    }
    Ok(())
}

#[derive(Debug, Serialize, Deserialize)]
struct MeetingEvent {
    app: String,
    timestamp: DateTime<Utc>,
}

#[derive(Debug, Serialize, Deserialize)]
struct WindowOcr {
    pub window_name: String,
    pub app_name: String,
    pub text: String,
    pub text_json: Vec<HashMap<String, String>>, // Change this line
    pub focused: bool,
    pub confidence: f64,
    pub timestamp: DateTime<Utc>,
}

#[derive(Debug, Serialize, Deserialize)]
struct UIFrame {
    pub window: String,
    pub app: String,
    pub text_output: String,
    pub initial_traversal_at: String,
}

#[derive(Debug, Serialize, Deserialize)]
struct RealtimeTranscriptionEvent {
    pub timestamp: DateTime<Utc>,
    pub device: String,
    pub transcription: String,
    pub is_final: bool,
    pub is_input: bool,
}
