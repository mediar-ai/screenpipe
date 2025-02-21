import { Search } from "lucide-react";
import { Input } from "./ui/input";

export const SearchBar = ({
	search,
	onSearchChange,
	disabled,
}: {
	search: string | null;
	onSearchChange: (value: string) => void;
	disabled?: boolean;
}) => {
	return (
		<div className="relative w-full">
			<Input
				type="input"
				placeholder="Search..."
				className="pl-10 h-full bg-white/80 backdrop-blur-sm border border-neutral-200 rounded-lg shadow-sm transition-all duration-200 focus:shadow-md"
				value={search || ""}
				onChange={(e) => {
					onSearchChange(e.target.value);
				}}
				disabled={disabled}
			/>
			<Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-neutral-400 w-5 h-5" />
		</div>
	);
};
