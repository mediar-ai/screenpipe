import Cocoa
import ApplicationServices
import Foundation
import SQLite3

// Force stdout to flush immediately
setbuf(__stdoutp, nil)
print("swift script starting...")

// Add early error handling
func checkAccessibilityPermissions() -> Bool {
    let checkOptPrompt = kAXTrustedCheckOptionPrompt.takeUnretainedValue()
    let options = [checkOptPrompt: true] as CFDictionary
    let trusted = AXIsProcessTrustedWithOptions(options)
    print("accessibility permissions check: \(trusted)")
    return trusted
}

// Define WindowState struct first
struct WindowState {
    var elements: [String: ElementAttributes]
    var textOutput: String
    var timestamp: Date

    init() {
        self.elements = [:]
        self.textOutput = ""
        self.timestamp = Date()
    }
}

// Global state
var globalElementValues = [String: [String: WindowState]]()  // [App: [Window: WindowState]]
var currentObserver: AXObserver? {
    willSet {
        if let observer = currentObserver {
            CFRunLoopRemoveSource(
                CFRunLoopGetCurrent(),
                AXObserverGetRunLoopSource(observer),
                .defaultMode
            )
        }
    }
}
var monitoringEventLoop: CFRunLoop?
var hasChanges = false
var windowsNeedingTimestampUpdate = Set<WindowIdentifier>()
// Debounce mechanism variables
var pendingNotifications = [(startElement: AXUIElement, depth: Int)]()
var debounceTimer: DispatchSourceTimer?

// Add global context structure
class MonitoringContext {
    let appName: String
    let windowName: String

    init(appName: String, windowName: String) {
        self.appName = appName
        self.windowName = windowName
    }
}
var currentContext: MonitoringContext?

// Add these custom notification constants at the top of the file
let kAXScrolledVisibleChangedNotification = "AXScrolledVisibleChanged" as CFString
let kAXSelectedCellsChangedNotification = "AXSelectedCellsChanged" as CFString
let kAXLayoutChangedNotification = "AXLayoutChanged" as CFString

// Update notificationsToObserve array
let notificationsToObserve: [(String, String)] = [
    ("AXValueChanged", kAXValueChangedNotification as String),
    ("AXTitleChanged", kAXTitleChangedNotification as String),
    ("AXFocusedUIElementChanged", kAXFocusedUIElementChangedNotification as String),
    ("AXFocusedWindowChanged", kAXFocusedWindowChangedNotification as String),
    ("AXMainWindowChanged", kAXMainWindowChangedNotification as String),
    ("AXSelectedTextChanged", kAXSelectedTextChangedNotification as String),
    ("AXUIElementDestroyed", kAXUIElementDestroyedNotification as String),
    ("AXSelectedChildrenChanged", kAXSelectedChildrenChangedNotification as String),
    ("AXRowCountChanged", kAXRowCountChangedNotification as String),
    ("AXSelectedRowsChanged", kAXSelectedRowsChangedNotification as String),
    ("AXScrolledVisibleChanged", kAXScrolledVisibleChangedNotification as String),
    ("AXLayoutChanged", kAXLayoutChangedNotification as String),
    ("AXSelectedCellsChanged", kAXSelectedCellsChangedNotification as String),
    ("AXWindowResized", kAXWindowResizedNotification as String),
    ("AXWindowMoved", kAXWindowMovedNotification as String),
    ("AXCreated", kAXCreatedNotification as String)
]

// Struct to hold element attributes including hierarchy and position
struct ElementAttributes {
    var element: String
    var path: String
    var attributes: [String: String]
    var depth: Int
    var x: CGFloat
    var y: CGFloat
    var width: CGFloat
    var height: CGFloat
    var children: [ElementAttributes]
    var timestamp: Date
    
    // Add computed property for unique identifier
    var identifier: String {
        // Combine path with sorted attributes to create a stable identifier
        let attributesString = attributes.sorted { $0.key < $1.key }
            .map { "\($0.key)=\($0.value)" }
            .joined(separator: "|")
        return "\(path)#\(attributesString)"
    }

    init(element: String, path: String, attributes: [String: String], depth: Int,
         x: CGFloat, y: CGFloat, width: CGFloat, height: CGFloat, children: [ElementAttributes],
         timestamp: Date = Date()) {
        self.element = element
        self.path = path
        self.attributes = attributes
        self.depth = depth
        self.x = x
        self.y = y
        self.width = width
        self.height = height
        self.children = children
        self.timestamp = timestamp
    }
}

// Add traversal state management
var isTraversing = false
var shouldCancelTraversal = false
let traversalQueue = DispatchQueue(label: "com.screenpipe.traversal")

// Add ScreenPipeDB instance
var screenPipeDb: ScreenPipeDB?

// Replace the tuple with a struct
struct WindowIdentifier: Hashable {
    let app: String
    let window: String
}

// Change the set declaration
var changedWindows = Set<WindowIdentifier>()

// Add synchronization queue and cleanup flag
let synchronizationQueue = DispatchQueue(label: "com.screenpipe.synchronization")
var isCleaningUp = false

// JSON state structure
struct UIMonitoringState: Codable {
    var ignoredApps: [String]
    
    init(ignoredApps: [String] = []) {
        self.ignoredApps = ignoredApps
    }
}

// Function to get state file path
func getStateFilePath() -> String {
    let paths = FileManager.default.urls(for: .applicationSupportDirectory, in: .userDomainMask)
    let appSupportDir = paths[0].appendingPathComponent("screenpipe")
    
    // Create directory if it doesn't exist
    try? FileManager.default.createDirectory(at: appSupportDir, withIntermediateDirectories: true)
    
    return appSupportDir.appendingPathComponent("uiMonitoringLogs.json").path
}

// Function to load or create state
func loadOrCreateState() -> UIMonitoringState {
    let path = getStateFilePath()
    
    if let data = try? Data(contentsOf: URL(fileURLWithPath: path)),
       let state = try? JSONDecoder().decode(UIMonitoringState.self, from: data) {
        return state
    }
    
    // Create default state with TablePlus ignored
    let defaultState = UIMonitoringState(ignoredApps: ["tableplus"])
    
    // Save default state
    if let encoded = try? JSONEncoder().encode(defaultState) {
        try? encoded.write(to: URL(fileURLWithPath: path))
    }
    
    return defaultState
}

