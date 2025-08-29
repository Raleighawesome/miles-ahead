#!/bin/bash
echo "🚀 Miles Tracker Environment Setup"
echo "=================================="
echo ""

# Check if .env.local already exists
if [ -f ".env.local" ]; then
    echo "⚠️  .env.local already exists. Backing it up as .env.local.backup"
    cp .env.local .env.local.backup
fi

# Copy the example file
cp .env.example .env.local

echo "✅ Created .env.local from template"
echo ""
echo "📝 Now you need to edit .env.local with your Supabase credentials:"
echo ""
echo "1. Go to https://supabase.com/dashboard"
echo "2. Select your project (or create a new one)"
echo "3. Go to Settings > API"
echo "4. Copy the Project URL and anon public key"
echo ""
echo "Then edit .env.local and replace:"
echo "  - https://your-project.supabase.co with your Project URL"
echo "  - your-anon-key-here with your anon public key"
echo ""
echo "💡 Don't forget to run the SQL schema from supabase-schema.sql in your Supabase SQL editor!"
echo ""
echo "Once configured, start the app with: npm run dev"
