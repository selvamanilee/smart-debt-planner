import { redirect } from "next/navigation";
import { hasUser } from "@/app/actions/auth";
import { LoginForm } from "./login-form";

export const dynamic = "force-dynamic";
export const metadata = { title: "Sign in" };

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ next?: string }> }) {
  if (!(await hasUser())) redirect("/setup");
  const { next } = await searchParams;
  return <LoginForm next={next} />;
}
