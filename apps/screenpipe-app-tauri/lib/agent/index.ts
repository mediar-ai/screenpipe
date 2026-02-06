import { ToolRegistry } from './registry';
import { shellExecTool } from './tools/shell';
import { fsReadTool, fsWriteTool, fsListTool, fsEditTool } from './tools/fs';
import { webSearchTool, webFetchTool } from './tools/web';
import { messageTool } from './tools/message';
import { cronAddTool, cronListTool, cronRemoveTool } from './tools/cron';

import { searchContentTool } from './tools/memory';
import { getSkillTool } from './tools/skills';
import { AgentOrchestrator } from './orchestrator';

// Initialize the registry with default tools
const registry = ToolRegistry.getInstance();
registry.register(shellExecTool);
registry.register(fsReadTool);
registry.register(fsWriteTool);
registry.register(fsListTool);
registry.register(fsEditTool);
registry.register(webSearchTool);
registry.register(webFetchTool);
registry.register(messageTool);
registry.register(cronAddTool);
registry.register(cronListTool);
registry.register(cronRemoveTool);
registry.register(searchContentTool);
registry.register(getSkillTool);

// Note: spawn tool is registered dynamically by AgentOrchestrator with API key

export { registry, AgentOrchestrator };
export * from './loop';
export * from './types';
export * from './registry';
export * from './bus';
export * from './subagent';
export * from './session';
export * from './cron';
export * from './heartbeat';
export * from './orchestrator';
export * from './skills';
