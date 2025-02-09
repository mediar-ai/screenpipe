"use server";

const SERVER_ADDRESS = "0.0.0.0:8188";

export async function queuePrompt(prompt: string) {
  const workflowPrompt = {
    prompt: {
      "3": {
        class_type: "KSampler",
        inputs: {
          cfg: 8,
          denoise: 1,
          latent_image: ["5", 0],
          model: ["4", 0],
          negative: ["7", 0],
          positive: ["6", 0],
          sampler_name: "euler",
          scheduler: "normal",
          seed: Math.floor(Math.random() * 1000000),
          steps: 20,
        },
      },
      "4": {
        class_type: "CheckpointLoaderSimple",
        inputs: {
          ckpt_name: "v1-5-pruned-emaonly.safetensors",
        },
      },
      "5": {
        class_type: "EmptyLatentImage",
        inputs: {
          batch_size: 1,
          height: 512,
          width: 512,
        },
      },
      "6": {
        class_type: "CLIPTextEncode",
        inputs: {
          clip: ["4", 1],
          text: prompt,
        },
      },
      "7": {
        class_type: "CLIPTextEncode",
        inputs: {
          clip: ["4", 1],
          text: "bad hands",
        },
      },
      "8": {
        class_type: "VAEDecode",
        inputs: {
          samples: ["3", 0],
          vae: ["4", 2],
        },
      },
      "9": {
        class_type: "SaveImage",
        inputs: {
          filename_prefix: "ComfyUI",
          images: ["8", 0],
        },
      },
    },
  };

  const response = await fetch(`http://${SERVER_ADDRESS}/prompt`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(workflowPrompt),
  });

  return response.json();
}

export async function getImageFromHistory(promptId: string) {
  const historyResponse = await fetch(
    `http://${SERVER_ADDRESS}/history/${promptId}`
  );
  const history = await historyResponse.json();
  console.log("history", history);
  const node_outputs = history[promptId].outputs;

  if (node_outputs["9"]?.images?.[0]) {
    const image = node_outputs["9"].images[0];
    return `http://${SERVER_ADDRESS}/view?filename=${image.filename}&subfolder=${image.subfolder}&type=${image.type}`;
  }
  return null;
}
