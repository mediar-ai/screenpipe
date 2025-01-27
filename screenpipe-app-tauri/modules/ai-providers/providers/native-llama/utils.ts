type OllamaModel = {
  name: string;
  size: number;
  digest: string;
  modified_at: string;
}

export async function getOllamaModels(port?: string) {
    const response = await fetch(`http://localhost:${port ? port : '11434'}/api/tags`);
    const data = (await response.json()) as { models: OllamaModel[] };

    return data.models.map((model) => model.name)
  }