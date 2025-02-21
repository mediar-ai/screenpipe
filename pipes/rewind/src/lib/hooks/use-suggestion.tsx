import { useState, useEffect } from "react";
import { useSettings } from "./use-settings";
import OpenAI from "openai";
// import { fetchAppAndWindowNames } from "../raw_sql_queries";
import { z } from "zod";
import { zodResponseFormat } from "openai/helpers/zod";
import { parser } from "../keyword-parser";
import { getAppandWindowByRank } from "./use-app-name-suggestion";

interface AppStats {
	apps: Record<string, number>;
	windows: Record<string, number>;
}

export function useSuggestions(keywordString: string) {
	const [suggestions, setSuggestions] = useState<string[]>([]);
	const [isLoading, setIsLoading] = useState(false);
	const [error, setError] = useState<string | null>(null);
	const { settings } = useSettings();

	useEffect(() => {
		const abortController = new AbortController();

		setSuggestions([]);
		const generateSuggestions = async () => {
			if (keywordString.length < 3) {
				setIsLoading(false);
				setError(null);
				setSuggestions([]);
				return;
			}

			setIsLoading(true);
			setError(null);

			try {
				const keywords = parser.parse(keywordString).keywords;

				if (!keywords.length) {
					setSuggestions([]);
					return;
				}

				const appData = await getAppandWindowByRank(
					keywords.join(" "),
					abortController,
				);

				const appStats: AppStats = {
					apps: {},
					windows: {},
				};

				appData.forEach((item: { app_name: string; window_name: string }) => {
					if (item.app_name) {
						appStats.apps[item.app_name] =
							(appStats.apps[item.app_name] || 0) + 1;
					}
					if (item.window_name) {
						appStats.windows[item.window_name] =
							(appStats.windows[item.window_name] || 0) + 1;
					}
				});

				if (
					Object.keys(appStats.apps).length === 0 &&
					Object.keys(appStats.windows).length === 0
				) {
					setSuggestions([]);
					return;
				}

				const openai = new OpenAI({
					apiKey:
						settings?.aiProviderType === "screenpipe-cloud"
							? settings?.user?.token
							: settings?.openaiApiKey,
					baseURL: settings?.aiUrl,
					dangerouslyAllowBrowser: true,
				});

				const newPrompt = `Generate 5 natural search suggestions strictly based on the most commonly used apps and activities found in the provided user data.

            Use the app statistics as a key reference:
            apps: ${JSON.stringify(appStats.apps)}
            windows: ${JSON.stringify(appStats.windows)}

            Instructions:
            - Do not generate suggestions beyond the scope of the provided data.
            - Ensure specificity and variety in the search suggestions by considering different user activities.
            - Use app interactions and window history to infer relevant searches.
            - Suggestions should align naturally with the user's existing usage patterns.
            - if no apps and windows are given then just return empty array.
`;

				const response = await openai.chat.completions.create(
					{
						model: settings?.aiModel || "",
						messages: [
							{
								role: "system",
								content:
									"You are an AI assistant helping generate search suggestions based on user's app usage data.",
							},
							{
								role: "user",
								content: newPrompt,
							},
						],
						response_format: zodResponseFormat(
							z.object({ suggestions: z.array(z.string()) }),
							"user_data_suggestions",
						),
					},
					{
						signal: abortController.signal,
					},
				);

				const content = response.choices[0]?.message?.content;
				if (content) {
					const result = JSON.parse(content);
					setSuggestions(result.suggestions);
				}

				setIsLoading(false);
			} catch (err) {
				if (err instanceof Error) {
					// Only set error if it's not an abort error
					if (err.name !== "AbortError") {
						setError(err.message);
						setSuggestions([]);
					}
					// Always set loading to false for both abort and other errors
					setIsLoading(false);
				} else {
					setError("Unable to generate suggestions. Please try again.");
					setSuggestions([]);
					setIsLoading(false);
				}
			}
		};

		generateSuggestions();

		return () => {
			setIsLoading(false);
			abortController.abort();
		};
	}, [keywordString]);

	return { suggestions, isLoading, error };
}
