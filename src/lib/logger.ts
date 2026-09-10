import pino from 'pino';
import pretty from 'pino-pretty';

const isDevelopment = process.env.NODE_ENV === 'development';

/**
 * Application-wide logger configuration
 *
 * Log Levels:
 * - fatal (60): Application is unusable
 * - error (50): Error occurred, but application continues
 * - warn (40): Warning condition
 * - info (30): General informational messages
 * - debug (20): Debug information
 * - trace (10): Very detailed information
 */
/**
 * pino-pretty is attached as a destination stream, not as a `transport`.
 *
 * A transport runs the formatter in a worker thread spawned by thread-stream,
 * whose worker path the Next bundler rewrites to `/ROOT/node_modules/...`. That
 * file does not exist, so the worker died on the first log line and every
 * `logger.*` call after it threw `the worker has exited` -- as an
 * uncaughtException, from inside request handlers. Logging an error was enough
 * to bury the error being logged. A destination stream formats in-process and
 * has no worker to lose.
 */
const destination = isDevelopment
  ? pretty({
      colorize: true,
      translateTime: 'HH:MM:ss.l',
      ignore: 'pid,hostname',
      singleLine: false,
    })
  : undefined;

const logger = pino(
  {
    level: process.env.LOG_LEVEL || (isDevelopment ? 'debug' : 'info'),
    formatters: {
      level: (label) => {
        return { level: label.toUpperCase() };
      },
    },
    timestamp: pino.stdTimeFunctions.isoTime,
  },
  destination
);

export function logRequest(method: string, path: string, userId?: string) {
  logger.info({
    type: 'request',
    method,
    path,
    userId,
  }, `${method} ${path}`);
}

export function logResponse(method: string, path: string, statusCode: number, duration: number) {
  const level = statusCode >= 500 ? 'error' : statusCode >= 400 ? 'warn' : 'info';
  logger[level]({
    type: 'response',
    method,
    path,
    statusCode,
    duration,
  }, `${method} ${path} - ${statusCode} (${duration}ms)`);
}

export function logError(error: Error, context?: Record<string, unknown>) {
  logger.error({
    type: 'error',
    error: {
      message: error.message,
      stack: error.stack,
      name: error.name,
    },
    ...context,
  }, error.message);
}

export function logExternalAPI(service: string, endpoint: string, duration?: number, error?: Error) {
  if (error) {
    logger.error({
      type: 'external_api',
      service,
      endpoint,
      duration,
      error: {
        message: error.message,
      },
    }, `API Error: ${service} ${endpoint}`);
  } else {
    logger.info({
      type: 'external_api',
      service,
      endpoint,
      duration,
    }, `API: ${service} ${endpoint}${duration ? ` (${duration}ms)` : ''}`);
  }
}

export function logAudit(userId: string, action: string, resourceType: string, resourceId: string, details?: Record<string, unknown>) {
  logger.info({
    type: 'audit',
    userId,
    action,
    resourceType,
    resourceId,
    ...details,
  }, `AUDIT: ${userId} ${action} ${resourceType}:${resourceId}`);
}

export function logAIOperation(operation: string, model: string, tokensUsed?: number, duration?: number, cost?: number) {
  logger.info({
    type: 'ai_operation',
    operation,
    model,
    tokensUsed,
    duration,
    cost,
  }, `AI: ${operation} using ${model}${tokensUsed ? ` (${tokensUsed} tokens)` : ''}${cost ? ` ($${cost.toFixed(4)})` : ''}`);
}

/**
 * A refused request that a caller had no business making.
 *
 * Separate from `logAudit`, which records what an authorised user did to a
 * record: this records the attempts that were turned away, which is the half
 * an incident review needs and the half nothing else in the app emits. Warn
 * level so it survives a production log filter set to hide info.
 */
export function logSecurity(
  event: string,
  userId?: string,
  ipAddress?: string,
  details?: Record<string, unknown>
) {
  logger.warn({ type: 'security', event, userId, ipAddress, ...details }, `SECURITY: ${event}`);
}

export default logger;
