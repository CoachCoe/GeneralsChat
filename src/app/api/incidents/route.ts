import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { IncidentStatus } from '@/types';

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const status = searchParams.get('status');
    const reporterId = searchParams.get('reporterId');
    const page = parseInt(searchParams.get('page') || '1');
    const limit = parseInt(searchParams.get('limit') || '10');

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
    const { title, description, reporterId, incidentType, severity } = await request.json();

    if (!title || !reporterId) {
      return NextResponse.json(
        { error: 'Title and reporterId are required' },
        { status: 400 }
      );
    }

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
