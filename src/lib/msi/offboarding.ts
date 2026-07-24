// Off-boarding (docs §9.2). A customer can request their managed account's
// credentials back; a staff release archives the account, deactivates its
// publish connection, and (externally, via the vault) rotates + hands over the
// credentials. Pure helpers here; the DB service is offboarding-service.ts.

export const OFFBOARDABLE_STATES = ['live', 'active', 'paused'] as const;

/** Only an operational account can be off-boarded. */
export function canOffboard(state: string): boolean {
  return (OFFBOARDABLE_STATES as readonly string[]).includes(state);
}
