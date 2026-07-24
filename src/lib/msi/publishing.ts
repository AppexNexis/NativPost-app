// Go-live publishing (docs §5, §13). When a managed account is approved it is
// connected as a `social_account` row so it becomes a publish target alongside
// OAuth accounts. A managed connection carries NO OAuth tokens — publishing
// routes through the MSI execution layer (a publish_post job), identified by
// `accountType === 'managed'` + `metadata.managedAccountId`. Pure — no db/Env.

export const MANAGED_ACCOUNT_TYPE = 'managed';

export type ManagedAccountForConnection = {
  id: string;
  orgId: string;
  platform: string;
  displayName: string | null;
  handlePreferences: string[];
  executionStrategy: string | null;
};

/** Insert shape for the `social_account` row that connects a managed account. */
export type NewManagedSocialAccount = {
  orgId: string;
  platform: string;
  platformUsername: string | null;
  accountType: string;
  isActive: boolean;
  metadata: Record<string, unknown>;
};

export function buildManagedSocialAccount(
  account: ManagedAccountForConnection,
): NewManagedSocialAccount {
  const handle = account.displayName || account.handlePreferences?.[0] || null;
  return {
    orgId: account.orgId,
    platform: account.platform,
    platformUsername: handle,
    accountType: MANAGED_ACCOUNT_TYPE,
    isActive: true,
    // No accessToken/oauthToken — managed accounts publish via the execution
    // layer, not the OAuth path.
    metadata: {
      managedAccountId: account.id,
      executionStrategy: account.executionStrategy ?? null,
    },
  };
}

/** True when a social_account row is a managed connection (not OAuth). */
export function isManagedSocialAccount(row: {
  accountType?: string | null;
}): boolean {
  return row.accountType === MANAGED_ACCOUNT_TYPE;
}

/** Read the managed account id back off a connected social_account's metadata. */
export function managedAccountIdOf(row: {
  accountType?: string | null;
  metadata?: unknown;
}): string | null {
  if (!isManagedSocialAccount(row)) {
    return null;
  }
  const meta = (row.metadata ?? {}) as Record<string, unknown>;
  return typeof meta.managedAccountId === 'string' ? meta.managedAccountId : null;
}

// ---------------------------------------------------------------------------
// Publish routing — content targeting a managed account becomes a publish_post
// job on the execution pipeline (docs §13), not an OAuth publish.
// ---------------------------------------------------------------------------

export type PublishJobTask = { taskType: string; sequence: number };

export type NewPublishJob = {
  job: {
    orgId: string;
    managedAccountId: string;
    jobType: 'publish_post';
    state: 'queued';
    priority: number;
    contentItemId: string;
  };
  tasks: PublishJobTask[];
};

export function buildPublishJob(input: {
  orgId: string;
  managedAccountId: string;
  contentItemId: string;
  priority?: number;
}): NewPublishJob {
  return {
    job: {
      orgId: input.orgId,
      managedAccountId: input.managedAccountId,
      jobType: 'publish_post',
      state: 'queued',
      priority: input.priority ?? 0,
      contentItemId: input.contentItemId,
    },
    tasks: [
      { taskType: 'prepare_media', sequence: 0 },
      { taskType: 'publish', sequence: 1 },
    ],
  };
}
