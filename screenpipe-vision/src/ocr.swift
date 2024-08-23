import CoreGraphics
import CoreImage
import Foundation
import Vision

@available(macOS 10.15, *)
@_cdecl("perform_ocr")
public func performOCR(imageData: UnsafePointer<UInt8>, length: Int, width: Int, height: Int)
  -> UnsafeMutablePointer<CChar>? {

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

  // Apply preprocessing filters
  // Replace the current preprocessing chain with a more efficient one
  let processed =
    ciImage
    .applyingFilter(
      "CIColorControls", parameters: [kCIInputSaturationKey: 0, kCIInputContrastKey: 1.1]
    )
    .applyingFilter(
      "CIUnsharpMask", parameters: [kCIInputRadiusKey: 1.0, kCIInputIntensityKey: 0.5])
  guard let preprocessedCGImage = context.createCGImage(processed, from: processed.extent) else {
    return strdup("Error: Failed to create preprocessed image")
  }

  let semaphore = DispatchSemaphore(value: 0)
  var ocrResult = ""
  var textElements: [[String: Any]] = []
  var totalConfidence: Float = 0.0
  var observationCount: Int = 0

  // Slice the image horizontally with overlap
  let sliceCount = 5  // Adjust this number based on your needs
  let sliceHeight = height / sliceCount
  let overlap = Int(Float(sliceHeight) * 0.1)  // 10% overlap

  for i in 0..<sliceCount {
    let sliceY = max(0, i * sliceHeight - overlap)
    let sliceHeight = min(height - sliceY, sliceHeight + overlap)
    let sliceRect = CGRect(x: 0, y: sliceY, width: width, height: sliceHeight)
    guard let sliceCGImage = preprocessedCGImage.cropping(to: sliceRect) else {
      continue
    }

    let textRequest = VNRecognizeTextRequest { request, error in
      if let error = error {
        ocrResult = "Error: \(error.localizedDescription)"
        semaphore.signal()
        return
      }

      guard let observations = request.results as? [VNRecognizedTextObservation] else {
        ocrResult = "Error: Failed to process image or no text found"
        semaphore.signal()
        return
      }

      for observation in observations {
        guard let topCandidate = observation.topCandidates(1).first else {
          continue
        }
        let text = topCandidate.string
        let confidence = topCandidate.confidence
        let boundingBox = observation.boundingBox
        textElements.append([
          "text": text,
          "confidence": confidence,
          "boundingBox": [
            "x": boundingBox.origin.x,
            "y": (CGFloat(sliceY) + boundingBox.origin.y * CGFloat(sliceHeight)) / CGFloat(height),
            "width": boundingBox.size.width,
            "height": boundingBox.size.height * CGFloat(sliceHeight) / CGFloat(height)
          ]
        ])

        ocrResult += "\(text)\n"
        totalConfidence += confidence
        observationCount += 1
      }
      semaphore.signal()
    }

    textRequest.recognitionLevel = .accurate

    let handler = VNImageRequestHandler(cgImage: sliceCGImage, options: [:])
    do {
      try handler.perform([textRequest])
    } catch {
      return strdup("Error: Failed to perform OCR - \(error.localizedDescription)")
    }

    semaphore.wait()
  }

  let overallConfidence = observationCount > 0 ? totalConfidence / Float(observationCount) : 0.0
  let result: [String: Any] = [
    "ocrResult": ocrResult.isEmpty ? "No text found" : ocrResult,
    "textElements": textElements,
    "overallConfidence": overallConfidence
  ]

  if let jsonData = try? JSONSerialization.data(withJSONObject: result, options: []),
    let jsonString = String(data: jsonData, encoding: .utf8) {
    return strdup(jsonString)
  } else {
    return strdup("Error: Failed to serialize result to JSON")
  }
}

/*
Compile for multi arch:

swiftc -emit-library -target x86_64-apple-macosx11.0 -o screenpipe-vision/lib/libscreenpipe_x86_64.dylib screenpipe-vision/src/ocr.swift -framework Metal -framework MetalPerformanceShaders -framework Vision -framework CoreImage \
&& swiftc -emit-library -target arm64-apple-macosx11.0 -o screenpipe-vision/lib/libscreenpipe_arm64.dylib screenpipe-vision/src/ocr.swift -framework Metal -framework MetalPerformanceShaders -framework Vision -framework CoreImage \
&& lipo -create screenpipe-vision/lib/libscreenpipe_x86_64.dylib screenpipe-vision/lib/libscreenpipe_arm64.dylib -output screenpipe-vision/lib/libscreenpipe.dylib

*/
