use std::thread;

use image::GenericImageView;
use screenpipe_vision::{continuous_capture, ControlMessage};
use std::time::Duration;

fn main() {
    use std::sync::mpsc::channel;

    let (control_tx, control_rx) = channel();
    let (result_tx, result_rx) = channel();

    let capture_thread = thread::spawn(move || {
        continuous_capture(control_rx, result_tx, Duration::from_secs(1));
    });

    // Example: Process results for 10 seconds, then pause for 5 seconds, then stop
    let start_time = std::time::Instant::now();
    loop {
        if let Ok(result) = result_rx.try_recv() {
            println!("Captured image size: {:?}", result.image.dimensions());
            println!("OCR Text length: {}", result.text.len());
        }

        let elapsed = start_time.elapsed();
        if elapsed >= Duration::from_secs(10) && elapsed < Duration::from_secs(15) {
            control_tx.send(ControlMessage::Pause).unwrap();
        } else if elapsed >= Duration::from_secs(15) {
            control_tx.send(ControlMessage::Stop).unwrap();
            break;
        }

        thread::sleep(Duration::from_millis(100));
    }

    capture_thread.join().unwrap();
}
