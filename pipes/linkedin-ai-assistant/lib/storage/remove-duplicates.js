"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const fs_1 = require("fs");
// Read the JSON file
const data = (0, fs_1.readFileSync)('./state.json', 'utf8');
const state = JSON.parse(data);
// Function to remove duplicates from an array based on 'profileUrl'
function removeDuplicates(profiles) {
    const seen = new Set();
    return profiles.filter(profile => {
        if (seen.has(profile.profileUrl)) {
            return false;
        }
        else {
            seen.add(profile.profileUrl);
            return true;
        }
    });
}
// Remove duplicates from 'visitedProfiles' and 'toVisitProfiles'
state.visitedProfiles = removeDuplicates(state.visitedProfiles);
state.toVisitProfiles = removeDuplicates(state.toVisitProfiles);
// Write the cleaned data back to the JSON file
(0, fs_1.writeFileSync)('./state.json', JSON.stringify(state, null, 2));
console.log('duplicates removed successfully.');
