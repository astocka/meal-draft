/// <reference types="@cloudflare/workers-types" />

declare namespace App {
  interface Locals {
    user: import("@supabase/supabase-js").User | null;
  }
}
