import { useState, useEffect, useCallback, useRef } from "react";

interface HealthCheckResponse {
	status: string;
	status_code: number;
	last_frame_timestamp: string | null;
	last_audio_timestamp: string | null;
	last_ui_timestamp: string | null;
	frame_status: string;
	audio_status: string;
	ui_status: string;
	message: string;
}

function isHealthChanged(
	oldHealth: HealthCheckResponse | null,
	newHealth: HealthCheckResponse
): boolean {
	if (!oldHealth) return true;

	const keysToCompare: (keyof HealthCheckResponse)[] = [
		"status",
		"status_code",
		"last_frame_timestamp",
		"last_audio_timestamp",
		"last_ui_timestamp",
		"frame_status",
		"audio_status",
		"ui_status",
		"message",
	];
	return keysToCompare.some((key) => oldHealth[key] !== newHealth[key]);
}

interface HealthCheckHook {
	health: HealthCheckResponse | null;
	isServerDown: boolean;
	isLoading: boolean;
	fetchHealth: () => Promise<void>;
	debouncedFetchHealth: () => Promise<void>;
}

export function useHealthCheck() {
	const [health, setHealth] = useState<HealthCheckResponse | null>(null);
	const [isServerDown, setIsServerDown] = useState(false);
	const [isLoading, setIsLoading] = useState(false);
	const abortControllerRef = useRef<AbortController | null>(null);
	const healthRef = useRef(health);

	const fetchHealth = useCallback(async () => {
		if (abortControllerRef.current) {
			abortControllerRef.current.abort();
		}

		abortControllerRef.current = new AbortController();

		try {
			setIsLoading(true);
			const response = await fetch("http://localhost:3030/health", {
				cache: "no-store",
				signal: abortControllerRef.current.signal,
				headers: {
					"Cache-Control": "no-cache",
					Pragma: "no-cache",
				},
			});

			if (!response.ok) {
				throw new Error(`HTTP error! status: ${response.status}`);
			}

			const data: HealthCheckResponse = await response.json();

			if (isHealthChanged(healthRef.current, data)) {
				setHealth(data);
				healthRef.current = data;
			}

			setIsServerDown(false);
		} catch (error) {
			if (error instanceof Error && error.name === "AbortError") {
				return;
			}

			// console.error("Health check error:", error);
			if (!isServerDown) {
				setIsServerDown(true);
				const errorHealth: HealthCheckResponse = {
					last_frame_timestamp: null,
					last_audio_timestamp: null,
					last_ui_timestamp: null,
					frame_status: "error",
					audio_status: "error",
					ui_status: "error",
					status: "error",
					status_code: 500,
					message:
						"Failed to fetch health status. Server might be down.",
				};
				setHealth(errorHealth);
				healthRef.current = errorHealth;
			}
		} finally {
			setIsLoading(false);
		}
	}, [isServerDown, setIsLoading]);

	useEffect(() => {
		fetchHealth();
		const interval = setInterval(fetchHealth, 1000);

		return () => {
			clearInterval(interval);
			if (abortControllerRef.current) {
				abortControllerRef.current.abort();
			}
		};
	}, [fetchHealth]);

	return {
		health,
		isServerDown,
		isLoading,
		fetchHealth,
	} as HealthCheckHook;
}
