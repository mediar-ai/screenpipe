// screenpipe — AI that knows everything you've seen, said, or heard
// https://screenpipe.com
#[cfg(test)]
mod eval_audio_drop {
    use super::*;
    fn synthetic() -> AudioStream {
        let device = Arc::new(AudioDevice::new("synthetic eval input".into(), super::super::device::DeviceType::Input));
        AudioStream::from_sender_for_test(device, 16_000, 1).0
    }
    #[test]
    fn drop_marks_disconnected_without_runtime() {
        let stream = synthetic();
        let flag = stream.is_disconnected.clone();
        assert!(!flag.load(Ordering::Relaxed));
        drop(stream);
        assert!(flag.load(Ordering::Relaxed), "drop must synchronously mark disconnected");
    }
    #[test]
    fn drop_delivers_stop_without_runtime() {
        let mut stream = synthetic();
        let (tx, rx) = mpsc::channel();
        stream.stream_control = tx;
        assert!(rx.try_recv().is_err());
        drop(stream);
        assert!(rx.try_recv().is_ok(), "stop must be delivered before drop returns");
    }
    #[test]
    fn closed_control_channel_does_not_prevent_disconnect() {
        let stream = synthetic();
        let flag = stream.is_disconnected.clone();
        assert!(std::panic::catch_unwind(std::panic::AssertUnwindSafe(|| drop(stream))).is_ok());
        assert!(flag.load(Ordering::Relaxed));
    }
    #[test]
    fn living_stream_remains_connected() {
        let stream = synthetic();
        assert!(!stream.is_disconnected());
        assert!(!stream.is_disconnected.load(Ordering::Relaxed));
    }
    #[tokio::test]
    async fn explicit_stop_preserves_synthetic_stream_cleanup() {
        let mut stream = synthetic();
        stream.stop().await.expect("explicit stop with closed synthetic receiver remains successful");
        assert!(stream.is_disconnected());
    }
}
