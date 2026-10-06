export async function POST(request: Request) {
  const secure = new URL(request.url).protocol === "https:" ? "; Secure" : "";
  return new Response(JSON.stringify({ ok: true }), {
    headers: {
      "content-type": "application/json",
      "set-cookie": `stoics_session=; Path=/; HttpOnly${secure}; SameSite=Strict; Max-Age=0`,
    },
  });
}

