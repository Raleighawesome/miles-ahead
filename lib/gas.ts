export async function scrapeGasPrice(stationId: string): Promise<number | null> {
  try {
    const res = await fetch(`https://www.gasbuddy.com/station/${stationId}`);
    const html = await res.text();
    const match = html.match(/"regular"\s*:\s*\{[^}]*"price"\s*:\s*(\d+\.\d+)/i);
    if (match) {
      return parseFloat(match[1]);
    }
  } catch (err) {
    console.error('Failed to fetch gas price', err);
  }
  return null;
}
