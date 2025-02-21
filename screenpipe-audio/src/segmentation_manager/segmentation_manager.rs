use crate::speaker::segment::SpeechSegment;

pub struct SegmentationManager {
    segments: Vec<SpeechSegment>,
}

impl SegmentationManager {
    pub fn new() -> Self {
        SegmentationManager {
            segments: Vec::new(),
        }
    }
}