// Start monitoring
startMonitoring()

func startMonitoring() {
    print("entering startMonitoring()")
    
    // Check permissions first
    if !checkAccessibilityPermissions() {
        print("error: accessibility permissions not granted")
        exit(1)
    }
    
    // Set up signal handling
    signal(SIGINT) { _ in
        print("received SIGINT, cleaning up...")
        cleanup()
        exit(0)
    }

    setupDatabase()
    print("loaded ui_monitoring logs state")
    
    print("setting up application observer...")
    setupApplicationChangeObserver()
    
    print("monitoring current application...")
    monitorCurrentFrontmostApplication()

    Timer.scheduledTimer(withTimeInterval: 5.0, repeats: true) { _ in
        autoreleasepool {
            saveElementValues()
        }
    }

    monitoringEventLoop = CFRunLoopGetCurrent()
    CFRunLoopRun()
}

func setupDatabase() {
    print("setting up database connection...")
    do {
        screenPipeDb = try ScreenPipeDB()
        print("database connected successfully")
        
        // Create table if not exists (original schema)
        let createTableSQL = """
            CREATE TABLE IF NOT EXISTS ui_monitoring (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                timestamp TEXT,
                app TEXT,
                window TEXT,
                text_output TEXT
            );
            CREATE INDEX IF NOT EXISTS idx_timestamp ON ui_monitoring(timestamp);
            CREATE UNIQUE INDEX IF NOT EXISTS idx_app_window ON ui_monitoring(app, window);
        """
        
        if sqlite3_exec(screenPipeDb?.db, createTableSQL, nil, nil, nil) != SQLITE_OK {
            let error = String(cString: sqlite3_errmsg(screenPipeDb?.db))
            print("error creating table: \(error)")
            return
        }
        
        // Add initial_traversal_at column if it doesn't exist
        let addColumnSQL = """
            SELECT COUNT(*) FROM pragma_table_info('ui_monitoring') 
            WHERE name='initial_traversal_at';
        """
        
        var stmt: OpaquePointer?
        var columnExists = false
        
        if sqlite3_prepare_v2(screenPipeDb?.db, addColumnSQL, -1, &stmt, nil) == SQLITE_OK {
            if sqlite3_step(stmt) == SQLITE_ROW {
                columnExists = sqlite3_column_int(stmt, 0) > 0
            }
        }
        sqlite3_finalize(stmt)
        
        if !columnExists {
            print("adding initial_traversal_at column...")
            let alterTableSQL = """
                ALTER TABLE ui_monitoring 
                ADD COLUMN initial_traversal_at TEXT;
                
                -- Set initial_traversal_at to timestamp for existing records
                UPDATE ui_monitoring 
                SET initial_traversal_at = timestamp 
                WHERE initial_traversal_at IS NULL;
            """
            
            if sqlite3_exec(screenPipeDb?.db, alterTableSQL, nil, nil, nil) != SQLITE_OK {
                let error = String(cString: sqlite3_errmsg(screenPipeDb?.db))
                print("error adding column: \(error)")
            } else {
                print("added initial_traversal_at column successfully")
            }
        }
        
        print("database setup completed")
    } catch {
        print("error setting up database: \(error)")
        exit(1)
    }
}

func monitorCurrentFrontmostApplication() {
    // Cancel any in-progress traversal
    if isTraversing {
        shouldCancelTraversal = true
        // Small delay to allow cancellation
        Thread.sleep(forTimeInterval: 0.1)
    }

    // Stop previous monitoring if any
    if let observer = currentObserver {
        CFRunLoopRemoveSource(
            CFRunLoopGetCurrent(),
            AXObserverGetRunLoopSource(observer),
            .defaultMode
        )
        currentObserver = nil
    }

    // Allow the run loop to process events
    RunLoop.current.run(until: Date(timeIntervalSinceNow: 0.01))

    guard let app = NSWorkspace.shared.frontmostApplication else {
        print("no frontmost application found")
        return
    }

    // Sanitize app name by removing invisible characters and trimming
    let appName = (app.localizedName?.lowercased() ?? "unknown app")
        .components(separatedBy: CharacterSet.controlCharacters).joined()
        .trimmingCharacters(in: .whitespacesAndNewlines)

    // First check if app should be ignored
    let state = loadOrCreateState()
    if state.ignoredApps.contains(appName) {
        print("skipping ignored app: \(appName)")
        return
    }

    let pid = app.processIdentifier
    let axApp = AXUIElementCreateApplication(pid)

    // Get window name BEFORE initializing structures
    var windowName = "unknown window"
    var windowValue: AnyObject?
    let result = AXUIElementCopyAttributeValue(axApp, kAXFocusedWindowAttribute as CFString, &windowValue)
    if result == .success, let window = windowValue as! AXUIElement? {
        if let titleValue = getAttributeValue(window, forAttribute: kAXTitleAttribute) as? String {
            // Sanitize window name immediately when we get it
            windowName = titleValue.lowercased()
                .components(separatedBy: CharacterSet.controlCharacters).joined()
                .trimmingCharacters(in: .whitespacesAndNewlines)
        }
    }

    // Check if we already have recent data for this window
    let windowExists = globalElementValues[appName]?[windowName] != nil
    let isWindowRecent = globalElementValues[appName]?[windowName]?.timestamp.timeIntervalSinceNow ?? -Double.infinity > -300 // 5 minutes

    // Initialize app and window in the structure if needed
    if globalElementValues[appName] == nil {
        globalElementValues[appName] = [:]
    }
    if globalElementValues[appName]?[windowName] == nil {
        globalElementValues[appName]?[windowName] = WindowState()
    }

    if !windowExists || !isWindowRecent {
        // Only traverse if window doesn't exist or data is old
        print("traversing ui elements for \(appName), window: \(windowName)...")
        traverseAndStoreUIElements(axApp, appName: appName, windowName: windowName)
        hasChanges = true
    } else {
        print("reusing existing ui elements for \(appName), window: \(windowName)...")
    }

    // Always set up notifications
    setupAccessibilityNotifications(pid: pid, axApp: axApp, appName: appName, windowName: windowName)

    print("monitoring changes for \(appName), window: \(windowName)...")
}

