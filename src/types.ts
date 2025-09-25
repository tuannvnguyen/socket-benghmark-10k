export interface ConnectionMetrics {
  totalConnections: number;
  activeConnections: number;
  failedConnections: number;
  connectionsPerSecond: number;
  averageConnectionTime: number;
  memoryUsage: {
    rss: number;
    heapUsed: number;
    heapTotal: number;
    external: number;
  };
  cpuUsage: {
    user: number;
    system: number;
    percent: number;
  };
}

export interface BenchmarkConfig {
  targetConnections: number;
  connectionRate: number; // connections per second
  testDuration: number; // seconds
  messageInterval: number; // ms
  messageSize: number; // bytes
  message: string;
  serverHost: string;
  serverPort: number;
  headers?: Record<string, string>; // Optional headers for authentication
  maxRetries?: number; // Maximum number of retry attempts (default: 3)
  retryDelay?: number; // Base delay in ms between retries (default: 1000)
}

export interface ConnectionResult {
  success: boolean;
  connectionTime: number;
  errorMessage?: string;
  socketId?: string;
  retryCount?: number; // Number of retry attempts made
  finalAttempt?: boolean; // Whether this was the final attempt
}

export interface BenchmarkResults {
  config: BenchmarkConfig;
  startTime: Date;
  endTime: Date;
  totalDuration: number;
  successfulConnections: number;
  failedConnections: number;
  maxConcurrentConnections: number;
  averageConnectionTime: number;
  connectionSuccessRate: number;
  peakMemoryUsage: number;
  peakCpuUsage: number;
  errors: string[];
}