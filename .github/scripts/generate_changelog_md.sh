TAGS=$(git tag --sort=-creatordate)
CURRENT_RELEASE=$(echo "$TAGS" | sed -n '1p')
LAST_RELEASE=$(echo "$TAGS" | sed -n '2p')

COMMITS=$(git log --oneline $LAST_RELEASE..$CURRENT_RELEASE --oneline | tr '\n' ', ' | sed 's/"/\\"/g')

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
          \"content\": \"Here is an example of it, please write it based on this version: $LAST_CHANGELOG\"
        },
        {
          \"role\": \"user\",
          \"content\": \"Here are my commits: $COMMITS\"
        }
      ]
    }"
)

CONTENT=$(jq '.choices[0].message.content' <<< $CONTENT)

# Create directory content/changelogs if it doesn't exist
mkdir -p content/changelogs

# Create a new file with the current release as the name
echo ${CONTENT//\"/} > content/changelogs/$CURRENT_RELEASE.md

# Add the full changelog on the end of the file
echo """
#### **Full Changelog:** [$LAST_RELEASE...$CURRENT_RELEASE](https://github.com/mediar-ai/screenpipe/compare/$LAST_RELEASE...$CURRENT_RELEASE)
""" >> content/changelogs/$CURRENT_RELEASE.md

# Copy the new changelog to the main changelog file
cp content/changelogs/$CURRENT_RELEASE.md screenpipe-app-tauri/public/CHANGELOG.md

# Output the current release version to be used in the workflow
echo "CURRENT_RELEASE=$CURRENT_RELEASE" >> $GITHUB_ENV
