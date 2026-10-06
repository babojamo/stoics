declare namespace Cloudflare {
  interface Env {
    NEXT_PUBLIC_SUPABASE_URL?: string;
    NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY?: string;
    STOICS_MANAGER_USERNAME?: string;
    STOICS_MANAGER_PASSWORD?: string;
    STOICS_SESSION_SECRET?: string;
    DB?: D1Database;
    BUCKET?: R2Bucket;
  }
}
