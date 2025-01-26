import { pipe } from "@screenpipe/browser";
import { useEffect, useState } from "react";

export function useVision() {
	const [text, setText] = useState("");

	useEffect(() => {
		(async () => {
			for await (const frame of pipe.streamVision()) {
				setText(frame.data.text);
			}
		})();
	}, []);

	return {
		text,
	};
}
