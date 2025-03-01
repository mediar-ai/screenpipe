import * as Sentry from "@sentry/nextjs";

export class RouteLogger {
  private logs: string[] = [];
  private component: string;

  constructor(component: string) {
    this.component = component;
  }

  log(...messages: any[]) {
    const message = messages.join(' ');
    const timestamp = new Date().toISOString();
    const formattedMessage = `${timestamp} - ${message}`;
    
    console.log(`[${this.component}] ${message}`);
    this.logs.push(formattedMessage);

    if (message.toLowerCase().includes('error') || message.toLowerCase().includes('failed')) {
      Sentry.captureMessage(`${this.component}: ${message}`, {
        level: 'error',
        tags: { component: this.component },
        extra: { logs: this.logs }
      });
    }
  }

  error(message: string) {
    const timestamp = new Date().toISOString();
    const formattedMessage = `${timestamp} - ERROR: ${message}`;
    
    console.error(`[${this.component}] ${message}`);
    this.logs.push(formattedMessage);

    Sentry.captureMessage(`${this.component}: ${message}`, {
      level: 'error',
      tags: { component: this.component },
      extra: { logs: this.logs }
    });
  }

  getLogs() {
    return this.logs;
  }
} 