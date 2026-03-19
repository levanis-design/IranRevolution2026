export class Logger {
  info(msg: string): void {
    console.log(msg);
  }

  success(msg: string): void {
    console.log(msg);
  }

  warn(msg: string): void {
    console.log(msg);
  }

  error(msg: string, err?: unknown): void {
    if (err) {
      console.error(msg, err);
    } else {
      console.error(msg);
    }
  }

  divider(): void {
    console.log('═══════════════════════════════════════');
  }

  emptyLine(): void {
    console.log();
  }
}

export const logger = new Logger();
