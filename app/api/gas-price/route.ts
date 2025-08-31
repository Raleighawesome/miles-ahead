import { NextRequest, NextResponse } from 'next/server';
import { scrapeGasPrice } from '../../../lib/gas';

export async function GET(req: NextRequest) {
  const stationId = req.nextUrl.searchParams.get('stationId');
  if (!stationId) {
    return NextResponse.json({ error: 'stationId query parameter is required' }, { status: 400 });
  }

  const price = await scrapeGasPrice(stationId);
  if (price == null) {
    return NextResponse.json({ error: 'Failed to fetch gas price' }, { status: 500 });
  }

  return NextResponse.json({ price });
}
