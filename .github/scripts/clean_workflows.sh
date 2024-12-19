#!/bin/bash

# Get all cache IDs and delete them
gh api \
  -H "Accept: application/vnd.github+json" \
  "/repos/mediar-ai/screenpipe/actions/caches" | \
jq -r '.actions_caches[].id' | \
while read -r cache_id; do
    echo "Deleting cache ID: $cache_id"
    gh api \
        --method DELETE \
        -H "Accept: application/vnd.github+json" \
        "/repos/mediar-ai/screenpipe/actions/caches/$cache_id"
    echo "Cache $cache_id deleted"
done


