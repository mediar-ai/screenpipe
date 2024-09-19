use crate::vad_engine::VadEngine;
use anyhow::Result;
use chrono::{DateTime, Duration, Utc};
use screenpipe_core::EventPayload;
use serde::{Deserialize, Serialize};
use std::collections::VecDeque;
use std::sync::{Arc, Mutex};
use tracing::info;
use uuid::Uuid;

const SILENCE_THRESHOLD: f32 = 0.01;
const ENERGY_THRESHOLD: f32 = 0.1;
const SILENCE_DURATION: Duration = Duration::seconds(180); // 3 minutes
const MEETING_START_ENERGY_DURATION: Duration = Duration::seconds(30);
const BUFFER_DURATION: Duration = Duration::seconds(300); // 5 minutes

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct MeetingEvent {
    pub event_type: MeetingEventType,
    pub timestamp: DateTime<Utc>,
    pub meeting_id: String,
}

impl EventPayload for MeetingEvent {}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub enum MeetingEventType {
    Start,
    End,
}

pub struct MeetingDetector {
    vad: Arc<Mutex<Box<dyn VadEngine + Send>>>,
    activity_buffer: VecDeque<AudioActivityData>,
    silence_start: Option<DateTime<Utc>>,
    meeting_start: Option<DateTime<Utc>>,
    pub current_meeting_id: Option<String>,
}

struct AudioActivityData {
    energy: f32,
    is_speech: bool,
    timestamp: DateTime<Utc>,
}

impl MeetingDetector {
    pub async fn new(vad_engine: Arc<Mutex<Box<dyn VadEngine + Send>>>) -> Result<Self> {
        Ok(Self {
            vad: vad_engine,
            activity_buffer: VecDeque::new(),
            silence_start: None,
            meeting_start: None,
            current_meeting_id: None,
        })
    }

    pub fn process_audio(&mut self, audio_frame: &[f32]) -> Result<Option<MeetingEvent>> {
        let energy = self.calculate_energy(audio_frame);
        let is_speech = self.vad.lock().unwrap().is_voice_segment(audio_frame)?;
        let timestamp = Utc::now();

        let activity = AudioActivityData {
            energy,
            is_speech,
            timestamp,
        };

        self.activity_buffer.push_back(activity);

        // Remove old data from the buffer
        while self
            .activity_buffer
            .front()
            .map_or(false, |a| timestamp - a.timestamp > BUFFER_DURATION)
        {
            self.activity_buffer.pop_front();
        }

        if !is_speech && energy < SILENCE_THRESHOLD {
            if self.silence_start.is_none() {
                self.silence_start = Some(timestamp);
            }
        } else {
            self.silence_start = None;
        }

        if let Some(silence_start) = self.silence_start {
            if timestamp - silence_start >= SILENCE_DURATION {
                if let Some(meeting_id) = self.current_meeting_id.take() {
                    self.meeting_start = None;
                    info!("Meeting ended with id: {}", meeting_id);
                    return Ok(Some(MeetingEvent {
                        event_type: MeetingEventType::End,
                        timestamp,
                        meeting_id,
                    }));
                }
            }
        }

        if self.meeting_start.is_none() && self.detect_meeting_start() {
            let meeting_id = Uuid::new_v4().to_string();
            self.current_meeting_id = Some(meeting_id.clone());
            self.meeting_start = Some(timestamp);
            info!("Meeting started with id: {}", meeting_id);
            return Ok(Some(MeetingEvent {
                event_type: MeetingEventType::Start,
                timestamp,
                meeting_id,
            }));
        }

        Ok(None)
    }

    fn calculate_energy(&self, audio_frame: &[f32]) -> f32 {
        audio_frame
            .iter()
            .map(|&sample| sample * sample)
            .sum::<f32>()
            / audio_frame.len() as f32
    }

    fn detect_meeting_start(&self) -> bool {
        let high_energy_frames = self
            .activity_buffer
            .iter()
            .rev()
            .take_while(|a| Utc::now() - a.timestamp <= MEETING_START_ENERGY_DURATION)
            .filter(|a| a.energy > ENERGY_THRESHOLD && a.is_speech)
            .count();

        high_energy_frames >= MEETING_START_ENERGY_DURATION.num_seconds() as usize / 2
    }
}
