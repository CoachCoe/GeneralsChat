import pino from 'pino';

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
const logger = pino({
  level: process.env.LOG_LEVEL || (isDevelopment ? 'debug' : 'info'),
  transport: isDevelopment
    ? {
        target: 'pino-pretty',
        options: {
          colorize: true,
          translateTime: 'HH:MM:ss.l',
          ignore: 'pid,hostname',
          singleLine: false,
        },
      }
    : undefined,
  formatters: {
    level: (label) => {
      return { level: label.toUpperCase() };
    },
  },
  timestamp: pino.stdTimeFunctions.isoTime,
});

/**
 * Create a child logger with additional context
 */
export function createLogger(context: string | Record<string, unknown>) {
  if (typeof context === 'string') {
    return logger.child({ context });
  }
  return logger.child(context);
}

/**
 * Log API request
 */
export function logRequest(method: string, path: string, userId?: string) {
  logger.info({
    type: 'request',
    method,
    path,
    userId,
  }, `${method} ${path}`);
}

/**
 * Log API response
 */
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

/**
 * Log error with stack trace
 */
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

/**
 * Log database operation
 */
export function logDatabaseOperation(operation: string, model: string, duration?: number) {
  logger.debug({
    type: 'database',
    operation,
    model,
    duration,
  }, `DB: ${operation} ${model}${duration ? ` (${duration}ms)` : ''}`);
}

/**
 * Log external API call
 */
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

/**
 * Log audit event (user actions)
 */
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

/**
 * Log AI/ML operation
 */
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
 * Log security event
 */
export function logSecurity(event: string, userId?: string, ipAddress?: string, details?: Record<string, unknown>) {
  logger.warn({
    type: 'security',
    event,
    userId,
    ipAddress,
    ...details,
  }, `SECURITY: ${event}`);
}

export default logger;
