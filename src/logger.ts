import * as fs from 'fs';
import * as path from 'path';

export interface LogEntry {
  timestamp: string;
  level: 'INFO' | 'WARN' | 'ERROR' | 'DEBUG';
  clientId?: string;
  event: string;
  message: string;
  details?: any;
}

export class Logger {
  private logDir: string;
  private connectionLogFile: string;
  private errorLogFile: string;
  private pingLogFile: string;

  constructor(logDir: string = './logs') {
    this.logDir = logDir;
    this.connectionLogFile = path.join(logDir, 'connections.log');
    this.errorLogFile = path.join(logDir, 'errors.log');
    this.pingLogFile = path.join(logDir, 'pings.log');
    
    this.ensureLogDirectory();
  }

  private ensureLogDirectory(): void {
    if (!fs.existsSync(this.logDir)) {
      fs.mkdirSync(this.logDir, { recursive: true });
    }
  }

  private formatLogEntry(entry: LogEntry): string {
    const details = entry.details ? ` | Details: ${JSON.stringify(entry.details)}` : '';
    const clientId = entry.clientId ? ` | Client: ${entry.clientId}` : '';
    return `[${entry.timestamp}] ${entry.level} | ${entry.event}${clientId} | ${entry.message}${details}\n`;
  }

  private writeToFile(filePath: string, content: string): void {
    try {
      fs.appendFileSync(filePath, content, 'utf8');
    } catch (error) {
      console.error(`Failed to write to log file ${filePath}:`, error);
    }
  }

  public logConnection(clientId: string, event: 'CONNECT' | 'DISCONNECT' | 'RETRY', message: string, details?: any): void {
    const entry: LogEntry = {
      timestamp: new Date().toISOString(),
      level: 'INFO',
      clientId,
      event,
      message,
      details
    };

    this.writeToFile(this.connectionLogFile, this.formatLogEntry(entry));
    
    // Also log to console for immediate feedback
    console.log(`📋 ${event}: ${clientId} - ${message}`);
  }

  public logError(clientId: string, event: 'CONNECTION_ERROR' | 'PING_ERROR' | 'SOCKET_ERROR', message: string, details?: any): void {
    const entry: LogEntry = {
      timestamp: new Date().toISOString(),
      level: 'ERROR',
      clientId,
      event,
      message,
      details
    };

    this.writeToFile(this.errorLogFile, this.formatLogEntry(entry));
    
    // Also log to console for immediate feedback
    console.error(`❌ ${event}: ${clientId} - ${message}`);
  }

  public logPing(clientId: string, latency: number, success: boolean, details?: any): void {
    const entry: LogEntry = {
      timestamp: new Date().toISOString(),
      level: success ? 'DEBUG' : 'WARN',
      clientId,
      event: success ? 'PING_SUCCESS' : 'PING_FAILURE',
      message: success ? `Latency: ${latency}ms` : `Ping failed: ${details?.error || 'Unknown error'}`,
      details: { latency, success, ...details }
    };

    this.writeToFile(this.pingLogFile, this.formatLogEntry(entry));
  }

  public logInfo(event: string, message: string, details?: any): void {
    const entry: LogEntry = {
      timestamp: new Date().toISOString(),
      level: 'INFO',
      event,
      message,
      details
    };

    this.writeToFile(this.connectionLogFile, this.formatLogEntry(entry));
    console.log(`ℹ️  ${event}: ${message}`);
  }

  public logWarning(event: string, message: string, details?: any): void {
    const entry: LogEntry = {
      timestamp: new Date().toISOString(),
      level: 'WARN',
      event,
      message,
      details
    };

    this.writeToFile(this.errorLogFile, this.formatLogEntry(entry));
    console.warn(`⚠️  ${event}: ${message}`);
  }

  public getLogStats(): { connectionLogs: number; errorLogs: number; pingLogs: number } {
    const getLineCount = (filePath: string): number => {
      try {
        if (!fs.existsSync(filePath)) return 0;
        const content = fs.readFileSync(filePath, 'utf8');
        return content.split('\n').filter(line => line.trim().length > 0).length;
      } catch {
        return 0;
      }
    };

    return {
      connectionLogs: getLineCount(this.connectionLogFile),
      errorLogs: getLineCount(this.errorLogFile),
      pingLogs: getLineCount(this.pingLogFile)
    };
  }

  public clearLogs(): void {
    const files = [this.connectionLogFile, this.errorLogFile, this.pingLogFile];
    files.forEach(file => {
      try {
        if (fs.existsSync(file)) {
          fs.unlinkSync(file);
        }
      } catch (error) {
        console.error(`Failed to clear log file ${file}:`, error);
      }
    });
    console.log('📂 All log files cleared');
  }
}