import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';

import { getAuthContext } from '@/lib/auth';
import { assessCountryCapacity } from '@/lib/msi/capacity-service';

// -----------------------------------------------------------
// GET /api/msi/capacity?country=US&platform=tiktok&quantity=10
// Read-only capacity/ETA preview for the order flow (docs §6).
// Does NOT reserve or provision anything.
// -----------------------------------------------------------
export async function GET(request: NextRequest) {
  const { error } = await getAuthContext();
  if (error) {
    return error;
  }

  const { searchParams } = new URL(request.url);
  const country = searchParams.get('country') ?? 'US';
  const platform = searchParams.get('platform') ?? 'tiktok';
  const quantity = Number(searchParams.get('quantity') ?? '1');

  if (!Number.isFinite(quantity) || quantity < 1) {
    return NextResponse.json(
      { error: 'quantity must be a positive number' },
      { status: 400 },
    );
  }

  try {
    const assessment = await assessCountryCapacity(country, platform, quantity);
    return NextResponse.json({ assessment }, { status: 200 });
  } catch (err) {
    console.error('Capacity assessment failed:', err);
    return NextResponse.json(
      { error: 'Failed to assess capacity' },
      { status: 500 },
    );
  }
}
