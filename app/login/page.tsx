import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { getSessionUser } from "../../lib/auth-server";
import ManagerApp from "../components/manager-app";

export const dynamic = "force-dynamic";

export default async function LoginPage() {
  const request = new Request("https://stoics.lokwensio.com/login", { headers: await headers() });
  if (await getSessionUser(request)) redirect("/overview");
  return <ManagerApp loginOnly />;
}
