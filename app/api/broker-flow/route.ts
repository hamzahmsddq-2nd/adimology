import { NextRequest, NextResponse } from 'next/server';
import type { BrokerFlowResponse } from '@/lib/types';

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  const emiten = searchParams.get('emiten');
  const lookbackDays = searchParams.get('lookback_days') || '7';
  const brokerStatus = searchParams.get('broker_status') || 'Bandar,Whale,Retail,Mix';

  if (!emiten) {
    return NextResponse.json(
      { success: false, error: 'Missing emiten parameter' },
      { status: 400 }
    );
  }

  try {
    // Transform brokerStatus for the upstream API: 'Mix' -> 'Retail / Bandar'
    const upstreamBrokerStatus = brokerStatus
      .split(',')
      .map(s => s.trim() === 'Mix' ? 'Retail / Bandar' : s.trim())
      .join(',');

    // Using the official API subdomain with full query arguments
    const url = new URL('https://api.tradersaham.com/api/market-insight/broker-intelligence');
    url.searchParams.set('limit', '100');
    url.searchParams.set('page', '1');
    url.searchParams.set('sort_by', 'consistency');
    url.searchParams.set('mode', 'accum');
    url.searchParams.set('lookback_days', lookbackDays);
    url.searchParams.set('broker_status', upstreamBrokerStatus);
    url.searchParams.set('search', emiten.toLowerCase());

    const response = await fetch(url.toString(), {
      method: 'GET',
      headers: {
        'Accept': 'application/json, text/plain, */*',
        'Accept-Language': 'en-US,en;q=0.9',
        'Cache-Control': 'no-cache',
        'Pragma': 'no-cache',
        // Emulate a real web browser to avoid Cloudflare/WAF block screens
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
        'Origin': 'https://tradersaham.com',
        'Referer': 'https://tradersaham.com/',
      },
      cache: 'no-store',
    });

    // Capture response as text first to verify data integrity before parsing
    const responseText = await response.text();
    
    // Safety check: If the response is HTML, it's a block/404 screen, not data
    if (responseText.trim().startsWith('<!doctype') || responseText.trim().startsWith('<html')) {
      throw new Error('Tradersaham security wall blocked the automated cloud request. Try refreshing.');
    }

    if (!response.ok) {
      throw new Error(`Tradersaham API returned status ${response.status}`);
    }

    const rawData = JSON.parse(responseText);
    
    // Map 'Retail / Bandar' back to 'Mix' in the response activities
    if (rawData && rawData.activities) {
      rawData.activities = rawData.activities.map((activity: any) => ({
        ...activity,
        broker_status: activity.broker_status === 'Retail / Bandar' ? 'Mix' : activity.broker_status
      }));
    }

    return NextResponse.json({
      success: true,
      data: rawData,
    });
  } catch (error) {
    console.error('Broker Flow API error:', error);
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : 'Failed to fetch broker flow data' },
      { status: 500 }
    );
  }
}
