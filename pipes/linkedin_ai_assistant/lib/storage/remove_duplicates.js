// remove_duplicates.js
const fs = require('fs');

// Read the JSON file
const data = fs.readFileSync('./state.json', 'utf8');
const state = JSON.parse(data);

// Function to remove duplicates from an array based on 'profileUrl'
function removeDuplicates(profiles) {
  const seen = new Set();
  return profiles.filter(profile => {
    if (seen.has(profile.profileUrl)) {
      // Duplicate found, don't include in the new array
      return false;
    } else {
      // First occurrence, include in the new array
      seen.add(profile.profileUrl);
      return true;
    }
  });
}

// Remove duplicates from 'visitedProfiles' and 'toVisitProfiles'
state.visitedProfiles = removeDuplicates(state.visitedProfiles);
state.toVisitProfiles = removeDuplicates(state.toVisitProfiles);

// Write the cleaned data back to the JSON file
fs.writeFileSync('./state.json', JSON.stringify(state, null, 2));

console.log('duplicates removed successfully.');