func setupApplicationChangeObserver() {
    NSWorkspace.shared.notificationCenter.addObserver(
        forName: NSWorkspace.didActivateApplicationNotification,
        object: nil,
        queue: OperationQueue.main
    ) { notification in
        // Application changed, start monitoring the new frontmost app
        monitorCurrentFrontmostApplication()
    }

    NSWorkspace.shared.notificationCenter.addObserver(
        forName: NSWorkspace.activeSpaceDidChangeNotification,
        object: nil,
        queue: OperationQueue.main
    ) { notification in
        // Space changed, update monitoring
        monitorCurrentFrontmostApplication()
    }
}

func safeAccessibilityCall<T>(_ operation: () -> T?) -> T? {
    return autoreleasepool {
        return withoutActuallyEscaping(operation) { operation in
            return operation()
        }
    }
}

func getAttributeValue(_ element: AXUIElement, forAttribute attribute: String) -> AnyObject? {
    return safeAccessibilityCall {
        var value: AnyObject?
        let result = AXUIElementCopyAttributeValue(element, attribute as CFString, &value)
        return result == .success ? value : nil
    }
}

func traverseAndStoreUIElements(_ element: AXUIElement, appName: String, windowName: String) {
    autoreleasepool {
        if isTraversing { return }

        isTraversing = true
        shouldCancelTraversal = false

        let startTime = DispatchTime.now()
        var visitedElements = Set<AXUIElementWrapper>()
        let unwantedValues = ["0", "", "\u{200E}", "3", "\u{200F}"]  // LRM and RLM marks
        let unwantedLabels = [
            "window", "application", "group", "button", "image", "text",
            "pop up button", "region", "notifications", "table", "column",
            "html content"
        ]
        let attributesToCheck = ["AXDescription", "AXValue", "AXLabel", "AXRoleDescription", "AXHelp"]

        // Add character count tracking
        var totalCharacterCount = 0

        func traverse(_ element: AXUIElement, depth: Int) -> ElementAttributes? {
            // Add check for AXMenuBar at the start
            if let role = getAttributeValue(element, forAttribute: "AXRole") as? String,
               role == "AXMenuBar" {
                return nil
            }

            // Add depth limit check
            if depth > 100 {
                print("max depth reached: depth=\(depth), app=\(appName), window=\(windowName)")
                return nil
            }

            // Check for cancellation or character limit
            if shouldCancelTraversal || totalCharacterCount >= 100_000 {
                if totalCharacterCount >= 1_000_000 {
                    print("hit 1mln char limit for app: \(appName), window: \(windowName)")
                }
                return nil
            }

            let elementWrapper = AXUIElementWrapper(element: element)

            guard !visitedElements.contains(elementWrapper) else { return nil }
            visitedElements.insert(elementWrapper)

            var attributeNames: CFArray?
            let result = AXUIElementCopyAttributeNames(element, &attributeNames)

            guard result == .success, let attributes = attributeNames as? [String] else { return nil }

            var position: CGPoint = .zero
            var size: CGSize = .zero

            // Get position
            if let positionValue = getAttributeValue(element, forAttribute: kAXPositionAttribute) as! AXValue?,
               AXValueGetType(positionValue) == .cgPoint {
                AXValueGetValue(positionValue, .cgPoint, &position)
            }

            // Get size
            if let sizeValue = getAttributeValue(element, forAttribute: kAXSizeAttribute) as! AXValue?,
               AXValueGetType(sizeValue) == .cgSize {
                AXValueGetValue(sizeValue, .cgSize, &size)
            }

            // Get element description
            let elementDesc = (getAttributeValue(element, forAttribute: "AXRole") as? String) ?? "Unknown"

            // Get path
            let (path, depth) = getElementPath(element)

            var elementAttributes = ElementAttributes(
                element: elementDesc,
                path: path,
                attributes: [:],
                depth: depth,
                x: position.x,
                y: position.y,
                width: size.width,
                height: size.height,
                children: [],
                timestamp: Date()
            )

            var hasRelevantValue = false

            for attr in attributes {
                // Check relevant attributes
                if attributesToCheck.contains(attr) {
                    if let value = getAttributeValue(element, forAttribute: attr) {
                        let valueStr = describeValue(value)
                        if !valueStr.isEmpty &&
                           !unwantedValues.contains(valueStr) &&
                           valueStr.count > 1 &&
                           !unwantedLabels.contains(valueStr.lowercased()) {
                            // Store attribute and its value
                            elementAttributes.attributes[attr] = valueStr
                            hasRelevantValue = true
                        }
                    }
                }
            }

            // Traverse child elements
            var childrenElements: [ElementAttributes] = []
            for attr in attributes {
                if let childrenValue = getAttributeValue(element, forAttribute: attr) {
                    // Check if it's an array of AXUIElements first
                    if let elementArray = childrenValue as? [AXUIElement] {
                        if elementArray.count > 1000 {
                            print("element at path \(path) has \(elementArray.count) children")
                        }
                        for childElement in elementArray {
                            if let childAttributes = traverse(childElement, depth: depth + 1) {
                                childrenElements.append(childAttributes)
                            }
                        }
                    } else if let childElement = childrenValue as! AXUIElement? {
                        if let childAttributes = traverse(childElement, depth: depth + 1) {
                            childrenElements.append(childAttributes)
                        }
                    }
                }
            }
            elementAttributes.children = childrenElements

            if hasRelevantValue || !childrenElements.isEmpty {
                // Update character count before storing
                if hasRelevantValue {
                    for value in elementAttributes.attributes.values {
                        totalCharacterCount += value.count
                    }
                }
                
                // Store the element with its attributes using identifier as key
                globalElementValues[appName]?[windowName]?.elements[elementAttributes.identifier] = elementAttributes
                return elementAttributes
            } else {
                return nil
            }
        }

        // Run traversal in dedicated queue
        traversalQueue.async {
            _ = traverse(element, depth: 0)

            // Reset state after traversal
            isTraversing = false
            shouldCancelTraversal = false

            // Mark window as changed to ensure first scan gets saved
            hasChanges = true
            changedWindows.insert(WindowIdentifier(app: appName, window: windowName))

            // Update timestamp after traversal
            globalElementValues[appName]?[windowName]?.timestamp = Date()

            let endTime = DispatchTime.now()
            let nanoTime = endTime.uptimeNanoseconds - startTime.uptimeNanoseconds
            let timeInterval = Double(nanoTime) / 1_000_000
            print("\(String(format: "%.2f", timeInterval))ms - ui traversal")

            measureGlobalElementValuesSize()
        }
    }
}

