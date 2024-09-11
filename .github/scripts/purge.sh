#!/bin/bash

# Check if the CN_API_KEY is set or throw an error
if [ -z "$CN_API_KEY" ]; then
    echo "Error: CN_API_KEY is not set"
    exit 1
fi

# Extract the current version from Cargo.toml
current_version=$(sed -n 's/^version = "\(.*\)"/\1/p' screenpipe-app-tauri/src-tauri/Cargo.toml | head -n 1)

# Get the version to purge up to from the first argument
purge_up_to=${1:-$current_version}

echo "Current version: $current_version"
echo "Purging versions up to: $purge_up_to"

# Check if current_version is empty
if [ -z "$current_version" ]; then
    echo "Error: Could not extract version from Cargo.toml"
    exit 1
fi

# Generate versions dynamically
major=$(echo $current_version | cut -d. -f1)
minor=$(echo $current_version | cut -d. -f2)
patch=$(echo $current_version | cut -d. -f3)

# Check if we got valid numbers
if ! [[ "$major" =~ ^[0-9]+$ ]] || ! [[ "$minor" =~ ^[0-9]+$ ]] || ! [[ "$patch" =~ ^[0-9]+$ ]]; then
    echo "Error: Invalid version format in Cargo.toml"
    exit 1
fi

for ((m=0; m<=$minor; m++)); do
    for ((p=0; p<=70; p++)); do
        version="$major.$m.$p"
        if [[ "$(echo -e "$version\n$purge_up_to" | sort -V | head -n1)" == "$version" && "$version" != "$purge_up_to" ]]; then
            echo "Purging version $version"
            cn release purge screenpipe "$version"
        else
            echo "Skipping version $version"
        fi
    done
done

echo "Purge complete"