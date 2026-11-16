import { redirect } from "next/navigation";
import { hasUser } from "@/app/actions/auth";
import { SetupForm } from "./setup-form";

export const dynamic = "force-dynamic";
export const metadata = { title: "Set up" };

export default async function SetupPage() {
  if (await hasUser()) redirect("/login");
  const needsCode = Boolean(process.env.SETUP_CODE) || process.env.NODE_ENV === "production";
  return <SetupForm needsCode={needsCode} />;
}
