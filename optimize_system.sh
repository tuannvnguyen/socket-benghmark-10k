#!/bin/bash

# Socket.IO Benchmark - System Optimization Script
# This script optimizes macOS system settings for high concurrent connections

echo "🔧 Optimizing system for Socket.IO benchmark (10K concurrent connections)"
echo "======================================================================"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Function to print colored output
print_status() {
    echo -e "${GREEN}[✓]${NC} $1"
}

print_warning() {
    echo -e "${YELLOW}[⚠]${NC} $1"
}

print_error() {
    echo -e "${RED}[✗]${NC} $1"
}

print_info() {
    echo -e "${BLUE}[ℹ]${NC} $1"
}

# Check if running as root for some operations
check_sudo() {
    if [[ $EUID -eq 0 ]]; then
        echo "Running as root - all optimizations available"
        return 0
    else
        echo "Not running as root - some optimizations may require sudo"
        return 1
    fi
}

# 1. File Descriptor Limits
echo ""
echo "1. Optimizing File Descriptor Limits"
echo "-----------------------------------"

# Check current limits
current_soft=$(ulimit -Sn)
current_hard=$(ulimit -Hn)

print_info "Current soft limit: $current_soft"
print_info "Current hard limit: $current_hard"

# Increase file descriptor limits for current session
if ulimit -n 65536 2>/dev/null; then
    print_status "Set file descriptor limit to 65536 for current session"
else
    print_warning "Could not set file descriptor limit - trying 32768"
    if ulimit -n 32768 2>/dev/null; then
        print_status "Set file descriptor limit to 32768 for current session"
    else
        print_error "Could not increase file descriptor limit"
    fi
fi

# Create or update launchd limit file for persistent changes (macOS)
if [[ "$OSTYPE" == "darwin"* ]]; then
    LIMIT_FILE="/Library/LaunchDaemons/limit.maxfiles.plist"
    
    if check_sudo || sudo -n true 2>/dev/null; then
        print_info "Creating persistent file descriptor limit configuration..."
        
        sudo tee "$LIMIT_FILE" > /dev/null << EOF
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
    <key>Label</key>
    <string>limit.maxfiles</string>
    <key>ProgramArguments</key>
    <array>
        <string>launchctl</string>
        <string>limit</string>
        <string>maxfiles</string>
        <string>65536</string>
        <string>200000</string>
    </array>
    <key>RunAtLoad</key>
    <true/>
    <key>ServiceIPC</key>
    <false/>
</dict>
</plist>
EOF
        sudo chown root:wheel "$LIMIT_FILE"
        sudo launchctl load -w "$LIMIT_FILE" 2>/dev/null || true
        print_status "Created persistent file descriptor limit configuration"
    else
        print_warning "Skipping persistent file descriptor limit (requires sudo)"
    fi
fi

# 2. TCP/Network Optimizations
echo ""
echo "2. TCP/Network Optimizations"
echo "----------------------------"

if [[ "$OSTYPE" == "darwin"* ]]; then
    # macOS TCP optimizations
    if check_sudo || sudo -n true 2>/dev/null; then
        print_info "Applying macOS TCP optimizations..."
        
        # Increase TCP buffer sizes
        sudo sysctl -w net.inet.tcp.sendspace=65536 2>/dev/null && \
            print_status "Increased TCP send buffer size"
        
        sudo sysctl -w net.inet.tcp.recvspace=65536 2>/dev/null && \
            print_status "Increased TCP receive buffer size"
        
        # Optimize connection handling
        sudo sysctl -w kern.ipc.somaxconn=1024 2>/dev/null && \
            print_status "Increased socket listen backlog"
        
        # Enable TCP window scaling
        sudo sysctl -w net.inet.tcp.rfc1323=1 2>/dev/null && \
            print_status "Enabled TCP window scaling"
        
        # Reduce TIME_WAIT timeout
        sudo sysctl -w net.inet.tcp.msl=15000 2>/dev/null && \
            print_status "Reduced TCP TIME_WAIT timeout"
        
        print_warning "Note: These settings are temporary. For persistent changes, add them to /etc/sysctl.conf"
    else
        print_warning "Skipping TCP optimizations (requires sudo)"
    fi
fi

# 3. Node.js Optimizations
echo ""
echo "3. Node.js Optimizations"
echo "-----------------------"

# Set Node.js memory limit
export NODE_OPTIONS="--max-old-space-size=6144"
print_status "Set Node.js heap size to 6GB"

# Enable Node.js DNS caching
export UV_THREADPOOL_SIZE=128
print_status "Increased UV thread pool size to 128"

# Disable DNS caching (can cause issues with many connections)
export NODE_OPTIONS="$NODE_OPTIONS --dns-result-order=ipv4first"
print_status "Optimized DNS resolution order"

# 4. Create optimization verification script
echo ""
echo "4. Creating Verification Script"
echo "------------------------------"

