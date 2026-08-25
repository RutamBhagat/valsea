import { cn } from "@valsea/ui/lib/utils";

export default function BrandLogo({ className }: { className?: string }) {
  return (
    <img
      src="/logo.webp"
      alt="valsea"
      width={160}
      height={160}
      className={cn("size-12 object-cover", className)}
    />
  );
}
