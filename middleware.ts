import { NextRequest, NextResponse } from 'next/server'

// Get allowed IPs from environment variable, fallback to hardcoded list
const ALLOWED_IPS = process.env.ALLOWED_IPS
  ? process.env.ALLOWED_IPS.split(',')
  : [
      '136.61.6.179', // Your current home IP
      '104.28.138.17', // Your phone's mobile data IP
      // Add any other home computer IPs if they're different
    ]

export function middleware(request: NextRequest) {
  // Get the client IP address
  const ip = request.headers.get('x-forwarded-for')?.split(',')[0]
    || request.headers.get('x-real-ip')
    || request.headers.get('cf-connecting-ip') // Cloudflare
    || 'unknown'

  console.log(`Access attempt from IP: ${ip}`)

  // Check if the IP is in the allowed list
  if (!ALLOWED_IPS.includes(ip)) {
    console.log(`Blocked access from IP: ${ip}`)
    
    // Return a 403 Forbidden response
    return new NextResponse(
      JSON.stringify({ 
        error: 'Access denied', 
        message: 'Your IP address is not authorized to access this application.',
        timestamp: new Date().toISOString()
      }),
      {
        status: 403,
        headers: {
          'Content-Type': 'application/json',
        },
      }
    )
  }

  // Allow the request to proceed
  console.log(`Allowed access from IP: ${ip}`)
  return NextResponse.next()
}

// Configure which routes this middleware should run on
export const config = {
  // Apply to all routes except static files and API routes you might want to exclude
  matcher: [
    /*
     * Match all request paths except for the ones starting with:
     * - _next/static (static files)
     * - _next/image (image optimization files)
     * - favicon.ico (favicon file)
     */
    '/((?!_next/static|_next/image|favicon.ico).*)',
  ],
}
