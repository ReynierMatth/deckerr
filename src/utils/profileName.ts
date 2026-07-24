/** The subset of a profile needed to render its shown name. */
export interface ProfileNameFields {
  display_name?: string | null;
  handle?: string | null;
  username?: string | null;
}

/**
 * The shown name for a profile: `display_name` when set, otherwise the always-set
 * `@handle`. Falls back to the legacy `username` for any not-yet-migrated row so
 * the UI never renders an empty label (and never a bare "Unknown").
 */
export function profileDisplayName(profile: ProfileNameFields | null | undefined): string {
  return profile?.display_name || profile?.handle || profile?.username || 'User';
}

/** The `@handle` secondary label, or null when there is no handle to show. */
export function profileHandleLabel(profile: ProfileNameFields | null | undefined): string | null {
  return profile?.handle ? `@${profile.handle}` : null;
}

/** Client-side handle rule mirrored from the DB constraint: lowercase [a-z0-9_], 3-20. */
export const HANDLE_PATTERN = /^[a-z0-9_]{3,20}$/;