func getRelevantValue(_ element: AXUIElement) -> String? {
    let attributesToCheck = ["AXDescription", "AXValue", "AXLabel", "AXRoleDescription", "AXHelp"]
    let unwantedValues = ["0", "", "\u{200E}", "3", "\u{200F}"]  // LRM and RLM marks
    let unwantedLabels = [
        "window", "application", "group", "button", "image", "text",
        "pop up button", "region", "notifications", "table", "column",
        "html content"
    ]

    for attr in attributesToCheck {
        if let value = getAttributeValue(element, forAttribute: attr) {
            let valueStr = describeValue(value)
            if !valueStr.isEmpty &&
               !unwantedValues.contains(valueStr) &&
               valueStr.count > 1 &&
               !unwantedLabels.contains(valueStr.lowercased()) {
                return valueStr
            }
        }
    }

    return nil
}

func updateElementAndChildren(
    _ element: AXUIElement,
    appName: String, 
    windowName: String,
    visitedElements: inout Set<AXUIElementWrapper>
) -> Bool {
    // Add check for AXMenuBar at the start
    if let role = getAttributeValue(element, forAttribute: "AXRole") as? String,
       role == "AXMenuBar" {
        return false
    }

    let elementWrapper = AXUIElementWrapper(element: element)
    if visitedElements.contains(elementWrapper) { return false }
    visitedElements.insert(elementWrapper)
    
    var hasUpdates = false
    
    // Get position and size
    var position: CGPoint = .zero
    var size: CGSize = .zero
    
    if let positionValue = getAttributeValue(element, forAttribute: kAXPositionAttribute) as! AXValue?,
       AXValueGetType(positionValue) == .cgPoint {
        AXValueGetValue(positionValue, .cgPoint, &position)
    }
    
    if let sizeValue = getAttributeValue(element, forAttribute: kAXSizeAttribute) as! AXValue?,
       AXValueGetType(sizeValue) == .cgSize {
        AXValueGetValue(sizeValue, .cgSize, &size)
    }
    
    // Get element description and full path with depth
    let elementDesc = (getAttributeValue(element, forAttribute: "AXRole") as? String) ?? "unknown"
    let (path, depth) = getElementPath(element)
    
    // Check if element has relevant value
    if let newValue = getRelevantValue(element) {
        let tempAttributes = ElementAttributes(
            element: elementDesc,
            path: path,
            attributes: ["Value": newValue],
            depth: depth,
            x: position.x,
            y: position.y,
            width: size.width,
            height: size.height,
            children: [],
            timestamp: Date()
        )
        let identifier = tempAttributes.identifier
        
        if globalElementValues[appName]?[windowName]?.elements[identifier] == nil {
            // New element - create and store it directly
            globalElementValues[appName]?[windowName]?.elements[identifier] = tempAttributes
            hasUpdates = true
        } else if globalElementValues[appName]?[windowName]?.elements[identifier]?.attributes["Value"] != newValue {
            // Existing element with changed value
            globalElementValues[appName]?[windowName]?.elements[identifier]?.attributes["Value"] = newValue
            hasUpdates = true
        }
    }
    
    // Traverse children
    if let children = getAttributeValue(element, forAttribute: kAXChildrenAttribute) as? [AXUIElement] {
        if children.count > 1000 {
            let (path, _) = getElementPath(element)
            print("element at path \(path) has \(children.count) children")
        }
        for child in children {
            if updateElementAndChildren(child, appName: appName, windowName: windowName, visitedElements: &visitedElements) {
                hasUpdates = true
            }
        }
    }
    
    return hasUpdates
}

func handleFocusedWindowChange(element: AXUIElement) {
    guard let app = NSWorkspace.shared.frontmostApplication else { return }
    let appName = app.localizedName?.lowercased() ?? "unknown app"

    // Get the new window name
    var windowName = "unknown window"
    if let titleValue = getAttributeValue(element, forAttribute: kAXTitleAttribute) as? String {
        windowName = titleValue.lowercased()
            .components(separatedBy: CharacterSet.controlCharacters).joined()
            .trimmingCharacters(in: .whitespacesAndNewlines)
    }

    // Check if this is actually a new window
    let isNewWindow = currentContext?.windowName != windowName
    
    // Update the context
    currentContext = MonitoringContext(appName: appName, windowName: windowName)

    // Initialize window state if not present
    if globalElementValues[appName] == nil {
        globalElementValues[appName] = [:]
    }
    
    // If it's a new window, create fresh state
    if isNewWindow {
        globalElementValues[appName]?[windowName] = WindowState()
        print("new window detected: \(windowName)")
    }

    // Start traversing the new window
    traverseAndStoreUIElements(element, appName: appName, windowName: windowName)
    hasChanges = true
}


func axObserverCallback(observer: AXObserver, element: AXUIElement, notification: CFString, refcon: UnsafeMutableRawPointer?) {
    autoreleasepool {
        guard !isCleaningUp else { return }
        guard CFGetTypeID(element) == AXUIElementGetTypeID() else { return }
        
        synchronizationQueue.async {
            // Check for window-related notifications
            let notificationStr = notification as String
            if notificationStr == kAXFocusedWindowChangedNotification as String ||
               notificationStr == kAXMainWindowChangedNotification as String ||
               notificationStr == kAXTitleChangedNotification as String {
                
                // For title changes, we need to check if it's a window
                if notificationStr == kAXTitleChangedNotification as String {
                    if let role = getAttributeValue(element, forAttribute: "AXRole") as? String,
                       role == "AXWindow" {
                        handleFocusedWindowChange(element: element)
                        return
                    }
                } else {
                    handleFocusedWindowChange(element: element)
                    return
                }
            }

            if isCleaningUp || isTraversing { return }
            if currentContext == nil { return }  // Simplified check since we don't need the value yet

            // Get parent and grandparent
            let parent = getAttributeValue(element, forAttribute: "AXParent") as! AXUIElement?
            var grandparent: AXUIElement? = nil
            if let parent = parent {
                grandparent = getAttributeValue(parent, forAttribute: "AXParent") as! AXUIElement?
            }
            
            // Start from highest available ancestor
            let startElement = grandparent ?? parent ?? element
            
            // Get the depth of the startElement
            let (_, depth) = getElementPath(startElement)
            
            // Add to pending notifications
            pendingNotifications.append((startElement: startElement, depth: depth))
            
            // Reset debounce timer
            debounceTimer?.cancel()
            debounceTimer = nil
            
            // Start a new debounce timer
            debounceTimer = DispatchSource.makeTimerSource(queue: synchronizationQueue)
            debounceTimer?.schedule(deadline: .now() + .milliseconds(200))
            debounceTimer?.setEventHandler {
                processPendingNotifications()
            }
            debounceTimer?.resume()
        }
    }
}


