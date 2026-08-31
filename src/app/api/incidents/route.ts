import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { IncidentStatus } from '@/types';
import {
  createIncidentSchema,
  paginationSchema,
  validateRequest,
  formatValidationErrors,
} from '@/lib/validation';

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const status = searchParams.get('status');
    const reporterId = searchParams.get('reporterId');
    // Clamped: unbounded parseInt allowed ?limit=1000000 to dump the whole
    // incident table in one request, and ?limit=abc to reach Prisma as
    // `take: NaN`. (SEC-12)
    const pagination = paginationSchema.safeParse({
      page: searchParams.get('page') ?? undefined,
      limit: searchParams.get('limit') ?? undefined,
    });
    if (!pagination.success) {
      return NextResponse.json(
        { error: 'Invalid pagination parameters', details: formatValidationErrors(pagination.error) },
        { status: 400 }
      );
    }
    const { page, limit } = pagination.data;

    const where: any = {};
    if (status) {
      where.status = status;
    }
    if (reporterId) {
      where.reporterId = reporterId;
    }

    const [incidents, total] = await Promise.all([
      prisma.incident.findMany({
        where,
        include: {
          reporter: {
            select: {
              id: true,
              name: true,
              email: true,
            },
          },
          complianceActions: {
            where: { status: 'pending' },
            orderBy: { dueDate: 'asc' },
          },
          _count: {
            select: {
              conversations: true,
              attachments: true,
            },
          },
        },
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
      prisma.incident.count({ where }),
    ]);

    return NextResponse.json({
      incidents,
      pagination: {
        page,
        limit,
        total,
        pages: Math.ceil(total / limit),
      },
    });
  } catch (error) {
    console.error('Get incidents error:', error);
    return NextResponse.json(
      { error: 'Failed to fetch incidents' },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    // createIncidentSchema existed but was imported nowhere, so incidentType,
    // severity and status reached Prisma unvalidated -- an out-of-vocabulary
    // status silently hides an incident from every list view. (SEC-13)
    const parsed = validateRequest(createIncidentSchema, await request.json());
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Validation failed', details: formatValidationErrors(parsed.errors) },
        { status: 400 }
      );
    }
    const { title, description, reporterId, incidentType, severity } = parsed.data;

    const incident = await prisma.incident.create({
      data: {
        title,
        description,
        reporterId,
        incidentType,
        severity,
        status: IncidentStatus.OPEN,
      },
      include: {
        reporter: {
          select: {
            id: true,
            name: true,
            email: true,
          },
        },
      },
    });

    return NextResponse.json({ incident });
  } catch (error) {
    console.error('Create incident error:', error);
    return NextResponse.json(
      { error: 'Failed to create incident' },
      { status: 500 }
    );
  }
}
