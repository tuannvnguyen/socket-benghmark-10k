import express from 'express';
import { createServer } from 'http';
import { Server as SocketIOServer } from 'socket.io';
import { ConnectionMetrics } from './types';

class SocketBenchmarkServer {
  private app: express.Application;
  private server: any;
  private io!: SocketIOServer;
  private port: number;
  private metrics: ConnectionMetrics;
  private startTime: Date;
  private connectionCount: number = 0;
  private lastConnectionCount: number = 0;
  private lastMetricsTime: number = Date.now();

  constructor(port: number = 3000) {
    this.port = port;
    this.app = express();
    this.server = createServer(this.app);
    this.startTime = new Date();
    
    // Initialize metrics
    this.metrics = {
      totalConnections: 0,
      activeConnections: 0,
      failedConnections: 0,
      connectionsPerSecond: 0,
      averageConnectionTime: 0,
      memoryUsage: {
        rss: 0,
        heapUsed: 0,
        heapTotal: 0,
        external: 0
      },
      cpuUsage: {
        user: 0,
        system: 0,
        percent: 0
      }
    };

    this.setupExpress();
    this.setupSocketIO();
    this.startMetricsCollection();
  }

  private setupExpress(): void {
    // Optimize Express for high connections
    this.app.set('trust proxy', true);
    
    // Health check endpoint
    this.app.get('/health', (req, res) => {
      res.json({
        status: 'healthy',
        uptime: Date.now() - this.startTime.getTime(),
        metrics: this.metrics,
        timestamp: new Date().toISOString()
      });
    });

    // Metrics endpoint
    this.app.get('/metrics', (req, res) => {
      res.json(this.metrics);
    });

    // Basic info endpoint
    this.app.get('/', (req, res) => {
      res.json({
        name: 'Socket.IO Benchmark Server',
        version: '1.0.0',
        activeConnections: this.metrics.activeConnections,
        totalConnections: this.metrics.totalConnections,
        uptime: Date.now() - this.startTime.getTime()
      });
    });
  }

  private setupSocketIO(): void {
    // Configure Socket.IO for high performance
    this.io = new SocketIOServer(this.server, {
      cors: {
        origin: "*",
        methods: ["GET", "POST"]
      },
      // Optimize for high connections
      pingTimeout: 60000,
      pingInterval: 25000,
      upgradeTimeout: 10000,
      maxHttpBufferSize: 1e6,
      allowEIO3: true,
      // Transport options
      transports: ['websocket', 'polling'],
      // Reduce memory usage
      serveClient: false,
      // Connection state recovery
      connectionStateRecovery: {
        maxDisconnectionDuration: 2 * 60 * 1000,
        skipMiddlewares: true,
      }
    });

    // Connection handling
    this.io.on('connection', (socket) => {
      this.connectionCount++;
      this.metrics.totalConnections++;
      this.metrics.activeConnections++;

    //   console.log(`[${new Date().toISOString()}] Client connected: ${socket.id} (Active: ${this.metrics.activeConnections})`);

      // Handle ping-pong for connection testing
      socket.on('ping', (data) => {
        socket.emit('pong', { ...data, serverTime: Date.now() });
      });

      // Handle custom test messages
      socket.on('test-message', (data) => {
        socket.emit('test-response', {
          received: data,
          serverTime: Date.now(),
          connectionId: socket.id
        });
      });

      // Handle benchmark data
      socket.on('benchmark-data', (data) => {
        // Echo back for latency testing
        socket.emit('benchmark-response', {
          ...data,
          serverTime: Date.now()
        });
      });

      // Handle disconnection
      socket.on('disconnect', (reason) => {
        this.metrics.activeConnections--;
        // console.log(`[${new Date().toISOString()}] Client disconnected: ${socket.id} (Active: ${this.metrics.activeConnections}, Reason: ${reason})`);
      });

      // Handle errors
      socket.on('error', (error) => {
        console.error(`[${new Date().toISOString()}] Socket error for ${socket.id}:`, error);
        this.metrics.failedConnections++;
      });
    });

    // Handle server-level errors
    this.io.engine.on('connection_error', (err) => {
      console.error(`[${new Date().toISOString()}] Connection error:`, err);
      this.metrics.failedConnections++;
    });
  }