func processPendingNotifications() {
    if isCleaningUp || isTraversing { return }
    guard let context = currentContext else { return }
    
    let startTime = DispatchTime.now()
    
    autoreleasepool {
        // Find the notification with the startElement of least depth
        guard let selectedNotification = pendingNotifications.min(by: { $0.depth < $1.depth }) else {
            pendingNotifications.removeAll()
            return
        }
        
        let startElement = selectedNotification.startElement
        var visitedElements = Set<AXUIElementWrapper>()
        
        // Always add to timestamp update set
        windowsNeedingTimestampUpdate.insert(WindowIdentifier(app: context.appName, window: context.windowName))
        
        if updateElementAndChildren(startElement, appName: context.appName, windowName: context.windowName, visitedElements: &visitedElements) {
            hasChanges = true
            changedWindows.insert(WindowIdentifier(app: context.appName, window: context.windowName))
        }
    }
    
    let endTime = DispatchTime.now()
    let timeInterval = Double(endTime.uptimeNanoseconds - startTime.uptimeNanoseconds) / 1_000_000
    print("\(String(format: "%.2f", timeInterval))ms - processed pending notifications")
    
    // Clear pending notifications and reset debounceTimer
    pendingNotifications.removeAll()
    debounceTimer = nil
}



func setupAccessibilityNotifications(pid: pid_t, axApp: AXUIElement, appName: String, windowName: String) {
    // Add safety check for invalid pid
    if pid <= 0 {
        print("invalid pid: \(pid)")
        return
    }

    synchronizationQueue.sync {
        currentContext = MonitoringContext(appName: appName, windowName: windowName)
    }

    // Add error handling for observer creation
    var observer: AXObserver?
    let createResult = AXObserverCreate(pid, axObserverCallback, &observer)
    if createResult != .success || observer == nil {
        print("failed to create accessibility observer: \(createResult)")
        return
    }

    let axObserver = observer!

    // Clean up previous observer if exists - no need for source nil check
    if let oldObserver = currentObserver {
        CFRunLoopRemoveSource(
            CFRunLoopGetCurrent(),
            AXObserverGetRunLoopSource(oldObserver),
            .defaultMode
        )
    }

    currentObserver = axObserver

    // Add source directly - no need for nil check
    CFRunLoopAddSource(
        CFRunLoopGetCurrent(),
        AXObserverGetRunLoopSource(axObserver),
        .defaultMode
    )

    // Register notifications for the app
    for (_, notification) in notificationsToObserve {
        let appResult = AXObserverAddNotification(axObserver, axApp, notification as CFString, nil)
        if appResult != .success {
            // Errors are expected for some elements, so we can silently ignore them
        }
    }

    // Register notifications for all windows and their elements
    if let windows = getAttributeValue(axApp, forAttribute: kAXWindowsAttribute) as? [AXUIElement] {
        for window in windows {
            registerNotificationsRecursively(element: window, observer: axObserver)
        }
    } else {
        // If we can't get windows, try to register with the main window
        if let mainWindow = getAttributeValue(axApp, forAttribute: kAXMainWindowAttribute) as! AXUIElement? {
            registerNotificationsRecursively(element: mainWindow, observer: axObserver)
        }
    }
}

// Recursive function to register notifications on elements
func registerNotificationsRecursively(element: AXUIElement, observer: AXObserver, depth: Int = 0) {
    // Limit recursion depth to prevent infinite loops
    if depth > 5 { return }

    for (_, notification) in notificationsToObserve {
        let result = AXObserverAddNotification(observer, element, notification as CFString, nil)
        if result != .success {
            // Errors are expected for some elements, so we can silently ignore them
        }
    }

    // Get children and recursively register notifications
    if let children = getAttributeValue(element, forAttribute: kAXChildrenAttribute) as? [AXUIElement] {
        for child in children {
            registerNotificationsRecursively(element: child, observer: observer, depth: depth + 1)
        }
    }
}

func describeValue(_ value: AnyObject?) -> String {
    switch value {
    case let string as String:
        return string.replacingOccurrences(of: "\n", with: "\\n")
    case let number as NSNumber:
        return number.stringValue
    case let point as NSPoint:
        return "(\(point.x), \(point.y))"
    case let size as NSSize:
        return "w=\(size.width) h=\(size.height)"
    case let rect as NSRect:
        return "x=\(rect.origin.x) y=\(rect.origin.y) w=\(rect.size.width) h=\(rect.size.height)"
    case let range as NSRange:
        return "loc=\(range.location) len=\(range.length)"
    case let url as URL:
        return url.absoluteString
    case let array as [AnyObject]:
        return array.isEmpty ? "empty array" : "array with \(array.count) elements"
    case let axValue as AXValue:
        return describeAXValue(axValue)
    case is AXUIElement:
        return "AXUIElement"
    case .none:
        return ""
    default:
        return String(describing: value)
    }
}

func describeAXValue(_ axValue: AXValue) -> String {
    let type = AXValueGetType(axValue)
    switch type {
    case .cgPoint:
        var point = CGPoint.zero
        AXValueGetValue(axValue, .cgPoint, &point)
        return "(\(point.x), \(point.y))"
    case .cgSize:
        var size = CGSize.zero
        AXValueGetValue(axValue, .cgSize, &size)
        return "w=\(size.width) h=\(size.height)"
    case .cgRect:
        var rect = CGRect.zero
        AXValueGetValue(axValue, .cgRect, &rect)
        return "x=\(rect.origin.x) y=\(rect.origin.y) w=\(rect.size.width) h=\(rect.size.height)"
    case .cfRange:
        var range = CFRange(location: 0, length: 0)
        AXValueGetValue(axValue, .cfRange, &range)
        return "loc=\(range.location) len=\(range.length)"
    default:
        return "unknown AXValue type"
    }
}

