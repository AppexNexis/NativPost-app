// Content Intelligence Engine — Model Router
// Phase 2: Intelligent model selection
//
// The router takes a content request and determines the best model/provider
// combination based on requirements, cost, and provider health.
//
// It should NOT care which API happens to provide the generation.

import type {
  Model,
  ModelType,
  AspectRatio,
  GenerationRequest,
  GenerationInput,
} from './types';
import { providerRegistry } from './registry';

// ─── Routing Criteria ───────────────────────────────────────────────────────

/** What the router needs to know to pick a model. */
export interface RoutingCriteria {
  /** The type of content to generate. */
  type: ModelType;

  /** Whether a reference image is required. */
  requiresImage?: boolean;

  /** Whether audio is required. */
  requiresAudio?: boolean;

  /** Desired aspect ratio. */
  aspectRatio?: AspectRatio;

  /** Desired duration in seconds (for video). */
  duration?: number;

  /** Maximum cost per call in USD. */
  maxCost?: number;

  /** Preferred provider ID (optional). */
  preferredProvider?: string;

  /** Required capabilities (e.g., nativeAudio, lipSync). */
  requiredCapabilities?: string[];
}

/** The result of model routing. */
export interface RoutingResult {
  /** The selected model. */
  model: Model;

  /** The provider that serves this model. */
  providerId: string;

  /** Why this model was selected (for debugging). */
  reason: string;
}

// ─── Router ─────────────────────────────────────────────────────────────────

/**
 * ModelRouter selects the best model for a generation request.
 *
 * It considers:
 * - Model type matching
 * - Aspect ratio support
 * - Cost constraints
 * - Provider priority
 * - Required capabilities
 */
export class ModelRouter {
  /**
   * Find the best model for the given criteria.
   *
   * Selection strategy:
   * 1. Filter by type
   * 2. Filter by aspect ratio support
   * 3. Filter by image/audio requirements
   * 4. Filter by cost constraints
   * 5. Filter by required capabilities
   * 6. Sort by provider priority (desc), then cost (asc)
   * 7. Return the best match
   */
  findModel(criteria: RoutingCriteria): RoutingResult | null {
    const candidates = this.getCandidates(criteria);

    if (candidates.length === 0) {
      return null;
    }

    // Sort: higher provider priority first, then lower cost
    candidates.sort((a, b) => {
      const providerA = providerRegistry.getProvider(a.model.providerId);
      const providerB = providerRegistry.getProvider(b.model.providerId);
      const priorityA = providerA?.priority ?? 0;
      const priorityB = providerB?.priority ?? 0;

      if (priorityB !== priorityA) return priorityB - priorityA;

      // Lower cost is better
      const costA = a.model.costPerCall ?? Infinity;
      const costB = b.model.costPerCall ?? Infinity;
      return costA - costB;
    });

    const best = candidates[0];
    if (!best) return null;

    return {
      model: best.model,
      providerId: best.model.providerId,
      reason: best.reason,
    };
  }

  /**
   * Find all matching models (for UI display or batch operations).
   */
  findModels(criteria: RoutingCriteria): RoutingResult[] {
    return this.getCandidates(criteria).map((c) => ({
      model: c.model,
      providerId: c.model.providerId,
      reason: c.reason,
    }));
  }

  /**
   * Build a GenerationRequest from user input and selected model.
   */
  buildRequest(
    modelId: string,
    orgId: string,
    input: GenerationInput,
    webhookUrl?: string,
  ): GenerationRequest | null {
    const model = providerRegistry.getModel(modelId);
    if (!model) return null;

    return {
      modelId: model.id,
      orgId,
      kind: model.type,
      input,
      webhookUrl,
    };
  }

  // ─── Private ────────────────────────────────────────────────────────────

  private getCandidates(
    criteria: RoutingCriteria,
  ): Array<{ model: Model; reason: string }> {
    const allModels = providerRegistry.getModels();
    const candidates: Array<{ model: Model; reason: string }> = [];

    for (const model of allModels) {
      const result = this.evaluateModel(model, criteria);
      if (result) {
        candidates.push(result);
      }
    }

    return candidates;
  }

  private evaluateModel(
    model: Model,
    criteria: RoutingCriteria,
  ): { model: Model; reason: string } | null {
    // 1. Type match
    if (model.type !== criteria.type) return null;

    // 2. Aspect ratio support
    if (criteria.aspectRatio && !model.aspects.includes(criteria.aspectRatio)) {
      return null;
    }

    // 3. Image requirement
    if (criteria.requiresImage && !model.requiresImage) return null;

    // 4. Audio requirement
    if (criteria.requiresAudio && !model.requiresAudio) return null;

    // 5. Cost constraint
    if (
      criteria.maxCost !== undefined &&
      model.costPerCall !== null &&
      model.costPerCall > criteria.maxCost
    ) {
      return null;
    }

    // 6. Preferred provider
    if (
      criteria.preferredProvider &&
      model.providerId !== criteria.preferredProvider
    ) {
      return null;
    }

    // 7. Required capabilities
    if (criteria.requiredCapabilities) {
      for (const cap of criteria.requiredCapabilities) {
        if (!model.capabilities[cap]) return null;
      }
    }

    // 8. Duration support
    if (criteria.duration && model.durations) {
      if (!model.durations.includes(criteria.duration)) return null;
    }

    // Build reason
    const reasons: string[] = [];
    reasons.push(`type=${model.type}`);
    if (criteria.aspectRatio) reasons.push(`aspect=${criteria.aspectRatio}`);
    if (model.costPerCall !== null) reasons.push(`cost=$${model.costPerCall}`);
    reasons.push(`provider=${model.providerId}`);

    return {
      model,
      reason: reasons.join(', '),
    };
  }
}

// ─── Singleton ──────────────────────────────────────────────────────────────

const globalForRouter = globalThis as unknown as {
  __contentEngineRouter?: ModelRouter;
};

export const modelRouter =
  globalForRouter.__contentEngineRouter ?? new ModelRouter();

if (process.env.NODE_ENV !== 'production') {
  globalForRouter.__contentEngineRouter = modelRouter;
}
