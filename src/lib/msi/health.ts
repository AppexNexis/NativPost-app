// Account performance / health score (docs §11.3). Composite of five
// dimensions → an overall 0–100. Pure; fed by real analytics once available.

export type HealthInputs = {
  health?: number;
  growth?: number;
  consistency?: number;
  compliance?: number;
  brandMatch?: number;
};

export type HealthDimension = { label: string; value: number };

export type HealthScore = {
  overall: number;
  dimensions: HealthDimension[];
};

function clamp(n: number): number {
  return Math.max(0, Math.min(100, Math.round(n)));
}

export function computeHealthScore(inputs: HealthInputs): HealthScore {
  const dimensions: HealthDimension[] = [
    { label: 'Health', value: clamp(inputs.health ?? 0) },
    { label: 'Growth', value: clamp(inputs.growth ?? 0) },
    { label: 'Consistency', value: clamp(inputs.consistency ?? 0) },
    { label: 'Compliance', value: clamp(inputs.compliance ?? 100) },
    { label: 'Brand match', value: clamp(inputs.brandMatch ?? 0) },
  ];
  const overall = Math.round(
    dimensions.reduce((sum, d) => sum + d.value, 0) / dimensions.length,
  );
  return { overall, dimensions };
}

/** Tone bucket for a 0–100 score, for badge colouring. */
export function scoreTone(score: number): 'live' | 'warn' | 'danger' {
  if (score >= 80) {
    return 'live';
  }
  if (score >= 60) {
    return 'warn';
  }
  return 'danger';
}
