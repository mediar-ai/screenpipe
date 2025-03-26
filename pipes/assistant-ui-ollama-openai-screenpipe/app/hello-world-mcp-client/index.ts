#!/usr/bin/env bun
import { desktopClient } from './start-here';
import { setupEnvironment } from './setup';

// Initialize everything in sequence
async function main() {
  // Set up environment first
  await setupEnvironment();
  
  // Connect to server once
  console.log("connecting to mcp server...");
  await desktopClient.connect('npx', ['tsx', '../../../../screenpipe-js/mcp-server/src/server.ts']);
  console.log("mcp server connected");
  
  // Start CLI
  require('./cli');
}

main().catch(console.error); 
