#!/usr/bin/env node
/**
 * Ford Vehicle Data Scraper
 *
 * Scrapes mileage, fuel level, oil life, and tire pressure from Ford.com
 * Uses Playwright for browser automation.
 *
 * Usage:
 *   node ford-scraper.js
 *
 * Environment Variables:
 *   FORD_USERNAME - FordPass email
 *   FORD_PASSWORD - FordPass password
 *   FORD_VIN - Vehicle VIN (optional, uses first vehicle if not specified)
 *
 * Output: JSON to stdout
 *   {
 *     "success": true,
 *     "data": {
 *       "mileage": 19026,
 *       "fuelLevel": 339,
 *       "oilLife": 65,
 *       "tirePressure": { "frontLeft": 37, "frontRight": 37, "rearLeft": 38, "rearRight": 38 },
 *       "vin": "1FTFW1ED8PFD05022",
 *       "vehicle": "2023 F-150",
 *       "scrapedAt": "2026-01-10T22:15:00.000Z"
 *     }
 *   }
 */

const { chromium } = require('playwright');

const FORD_USERNAME = process.env.FORD_USERNAME;
const FORD_PASSWORD = process.env.FORD_PASSWORD;
const FORD_VIN = process.env.FORD_VIN;

const LOGIN_URL = 'https://www.ford.com/myaccount/';
const DASHBOARD_URL = 'https://www.ford.com/support/vehicle-dashboard';

async function scrapeFordData() {
  if (!FORD_USERNAME || !FORD_PASSWORD) {
    return {
      success: false,
      error: 'FORD_USERNAME and FORD_PASSWORD environment variables are required'
    };
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
    await page.goto(LOGIN_URL, { waitUntil: 'networkidle', timeout: 60000 });

    // Wait for login form
    await page.waitForSelector('input[type="email"], input[name="email"], input[placeholder*="mail"]', { timeout: 30000 });

    // Fill in email
    const emailInput = page.locator('input[type="email"], input[name="email"], input[placeholder*="mail"]').first();
    await emailInput.fill(FORD_USERNAME);

    // Fill in password
    const passwordInput = page.locator('input[type="password"]').first();
    await passwordInput.fill(FORD_PASSWORD);

    // Click sign in button
    const signInButton = page.locator('button:has-text("Sign In")').first();
    await signInButton.click();

    // Wait for navigation after login
    await page.waitForURL(/myaccount|vehicle-dashboard/, { timeout: 60000 });

    // Navigate to vehicle dashboard
    const dashboardUrl = FORD_VIN
      ? `${DASHBOARD_URL}?vin=${FORD_VIN}`
      : DASHBOARD_URL;

    await page.goto(dashboardUrl, { waitUntil: 'networkidle', timeout: 60000 });

    // Wait for vehicle data to load
    await page.waitForSelector('text=/\\d+,?\\d*\\s*MI/i', { timeout: 30000 });

    // Extract mileage
    const mileageText = await page.locator('text=/\\d+,?\\d+\\s*MI/i').first().textContent();
    const mileage = parseInt(mileageText.replace(/[^0-9]/g, ''));

    // Extract vehicle name
    let vehicle = '';
    try {
      vehicle = await page.locator('h2:has-text("F-150"), h2:has-text("F-250"), h2:has-text("Bronco"), h2:has-text("Mustang"), h2:has-text("Explorer"), h2:has-text("Escape"), h2:has-text("Edge")').first().textContent();
    } catch {
      vehicle = 'Unknown Vehicle';
    }

    // Extract VIN
    let vin = FORD_VIN || '';
    try {
      const vinText = await page.locator('text=/VIN:\\s*[A-Z0-9]{17}/i').first().textContent();
      vin = vinText.replace(/VIN:\s*/i, '').trim();
    } catch {
      // Use URL VIN if available
      const url = page.url();
      const vinMatch = url.match(/vin=([A-Z0-9]{17})/i);
      if (vinMatch) vin = vinMatch[1];
    }

    // Extract fuel level (distance to empty)
    let fuelLevel = null;
    try {
      const fuelSection = page.locator('text=/Fuel Level/i').locator('..').locator('..');
      const fuelText = await fuelSection.locator('text=/\\d+\\s*MI/i').textContent();
      fuelLevel = parseInt(fuelText.replace(/[^0-9]/g, ''));
    } catch {
      // Try alternative selector
      try {
        const allMiText = await page.locator('text=/\\d+\\s*MI/i').all();
        for (const el of allMiText) {
          const text = await el.textContent();
          if (text && !text.includes(',')) { // Fuel is usually smaller number without comma
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

      // Look for the pressure values (typically 2-digit numbers like 37, 38)
      const pressureValues = await tirePressureSection.locator('text=/^[LR]\\s*\\d{2}$/').all();

      if (pressureValues.length >= 4) {
        // Front Left, Front Right, Rear Left, Rear Right
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

    return {
      success: true,
      data: {
        mileage,
        fuelLevel,
        oilLife,
        tirePressure,
        vin,
        vehicle: vehicle.trim(),
        scrapedAt: new Date().toISOString()
      }
    };

  } catch (error) {
    await browser.close();
    return {
      success: false,
      error: error.message,
      stack: error.stack
    };
  }
}

// Run and output JSON
scrapeFordData()
  .then(result => {
    console.log(JSON.stringify(result, null, 2));
    process.exit(result.success ? 0 : 1);
  })
  .catch(error => {
    console.log(JSON.stringify({
      success: false,
      error: error.message
    }));
    process.exit(1);
  });
