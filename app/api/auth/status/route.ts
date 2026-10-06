import { getSessionUser } from "../../../../lib/auth-server";

export async function GET(request: Request) {
  const username = await getSessionUser(request);
  return Response.json({ authenticated: Boolean(username), username });
}

