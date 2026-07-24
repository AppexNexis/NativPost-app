// Provisioning job definitions (docs §7). The create_account job + its operator
// checklist that a paid/fulfilled order spins up. Pure — no db/Env.

export const PROVISIONING_TASK_TYPES = [
  'create_account',
  'apply_profile',
  'add_bio',
  'prepare_first_posts',
] as const;

export type NewProvisioningJob = {
  job: {
    orgId: string;
    managedAccountId: string;
    jobType: 'create_account';
    state: 'queued';
    priority: number;
  };
  tasks: { taskType: string; sequence: number }[];
};

export function buildProvisioningJob(input: {
  orgId: string;
  managedAccountId: string;
  priority?: number;
}): NewProvisioningJob {
  return {
    job: {
      orgId: input.orgId,
      managedAccountId: input.managedAccountId,
      jobType: 'create_account',
      state: 'queued',
      priority: input.priority ?? 1,
    },
    tasks: PROVISIONING_TASK_TYPES.map((taskType, sequence) => ({
      taskType,
      sequence,
    })),
  };
}

/** After marking `completedTaskId` done, is every task in the job now done? */
export function allTasksDoneAfter(
  tasks: { id: string; status: string }[],
  completedTaskId: string,
): boolean {
  return tasks.every(t =>
    t.id === completedTaskId ? true : t.status === 'done',
  );
}
