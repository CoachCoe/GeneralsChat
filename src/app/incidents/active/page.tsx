'use client';

import { useState, useEffect } from 'react';
import Navbar from '@/components/Navbar';
import { AlertTriangle, User, Calendar } from 'lucide-react';

/**
 * Mirrors what GET /api/incidents actually returns. The previous interface
 * declared priority / reportedBy / reportedAt / assignedTo, none of which
 * exist on the model -- every one rendered as undefined. (FLOW-13, DEAD-31)
 */
interface Incident {
  id: string;
  title: string;
  description: string | null;
  status: string;
  severity: string | null;
  createdAt: string;
  reporter?: { id: string; name: string; email: string } | null;
}

export default function ActiveIncidentsPage() {
  const [incidents, setIncidents] = useState<Incident[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchIncidents();
  }, []);

  const fetchIncidents = async () => {
    try {
      // `?status=active` matched nothing: no code path ever writes "active".
      // The homepage card for this page reads "Currently open disciplinary
      // cases", and `open` is the status both writers actually set.
      // (FLOW-12, SPEC-12, DEAD-10)
      const response = await fetch('/api/incidents?status=open');
      if (response.ok) {
        const data = await response.json();
        // The endpoint returns { incidents, pagination }, not an array. Storing
        // the envelope made incidents.length undefined, so the empty-state
        // branch was skipped and incidents.map threw. (FLOW-13)
        setIncidents(Array.isArray(data.incidents) ? data.incidents : []);
      } else {
        setIncidents([]);
      }
    } catch (error) {
      console.error('Error fetching incidents:', error);
      setIncidents([]);
    } finally {
      setLoading(false);
    }
  };

  const getSeverityColor = (severity: string | null) => {
    switch (severity) {
      case 'critical': return 'text-red-500';
      case 'high': return 'text-red-400';
      case 'medium': return 'text-yellow-400';
      case 'low': return 'text-green-400';
      default: return 'text-gray-400';
    }
  };

  const getSeverityIcon = () => <AlertTriangle className="w-4 h-4" />;

  if (loading) {
    return (
      <div className="min-h-screen gradient-bg">
        <Navbar />
        <div className="container mx-auto px-6 py-8">
          <div className="text-center">
            <div className="text-white text-xl">Loading incidents...</div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen gradient-bg">
      <Navbar />
      <div className="container mx-auto px-6 py-8">
        <div className="text-center mb-8">
          <h1 className="text-4xl font-bold text-white mb-4">Active Incidents</h1>
          <p className="text-xl text-gray-300">Currently open disciplinary cases requiring attention</p>
        </div>

        <div className="max-w-6xl mx-auto">
          {incidents.length === 0 ? (
            <div className="text-center py-12">
              <AlertTriangle className="w-16 h-16 text-gray-400 mx-auto mb-4" />
              <h3 className="text-xl font-semibold text-white mb-2">No Active Incidents</h3>
              <p className="text-gray-400">All incidents have been resolved or are pending review.</p>
            </div>
          ) : (
            <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
              {incidents.map((incident) => (
                <div
                  key={incident.id}
                  className="bg-transparent border border-gray-600 rounded-lg p-6 hover:bg-gray-800 transition-all cursor-pointer"
                >
                  <div className="flex items-start justify-between mb-4">
                    <div className="flex items-center gap-2">
                      <div className={`${getSeverityColor(incident.severity)}`}>
                        {getSeverityIcon()}
                      </div>
                      <span className={`text-sm font-medium uppercase tracking-wide ${getSeverityColor(incident.severity)}`}>
                        {incident.severity ?? 'unclassified'}
                      </span>
                    </div>
                    <span className="text-xs text-gray-400 bg-gray-700 px-2 py-1 rounded">
                      {incident.status}
                    </span>
                  </div>

                  <h3 className="text-lg font-semibold text-white mb-2">
                    {incident.title}
                  </h3>
                  
                  <p className="text-gray-300 text-sm mb-4 line-clamp-3">
                    {incident.description}
                  </p>

                  <div className="space-y-2 text-sm">
                    <div className="flex items-center gap-2 text-gray-400">
                      <User className="w-4 h-4" />
                      <span>Reported by: {incident.reporter?.name ?? 'Unknown'}</span>
                    </div>
                    
                    <div className="flex items-center gap-2 text-gray-400">
                      <Calendar className="w-4 h-4" />
                      <span>
                        {new Date(incident.createdAt).toLocaleDateString('en-US', {
                          year: 'numeric',
                          month: 'short',
                          day: 'numeric',
                          hour: '2-digit',
                          minute: '2-digit'
                        })}
                      </span>
                    </div>

                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
