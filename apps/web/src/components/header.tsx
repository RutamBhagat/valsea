import { useLocation } from "@tanstack/react-router";
import { SidebarTrigger } from "@valsea/ui/components/sidebar";

const pageTitles: Record<string, string> = {
  "/": "Compare",
  "/benchmark": "Benchmark",
  "/dashboard": "Dashboard",
};

export default function Header() {
  const location = useLocation();
  const title = pageTitles[location.pathname] ?? "valsea";

  return (
    <header className="flex h-12 shrink-0 items-center gap-2 border-b bg-background px-3 md:hidden">
      <SidebarTrigger />
      <span className="text-sm font-medium">{title}</span>
    </header>
  );
}
