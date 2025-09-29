import chalk from 'chalk';
import { program } from 'commander';
import ora from 'ora';
import { ConnectionTester } from './client';
import { PerformanceTracker } from './monitor';
import { BenchmarkConfig, BenchmarkResults, ConnectionResult } from './types';

class SocketBenchmark {
  private performanceTracker: PerformanceTracker;
  private results: BenchmarkResults | null = null;

  constructor() {
    this.performanceTracker = new PerformanceTracker();
  }

  public async runBenchmark(config: BenchmarkConfig): Promise<BenchmarkResults> {
    console.log(chalk.blue.bold(`
🎯 SOCKET.IO BENCHMARK TEST
═══════════════════════════
Target: ${config.targetConnections.toLocaleString()} concurrent connections
Server: ${config.serverHost}:${config.serverPort}
Rate: ${config.connectionRate} connections/second
Duration: ${config.testDuration} seconds
    `));

    const startTime = new Date();
    this.performanceTracker.startTracking();

    // Initialize results
    this.results = {
      config,
      startTime,
      endTime: new Date(),
      totalDuration: 0,
      successfulConnections: 0,
      failedConnections: 0,
      maxConcurrentConnections: 0,
      averageConnectionTime: 0,
      connectionSuccessRate: 0,
      peakMemoryUsage: 0,
      peakCpuUsage: 0,
      errors: []
    };

    try {
      // Step 1: Test server availability
      await this.testServerAvailability(config);

      // Step 2: Run incremental load test
      if (config.targetConnections > 1000) {
        await this.runIncrementalTest(config);
      }

      // Step 3: Run main benchmark
      const connectionResults = await this.runMainBenchmark(config);

      // Step 4: Analyze results
      this.analyzeResults(connectionResults, startTime);

      // Step 5: Generate report
      this.generateReport();

    } catch (error) {
      console.error(chalk.red('❌ Benchmark failed:'), error);
      this.results.errors.push(error instanceof Error ? error.message : 'Unknown error');
    } finally {
      this.performanceTracker.stopTracking();
      this.results.endTime = new Date();
      this.results.totalDuration = (this.results.endTime.getTime() - startTime.getTime()) / 1000;
    }

    return this.results;
  }

  private async testServerAvailability(config: BenchmarkConfig): Promise<void> {
    const spinner = ora('Testing server availability...').start();
    
    try {
      const tester = new ConnectionTester({
        ...config,
        targetConnections: 1,
        connectionRate: 1,
        testDuration: 5
      });

      const results = await tester.testConnections();
      
      if (results[0]?.success) {
        spinner.succeed(chalk.green('✅ Server is available and responding'));
      } else {
        spinner.fail(chalk.red('❌ Server is not responding'));
        throw new Error(`Server unavailable: ${results[0]?.errorMessage}`);
      }
    } catch (error) {
      spinner.fail(chalk.red('❌ Failed to connect to server'));
      throw error;
    }
  }

  private async runIncrementalTest(config: BenchmarkConfig): Promise<void> {
    console.log(chalk.yellow('\n📈 Running incremental load test...'));
    
    const testSteps = [
      Math.floor(config.targetConnections * 0.1),  // 10%
      Math.floor(config.targetConnections * 0.25), // 25%
      Math.floor(config.targetConnections * 0.5),  // 50%
      Math.floor(config.targetConnections * 0.75)  // 75%
    ];

    for (const stepConnections of testSteps) {
      const spinner = ora(`Testing ${stepConnections.toLocaleString()} connections...`).start();
      
      try {
        const stepConfig: BenchmarkConfig = {
          ...config,
          targetConnections: stepConnections,
          testDuration: 10 // Shorter duration for incremental tests
        };

        const tester = new ConnectionTester(stepConfig);
        const results = await tester.testConnections();
        
        const successRate = (results.filter(r => r.success).length / results.length) * 100;
        
        if (successRate >= 95) {
          spinner.succeed(chalk.green(`✅ ${stepConnections.toLocaleString()} connections (${successRate.toFixed(1)}% success)`));
        } else if (successRate >= 80) {
          spinner.warn(chalk.yellow(`⚠️  ${stepConnections.toLocaleString()} connections (${successRate.toFixed(1)}% success)`));
        } else {
          spinner.fail(chalk.red(`❌ ${stepConnections.toLocaleString()} connections (${successRate.toFixed(1)}% success)`));
          console.log(chalk.yellow('Consider reducing target connections or optimizing server'));
        }

        this.performanceTracker.recordConnection(results.filter(r => r.success).length);

        // Brief pause between tests
        await new Promise(resolve => setTimeout(resolve, 2000));

      } catch (error) {
        spinner.fail(chalk.red(`❌ Step test failed: ${error}`));
        this.performanceTracker.recordError(error instanceof Error ? error.message : 'Unknown error');
      }
    }
  }

