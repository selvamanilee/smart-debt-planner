"use client";
import { Button } from "@/components/ui/button";

export default function ErrorPage({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <div className="grid min-h-dvh place-items-center bg-muted/40 px-4">
      <div className="w-full max-w-md rounded-xl border bg-card p-6 text-center shadow-xs">
        <h1 className="text-lg font-semibold">Something went wrong</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          The page could not load. If this is a new deployment, open{" "}
          <a className="font-medium text-foreground underline" href="/api/health">/api/health</a> to check the database
          connection and environment variables.
        </p>
        {error.digest ? <p className="mt-2 font-mono text-xs text-muted-foreground">Reference: {error.digest}</p> : null}
        <div className="mt-4 flex justify-center gap-2">
          <Button onClick={reset}>Try again</Button>
          <Button variant="outline" asChild><a href="/">Go to dashboard</a></Button>
        </div>
      </div>
    </div>
  );
}
