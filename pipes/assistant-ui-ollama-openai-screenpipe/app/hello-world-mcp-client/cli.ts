import { processUserQuery } from './query-processing-engine';
import readline from 'readline';
import { desktopClient } from './start-here';

// Create interface for user input
const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

// Start interactive session
console.log("screenpipe mcp tool assistant - type 'exit' to quit");

function askQuestion() {
  rl.question("\nquery: ", async (input) => {
    if (input.toLowerCase() === 'exit') {
      console.log("shutting down...");
      await desktopClient.disconnect();
      rl.close();
      process.exit(0);
    }
    
    try {
      console.log("\nprocessing...");
      const response = await processUserQuery(input);
      console.log("\nresponse:", response);
    } catch (error) {
      console.error("error processing query:", error);
    }
    
    askQuestion();
  });
}

// Start the conversation loop
askQuestion(); 