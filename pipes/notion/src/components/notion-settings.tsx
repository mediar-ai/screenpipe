"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from "@/components/ui/card";
import { OllamaModelsList } from "./ollama-models-list";
import { Textarea } from "@/components/ui/textarea";
import { validateCredentials } from "@/lib/notion/notion";
import { toast } from "@/hooks/use-toast";
import { useNotionSettings } from "@/lib/hooks/use-notion-settings";
import { Loader2 } from "lucide-react";
import { NotionCredentials } from "@/lib/types";
import { updatePipeConfig } from "@/lib/actions/update-pipe-config";
import { parseInt } from "lodash";

export function NotionSettings() {
	const { settings, updateSettings, loading } = useNotionSettings();
	const [isSettingUp, setIsSettingUp] = useState(false);
	const [credentials, setCredentials] = useState<NotionCredentials>({
		accessToken: "",
		databaseId: "",
		intelligenceDbId: "",
	});
	const [testingLog, setTestingLog] = useState(false);
	const [testingIntelligence, setTestingIntelligence] = useState(false);

	useEffect(() => {
		setCredentials({
			accessToken: settings?.notion?.accessToken || "",
			databaseId: settings?.notion?.databaseId || "",
			intelligenceDbId: settings?.notion?.intelligenceDbId || "",
		});
	}, [settings]);

	const handleValidate = async () => {
		setIsSettingUp(true);
		try {
			const isValid = await validateCredentials(credentials);
			if (!isValid) {
				throw new Error("Invalid credentials");
			}

			await updateSettings({
				...settings!,
				notion: credentials,
			});

			await updatePipeConfig(settings?.interval || 5);

			toast({
				title: "Success",
				description: "Notion connected successfully",
			});
		} catch (_error) {
			toast({
				title: "Error",
				description: "Failed to connect to Notion",
				variant: "destructive",
			});
		} finally {
			setIsSettingUp(false);
		}
	};

	const handleSetup = async () => {
		setIsSettingUp(true);
		try {
			const response = await fetch("/api/setup");
			const credentials = await response.json();

			if (!response.ok) throw new Error(credentials.error);

			const notionCreds = {
				accessToken: credentials.accessToken,
				databaseId: credentials.databaseId,
				intelligenceDbId: credentials.intelligenceDbId,
			};

			const isValid = await validateCredentials(notionCreds);
			if (!isValid) {
				throw new Error("Invalid credentials");
			}

			console.log(isValid, "done");

			await updateSettings({
				...settings!,
				notion: notionCreds,
			});

			toast({
				title: "Success",
				description: "Notion connected successfully",
			});
		} catch (_error) {
			toast({
				title: "Error",
				description: "Failed to connect to Notion",
				variant: "destructive",
			});
		} finally {
			setIsSettingUp(false);
		}
	};

	const handleTestLog = async () => {
		setTestingLog(true);
		try {
			const response = await fetch("/api/log");

			const data = await response.json();
			if (!response.ok) throw new Error(data.error);

			toast({
				title: "Success",
				description: `Log created successfully. View at: ${data.deepLink}`,
			});
		} catch (error) {
			toast({
				title: "Error",
				description:
					error instanceof Error ? error.message : "Failed to create log",
				variant: "destructive",
			});
		} finally {
			setTestingLog(false);
		}
	};

	const handleTestIntelligence = async () => {
		setTestingIntelligence(true);
		try {
			const response = await fetch("/api/intelligence");
			const data = await response.json();

			if (!response.ok) throw new Error(data.error);

			toast({
				title: "Success",
				description: `Intelligence generated with ${data.summary.contacts} contacts`,
			});
		} catch (error) {
			toast({
				title: "Error",
				description:
					error instanceof Error
						? error.message
						: "Failed to generate intelligence",
				variant: "destructive",
			});
		} finally {
			setTestingIntelligence(false);
		}
	};

	return (
		<Card className="w-full max-w-4xl ">
			<CardHeader>
				<CardTitle>Notion Settings</CardTitle>
				<CardDescription>
					Please have chrome install for connecting with chrome{" "}
				</CardDescription>
			</CardHeader>
			<CardContent>
				<div className="space-y-6">
					<div className="space-y-4">
						<div>
							<Label>AI Model</Label>
							<OllamaModelsList
								defaultValue={settings?.aiModel || ""}
								onChange={(model) => {
									updateSettings({ ...settings!, aiModel: model });
								}}
								disabled={loading}
							/>
						</div>

						<div>
							<Label>Custom Prompt</Label>
							<textarea
								placeholder="Enter custom prompt for log generation..."
								value={settings?.prompt || ""}
								onChange={(e) =>
									updateSettings({ ...settings!, prompt: e.target.value })
								}
								className="w-full min-h-[100px] p-2 rounded-md border bg-background"
								rows={10}
								disabled={loading}
							/>
							<div className="space-y-2">
								<Label htmlFor="interval">sync interval (minutes)</Label>
								<Input
									id="interval"
									name="interval"
									type="number"
									min="1"
									step="1"
									max="60"
									defaultValue={settings?.interval ? settings?.interval : 5}
								/>
							</div>
							<div className="space-y-2">
								<Label>Workspace Name</Label>
								<Input
									type="text"
									placeholder="Required"
									value={settings?.workspace || ""}
									onChange={(e) =>
										updateSettings({ ...settings!, workspace: e.target.value })
									}
								/>
							</div>
							<div className="space-y-2">
								<Label htmlFor="pageSize">Page size</Label>
								<Input
									id="pageSize"
									name="pageSize"
									type="number"
									defaultValue={settings?.pageSize || 50}
									onChange={(e) =>
										updateSettings({
											...settings!,
											pageSize: parseInt(e.target.value),
										})
									}
								/>
							</div>
						</div>

						<div className="space-y-2">
							<Label>Access Token</Label>
							<Input
								placeholder="Access Token"
								value={credentials.accessToken}
								onChange={(e) =>
									setCredentials((prev) => ({
										...prev,
										accessToken: e.target.value,
									}))
								}
							/>
							<Label>Database ID</Label>
							<Input
								placeholder="Database ID"
								value={credentials.databaseId}
								onChange={(e) =>
									setCredentials((prev) => ({
										...prev,
										databaseId: e.target.value,
									}))
								}
							/>
							<Label>Intelligence ID</Label>
							<Input
								placeholder="Intelligence ID"
								value={credentials.intelligenceDbId}
								onChange={(e) =>
									setCredentials((prev) => ({
										...prev,
										intelligenceDbId: e.target.value,
									}))
								}
							/>
							<div className="flex justify-between items-center">
								<Button
									onClick={handleSetup}
									disabled={isSettingUp || !settings?.workspace}
								>
									{isSettingUp ? "Connecting..." : "Connect Notion"}
								</Button>
								<Button
									onClick={handleValidate}
									disabled={
										isSettingUp ||
										!credentials.accessToken ||
										!credentials.accessToken
									}
								>
									{isSettingUp ? "Validating..." : "Validate Cred Notion"}
								</Button>
								{settings?.notion && (
									<div className="flex gap-2 mt-4">
										<Button
											onClick={handleTestLog}
											disabled={testingLog}
											variant="secondary"
										>
											{testingLog ? (
												<>
													<Loader2 className="mr-2 h-4 w-4 animate-spin" />
													Testing Log
												</>
											) : (
												"Test Log"
											)}
										</Button>

										<Button
											onClick={handleTestIntelligence}
											disabled={testingIntelligence}
											variant="secondary"
										>
											{testingIntelligence ? (
												<>
													<Loader2 className="mr-2 h-4 w-4 animate-spin" />
													Analyzing
												</>
											) : (
												"Test Intelligence"
											)}
										</Button>
									</div>
								)}
							</div>
						</div>
					</div>
				</div>
			</CardContent>
		</Card>
	);
}
