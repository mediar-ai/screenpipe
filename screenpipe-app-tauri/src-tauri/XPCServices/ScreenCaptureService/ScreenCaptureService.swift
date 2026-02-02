import Foundation
import ScreenCaptureKit
import CoreGraphics
import AppKit

// MARK: - XPC Protocol

@objc protocol ScreenCaptureServiceProtocol {
    func listMonitors(reply: @escaping ([[String: Any]]?, Error?) -> Void)
    func captureMonitor(id: UInt32, reply: @escaping (Data?, Error?) -> Void)
    func listWindows(reply: @escaping ([[String: Any]]?, Error?) -> Void)
    func captureWindow(id: UInt32, reply: @escaping (Data?, Error?) -> Void)
    func checkPermission(reply: @escaping (Bool) -> Void)
}

// MARK: - XPC Service Implementation

class ScreenCaptureService: NSObject, ScreenCaptureServiceProtocol {

    // MARK: - Permission Check

    func checkPermission(reply: @escaping (Bool) -> Void) {
        if #available(macOS 12.3, *) {
            Task {
                do {
                    // This will trigger permission prompt if not granted
                    _ = try await SCShareableContent.excludingDesktopWindows(false, onScreenWindowsOnly: false)
                    reply(true)
                } catch {
                    NSLog("ScreenCaptureService: Permission check failed: \(error)")
                    reply(false)
                }
            }
        } else {
            // Fallback for older macOS - use CGPreflightScreenCaptureAccess
            let hasPermission = CGPreflightScreenCaptureAccess()
            reply(hasPermission)
        }
    }

    // MARK: - Monitor Operations

    func listMonitors(reply: @escaping ([[String: Any]]?, Error?) -> Void) {
        if #available(macOS 12.3, *) {
            Task {
                do {
                    let content = try await SCShareableContent.excludingDesktopWindows(false, onScreenWindowsOnly: false)
                    let monitors = content.displays.map { display -> [String: Any] in
                        return [
                            "id": display.displayID,
                            "width": display.width,
                            "height": display.height,
                            "frame": [
                                "x": display.frame.origin.x,
                                "y": display.frame.origin.y,
                                "width": display.frame.size.width,
                                "height": display.frame.size.height
                            ]
                        ]
                    }
                    reply(monitors, nil)
                } catch {
                    NSLog("ScreenCaptureService: Failed to list monitors: \(error)")
                    reply(nil, error)
                }
            }
        } else {
            // Fallback for older macOS
            var monitors: [[String: Any]] = []
            let maxDisplays: UInt32 = 16
            var displayCount: UInt32 = 0
            var displays = [CGDirectDisplayID](repeating: 0, count: Int(maxDisplays))

            if CGGetActiveDisplayList(maxDisplays, &displays, &displayCount) == .success {
                for i in 0..<Int(displayCount) {
                    let displayID = displays[i]
                    let bounds = CGDisplayBounds(displayID)
                    monitors.append([
                        "id": displayID,
                        "width": Int(bounds.width),
                        "height": Int(bounds.height),
                        "frame": [
                            "x": bounds.origin.x,
                            "y": bounds.origin.y,
                            "width": bounds.size.width,
                            "height": bounds.size.height
                        ]
                    ])
                }
            }
            reply(monitors, nil)
        }
    }

    func captureMonitor(id: UInt32, reply: @escaping (Data?, Error?) -> Void) {
        if #available(macOS 14.0, *) {
            Task {
                do {
                    let content = try await SCShareableContent.excludingDesktopWindows(false, onScreenWindowsOnly: false)
                    guard let display = content.displays.first(where: { $0.displayID == id }) else {
                        reply(nil, NSError(domain: "ScreenCaptureService", code: 1, userInfo: [NSLocalizedDescriptionKey: "Monitor not found"]))
                        return
                    }

                    let filter = SCContentFilter(display: display, excludingWindows: [])
                    let config = SCStreamConfiguration()
                    config.width = display.width
                    config.height = display.height
                    config.pixelFormat = kCVPixelFormatType_32BGRA
                    config.showsCursor = false

                    let image = try await SCScreenshotManager.captureImage(contentFilter: filter, configuration: config)

                    // Convert CGImage to PNG data
                    let bitmapRep = NSBitmapImageRep(cgImage: image)
                    guard let pngData = bitmapRep.representation(using: .png, properties: [:]) else {
                        reply(nil, NSError(domain: "ScreenCaptureService", code: 2, userInfo: [NSLocalizedDescriptionKey: "Failed to convert image to PNG"]))
                        return
                    }

                    reply(pngData, nil)
                } catch {
                    NSLog("ScreenCaptureService: Failed to capture monitor \(id): \(error)")
                    reply(nil, error)
                }
            }
        } else if #available(macOS 12.3, *) {
            // Use stream-based capture for macOS 12.3-13.x
            Task {
                do {
                    let content = try await SCShareableContent.excludingDesktopWindows(false, onScreenWindowsOnly: false)
                    guard let display = content.displays.first(where: { $0.displayID == id }) else {
                        reply(nil, NSError(domain: "ScreenCaptureService", code: 1, userInfo: [NSLocalizedDescriptionKey: "Monitor not found"]))
                        return
                    }

                    // Use legacy CGWindowListCreateImage for older macOS
                    let imageRef = CGWindowListCreateImage(
                        display.frame,
                        .optionOnScreenOnly,
                        kCGNullWindowID,
                        [.boundsIgnoreFraming]
                    )

                    guard let cgImage = imageRef else {
                        reply(nil, NSError(domain: "ScreenCaptureService", code: 2, userInfo: [NSLocalizedDescriptionKey: "Failed to capture screen"]))
                        return
                    }

                    let bitmapRep = NSBitmapImageRep(cgImage: cgImage)
                    guard let pngData = bitmapRep.representation(using: .png, properties: [:]) else {
                        reply(nil, NSError(domain: "ScreenCaptureService", code: 3, userInfo: [NSLocalizedDescriptionKey: "Failed to convert image to PNG"]))
                        return
                    }

                    reply(pngData, nil)
                } catch {
                    NSLog("ScreenCaptureService: Failed to capture monitor \(id): \(error)")
                    reply(nil, error)
                }
            }
        } else {
            // Fallback for older macOS
            let imageRef = CGDisplayCreateImage(id)
            guard let cgImage = imageRef else {
                reply(nil, NSError(domain: "ScreenCaptureService", code: 1, userInfo: [NSLocalizedDescriptionKey: "Failed to capture screen"]))
                return
            }

            let bitmapRep = NSBitmapImageRep(cgImage: cgImage)
            guard let pngData = bitmapRep.representation(using: .png, properties: [:]) else {
                reply(nil, NSError(domain: "ScreenCaptureService", code: 2, userInfo: [NSLocalizedDescriptionKey: "Failed to convert image to PNG"]))
                return
            }

            reply(pngData, nil)
        }
    }

    // MARK: - Window Operations

    func listWindows(reply: @escaping ([[String: Any]]?, Error?) -> Void) {
        if #available(macOS 12.3, *) {
            Task {
                do {
                    let content = try await SCShareableContent.excludingDesktopWindows(false, onScreenWindowsOnly: true)
                    let windows = content.windows.compactMap { window -> [String: Any]? in
                        // Skip windows without title or from system apps
                        let appName = window.owningApplication?.applicationName ?? ""
                        let title = window.title ?? ""

                        // Skip system UI elements
                        let skipApps = ["Window Server", "SystemUIServer", "ControlCenter", "Dock", "NotificationCenter", "loginwindow", "WindowManager"]
                        if skipApps.contains(appName) {
                            return nil
                        }

                        return [
                            "id": window.windowID,
                            "title": title,
                            "app_name": appName,
                            "frame": [
                                "x": window.frame.origin.x,
                                "y": window.frame.origin.y,
                                "width": window.frame.size.width,
                                "height": window.frame.size.height
                            ],
                            "is_on_screen": window.isOnScreen
                        ]
                    }
                    reply(windows, nil)
                } catch {
                    NSLog("ScreenCaptureService: Failed to list windows: \(error)")
                    reply(nil, error)
                }
            }
        } else {
            // Fallback using CGWindowListCopyWindowInfo
            guard let windowList = CGWindowListCopyWindowInfo([.optionOnScreenOnly, .excludeDesktopElements], kCGNullWindowID) as? [[String: Any]] else {
                reply([], nil)
                return
            }

            let windows = windowList.compactMap { info -> [String: Any]? in
                guard let windowID = info[kCGWindowNumber as String] as? UInt32,
                      let bounds = info[kCGWindowBounds as String] as? [String: CGFloat] else {
                    return nil
                }

                let name = info[kCGWindowName as String] as? String ?? ""
                let ownerName = info[kCGWindowOwnerName as String] as? String ?? ""

                return [
                    "id": windowID,
                    "title": name,
                    "app_name": ownerName,
                    "frame": bounds,
                    "is_on_screen": true
                ]
            }
            reply(windows, nil)
        }
    }

    func captureWindow(id: UInt32, reply: @escaping (Data?, Error?) -> Void) {
        if #available(macOS 14.0, *) {
            Task {
                do {
                    let content = try await SCShareableContent.excludingDesktopWindows(false, onScreenWindowsOnly: false)
                    guard let window = content.windows.first(where: { $0.windowID == id }) else {
                        reply(nil, NSError(domain: "ScreenCaptureService", code: 1, userInfo: [NSLocalizedDescriptionKey: "Window not found"]))
                        return
                    }

                    let filter = SCContentFilter(desktopIndependentWindow: window)
                    let config = SCStreamConfiguration()
                    config.width = Int(window.frame.width)
                    config.height = Int(window.frame.height)
                    config.pixelFormat = kCVPixelFormatType_32BGRA
                    config.showsCursor = false

                    let image = try await SCScreenshotManager.captureImage(contentFilter: filter, configuration: config)

                    let bitmapRep = NSBitmapImageRep(cgImage: image)
                    guard let pngData = bitmapRep.representation(using: .png, properties: [:]) else {
                        reply(nil, NSError(domain: "ScreenCaptureService", code: 2, userInfo: [NSLocalizedDescriptionKey: "Failed to convert image to PNG"]))
                        return
                    }

                    reply(pngData, nil)
                } catch {
                    NSLog("ScreenCaptureService: Failed to capture window \(id): \(error)")
                    reply(nil, error)
                }
            }
        } else {
            // Fallback using CGWindowListCreateImage
            let imageRef = CGWindowListCreateImage(
                .null,
                .optionIncludingWindow,
                CGWindowID(id),
                [.boundsIgnoreFraming]
            )

            guard let cgImage = imageRef else {
                reply(nil, NSError(domain: "ScreenCaptureService", code: 1, userInfo: [NSLocalizedDescriptionKey: "Failed to capture window"]))
                return
            }

            let bitmapRep = NSBitmapImageRep(cgImage: cgImage)
            guard let pngData = bitmapRep.representation(using: .png, properties: [:]) else {
                reply(nil, NSError(domain: "ScreenCaptureService", code: 2, userInfo: [NSLocalizedDescriptionKey: "Failed to convert image to PNG"]))
                return
            }

            reply(pngData, nil)
        }
    }
}

// MARK: - XPC Service Delegate

class ServiceDelegate: NSObject, NSXPCListenerDelegate {
    func listener(_ listener: NSXPCListener, shouldAcceptNewConnection newConnection: NSXPCConnection) -> Bool {
        let exportedObject = ScreenCaptureService()
        newConnection.exportedInterface = NSXPCInterface(with: ScreenCaptureServiceProtocol.self)
        newConnection.exportedObject = exportedObject
        newConnection.resume()
        return true
    }
}

// MARK: - Main Entry Point

let delegate = ServiceDelegate()
let listener = NSXPCListener.service()
listener.delegate = delegate
listener.resume()
RunLoop.main.run()
