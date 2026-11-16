import { TrendingDownIcon } from "lucide-react";

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="grid min-h-dvh place-items-center bg-muted/40 px-4 py-10">
      <div className="w-full max-w-sm">
        <div className="mb-6 flex flex-col items-center gap-3 text-center">
          <span className="grid size-11 place-items-center rounded-xl bg-primary text-primary-foreground">
            <TrendingDownIcon className="size-5" />
          </span>
          <div>
            <h1 className="text-xl font-semibold">Smart Debt Planner</h1>
            <p className="text-sm text-muted-foreground">Personal AI Financial Assistant</p>
          </div>
        </div>
        {children}
      </div>
    </div>
  );
}
