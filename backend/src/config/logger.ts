type LogLevel = "info" | "error";
type LogFields = Record<string, unknown>;

function serializeError(error: unknown): LogFields {
  if (error instanceof Error) {
    return { name: error.name, message: error.message, stack: error.stack };
  }
  return { message: String(error) };
}

function write(level: LogLevel, event: string, fields: LogFields = {}): void {
  const line = JSON.stringify({ timestamp: new Date().toISOString(), level, event, ...fields });
  if (level === "error") console.error(line);
  else console.log(line);
}

export const logger = {
  info(event: string, fields?: LogFields) {
    write("info", event, fields);
  },
  error(event: string, error: unknown, fields: LogFields = {}) {
    write("error", event, { ...fields, error: serializeError(error) });
  }
};
