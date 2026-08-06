/**
 * Discover which auth providers an instance has enabled, so the login screen
 * only offers the ones that will actually work on the chosen instance
 * (different self-host instances enable different providers).
 *
 * Supabase exposes this at the public GET `<url>/auth/v1/settings` endpoint
 * (CORS-open, so it's reachable from the Capacitor WebView origin). The shape
 * is `{ external: { google: bool, discord: bool, email: bool, … } }`.
 */

export interface EnabledProviders {
  google: boolean;
  discord: boolean;
}

const NONE: EnabledProviders = { google: false, discord: false };

export async function getEnabledProviders(
  url: string,
  anonKey: string,
): Promise<EnabledProviders> {
  try {
    const base = url.replace(/\/+$/, '');
    const res = await fetch(`${base}/auth/v1/settings`, {
      headers: { apikey: anonKey },
    });
    if (!res.ok) return NONE;
    const data = (await res.json()) as { external?: Record<string, boolean> };
    const external = data.external ?? {};
    return {
      google: Boolean(external.google),
      discord: Boolean(external.discord),
    };
  } catch {
    // Network/parse failure — hide OAuth rather than show buttons that error.
    return NONE;
  }
}
