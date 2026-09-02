// Content Intelligence Engine — Provider Registry
// Phase 2: Central registry for providers and models
//
// The registry is the single source of truth for what providers and models exist.
// It replaces the hardcoded AI_STUDIO_MODELS array with a dynamic, DB-backed registry
// that falls back to seed data when the DB is unavailable.

import { eq } from 'drizzle-orm';
import { db } from '@/lib/db';
import { providerSchema, modelSchema } from '@/models/Schema';
import type {
  Provider,
  Model,
  ProviderCapability,
  ModelType,
  AspectRatio,
} from './types';

// ─── Registry ───────────────────────────────────────────────────────────────

/**
 * ProviderRegistry manages providers and models.
 *
 * It loads from the database (provider + model tables seeded in 0061)
 * and exposes lookup methods for the rest of the system.
 */
export class ProviderRegistry {
  private providers = new Map<string, Provider>();
  private models = new Map<string, Model>();
  private loaded = false;

  /**
   * Load providers and models from the database.
   * Falls back to empty if DB is unavailable.
   */
  async load(): Promise<void> {
    if (this.loaded) return;

    try {
      // Load providers
      const dbProviders = await db
        .select()
        .from(providerSchema)
        .where(eq(providerSchema.isActive, true));

      for (const row of dbProviders) {
        const provider = this.mapDbProvider(row);
        this.providers.set(provider.id, provider);
      }

      // Load models
      const dbModels = await db
        .select()
        .from(modelSchema)
        .where(eq(modelSchema.isActive, true));

      for (const row of dbModels) {
        const model = this.mapDbModel(row);
        this.models.set(model.id, model);
      }

      this.loaded = true;
    } catch (error) {
      console.error('[ProviderRegistry] Failed to load from DB:', error);
      // Don't throw — allow fallback to empty registry
      this.loaded = true;
    }
  }

  /**
   * Register a provider programmatically (for adapters).
   */
  registerProvider(provider: Provider): void {
    this.providers.set(provider.id, provider);
  }

  /**
   * Register a model programmatically.
   */
  registerModel(model: Model): void {
    this.models.set(model.id, model);
  }

  /**
   * Get a provider by ID.
   */
  getProvider(id: string): Provider | undefined {
    return this.providers.get(id);
  }

  /**
   * Get all active providers.
   */
  getProviders(): Provider[] {
    return Array.from(this.providers.values());
  }

  /**
   * Get providers by capability.
   */
  getProvidersByCapability(capability: ProviderCapability): Provider[] {
    return this.getProviders().filter(
      (p) => p.type === capability && p.isActive,
    );
  }

  /**
   * Get a model by ID.
   */
  getModel(id: string): Model | undefined {
    return this.models.get(id);
  }

  /**
   * Get all active models.
   */
  getModels(): Model[] {
    return Array.from(this.models.values());
  }

  /**
   * Get models by type.
   */
  getModelsByType(type: ModelType): Model[] {
    return this.getModels().filter((m) => m.type === type && m.isActive);
  }

  /**
   * Get models by provider.
   */
  getModelsByProvider(providerId: string): Model[] {
    return this.getModels().filter((m) => m.providerId === providerId);
  }

  /**
   * Get models that match given requirements.
   */
  getModelsMatching(criteria: {
    type?: ModelType;
    requiresImage?: boolean;
    requiresAudio?: boolean;
    aspectRatio?: AspectRatio;
    maxCost?: number;
    providerId?: string;
  }): Model[] {
    return this.getModels().filter((m) => {
      if (criteria.type && m.type !== criteria.type) return false;
      if (criteria.requiresImage !== undefined && m.requiresImage !== criteria.requiresImage) return false;
      if (criteria.requiresAudio !== undefined && m.requiresAudio !== criteria.requiresAudio) return false;
      if (criteria.aspectRatio && !m.aspects.includes(criteria.aspectRatio)) return false;
      if (criteria.maxCost !== undefined && m.costPerCall !== null && m.costPerCall > criteria.maxCost) return false;
      if (criteria.providerId && m.providerId !== criteria.providerId) return false;
      return m.isActive;
    });
  }

  /**
   * Get the provider for a given model.
   */
  getProviderForModel(modelId: string): Provider | undefined {
    const model = this.getModel(modelId);
    if (!model) return undefined;
    return this.getProvider(model.providerId);
  }

  // ─── DB Mapping ─────────────────────────────────────────────────────────

  private mapDbProvider(row: typeof providerSchema.$inferSelect): Provider {
    const config = (row.config ?? {}) as Record<string, unknown>;
    return {
      id: row.id,
      name: row.name,
      type: row.type as ProviderCapability,
      config: {
        envVar: config.env_var as string | undefined,
        baseUrl: config.base_url as string | undefined,
        ...config,
      },
      isActive: row.isActive,
      priority: row.priority,
      // Provider methods will be set by adapter registration
      submitJob: async () => { throw new Error(`Provider ${row.id} not registered`); },
      getJobStatus: async () => { throw new Error(`Provider ${row.id} not registered`); },
      getJobResult: async () => { throw new Error(`Provider ${row.id} not registered`); },
      cancelJob: async () => { throw new Error(`Provider ${row.id} not registered`); },
    };
  }

  private mapDbModel(row: typeof modelSchema.$inferSelect): Model {
    const caps = (row.capabilities ?? {}) as Record<string, unknown>;
    return {
      id: row.id,
      label: row.name,
      providerId: row.providerId,
      type: this.mapModelType(row.type),
      providerModelId: row.id, // Default; adapters can override
      costPerCall: row.costPerCall,
      costPerSecond: row.costPerSecond,
      isActive: row.isActive,
      aspects: (caps.aspects as AspectRatio[]) ?? [],
      durations: caps.durations as number[] | undefined,
      requiresImage: (caps.requires_image as boolean) ?? false,
      requiresAudio: (caps.requires_audio as boolean) ?? false,
      capabilities: {
        maxDuration: caps.max_duration as number | undefined,
        nativeAudio: caps.native_audio as boolean | undefined,
        lipSync: caps.multilingual_lipsync as boolean | undefined,
        ...caps,
      },
    };
  }

  private mapModelType(dbType: string): ModelType {
    const typeMap: Record<string, ModelType> = {
      image: 'image',
      'image-edit': 'image-edit',
      video: 'video',
      'video-lipsync': 'video-lipsync',
      audio: 'audio',
      text: 'text',
    };
    return typeMap[dbType] ?? 'image';
  }
}

// ─── Singleton ──────────────────────────────────────────────────────────────

const globalForRegistry = globalThis as unknown as {
  __contentEngineRegistry?: ProviderRegistry;
};

export const providerRegistry =
  globalForRegistry.__contentEngineRegistry ??
  new ProviderRegistry();

if (process.env.NODE_ENV !== 'production') {
  globalForRegistry.__contentEngineRegistry = providerRegistry;
}
