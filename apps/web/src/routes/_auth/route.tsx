import { Outlet, createFileRoute, redirect } from "@tanstack/react-router";
import { SidebarInset, SidebarProvider } from "@valsea/ui/components/sidebar";
import type { CSSProperties } from "react";

import AppSidebar from "@/components/app-sidebar";
import Header from "@/components/header";
import { authClient } from "@/lib/auth-client";

export const Route = createFileRoute("/_auth")({
  ssr: false,
  component: AuthLayout,
  beforeLoad: async () => {
    const session = await authClient.getSession();
    if (!session.data) {
      throw redirect({
        to: "/login",
      });
    }
    return { session };
  },
});

function AuthLayout() {
  return (
    <SidebarProvider
      className="h-svh min-h-0"
      style={{ "--sidebar-width": "13rem" } as CSSProperties}
    >
      <AppSidebar />
      <SidebarInset className="h-svh min-w-0 overflow-hidden bg-muted/30">
        <Header />
        <div className="min-h-0 flex-1 overflow-auto">
          <Outlet />
        </div>
      </SidebarInset>
    </SidebarProvider>
  );
}
