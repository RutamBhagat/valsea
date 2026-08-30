import { Link, useLocation } from "@tanstack/react-router";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarRail,
  useSidebar,
} from "@valsea/ui/components/sidebar";
import { AudioLinesIcon, FlaskConicalIcon, GaugeIcon } from "lucide-react";

import UserMenu from "./user-menu";

const navigation = [
  { label: "Compare", to: "/", icon: AudioLinesIcon, exact: true },
  { label: "Benchmark", to: "/benchmark", icon: GaugeIcon, exact: false },
] as const;

export default function AppSidebar() {
  const location = useLocation();
  const { toggleSidebar } = useSidebar();

  return (
    <Sidebar collapsible="icon">
      <SidebarHeader>
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton
              aria-label="Toggle workspace navigation"
              className="group-data-[collapsible=icon]:bg-foreground group-data-[collapsible=icon]:text-background"
              onClick={toggleSidebar}
              tooltip="Toggle sidebar"
            >
              <FlaskConicalIcon />
              <span className="truncate text-sm font-semibold tracking-tight">valsea</span>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarHeader>

      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupLabel>Workspace</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {navigation.map((item) => {
                const isActive = item.exact
                  ? location.pathname === item.to
                  : location.pathname.startsWith(item.to);

                return (
                  <SidebarMenuItem key={item.label}>
                    <SidebarMenuButton
                      isActive={isActive}
                      render={<Link to={item.to} />}
                      tooltip={item.label}
                    >
                      <item.icon />
                      <span>{item.label}</span>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                );
              })}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>

      <SidebarFooter className="border-t">
        <UserMenu placement="sidebar" />
      </SidebarFooter>
      <SidebarRail />
    </Sidebar>
  );
}
