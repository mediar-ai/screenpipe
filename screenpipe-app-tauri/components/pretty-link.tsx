import { cn } from "@/lib/utils";

export function PrettyLink({
  href,
  children,
  variant = "filled",
  className,
}: {
  href: string;
  children: React.ReactNode;
  variant?: "filled" | "outline";
  className?: string;
}) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className={cn(
        className,
        "inline-flex items-center rounded-md px-4 py-2",
        "text-sm font-medium shadow-sm",
        "focus:outline-none focus:ring-2",
        "focus:ring-gray-500 focus:ring-offset-2 transition-colors duration-200",
        variant === "filled"
          ? "bg-gray-600 text-white hover:bg-gray-700"
          : "bg-transparent text-gray-600 border border-gray-600 hover:bg-gray-100"
      )}
    >
      {children}
    </a>
  );
}
