import { NextResponse } from 'next/server';

import { getAuthContext } from '@/lib/auth';
import { activateAddon, deactivateAddon, listOrgAddons } from '@/lib/msi/addon-service';
import { ADDON_CATALOG } from '@/lib/msi/addons';

// -----------------------------------------------------------
// GET /api/msi/addons
// The add-on catalog + this org's activation state (docs §19). Read-only.
// -----------------------------------------------------------
export async function GET() {
  const { error, orgId } = await getAuthContext();
  if (error) {
    return error;
  }
  try {
    const subscriptions = await listOrgAddons(orgId!);
    return NextResponse.json({ addons: ADDON_CATALOG, subscriptions }, { status: 200 });
  } catch (err) {
    console.error('Failed to fetch MSI add-ons:', err);
    return NextResponse.json({ error: 'Failed to fetch add-ons' }, { status: 500 });
  }
}

// -----------------------------------------------------------
// POST /api/msi/addons
// Activate or deactivate an add-on.
// body: { addonId: string, action: 'activate' | 'deactivate', tierId?: string }
// -----------------------------------------------------------
export async function POST(request: Request) {
  const { error, orgId } = await getAuthContext();
  if (error) {
    return error;
  }
  try {
    const body = await request.json().catch(() => ({}));
    const addonId = typeof body.addonId === 'string' ? body.addonId : '';
    const action = body.action === 'deactivate' ? 'deactivate' : 'activate';
    const tierId = typeof body.tierId === 'string' ? body.tierId : null;

    if (!addonId) {
      return NextResponse.json({ error: 'addonId is required' }, { status: 400 });
    }

    if (action === 'deactivate') {
      await deactivateAddon(orgId!, addonId);
      return NextResponse.json({ ok: true, addonId, status: 'cancelled' }, { status: 200 });
    }

    const result = await activateAddon(orgId!, addonId, tierId);
    if (!result.ok) {
      return NextResponse.json({ error: result.error }, { status: 400 });
    }
    return NextResponse.json(
      { ok: true, addonId, status: 'active', tierId },
      { status: 200 },
    );
  } catch (err) {
    console.error('Failed to update MSI add-on:', err);
    return NextResponse.json({ error: 'Failed to update add-on' }, { status: 500 });
  }
}
