import { useSettings } from "./use-settings";

export function useApiUrl() {
	const { settings } = useSettings();
	const host = settings.screenpipeHost || "localhost";
	const port = settings.port || 3030;

	return {
		baseUrl: `http://${host}:${port}`,
		wsUrl: `ws://${host}:${port}`,
	};
}
