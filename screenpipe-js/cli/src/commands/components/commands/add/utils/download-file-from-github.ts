import fs from 'fs-extra';
import { handleError } from './handle-error';

export async function fetchFileFromGitHubAPI(apiUrl: string, outputPath: string) {
    try {
      const response = await fetch(apiUrl);
      if (!response.ok) {
        throw new Error(`Failed to fetch file info from GitHub API. HTTP Status: ${response.status}`);
      }
      
      const data = await response.json();
      const fileContent = Buffer.from(data.content, 'base64').toString('utf-8');
  
      fs.writeFileSync(outputPath, fileContent);
    } catch (err: any) {
      handleError(`Error: ${err.message}`);
    }
  }