  private startMetricsCollection(): void {
    // Collect metrics every 5 seconds
    setInterval(() => {
      this.updateMetrics();
      this.logMetrics();
    }, 5000);

    // Log connection rate every 10 seconds
    setInterval(() => {
      const now = Date.now();
      const timeDiff = (now - this.lastMetricsTime) / 1000;
      const connectionDiff = this.connectionCount - this.lastConnectionCount;
      
      this.metrics.connectionsPerSecond = connectionDiff / timeDiff;
      this.lastConnectionCount = this.connectionCount;
      this.lastMetricsTime = now;
    }, 10000);
  }

  private updateMetrics(): void {
    // Memory usage
    const memUsage = process.memoryUsage();
    this.metrics.memoryUsage = {
      rss: memUsage.rss,
      heapUsed: memUsage.heapUsed,
      heapTotal: memUsage.heapTotal,
      external: memUsage.external
    };

    // CPU usage
    const cpuUsage = process.cpuUsage();
    this.metrics.cpuUsage = {
      user: cpuUsage.user,
      system: cpuUsage.system,
      percent: 0 // Will be calculated based on interval
    };
  }

  private logMetrics(): void {
    const memMB = (this.metrics.memoryUsage.rss / 1024 / 1024).toFixed(2);
    const heapMB = (this.metrics.memoryUsage.heapUsed / 1024 / 1024).toFixed(2);
    
    console.log(`
┌─────────────────────────────────────────────────────────────┐
│ SOCKET.IO BENCHMARK SERVER METRICS                         │
├─────────────────────────────────────────────────────────────┤
│ Active Connections: ${this.metrics.activeConnections.toString().padStart(8)} │ Total: ${this.metrics.totalConnections.toString().padStart(8)} │
│ Failed Connections: ${this.metrics.failedConnections.toString().padStart(8)} │ Rate:  ${this.metrics.connectionsPerSecond.toFixed(1).padStart(8)}/s │
│ Memory Usage (RSS): ${memMB.padStart(8)} MB │ Heap:  ${heapMB.padStart(8)} MB │
│ Uptime: ${Math.floor((Date.now() - this.startTime.getTime()) / 1000).toString().padStart(12)} seconds             │
└─────────────────────────────────────────────────────────────┘
    `);
  }

  public async start(): Promise<void> {
    return new Promise((resolve) => {
      this.server.listen(this.port, () => {
        console.log(`
🚀 Socket.IO Benchmark Server Started
├─ Port: ${this.port}
├─ Environment: ${process.env.NODE_ENV || 'development'}
├─ Process ID: ${process.pid}
├─ Node.js Version: ${process.version}
└─ Started at: ${this.startTime.toISOString()}

📊 Endpoints:
├─ Health Check: http://localhost:${this.port}/health
├─ Metrics: http://localhost:${this.port}/metrics
└─ Socket.IO: ws://localhost:${this.port}

Ready for connections! 🎯 Target: 10,000 concurrent connections
        `);
        resolve();
      });
    });
  }

  public getMetrics(): ConnectionMetrics {
    return { ...this.metrics };
  }

  public stop(): void {
    this.server.close();
    console.log('Server stopped');
  }
}

// Start server if this file is run directly
if (require.main === module) {
  const port = process.env.PORT ? parseInt(process.env.PORT) : 3000;
  const server = new SocketBenchmarkServer(port);
  
  // Graceful shutdown
  process.on('SIGINT', () => {
    console.log('\n🛑 Received SIGINT. Gracefully shutting down...');
    server.stop();
    process.exit(0);
  });

  process.on('SIGTERM', () => {
    console.log('\n🛑 Received SIGTERM. Gracefully shutting down...');
    server.stop();
    process.exit(0);
  });

  // Handle uncaught exceptions
  process.on('uncaughtException', (error) => {
    console.error('❌ Uncaught Exception:', error);
    server.stop();
    process.exit(1);
  });

  process.on('unhandledRejection', (reason, promise) => {
    console.error('❌ Unhandled Rejection at:', promise, 'reason:', reason);
    server.stop();
    process.exit(1);
  });

  server.start().catch((error) => {
    console.error('❌ Failed to start server:', error);
    process.exit(1);
  });
}

export default SocketBenchmarkServer;