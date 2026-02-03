import React, { forwardRef, useEffect } from "react";
import { cn } from "@/lib/utils";

interface CustomScrollContainerProps
	extends React.HTMLAttributes<HTMLDivElement> {
	children: React.ReactNode;
	className?: string;
	onCustomScroll?: (scrollLeft: number) => void;
}

export const CustomScrollContainer = forwardRef<
	HTMLDivElement,
	CustomScrollContainerProps
>(({ children, className, onCustomScroll, ...props }, ref) => {
	useEffect(() => {
		const container = ref as React.RefObject<HTMLDivElement>;
		if (!container.current) return;

		const handleWheel = (e: WheelEvent) => {
			e.preventDefault();
			if (!container.current) return;

			const scrollAmount = e.deltaY;
			const newScrollLeft = container.current.scrollLeft + scrollAmount;

			container.current.scrollTo({
				left: newScrollLeft,
				behavior: "smooth",
			});

			onCustomScroll?.(newScrollLeft);
		};

		container.current.addEventListener("wheel", handleWheel, {
			passive: false,
		});

		return () => {
			container.current?.removeEventListener("wheel", handleWheel);
		};
	}, [ref, onCustomScroll]);

	return (
		<div
			ref={ref}
			className={cn("snap-x snap-mandatory scroll-smooth", className)}
			{...props}
		>
			{children}
		</div>
	);
});

CustomScrollContainer.displayName = "CustomScrollContainer";
