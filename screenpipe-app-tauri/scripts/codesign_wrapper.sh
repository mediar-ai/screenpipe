#!/bin/bash
# Wrapper for codesign that strips xattrs before signing
# This fixes the "resource fork, Finder information, or similar detritus not allowed" error

# Find the file being signed (last argument that's a path)
for arg in "$@"; do
    if [[ -e "$arg" ]]; then
        xattr -cr "$arg" 2>/dev/null || true
    fi
done

# Call the real codesign
/usr/bin/codesign "$@"
