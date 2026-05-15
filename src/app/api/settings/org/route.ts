/**
 * GET  /api/settings/org   — return org settings JSON
 * PATCH /api/settings/org  — update org settings JSON
 */

import { eq } from 'drizzle-orm';
import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';

import { getAuthContext } from '@/lib/auth';
import { getDb } from '@/libs/DB';
import { organizationSchema } from '@/models/Schema';

const DEFAULT_SETTINGS = {
  timezone: 'Africa/Lagos',
  contentLanguage: 'en',
  defaultContentMode: 'normal',
  defaultPlatforms: ['instagram', 'linkedin'],
  defaultVariantCount: 3,
  hashtagStrategy: 'auto',
  hashtagCount: 8,
  antiSlopThreshold: 0.7,
  autoSchedule: false,
  defaultPostTime: '09:00',
};

export async function GET(_request: NextRequest) {
  const { error, orgId } = await getAuthContext();
  if (error) return error;

  try {
    const db = await getDb();
    const [org] = await db
      .select({ settings: organizationSchema.settings })
      .from(organizationSchema)
      .where(eq(organizationSchema.id, orgId!))
      .limit(1);

    const settings = {
      ...DEFAULT_SETTINGS,
      ...(org?.settings as object ?? {}),
    };

    return NextResponse.json(settings);
  } catch (err) {
    console.error('[settings/org] GET failed:', err);
    return NextResponse.json({ error: 'Failed to load settings' }, { status: 500 });
  }
}

export async function PATCH(request: NextRequest) {
  const { error, orgId } = await getAuthContext();
  if (error) return error;

  try {
    const body = await request.json() as Record<string, unknown>;

    // Allowlist the fields that can be saved — never blindly spread
    const allowed = [
      'timezone', 'contentLanguage', 'defaultContentMode',
      'defaultPlatforms', 'defaultVariantCount', 'hashtagStrategy',
      'hashtagCount', 'antiSlopThreshold', 'autoSchedule', 'defaultPostTime',
    ];

    const sanitized: Record<string, unknown> = {};
    for (const key of allowed) {
      if (key in body) sanitized[key] = body[key];
    }

    const db = await getDb();

    // Merge with existing settings
    const [org] = await db
      .select({ settings: organizationSchema.settings })
      .from(organizationSchema)
      .where(eq(organizationSchema.id, orgId!))
      .limit(1);

    const existing = (org?.settings as Record<string, unknown>) ?? {};
    const merged = { ...existing, ...sanitized };

    await db
      .update(organizationSchema)
      .set({ settings: merged, updatedAt: new Date() })
      .where(eq(organizationSchema.id, orgId!));

    return NextResponse.json({ ok: true, settings: merged });
  } catch (err) {
    console.error('[settings/org] PATCH failed:', err);
    return NextResponse.json({ error: 'Failed to save settings' }, { status: 500 });
  }
}
