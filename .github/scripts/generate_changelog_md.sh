TAGS=$(git tag --sort=-creatordate)
CURRENT_RELEASE=$(echo "$TAGS" | sed -n '2p')
LAST_RELEASE=$(echo "$TAGS" | sed -n '3p')

# echo "Current release: $CURRENT_RELEASE"
# echo "Last release: $LAST_RELEASE"

COMMITS=$(git log --oneline $LAST_RELEASE..$CURRENT_RELEASE --oneline | tr '\n' ', ' | sed 's/"/\\"/g')

# echo "Commits: $COMMITS"

# LAST_CHANGELOG=$(sed ':a;N;$!ba;s/\n/\\n/g' content/changelogs/CHANGELOG.md)
# echo $LAST_CHANGELOG
LAST_CHANGELOG=$(awk '{printf "%s\\n", $0}' content/changelogs/CHANGELOG.md | sed 's/"/\\"/g')
echo $LAST_CHANGELOG

echo "{
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

# Copy the new changelog to the main changelog file
cp content/changelogs/$CURRENT_RELEASE.md content/changelogs/CHANGELOG.md
cp content/changelogs/$CURRENT_RELEASE.md screenpipe-app-tauri/public/CHANGELOG.md
