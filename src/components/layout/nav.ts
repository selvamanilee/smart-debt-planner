import {
  BotIcon,
  CalendarCheckIcon,
  CreditCardIcon,
  FileBarChartIcon,
  FlagIcon,
  LandmarkIcon,
  LayoutDashboardIcon,
  ReceiptIcon,
  RouteIcon,
  SettingsIcon,
  UserIcon,
  WalletIcon,
} from "lucide-react";

export const NAV_ITEMS = [
  { href: "/", label: "Dashboard", icon: LayoutDashboardIcon },
  { href: "/profile", label: "Financial Profile", icon: UserIcon },
  { href: "/income", label: "Income", icon: WalletIcon },
  { href: "/expenses", label: "Expenses", icon: ReceiptIcon },
  { href: "/loans", label: "My Loans", icon: LandmarkIcon },
  { href: "/credit-cards", label: "Credit Cards", icon: CreditCardIcon },
  { href: "/planner", label: "Repayment Planner", icon: RouteIcon },
  { href: "/assistant", label: "AI Financial Assistant", icon: BotIcon },
  { href: "/goal", label: "Debt-Free Goal", icon: FlagIcon },
  { href: "/monthly-review", label: "Monthly Review", icon: CalendarCheckIcon },
  { href: "/reports", label: "Reports", icon: FileBarChartIcon },
  { href: "/settings", label: "Settings", icon: SettingsIcon },
] as const;
