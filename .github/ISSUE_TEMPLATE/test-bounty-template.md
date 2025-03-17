---
title: Testing Bounty for PR #${{ env.PR_NUMBER }}
assignees: ''
---

# 🧪 Testing Bounty for PR #${{ env.PR_NUMBER }}

/bounty 20

## overview

this is a testing bounty for [PR #${{ env.PR_NUMBER }}: ${{ env.PR_TITLE }}](${{ env.PR_URL }}) by @${{ env.PR_AUTHOR }}. we're looking for thorough testing across different environments to ensure the changes work as expected.

## important links

- [testing guide](https://github.com/mediar-ai/screenpipe/blob/main/TESTING.md)
- [pull request #${{ env.PR_NUMBER }}](${{ env.PR_URL }})

## testing instructions

please follow our [testing guide](https://github.com/mediar-ai/screenpipe/blob/main/TESTING.md) and focus on the areas affected by this PR.

### how to participate

1. comment on this issue to claim the bounty
2. test the changes following our testing guide
3. report your results in this issue
4. each valid test report will receive a $20 bounty (multiple testers welcome!)

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
