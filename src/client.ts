import { io, Socket } from 'socket.io-client';
import { Logger } from './logger';
import { BenchmarkConfig, ConnectionResult } from './types';

// Callback type for disconnection events
type DisconnectionCallback = (clientId: string, reason: string, connectionDuration: number) => void;

class SocketClient {
  private socket: Socket | null = null;
  private connectionTime: number = 0;
  private connected: boolean = false;
  private clientId: string;
  private logger: Logger;
  private pingInterval: NodeJS.Timeout | null = null;
  private lastPingTime: number = 0;
  private pingCount: number = 0;
  private failedPings: number = 0;
  private disconnectionCallback: DisconnectionCallback | null = null;
  private connectionStartTime: number = 0;

  constructor(clientId: string, logger?: Logger, onDisconnection?: DisconnectionCallback) {
    this.clientId = clientId;
    this.logger = logger || new Logger();
    this.disconnectionCallback = onDisconnection || null;
  }

  public async connect(host: string, port: number, headers?: Record<string, string>, maxRetries: number = 3, retryDelay: number = 1000): Promise<ConnectionResult> {
    const overallStartTime = Date.now();
    let lastError = '';
    
    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      const isFirstAttempt = attempt === 0;
      const isFinalAttempt = attempt === maxRetries;
      
      if (!isFirstAttempt) {
        // Calculate exponential backoff delay: base * 2^(attempt-1)
        const delay = retryDelay * Math.pow(2, attempt - 1);
        console.log(`🔄 Retry attempt ${attempt}/${maxRetries} for client ${this.clientId} after ${delay}ms...`);
        await new Promise(resolve => setTimeout(resolve, delay));
      }

      try {
        const attemptResult = await this.attemptConnection(host, port, headers, overallStartTime);
        
        if (attemptResult.success) {
          return {
            ...attemptResult,
            retryCount: attempt,
            finalAttempt: isFinalAttempt
          };
        } else {
          lastError = attemptResult.errorMessage || 'Unknown error';
          if (!isFinalAttempt) {
            // Clean up failed socket before retry
            this.cleanup();
          }
        }
      } catch (error) {
        lastError = error instanceof Error ? error.message : 'Unknown error';
        if (!isFinalAttempt) {
          this.cleanup();
        }
      }
    }

