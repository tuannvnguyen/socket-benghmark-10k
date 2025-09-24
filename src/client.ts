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

  public async connect(host: string, port: number): Promise<ConnectionResult> {
    const startTime = Date.now();
    
    try {
      this.socket = io(`http://${host}:${port}`, {
        transports: ['websocket', 'polling'],
        timeout: 10000,
        reconnection: false,
        forceNew: true
      });

      return new Promise((resolve) => {
        const timeoutId = setTimeout(() => {
          resolve({
            success: false,
            connectionTime: Date.now() - startTime,
            errorMessage: 'Connection timeout'
          });
        }, 15000);

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
      }, 5000);

      this.socket!.emit('test-message', data);
      
      this.socket!.once('test-response', (response) => {
        console.log('Response:', response);
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
      const result = await client.connect(this.config.serverHost, this.config.serverPort);
      this.results.push(result);

      if (result.success) {
        if (this.results.length % 100 === 0) {
          const successful = this.results.filter(r => r.success).length;
          const failed = this.results.filter(r => !r.success).length;
          console.log(`Progress: ${this.results.length}/${this.config.targetConnections} (✅ ${successful}, ❌ ${failed})`);
        }
      } else {
        console.log(`❌ Connection ${index} failed: ${result.errorMessage}`);
      }
    } catch (error) {
      console.error(`❌ Error creating connection ${index}:`, error);
      this.results.push({
        success: false,
        connectionTime: 0,
        errorMessage: error instanceof Error ? error.message : 'Unknown error'
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
          console.log(`⚠️  Ping error for ${client['clientId']}:`, error);
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

    console.log(`
┌─────────────────────────────────────────────────────────────┐
│ CONNECTION TEST RESULTS                                     │
├─────────────────────────────────────────────────────────────┤
│ Target Connections: ${this.config.targetConnections.toString().padStart(8)} │ Success Rate: ${((successful.length / this.results.length) * 100).toFixed(1).padStart(6)}% │
│ Successful:         ${successful.length.toString().padStart(8)} │ Failed:       ${failed.length.toString().padStart(8)} │
│ Avg Connection Time: ${avgConnectionTime.toFixed(0).padStart(7)}ms │                       │
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
    serverPort: parseInt(process.env.SERVER_PORT || '3000')
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