// This script updates the README file with a new contribution link
const fs = require('fs');
const path = require('path');

const updateReadme = (filePath, newLink) => {
  try {
    // Read the current README file
    const readmePath = path.resolve(__dirname, filePath);
    const readmeContent = fs.readFileSync(readmePath, 'utf-8');

    // Define the regex pattern to find the contribution link
    const contributionLinkPattern = /\[Contribution Guide\]\(.*?\)/;

    // Replace the old link with the new link
    const updatedContent = readmeContent.replace(contributionLinkPattern, `[Contribution Guide](${newLink})`);

    // Write the updated content back to the README file
    fs.writeFileSync(readmePath, updatedContent, 'utf-8');
    console.log('README updated successfully.');
  } catch (error) {
    console.error('Error updating README:', error);
  }
};

// Example usage
updateReadme('README.md', 'https://new-contribution-link.com');