import { headers } from "next/headers";
import { redirect } from "next/navigation";

import { getNeonAuth } from "../lib/neon-auth";
import { sql } from "../lib/db";

export function usesNeonAuth() {
  return process.env.VERCEL === "1" || Boolean(process.env.NEON_AUTH_BASE_URL);
}

export type ChatGPTUser = {
  userId: string;
  displayName: string;
  email: string;
  fullName: string | null;
};

const USER_ID_HEADER = "oai-authenticated-user-id";
const USER_EMAIL_HEADER = "oai-authenticated-user-email";
const USER_FULL_NAME_HEADER = "oai-authenticated-user-full-name";
const USER_FULL_NAME_ENCODING_HEADER =
  "oai-authenticated-user-full-name-encoding";
const PERCENT_ENCODED_UTF8 = "percent-encoded-utf-8";
const SIGN_IN_PATH = "/signin-with-chatgpt";
const SIGN_OUT_PATH = "/signout-with-chatgpt";
const CALLBACK_PATH = "/callback";

export async function getChatGPTUser(): Promise<ChatGPTUser | null> {
  if (usesNeonAuth()) {
    const auth = getNeonAuth();
    if (!auth) return null;
    const { data } = await auth.getSession();
    const user = data?.user;
    if (!user) return null;
    const identity = 'neon:' + user.id;
    const [linked] = await sql('SELECT id FROM zenpay_sellers WHERE neon_identity=$1 OR id=$1 LIMIT 1', [identity]);
    let userId = linked?.id ?? identity;
    if (!linked) {
      const candidates = await sql('SELECT id FROM zenpay_sellers WHERE lower(email)=lower($1) AND neon_identity IS NULL LIMIT 2', [user.email]);
      if (candidates.length > 1 || (candidates.length === 1 && !user.emailVerified)) return null;
      if (candidates.length === 1) {
        const [claimed] = await sql('UPDATE zenpay_sellers SET neon_identity=$1 WHERE id=$2 AND (neon_identity IS NULL OR neon_identity=$1) RETURNING id', [identity, candidates[0].id]);
        if (!claimed) return null;
        userId = claimed.id;
      }
    }
    return { userId, email: user.email, displayName: user.name || user.email, fullName: user.name || null };
  }
  const requestHeaders = await headers();
  const userId = requestHeaders.get(USER_ID_HEADER);
  const email = requestHeaders.get(USER_EMAIL_HEADER);
  if (!userId || !email) return null;

  const encodedFullName = requestHeaders.get(USER_FULL_NAME_HEADER);
  const fullName =
    encodedFullName &&
    requestHeaders.get(USER_FULL_NAME_ENCODING_HEADER) === PERCENT_ENCODED_UTF8
      ? safeDecodeURIComponent(encodedFullName)
      : null;

  return {
    userId,
    displayName: fullName ?? email,
    email,
    fullName,
  };
}

export async function requireChatGPTUser(
  returnTo: string,
): Promise<ChatGPTUser> {
  const user = await getChatGPTUser();
  if (user) return user;

  redirect(chatGPTSignInPath(returnTo));
}

export function chatGPTSignInPath(returnTo: string): string {
  const safeReturnTo = safeRelativeReturnPath(returnTo);
  return `${SIGN_IN_PATH}?return_to=${encodeURIComponent(safeReturnTo)}`;
}

export function chatGPTSignOutPath(returnTo = "/"): string {
  const safeReturnTo = safeRelativeReturnPath(returnTo);
  return `${SIGN_OUT_PATH}?return_to=${encodeURIComponent(safeReturnTo)}`;
}

function safeRelativeReturnPath(value: string): string {
  if (!value.startsWith("/") || value.startsWith("//")) return "/";

  let url: URL;
  try {
    url = new URL(value, "https://app.local");
  } catch {
    return "/";
  }
  if (url.origin !== "https://app.local") return "/";
  if (isReservedAuthPath(url.pathname)) return "/";

  return `${url.pathname}${url.search}${url.hash}`;
}

function isReservedAuthPath(pathname: string): boolean {
  return (
    pathname === SIGN_IN_PATH ||
    pathname === SIGN_OUT_PATH ||
    pathname === CALLBACK_PATH
  );
}

function safeDecodeURIComponent(value: string): string | null {
  try {
    return decodeURIComponent(value);
  } catch {
    return null;
  }
}
