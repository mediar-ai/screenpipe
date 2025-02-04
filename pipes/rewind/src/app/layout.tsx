import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";

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
			const port = process.env.PORT || 3000;
			const response = await fetch(`http://localhost:${port}/api/settings`);
			const settings = await response.json();

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
					<>{children}</>
				)}
			</body>
		</html>
	);
}
