
interface SystemMetrics {
  cpu: {
    user: number;
    system: number;
    idle: number;
    usage: number;
  };
  memory: {
    total: number;
    free: number;
    used: number;
    available: number;
    usagePercent: number;
  };
  process: {
    pid: number;
    memory: NodeJS.MemoryUsage;
    cpu: NodeJS.CpuUsage;
    uptime: number;
  };
  network: {
    connections: number;
    bytesReceived: number;
    bytesSent: number;
  };
}

class SystemMonitor {
  private previousCpuUsage: NodeJS.CpuUsage;
  private startTime: number;
  private monitoringInterval: NodeJS.Timeout | null = null;
  private metrics: SystemMetrics;

  constructor() {
    this.previousCpuUsage = process.cpuUsage();
    this.startTime = Date.now();
    this.metrics = this.getInitialMetrics();
  }

  private getInitialMetrics(): SystemMetrics {
    return {
      cpu: { user: 0, system: 0, idle: 0, usage: 0 },
      memory: { total: 0, free: 0, used: 0, available: 0, usagePercent: 0 },
      process: {
        pid: process.pid,
        memory: process.memoryUsage(),
        cpu: process.cpuUsage(),
        uptime: 0
      },
      network: { connections: 0, bytesReceived: 0, bytesSent: 0 }
    };
  }

  public startMonitoring(intervalMs: number = 5000): void {
    if (this.monitoringInterval) {
      clearInterval(this.monitoringInterval);
    }

    this.monitoringInterval = setInterval(() => {
      this.updateMetrics();
    }, intervalMs);

    console.log(`📊 System monitoring started (interval: ${intervalMs}ms)`);
  }

  public stopMonitoring(): void {
    if (this.monitoringInterval) {
      clearInterval(this.monitoringInterval);
      this.monitoringInterval = null;
      console.log('📊 System monitoring stopped');
    }
  }

  private updateMetrics(): void {
    // Update process metrics
    const currentCpuUsage = process.cpuUsage(this.previousCpuUsage);
    const memoryUsage = process.memoryUsage();
    
    this.metrics.process = {
      pid: process.pid,
      memory: memoryUsage,
      cpu: currentCpuUsage,
      uptime: (Date.now() - this.startTime) / 1000
    };

    // Calculate CPU usage percentage
    const totalCpuTime = currentCpuUsage.user + currentCpuUsage.system;
    const cpuUsagePercent = (totalCpuTime / 1000000) / 5; // 5 second interval
    
    this.metrics.cpu = {
      user: currentCpuUsage.user,
      system: currentCpuUsage.system,
      idle: 0, // Not available in Node.js
      usage: Math.min(100, cpuUsagePercent * 100)
    };

    this.previousCpuUsage = process.cpuUsage();

    // Update memory metrics (OS-level not directly available in Node.js)
    // Using process memory as approximation
    this.metrics.memory = {
      total: memoryUsage.heapTotal + memoryUsage.external,
      free: memoryUsage.heapTotal - memoryUsage.heapUsed,
      used: memoryUsage.heapUsed + memoryUsage.external,
      available: memoryUsage.heapTotal - memoryUsage.heapUsed,
      usagePercent: ((memoryUsage.heapUsed + memoryUsage.external) / 
                    (memoryUsage.heapTotal + memoryUsage.external)) * 100
    };
  }

  public getMetrics(): SystemMetrics {
    this.updateMetrics();
    return { ...this.metrics };
  }

  public printMetrics(): void {
    const metrics = this.getMetrics();
    const memMB = (metrics.process.memory.rss / 1024 / 1024).toFixed(1);
    const heapMB = (metrics.process.memory.heapUsed / 1024 / 1024).toFixed(1);
    const heapTotalMB = (metrics.process.memory.heapTotal / 1024 / 1024).toFixed(1);
    
    console.log(`
┌─────────────────────────────────────────────────────────────┐
│ SYSTEM PERFORMANCE METRICS                                 │
├─────────────────────────────────────────────────────────────┤
│ CPU Usage:          ${metrics.cpu.usage.toFixed(1).padStart(6)}% │ Process ID:     ${metrics.process.pid.toString().padStart(8)} │
│ Memory (RSS):       ${memMB.padStart(8)} MB │ Uptime:     ${Math.floor(metrics.process.uptime).toString().padStart(8)}s │
│ Heap Used:          ${heapMB.padStart(8)} MB │ Heap Total: ${heapTotalMB.padStart(8)} MB │
│ Memory Usage:       ${metrics.memory.usagePercent.toFixed(1).padStart(6)}% │                        │
└─────────────────────────────────────────────────────────────┘
    `);
  }
}

