# screenpipe testing guide

## overview

this document outlines the manual testing procedure for screenpipe. it's designed to verify core functionality across supported platforms and identify potential issues before release.

## test environment setup

### prerequisites
- fresh computer or vm with:
  - macos 14.0+ (apple silicon preferred) or windows 11+ (x86_64) or linux (ubuntu 22.04+)
  - minimum 8gb ram (16gb recommended)
  - minimum 30gb free disk space
- stable internet connection (minimum 10mbps)
- api access:
  - openai api key, or
  - anthropic api key, or
  - ollama running locally
- hardware:
  - screen device
  - input audio device (microphone)
  - output audio device (speakers)
- reference materials:
  - a youtube video with clear speech
  - a text document with searchable content
  - a browser with multiple tabs open

### preparation
- record your screen during testing for documentation
- close resource-intensive applications
- ensure sufficient battery/power
- back up any important data

## test procedure

### 1. installation & startup

#### fresh installation
- download latest screenpipe or build from source
- verify file hash (if available)
- install the application
  - macos: drag to applications folder
  - windows: follow installer steps
  - linux: follow distribution-specific instructions
- launch the application
- verify splash screen appears correctly
- monitor system resource usage during installation

#### permissions
- verify permission requests appear correctly
  - macos: screen recording, microphone, accessibility
  - windows: screen recording, microphone
  - linux: screen recording, microphone
- grant all permissions
- verify permissions are remembered on restart

#### onboarding
- verify onboarding flow displays correctly
- test both "skip" and "complete" paths
- verify settings from onboarding are properly saved

### 2. core functionality

#### recording status
- navigate to status page
- ensure dev mode is off
- verify initial recording status
- click stop then start
- status should turn green within 60 seconds
- verify disk usage increases as expected
- check accurate timestamps on recordings

#### screen capture
- verify all monitors are captured
- test resolution changes
- test with different display arrangements
- verify handling of multi-dpi setups
- check capture of:
  - standard applications
  - browser content
  - media playback
  - system ui elements

#### audio capture
- verify microphone input is recorded
- verify system audio output is recorded
- test with multiple audio devices
- verify volume levels are appropriate
- check audio device switching behavior

#### ocr functionality
- open a document with clear text
- verify text appears in search results
- test with different fonts and sizes
- verify handling of special characters
- test with multiple languages (if supported)

### 3. ai integration

#### configuration
- navigate to settings > ai settings
- test each supported ai provider:
  - openai (enter valid api key)
  - anthropic (enter valid api key)
  - ollama (verify connection to local instance)
- verify invalid credentials are handled gracefully
- save settings and verify persistence

#### search functionality
- navigate to main page
- enable search functionality
- perform basic text search:
  - search for text visible on screen
  - search for text spoken in audio
  - search with filters (time range, source)
- verify results accuracy and relevance
- check performance with large search corpus

### 4. meeting transcription

#### audio sources
- play test video (youtube lecture or presentation)
  - open https://youtu.be/UF8uR6Z6KLc?t=117
  - play for exactly 120 seconds
- speak into microphone simultaneously
- verify both sources are captured

#### transcription quality
- navigate to the captured meeting
- open transcript view
- verify:
  - speech recognition accuracy
  - speaker differentiation (if supported)
  - timestamps accuracy
  - handling of overlapping speech
  - punctuation and formatting

#### summaries and insights
- request meeting summary
- verify summary captures key points
- test highlight extraction (if available)
- verify action item identification (if available)
- test with meetings of different lengths

### 5. performance & stability

#### resource usage
- monitor during extended operation (30+ minutes):
  - cpu usage (should remain under 30% average)
  - memory usage (should not continuously increase)
  - disk space consumption (should be predictable)
  - network usage (should be reasonable)

#### endurance testing
- run application for 4+ hours
- perform regular interactions
- verify no degradation in performance
- check for memory leaks (increasing ram usage)
- verify disk management works correctly

#### recovery testing
- simulate unexpected conditions:
  - disconnect internet
  - disconnect audio devices
  - sleep/resume computer
  - low disk space situation
- verify graceful handling and recovery

### 6. exit & cleanup

#### application exit
- test normal exit procedure:
  - right-click system tray icon
  - select quit option
- verify all processes terminate
- verify no orphaned processes:
  - screenpipe processes
  - bun processes
  - background services

#### data management
- verify recordings are stored in expected location
- check database integrity
- verify cleanup of temporary files

## platform-specific tests

### macos
- verify sandboxing behavior
- test with different security levels
- verify notarization status
- check application behavior during os updates
- test with screen time / focus modes

### windows
- verify startup behavior
- test with different user account privilege levels
- verify compatibility with windows defender
- check behavior with multiple user accounts
- test compatibility with windows update

### linux
- verify wayland vs. x11 compatibility
- test with different desktop environments
- check file permissions and ownership
- verify systemd service behavior (if applicable)
- test with different audio systems (pulseaudio/pipewire)

## reporting results

### test results checklist
- [ ] installation successful
- [ ] permissions granted correctly
- [ ] recording status works
- [ ] screen capture functions correctly
- [ ] audio capture functions correctly
- [ ] ocr extracts text accurately
- [ ] ai configuration successful
- [ ] search and summary functional
- [ ] meeting transcription accurate
- [ ] performance within expected parameters
- [ ] clean process exit
- [ ] correct data management

### documentation
- share screen recording of test session
- note specific versions of:
  - screenpipe version
  - operating system version
  - hardware details
  - ai provider used

### issue reporting
report any failures or unexpected behavior to https://github.com/mediar-ai/screenpipe/issues with:
- detailed steps to reproduce
- expected vs. actual behavior
- system information
- relevant logs 
- screenshots or screen recordings

## troubleshooting

### common issues
- **permission problems**: verify all permissions granted in system settings
- **audio not captured**: check audio device selection and permissions
- **high cpu usage**: disable unnecessary plugins, check for conflicts
- **missing ocr**: verify language packs installed, check text visibility
- **api connection failures**: verify internet connection and api key validity
- **database errors**: check disk space, verify file permissions

### log locations
- macos: ~/.screenpipe
- windows: %USERPROFILE%\.screenpipe
- linux: ~/.screenpipe


