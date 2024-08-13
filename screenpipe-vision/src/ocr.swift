import CoreGraphics
import Foundation
import Vision
import CoreImage

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
  let processed = ciImage
    .applyingFilter("CIColorControls", parameters: [kCIInputSaturationKey: 0, kCIInputContrastKey: 1.1])
    .applyingFilter("CIGaussianBlur", parameters: [kCIInputRadiusKey: 1])
    .applyingFilter("CIColorControls", parameters: [kCIInputBrightnessKey: 0.1])
  
  guard let preprocessedCGImage = context.createCGImage(processed, from: processed.extent) else {
    return strdup("Error: Failed to create preprocessed image")
  }

  let semaphore = DispatchSemaphore(value: 0)
  var result = ""
  var textConfidences: [Float] = []

  // Slice the image horizontally with overlap
  let sliceCount = 5 // Adjust this number based on your needs
  let sliceHeight = height / sliceCount
  let overlap = Int(Float(sliceHeight) * 0.1) // 10% overlap

  for i in 0..<sliceCount {
    let sliceY = max(0, i * sliceHeight - overlap)
    let sliceHeight = min(height - sliceY, sliceHeight + overlap)
    let sliceRect = CGRect(x: 0, y: sliceY, width: width, height: sliceHeight)
    guard let sliceCGImage = preprocessedCGImage.cropping(to: sliceRect) else {
      continue
    }

    let textRequest = VNRecognizeTextRequest()
    let requestHandler = VNImageRequestHandler(cgImage: sliceCGImage, options: [:])
    
    do {
      try requestHandler.perform([textRequest])
      
      if let textObservations = textRequest.results {
        for observation in textObservations {
          if let topCandidate = observation.topCandidates(1).first {
            let adjustedBoundingBox = CGRect(
              x: observation.boundingBox.origin.x,
              y: (CGFloat(sliceY) + observation.boundingBox.origin.y * CGFloat(sliceHeight)) / CGFloat(height),
              width: observation.boundingBox.width,
              height: observation.boundingBox.height * CGFloat(sliceHeight) / CGFloat(height)
            )
            result += "\(topCandidate.string)\n" // Text: \
            // result += "Bounding Box: \(adjustedBoundingBox)\n"
            // result += "Confidence: \(topCandidate.confidence)\n\n"
            textConfidences.append(topCandidate.confidence)
          }
        }
      }
    } catch {
      print("Error processing slice \(i): \(error.localizedDescription)")
    }
  }

  // Calculate and add average confidence score for text
  let textAvg = textConfidences.isEmpty ? 0 : textConfidences.reduce(0, +) / Float(textConfidences.count)

  result += "Average Text Confidence: \(textAvg)\n"

  // Print average
  print("Text Average Confidence: \(textAvg)")

  semaphore.signal()
  semaphore.wait()

  return strdup(result.isEmpty ? "No content found" : result)
}


// # Compile for x86_64
// swiftc -emit-library -target x86_64-apple-macosx10.15 -o screenpipe-vision/lib/libscreenpipe_x86_64.dylib screenpipe-vision/src/ocr.swift

// # Compile for arm64 (aarch64)
// swiftc -emit-library -target arm64-apple-macosx11.0 -o screenpipe-vision/lib/libscreenpipe_arm64.dylib screenpipe-vision/src/ocr.swift

// # Combine into a universal binary
// lipo -create screenpipe-vision/lib/libscreenpipe_x86_64.dylib screenpipe-vision/lib/libscreenpipe_arm64.dylib -output screenpipe-vision/lib/libscreenpipe.dylib