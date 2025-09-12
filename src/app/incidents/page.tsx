'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { PlusCircle, AlertTriangle, Clock, CheckCircle, Eye } from 'lucide-react';

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
  actions: Array<{
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
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-500 mx-auto"></div>
          <p className="mt-4 text-gray-600">Loading incidents...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen gradient-bg">
      <div className="container mx-auto px-4 py-8">
        <div className="flex justify-between items-center mb-8">
          <div>
            <h1 className="text-3xl font-bold text-white">Incidents</h1>
            <p className="text-gray-300 mt-2">
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
            <Card className="card-modern">
              <CardContent className="text-center py-12">
                <AlertTriangle className="h-12 w-12 text-green-400 mx-auto mb-4" />
                <h3 className="text-lg font-medium text-white mb-2">No incidents found</h3>
                <p className="text-gray-400 mb-4">
                  {filter === 'all' 
                    ? 'No incidents have been reported yet.'
                    : `No incidents with status "${filter}" found.`
                  }
                </p>
                <Link href="/incidents/new">
                  <Button className="btn-primary">
                    <PlusCircle className="mr-2 h-4 w-4" />
                    Report First Incident
                  </Button>
                </Link>
              </CardContent>
            </Card>
          ) : (
            incidents.map((incident) => (
              <Card key={incident.id} className="card-modern hover-lift">
                <CardHeader>
                  <div className="flex justify-between items-start">
                    <div className="flex-1">
                      <CardTitle className="text-lg text-white">{incident.title}</CardTitle>
                      <CardDescription className="mt-1 text-gray-400">
                        Reported by {incident.reporter.name} • {formatDate(incident.createdAt)}
                      </CardDescription>
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
                </CardHeader>
                
                <CardContent>
                  {incident.description && (
                    <p className="text-gray-300 mb-4 line-clamp-2">
                      {incident.description}
                    </p>
                  )}
                  
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-4 text-sm text-gray-400">
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
                        <Button className="btn-secondary" size="sm">
                          <Eye className="mr-2 h-4 w-4" />
                          View
                        </Button>
                      </Link>
                    </div>
                  </div>
                  
                  {incident.actions.length > 0 && (
                    <div className="mt-4 pt-4 border-t border-white/10">
                      <h4 className="text-sm font-medium text-white mb-2">Pending Actions</h4>
                      <div className="space-y-2">
                        {incident.actions.slice(0, 2).map((action) => (
                          <div key={action.id} className="flex items-center justify-between text-sm">
                            <span className="text-gray-300">{action.description || action.actionType}</span>
                            <Badge variant="outline" className="text-xs border-white/20 text-gray-300">
                              {action.status}
                            </Badge>
                          </div>
                        ))}
                        {incident.actions.length > 2 && (
                          <p className="text-xs text-gray-500">
                            +{incident.actions.length - 2} more actions
                          </p>
                        )}
                      </div>
                    </div>
                  )}
                </CardContent>
              </Card>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
