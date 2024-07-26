import { cn } from "@/lib/utils";

export function PrettyLink({
  href,
  children,
}: {
  href: string;
  children: React.ReactNode;
}) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className={cn(
        "inline-flex items-center rounded-md bg-gray-600 px-4 py-2",
        "text-sm font-medium text-white shadow-sm",
        "hover:bg-gray-700 focus:outline-none focus:ring-2",
        "focus:ring-gray-500 focus:ring-offset-2 transition-colors duration-200"
      )}
    >
      {children}
    </a>
  );
}
