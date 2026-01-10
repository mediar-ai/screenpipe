#!/bin/bash
# Script to validate README.md changes in PRs
# Checks for common issues like accidental LLM output or significant content removal

set -e

PR_NUMBER="${1:-2022}"

echo "=== Validating PR #$PR_NUMBER README.md changes ==="

# Get the diff for README.md
DIFF=$(gh pr diff "$PR_NUMBER" -- README.md 2>/dev/null || echo "")

if [ -z "$DIFF" ]; then
    echo "No README.md changes in this PR"
    exit 0
fi

# Check for suspicious patterns indicating LLM debug output
SUSPICIOUS_PATTERNS=(
    "</think>"
    "思维过程"
    "物理补丁"
    "I need to"
    "Let me"
    "I should"
    "I'll"
    "Okay, I"
)

echo ""
echo "Checking for suspicious LLM output patterns..."

ISSUES_FOUND=0

for pattern in "${SUSPICIOUS_PATTERNS[@]}"; do
    if echo "$DIFF" | grep -q "$pattern"; then
        echo "  WARNING: Found suspicious pattern: '$pattern'"
        ISSUES_FOUND=$((ISSUES_FOUND + 1))
    fi
done

# Check for significant deletions
DELETIONS=$(echo "$DIFF" | grep -c "^-" || true)
ADDITIONS=$(echo "$DIFF" | grep -c "^+" || true)

echo ""
echo "Change statistics:"
echo "  Additions: $ADDITIONS lines"
echo "  Deletions: $DELETIONS lines"

if [ "$DELETIONS" -gt 100 ]; then
    echo "  WARNING: Large number of deletions ($DELETIONS lines)"
    ISSUES_FOUND=$((ISSUES_FOUND + 1))
fi

# Check if critical sections are removed
CRITICAL_SECTIONS=(
    "get.screenpi.pe"
    "installation"
    "Discord"
    "contributing"
)

echo ""
echo "Checking if critical sections are preserved..."

for section in "${CRITICAL_SECTIONS[@]}"; do
    if echo "$DIFF" | grep -q "^-.*$section"; then
        if ! echo "$DIFF" | grep -q "^+.*$section"; then
            echo "  WARNING: Critical section may be removed: '$section'"
            ISSUES_FOUND=$((ISSUES_FOUND + 1))
        fi
    fi
done

echo ""
if [ "$ISSUES_FOUND" -gt 0 ]; then
    echo "=== VALIDATION FAILED: $ISSUES_FOUND issue(s) found ==="
    echo "This PR should be manually reviewed before merging."
    exit 1
else
    echo "=== VALIDATION PASSED ==="
    exit 0
fi
