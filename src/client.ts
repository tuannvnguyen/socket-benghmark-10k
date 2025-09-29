import { io, Socket } from 'socket.io-client';
import { BenchmarkConfig, ConnectionResult } from './types';

class SocketClient {
  private socket: Socket | null = null;
  private connectionTime: number = 0;
  private connected: boolean = false;
  private clientId: string;

  constructor(clientId: string) {
    this.clientId = clientId;
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
      this.socket = io(`http://${host}:${port}${namespace}`, socketOptions);

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
          this.connected = true;
          
          resolve({
            success: true,
            connectionTime: this.connectionTime,
            socketId: this.socket!.id
          });
        });

        this.socket!.on('connect_error', (error) => {
          clearTimeout(timeoutId);
          resolve({
            success: false,
            connectionTime: Date.now() - startTime,
            errorMessage: error.message
          });
        });

        this.socket!.on('disconnect', (reason) => {
          this.connected = false;
        //   console.log(`Client ${this.clientId} disconnected: ${reason}`);
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
    if (this.socket) {
      this.socket.removeAllListeners();
      this.socket.disconnect();
      this.socket = null;
    }
    this.connected = false;
    this.connectionTime = 0;
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
}

class ConnectionTester {
  private clients: SocketClient[] = [];
  private results: ConnectionResult[] = [];
  private config: BenchmarkConfig;

  constructor(config: BenchmarkConfig) {
    this.config = config;
  }

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
    const client = new SocketClient(`client-${index}`);
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
      this.results.push(result);

      if (result.success) {
        if (this.results.length % 100 === 0) {
          const successful = this.results.filter(r => r.success).length;
          const failed = this.results.filter(r => !r.success).length;
          console.log(`Progress: ${this.results.length}/${this.config.targetConnections} (✅ ${successful}, ❌ ${failed})`);
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
    
    const disconnectPromises = this.clients.map(client => {
      return new Promise<void>((resolve) => {
        client.disconnect();
        // Small delay to prevent overwhelming the server
        setTimeout(() => resolve(), 10);
      });
    });

    await Promise.all(disconnectPromises);
    console.log('✅ All clients disconnected');
  }

  public getResults(): ConnectionResult[] {
    return this.results;
  }

  public printSummary(): void {
    const successful = this.results.filter(r => r.success);
    const failed = this.results.filter(r => !r.success);
    const avgConnectionTime = successful.reduce((sum, r) => sum + r.connectionTime, 0) / successful.length;
    
    // Retry statistics
    const connectionsWithRetries = this.results.filter(r => (r.retryCount || 0) > 0);
    const totalRetries = this.results.reduce((sum, r) => sum + (r.retryCount || 0), 0);
    const successAfterRetries = successful.filter(r => (r.retryCount || 0) > 0);

    console.log(`
┌─────────────────────────────────────────────────────────────┐
│ CONNECTION TEST RESULTS                                     │
├─────────────────────────────────────────────────────────────┤
│ Target Connections: ${this.config.targetConnections.toString().padStart(8)} │ Success Rate: ${((successful.length / this.results.length) * 100).toFixed(1).padStart(6)}% │
│ Successful:         ${successful.length.toString().padStart(8)} │ Failed:       ${failed.length.toString().padStart(8)} │
│ Avg Connection Time: ${avgConnectionTime.toFixed(0).padStart(7)}ms │                       │
├─────────────────────────────────────────────────────────────┤
│ RETRY STATISTICS                                            │
├─────────────────────────────────────────────────────────────┤
│ Connections w/ Retries: ${connectionsWithRetries.length.toString().padStart(5)} │ Total Retries: ${totalRetries.toString().padStart(8)} │
│ Success after Retry:    ${successAfterRetries.length.toString().padStart(5)} │ Max Retries:   ${(this.config.maxRetries || 3).toString().padStart(8)} │
└─────────────────────────────────────────────────────────────┘
    `);

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