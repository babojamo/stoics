import { isAuthorized } from "../../../../lib/auth-server";

export async function GET(request: Request) {
  return Response.json({ authenticated: await isAuthorized(request) });
}

