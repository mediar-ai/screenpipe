// Create a Node-compatible version of the browser SDK
import { Operator } from "../../browser-sdk/src/Operator.js";

// Skip PostHog initialization by creating a direct Operator instance
const operator = new Operator("http://localhost:3030");

// Export a compatible API
export const pipe = {
  operator
};