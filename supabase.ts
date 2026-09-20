import { createClient } from "@supabase/supabase-js";

/**
 * SERVER-ONLY client. Uses the service role key, which bypasses RLS.
 * Import this only inside app/api/** route handlers — never in a
 * "use client" component, or the service role key would need to be
 * exposed to the browser (it must not be).
 */
export function getServiceClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    throw new Error(
      "Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY. Set them in .env.local / Vercel env vars."
    );
  }
  return createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}
