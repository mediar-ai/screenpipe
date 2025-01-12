import { readFileSync, writeFileSync } from 'fs';

// Read the JSON file
const data = readFileSync('./state.json', 'utf8');
const state = JSON.parse(data);

interface Profile {
  profileUrl: string;
  timestamp?: string;
  status?: string;
  actions?: Record<string, string>;
}

// Function to remove duplicates from an array based on 'profileUrl'
function removeDuplicates(profiles: Profile[]) {
  const seen = new Set();
  return profiles.filter(profile => {
    if (seen.has(profile.profileUrl)) {
      return false;
    } else {
      seen.add(profile.profileUrl);
      return true;
    }
  });
}

// Remove duplicates from 'visitedProfiles' and 'toVisitProfiles'
state.visitedProfiles = removeDuplicates(state.visitedProfiles);
state.toVisitProfiles = removeDuplicates(state.toVisitProfiles);

// Write the cleaned data back to the JSON file
writeFileSync('./state.json', JSON.stringify(state, null, 2));

console.log('duplicates removed successfully.'); 