import { NextResponse } from 'next/server';
import { Prisma } from '@/generated/prisma';
import { logError } from './logger';

/**
 * Error Handling Utilities
 *
 * Centralized error handling for API routes and services
 */

export interface ApiError {
  error: string;
  message?: string;
  details?: any;
  code?: string;
}

/**
 * Handle Prisma errors and convert to user-friendly messages
 */
export function handlePrismaError(error: unknown): {
  status: number;
  message: string;
  code?: string;
} {
  if (error instanceof Prisma.PrismaClientKnownRequestError) {
    switch (error.code) {
      case 'P2002':
        // Unique constraint violation
        return {
          status: 409,
          message: 'A record with this information already exists',
          code: 'DUPLICATE_RECORD',
        };

      case 'P2025':
        // Record not found
        return {
          status: 404,
          message: 'The requested record was not found',
          code: 'NOT_FOUND',
        };

      case 'P2003':
        // Foreign key constraint failed
        return {
          status: 400,
          message: 'Invalid reference to related record',
          code: 'INVALID_REFERENCE',
        };

      case 'P2014':
        // Required relation violation
        return {
          status: 400,
          message: 'Missing required related record',
          code: 'MISSING_RELATION',
        };

      case 'P2021':
        // Table does not exist
        return {
          status: 500,
          message: 'Database configuration error',
          code: 'DATABASE_ERROR',
        };

      case 'P2022':
        // Column does not exist
        return {
          status: 500,
          message: 'Database schema error',
          code: 'SCHEMA_ERROR',
        };

      default:
        return {
          status: 500,
          message: 'Database operation failed',
          code: error.code,
        };
    }
  }

  if (error instanceof Prisma.PrismaClientValidationError) {
    return {
      status: 400,
      message: 'Invalid data provided',
      code: 'VALIDATION_ERROR',
    };
  }

  if (error instanceof Prisma.PrismaClientInitializationError) {
    return {
      status: 503,
      message: 'Database connection failed',
      code: 'DATABASE_UNAVAILABLE',
    };
  }

  // Unknown Prisma error
  return {
    status: 500,
    message: 'An unexpected database error occurred',
    code: 'UNKNOWN_DATABASE_ERROR',
  };
}

/**
 * Create a standardized error response
 */
export function createErrorResponse(
  error: unknown,
  defaultMessage: string = 'An unexpected error occurred',
  context?: Record<string, any>
): NextResponse {
  // Handle Prisma errors
  if (
    error instanceof Prisma.PrismaClientKnownRequestError ||
    error instanceof Prisma.PrismaClientValidationError ||
    error instanceof Prisma.PrismaClientInitializationError
  ) {
    const prismaError = handlePrismaError(error);

    logError(error as Error, {
      ...context,
      prismaCode: prismaError.code,
    });

    return NextResponse.json(
      {
        error: prismaError.message,
        code: prismaError.code,
      } as ApiError,
      { status: prismaError.status }
    );
  }

  // Handle standard Error objects
  if (error instanceof Error) {
    logError(error, context);

    // Check for specific error types
    if (error.message.includes('API key')) {
      return NextResponse.json(
        {
          error: 'Service configuration error',
          message: 'The AI service is not properly configured',
          code: 'CONFIG_ERROR',
        } as ApiError,
        { status: 503 }
      );
    }

    if (error.message.includes('timeout') || error.message.includes('ETIMEDOUT')) {
      return NextResponse.json(
        {
          error: 'Request timeout',
          message: 'The operation took too long to complete',
          code: 'TIMEOUT',
        } as ApiError,
        { status: 504 }
      );
    }

    if (error.message.includes('Network') || error.message.includes('ECONNREFUSED')) {
      return NextResponse.json(
        {
          error: 'Service unavailable',
          message: 'Unable to connect to required service',
          code: 'SERVICE_UNAVAILABLE',
        } as ApiError,
        { status: 503 }
      );
    }

    // Generic error
    return NextResponse.json(
      {
        error: defaultMessage,
        message: process.env.NODE_ENV === 'development' ? error.message : undefined,
        code: 'INTERNAL_ERROR',
      } as ApiError,
      { status: 500 }
    );
  }

  // Unknown error type
  logError(new Error(String(error)), context);

  return NextResponse.json(
    {
      error: defaultMessage,
      code: 'UNKNOWN_ERROR',
    } as ApiError,
    { status: 500 }
  );
}

/**
 * Validation error response
 */
export function validationError(
  message: string,
  details?: any
): NextResponse {
  return NextResponse.json(
    {
      error: 'Validation failed',
      message,
      details,
      code: 'VALIDATION_ERROR',
    } as ApiError,
    { status: 400 }
  );
}

/**
 * Not found error response
 */
export function notFoundError(
  resource: string = 'Resource'
): NextResponse {
  return NextResponse.json(
    {
      error: `${resource} not found`,
      code: 'NOT_FOUND',
    } as ApiError,
    { status: 404 }
  );
}

/**
 * Unauthorized error response
 */
export function unauthorizedError(
  message: string = 'Unauthorized'
): NextResponse {
  return NextResponse.json(
    {
      error: message,
      code: 'UNAUTHORIZED',
    } as ApiError,
    { status: 401 }
  );
}

/**
 * Forbidden error response
 */
export function forbiddenError(
  message: string = 'Access forbidden'
): NextResponse {
  return NextResponse.json(
    {
      error: message,
      code: 'FORBIDDEN',
    } as ApiError,
    { status: 403 }
  );
}

/**
 * Service unavailable error response
 */
export function serviceUnavailableError(
  service: string = 'Service'
): NextResponse {
  return NextResponse.json(
    {
      error: `${service} is currently unavailable`,
      message: 'Please try again later',
      code: 'SERVICE_UNAVAILABLE',
    } as ApiError,
    { status: 503 }
  );
}

/**
 * Rate limit error response
 */
export function rateLimitError(): NextResponse {
  return NextResponse.json(
    {
      error: 'Too many requests',
      message: 'Please slow down and try again later',
      code: 'RATE_LIMIT_EXCEEDED',
    } as ApiError,
    { status: 429 }
  );
}

/**
 * Success response helper
 */
export function successResponse<T>(
  data: T,
  status: number = 200
): NextResponse {
  return NextResponse.json(data, { status });
}
