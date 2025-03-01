import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { SearchCommand } from "@/components/search-command";
import { NuqsAdapter } from "nuqs/adapters/next/app";
import { getScreenpipeAppSettings } from "@/lib/actions/get-screenpipe-app-settings";
import { SettingsProvider } from "@/components/settings-provider";

const geistSans = Geist({
	variable: "--font-geist-sans",
	subsets: ["latin"],
});

const geistMono = Geist_Mono({
	variable: "--font-geist-mono",
	subsets: ["latin"],
});

export const metadata: Metadata = {
	title: "Timeline • Screenpipe",
	description: "View your screenpipe recordings in a timeline",
};

export const dynamic = "force-dynamic";

export default async function RootLayout({
	children,
}: Readonly<{
	children: React.ReactNode;
}>) {
	const checkSettings = async () => {
		try {
			const settings = await getScreenpipeAppSettings();

			return settings.enableFrameCache;
		} catch (error) {
			console.error("Failed to load settings:", error);
			return false;
		}
	};

	const enabled = await checkSettings();

	return (
		<html lang="en">
			<body
				className={`${geistSans.variable} ${geistMono.variable} antialiased`}
			>
				<SettingsProvider>
					{!enabled ? (
						<div className="flex items-center justify-center h-screen">
							<div className="text-center space-y-4">
								<h2 className="text-xl font-medium">Frame Cache Disabled</h2>
								<p className="text-muted-foreground">
									Please enable frame cache in settings to use the timeline
									feature.
								</p>
							</div>
						</div>
					) : (
						<>
							<NuqsAdapter>
								<SearchCommand />
								{children}
							</NuqsAdapter>
						</>
					)}
				</SettingsProvider>
			</body>
		</html>
	);
}
