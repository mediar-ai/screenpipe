// screenpipe — AI that knows everything you've seen, said, or heard
// https://screenpipe.com

// Exercise the real native panel offscreen. No app activation,
// desktop input, engine connection, or recording is needed.
import AppKit
import SwiftUI

@available(macOS 13.0, *)
@main
struct MeetingTranscriptScrollTests {
    static var checks = 0
    static func expect(_ condition: Bool, _ message: String) {
        checks += 1
        guard condition else {
            FileHandle.standardError.write(Data("FAIL: \(message)\n".utf8))
            exit(1)
        }
    }
    static func pump() {
        RunLoop.main.run(until: Date().addingTimeInterval(0.25))
    }
    static func scrollView(_ view: NSView) -> NSScrollView? {
        if let scroll = view as? NSScrollView { return scroll }
        return view.subviews.compactMap { scrollView($0) }.first
    }
    static func main() {
        let app = NSApplication.shared
        app.setActivationPolicy(.prohibited)
        for scale in [CGFloat(1), 1.5, 2] {
            run(scale: scale)
        }
        testControllerReopen()
        print("meeting transcript scroll: \(checks) checks passed")
    }
    static func run(scale: CGFloat) {
        let metrics = OverlayMetrics()
        metrics.meetingActive = true
        metrics.activeMeetingId = 1
        metrics.meetingApp = "Google Meet"
        func item(_ i: Int) -> MeetingOverlayTranscriptItem {
            MeetingOverlayTranscriptItem(meetingId: 1, itemId: "item-\(i)", deviceName: "fixture", deviceType: "output", speakerName: "speaker \(i % 2 + 1)", text: "Turn \(i): We can review the project notes together. This longer sentence should remain fully readable when scrolling through the meeting transcript.", capturedAt: "2026-10-07T10:00:00Z", isFinal: true)
        }
        metrics.meetingTranscriptItems = (1...12).map(item)
        let host = NSHostingView(rootView: MeetingTranscriptPreview(metrics: metrics, scale: scale, onOpenNote: {}, onStop: {}, onTogglePin: {}))
        let size = host.fittingSize
        let panel = NSPanel(contentRect: NSRect(origin: .zero, size: size), styleMask: [.nonactivatingPanel, .borderless], backing: .buffered, defer: false)
        panel.isReleasedWhenClosed = false
        panel.contentView = host
        host.frame = NSRect(origin: .zero, size: size)
        host.layoutSubtreeIfNeeded()
        pump()
        metrics.meetingPinned = true
        pump()
        guard let scroll = scrollView(host), let doc = scroll.documentView else {
            expect(false, "transcript must have a native scroll view")
            return
        }
        func atBottom() -> Bool {
            abs(doc.frame.height - scroll.contentView.bounds.maxY) <= 1
        }
        expect(doc.frame.height > scroll.contentView.bounds.height * 3, "full history must overflow")
        expect(atBottom(), "open on latest transcript")
        expect(!panel.isKeyWindow, "test panel must never take focus")
        scroll.contentView.scroll(to: NSPoint(x: 0, y: scroll.contentView.bounds.minY - 2))
        scroll.reflectScrolledClipView(scroll.contentView)
        pump()
        let nearBottomOffset = scroll.contentView.bounds.minY
        host.rootView = MeetingTranscriptPreview(metrics: metrics, scale: scale, onOpenNote: {}, onStop: {}, onTogglePin: {})
        pump()
        expect(abs(scroll.contentView.bounds.minY - nearBottomOffset) < 1, "even a small upward scroll must survive a stream refresh")

        scroll.contentView.scroll(to: NSPoint(x: 0, y: 0))
        scroll.reflectScrolledClipView(scroll.contentView)
        pump()
        expect(scroll.contentView.bounds.minY == 0, "earliest retained turn must be reachable")
        metrics.meetingTranscriptItems.append(item(13))
        // The controller also replaces rootView on every websocket update.
        host.rootView = MeetingTranscriptPreview(metrics: metrics, scale: scale, onOpenNote: {}, onStop: {}, onTogglePin: {})
        pump()
        expect(scroll.contentView.bounds.minY == 0, "new speech must preserve reading position")
        let previousHeight = doc.frame.height
        let partial = item(13)
        metrics.meetingTranscriptItems[12] = MeetingOverlayTranscriptItem(
            meetingId: 1, itemId: partial.itemId, deviceName: partial.deviceName,
            deviceType: partial.deviceType, speakerName: partial.speakerName,
            text: partial.text + " " + partial.text, capturedAt: partial.capturedAt, isFinal: false
        )
        pump()
        expect(doc.frame.height == previousHeight, "partial text must not reflow the reading snapshot")
        expect(scroll.contentView.bounds.minY == 0, "partial updates must preserve reading position")
        scroll.contentView.scroll(to: NSPoint(x: 0, y: doc.frame.height - scroll.contentView.bounds.height))
        scroll.reflectScrolledClipView(scroll.contentView)
        pump()
        expect(doc.frame.height > previousHeight, "returning to bottom flushes queued partial speech without another event")
        metrics.meetingTranscriptItems.append(item(14))
        pump()
        expect(atBottom(), "returning to bottom must resume following new speech")
        let event = CGEvent(scrollWheelEvent2Source: nil, units: .pixel, wheelCount: 1, wheel1: 80, wheel2: 0, wheel3: 0)!
        scroll.scrollWheel(with: NSEvent(cgEvent: event)!)
        pump()
        expect(!atBottom(), "wheel event must scroll an inactive panel")
        let wheelOffset = scroll.contentView.bounds.minY
        metrics.meetingTranscriptItems.append(item(15))
        pump()
        expect(abs(scroll.contentView.bounds.minY - wheelOffset) <= 1, "wheel scroll position survives new speech")
        metrics.meetingTranscriptItems = (1...50).map(item)
        pump()
        expect(abs(scroll.contentView.bounds.minY - wheelOffset) <= 1, "snapshot preserves reading position")
        let pausedHeight = doc.frame.height
        metrics.meetingTranscriptItems = (2...51).map(item)
        pump()
        expect(doc.frame.height == pausedHeight, "rolling history does not replace the reading snapshot")
        expect(abs(scroll.contentView.bounds.minY - wheelOffset) <= 1, "rolling history keeps the same reading offset")
        expect(!atBottom(), "rolling history must not force reader to latest")
        metrics.activeMeetingId = 2
        pump()
        guard let newScroll = scrollView(host), let newDoc = newScroll.documentView else {
            expect(false, "new meeting must retain scroll support")
            return
        }
        expect(abs(newDoc.frame.height - newScroll.contentView.bounds.maxY) <= 1, "new meeting resets to latest")
        metrics.meetingStopError = "Unable to stop meeting"
        pump()
        expect(scrollView(host) == nil, "stop error stays visible outside scroll history")
        metrics.meetingStopError = nil
        metrics.meetingTranscriptItems = []
        pump()
        expect(scrollView(host) == nil, "empty meeting retains listening state")
        metrics.meetingTranscriptItems = [item(1)]
        pump()
        expect(scrollView(host)?.contentView.bounds.minY == 0, "short transcript remains at top")
        panel.close()
    }
    static func testControllerReopen() {
        // Exercise the actual hide/show controller with synthetic streaming
        // speech behind other apps, with both network routes disconnected.
        setenv("SCREENPIPE_E2E_NON_INTRUSIVE", "1", 1)
        let controller = ShortcutReminderController()
        controller.show(shortcuts: "{\"metrics_ws_url\":\"ws://127.0.0.1:9/fixture\",\"events_ws_url\":\"ws://127.0.0.1:9/fixture\"}")
        controller.setPreviewPinnedMeeting()
        RunLoop.main.run(until: Date().addingTimeInterval(8))
        guard let panel = NSApplication.shared.windows.first(where: { window in
            window.isVisible && (window.contentView.map { scrollView($0) != nil } ?? false)
        }), let content = panel.contentView, let scroll = scrollView(content), let doc = scroll.documentView else {
            expect(false, "controller must show a scrollable transcript")
            return
        }
        expect(doc.frame.height > scroll.contentView.bounds.height, "controller fixture must overflow")
        scroll.contentView.scroll(to: NSPoint(x: 0, y: 0))
        scroll.reflectScrolledClipView(scroll.contentView)
        RunLoop.main.run(until: Date().addingTimeInterval(1))
        expect(scroll.contentView.bounds.minY == 0, "controller refresh preserves older speech")
        controller.toggleMeetingPin()
        pump()
        expect(!panel.isVisible, "unpin away from the card collapses it")
        controller.setPillHoveringExternally(true)
        pump()
        expect(panel.isVisible, "hover reopens the same transcript panel")
        guard let reopened = scrollView(content), let reopenedDoc = reopened.documentView else {
            expect(false, "reopened controller must have a transcript")
            return
        }
        expect(abs(reopenedDoc.frame.height - reopened.contentView.bounds.maxY) <= 1,
               "collapse then reopen must reset to latest speech")
        expect(!panel.isKeyWindow, "controller test must not take focus")
        controller.hide()
        pump()
    }

}