func getElementPath(_ element: AXUIElement) -> (path: String, depth: Int) {
    var path = [String]()
    var current: AXUIElement? = element
    var depth = 0

    while current != nil {
        if let role = getAttributeValue(current!, forAttribute: "AXRole") as? String {
            var elementDesc = role
            if let title = getAttributeValue(current!, forAttribute: "AXTitle") as? String, !title.isEmpty {
                elementDesc += "[\(title)]"
            }
            path.append(elementDesc)
            depth += 1
        }

        // Get parent
        current = getAttributeValue(current!, forAttribute: "AXParent") as! AXUIElement?
    }

    // Reverse path but depth is already correct
    return (path.reversed().joined(separator: " -> "), depth - 1)
}

func buildTextOutput(from windowState: WindowState) -> String {
    var textOutput = ""
    var processedElements = Set<String>()
    var seenTexts = Set<String>() // Track unique text values
    
    // Helper function to process text values
    func processText(_ text: String) -> String {
        if seenTexts.contains(text) {
            return "" // Return empty string for duplicate text
        }
        seenTexts.insert(text)
        return "[\(text)]"
    }
    
    // Process hierarchical elements
    func processElement(_ elementAttributes: ElementAttributes, indentLevel: Int) {
        // One space per level
        let indentStr = String(repeating: " ", count: indentLevel)
        
        // Process each attribute value and join with spaces
        let text = elementAttributes.attributes.values
            .filter { !seenTexts.contains($0) }
            .map { 
                seenTexts.insert($0)
                return "[\($0)]"
            }
            .joined(separator: " ")
        
        if !text.isEmpty {
            textOutput += "\(indentStr)\(text)\n"
        }
        
        // Mark as processed using identifier
        processedElements.insert(elementAttributes.identifier)
        
        // Recursively process children
        let sortedChildren = elementAttributes.children.sorted { (e1, e2) -> Bool in
            if abs(e1.y - e2.y) < 10 {
                return e1.x < e2.x
            }
            return e1.y < e2.y
        }
        
        for child in sortedChildren {
            processElement(child, indentLevel: indentLevel + 1)
        }
    }
    
    // Process root elements first (hierarchical)
    let rootElements = windowState.elements.values.filter { $0.depth == 0 }
    let sortedRootElements = rootElements.sorted { (e1, e2) -> Bool in
        if abs(e1.y - e2.y) < 10 {
            return e1.x < e2.x
        }
        return e1.y < e2.y
    }
    
    for rootElement in sortedRootElements {
        processElement(rootElement, indentLevel: 0)
    }
    
    // Then process any orphaned elements
    let orphanElements = windowState.elements.filter { !processedElements.contains($0.key) }
    if !orphanElements.isEmpty {
        textOutput += "\n---\n"
        
        // Sort orphans by timestamp first (oldest first), then position if timestamps are equal
        let sortedOrphans = orphanElements.values.sorted { (e1, e2) -> Bool in
            if e1.timestamp == e2.timestamp {
                if abs(e1.y - e2.y) < 10 {
                    return e1.x < e2.x
                }
                return e1.y < e2.y
            }
            return e1.timestamp < e2.timestamp
        }
        
        for element in sortedOrphans {
            // One space per depth level
            let indentStr = String(repeating: " ", count: element.depth)
            let text = element.attributes.values
                .filter { !seenTexts.contains($0) }
                .map { 
                    seenTexts.insert($0)
                    return "[\($0)]"
                }
                .joined(separator: " ")
            
            if !text.isEmpty {
                textOutput += "\(indentStr)\(text)\n"
            }
        }
    }
    
    return textOutput
}

