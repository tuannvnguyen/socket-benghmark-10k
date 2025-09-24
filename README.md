# Socket.IO 10K Concurrent Connection Benchmark

A comprehensive benchmarking tool to test Socket.IO server capacity and measure how many concurrent connections can be handled on a server with:
- 4 vCPUs
- 8 GB RAM
- 5 Gbps network
- Target: 10,000 concurrent connections

## Features

- **High-performance Socket.IO server** optimized for concurrent connections
- **Client connection simulator** with configurable connection counts
- **Real-time monitoring** of connections, memory, and CPU usage
- **Automated benchmark scripts** with gradual load testing
- **System optimization configurations** for maximum performance

## Quick Start

1. **Install dependencies:**
   ```bash
   npm install
   ```

2. **Build the project:**
   ```bash
   npm run build
   ```

3. **Start the server:**
   ```bash
   npm start
   ```

4. **Run benchmark tests:**
   ```bash
   # Test with 1,000 connections
   npm run test:1k
   
   # Test with 5,000 connections
   npm run test:5k
   
   # Test with 10,000 connections
   npm run test:10k
   ```

## Manual Testing

### Start the Server
```bash
npm run dev
```

### Run Client Connections
```bash
# Custom connection count
node dist/benchmark.js --connections 2000 --interval 10

# With connection rate limiting
node dist/benchmark.js --connections 5000 --rate 100 --interval 50
```

## System Optimization

Before running high-connection tests, optimize your system:

```bash
# Increase file descriptor limits
ulimit -n 65536

# Optimize TCP settings (Linux/macOS)
sudo sysctl -w net.core.somaxconn=65535
sudo sysctl -w net.core.netdev_max_backlog=5000
```

## Monitoring

The server provides real-time metrics including:
- Active connection count
- Memory usage (RSS, heap used/total)
- CPU usage percentage
- Connection/disconnection rates
- Error rates and types

## Project Structure

```
src/
├── server.ts          # Main Socket.IO server
├── client.ts          # Connection testing client
├── benchmark.ts       # Automated benchmark suite
├── monitor.ts         # Performance monitoring
└── types.ts           # TypeScript type definitions
```

## Expected Results

Based on your server specifications (4 vCPUs, 8GB RAM, 5Gbps), you should be able to handle:
- **Theoretical maximum**: 10,000+ concurrent connections
- **Practical limit**: 6,000-8,000 sustained connections
- **Memory per connection**: ~1-2MB
- **CPU per 1,000 connections**: ~15-25%

Results will vary based on:
- Message frequency and size
- Network latency
- System configuration
- Other running processes