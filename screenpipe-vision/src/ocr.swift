import CoreGraphics
import Foundation
import Vision

@_cdecl("perform_ocr")
public func performOCR(imageData: UnsafePointer<UInt8>, length: Int, width: Int, height: Int)
  -> UnsafeMutablePointer<CChar>? {

  print("Attempting to create image from raw data")
  print("Image dimensions: \(width)x\(height)")

  guard let dataProvider = CGDataProvider(data: Data(bytes: imageData, count: length) as CFData)
  else {
    print("Failed to create CGDataProvider.")
    return strdup("Error: Failed to create CGDataProvider")
  }

  guard
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
    print("Failed to create CGImage.")
    return strdup("Error: Failed to create CGImage")
  }

  print("CGImage created successfully.")

  let semaphore = DispatchSemaphore(value: 0)
  var ocrResult = ""

  let request = VNRecognizeTextRequest { request, error in
    defer { semaphore.signal() }

    if let error = error {
      print("Error in text recognition request: \(error)")
      ocrResult = "Error: \(error.localizedDescription)"
      return
    }

    guard let observations = request.results as? [VNRecognizedTextObservation] else {
      print("Failed to process image or no text found.")
      ocrResult = "Error: Failed to process image or no text found"
      return
    }

    print("Number of text observations: \(observations.count)")

    for (index, observation) in observations.enumerated() {
      guard let topCandidate = observation.topCandidates(1).first else {
        print("No top candidate for observation \(index)")
        continue
      }
      ocrResult += "\(topCandidate.string)\n"
    }
  }

  request.recognitionLevel = .accurate

  let handler = VNImageRequestHandler(cgImage: cgImage, options: [:])
  do {
    print("Performing OCR...")
    try handler.perform([request])
  } catch {
    print("Failed to perform OCR: \(error)")
    return strdup("Error: Failed to perform OCR - \(error.localizedDescription)")
  }

  semaphore.wait()

  return strdup(ocrResult.isEmpty ? "No text found" : ocrResult)
}

// swiftc -emit-library -o screenpipe-vision/lib/libocr.dylib screenpipe-vision/src/ocr.swift
// or
// swiftc -emit-library -o /usr/local/lib/libocr.dylib screenpipe-vision/src/ocr.swift