  private async runMainBenchmark(config: BenchmarkConfig): Promise<ConnectionResult[]> {
    console.log(chalk.blue('\n🚀 Running main benchmark test...'));
    
    const tester = new ConnectionTester(config);
    const results = await tester.testConnections();
    
    // Record metrics during the test
    const successfulConnections = results.filter(r => r.success).length;
    this.performanceTracker.recordConnection(successfulConnections);

    return results;
  }

  private analyzeResults(connectionResults: ConnectionResult[], startTime: Date): void {
    if (!this.results) return;

    const successful = connectionResults.filter(r => r.success);
    const failed = connectionResults.filter(r => !r.success);

    this.results.successfulConnections = successful.length;
    this.results.failedConnections = failed.length;
    this.results.maxConcurrentConnections = successful.length;
    this.results.connectionSuccessRate = (successful.length / connectionResults.length) * 100;
    
    if (successful.length > 0) {
      this.results.averageConnectionTime = 
        successful.reduce((sum, r) => sum + r.connectionTime, 0) / successful.length;
    }

    // Get system metrics
    const systemMetrics = this.performanceTracker.getSystemMetrics();
    this.results.peakMemoryUsage = systemMetrics.process.memory.rss;
    this.results.peakCpuUsage = systemMetrics.cpu.usage;

    // Collect error messages
    this.results.errors = failed
      .map(r => r.errorMessage)
      .filter((error, index, array) => error && array.indexOf(error) === index) as string[];
  }

  private generateReport(): void {
    if (!this.results) return;

    console.log(chalk.green.bold(`
📊 BENCHMARK RESULTS
═══════════════════════════════════════════════════════════════
`));

    // Connection Results
    console.log(chalk.white.bold('CONNECTION RESULTS:'));
    console.log(`├─ Target Connections: ${this.results.config.targetConnections.toLocaleString()}`);
    console.log(`├─ Successful: ${chalk.green(this.results.successfulConnections.toLocaleString())} (${this.results.connectionSuccessRate.toFixed(1)}%)`);
    console.log(`├─ Failed: ${chalk.red(this.results.failedConnections.toLocaleString())} (${(100 - this.results.connectionSuccessRate).toFixed(1)}%)`);
    console.log(`└─ Average Connection Time: ${this.results.averageConnectionTime.toFixed(0)}ms\n`);

    // Performance Metrics
    console.log(chalk.white.bold('PERFORMANCE METRICS:'));
    console.log(`├─ Peak Memory Usage: ${(this.results.peakMemoryUsage / 1024 / 1024).toFixed(1)} MB`);
    console.log(`├─ Peak CPU Usage: ${this.results.peakCpuUsage.toFixed(1)}%`);
    console.log(`├─ Test Duration: ${this.results.totalDuration.toFixed(1)}s`);
    console.log(`└─ Connection Rate: ${(this.results.successfulConnections / this.results.totalDuration).toFixed(1)} connections/s\n`);

    // System Recommendations
    this.generateRecommendations();

    // Error Summary
    if (this.results.errors.length > 0) {
      console.log(chalk.red.bold('ERRORS ENCOUNTERED:'));
      this.results.errors.forEach(error => {
        console.log(`├─ ${error}`);
      });
      console.log('');
    }

    // Performance Assessment
    this.assessPerformance();
  }

