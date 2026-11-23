const encoder = new TextEncoder();
const challenge = 'Basic realm="MFL Results", charset="UTF-8"';

export async function checkAccess(request, password, headers) {
  const url = new URL(request.url);
  if (url.protocol === "http:" && !["localhost", "127.0.0.1", "[::1]"].includes(url.hostname)) {
    url.protocol = "https:";
    return Response.redirect(url, 308);
  }
  if (!password) {
    return new Response("Set the MFL_ADMIN_PASSWORD Worker secret to open MFL Results.", {
      status: 503, headers,
    });
  }

  const encoded = request.headers.get("Authorization")?.match(/^Basic ([\w+/]+={0,2})$/i)?.[1];
  let received;
  if (encoded) {
    try {
      received = Uint8Array.from(atob(encoded), char => char.charCodeAt(0));
    } catch {
      // Issue the standard sign-in challenge for malformed credentials.
    }
  }
  if (received) {
    const [provided, expected] = await Promise.all([
      crypto.subtle.digest("SHA-256", received),
      crypto.subtle.digest("SHA-256", encoder.encode("admin:" + password)),
    ]);
    if (crypto.subtle.timingSafeEqual(provided, expected)) return null;
  }

  return new Response("Sign in to MFL Results.", {
    status: 401, headers: { ...headers, "WWW-Authenticate": challenge },
  });
}