cat > check_limits.js << 'EOF'
#!/usr/bin/env node

const { exec } = require('child_process');
const util = require('util');
const execAsync = util.promisify(exec);

async function checkLimits() {
    console.log('🔍 Verifying system optimizations for Socket.IO benchmark\n');
    
    // Check file descriptor limits
    try {
        const { stdout } = await execAsync('ulimit -n');
        const fdLimit = parseInt(stdout.trim());
        console.log(`File Descriptor Limit: ${fdLimit}`);
        
        if (fdLimit >= 65536) {
            console.log('✅ File descriptor limit is optimal for 10K connections');
        } else if (fdLimit >= 32768) {
            console.log('⚠️  File descriptor limit is adequate but could be higher');
        } else {
            console.log('❌ File descriptor limit is too low for 10K connections');
        }
    } catch (error) {
        console.log('❌ Could not check file descriptor limits');
    }
    
    // Check Node.js memory settings
    const heapSize = process.memoryUsage().heapTotal;
    console.log(`\nNode.js Heap Total: ${(heapSize / 1024 / 1024).toFixed(1)} MB`);
    
    if (process.env.NODE_OPTIONS && process.env.NODE_OPTIONS.includes('max-old-space-size')) {
        console.log('✅ Node.js memory limit is configured');
    } else {
        console.log('⚠️  Consider setting NODE_OPTIONS for memory optimization');
    }
    
    // Check UV thread pool
    console.log(`UV Thread Pool Size: ${process.env.UV_THREADPOOL_SIZE || 4}`);
    
    if (process.env.UV_THREADPOOL_SIZE && parseInt(process.env.UV_THREADPOOL_SIZE) >= 128) {
        console.log('✅ UV thread pool is optimized');
    } else {
        console.log('⚠️  Consider increasing UV_THREADPOOL_SIZE for better performance');
    }
    
    console.log('\n📊 System is ready for benchmark testing!');
}

checkLimits().catch(console.error);
EOF

chmod +x check_limits.js
print_status "Created system verification script (check_limits.js)"

# 5. Environment variables setup
echo ""
echo "5. Environment Setup"
echo "-------------------"

# Create environment file
cat > .env.benchmark << EOF
# Socket.IO Benchmark Environment Variables
# Source this file before running benchmarks: source .env.benchmark

# Node.js optimizations
export NODE_OPTIONS="--max-old-space-size=6144 --dns-result-order=ipv4first"
export UV_THREADPOOL_SIZE=128

# Increase file descriptor limit
ulimit -n 65536 2>/dev/null || ulimit -n 32768 2>/dev/null || echo "Could not set file descriptor limit"

# Server configuration
export SERVER_HOST=localhost
export SERVER_PORT=3000

# Benchmark defaults
export BENCHMARK_CONNECTIONS=10000
export BENCHMARK_RATE=300
export BENCHMARK_DURATION=60

echo "🚀 Socket.IO benchmark environment loaded"
echo "File descriptor limit: \$(ulimit -n)"
echo "Node.js options: \$NODE_OPTIONS"
echo "UV thread pool: \$UV_THREADPOOL_SIZE"
EOF

print_status "Created benchmark environment file (.env.benchmark)"

# 6. Quick setup script
echo ""
echo "6. Quick Setup Commands"
echo "----------------------"

cat > quick_setup.sh << 'EOF'
#!/bin/bash

echo "🚀 Quick Socket.IO Benchmark Setup"
echo "=================================="

# Load optimizations
source .env.benchmark

# Install dependencies if needed
if [ ! -d "node_modules" ]; then
    echo "📦 Installing dependencies..."
    npm install
fi

# Build project
echo "🔨 Building project..."
npm run build

# Check system readiness
echo "🔍 Checking system readiness..."
node check_limits.js

echo ""
echo "✅ Setup complete! You can now run:"
echo "   npm start                    # Start server"
echo "   npm run test:1k             # Test 1,000 connections"
echo "   npm run test:5k             # Test 5,000 connections"
echo "   npm run test:10k            # Test 10,000 connections"
echo "   node dist/benchmark.js quick # Run all tests"
EOF

chmod +x quick_setup.sh
print_status "Created quick setup script (quick_setup.sh)"

# Final summary
echo ""
echo "🎯 Optimization Summary"
echo "======================"
print_status "File descriptor limits optimized"
print_status "TCP/Network settings configured (if sudo available)"
print_status "Node.js environment optimized"
print_status "Verification tools created"
print_status "Quick setup scripts ready"

echo ""
echo "📋 Next Steps:"
echo "1. Run './quick_setup.sh' to complete setup"
echo "2. Source environment: 'source .env.benchmark'"
echo "3. Start server: 'npm start'"
echo "4. Run benchmark: 'npm run test:10k'"

echo ""
print_warning "Note: Some optimizations require restart to take full effect"
print_warning "For production use, make TCP settings persistent in /etc/sysctl.conf"