  private generateRecommendations(): void {
    if (!this.results) return;

    console.log(chalk.cyan.bold('RECOMMENDATIONS:'));

    if (this.results.connectionSuccessRate < 95) {
      console.log(`├─ ${chalk.yellow('⚠️')} Consider increasing connection timeout or reducing connection rate`);
    }

    if (this.results.peakMemoryUsage > 6 * 1024 * 1024 * 1024) { // 6GB
      console.log(`├─ ${chalk.yellow('⚠️')} High memory usage detected. Consider optimizing memory management`);
    }

    if (this.results.peakCpuUsage > 80) {
      console.log(`├─ ${chalk.yellow('⚠️')} High CPU usage detected. Consider CPU optimization`);
    }

    if (this.results.averageConnectionTime > 5000) { // 5 seconds
      console.log(`├─ ${chalk.yellow('⚠️')} Slow connection times. Check network latency and server performance`);
    }

    const memoryPerConnection = this.results.peakMemoryUsage / this.results.successfulConnections;
    console.log(`├─ Memory per connection: ~${(memoryPerConnection / 1024).toFixed(1)} KB`);

    const theoreticalMax = Math.floor(2 * 1024 * 1024 * 1024 / memoryPerConnection); // 8GB limit
    console.log(`└─ Theoretical maximum connections: ~${theoreticalMax.toLocaleString()}`);
    console.log('');
  }

  private assessPerformance(): void {
    if (!this.results) return;

    console.log(chalk.magenta.bold('PERFORMANCE ASSESSMENT:'));

    let score = 0;
    let maxScore = 0;

    // Connection success rate (40% of score)
    const successWeight = 40;
    const successScore = (this.results.connectionSuccessRate / 100) * successWeight;
    score += successScore;
    maxScore += successWeight;

    // Memory efficiency (30% of score)
    const memoryWeight = 30;
    const memoryPerConnection = this.results.peakMemoryUsage / this.results.successfulConnections;
    const memoryEfficiency = Math.max(0, 1 - (memoryPerConnection / (2 * 1024 * 1024))); // Target: <2MB per connection
    const memoryScore = memoryEfficiency * memoryWeight;
    score += memoryScore;
    maxScore += memoryWeight;

    // CPU efficiency (20% of score)
    const cpuWeight = 20;
    const cpuEfficiency = Math.max(0, 1 - (this.results.peakCpuUsage / 100));
    const cpuScore = cpuEfficiency * cpuWeight;
    score += cpuScore;
    maxScore += cpuWeight;

    // Connection speed (10% of score)
    const speedWeight = 10;
    const speedEfficiency = Math.max(0, 1 - (this.results.averageConnectionTime / 10000)); // Target: <10s
    const speedScore = speedEfficiency * speedWeight;
    score += speedScore;
    maxScore += speedWeight;

    const finalScore = (score / maxScore) * 100;

    let grade = 'F';
    let color = chalk.red;
    
    if (finalScore >= 90) { grade = 'A+'; color = chalk.green; }
    else if (finalScore >= 85) { grade = 'A'; color = chalk.green; }
    else if (finalScore >= 80) { grade = 'B+'; color = chalk.blue; }
    else if (finalScore >= 75) { grade = 'B'; color = chalk.blue; }
    else if (finalScore >= 70) { grade = 'C+'; color = chalk.yellow; }
    else if (finalScore >= 65) { grade = 'C'; color = chalk.yellow; }
    else if (finalScore >= 60) { grade = 'D'; color = chalk.red; }

    console.log(`├─ Overall Performance Score: ${color(finalScore.toFixed(1))}% (Grade: ${color(grade)})`);
    console.log(`├─ Connection Success: ${this.results.connectionSuccessRate.toFixed(1)}% (${successScore.toFixed(1)}/${successWeight})`);
    console.log(`├─ Memory Efficiency: ${(memoryEfficiency * 100).toFixed(1)}% (${memoryScore.toFixed(1)}/${memoryWeight})`);
    console.log(`├─ CPU Efficiency: ${(cpuEfficiency * 100).toFixed(1)}% (${cpuScore.toFixed(1)}/${cpuWeight})`);
    console.log(`└─ Connection Speed: ${(speedEfficiency * 100).toFixed(1)}% (${speedScore.toFixed(1)}/${speedWeight})`);
    console.log('');

    // 10K Connection Assessment
    if (this.results.successfulConnections >= 10000 && this.results.connectionSuccessRate >= 95) {
      console.log(chalk.green.bold('🎉 SUCCESS! Your server can handle 10,000+ concurrent connections!'));
    } else if (this.results.successfulConnections >= 5000) {
      console.log(chalk.yellow.bold('🎯 GOOD! Your server can handle 5,000+ connections. Close to the 10K goal!'));
    } else {
      console.log(chalk.red.bold('📈 NEEDS IMPROVEMENT! Your server needs optimization to reach 10K connections.'));
    }
  }

