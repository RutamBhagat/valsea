import { createFileRoute, redirect } from "@tanstack/react-router";

import BrandLogo from "@/components/logo/brand-logo";
import SignInForm from "@/components/sign-in-form";
import { authClient } from "@/lib/auth-client";

export const Route = createFileRoute("/login")({
  ssr: false,
  beforeLoad: async () => {
    const session = await authClient.getSession();
    if (session.data) {
      throw redirect({ to: "/" });
    }
  },
  component: LoginPage,
});

function LoginPage() {
  return (
    <main className="grid min-h-svh lg:grid-cols-2">
      <section className="flex flex-col gap-4 p-6 md:p-10">
        <div className="flex items-center gap-3 font-medium">
          <BrandLogo className="size-10" />
          <span className="text-lg font-semibold tracking-tight">valsea</span>
        </div>

        <div className="flex flex-1 items-center justify-center">
          <div className="w-full max-w-xs">
            <SignInForm />
          </div>
        </div>
      </section>

      <section className="hidden items-center justify-center bg-brand-panel lg:flex">
        <div className="flex items-center gap-5">
          <div className="flex size-20 items-center justify-center bg-background">
            <BrandLogo className="size-14" />
          </div>
          <span className="text-lg font-medium tracking-[0.35em] text-brand-panel-foreground">
            valsea
          </span>
        </div>
      </section>
    </main>
  );
}