    // All attempts failed
    return {
      success: false,
      connectionTime: Date.now() - overallStartTime,
      errorMessage: `Failed after ${maxRetries + 1} attempts. Last error: ${lastError}`,
      retryCount: maxRetries,
      finalAttempt: true
    };
  }

  private async attemptConnection(host: string, port: number, headers?: Record<string, string>, overallStartTime?: number): Promise<ConnectionResult> {
    const startTime = overallStartTime || Date.now();
    
    try {
      const socketOptions: any = {
        path: '/socket.io',
        transports: ['websocket', 'polling'],
        timeout: 30000,
        reconnection: false,
        forceNew: true
      };

      // Add headers if provided
      if (headers) {
        socketOptions.extraHeaders = headers;
        // Also add to auth for Socket.IO authentication
        socketOptions.auth = headers;
      }

      const namespace = '/load-test'; // Use root namespace; change if needed
      // this.socket = io(`http://${host}:${port}${namespace}`, socketOptions);
      this.socket = io(`https://d5.drkumo.com${namespace}`, socketOptions);

      return new Promise((resolve) => {
        const timeoutId = setTimeout(() => {
          resolve({
            success: false,
            connectionTime: Date.now() - startTime,
            errorMessage: 'Connection timeout'
          });
        }, 90000);

        this.socket!.on('connect', () => {
          clearTimeout(timeoutId);
          this.connectionTime = Date.now() - startTime;
          this.connectionStartTime = Date.now();
          this.connected = true;
          this.lastPingTime = Date.now();
          
          // Log successful connection
          this.logger.logConnection(this.clientId, 'CONNECT', `Connected successfully`, {
            connectionTime: this.connectionTime,
            socketId: this.socket!.id,
            host: `${host}:${port}`
          });
          
          // Start ping interval for connected clients
          this.startPingInterval();
          
          resolve({
            success: true,
            connectionTime: this.connectionTime,
            socketId: this.socket!.id,
            isActive: true
          });
        });

        this.socket!.on('connect_error', (error) => {
          clearTimeout(timeoutId);
          
          this.logger.logError(this.clientId, 'CONNECTION_ERROR', `Connection failed: ${error.message}`, {
            error: error.message,
            host: `${host}:${port}`,
            attempt: 'connection'
          });
          
          resolve({
            success: false,
            connectionTime: Date.now() - startTime,
            errorMessage: error.message
          });
        });

        this.socket!.on('disconnect', (reason) => {
          const disconnectionTime = Date.now();
          const connectionDuration = this.connectionStartTime > 0 ? disconnectionTime - this.connectionStartTime : 0;
          
          this.connected = false;
          this.stopPingInterval();
          
          this.logger.logConnection(this.clientId, 'DISCONNECT', `Disconnected: ${reason}`, {
            reason,
            connectionDuration,
            totalPings: this.pingCount,
            failedPings: this.failedPings,
            disconnectedAt: new Date(disconnectionTime).toISOString()
          });
          
          // Notify the ConnectionTester about spontaneous disconnection
          if (this.disconnectionCallback && reason !== 'io client disconnect') {
            this.disconnectionCallback(this.clientId, reason, connectionDuration);
          }
        });

        this.socket!.on('error', (error) => {
          this.logger.logError(this.clientId, 'SOCKET_ERROR', `Socket error: ${error.message || error}`, {
            error: error.message || error,
            connected: this.connected,
            socketId: this.socket?.id
          });
        });
      });
    } catch (error) {
      return {
        success: false,
        connectionTime: Date.now() - startTime,
        errorMessage: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  }

  private cleanup(): void {
    this.stopPingInterval();
    if (this.socket) {
      this.socket.removeAllListeners();
      this.socket.disconnect();
      this.socket = null;
    }
    this.connected = false;
    this.connectionTime = 0;
    this.pingCount = 0;
    this.failedPings = 0;
  }

  public sendPing(): Promise<number> {
    if (!this.socket || !this.connected) {
      return Promise.reject(new Error('Not connected'));
    }

    const startTime = Date.now();
    
    return new Promise((resolve, reject) => {
      const timeoutId = setTimeout(() => {
        reject(new Error('Ping timeout'));
      }, 5000);

      this.socket!.emit('ping', { clientId: this.clientId, timestamp: startTime });
      
      this.socket!.once('pong', (data) => {
        clearTimeout(timeoutId);
        const latency = Date.now() - startTime;
        resolve(latency);
      });
    });
  }

  public sendTestMessage(data: any): Promise<any> {
    if (!this.socket || !this.connected) {
      return Promise.reject(new Error('Not connected'));
    }

    return new Promise((resolve, reject) => {
      const timeoutId = setTimeout(() => {
        reject(new Error('Test message timeout'));
      }, 10000);

      this.socket!.emit('broadcast', data);
      
      this.socket!.once('broadcast', (response) => {
        // console.log('Response:', response);
        clearTimeout(timeoutId);
        resolve(response);
      });
    });
  }

  public disconnect(): void {
    if (this.socket) {
      this.socket.disconnect();
      this.connected = false;
    }
  }

  public isConnected(): boolean {
    return this.connected && this.socket?.connected === true;
  }

  public getConnectionTime(): number {
    return this.connectionTime;
  }

  private startPingInterval(): void {
    if (this.pingInterval) {
      clearInterval(this.pingInterval);
    }
    
    this.pingInterval = setInterval(async () => {
      if (this.connected && this.socket) {
        try {
          const latency = await this.sendPing();
          this.pingCount++;
          
          // Log successful ping (only every 10th ping to reduce log volume)
          if (this.pingCount % 10 === 0) {
            this.logger.logPing(this.clientId, latency, true, {
              totalPings: this.pingCount,
              failedPings: this.failedPings
            });
          }
        } catch (error) {
          this.failedPings++;
          this.logger.logPing(this.clientId, -1, false, {
            error: error instanceof Error ? error.message : 'Unknown ping error',
            totalPings: this.pingCount,
            failedPings: this.failedPings
          });
          
          // If too many failed pings, consider connection problematic
          if (this.failedPings > 5) {
            this.logger.logError(this.clientId, 'PING_ERROR', `Too many failed pings (${this.failedPings}), connection may be unstable`);
          }
        }
      }
    }, 5000); // 5 second interval
  }

  private stopPingInterval(): void {
    if (this.pingInterval) {
      clearInterval(this.pingInterval);
      this.pingInterval = null;
    }
  }

  public getPingStats(): { total: number; failed: number; successRate: number } {
    return {
      total: this.pingCount,
      failed: this.failedPings,
      successRate: this.pingCount > 0 ? ((this.pingCount - this.failedPings) / this.pingCount) * 100 : 0
    };
  }
}

class ConnectionTester {
  private clients: SocketClient[] = [];
  private results: ConnectionResult[] = [];
  private config: BenchmarkConfig;
  private logger: Logger;
  private activeConnections: number = 0;
  private disconnectedConnections: number = 0;
  private spontaneousDisconnections: number = 0;

  constructor(config: BenchmarkConfig) {
    this.config = config;
    this.logger = new Logger();
    
    // Clear previous logs for fresh test
    this.logger.clearLogs();
    this.logger.logInfo('TEST_START', `Starting connection test with ${config.targetConnections} connections`);
  }

  private handleDisconnection = (clientId: string, reason: string, connectionDuration: number): void => {
    // Find the connection result and update it
    const resultIndex = this.results.findIndex(result => {
      const clientIndex = parseInt(clientId.replace('client-', ''));
      return this.results.indexOf(result) === clientIndex;
    });
    
    if (resultIndex !== -1 && this.results[resultIndex].success) {
      this.results[resultIndex].isActive = false;
      this.results[resultIndex].disconnectedAt = new Date();
      this.results[resultIndex].disconnectionReason = reason;
      this.results[resultIndex].connectionDuration = connectionDuration;
      this.results[resultIndex].spontaneousDisconnect = true;
      
      this.activeConnections = Math.max(0, this.activeConnections - 1);
      this.disconnectedConnections++;
      this.spontaneousDisconnections++;
      
      this.logger.logConnection(clientId, 'DISCONNECT', `Connection dropped spontaneously: ${reason}`, {
        reason,
        connectionDuration,
        activeConnections: this.activeConnections,
        totalDisconnected: this.disconnectedConnections
      });
      
      // Log progress every 10 disconnections
      if (this.spontaneousDisconnections % 10 === 0) {
        console.log(`⚠️  ${this.spontaneousDisconnections} spontaneous disconnections detected. Active: ${this.activeConnections}`);
      }
    }
  };

  public async testConnections(): Promise<ConnectionResult[]> {
    console.log(`
🚀 Starting connection test with ${this.config.targetConnections} connections
├─ Server: ${this.config.serverHost}:${this.config.serverPort}
├─ Connection rate: ${this.config.connectionRate} connections/second
└─ Test duration: ${this.config.testDuration} seconds
    `);

    const startTime = Date.now();
    
    /**
     * Simulate realword scenario by staggering connection attempts
     */
    /**
    const connectionPromises: Promise<void>[] = [];
    
    // Create connections with rate limiting
    for (let i = 0; i < this.config.targetConnections; i++) {
      const delay = i * (1000 / this.config.connectionRate);
      
      connectionPromises.push(
        new Promise(async (resolve) => {
          setTimeout(async () => {
            await this.createConnection(i);
            resolve();
          }, delay);
        })
      );
    }

    // Wait for all connections to complete
    await Promise.all(connectionPromises);
    */

    // Testing Connection by chunks to avoid overwhelming the server
    const chunkSize = this.config.connectionRate; // Number of connections to create per chunk
    for (let i = 0; i < this.config.targetConnections; i += chunkSize) {
      const chunkPromises: Promise<void>[] = [];
      
      for (let j = 0; j < chunkSize && (i + j) < this.config.targetConnections; j++) {
        chunkPromises.push(this.createConnection(i + j));
      }
      
      // Wait for the current chunk to complete
      await Promise.all(chunkPromises);
      
      // Wait 1 second before starting the next chunk to respect the connection rate
      if ((i + chunkSize) < this.config.targetConnections) {
        await new Promise(resolve => setTimeout(resolve, 1000));
      }
    }
    
    const connectionPhaseEnd = Date.now();
    console.log(`\n✅ Connection phase completed in ${(connectionPhaseEnd - startTime) / 1000}s`);
    
    // Keep connections alive for test duration
    if (this.config.testDuration > 0) {
      console.log(`\n⏱️  Keeping connections alive for ${this.config.testDuration} seconds...`);
      
      // Optionally send periodic messages during test
      if (this.config.messageInterval > 0) {
        await this.startMessageTesting();
      }
      
      await new Promise(resolve => setTimeout(resolve, this.config.testDuration * 1000));
    }

    // Disconnect all clients
    await this.disconnectAll();
    
    return this.results;
  }

  private async createConnection(index: number): Promise<void> {
    const client = new SocketClient(`client-${index}`, this.logger, this.handleDisconnection);
    this.clients.push(client);

    try {
      const headers: Record<string, string> = {};
      headers.authorization = this.config.token;
      headers.companyid = this.config.companyId;
      
      const maxRetries = this.config.maxRetries || 3;
      const retryDelay = this.config.retryDelay || 1000;
      
      const result = await client.connect(
        this.config.serverHost, 
        this.config.serverPort, 
        this.config.headers || headers,
        maxRetries,
        retryDelay
      );
      
      // Set initial active status
      result.isActive = result.success;
      this.results.push(result);

      if (result.success) {
        this.activeConnections++;
        
        if (this.results.length % 100 === 0) {
          const successful = this.results.filter(r => r.success).length;
          const failed = this.results.filter(r => !r.success).length;
          console.log(`Progress: ${this.results.length}/${this.config.targetConnections} (✅ ${successful}, ❌ ${failed}, 🔄 Active: ${this.activeConnections})`);
        }
        
        // Log successful connection with retry info
        if ((result.retryCount || 0) > 0) {
          // console.log(`✅ Connection ${index} succeeded after ${result.retryCount} retries`);
        }
      } else {
        // console.log(`❌ Connection ${index} failed: ${result.errorMessage}`);
      }
    } catch (error) {
      // console.error(`❌ Error creating connection ${index}:`, error);
      this.results.push({
        success: false,
        connectionTime: 0,
        errorMessage: error instanceof Error ? error.message : 'Unknown error',
        retryCount: this.config.maxRetries || 3,
        finalAttempt: true
      });
    }
  }

  private async startMessageTesting(): Promise<void> {
    console.log(`\n📨 Starting message testing (interval: ${this.config.messageInterval}ms)`);
    
    const connectedClients = this.clients.filter(client => client.isConnected());
    
    const messageInterval = setInterval(async () => {
      // Send ping to random subset of clients
      const sampleSize = Math.min(10, connectedClients.length);
      const randomClients = connectedClients
        .sort(() => 0.5 - Math.random())
        .slice(0, sampleSize);

      for (const client of randomClients) {
        try {
          await client.sendPing();
          await client.sendTestMessage({ content: this.config.message, size: this.config.messageSize, timestamp: Date.now() });
        } catch (error) {
          // Ignore ping errors during stress test
          // console.log(`⚠️  Ping error for ${client['clientId']}:`, error);
        }
      }
    }, this.config.messageInterval);

    // Stop message testing after test duration
    setTimeout(() => {
      clearInterval(messageInterval);
    }, this.config.testDuration * 1000);
  }

  private async disconnectAll(): Promise<void> {
    console.log('\n🔌 Disconnecting all clients...');
    this.logger.logInfo('DISCONNECT_ALL', `Starting disconnection of ${this.clients.length} clients (${this.activeConnections} still active)`);
    
    const disconnectPromises = this.clients.map((client, index) => {
      return new Promise<void>((resolve) => {
        // Update the result to mark as manually disconnected if still active
        if (this.results[index] && this.results[index].isActive) {
          this.results[index].isActive = false;
          this.results[index].disconnectedAt = new Date();
          this.results[index].disconnectionReason = 'manual_disconnect';
          this.results[index].spontaneousDisconnect = false;
        }
        
        client.disconnect();
        // Small delay to prevent overwhelming the server
        setTimeout(() => resolve(), 10);
      });
    });

    await Promise.all(disconnectPromises);
    
    // Reset active connection count
    this.activeConnections = 0;
    
    // Log ping statistics summary
    const pingStats = this.clients.map(client => client.getPingStats());
    const totalPings = pingStats.reduce((sum, stat) => sum + stat.total, 0);
    const totalFailedPings = pingStats.reduce((sum, stat) => sum + stat.failed, 0);
    const avgSuccessRate = pingStats.length > 0 ? 
      pingStats.reduce((sum, stat) => sum + stat.successRate, 0) / pingStats.length : 0;
    
    this.logger.logInfo('PING_SUMMARY', `Ping statistics: ${totalPings} total pings, ${totalFailedPings} failed, ${avgSuccessRate.toFixed(1)}% average success rate`);
    this.logger.logInfo('DISCONNECT_ALL', `All clients disconnected successfully. Spontaneous disconnections: ${this.spontaneousDisconnections}`);
    
    console.log(`✅ All clients disconnected (${this.spontaneousDisconnections} were spontaneous disconnections)`);
  }

  public getResults(): ConnectionResult[] {
    return this.results;
  }

  public getActiveConnectionCount(): number {
    return this.activeConnections;
  }

  public getConnectionStats(): {
    total: number;
    successful: number;
    failed: number;
    active: number;
    disconnected: number;
    spontaneousDisconnections: number;
  } {
    const successful = this.results.filter(r => r.success);
    const failed = this.results.filter(r => !r.success);
    const currentlyActive = this.results.filter(r => r.success && r.isActive);
    const disconnected = this.results.filter(r => r.success && !r.isActive);
    const spontaneouslyDisconnected = this.results.filter(r => r.spontaneousDisconnect);

    return {
      total: this.results.length,
      successful: successful.length,
      failed: failed.length,
      active: currentlyActive.length,
      disconnected: disconnected.length,
      spontaneousDisconnections: spontaneouslyDisconnected.length
    };
  }

  public printSummary(): void {
    const successful = this.results.filter(r => r.success);
    const failed = this.results.filter(r => !r.success);
    const currentlyActive = this.results.filter(r => r.success && r.isActive);
    const disconnected = this.results.filter(r => r.success && !r.isActive);
    const spontaneouslyDisconnected = this.results.filter(r => r.spontaneousDisconnect);
    const avgConnectionTime = successful.reduce((sum, r) => sum + r.connectionTime, 0) / successful.length;
    
    // Calculate average connection duration for disconnected connections
    const disconnectedWithDuration = disconnected.filter(r => r.connectionDuration !== undefined);
    const avgConnectionDuration = disconnectedWithDuration.length > 0 ? 
      disconnectedWithDuration.reduce((sum, r) => sum + (r.connectionDuration || 0), 0) / disconnectedWithDuration.length : 0;
    
    // Retry statistics
    const connectionsWithRetries = this.results.filter(r => (r.retryCount || 0) > 0);
    const totalRetries = this.results.reduce((sum, r) => sum + (r.retryCount || 0), 0);
    const successAfterRetries = successful.filter(r => (r.retryCount || 0) > 0);
    
    // Ping statistics
    const pingStats = this.clients.map(client => client.getPingStats());
    const totalPings = pingStats.reduce((sum, stat) => sum + stat.total, 0);
    const totalFailedPings = pingStats.reduce((sum, stat) => sum + stat.failed, 0);
    const avgPingSuccessRate = pingStats.length > 0 ? 
      pingStats.reduce((sum, stat) => sum + stat.successRate, 0) / pingStats.length : 0;
    
    // Log statistics
    const logStats = this.logger.getLogStats();

    console.log(`
┌─────────────────────────────────────────────────────────────┐
│ CONNECTION TEST RESULTS                                     │
├─────────────────────────────────────────────────────────────┤
│ Target Connections: ${this.config.targetConnections.toString().padStart(8)} │ Success Rate: ${((successful.length / this.results.length) * 100).toFixed(1).padStart(6)}% │
│ Successful:         ${successful.length.toString().padStart(8)} │ Failed:       ${failed.length.toString().padStart(8)} │
│ Currently Active:   ${currentlyActive.length.toString().padStart(8)} │ Disconnected: ${disconnected.length.toString().padStart(8)} │
│ Avg Connection Time: ${avgConnectionTime.toFixed(0).padStart(7)}ms │ Avg Duration: ${avgConnectionDuration.toFixed(0).padStart(7)}ms │
├─────────────────────────────────────────────────────────────┤
│ DISCONNECTION STATISTICS                                    │
├─────────────────────────────────────────────────────────────┤
│ Spontaneous Disconnects: ${spontaneouslyDisconnected.length.toString().padStart(4)} │ Retention Rate: ${((currentlyActive.length / Math.max(successful.length, 1)) * 100).toFixed(1).padStart(5)}% │
│ Connection Stability:    ${(((successful.length - spontaneouslyDisconnected.length) / Math.max(successful.length, 1)) * 100).toFixed(1).padStart(5)}% │                       │
├─────────────────────────────────────────────────────────────┤
│ RETRY STATISTICS                                            │
├─────────────────────────────────────────────────────────────┤
│ Connections w/ Retries: ${connectionsWithRetries.length.toString().padStart(5)} │ Total Retries: ${totalRetries.toString().padStart(8)} │
│ Success after Retry:    ${successAfterRetries.length.toString().padStart(5)} │ Max Retries:   ${(this.config.maxRetries || 3).toString().padStart(8)} │
├─────────────────────────────────────────────────────────────┤
│ PING STATISTICS                                             │
├─────────────────────────────────────────────────────────────┤
│ Total Pings:        ${totalPings.toString().padStart(8)} │ Failed Pings:  ${totalFailedPings.toString().padStart(8)} │
│ Ping Success Rate:   ${avgPingSuccessRate.toFixed(1).padStart(7)}% │                       │
├─────────────────────────────────────────────────────────────┤
│ LOGGING STATISTICS                                          │
├─────────────────────────────────────────────────────────────┤
│ Connection Logs:    ${logStats.connectionLogs.toString().padStart(8)} │ Error Logs:    ${logStats.errorLogs.toString().padStart(8)} │
│ Ping Logs:          ${logStats.pingLogs.toString().padStart(8)} │                       │
└─────────────────────────────────────────────────────────────┘
    `);
    
    // Log final summary
    this.logger.logInfo('TEST_COMPLETE', `Test completed: ${successful.length}/${this.results.length} connections successful (${((successful.length / this.results.length) * 100).toFixed(1)}%), ${currentlyActive.length} still active`, {
      successful: successful.length,
      failed: failed.length,
      currentlyActive: currentlyActive.length,
      disconnected: disconnected.length,
      spontaneousDisconnections: spontaneouslyDisconnected.length,
      avgConnectionTime,
      avgConnectionDuration,
      totalRetries,
      totalPings,
      totalFailedPings,
      avgPingSuccessRate,
      retentionRate: (currentlyActive.length / Math.max(successful.length, 1)) * 100,
      stabilityRate: ((successful.length - spontaneouslyDisconnected.length) / Math.max(successful.length, 1)) * 100
    });

    if (spontaneouslyDisconnected.length > 0) {
      console.log('\n⚠️  Disconnection Breakdown:');
      const disconnectionReasons = spontaneouslyDisconnected.reduce((acc, result) => {
        const reason = result.disconnectionReason || 'Unknown reason';
        acc[reason] = (acc[reason] || 0) + 1;
        return acc;
      }, {} as Record<string, number>);

      Object.entries(disconnectionReasons).forEach(([reason, count]) => {
        console.log(`   ${reason}: ${count} disconnections`);
      });
      
      // Show average connection duration for disconnected connections
      if (avgConnectionDuration > 0) {
        console.log(`   Average connection duration: ${(avgConnectionDuration / 1000).toFixed(1)}s`);
      }
    }

    if (failed.length > 0) {
      console.log('\n❌ Failed Connection Errors:');
      const errorCounts = failed.reduce((acc, result) => {
        const error = result.errorMessage || 'Unknown error';
        acc[error] = (acc[error] || 0) + 1;
        return acc;
      }, {} as Record<string, number>);

      Object.entries(errorCounts).forEach(([error, count]) => {
        console.log(`   ${error}: ${count} occurrences`);
      });
    }

    if (connectionsWithRetries.length > 0) {
      console.log('\n🔄 Retry Statistics:');
      const retryDistribution = connectionsWithRetries.reduce((acc, result) => {
        const retries = result.retryCount || 0;
        acc[retries] = (acc[retries] || 0) + 1;
        return acc;
      }, {} as Record<number, number>);

      Object.entries(retryDistribution).forEach(([retries, count]) => {
        console.log(`   ${retries} retries: ${count} connections`);
      });
    }
    
    console.log('\n📂 Log files created:');
    console.log(`   ./logs/connections.log (${logStats.connectionLogs} entries)`);
    console.log(`   ./logs/errors.log (${logStats.errorLogs} entries)`);
    console.log(`   ./logs/pings.log (${logStats.pingLogs} entries)`);
  }

  // Method to simulate random disconnections for testing
  public simulateRandomDisconnections(percentage: number = 10): void {
    const connectedClients = this.clients.filter((_, index) => 
      this.results[index]?.success && this.results[index]?.isActive
    );
    
    const disconnectCount = Math.floor(connectedClients.length * (percentage / 100));
    console.log(`🎲 Simulating ${disconnectCount} random disconnections (${percentage}% of ${connectedClients.length} active connections)`);
    
    for (let i = 0; i < disconnectCount; i++) {
      const randomIndex = Math.floor(Math.random() * connectedClients.length);
      const client = connectedClients[randomIndex];
      
      if (client && client.isConnected()) {
        // Simulate network issue by disconnecting the socket
        setTimeout(() => {
          client.disconnect();
        }, i * 100); // Stagger disconnections
      }
    }
  }
}

// Export for use in other modules
export { ConnectionTester, SocketClient };

// CLI interface when run directly
if (require.main === module) {
  const config: BenchmarkConfig = {
    targetConnections: parseInt(process.argv[2]) || 1000,
    connectionRate: parseInt(process.argv[3]) || 50,
    testDuration: parseInt(process.argv[4]) || 30,
    messageInterval: parseInt(process.argv[5]) || 1000,
    messageSize: 1024,
    message: 'Test message from client - custom',
    serverHost: process.env.SERVER_HOST || 'localhost',
    serverPort: parseInt(process.env.SERVER_PORT || '3000'),
    maxRetries: parseInt(process.env.MAX_RETRIES || '3'),
    retryDelay: parseInt(process.env.RETRY_DELAY || '1000'),
    companyId: process.env.COMPANY_ID || '11110000',
    token: process.env.AUTH_TOKEN || 'your_token_here'
  };

  const tester = new ConnectionTester(config);
  
  tester.testConnections()
    .then(() => {
      tester.printSummary();
      process.exit(0);
    })
    .catch((error) => {
      console.error('❌ Test failed:', error);
      process.exit(1);
    });
}