  public exportResults(filename?: string): string {
    if (!this.results) {
      throw new Error('No results to export');
    }

    const exportData = {
      ...this.results,
      exportedAt: new Date().toISOString(),
      performanceMetrics: this.performanceTracker.exportMetrics()
    };

    const data = JSON.stringify(exportData, null, 2);
    
    if (filename) {
      require('fs').writeFileSync(filename, data);
      console.log(chalk.green(`📄 Results exported to: ${filename}`));
    }

    return data;
  }
}

// CLI Interface
program
  .name('socket-benchmark')
  .description('Socket.IO benchmark tool for testing concurrent connections')
  .version('1.0.0');

program
  .command('run')
  .description('Run benchmark test')
  .option('-c, --connections <number>', 'target number of connections', '1000')
  .option('-r, --rate <number>', 'connections per second', '50')
  .option('-d, --duration <number>', 'test duration in seconds', '30')
  .option('-h, --host <string>', 'server host', 'localhost')
  .option('-p, --port <number>', 'server port', '8002')
  .option('-i, --interval <number>', 'message interval in seconds', '1')
  .option('--max-retries <number>', 'maximum retry attempts per connection', '3')
  .option('--retry-delay <number>', 'base delay between retries in seconds', '1')
  .option('-o, --output <string>', 'output file for results')
  .action(async (options) => {
    const config: BenchmarkConfig = {
      targetConnections: parseInt(options.connections),
      connectionRate: parseInt(options.rate),
      testDuration: parseInt(options.duration),
      messageInterval: parseInt(options.interval)*1000, // Convert to ms
      messageSize: 1024,
      message: 'Test message from benchmark tool',
      serverHost: options.host,
      serverPort: parseInt(options.port),
      maxRetries: parseInt(options.maxRetries),
      retryDelay: parseInt(options.retryDelay)*1000, // Convert to ms
      companyId: process.env.COMPANY_ID || '11110000',
      token: process.env.AUTH_TOKEN || 'your_token_here'
    };

    const benchmark = new SocketBenchmark();
    
    try {
      await benchmark.runBenchmark(config);
      
      if (options.output) {
        benchmark.exportResults(options.output);
      }
    } catch (error) {
      console.error(chalk.red('Benchmark failed:'), error);
      process.exit(1);
    }
  });

program
  .command('quick')
  .description('Run quick tests with preset configurations')
  .option('-h, --host <string>', 'server host', 'localhost')
  .option('-p, --port <number>', 'server port', '3000')
  .option('--max-retries <number>', 'maximum retry attempts per connection', '3')
  .option('--retry-delay <number>', 'base delay between retries in ms', '1000')
  .action(async (options) => {
    const tests = [
      { name: '1K Test', connections: 1000, rate: 100 },
      { name: '5K Test', connections: 5000, rate: 200 },
      { name: '10K Test', connections: 10000, rate: 300 }
    ];

    const benchmark = new SocketBenchmark();

    for (const test of tests) {
      console.log(chalk.blue.bold(`\n🧪 Running ${test.name}...`));
      
      const config: BenchmarkConfig = {
        targetConnections: test.connections,
        connectionRate: test.rate,
        testDuration: 30,
        messageInterval: 1000,
        messageSize: 1024,
        message: 'Test message from benchmark tool',
        serverHost: options.host,
        serverPort: parseInt(options.port),
        maxRetries: parseInt(options.maxRetries || '3'),
        retryDelay: parseInt(options.retryDelay || '1000'),
        companyId: process.env.COMPANY_ID || '11110000',
        token: process.env.AUTH_TOKEN || 'your_token_here'
      };

      try {
        await benchmark.runBenchmark(config);
        await new Promise(resolve => setTimeout(resolve, 5000)); // Cool down between tests
      } catch (error) {
        console.error(chalk.red(`${test.name} failed:`), error);
      }
    }
  });

if (require.main === module) {
  program.parse();
}

export default SocketBenchmark;