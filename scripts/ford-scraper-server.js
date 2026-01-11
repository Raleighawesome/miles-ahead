#!/usr/bin/env node
/**
 * Ford Vehicle Data Scraper - HTTP Server
 *
 * Simple HTTP server that scrapes Ford vehicle data on demand.
 * Deploy this on your server and call it from n8n.
 *
 * Usage:
 *   FORD_USERNAME=xxx FORD_PASSWORD=xxx node ford-scraper-server.js
 *
 * Environment Variables:
 *   FORD_USERNAME - FordPass email
 *   FORD_PASSWORD - FordPass password
 *   FORD_VIN - Vehicle VIN (optional)
 *   PORT - Server port (default: 3001)
 *   API_KEY - Optional API key for authentication
 *
 * Endpoints:
 *   GET /health - Health check
 *   GET /scrape - Scrape Ford data (returns JSON)
 *   GET /scrape?vin=XXX - Scrape specific vehicle
 */

const http = require('http');
const { chromium } = require('playwright');

const PORT = process.env.PORT || 3001;
const API_KEY = process.env.API_KEY;
const FORD_USERNAME = process.env.FORD_USERNAME;
const FORD_PASSWORD = process.env.FORD_PASSWORD;
const DEFAULT_VIN = process.env.FORD_VIN;

const LOGIN_URL = 'https://www.ford.com/myaccount/';
const DASHBOARD_URL = 'https://www.ford.com/support/vehicle-dashboard';

// Rate limiting - only allow one scrape at a time
let isScrapingInProgress = false;
let lastScrapeResult = null;
let lastScrapeTime = null;
const CACHE_DURATION_MS = 5 * 60 * 1000; // 5 minutes cache

