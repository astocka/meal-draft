import { SITE_URL } from "astro:env/server";

export function getSiteUrl(): string | undefined {
  return SITE_URL;
}
