---
title: Testing Bounty for Release v${{ env.VERSION }}
assignees: ''
---

# 🧪 testing bounty for release v${{ env.VERSION }}

/bounty 20

## overview

this is a testing bounty for screenpipe release v${{ env.VERSION }}. we're looking for thorough testing across different environments to ensure this new release works as expected.

## important links

- [testing guide](https://github.com/mediar-ai/screenpipe/blob/main/TESTING.md)
- [release download](${{ env.RELEASE_URL }})

## testing instructions

please follow our [testing guide](https://github.com/mediar-ai/screenpipe/blob/main/TESTING.md) and focus on testing core functionality in the new release.

### how to participate

1. comment on this issue to claim the bounty
2. download and install the release from the link above
3. test the release following our testing guide
4. report your results in this issue
5. each valid test report will receive a $20 bounty (multiple testers welcome!)

### testing requirements

please include the following in your test report:

- [ ] your testing environment details (os, hardware, etc.)
- [ ] steps you followed for testing
- [ ] results of each test with screenshots/recordings
- [ ] any issues encountered
- [ ] system logs if relevant

## submission format

### environment details
```
os: 
version: 
cpu: 
ram: 
other relevant details:
```

### test results checklist
- [ ] installation successful
- [ ] permissions granted correctly
- [ ] recording status works
- [ ] screen capture functions correctly
- [ ] audio capture functions correctly
- [ ] performance within expected parameters

### evidence

please attach:
- screen recordings of your testing process
- screenshots of important behavior
- logs if there were issues (from ~/.screenpipe or equivalent)

## bounty rules

- multiple testers can receive the bounty ($20 each)
- testing should be thorough and follow the guide
- bounties will be paid through algora
- test reports must be submitted within 7 days of this issue

thank you for helping make screenpipe better! 
