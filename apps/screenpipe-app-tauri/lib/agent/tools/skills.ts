import { z } from 'zod';
import { ToolDefinition } from '../types';
import { SkillManager } from '../skills';

export const getSkillTool: ToolDefinition = {
    name: 'get_skill',
    description: 'Get the full content and instructions for a specific skill by name.',
    parameters: z.object({
        name: z.string().describe('The name of the skill to retrieve.'),
    }),
    execute: async ({ name }: { name: string }) => {
        const skillManager = SkillManager.getInstance();
        const skill = skillManager.getSkill(name);

        if (!skill) {
            return `Skill '${name}' not found. Use the available skills listed in the system prompt.`;
        }

        return `### Skill: ${skill.metadata.name}\n\n${skill.content}`;
    },
};
