# Socket.IO 10K Concurrent Connection Benchmark - Testing Guide

## 🚀 Quick Start

### 1. Complete Setup
```bash
# Run the optimization and setup script
./quick_setup.sh

# Load environment variables
source .env.benchmark
```

### 2. Start the Server
```bash
# Start the optimized Socket.IO server
npm start
```

### 3. Run Benchmark Tests

#### Option A: Quick Preset Tests
```bash
# Run all preset tests (1K, 5K, 10K)
node dist/benchmark.js quick
```

#### Option B: Individual Tests
```bash
# Test 1,000 connections
npm run test:1k

# Test 5,000 connections  
npm run test:5k

# Test 10,000 connections
npm run test:10k
```

#### Option C: Custom Tests
```bash
# Custom connection count with specific parameters
node dist/benchmark.js run \
  --connections 10000 \
  --rate 300 \
  --duration 60 \
  --host localhost \
  --port 3000 \
  --output results-10k.json
```

## 📊 Understanding Results

### Connection Success Metrics
- **Target vs Successful**: How many connections were attempted vs successful
- **Success Rate**: Percentage of successful connections (aim for >95%)
- **Average Connection Time**: Time to establish each connection (aim for <5s)

### Performance Metrics
- **Peak Memory Usage**: Maximum RAM used during test (monitor <6GB for 8GB system)
- **Peak CPU Usage**: Maximum CPU utilization (aim for <80%)
- **Memory per Connection**: RAM usage per connection (target <2MB)

### Performance Grades
- **A+ (90-100%)**: Excellent performance, ready for production
- **A (85-89%)**: Very good, minor optimizations possible
- **B+ (80-84%)**: Good performance, some room for improvement
- **B (75-79%)**: Adequate, consider optimizations
- **C+ (70-74%)**: Below target, needs optimization
- **C (65-69%)**: Poor performance, significant improvements needed
- **D (60-64%)**: Very poor, major optimizations required
- **F (<60%)**: Failed benchmark, system needs major changes

## 🎯 Expected Results for Your Server (4 vCPUs, 8GB RAM, 5Gbps)

### Conservative Estimates
- **6,000-8,000 concurrent connections**: Sustainable with good performance
- **Memory usage**: ~1.5-2MB per connection = 12-16GB total (may exceed 8GB RAM)
- **CPU usage**: ~20-30% per 1,000 connections = 60-80% for 10K

### Optimistic Estimates  
- **10,000+ concurrent connections**: Possible with optimal configuration
- **Memory usage**: ~1MB per connection = 10GB total
- **CPU usage**: ~15% per 1,000 connections = 60% for 10K

### Bottleneck Predictions
1. **Memory will likely be the first bottleneck** (8GB RAM limit)
2. **CPU should handle 10K connections** (4 vCPUs adequate)
3. **Network bandwidth is excellent** (5Gbps more than sufficient)

## 🔧 Optimization Tips

### If You Hit Memory Limits
```bash
# Reduce memory per connection by optimizing Socket.IO
# Edit src/server.ts and reduce buffer sizes:
maxHttpBufferSize: 64 * 1024,  # Reduce from 1MB to 64KB
pingTimeout: 30000,            # Reduce from 60s to 30s
```

### If You Hit CPU Limits
```bash
# Increase UV thread pool size
export UV_THREADPOOL_SIZE=256

# Use cluster mode (edit package.json)
npm install pm2
pm2 start dist/server.js -i max
```

### If Connections Fail
```bash
# Increase connection timeout
# Edit src/client.ts:
timeout: 20000,  # Increase from 10s to 20s

# Reduce connection rate
node dist/benchmark.js run --connections 10000 --rate 200
```

## 📈 Progressive Testing Strategy

### Phase 1: Baseline (Start Here)
```bash
# Test with small numbers first
node dist/benchmark.js run --connections 500
node dist/benchmark.js run --connections 1000
```

### Phase 2: Incremental
```bash
# Gradually increase
node dist/benchmark.js run --connections 2500
node dist/benchmark.js run --connections 5000
```

### Phase 3: Target
```bash
# Go for the goal
node dist/benchmark.js run --connections 7500
node dist/benchmark.js run --connections 10000
```

### Phase 4: Stress Testing
```bash
# Push beyond limits to find maximum
node dist/benchmark.js run --connections 12500
node dist/benchmark.js run --connections 15000
```

## 🛠️ Troubleshooting

### Common Issues

#### "EMFILE: too many open files"
```bash
# Increase file descriptor limit
ulimit -n 65536
source .env.benchmark
```

#### "ECONNREFUSED" errors
```bash
# Check if server is running
curl http://localhost:3000/health

# Restart server with optimizations
source .env.benchmark
npm start
```

#### High memory usage
```bash
# Monitor memory during test
node dist/monitor.js &
npm run test:5k
```

#### Slow connection times
```bash
# Reduce connection rate
node dist/benchmark.js run --connections 5000 --rate 100

# Increase timeout
# Edit timeout values in src/client.ts
```

### System Monitoring During Tests

#### Monitor Server Performance
```bash
# Terminal 1: Start server
npm start

# Terminal 2: Monitor resources  
top -pid $(pgrep -f "node.*server.js")

# Terminal 3: Monitor connections
watch -n 1 'curl -s http://localhost:3000/metrics | jq .activeConnections'

# Terminal 4: Run test
npm run test:10k
```

#### Check Network Stats
```bash
# Monitor network connections
netstat -an | grep :3000 | wc -l

# Monitor network traffic
nettop -c -l 1
```

## 📊 Interpreting Results

### Success Indicators
- ✅ **95%+ connection success rate**
- ✅ **<5 second average connection time**  
- ✅ **<80% CPU usage**
- ✅ **Memory usage within available RAM**

### Warning Signs
- ⚠️ **85-94% connection success rate** - May need optimization
- ⚠️ **5-10 second connection times** - Network or server strain
- ⚠️ **80-90% CPU usage** - Approaching limits
- ⚠️ **Memory usage >75% of available** - Risk of swapping

### Failure Indicators
- ❌ **<85% connection success rate** - Significant issues
- ❌ **>10 second connection times** - Server overloaded
- ❌ **>90% CPU usage** - CPU bottleneck
- ❌ **Memory swapping** - Insufficient RAM

## 🎯 Success Criteria for 10K Connections

To successfully handle 10,000 concurrent connections:

1. **Connection Success Rate**: ≥95%
2. **Memory Usage**: <7GB (leaving 1GB buffer)
3. **CPU Usage**: <85% average
4. **Connection Time**: <5 seconds average
5. **Server Stability**: No crashes or memory leaks
6. **Response Time**: <100ms for ping-pong

## 📝 Logging and Results

### Save Results
```bash
# Save detailed results to file
node dist/benchmark.js run --connections 10000 --output results-$(date +%Y%m%d-%H%M%S).json

# Create test report
echo "Test Date: $(date)" > test-report.txt
echo "System: 4 vCPUs, 8GB RAM, 5Gbps" >> test-report.txt
cat results-*.json >> test-report.txt
```

### View Historical Results
```bash
# Compare results over time
ls -la results-*.json
jq '.successfulConnections' results-*.json
```

This benchmark suite will help you determine the exact limits of your server and optimize for the 10K concurrent connection target. Start with smaller tests and work your way up!