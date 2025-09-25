#!/bin/bash

echo "🔄 Socket.IO Client Retry Mechanism Demo"
echo "======================================="
echo ""

echo "📋 Available retry options:"
echo "• --max-retries: Maximum number of retry attempts (default: 3)"
echo "• --retry-delay: Base delay between retries in ms (default: 1000ms)"
echo ""

echo "🧪 Example commands with retry configuration:"
echo ""

echo "1. Basic test with default retry settings (3 retries, 1000ms base delay):"
echo "   npm run test:1k"
echo ""

echo "2. Custom retry configuration:"
echo "   node dist/benchmark.js run --connections 500 --max-retries 5 --retry-delay 2000"
echo ""

echo "3. Disable retries (max-retries = 0):"
echo "   node dist/benchmark.js run --connections 100 --max-retries 0"
echo ""

echo "4. Quick test with custom retry settings:"
echo "   node dist/benchmark.js quick --max-retries 5 --retry-delay 1500"
echo ""

echo "📊 Retry behavior:"
echo "• Exponential backoff: delay = base_delay * 2^(attempt-1)"
echo "• Attempt 1: 1000ms delay"
echo "• Attempt 2: 2000ms delay" 
echo "• Attempt 3: 4000ms delay"
echo "• And so on..."
echo ""

echo "📈 Enhanced reporting includes:"
echo "• Total retry attempts made"
echo "• Connections that succeeded after retries"
echo "• Retry distribution statistics"
echo "• Detailed error analysis"
echo ""

echo "🎯 Benefits of retry mechanism:"
echo "• Higher success rates in unstable network conditions"
echo "• Better resilience against temporary server overload"
echo "• More realistic simulation of client behavior"
echo "• Detailed retry analytics for optimization"
echo ""

echo "To run a test with retries now:"
echo "npm run test:1k"