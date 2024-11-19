CURRENT_RELEASE=$1

CHANGELOG_PUBLIC_PATH=screenpipe-app-tauri/public/CHANGELOG.md

LAST_CHANGELOG=$(awk '{printf "%s\\n", $0}' content/changelogs/v0.1.98.md | sed 's/"/\\"/g')

# The if else is necessary to ensure it works both locally and on cloud

# Download cn binary from https://cdn.crabnebula.app/download/crabnebula/cn-cli/latest/cn_linux
# only download it if it doesn't exist
if ! command -v cn &> /dev/null; then
  echo "Downloading Crab Nebula binary"
  curl -L -o cn https://cdn.crabnebula.app/download/crabnebula/cn-cli/latest/cn_linux
  chmod +x cn
  CN_CMD=./cn
else
  CN_CMD=cn
fi

LAST_RELEASE=$($CN_CMD release list screenpipe --api-key $CN_API_KEY --format json | jq '.[0] | select(.status == "Published")')
COMMIT_DATE_LAST_RELEASE=$(echo $LAST_RELEASE | jq '.createdAt')

# Format date for git (remove quotes if present)
COMMIT_DATE_LAST_RELEASE=$(echo "$COMMIT_DATE_LAST_RELEASE" | tr -d '"')

COMMIT_LAST_RELEASE=$(git log -1 --until="$COMMIT_DATE_LAST_RELEASE" --format="%H")

COMMIT_CURRENT_RELEASE=$(git log -1 --format="%H")
COMMIT_CURRENT_RELEASE=${2:-$COMMIT_CURRENT_RELEASE}

if [ "$COMMIT_LAST_RELEASE" == "" ]; then
  echo "Failed to get the commit hash for the last release"
  echo "CHANGELOG_GENERATED=0" >> $GITHUB_ENV
  exit 1
fi

if [ "$COMMIT_CURRENT_RELEASE" == "" ]; then
  echo "Failed to get the commit hash for the current release"
  echo "CHANGELOG_GENERATED=0" >> $GITHUB_ENV
  exit 1
fi

# If both are equal, then there's nothing to add to the changelog
if [ "$COMMIT_LAST_RELEASE" == "$COMMIT_CURRENT_RELEASE" ]; then
  echo "No new commits to add to the changelog"
  echo "CHANGELOG_GENERATED=0" >> $GITHUB_ENV
  exit 0
fi

COMMITS=$(git log --oneline $COMMIT_LAST_RELEASE..$COMMIT_CURRENT_RELEASE --oneline | tr '\n' ', ' | sed 's/"/\\"/g')

CONTENT=$(
  curl https://api.openai.com/v1/chat/completions \
    -H "Content-Type: application/json" \
    -H "Authorization: Bearer $OPENAI_API_KEY" \
    -d "{
      \"model\": \"gpt-3.5-turbo\",
      \"messages\": [
        {
          \"role\": \"system\",
          \"content\": \"You are a helpful assistant.\nThe user is using a product called "screenpipe" which records his screen and mics 24/7. The user ask you questions and you use his screenpipe recordings to answer him.\nYou will generate a changelog for the new screenpipe update based on a list of commits.\nHere are a some guidelines for your responses:\n- only adds to the changelog what brings clear customer value\n- categorize the changes into 'New Features', 'Improvements' and 'Fixes'. Anything not matching these guidelines should not be included on your response\n- Deploys, merges, and software maintenance tasks which does not bring clear value to the end-user should not be included.\n\nUse the following changelog file as an example: $LAST_CHANGELOG\"
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
  echo "Failed to generate changelog content."
  echo "CHANGELOG_GENERATED=0" >> $GITHUB_ENV
  exit 1
fi

# Create directory content/changelogs if it doesn't exist
mkdir -p content/changelogs

# Create a new file with the current release as the name
echo -e ${CONTENT//\"/} > content/changelogs/$CURRENT_RELEASE.md
SHORT_COMMIT_LAST_RELEASE=$(echo $COMMIT_LAST_RELEASE | cut -c 1-5)
SHORT_COMMIT_CURRENT_RELEASE=$(echo $COMMIT_CURRENT_RELEASE | cut -c 1-5)

# Add the full changelog on the end of the file
echo """
#### **Full Changelog:** [$SHORT_COMMIT_LAST_RELEASE..$SHORT_COMMIT_CURRENT_RELEASE](https://github.com/mediar-ai/screenpipe/compare/$SHORT_COMMIT_LAST_RELEASE..$SHORT_COMMIT_CURRENT_RELEASE)
""" >> content/changelogs/$CURRENT_RELEASE.md

# Copy the new changelog to the main changelog file
cp content/changelogs/$CURRENT_RELEASE.md $CHANGELOG_PUBLIC_PATH

# Output the current release version to be used in the workflow
echo "CURRENT_RELEASE=$CURRENT_RELEASE" >> $GITHUB_ENV

# Set the flag to indicate that the changelog was generated
echo "CHANGELOG_GENERATED=1" >> $GITHUB_ENV
