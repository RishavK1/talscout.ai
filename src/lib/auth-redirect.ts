const publicAppUrl = process.env.NEXT_PUBLIC_APP_URL?.replace(/\/+$/, "");

export function authCallbackUrl() {
  const origin = publicAppUrl || window.location.origin;
  return `${origin}/auth/callback`;
}
