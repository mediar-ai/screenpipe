type OllamaModel = {
  name: string;
  size: number;
  digest: string;
  modified_at: string;
}

export async function getOllamaModels() {
    const response = await fetch("http://localhost:11434/api/tags");
    const data = (await response.json()) as { models: OllamaModel[] };
    return data;
  }