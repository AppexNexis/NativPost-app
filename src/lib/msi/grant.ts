// Authorization grant enforcement (docs §2, §4.1). The compliance spine: no
// managed account may be provisioned without an ACTIVE grant that covers the
// requested platform + country. Pure logic — no `db`, no `Env`.

/** Thrown when provisioning is attempted without a valid, in-scope grant. */
export class GrantRequiredError extends Error {
  constructor(message = 'an active authorization grant is required') {
    super(message);
    this.name = 'GrantRequiredError';
  }
}

export type GrantScope = {
  platforms?: string[];
  countries?: string[];
};

export type GrantLike = {
  status: string;
  revokedAt: Date | null;
  scope?: unknown;
};

export type ScopeRequest = {
  platform: string;
  country: string;
};

/** A grant is usable only while explicitly active and not revoked. */
export function isGrantActive(
  grant: GrantLike | null | undefined,
): grant is GrantLike {
  return Boolean(grant) && grant!.status === 'active' && !grant!.revokedAt;
}

/**
 * Does the grant authorize this platform + country? An empty (or missing)
 * platform/country list means "all" for that dimension.
 */
export function grantCoversScope(grant: GrantLike, req: ScopeRequest): boolean {
  const scope = (grant.scope ?? {}) as GrantScope;
  const platformOk =
    !scope.platforms?.length || scope.platforms.includes(req.platform);
  const countryOk =
    !scope.countries?.length || scope.countries.includes(req.country);
  return platformOk && countryOk;
}

/** Assert the grant is active, narrowing away null/undefined. */
export function assertActiveGrant<T extends GrantLike>(
  grant: T | null | undefined,
): asserts grant is T {
  if (!isGrantActive(grant)) {
    throw new GrantRequiredError();
  }
}

/** Assert the grant authorizes the requested platform + country. */
export function assertGrantCoversScope(
  grant: GrantLike,
  req: ScopeRequest,
): void {
  if (!grantCoversScope(grant, req)) {
    throw new GrantRequiredError(
      `grant does not authorize ${req.platform} in ${req.country}`,
    );
  }
}
