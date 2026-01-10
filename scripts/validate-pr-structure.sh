#!/bin/bash
#
# validate-pr-structure.sh
#
# Validates that a PR doesn't have structural issues like mass file deletions
# that indicate the branch was created incorrectly.
#
# Usage: ./validate-pr-structure.sh <PR_NUMBER> [REPO]
#
# Exit codes:
#   0 - PR structure is valid
#   1 - PR has structural issues (mass deletions detected)
#   2 - Invalid arguments or API error

set -e

# Default repository
DEFAULT_REPO="mediar-ai/screenpipe"

# Thresholds for detecting problematic PRs
MAX_DELETION_RATIO=10  # Max deletions:additions ratio before warning
MAX_DELETIONS_ABSOLUTE=10000  # Absolute max deletions before critical warning
MIN_ADDITIONS_FOR_RATIO=10  # Minimum additions before applying ratio check

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Parse arguments
PR_NUMBER="$1"
REPO="${2:-$DEFAULT_REPO}"

if [[ -z "$PR_NUMBER" ]]; then
    echo "Usage: $0 <PR_NUMBER> [REPO]"
    echo "Example: $0 2032 mediar-ai/screenpipe"
    exit 2
fi

echo "========================================"
echo "PR Structure Validator"
echo "========================================"
echo "Validating PR #${PR_NUMBER} in ${REPO}"
echo ""

# Fetch PR statistics
echo "Fetching PR statistics..."
PR_DATA=$(gh pr view "$PR_NUMBER" --repo "$REPO" --json additions,deletions,changedFiles,title,state 2>&1)

if [[ $? -ne 0 ]]; then
    echo -e "${RED}ERROR: Failed to fetch PR data${NC}"
    echo "$PR_DATA"
    exit 2
fi

# Parse JSON (using basic shell parsing for portability)
ADDITIONS=$(echo "$PR_DATA" | grep -o '"additions":[0-9]*' | cut -d: -f2)
DELETIONS=$(echo "$PR_DATA" | grep -o '"deletions":[0-9]*' | cut -d: -f2)
CHANGED_FILES=$(echo "$PR_DATA" | grep -o '"changedFiles":[0-9]*' | cut -d: -f2)
STATE=$(echo "$PR_DATA" | grep -o '"state":"[^"]*"' | cut -d'"' -f4)
TITLE=$(echo "$PR_DATA" | grep -o '"title":"[^"]*"' | cut -d'"' -f4 | head -1)

echo "PR Title: $TITLE"
echo "State: $STATE"
echo ""
echo "Statistics:"
echo "  - Additions: $ADDITIONS lines"
echo "  - Deletions: $DELETIONS lines"
echo "  - Changed Files: $CHANGED_FILES"
echo ""

# Initialize validation result
VALIDATION_PASSED=true
WARNINGS=""
ERRORS=""

# Check 1: Absolute deletion threshold
if [[ "$DELETIONS" -gt "$MAX_DELETIONS_ABSOLUTE" ]]; then
    ERRORS+="  - CRITICAL: Deletions ($DELETIONS) exceed absolute threshold ($MAX_DELETIONS_ABSOLUTE)\n"
    VALIDATION_PASSED=false
fi

# Check 2: Deletion to addition ratio
if [[ "$ADDITIONS" -gt "$MIN_ADDITIONS_FOR_RATIO" ]]; then
    if [[ "$ADDITIONS" -gt 0 ]]; then
        RATIO=$((DELETIONS / ADDITIONS))
        if [[ "$RATIO" -gt "$MAX_DELETION_RATIO" ]]; then
            ERRORS+="  - CRITICAL: Deletion ratio ($RATIO:1) exceeds threshold ($MAX_DELETION_RATIO:1)\n"
            VALIDATION_PASSED=false
        fi
    fi
fi

# Check 3: More deletions than additions for "fix" or "add" PRs
if [[ "$TITLE" =~ ^(fix|feat|add|create) ]] && [[ "$DELETIONS" -gt "$ADDITIONS" ]]; then
    if [[ "$DELETIONS" -gt 1000 ]]; then
        WARNINGS+="  - WARNING: PR appears to be additive but has more deletions than additions\n"
    fi
fi

# Check 4: Changed files vs deletions sanity check
if [[ "$CHANGED_FILES" -gt 500 ]] && [[ "$DELETIONS" -gt 100000 ]]; then
    ERRORS+="  - CRITICAL: Appears to be deleting most of repository ($CHANGED_FILES files, $DELETIONS deletions)\n"
    VALIDATION_PASSED=false
fi

# Output results
echo "========================================"
echo "Validation Results"
echo "========================================"

if [[ -n "$ERRORS" ]]; then
    echo -e "${RED}ERRORS:${NC}"
    echo -e "$ERRORS"
fi

if [[ -n "$WARNINGS" ]]; then
    echo -e "${YELLOW}WARNINGS:${NC}"
    echo -e "$WARNINGS"
fi

if [[ "$VALIDATION_PASSED" == true ]]; then
    echo -e "${GREEN}✓ PR structure validation PASSED${NC}"
    echo ""
    echo "The PR has reasonable addition/deletion ratios."
    exit 0
else
    echo -e "${RED}✗ PR structure validation FAILED${NC}"
    echo ""
    echo "This PR appears to have been created incorrectly."
    echo "The branch likely wasn't created from the main branch,"
    echo "causing all existing files to appear as deletions."
    echo ""
    echo "Recommended actions:"
    echo "1. Close this PR"
    echo "2. Create a new branch from main: git checkout main && git checkout -b fix/your-branch"
    echo "3. Add only your intended changes"
    echo "4. Create a new PR"
    exit 1
fi
