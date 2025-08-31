export async function scrapeGasPrice(stationId: string): Promise<number | null> {
  try {
    const res = await fetch(`https://www.gasbuddy.com/station/${stationId}`, {
      headers: {
        'User-Agent':
          'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/108.0.0.0 Safari/537.36',
        'Accept-Language': 'en-US,en;q=0.9'
      }
    });
    const html = await res.text();
    const match = html.match(/<span[^>]*FuelTypePriceDisplay-module__price[^>]*>\$(\d+\.\d{2})<\/span>/i);
    if (match) {
      return parseFloat(match[1]);
    }
  } catch (err) {
    console.error('Failed to fetch gas price', err);
  }
  return null;
}
