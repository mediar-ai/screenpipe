import CoreGraphics
import Foundation
import Vision
import CoreImage

func captureWindow(windowID: Int) -> CGImage? {
    let windowImage = CGWindowListCreateImage(
        CGRect.null,
        .optionIncludingWindow,
        CGWindowID(windowID),
        [.bestResolution]
    )
    return windowImage
}

@available(macOS 10.15, *)
@_cdecl("perform_ocr")
public func performOCR(imageData: UnsafePointer<UInt8>, length: Int, width: Int, height: Int, windowID: Int) -> UnsafeMutablePointer<CChar>? {
    // Hardcode lightProcessing value
    let lightProcessing = true  // Set this to true for light processing, false for full processing

    // Create CGImage from raw data
    let dataProvider = CGDataProvider(dataInfo: nil, data: imageData, size: length) { _, _, _ in }
    guard let xcapImage = CGImage(
        width: width,
        height: height,
        bitsPerComponent: 8,
        bitsPerPixel: 32,
        bytesPerRow: width * 4,
        space: CGColorSpaceCreateDeviceRGB(),
        bitmapInfo: CGBitmapInfo(rawValue: CGImageAlphaInfo.premultipliedLast.rawValue),
        provider: dataProvider!,
        decode: nil,
        shouldInterpolate: true,
        intent: .defaultIntent
    ) else {
        return strdup("Error: Failed to create CGImage from raw data")
    }

    // Capture the window image using the window ID
    guard let windowImage = captureWindow(windowID: windowID) else {
        return strdup("Error: Failed to capture window screenshot")
    }

    let finalOCRResult: [String: Any]

    if lightProcessing {
        finalOCRResult = processImageForOCRLight(image: xcapImage)
    } else {
        // Process both images separately
        let xcapOCRResult = processImageForOCR(image: xcapImage)
        let windowOCRResult = processImageForOCR(image: windowImage)

        // Compare results and keep the one with higher confidence
        finalOCRResult = compareOCRResults(result1: xcapOCRResult, result2: windowOCRResult)
    }

    var result = finalOCRResult
    result["window_id"] = windowID // Include window ID in the result

    if let jsonData = try? JSONSerialization.data(withJSONObject: result, options: []),
       let jsonString = String(data: jsonData, encoding: .utf8) {
        return strdup(jsonString)
    } else {
        return strdup("Error: Failed to serialize result to JSON")
    }
}

func processImageForOCRLight(image: CGImage) -> [String: Any] {
    // Preprocess the image
    let ciImage = CIImage(cgImage: image)
    let context = CIContext(options: nil)
    
    // Apply minimal preprocessing filters
    let processed = ciImage
        .applyingFilter("CIColorControls", parameters: [kCIInputSaturationKey: 0, kCIInputContrastKey: 1.05])
    
    guard let preprocessedCGImage = context.createCGImage(processed, from: processed.extent) else {
        return ["error": "Failed to create preprocessed image"]
    }

    var ocrResult = ""
    var textElements: [[String: Any]] = []
    var totalConfidence: Float = 0.0
    var observationCount: Int = 0

    let textRequest = VNRecognizeTextRequest()
    textRequest.recognitionLevel = .fast // Use fast recognition for light processing
    let requestHandler = VNImageRequestHandler(cgImage: preprocessedCGImage, options: [:])
    
    do {
        try requestHandler.perform([textRequest])
        
        if let textObservations = textRequest.results {
            for observation in textObservations {
                if let topCandidate = observation.topCandidates(1).first {
                    let text = topCandidate.string
                    let confidence = topCandidate.confidence
                    
                    textElements.append([
                        "text": text,
                        "confidence": confidence,
                        "boundingBox": [
                            "x": observation.boundingBox.origin.x,
                            "y": observation.boundingBox.origin.y,
                            "width": observation.boundingBox.width,
                            "height": observation.boundingBox.height
                        ]
                    ])

                    ocrResult += "\(text)\n"
                    totalConfidence += confidence
                    observationCount += 1
                }
            }
        }
    } catch {
        print("Error processing image: \(error.localizedDescription)")
    }

    let overallConfidence = observationCount > 0 ? totalConfidence / Float(observationCount) : 0.0
    
    return [
        "ocrResult": ocrResult.isEmpty ? NSNull() : ocrResult,
        "textElements": textElements,
        "overallConfidence": overallConfidence
    ]
}

