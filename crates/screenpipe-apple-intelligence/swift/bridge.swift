// screenpipe-apple-intelligence Swift bridge
// Provides C-callable functions that wrap Apple's Foundation Models framework.
// Compiled by build.rs → linked into the Rust crate.

import Foundation
import FoundationModels

// MARK: - Memory helpers

private func getResidentMemory() -> UInt64 {
    var info = mach_task_basic_info()
    var count = mach_msg_type_number_t(MemoryLayout<mach_task_basic_info>.size) / 4
    let result = withUnsafeMutablePointer(to: &info) {
        $0.withMemoryRebound(to: integer_t.self, capacity: Int(count)) {
            task_info(mach_task_self_, task_flavor_t(MACH_TASK_BASIC_INFO), $0, &count)
        }
    }
    return result == KERN_SUCCESS ? UInt64(info.resident_size) : 0
}

private func makeCString(_ str: String) -> UnsafeMutablePointer<CChar> {
    return strdup(str)!
}

// MARK: - Exported C functions

/// Check if Foundation Models is available.
/// Returns status code: 0=available, 1=not enabled, 2=not eligible, 3=not ready, 4=unknown
/// Writes reason string to `out_reason` (caller must free with fm_free_string).
@_cdecl("fm_check_availability")
public func fmCheckAvailability(
    _ out_reason: UnsafeMutablePointer<UnsafeMutablePointer<CChar>?>
) -> Int32 {
    let model = SystemLanguageModel.default

    switch model.availability {
    case .available:
        out_reason.pointee = makeCString("available")
        return 0
    case .unavailable(let reason):
        switch reason {
        case .appleIntelligenceNotEnabled:
            out_reason.pointee = makeCString("Apple Intelligence is not enabled")
            return 1
        case .deviceNotEligible:
            out_reason.pointee = makeCString("Device not eligible for Apple Intelligence")
            return 2
        case .modelNotReady:
            out_reason.pointee = makeCString("Model not ready (still downloading or configuring)")
            return 3
        @unknown default:
            out_reason.pointee = makeCString("Unknown unavailability reason")
            return 4
        }
    }
}

/// Free a string allocated by the Swift side.
@_cdecl("fm_free_string")
public func fmFreeString(_ ptr: UnsafeMutablePointer<CChar>?) {
    if let ptr = ptr { free(ptr) }
}

/// Generate a plain text response from a prompt.
///
/// Parameters:
///   - instructions: system instructions (nullable)
///   - prompt: user prompt (required)
///   - out_text: receives response text (caller frees)
///   - out_error: receives error message on failure (caller frees)
///   - out_total_time_ms: receives total generation time
///   - out_mem_before: receives resident memory before (bytes)
///   - out_mem_after: receives resident memory after (bytes)
///
/// Returns 0 on success, -1 on error.
@_cdecl("fm_generate_text")
public func fmGenerateText(
    _ instructions: UnsafePointer<CChar>?,
    _ prompt: UnsafePointer<CChar>?,
    _ out_text: UnsafeMutablePointer<UnsafeMutablePointer<CChar>?>,
    _ out_error: UnsafeMutablePointer<UnsafeMutablePointer<CChar>?>,
    _ out_total_time_ms: UnsafeMutablePointer<Double>,
    _ out_mem_before: UnsafeMutablePointer<UInt64>,
    _ out_mem_after: UnsafeMutablePointer<UInt64>
) -> Int32 {
    guard let prompt = prompt else {
        out_error.pointee = makeCString("prompt is null")
        return -1
    }

    let promptStr = String(cString: prompt)
    let instructionsStr = instructions.map { String(cString: $0) }

    let semaphore = DispatchSemaphore(value: 0)
    var status: Int32 = 0

    Task {
        let memBefore = getResidentMemory()
        out_mem_before.pointee = memBefore
        let startTime = ContinuousClock.now

        do {
            let session: LanguageModelSession
            if let inst = instructionsStr {
                session = LanguageModelSession(instructions: inst)
            } else {
                session = LanguageModelSession()
            }

            let response = try await session.respond(to: promptStr)
            let totalDuration = ContinuousClock.now - startTime
            let memAfter = getResidentMemory()

            out_text.pointee = makeCString(response.content)
            out_total_time_ms.pointee = Double(totalDuration.components.seconds) * 1000.0
                + Double(totalDuration.components.attoseconds) / 1_000_000_000_000_000.0
            out_mem_after.pointee = memAfter
            status = 0
        } catch {
            out_error.pointee = makeCString(error.localizedDescription)
            status = -1
        }

        semaphore.signal()
    }

    semaphore.wait()
    return status
}

