import { readFile, readDir } from '@tauri-apps/plugin-fs';
import { appDataDir } from '@tauri-apps/api/path';

export interface SkillMetadata {
    name: string;
    description: string;
    [key: string]: any;
}

export interface Skill {
    name: string;
    path: string;
    content: string;
    metadata: SkillMetadata;
}

export class SkillManager {
    private static instance: SkillManager;
    private skillsDir: string | null = null;
    private skillsDirPromise: Promise<string> | null = null;
    private skills: Map<string, Skill> = new Map();

    private constructor(skillsDir?: string) {
        if (skillsDir) {
            this.skillsDir = skillsDir;
        } else if (process.env.SKILLS_DIR) {
            this.skillsDir = process.env.SKILLS_DIR;
        }
        // Otherwise skillsDir remains null and will be computed lazily
    }

    private async getSkillsDir(): Promise<string> {
        if (this.skillsDir) {
            return this.skillsDir;
        }
        if (!this.skillsDirPromise) {
            this.skillsDirPromise = appDataDir().then(dir => `${dir}/skills`);
        }
        return this.skillsDirPromise;
    }

    public static getInstance(skillsDir?: string): SkillManager {
        if (!SkillManager.instance) {
            SkillManager.instance = new SkillManager(skillsDir);
        }
        return SkillManager.instance;
    }

    public async loadAllSkills(): Promise<void> {
        try {
            const skillsDir = await this.getSkillsDir();
            const entries = await readDir(skillsDir);
            for (const entry of entries) {
                if (entry.isDirectory) {
                    const skillPath = `${skillsDir}/${entry.name}/SKILL.md`;
                    try {
                        const content = await this.readTextFile(skillPath);
                        const skill = this.parseSkill(entry.name, skillPath, content);
                        this.skills.set(entry.name, skill);
                    } catch (e) {
                        // Skip if SKILL.md doesn't exist or can't be read
                        console.debug(`Skipping skill ${entry.name}:`, e);
                    }
                }
            }
        } catch (error) {
            console.error('Failed to load skills:', error);
        }
    }

    private parseSkill(name: string, path: string, content: string): Skill {
        const metadata: SkillMetadata = { name, description: name };
        let body = content;

        if (content.startsWith('---')) {
            const match = content.match(/^---\n([\s\S]*?)\n---/);
            if (match) {
                const yaml = match[1];
                body = content.substring(match[0].length).trim();

                // Simple YAML-like parser
                const lines = yaml.split('\n');
                for (const line of lines) {
                    const colonIndex = line.indexOf(':');
                    if (colonIndex !== -1) {
                        const key = line.substring(0, colonIndex).trim();
                        const value = line.substring(colonIndex + 1).trim().replace(/^["']|["']$/g, '');
                        metadata[key] = value;
                    }
                }
            }
        }

        return {
            name,
            path,
            content: body,
            metadata
        };
    }

    private async readTextFile(path: string): Promise<string> {
        const data = await readFile(path);
        return new TextDecoder().decode(data);
    }

    public getSkillsSummary(): string {
        if (this.skills.size === 0) return '';

        let summary = '# Available Skills\n\n';
        for (const skill of this.skills.values()) {
            summary += `- **${skill.metadata.name}**: ${skill.metadata.description}\n`;
        }
        summary += '\nYou can ask for more details about a specific skill or instruction on how to use its tools.';
        return summary;
    }

    public getSkill(name: string): Skill | undefined {
        return this.skills.get(name);
    }

    public getAllSkills(): Skill[] {
        return Array.from(this.skills.values());
    }
}