async function scrapeFordData(vin) {
  if (!FORD_USERNAME || !FORD_PASSWORD) {
    throw new Error('FORD_USERNAME and FORD_PASSWORD environment variables are required');
  }

  const browser = await chromium.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-http2']
  });

  try {
    const context = await browser.newContext({
      userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
    });
    const page = await context.newPage();

    // Navigate to login page
    console.log('[Ford Scraper] Navigating to login page...');
    await page.goto(LOGIN_URL, { waitUntil: 'networkidle', timeout: 60000 });

    // Wait for login form
    await page.waitForSelector('input[type="email"], input[name="email"], input[placeholder*="mail"]', { timeout: 30000 });

    // Fill in email
    console.log('[Ford Scraper] Filling login form...');
    const emailInput = page.locator('input[type="email"], input[name="email"], input[placeholder*="mail"]').first();
    await emailInput.fill(FORD_USERNAME);

    // Fill in password
    const passwordInput = page.locator('input[type="password"]').first();
    await passwordInput.fill(FORD_PASSWORD);

    // Click sign in button
    const signInButton = page.locator('button:has-text("Sign In")').first();
    await signInButton.click();

    // Wait for navigation after login
    console.log('[Ford Scraper] Waiting for login to complete...');
    await page.waitForURL(/myaccount|vehicle-dashboard/, { timeout: 60000 });

    // Navigate to vehicle dashboard
    const targetVin = vin || DEFAULT_VIN;
    const dashboardUrl = targetVin
      ? `${DASHBOARD_URL}?vin=${targetVin}`
      : DASHBOARD_URL;

    console.log(`[Ford Scraper] Navigating to dashboard: ${dashboardUrl}`);
    await page.goto(dashboardUrl, { waitUntil: 'networkidle', timeout: 60000 });

    // Wait for vehicle data to load
    await page.waitForSelector('text=/\\d+,?\\d*\\s*MI/i', { timeout: 30000 });

    console.log('[Ford Scraper] Extracting vehicle data...');

    // Extract mileage
    const mileageText = await page.locator('text=/\\d+,?\\d+\\s*MI/i').first().textContent();
    const mileage = parseInt(mileageText.replace(/[^0-9]/g, ''));

    // Extract vehicle name
    let vehicle = '';
    try {
      vehicle = await page.locator('h2:has-text("F-150"), h2:has-text("F-250"), h2:has-text("Bronco"), h2:has-text("Mustang"), h2:has-text("Explorer"), h2:has-text("Escape"), h2:has-text("Edge"), h2:has-text("Ranger"), h2:has-text("Maverick")').first().textContent();
    } catch {
      vehicle = 'Unknown Vehicle';
    }

    // Extract VIN from URL or page
    let extractedVin = targetVin || '';
    try {
      const vinText = await page.locator('text=/VIN:\\s*[A-Z0-9]{17}/i').first().textContent();
      extractedVin = vinText.replace(/VIN:\s*/i, '').trim();
    } catch {
      const url = page.url();
      const vinMatch = url.match(/vin=([A-Z0-9]{17})/i);
      if (vinMatch) extractedVin = vinMatch[1];
    }

    // Extract fuel level (distance to empty)
    let fuelLevel = null;
    try {
      const fuelSection = page.locator('text=/Fuel Level/i').locator('..').locator('..');
      const fuelText = await fuelSection.locator('text=/\\d+\\s*MI/i').textContent();
      fuelLevel = parseInt(fuelText.replace(/[^0-9]/g, ''));
    } catch {
      try {
        const allMiText = await page.locator('text=/\\d+\\s*MI/i').all();
        for (const el of allMiText) {
          const text = await el.textContent();
          if (text && !text.includes(',')) {
            const num = parseInt(text.replace(/[^0-9]/g, ''));
            if (num < 1000) {
              fuelLevel = num;
              break;
            }
          }
        }
      } catch {}
    }

    // Extract oil life percentage
    let oilLife = null;
    try {
      const oilSection = page.locator('text=/Oil Life/i').locator('..').locator('..');
      const oilText = await oilSection.locator('text=/\\d+%/').textContent();
      oilLife = parseInt(oilText.replace(/[^0-9]/g, ''));
    } catch {
      try {
        const oilText = await page.locator('text=/\\d+%/').first().textContent();
        oilLife = parseInt(oilText.replace(/[^0-9]/g, ''));
      } catch {}
    }

    // Extract tire pressure
    let tirePressure = { frontLeft: null, frontRight: null, rearLeft: null, rearRight: null };
    try {
      const tirePressureSection = page.locator('article:has-text("Tire Pressure"), div:has-text("Tire Pressure")').first();
      const pressureValues = await tirePressureSection.locator('text=/^[LR]\\s*\\d{2}$/').all();

      if (pressureValues.length >= 4) {
        const values = [];
        for (const el of pressureValues) {
          const text = await el.textContent();
          const num = parseInt(text.replace(/[^0-9]/g, ''));
          values.push(num);
        }
        if (values.length >= 4) {
          tirePressure.frontLeft = values[0];
          tirePressure.frontRight = values[1];
          tirePressure.rearLeft = values[2];
          tirePressure.rearRight = values[3];
        }
      }
    } catch {}

    await browser.close();
    console.log('[Ford Scraper] Scrape completed successfully');

    return {
      mileage,
      fuelLevel,
      oilLife,
      tirePressure,
      vin: extractedVin,
      vehicle: vehicle.trim(),
      scrapedAt: new Date().toISOString()
    };

  } catch (error) {
    await browser.close();
    throw error;
  }
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://localhost:${PORT}`);
  const path = url.pathname;

  // Set CORS headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Content-Type', 'application/json');

  // API key check
  if (API_KEY) {
    const authHeader = req.headers['authorization'];
    const providedKey = authHeader?.replace('Bearer ', '') || url.searchParams.get('api_key');
    if (providedKey !== API_KEY) {
      res.statusCode = 401;
      res.end(JSON.stringify({ success: false, error: 'Unauthorized' }));
      return;
    }
  }

  if (path === '/health') {
    res.statusCode = 200;
    res.end(JSON.stringify({
      success: true,
      status: 'healthy',
      isScrapingInProgress,
      lastScrapeTime,
      cacheAge: lastScrapeTime ? Date.now() - new Date(lastScrapeTime).getTime() : null
    }));
    return;
  }

  if (path === '/scrape') {
    const vin = url.searchParams.get('vin');
    const forceRefresh = url.searchParams.get('force') === 'true';

    // Return cached result if available and not expired
    if (!forceRefresh && lastScrapeResult && lastScrapeTime) {
      const cacheAge = Date.now() - new Date(lastScrapeTime).getTime();
      if (cacheAge < CACHE_DURATION_MS) {
        console.log('[Ford Scraper] Returning cached result');
        res.statusCode = 200;
        res.end(JSON.stringify({
          success: true,
          cached: true,
          cacheAge: Math.round(cacheAge / 1000),
          data: lastScrapeResult
        }));
        return;
      }
    }

    // Check if scrape is already in progress
    if (isScrapingInProgress) {
      res.statusCode = 429;
      res.end(JSON.stringify({
        success: false,
        error: 'Scrape already in progress. Please wait.',
        retryAfter: 60
      }));
      return;
    }

    isScrapingInProgress = true;
    console.log('[Ford Scraper] Starting scrape...');

    try {
      const data = await scrapeFordData(vin);
      lastScrapeResult = data;
      lastScrapeTime = data.scrapedAt;
      isScrapingInProgress = false;

      res.statusCode = 200;
      res.end(JSON.stringify({
        success: true,
        cached: false,
        data
      }));
    } catch (error) {
      isScrapingInProgress = false;
      console.error('[Ford Scraper] Error:', error.message);

      res.statusCode = 500;
      res.end(JSON.stringify({
        success: false,
        error: error.message
      }));
    }
    return;
  }

  // Default 404
  res.statusCode = 404;
  res.end(JSON.stringify({ success: false, error: 'Not found' }));
});

server.listen(PORT, () => {
  console.log(`[Ford Scraper] Server running on port ${PORT}`);
  console.log(`[Ford Scraper] Endpoints:`);
  console.log(`  GET /health - Health check`);
  console.log(`  GET /scrape - Scrape Ford data`);
  console.log(`  GET /scrape?vin=XXX - Scrape specific vehicle`);
  console.log(`  GET /scrape?force=true - Force refresh (bypass cache)`);

  if (!FORD_USERNAME || !FORD_PASSWORD) {
    console.warn('[Ford Scraper] WARNING: FORD_USERNAME and FORD_PASSWORD not set!');
  }
  if (API_KEY) {
    console.log('[Ford Scraper] API key authentication enabled');
  }
});