/// Generate a structured JSON response using a JSON schema string.
///
/// The schema constrains the model output. The response is a JSON string
/// derived from GeneratedContent's debug description (since GeneratedContent
/// is not directly Encodable).
///
/// Returns 0 on success, -1 on error.
@_cdecl("fm_generate_json")
public func fmGenerateJson(
    _ instructions: UnsafePointer<CChar>?,
    _ prompt: UnsafePointer<CChar>?,
    _ jsonSchema: UnsafePointer<CChar>?,
    _ out_text: UnsafeMutablePointer<UnsafeMutablePointer<CChar>?>,
    _ out_error: UnsafeMutablePointer<UnsafeMutablePointer<CChar>?>,
    _ out_total_time_ms: UnsafeMutablePointer<Double>,
    _ out_mem_before: UnsafeMutablePointer<UInt64>,
    _ out_mem_after: UnsafeMutablePointer<UInt64>
) -> Int32 {
    guard let prompt = prompt else {
        out_error.pointee = makeCString("prompt is null")
        return -1
    }
    guard let jsonSchema = jsonSchema else {
        out_error.pointee = makeCString("jsonSchema is null")
        return -1
    }

    let promptStr = String(cString: prompt)
    let instructionsStr = instructions.map { String(cString: $0) }
    let schemaStr = String(cString: jsonSchema)

    let semaphore = DispatchSemaphore(value: 0)
    var status: Int32 = 0

    Task {
        let memBefore = getResidentMemory()
        out_mem_before.pointee = memBefore
        let startTime = ContinuousClock.now

        do {
            guard let schemaData = schemaStr.data(using: .utf8) else {
                out_error.pointee = makeCString("Failed to encode schema as UTF-8")
                status = -1
                semaphore.signal()
                return
            }

            let schemaObj = try JSONDecoder().decode(GenerationSchema.self, from: schemaData)

            let session: LanguageModelSession
            if let inst = instructionsStr {
                session = LanguageModelSession(instructions: inst)
            } else {
                session = LanguageModelSession()
            }

            let response = try await session.respond(
                to: promptStr,
                schema: schemaObj
            )

            let totalDuration = ContinuousClock.now - startTime
            let memAfter = getResidentMemory()

            // GeneratedContent has a built-in .jsonString property
            let jsonStr = response.content.jsonString

            out_text.pointee = makeCString(jsonStr)
            out_total_time_ms.pointee = Double(totalDuration.components.seconds) * 1000.0
                + Double(totalDuration.components.attoseconds) / 1_000_000_000_000_000.0
            out_mem_after.pointee = memAfter
            status = 0
        } catch {
            out_error.pointee = makeCString(error.localizedDescription)
            status = -1
        }

        semaphore.signal()
    }

    semaphore.wait()
    return status
}

// No manual JSON conversion needed — GeneratedContent has .jsonString built-in

/// Prewarm the model (loads assets into memory). Blocking call.
/// Returns 0 on success, non-zero on error.
@_cdecl("fm_prewarm")
public func fmPrewarm() -> Int32 {
    let model = SystemLanguageModel.default
    guard model.availability == .available else { return -1 }

    let session = LanguageModelSession()
    session.prewarm()
    return 0
}

/// Get supported languages as a JSON array string. Caller must free.
@_cdecl("fm_supported_languages")
public func fmSupportedLanguages() -> UnsafeMutablePointer<CChar> {
    let model = SystemLanguageModel.default
    let langs = model.supportedLanguages.map { $0.languageCode?.identifier ?? "unknown" }
    guard let data = try? JSONEncoder().encode(langs),
          let str = String(data: data, encoding: .utf8) else {
        return makeCString("[]")
    }
    return makeCString(str)
}
