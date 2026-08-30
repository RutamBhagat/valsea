import { Link } from "@tanstack/react-router";
import { buttonVariants } from "@valsea/ui/components/button";

import BrandLogo from "./logo/brand-logo";
import UserMenu from "./user-menu";

export default function Header() {
  return (
    <header className="sticky top-0 flex h-14 shrink-0 items-center border-b bg-background">
      <div className="mx-auto flex w-full max-w-5xl items-center gap-3 px-4 md:px-8">
        <Link to="/" className="flex items-center gap-2.5">
          <BrandLogo className="size-10" />
          <span className="hidden text-lg font-semibold tracking-tight sm:inline">valsea</span>
        </Link>

        <nav aria-label="Application" className="flex items-center gap-1">
          <Link
            to="/"
            activeOptions={{ exact: true }}
            activeProps={{ className: "bg-muted text-foreground" }}
            className={buttonVariants({ variant: "ghost", size: "sm" })}
          >
            Compare
          </Link>
          <Link
            to="/benchmark"
            activeProps={{ className: "bg-muted text-foreground" }}
            className={buttonVariants({ variant: "ghost", size: "sm" })}
          >
            Benchmark
          </Link>
        </nav>

        <div className="ml-auto flex items-center gap-2">
          <UserMenu />
        </div>
      </div>
    </header>
  );
}
