#!/bin/bash

# Script to create admin user for LiteNews_AI
# Make sure your server is running on http://localhost:4250

echo "Step 1: Login to get JWT token..."
TOKEN=$(curl -s -X POST http://localhost:4250/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"password":"12345678"}' | grep -o '"token":"[^"]*' | cut -d'"' -f4)

if [ -z "$TOKEN" ]; then
  echo "❌ Failed to get token. Make sure:"
  echo "   1. Server is running on http://localhost:4250"
  echo "   2. JWT_SECRET in .env matches the password (12345678)"
  exit 1
fi

echo "✅ Token obtained: ${TOKEN:0:20}..."
echo ""
echo "Step 2: Creating admin user..."

RESPONSE=$(curl -s -X POST http://localhost:4250/api/users \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $TOKEN" \
  -d '{
    "name": "admin",
    "age": 25
  }')

echo "$RESPONSE" | python3 -m json.tool 2>/dev/null || echo "$RESPONSE"

echo ""
echo "✅ Admin user created! You can now use the frontend to set preferences."
