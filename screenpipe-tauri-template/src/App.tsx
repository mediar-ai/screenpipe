import { useState } from "react";
import reactLogo from "./assets/react.svg";
import tauriLogo from "./assets/tauri.svg";
import viteLogo from "./assets/vite.svg";
import screenpipeLogo from "./assets/screenpipe.png";
import { invoke } from "@tauri-apps/api/core";
import { useVision } from "../hooks/useVision";
import "./App.css";

function App() {
	const [greetMsg, setGreetMsg] = useState("");
	const [name, setName] = useState("");
	const { text } = useVision();

	async function greet() {
		// Learn more about Tauri commands at https://tauri.app/develop/calling-rust/
		setGreetMsg(await invoke("greet", { name }));
	}

	return (
		<main className="container">
			<h1>Welcome to Screenpipe + Tauri</h1>

			<div>
				<p>First 50 characters detected on screen:</p>
				<p>{text.substring(0, 50)}</p>
			</div>

			<div className="row">
				<a href="https://screenpi.pe/" target="_blank">
					<img
						src={screenpipeLogo}
						className="logo screenpipe"
						alt="React logo"
					/>
				</a>
				<a href="https://tauri.app" target="_blank">
					<img
						src={tauriLogo}
						className="logo tauri"
						alt="Tauri logo"
					/>
				</a>
				<a href="https://vitejs.dev" target="_blank">
					<img src={viteLogo} className="logo vite" alt="Vite logo" />
				</a>
				<a href="https://reactjs.org" target="_blank">
					<img
						src={reactLogo}
						className="logo react"
						alt="Screenpipe logo"
					/>
				</a>
			</div>
			<p>
				Click on the Screenpipe, Tauri, Vite, and React logos to learn
				more.
			</p>

			<form
				className="row"
				onSubmit={(e) => {
					e.preventDefault();
					greet();
				}}
			>
				<input
					id="greet-input"
					onChange={(e) => setName(e.currentTarget.value)}
					placeholder="Enter a name..."
				/>
				<button type="submit">Greet</button>
			</form>
			<p>{greetMsg}</p>
		</main>
	);
}

export default App;