func saveToDatabase(windowId: WindowIdentifier, newTextOutput: String, timestamp: String) {
    guard let db = screenPipeDb?.db else {
        print("database not initialized")
        return
    }
    
    let startTime = DispatchTime.now()
    let SQLITE_TRANSIENT = unsafeBitCast(-1, to: sqlite3_destructor_type.self)
    let MAX_CHARS = 300_000
    
    // Sanitize window name by removing invisible characters
    let sanitizedWindow = windowId.window
        .components(separatedBy: CharacterSet.controlCharacters).joined()
        .trimmingCharacters(in: .whitespacesAndNewlines)
    let sanitizedApp = windowId.app
        .components(separatedBy: CharacterSet.controlCharacters).joined()
        .trimmingCharacters(in: .whitespacesAndNewlines)
    
    // First, get existing text_output and check if record exists
    var existingText = ""
    var recordExists = false
    let selectSQL = "SELECT text_output FROM ui_monitoring WHERE app = ? AND window = ?;"
    var selectStmt: OpaquePointer?
    
    if sqlite3_prepare_v2(db, selectSQL, -1, &selectStmt, nil) == SQLITE_OK {
        sqlite3_bind_text(selectStmt, 1, sanitizedApp, -1, SQLITE_TRANSIENT)
        sqlite3_bind_text(selectStmt, 2, sanitizedWindow, -1, SQLITE_TRANSIENT)
        
        if sqlite3_step(selectStmt) == SQLITE_ROW {
            recordExists = true
            if let text = sqlite3_column_text(selectStmt, 0) {
                existingText = String(cString: text)
            }
        }
        sqlite3_finalize(selectStmt)
    }
    
    // Split and clean lines - only trim trailing whitespace, preserve leading
    let existingLines = existingText.components(separatedBy: "\n")
        .map { $0.trimmingCharacters(in: .whitespaces.subtracting(.init(charactersIn: " "))) }
        .filter { !$0.isEmpty }
    let newLines = newTextOutput.components(separatedBy: "\n")
        .map { $0.trimmingCharacters(in: .whitespaces.subtracting(.init(charactersIn: " "))) }
        .filter { !$0.isEmpty }
    
    var extensionsFound = 0
    var exactMatchesFound = 0
    var newCharsCount = 0
    
    let uniqueNewLines = newLines.filter { newLine in
        let strippedNewLine = newLine.trimmingCharacters(in: CharacterSet(charactersIn: "[]"))
            .trimmingCharacters(in: .whitespaces)
        return !existingLines.contains { existingLine in
            let strippedExistingLine = existingLine.trimmingCharacters(in: CharacterSet(charactersIn: "[]"))
                .trimmingCharacters(in: .whitespaces)
            
            if strippedExistingLine == strippedNewLine {
                exactMatchesFound += 1
                return true
            }
            
            if strippedExistingLine.count < strippedNewLine.count && 
               strippedNewLine.contains(strippedExistingLine) {
                extensionsFound += 1
                // Count additional characters in the extension
                newCharsCount += (strippedNewLine.count - strippedExistingLine.count)
                return true
            }
            
            return false
        }
    }
    
    // Skip if no unique lines or extensions found
    if uniqueNewLines.isEmpty && extensionsFound == 0 {
        // Update timestamp only
        let updateSQL = "UPDATE ui_monitoring SET timestamp = ? WHERE app = ? AND window = ?;"
        var updateStmt: OpaquePointer?
        if sqlite3_prepare_v2(db, updateSQL, -1, &updateStmt, nil) == SQLITE_OK {
            sqlite3_bind_text(updateStmt, 1, timestamp, -1, SQLITE_TRANSIENT)
            sqlite3_bind_text(updateStmt, 2, sanitizedApp, -1, SQLITE_TRANSIENT)
            sqlite3_bind_text(updateStmt, 3, sanitizedWindow, -1, SQLITE_TRANSIENT)
            
            if sqlite3_step(updateStmt) != SQLITE_DONE {
                print("error updating timestamp")
            }
            sqlite3_finalize(updateStmt)
        }
        print("no new content, updated timestamp only")
        return
    }

    // Add characters from unique new lines
    newCharsCount += uniqueNewLines.reduce(0) { $0 + $1.count }
    
    // Process only if we have unique lines
    let allLines = existingLines + uniqueNewLines
    
    // Trim older lines if total length exceeds limit
    var totalChars = 0
    var startIndex = 0
    
    for (index, line) in allLines.enumerated().reversed() {
        totalChars += line.count + 1 // +1 for newline
        if totalChars > MAX_CHARS {
            startIndex = index + 1
            break
        }
    }
    
    let finalText = allLines[startIndex...].joined(separator: "\n")
    
    // Update database with different SQL based on whether record exists
    if recordExists {
        let updateSQL = """
            UPDATE ui_monitoring 
            SET timestamp = ?, text_output = ? 
            WHERE app = ? AND window = ?;
        """
        
        var updateStmt: OpaquePointer?
        if sqlite3_prepare_v2(db, updateSQL, -1, &updateStmt, nil) == SQLITE_OK {
            sqlite3_bind_text(updateStmt, 1, timestamp, -1, SQLITE_TRANSIENT)
            sqlite3_bind_text(updateStmt, 2, finalText, -1, SQLITE_TRANSIENT)
            sqlite3_bind_text(updateStmt, 3, sanitizedApp, -1, SQLITE_TRANSIENT)
            sqlite3_bind_text(updateStmt, 4, sanitizedWindow, -1, SQLITE_TRANSIENT)
            
            if sqlite3_step(updateStmt) != SQLITE_DONE {
                print("error updating row")
            }
            sqlite3_finalize(updateStmt)
        }
    } else {
        let insertSQL = """
            INSERT INTO ui_monitoring (
                timestamp, initial_traversal_at, app, window, text_output
            ) VALUES (?, ?, ?, ?, ?);
        """
        
        var insertStmt: OpaquePointer?
        if sqlite3_prepare_v2(db, insertSQL, -1, &insertStmt, nil) == SQLITE_OK {
            sqlite3_bind_text(insertStmt, 1, timestamp, -1, SQLITE_TRANSIENT)
            sqlite3_bind_text(insertStmt, 2, timestamp, -1, SQLITE_TRANSIENT) // Set initial_traversal_at same as timestamp for new records
            sqlite3_bind_text(insertStmt, 3, sanitizedApp, -1, SQLITE_TRANSIENT)
            sqlite3_bind_text(insertStmt, 4, sanitizedWindow, -1, SQLITE_TRANSIENT)
            sqlite3_bind_text(insertStmt, 5, finalText, -1, SQLITE_TRANSIENT)
            
            if sqlite3_step(insertStmt) != SQLITE_DONE {
                print("error inserting row")
            }
            sqlite3_finalize(insertStmt)
        }
    }

    let endTime = DispatchTime.now()
    let timeInterval = Double(endTime.uptimeNanoseconds - startTime.uptimeNanoseconds) / 1_000_000
    print("\(String(format: "%.2f", timeInterval))ms - saved to db for \(windowId.app)/\(String(windowId.window.prefix(30)))... (\(uniqueNewLines.count) new lines, \(extensionsFound) extensions, \(newCharsCount) new chars), skipped \(exactMatchesFound) exact matches")
}

func saveElementValues() {
    // Check both sets
    if (changedWindows.isEmpty && windowsNeedingTimestampUpdate.isEmpty) { return }
    
    let timestamp = ISO8601DateFormatter().string(from: Date())
    var totalChars = 0
    
    sqlite3_exec(screenPipeDb?.db, "BEGIN TRANSACTION", nil, nil, nil)
    
    // Process windows with content changes
    for windowId in changedWindows {
        guard let windowState = globalElementValues[windowId.app]?[windowId.window] else { continue }
        
        // Build text output
        let textOutput = buildTextOutput(from: windowState)
        totalChars += textOutput.count
        
        // Store the formatted text output in the window state
        globalElementValues[windowId.app]?[windowId.window]?.textOutput = textOutput
        
        // Save to database
        saveToDatabase(windowId: windowId, newTextOutput: textOutput, timestamp: timestamp)
    }
    
    // Process windows that only need timestamp updates
    for windowId in windowsNeedingTimestampUpdate where !changedWindows.contains(windowId) {
        saveToDatabase(windowId: windowId, newTextOutput: "", timestamp: timestamp)
    }
    
    sqlite3_exec(screenPipeDb?.db, "COMMIT", nil, nil, nil)
    
    // Clear the changed windows set
    changedWindows.removeAll()
    windowsNeedingTimestampUpdate.removeAll()
    hasChanges = false
}