class PerformanceTracker {
  private connectionHistory: Array<{ timestamp: number; count: number }> = [];
  private errorHistory: Array<{ timestamp: number; error: string }> = [];
  private latencyHistory: Array<{ timestamp: number; latency: number }> = [];
  private systemMonitor: SystemMonitor;
  private maxHistorySize: number = 1000;

  constructor() {
    this.systemMonitor = new SystemMonitor();
  }

  public startTracking(): void {
    this.systemMonitor.startMonitoring(5000);
    console.log('📈 Performance tracking started');
  }

  public stopTracking(): void {
    this.systemMonitor.stopMonitoring();
    console.log('📈 Performance tracking stopped');
  }

  public recordConnection(count: number): void {
    this.connectionHistory.push({
      timestamp: Date.now(),
      count
    });

    // Keep history size manageable
    if (this.connectionHistory.length > this.maxHistorySize) {
      this.connectionHistory.shift();
    }
  }

  public recordError(error: string): void {
    this.errorHistory.push({
      timestamp: Date.now(),
      error
    });

    if (this.errorHistory.length > this.maxHistorySize) {
      this.errorHistory.shift();
    }
  }

  public recordLatency(latency: number): void {
    this.latencyHistory.push({
      timestamp: Date.now(),
      latency
    });

    if (this.latencyHistory.length > this.maxHistorySize) {
      this.latencyHistory.shift();
    }
  }

  public getConnectionTrend(minutes: number = 5): Array<{ timestamp: number; count: number }> {
    const cutoffTime = Date.now() - (minutes * 60 * 1000);
    return this.connectionHistory.filter(entry => entry.timestamp > cutoffTime);
  }

  public getErrorRate(minutes: number = 5): number {
    const cutoffTime = Date.now() - (minutes * 60 * 1000);
    const recentErrors = this.errorHistory.filter(entry => entry.timestamp > cutoffTime);
    const recentConnections = this.connectionHistory.filter(entry => entry.timestamp > cutoffTime);
    
    if (recentConnections.length === 0) return 0;
    return (recentErrors.length / recentConnections.length) * 100;
  }

  public getAverageLatency(minutes: number = 5): number {
    const cutoffTime = Date.now() - (minutes * 60 * 1000);
    const recentLatencies = this.latencyHistory.filter(entry => entry.timestamp > cutoffTime);
    
    if (recentLatencies.length === 0) return 0;
    return recentLatencies.reduce((sum, entry) => sum + entry.latency, 0) / recentLatencies.length;
  }

  public printPerformanceReport(): void {
    const systemMetrics = this.systemMonitor.getMetrics();
    const errorRate = this.getErrorRate();
    const avgLatency = this.getAverageLatency();
    const recentConnections = this.getConnectionTrend();
    const currentConnections = recentConnections.length > 0 ? 
      recentConnections[recentConnections.length - 1].count : 0;

    console.log(`
┌─────────────────────────────────────────────────────────────┐
│ PERFORMANCE REPORT (Last 5 minutes)                        │
├─────────────────────────────────────────────────────────────┤
│ Current Connections: ${currentConnections.toString().padStart(7)} │ Error Rate:    ${errorRate.toFixed(2).padStart(7)}% │
│ Average Latency:     ${avgLatency.toFixed(0).padStart(7)}ms │ CPU Usage:     ${systemMetrics.cpu.usage.toFixed(1).padStart(7)}% │
│ Memory Usage:        ${(systemMetrics.process.memory.rss / 1024 / 1024).toFixed(1).padStart(7)} MB │ Uptime:       ${Math.floor(systemMetrics.process.uptime).toString().padStart(8)}s │
└─────────────────────────────────────────────────────────────┘
    `);
  }

  public getSystemMetrics(): SystemMetrics {
    return this.systemMonitor.getMetrics();
  }

  public exportMetrics(): any {
    return {
      connectionHistory: this.connectionHistory,
      errorHistory: this.errorHistory,
      latencyHistory: this.latencyHistory,
      systemMetrics: this.systemMonitor.getMetrics(),
      summary: {
        errorRate: this.getErrorRate(),
        averageLatency: this.getAverageLatency(),
        connectionTrend: this.getConnectionTrend()
      }
    };
  }
}

// CLI interface for standalone monitoring
if (require.main === module) {
  const monitor = new SystemMonitor();
  const tracker = new PerformanceTracker();

  console.log('🎯 Starting standalone performance monitor...');
  
  monitor.startMonitoring(5000);
  tracker.startTracking();

  // Print metrics every 10 seconds
  const printInterval = setInterval(() => {
    console.clear();
    monitor.printMetrics();
    tracker.printPerformanceReport();
  }, 10000);

  // Graceful shutdown
  process.on('SIGINT', () => {
    console.log('\n🛑 Shutting down monitor...');
    clearInterval(printInterval);
    monitor.stopMonitoring();
    tracker.stopTracking();
    process.exit(0);
  });
}

export { PerformanceTracker, SystemMonitor };
