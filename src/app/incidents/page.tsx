'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { PlusCircle, AlertTriangle, Clock, CheckCircle, Eye } from 'lucide-react';
import Navbar from '@/components/Navbar';

interface Incident {
  id: string;
  title: string;
  description?: string;
  incidentType?: string;
  severity?: string;
  status: string;
  createdAt: string;
  reporter: {
    id: string;
    name: string;
    email: string;
  };
  complianceActions?: Array<{
    id: string;
    actionType: string;
    description?: string;
    dueDate?: string;
    status: string;
  }>;
  _count: {
    conversations: number;
    attachments: number;
  };
}

export default function IncidentsPage() {
  const [incidents, setIncidents] = useState<Incident[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState('all');

  useEffect(() => {
    fetchIncidents();
  }, [filter]);

  const fetchIncidents = async () => {
    try {
      const params = new URLSearchParams();
      if (filter !== 'all') {
        params.append('status', filter);
      }
      
      const response = await fetch(`/api/incidents?${params}`);
      const data = await response.json();
      
      if (data.error) {
        throw new Error(data.error);
      }
      
      setIncidents(data.incidents);
    } catch (error) {
      console.error('Error fetching incidents:', error);
    } finally {
      setLoading(false);
    }
  };

  const getSeverityColor = (severity?: string) => {
    switch (severity) {
      case 'critical': return 'bg-red-500';
      case 'high': return 'bg-orange-500';
      case 'medium': return 'bg-yellow-500';
      case 'low': return 'bg-green-500';
      default: return 'bg-gray-500';
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'open': return 'bg-blue-500';
      case 'in_progress': return 'bg-yellow-500';
      case 'under_review': return 'bg-purple-500';
      case 'completed': return 'bg-green-500';
      case 'closed': return 'bg-gray-500';
      default: return 'bg-gray-500';
    }
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  if (loading) {
    return (
      <div className="min-h-screen" style={{ background: 'var(--background)' }}>
        <Navbar />
        <div className="flex items-center justify-center" style={{ minHeight: '50vh' }}>
          <div className="text-center">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 mx-auto" style={{ borderColor: 'var(--primary)' }}></div>
            <p className="mt-4 text-apple-body" style={{ color: 'var(--muted-foreground)' }}>Loading incidents...</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen" style={{ background: 'var(--background)' }}>
      <Navbar />
      <div className="container mx-auto px-6 py-8">
        <div className="flex justify-between items-center mb-8">
          <div>
            <h1 className="text-apple-largetitle" style={{ color: 'var(--foreground)' }}>Incidents</h1>
            <p className="text-apple-title3 mt-2" style={{ color: 'var(--muted-foreground)' }}>
              Manage and track disciplinary incidents
            </p>
          </div>
          <Link href="/incidents/new">
            <Button className="btn-primary">
              <PlusCircle className="mr-2 h-4 w-4" />
              New Incident
            </Button>
          </Link>
        </div>

        <div className="flex gap-4 mb-6">
          {['all', 'open', 'in_progress', 'under_review', 'completed', 'closed'].map((status) => (
            <Button
              key={status}
              variant={filter === status ? 'default' : 'outline'}
              onClick={() => setFilter(status)}
              className={`capitalize ${
                filter === status 
                  ? 'btn-primary' 
                  : 'btn-secondary'
              }`}
            >
              {status.replace('_', ' ')}
            </Button>
          ))}
        </div>

        <div className="grid gap-6">
          {incidents.length === 0 ? (
            <div className="card-apple elevation-1" style={{ padding: 'var(--spacing-8)' }}>
              <div className="text-center py-12">
                <AlertTriangle className="h-12 w-12 mx-auto mb-4" style={{ color: 'var(--success)' }} />
                <h3 className="text-apple-title2 font-semibold mb-2" style={{ color: 'var(--foreground)' }}>No incidents found</h3>
                <p className="text-apple-body mb-4" style={{ color: 'var(--muted-foreground)' }}>
                  {filter === 'all'
                    ? 'No incidents have been reported yet.'
                    : `No incidents with status "${filter}" found.`
                  }
                </p>
                <Link href="/incidents/new">
                  <Button>
                    <PlusCircle className="mr-2 h-4 w-4" />
                    Report First Incident
                  </Button>
                </Link>
              </div>
            </div>
          ) : (
            incidents.map((incident) => (
              <div key={incident.id} className="card-apple elevation-1" style={{ padding: 'var(--spacing-6)' }}>
                <div className="flex justify-between items-start mb-4">
                  <div className="flex-1">
                    <h3 className="text-apple-title2 font-semibold mb-1" style={{ color: 'var(--foreground)' }}>
                      {incident.title}
                    </h3>
                    <p className="text-apple-footnote" style={{ color: 'var(--muted-foreground)' }}>
                      Reported by {incident.reporter.name} • {formatDate(incident.createdAt)}
                    </p>
                  </div>
                  <div className="flex gap-2">
                    {incident.severity && (
                      <Badge className={`${getSeverityColor(incident.severity)} text-white`}>
                        {incident.severity}
                      </Badge>
                    )}
                    <Badge className={`${getStatusColor(incident.status)} text-white`}>
                      {incident.status.replace('_', ' ')}
                    </Badge>
                  </div>
                </div>

                {incident.description && (
                  <p className="text-apple-body mb-4 line-clamp-2" style={{ color: 'var(--foreground)' }}>
                    {incident.description}
                  </p>
                )}

                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-4 text-apple-caption1" style={{ color: 'var(--muted-foreground)' }}>
                    <span className="flex items-center gap-1">
                      <AlertTriangle className="h-4 w-4" />
                      {incident.incidentType || 'Unclassified'}
                    </span>
                    <span className="flex items-center gap-1">
                      <Clock className="h-4 w-4" />
                      {incident._count.conversations} messages
                    </span>
                    <span className="flex items-center gap-1">
                      <CheckCircle className="h-4 w-4" />
                      {incident._count.attachments} files
                    </span>
                  </div>

                  <div className="flex gap-2">
                    <Link href={`/incidents/${incident.id}`}>
                      <Button size="sm">
                        <Eye className="mr-2 h-4 w-4" />
                        View
                      </Button>
                    </Link>
                  </div>
                </div>

                {incident.complianceActions && incident.complianceActions.length > 0 && (
                  <div className="mt-4 pt-4" style={{ borderTop: '0.5px solid var(--separator)' }}>
                    <h4 className="text-apple-caption1 font-semibold mb-2" style={{ color: 'var(--foreground)' }}>
                      Pending Actions
                    </h4>
                    <div className="space-y-2">
                      {incident.complianceActions.slice(0, 2).map((action) => (
                        <div key={action.id} className="flex items-center justify-between text-apple-footnote">
                          <span style={{ color: 'var(--foreground)' }}>{action.description || action.actionType}</span>
                          <Badge variant="outline" className="text-xs" style={{
                            borderColor: 'var(--separator)',
                            color: 'var(--muted-foreground)'
                          }}>
                            {action.status}
                          </Badge>
                        </div>
                      ))}
                      {incident.complianceActions.length > 2 && (
                        <p className="text-apple-caption2" style={{ color: 'var(--muted-foreground)' }}>
                          +{incident.complianceActions.length - 2} more actions
                        </p>
                      )}
                    </div>
                  </div>
                )}
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
