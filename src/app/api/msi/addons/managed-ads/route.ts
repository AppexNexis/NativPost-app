import { NextResponse } from 'next/server';

import { getAuthContext } from '@/lib/auth';
import { createCampaign, listCampaigns } from '@/lib/msi/managed-ads-service';

// GET /api/msi/addons/managed-ads — the org's ad campaigns.
export async function GET() {
  const { error, orgId } = await getAuthContext();
  if (error) {
    return error;
  }
  try {
    const campaigns = await listCampaigns(orgId!);
    return NextResponse.json({ campaigns }, { status: 200 });
  } catch (err) {
    console.error('Failed to fetch ad campaigns:', err);
    return NextResponse.json({ error: 'Failed to fetch campaigns' }, { status: 500 });
  }
}

// POST /api/msi/addons/managed-ads { managedAccountId, name, platform, managementPct, objective? }
export async function POST(request: Request) {
  const { error, orgId } = await getAuthContext();
  if (error) {
    return error;
  }
  try {
    const body = await request.json().catch(() => ({}));
    const managedAccountId = typeof body.managedAccountId === 'string' ? body.managedAccountId : '';
    const name = typeof body.name === 'string' ? body.name : '';
    const platform = typeof body.platform === 'string' ? body.platform : '';
    const managementPct = Number(body.managementPct);
    const objective = typeof body.objective === 'string' ? body.objective : undefined;

    if (!managedAccountId || !name.trim() || !platform) {
      return NextResponse.json(
        { error: 'managedAccountId, name and platform are required' },
        { status: 400 },
      );
    }

    const result = await createCampaign({
      orgId: orgId!,
      managedAccountId,
      name,
      platform,
      managementPct,
      objective,
    });
    if (!result.ok) {
      return NextResponse.json({ error: result.error }, { status: 400 });
    }
    return NextResponse.json(result, { status: 201 });
  } catch (err) {
    console.error('Failed to create ad campaign:', err);
    return NextResponse.json({ error: 'Failed to create campaign' }, { status: 500 });
  }
}