// Add proper cleanup on exit
func cleanup() {
    // Indicate that cleanup has started
    synchronizationQueue.sync {
        isCleaningUp = true
    }

    // Remove observer from run loop
    if let observer = currentObserver {
        CFRunLoopRemoveSource(
            CFRunLoopGetCurrent(),
            AXObserverGetRunLoopSource(observer),
            .defaultMode
        )
        currentObserver = nil
    }

    // Clear database reference
    screenPipeDb = nil

    // Clear global state
    globalElementValues.removeAll()
    currentContext = nil
}

func pruneGlobalState() {
    let MAX_SIZE_MB = 10.0
    let MAX_SIZE_BYTES = MAX_SIZE_MB * 1024 * 1024 / 2  // Divide by 2 since String uses 2 bytes per char
    
    var totalSize = 0
    var elementsByTimestamp: [(app: String, window: String, timestamp: Date, size: Int)] = []
    
    // Calculate sizes and collect timestamps
    for (app, windows) in globalElementValues {
        for (window, windowState) in windows {
            var windowSize = 0
            for element in windowState.elements.values {
                windowSize += element.attributes.values.reduce(0) { $0 + $1.count }
            }
            totalSize += windowSize
            elementsByTimestamp.append((app, window, windowState.timestamp, windowSize))
        }
    }
    
    // If we're under the limit, no need to prune
    if Double(totalSize) <= MAX_SIZE_BYTES {
        return
    }
    
    print("pruning global state: current size \(String(format: "%.2f", Double(totalSize) * 2 / 1024 / 1024))mb")
    
    // Sort by timestamp (oldest first)
    elementsByTimestamp.sort { $0.timestamp < $1.timestamp }
    
    // Remove oldest entries until we're under the limit
    var removedSize = 0
    for entry in elementsByTimestamp {
        if Double(totalSize - removedSize) <= MAX_SIZE_BYTES {
            break
        }
        
        globalElementValues[entry.app]?[entry.window] = nil
        if globalElementValues[entry.app]?.isEmpty == true {
            globalElementValues.removeValue(forKey: entry.app)
        }
        
        removedSize += entry.size
        print("pruned \(entry.app)/\(entry.window): \(String(format: "%.2f", Double(entry.size) * 2 / 1024))kb")
    }
    
    print("pruned global state to \(String(format: "%.2f", Double(totalSize - removedSize) * 2 / 1024 / 1024))mb")
}

func measureGlobalElementValuesSize() {
    var totalElements = 0
    var totalAttributes = 0
    var totalStringLength = 0

    for (_, windows) in globalElementValues {
        for (_, windowState) in windows {
            totalElements += windowState.elements.count
            totalAttributes += windowState.elements.values.reduce(0) { $0 + $1.attributes.count }
            totalStringLength += windowState.elements.values.reduce(0) { $0 + $1.attributes.values.reduce(0) { $0 + $1.count } }
        }
    }

    let mbSize = Double(totalStringLength) * 2 / 1024.0 / 1024.0
    print("global state size: \(String(format: "%.3f", mbSize))mb")
    
    // Add pruning check
    if mbSize > 10.0 {
        pruneGlobalState()
    }
}

public class UIMonitor {
    private static var shared: UIMonitor?
    private var isRunning = false
    
    public static func getInstance() -> UIMonitor {
        if shared == nil {
            shared = UIMonitor()
        }
        return shared!
    }
    
    // Start monitoring in background
    public func start() {
        if isRunning { return }
        isRunning = true
        
        DispatchQueue.global(qos: .background).async {
            startMonitoring()
        }
    }
    
    // Stop monitoring
    public func stop() {
        if !isRunning { return }
        cleanup()
        isRunning = false
    }
    
    // Get current text output for specific app/window
    public func getCurrentOutput(app: String, window: String? = nil) -> String? {
        let appName = app.lowercased()
        
        if let windowName = window?.lowercased() {
            if let windowState = globalElementValues[appName]?[windowName] {
                return buildTextOutput(from: windowState)
            }
            return nil
        }
        
        // If no window specified, return all windows' output concatenated
        var outputs: [String] = []
        if let windows = globalElementValues[appName] {
            for (windowName, windowState) in windows {
                let output = buildTextOutput(from: windowState)
                outputs.append("Window: \(windowName)\n\(output)")
            }
        }
        return outputs.isEmpty ? nil : outputs.joined(separator: "\n---\n")
    }
    
    // Get all current apps being monitored
    public func getMonitoredApps() -> [String] {
        return Array(globalElementValues.keys)
    }
    
    // Get all windows for a specific app
    public func getWindowsForApp(_ app: String) -> [String] {
        return globalElementValues[app.lowercased()]?.keys.map { $0 } ?? []
    }
}

// Wrapper for AXUIElement
struct AXUIElementWrapper: Hashable {
    let element: AXUIElement

    func hash(into hasher: inout Hasher) {
        hasher.combine(CFHash(element))
    }

    static func == (lhs: AXUIElementWrapper, rhs: AXUIElementWrapper) -> Bool {
        return CFEqual(lhs.element, rhs.element)
    }
}

// Get the universal screenpipe database path
func getScreenPipeDbPath() -> String {
    let homeDir = FileManager.default.homeDirectoryForCurrentUser
    return homeDir.appendingPathComponent(".screenpipe/db.sqlite").path
}

// Database connection helper
class ScreenPipeDB {
    let db: OpaquePointer
    
    init() throws {
        var dbPointer: OpaquePointer?
        let dbPath = getScreenPipeDbPath()
        
        // Create directory if it doesn't exist
        let dbDir = (dbPath as NSString).deletingLastPathComponent
        try? FileManager.default.createDirectory(atPath: dbDir, withIntermediateDirectories: true)
        
        if sqlite3_open(dbPath, &dbPointer) != SQLITE_OK {
            throw NSError(domain: "db error", code: 1, 
                         userInfo: [NSLocalizedDescriptionKey: "failed to open database"])
        }
        
        guard let db = dbPointer else {
            throw NSError(domain: "db error", code: 2,
                         userInfo: [NSLocalizedDescriptionKey: "database pointer is nil"])
        }
        
        self.db = db
    }
    
    deinit {
        sqlite3_close(db)
    }
}
