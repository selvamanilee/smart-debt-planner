"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { LogOutIcon, MenuIcon, TrendingDownIcon } from "lucide-react";
import { NAV_ITEMS } from "./nav";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetTitle } from "@/components/ui/sheet";
import { ThemeToggle } from "./theme-toggle";
import { logoutAction } from "@/app/actions/auth";

function Brand() {
  return (
    <Link href="/" className="flex items-center gap-2.5 px-2">
      <span className="grid size-8 place-items-center rounded-lg bg-primary text-primary-foreground">
        <TrendingDownIcon className="size-4" />
      </span>
      <span className="leading-tight">
        <span className="block text-sm font-semibold">Smart Debt Planner</span>
        <span className="block text-xs text-muted-foreground">AI Financial Assistant</span>
      </span>
    </Link>
  );
}

function NavLinks({ onNavigate }: { onNavigate?: () => void }) {
  const pathname = usePathname();
  return (
    <nav className="flex flex-col gap-0.5" aria-label="Main">
      {NAV_ITEMS.map((item) => {
        const active = item.href === "/" ? pathname === "/" : pathname === item.href || pathname.startsWith(`${item.href}/`);
        const Icon = item.icon;
        return (
          <Link
            key={item.href}
            href={item.href}
            onClick={onNavigate}
            aria-current={active ? "page" : undefined}
            className={cn(
              "flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors",
              active ? "bg-sidebar-accent text-sidebar-accent-foreground" : "text-sidebar-foreground hover:bg-muted",
            )}
          >
            <Icon className="size-4 shrink-0" />
            {item.label}
          </Link>
        );
      })}
    </nav>
  );
}

function Footer() {
  return (
    <div className="flex items-center justify-between border-t border-sidebar-border px-3 pt-3">
      <form action={logoutAction}>
        <Button variant="ghost" size="sm" type="submit">
          <LogOutIcon /> Sign out
        </Button>
      </form>
      <ThemeToggle />
    </div>
  );
}

export function AppSidebar() {
  return (
    <aside className="sticky top-0 hidden h-dvh w-64 shrink-0 flex-col gap-6 border-r border-sidebar-border bg-sidebar py-5 lg:flex">
      <Brand />
      <div className="flex-1 overflow-y-auto px-3">
        <NavLinks />
      </div>
      <Footer />
    </aside>
  );
}

export function MobileHeader() {
  const [open, setOpen] = useState(false);
  return (
    <header className="sticky top-0 z-40 flex h-14 items-center justify-between border-b bg-background/95 px-4 backdrop-blur lg:hidden">
      <Button variant="ghost" size="icon" aria-label="Open navigation" onClick={() => setOpen(true)}>
        <MenuIcon />
      </Button>
      <span className="text-sm font-semibold">Smart Debt Planner</span>
      <ThemeToggle />
      <Sheet open={open} onOpenChange={setOpen}>
        <SheetContent className="gap-6 py-5" aria-describedby={undefined}>
          <SheetTitle className="sr-only">Navigation</SheetTitle>
          <Brand />
          <div className="flex-1 overflow-y-auto px-3">
            <NavLinks onNavigate={() => setOpen(false)} />
          </div>
          <Footer />
        </SheetContent>
      </Sheet>
    </header>
  );
}
