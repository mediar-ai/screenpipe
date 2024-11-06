CURRENT_RELEASE=$1

LAST_RELEASE=$(cn release list screenpipe --api-key $CN_API_KEY --format json | jq '.[0]')
LAST_COMMIT_DATE=$(echo $LAST_RELEASE | jq '.createdAt')
LAST_RELEASE_VERSION=$(echo $LAST_RELEASE | jq '.version')
COMMIT_LAST_RELEASE=$(git log -1 --until="$LAST_COMMIT_DATE" --format="%H")

COMMIT_CURRENT_RELEASE=$(git log -1 --format="%H")
COMMIT_CURRENT_RELEASE=${2:-$COMMIT_CURRENT_RELEASE}

# If both are equal, then there's nothing to add to the changelog
if [ "$COMMIT_LAST_RELEASE" == "$COMMIT_CURRENT_RELEASE" ]; then
  echo "No new commits to add to the changelog"
  echo "CHANGELOG_GENERATED=0" >> $GITHUB_ENV
  exit 0
fi

COMMITS=$(git log --oneline $COMMIT_LAST_RELEASE..$COMMIT_CURRENT_RELEASE --oneline | tr '\n' ', ' | sed 's/"/\\"/g')

echo $COMMITS

LAST_CHANGELOG=$(awk '{printf "%s\\n", $0}' screenpipe-app-tauri/public/CHANGELOG.md | sed 's/"/\\"/g')

CONTENT=$(
  curl https://api.openai.com/v1/chat/completions \
    -H "Content-Type: application/json" \
    -H "Authorization: Bearer $OPENAI_API_KEY" \
    -d "{
      \"model\": \"gpt-3.5-turbo\",
      \"messages\": [
        {
          \"role\": \"system\",
          \"content\": \"You are an assistant specialized in generating changelogs from commits. Categorize the changes into the following sections if they apply: New Features, Improvements, Fixes, and Others.\"
        },
        {
          \"role\": \"system\",
          \"content\": \"Be concise and focus on what brings customer value. Avoid copy-pasting the commits, and instead rephrase in a 'selling' way. Do not consider things like 'deploy', 'review/merge pull requests', and other day-to-day tasks that are sort of standard for software projects.\"
        },
        {
          \"role\": \"system\",
          \"content\": \"Here is an example of it, please write it based on this version: $LAST_CHANGELOG. Be sure to write in markdown language, and avoid adding the #### **Full Changelog:** section, as this will be added manually via scripts\"
        },
        {
          \"role\": \"user\",
          \"content\": \"Here are my commits: $COMMITS\"
        }
      ]
    }"
)

CONTENT=$(jq '.choices[0].message.content' <<< $CONTENT)

# exit if the content is null
if [ "$CONTENT" == "null" ]; then
  echo "Failed to generate changelog content. It may be an error with the OpenAI API key."
  echo "CHANGELOG_GENERATED=0" >> $GITHUB_ENV
  exit 1
fi

# Create directory content/changelogs if it doesn't exist
mkdir -p content/changelogs

# Create a new file with the current release as the name
echo ${CONTENT//\"/} > content/changelogs/$CURRENT_RELEASE.md

# Add the full changelog on the end of the file
echo """
#### **Full Changelog:** [$LAST_RELEASE_VERSION...$CURRENT_RELEASE](https://github.com/mediar-ai/screenpipe/compare/$COMMIT_LAST_RELEASE...$COMMIT_CURRENT_RELEASE)
""" >> content/changelogs/$CURRENT_RELEASE.md

# Copy the new changelog to the main changelog file
cp content/changelogs/$CURRENT_RELEASE.md screenpipe-app-tauri/public/CHANGELOG.md

# Output the current release version to be used in the workflow
echo "CURRENT_RELEASE=$CURRENT_RELEASE" >> $GITHUB_ENV

# Set the flag to indicate that the changelog was generated
echo "CHANGELOG_GENERATED=1" >> $GITHUB_ENV
