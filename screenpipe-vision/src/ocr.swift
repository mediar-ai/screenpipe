import CoreGraphics
import CoreImage
import Foundation
import Vision

// TODO: how can we use Metal to speed this up?

@available(macOS 10.15, *)
@_cdecl("perform_ocr")
public func performOCR(imageData: UnsafePointer<UInt8>, length: Int, width: Int, height: Int)
  -> UnsafeMutablePointer<CChar>? {
  return autoreleasepool {

    guard let dataProvider = CGDataProvider(data: Data(bytes: imageData, count: length) as CFData),
      let cgImage = CGImage(
        width: width,
        height: height,
        bitsPerComponent: 8,
        bitsPerPixel: 32,
        bytesPerRow: width * 4,
        space: CGColorSpaceCreateDeviceRGB(),
        bitmapInfo: CGBitmapInfo(rawValue: CGImageAlphaInfo.premultipliedLast.rawValue),
        provider: dataProvider,
        decode: nil,
        shouldInterpolate: false,
        intent: .defaultIntent
      )
    else {
      return strdup("Error: Failed to create CGImage")
    }

    // Preprocess the image
    let ciImage = CIImage(cgImage: cgImage)
    let context = CIContext(options: nil)

    // Apply preprocessing filters (slightly reduced contrast compared to original)
    // let processed =
    //   ciImage
    //   .applyingFilter(
        // "CIColorControls", parameters: [kCIInputContrastKey: 1.2]
    //   )
    //   .applyingFilter(
    //     "CIUnsharpMask", parameters: [kCIInputRadiusKey: 0.5, kCIInputIntensityKey: 0.7])
    let processed = ciImage
  
    guard let preprocessedCGImage = context.createCGImage(ciImage, from: ciImage.extent) else {
      return strdup("Error: Failed to create preprocessed image")
    }

    var ocrResult = ""
    var textElements: [[String: Any]] = []
    var totalConfidence: Float = 0.0
    var observationCount: Int = 0

    let textRequest = VNRecognizeTextRequest { request, error in
      if let error = error {
        print("Error: \(error.localizedDescription)")
        return
      }

      guard let observations = request.results as? [VNRecognizedTextObservation] else {
        print("Error: Failed to process image or no text found")
        return
      }

      for observation in observations {
        guard let topCandidate = observation.topCandidates(1).first else {
          continue
        }
        let text = topCandidate.string
        let confidence = topCandidate.confidence

        // Reduced threshold for including results
        if confidence < 0.2 {
          continue  // Skip very low-confidence results
        }
        let boundingBox = observation.boundingBox
        textElements.append([
          "text": text,
          "confidence": confidence,
          "boundingBox": [
            "x": boundingBox.origin.x,
            "y": boundingBox.origin.y,
            "width": boundingBox.size.width,
            "height": boundingBox.size.height
          ]
        ])

        ocrResult += "\(text)\n"
        totalConfidence += confidence
        observationCount += 1
      }
    }

    textRequest.recognitionLanguages = ["zh-Hans", "zh-Hant", "en-US"]
    textRequest.recognitionLevel = .accurate
    textRequest.usesLanguageCorrection = true

    let handler = VNImageRequestHandler(cgImage: preprocessedCGImage, options: [:])
    do {
      try handler.perform([textRequest])
    } catch {
      print("Error: Failed to perform OCR - \(error.localizedDescription)")
    }

    let overallConfidence = observationCount > 0 ? totalConfidence / Float(observationCount) : 0.0
    // print("Overall confidence: \(overallConfidence)")
    let result: [String: Any] = [
      "ocrResult": ocrResult.isEmpty ? NSNull() : ocrResult,
      "textElements": textElements,
      "overallConfidence": overallConfidence
    ]

    if let jsonData = try? JSONSerialization.data(withJSONObject: result, options: []),
      let jsonString = String(data: jsonData, encoding: .utf8) {
      let cString = jsonString.cString(using: .utf8)
      let buffer = UnsafeMutablePointer<Int8>.allocate(capacity: cString!.count)
      buffer.initialize(from: cString!, count: cString!.count)
      return buffer
    } else {
      let errorString = "Error: Failed to serialize result to JSON"
      let cString = errorString.cString(using: .utf8)!
      let buffer = UnsafeMutablePointer<Int8>.allocate(capacity: cString.count)
      buffer.initialize(from: cString, count: cString.count)
      return buffer
    }
  }
}

@_cdecl("free_string")
public func freeString(_ ptr: UnsafeMutablePointer<Int8>?) {
  if let ptr = ptr {
    ptr.deallocate()
  }
}

/*
Compile for multi arch:

swiftc -emit-library -target x86_64-apple-macosx11.0 -o screenpipe-vision/lib/libscreenpipe_x86_64.dylib screenpipe-vision/src/ocr.swift -framework Metal -framework MetalPerformanceShaders -framework Vision -framework CoreImage \
&& swiftc -emit-library -target arm64-apple-macosx11.0 -o screenpipe-vision/lib/libscreenpipe_arm64.dylib screenpipe-vision/src/ocr.swift -framework Metal -framework MetalPerformanceShaders -framework Vision -framework CoreImage \
&& lipo -create screenpipe-vision/lib/libscreenpipe_x86_64.dylib screenpipe-vision/lib/libscreenpipe_arm64.dylib -output screenpipe-vision/lib/libscreenpipe.dylib

atm dirty hack: cp screenpipe-vision/lib* /usr/local/lib

How to optimise this code:

1. run cargo bench --bench ocr_benchmark
2. change the code & compile again
3. run cargo bench --bench ocr_benchmark again to see if it's faster or more accurate
*/
