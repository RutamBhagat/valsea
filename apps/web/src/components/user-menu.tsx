import { Link, useNavigate } from "@tanstack/react-router";
import { Avatar, AvatarFallback, AvatarImage } from "@valsea/ui/components/avatar";
import { Button } from "@valsea/ui/components/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@valsea/ui/components/dropdown-menu";
import { SidebarMenu, SidebarMenuButton, SidebarMenuItem } from "@valsea/ui/components/sidebar";
import { Skeleton } from "@valsea/ui/components/skeleton";
import { ChevronsUpDownIcon, LogOutIcon } from "lucide-react";

import { authClient } from "@/lib/auth-client";

type UserMenuProps = {
  placement?: "header" | "sidebar";
};

function initials(name: string) {
  return name
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part.charAt(0).toUpperCase())
    .join("");
}

export default function UserMenu({ placement = "header" }: UserMenuProps) {
  const navigate = useNavigate();
  const { data: session, isPending } = authClient.useSession();

  if (isPending) {
    return <Skeleton className={placement === "sidebar" ? "h-12 w-full" : "size-8"} />;
  }

  if (!session) {
    return (
      <Link to="/login">
        <Button variant="outline">Sign in</Button>
      </Link>
    );
  }

  const trigger =
    placement === "sidebar" ? (
      <SidebarMenuButton size="lg" tooltip={session.user.name} />
    ) : (
      <Button variant="ghost" size="icon" aria-label={session.user.name} />
    );

  const menu = (
    <DropdownMenu>
      <DropdownMenuTrigger render={trigger}>
        <Avatar size={placement === "sidebar" ? "default" : "sm"}>
          {session.user.image ? (
            <AvatarImage src={session.user.image} alt={session.user.name} />
          ) : null}
          <AvatarFallback>{initials(session.user.name)}</AvatarFallback>
        </Avatar>
        {placement === "sidebar" ? (
          <>
            <span className="grid min-w-0 flex-1 text-left leading-tight">
              <span className="truncate font-medium">{session.user.name}</span>
              <span className="truncate text-xs text-sidebar-foreground/60">
                {session.user.email}
              </span>
            </span>
            <ChevronsUpDownIcon />
          </>
        ) : null}
      </DropdownMenuTrigger>
      <DropdownMenuContent side={placement === "sidebar" ? "right" : "bottom"} align="end">
        <DropdownMenuGroup>
          <DropdownMenuLabel className="max-w-56 truncate">{session.user.email}</DropdownMenuLabel>
        </DropdownMenuGroup>
        <DropdownMenuSeparator />
        <DropdownMenuGroup>
          <DropdownMenuItem
            variant="destructive"
            onClick={() => {
              authClient.signOut({
                fetchOptions: {
                  onSuccess: () => navigate({ to: "/login" }),
                },
              });
            }}
          >
            <LogOutIcon />
            Sign out
          </DropdownMenuItem>
        </DropdownMenuGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );

  if (placement === "sidebar") {
    return (
      <SidebarMenu>
        <SidebarMenuItem>{menu}</SidebarMenuItem>
      </SidebarMenu>
    );
  }

  return menu;
}
