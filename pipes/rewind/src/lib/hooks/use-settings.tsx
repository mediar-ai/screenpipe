import { useContext } from "react";
import { SettingsContext } from "@/components/settings-provider";

export function useSettings() {
	const settingsProps = useContext(SettingsContext);

	return { ...settingsProps };
}
