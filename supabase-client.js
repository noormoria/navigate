import { createClient } from "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm";

const SUPABASE_URL = "https://ixrpgrpbthllzxgvyhor.supabase.co";
const SUPABASE_PUBLISHABLE_KEY = "sb_publishable_HzYHjl28QUAu3hA-Dkz5oQ_gOFy0VN9";

export const supabaseConfigured = Boolean(
  SUPABASE_URL &&
  SUPABASE_PUBLISHABLE_KEY
);

export const supabase = supabaseConfigured
  ? createClient(
      SUPABASE_URL,
      SUPABASE_PUBLISHABLE_KEY,
      {
        auth: {
          persistSession: true,
          autoRefreshToken: true,
          detectSessionInUrl: true
        }
      }
    )
  : null;
