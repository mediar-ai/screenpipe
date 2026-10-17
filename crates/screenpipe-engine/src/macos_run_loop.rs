// screenpipe — AI that knows everything you've seen, said, or heard
// https://screenpipe.com
//! Main-thread AppKit lifecycle for standalone capture hosts. Tauri owns its own.
use cidre::{arc, cf, objc};
use std::panic::{catch_unwind, resume_unwind, AssertUnwindSafe};
use std::sync::mpsc;

#[link(name = "AppKit", kind = "framework")]
extern "C" {
    fn NSApplicationLoad() -> bool;
}

// CoreFoundation explicitly permits signaling a run-loop source from another
// thread. Its context contains no data and the owned reference keeps it alive.
struct CompletionSource(arc::R<cf::RunLoopSrc>);
unsafe impl Send for CompletionSource {}
impl CompletionSource {
    fn signal(&self) {
        self.0.signal();
        cf::RunLoop::main().wakeup();
    }
}
extern "C-unwind" fn completion_ready(_: *mut std::ffi::c_void) {}

/// Run a standalone capture command while servicing display notifications.
/// Call only from the process main thread, before starting native capture.
/// The worker owns its runtime so shutdown completes while AppKit is still live.
pub fn run<T: Send + 'static>(work: impl FnOnce() -> T + Send + 'static) -> anyhow::Result<T> {
    anyhow::ensure!(
        unsafe { libc::pthread_main_np() } != 0,
        "AppKit requires the main thread"
    );
    anyhow::ensure!(
        objc::ar_pool(|| unsafe { NSApplicationLoad() }),
        "AppKit initialization failed"
    );
    let mut context = cf::RunLoopSrcCtx::<std::ffi::c_void> {
        perform: Some(completion_ready),
        ..Default::default()
    };
    let source = cf::RunLoopSrc::with_ctx(0, &mut context)
        .ok_or_else(|| anyhow::anyhow!("could not create command completion source"))?;
    let mode = cf::RunLoopMode::default();
    let main_loop = cf::RunLoop::main();
    main_loop.add_src(&source, mode);
    let completion = CompletionSource(source.clone());
    let (send, receive) = mpsc::sync_channel(1);
    let worker = std::thread::Builder::new()
        .name("capture-command".into())
        .spawn(move || {
            let result = catch_unwind(AssertUnwindSafe(work));
            let _ = send.send(result);
            completion.signal();
        });
    let result = match worker {
        Ok(worker) => {
            let result = loop {
                match receive.try_recv() {
                    Ok(result) => break Ok(result),
                    Err(mpsc::TryRecvError::Disconnected) => {
                        break Err(anyhow::anyhow!("capture worker disconnected"))
                    }
                    Err(mpsc::TryRecvError::Empty) => {}
                }
                // The registered completion source prevents an empty-loop spin.
                // A signaled source also survives completion before this call.
                objc::ar_pool(|| {
                    cf::RunLoop::run_in_mode(mode, 3600.0, true);
                });
            };
            let _ = worker.join();
            result
        }
        Err(error) => Err(error.into()),
    };
    main_loop.remove_src(&source, mode);
    source.invalidate();
    match result? {
        Ok(value) => Ok(value),
        Err(panic) => resume_unwind(panic),
    }
}
