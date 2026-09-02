// Content Factory API — Demand
// Generates and manages content demands

import { NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { getDemandEngine } from '@/lib/content-engine/inventory/demand-engine';
import { getInventoryEngine } from '@/lib/content-engine/inventory/inventory-engine';

// ─── Admin Guard ─────────────────────────────────────────────────────────────

const NATIVPOST_TEAM_ORG_ID = process.env.NEXT_PUBLIC_NATIVPOST_TEAM_ORG_ID;

async function requireAdmin() {
  const { userId, orgId, orgRole } = await auth();

  if (!userId || !orgId) {
    return {
      error: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }),
      orgId: null,
    };
  }

  if (orgId !== NATIVPOST_TEAM_ORG_ID || orgRole !== 'org:admin') {
    return {
      error: NextResponse.json({ error: 'Forbidden' }, { status: 403 }),
      orgId: null,
    };
  }

  return { error: null, orgId };
}

// ─── GET /api/admin/factory/demand ───────────────────────────────────────────

export async function GET() {
  const { error, orgId } = await requireAdmin();
  if (error) return error;

  try {
    const demandEngine = getDemandEngine();
    const inventoryEngine = getInventoryEngine();

    // 1. Get inventory deficits
    const deficits = await inventoryEngine.getDeficits(orgId!);

    // 2. Generate demands
    const demands = await demandEngine.generateDemand(orgId!);

    // 3. Get inventory status for context
    const inventoryStatuses = await inventoryEngine.getInventoryStatus(orgId!);

    return NextResponse.json({
      deficits: deficits.map(d => ({
        contentTypeId: d.contentTypeId,
        deficit: d.deficit,
        priority: d.priority,
      })),
      demands: demands.map(d => ({
        id: d.id,
        contentTypeId: d.contentTypeId,
        contentType: d.contentType,
        priority: d.priority,
        count: d.count,
        brief: d.brief,
        status: d.status,
        createdAt: d.createdAt,
      })),
      inventory: inventoryStatuses.map(s => ({
        contentTypeId: s.contentTypeId,
        contentTypeName: s.contentTypeName,
        currentCount: s.currentCount,
        targetCount: s.targetCount,
        coverage: s.coverage,
        health: s.health,
      })),
    });
  } catch (err) {
    console.error('Demand error:', err);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 },
    );
  }
}

// ─── POST /api/admin/factory/demand ──────────────────────────────────────────

export async function POST(req: Request) {
  const { error, orgId } = await requireAdmin();
  if (error) return error;

  try {
    const body = await req.json();
    const { contentTypeId, count, briefOverrides } = body;

    if (!contentTypeId || !count) {
      return NextResponse.json(
        { error: 'contentTypeId and count are required' },
        { status: 400 },
      );
    }

    const demandEngine = getDemandEngine();
    const demand = await demandEngine.generateDemandForType(
      orgId!,
      contentTypeId,
      count,
      'medium',
      briefOverrides,
    );

    return NextResponse.json({ demand });
  } catch (err) {
    console.error('Create demand error:', err);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 },
    );
  }
}
