import { useDebounce } from "@/lib/hooks/use-debounce";
import { useKeywordSearchStore } from "@/lib/hooks/use-keyword-search-store";
import { useSettings } from "@/lib/hooks/use-settings";
import OpenAI from "openai";
import { zodResponseFormat } from "openai/helpers/zod.mjs";
import { z } from "zod";
import { useCallback, useEffect, useState } from "react";
import { Button } from "./ui/button";

interface FrameAIResponse {
	explain: string;
	links: string[];
}

export const AIFrameResponse = () => {
	const { settings } = useSettings();
	const { currentResultIndex, searchResults } = useKeywordSearchStore();
	const debouncedResultIndex = useDebounce(currentResultIndex, 500);
	const [aiContent, setAiContent] = useState<FrameAIResponse | null>(null);
	const [isLoading, setIsLoading] = useState(false);
	const [error, setError] = useState<string | null>(null);

	const generateFrameResponse = useCallback(async () => {
		try {
			if (aiContent !== null) return;
			const currentFrame = searchResults[debouncedResultIndex];
			if (settings?.aiModel?.length === 0) {
				return;
			}
			if (!currentFrame) return;

			const frame = {
				frame_id: currentFrame.frame_id,
				timestamp: currentFrame.timestamp,
				window_name: currentFrame.window_name,
				app_name: currentFrame.app_name,
				text: currentFrame.text,
			};

			setIsLoading(true);

			// Initialize OpenAI
			const openai = new OpenAI({
				apiKey:
					settings?.aiProviderType === "screenpipe-cloud"
						? settings?.user?.token
						: settings?.openaiApiKey,
				baseURL: settings?.aiUrl,
				dangerouslyAllowBrowser: true,
			});

			const prompt = `${JSON.stringify(frame)}`;

			// Generate suggestions using OpenAI
			const response = await openai.chat.completions.create({
				model: settings?.aiModel || "",
				messages: [
					{
						role: "system",
						content: `
You are an advanced text analyzer. You will be given text and metadata extracted from an image. Your task is to determine its content, identify any website references, and return structured output.

### **Guidelines:**
- **State facts directly**—do not say "the content is about"; simply state what it is.
- **Use present tense**—avoid words like *could be* or *might be*.
- **Address the user as "you"**—never refer to them as "user."
- **Identify social media content**—if the text indicates a social media platform, return the platform's links. If a person's ID is present, generate a link to their profile.

### **Input Format Example:**
{
    "frame_id": <frame_id>,
    "timestamp": <date and time of frame>,
    "app_name": <app_name>,
    "window_name": <window_name>,
    "text": <ocr content of frame>
}
`,
					},
					{
						role: "user",
						content: prompt,
					},
				],
				response_format: zodResponseFormat(
					z.object({
						explain: z
							.string()
							.describe(
								"State the content and why you are seeing it, inferred from the text (max 30 words)",
							),
						links: z
							.array(z.string())
							.describe(
								"Extracted web links or relevant social media profiles",
							),
					}),
					"frame_explain_response",
				),
			});

			const content = response.choices[0]?.message?.content;

			console.log(JSON.parse(content ?? "{}"));
			setAiContent(JSON.parse(content ?? "{}"));
		} catch (err) {
			setError(
				err instanceof Error ? err.message : "failed to get ai response",
			);
		} finally {
			setIsLoading(false);
		}
	}, [debouncedResultIndex, settings]);

	useEffect(() => {
		generateFrameResponse();
	}, [generateFrameResponse]);

	return (
		<div className="text-neutral-600 w-full break-words">
			{isLoading ? (
				"Loading"
			) : error ? (
				error
			) : (
				<div className="space-y-2">
					<div>{aiContent?.explain}</div>
					<div className="space-y-2">
						{aiContent?.links.map((link, i) => {
							return (
								<Button variant={"link"} key={i} asChild>
									<a href={link} target="_blank">
										<img
											src={`https://www.google.com/s2/favicons?domain=${link}&sz=128`}
											className="object-cover h-8 w-8"
										/>
									</a>
								</Button>
							);
						})}
					</div>
				</div>
			)}
		</div>
	);
};
