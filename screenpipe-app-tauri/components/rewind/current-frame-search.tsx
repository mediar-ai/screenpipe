import { MainImage } from "./image-card";
import { cn } from "@/lib/utils";

export const CurrentFrame = () => {
	return (
		<div
			className={cn(
				"grid md:gap-4 gap-y-4 w-4/5 mx-auto min-h-[40%] max-h-[50%] max-w-[55vw] overflow-hidden",
			)}
		>
			<div className={cn("relative group w-full")}>
				<MainImage />
			</div>
		</div>
	);
};