func processImageForOCR(image: CGImage) -> [String: Any] {
    // Preprocess the image
    let ciImage = CIImage(cgImage: image)
    let context = CIContext(options: nil)
    
    // Apply preprocessing filters
    let processed = ciImage
        .applyingFilter("CIColorControls", parameters: [kCIInputSaturationKey: 0, kCIInputContrastKey: 1.1])
        .applyingFilter("CIGaussianBlur", parameters: [kCIInputRadiusKey: 1])
        .applyingFilter("CIColorControls", parameters: [kCIInputBrightnessKey: 0.1])
    
    guard let preprocessedCGImage = context.createCGImage(processed, from: processed.extent) else {
        return ["error": "Failed to create preprocessed image"]
    }

    var ocrResult = ""
    var textElements: [[String: Any]] = []
    var totalConfidence: Float = 0.0
    var observationCount: Int = 0

    // Slice the image horizontally with overlap
    let sliceCount = 5 // Adjust this number based on your needs
    let sliceHeight = preprocessedCGImage.height / sliceCount
    let overlap = Int(Float(sliceHeight) * 0.1) // 10% overlap

    for i in 0..<sliceCount {
        let sliceY = max(0, i * sliceHeight - overlap)
        let sliceHeight = min(preprocessedCGImage.height - sliceY, sliceHeight + overlap)
        let sliceRect = CGRect(x: 0, y: sliceY, width: preprocessedCGImage.width, height: sliceHeight)
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
                            y: (CGFloat(sliceY) + observation.boundingBox.origin.y * CGFloat(sliceHeight)) / CGFloat(preprocessedCGImage.height),
                            width: observation.boundingBox.width,
                            height: observation.boundingBox.height * CGFloat(sliceHeight) / CGFloat(preprocessedCGImage.height)
                        )
                        let text = topCandidate.string
                        let confidence = topCandidate.confidence
                        
                        textElements.append([
                            "text": text,
                            "confidence": confidence,
                            "boundingBox": [
                                "x": adjustedBoundingBox.origin.x,
                                "y": adjustedBoundingBox.origin.y,
                                "width": adjustedBoundingBox.width,
                                "height": adjustedBoundingBox.height
                            ]
                        ])

                        ocrResult += "\(text)\n"
                        totalConfidence += confidence
                        observationCount += 1
                    }
                }
            }
        } catch {
            print("Error processing slice \(i): \(error.localizedDescription)")
        }
    }

    let overallConfidence = observationCount > 0 ? totalConfidence / Float(observationCount) : 0.0
    
    return [
        "ocrResult": ocrResult.isEmpty ? NSNull() : ocrResult,
        "textElements": textElements,
        "overallConfidence": overallConfidence
    ]
}

func compareOCRResults(result1: [String: Any], result2: [String: Any]) -> [String: Any] {
    guard let textElements1 = result1["textElements"] as? [[String: Any]],
          let textElements2 = result2["textElements"] as? [[String: Any]] else {
        return ["error": "Invalid OCR results"]
    }

    var finalTextElements: [[String: Any]] = []
    var finalOCRResult = ""
    var totalConfidence: Float = 0.0
    var observationCount: Int = 0

    for (element1, element2) in zip(textElements1, textElements2) {
        let confidence1 = element1["confidence"] as? Float ?? 0.0
        let confidence2 = element2["confidence"] as? Float ?? 0.0

        if confidence1 >= confidence2 {
            finalTextElements.append(element1)
            finalOCRResult += "\(element1["text"] as? String ?? "")\n"
            totalConfidence += confidence1
        } else {
            finalTextElements.append(element2)
            finalOCRResult += "\(element2["text"] as? String ?? "")\n"
            totalConfidence += confidence2
        }
        observationCount += 1
    }

    let overallConfidence = observationCount > 0 ? totalConfidence / Float(observationCount) : 0.0

    return [
        "ocrResult": finalOCRResult.isEmpty ? NSNull() : finalOCRResult,
        "textElements": finalTextElements,
        "overallConfidence": overallConfidence
    ]
}

// # Compile for x86_64
// swiftc -emit-library -target x86_64-apple-macosx10.15 -o screenpipe-vision/lib/libscreenpipe_x86_64.dylib screenpipe-vision/src/ocr.swift
// # Compile for arm64 (aarch64)
// swiftc -emit-library -target arm64-apple-macosx11.0 -o screenpipe-vision/lib/libscreenpipe_arm64.dylib screenpipe-vision/src/ocr.swift
// # Combine into a universal binary
// lipo -create screenpipe-vision/lib/libscreenpipe_x86_64.dylib screenpipe-vision/lib/libscreenpipe_arm64.dylib -output screenpipe-vision/lib/libscreenpipe.dylib