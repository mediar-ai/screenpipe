# screenpipe testing procedure

### prerequisites
- fresh computer or VM with:
  - macos 14.0+ (m series) or windows 11+ (x86_64)
  - minimum 8gb ram
  - minimum 30gb free disk space
- stable internet connection
- openai api key or anthropic api key or ollama running on your machine
- access to youtube
- screen device
- input audio device
- output audio device
- record your screen before starting the test

### installation
1. download latest screenpipe from https://web.crabnebula.cloud/mediar/screenpipe/releases
2. install and launch the app
3. skip the onboarding flow

### core functionality test
1. check recording status
   - go to status page
   - ensure dev mode is off
   - click stop then start
   - status should turn green within 60 seconds

2. configure ai
   - navigate to settings > ai settings
   - enter openai api key (or anthropic api key or ollama running on your machine)
   - save settings

3. test search functionality
   - go to main page
   - enable search
   - type "screenpipe" in search bar
   - set time range to last 30 minutes
   - press enter
   - request summary
   - verify summary accurately reflects app usage

### meeting transcription test
1. play test video
   - open https://youtu.be/UF8uR6Z6KLc?t=117
   - play for exactly 120 seconds

2. verify transcription
   - return to screenpipe main page
   - click on meeting
   - open transcript
   - request summary
   - verify accuracy of transcription and summary
   - verify both your input and output audio devices have been used (2 check boxes should be checked with the name of your devices)

### clean exit test
1. close application
   - right click screenpipe icon in system tray
   - select quit

2. verify process cleanup
   - open activity monitor (macos) or task manager (windows)
   - search for "screenpipe"
   - verify no screenpipe processes running
   - search for "bun"
   - verify no bun processes running

### test results
- [ ] installation successful
- [ ] recording status works
- [ ] ai configuration successful
- [ ] search and summary functional
- [ ] meeting transcription accurate
- [ ] audio devices used
- [ ] clean process exit
- [ ] share screen recording

report any failures or unexpected behavior to https://github.com/mediar-ai/screenpipe/issues
