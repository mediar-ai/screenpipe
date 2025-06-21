# Screenpipe OCR Filtering Testing Plan

## Bounty Information
- **Issue**: https://github.com/mediar-ai/screenpipe/issues/1817
- **PR**: https://github.com/mediar-ai/screenpipe/pull/1816
- **Amount**: $20
- **Tester**: @Jarrodsz
- **Date**: 2025-06-21T10:38:41.433Z

## Test Environment
- **OS**: darwin arm64
- **Node.js**: v24.2.0
- **Repository**: mediar-ai/screenpipe
- **Branch**: pr-1816

## Features Under Test
### OCR Text Filtering Implementation
1. **Function**: `should_hide_content()`
   - Input: OCR text string
   - Output: Boolean indicating if content should be hidden
   - Expected: Detects sensitive keywords (case-insensitive)

2. **Function**: `create_censored_image()`
   - Input: Image data
   - Output: Black censored image
   - Expected: Generates proper redacted placeholder

3. **API Endpoints with Filtering**:
   - `/search` - Search results with OCR filtering
   - `/frames/:frame_id` - Frame data with content hiding  
   - `/stream/frames` - WebSocket streaming with real-time filtering

4. **CLI Configuration**:
   - `hide_window_texts` option for keyword configuration
   - Expected: Properly configures filtering keywords

## Test Scenarios

### 1. Functional Testing
- [ ] Keyword detection accuracy
- [ ] Case-insensitive matching
- [ ] Content redaction functionality
- [ ] API endpoint integration
- [ ] WebSocket streaming filtering
- [ ] CLI configuration

### 2. Security Testing  
- [ ] Sensitive data properly hidden
- [ ] No data leakage in responses
- [ ] Censored images contain no original data
- [ ] Logging doesn't expose sensitive content

### 3. Performance Testing
- [ ] Response time impact measurement
- [ ] Memory usage analysis
- [ ] Streaming performance validation
- [ ] Large keyword list handling

### 4. Edge Cases
- [ ] Empty keyword list
- [ ] Special characters in keywords
- [ ] Unicode content handling
- [ ] Very large content processing
- [ ] Error handling validation

## Success Criteria
- All functional tests pass
- Security requirements validated
- Performance impact acceptable (<20% overhead)
- Professional documentation provided
- Constructive feedback delivered

## Deliverables
1. Test execution results (PASS/FAIL for each scenario)
2. Screenshots of key functionality
3. Performance metrics
4. Security validation results
5. Bug reports (if any)
6. Improvement recommendations
7. Complete evidence package
