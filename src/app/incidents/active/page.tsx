'use client';

import { useState, useEffect } from 'react';
import Navbar from '@/components/Navbar';
import { AlertTriangle, User, Calendar } from 'lucide-react';

interface Incident {
  id: string;
  title: string;
  description: string;
  status: 'active' | 'pending' | 'closed';
  priority: 'low' | 'medium' | 'high';
  reportedBy: string;
  reportedAt: string;
  assignedTo?: string;
}

export default function ActiveIncidentsPage() {
  const [incidents, setIncidents] = useState<Incident[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchIncidents();
  }, []);

  const fetchIncidents = async () => {
    try {
      const response = await fetch('/api/incidents?status=active');
      if (response.ok) {
        const data = await response.json();
        setIncidents(data);
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

  const getPriorityColor = (priority: string) => {
    switch (priority) {
      case 'high': return 'text-red-400';
      case 'medium': return 'text-yellow-400';
      case 'low': return 'text-green-400';
      default: return 'text-gray-400';
    }
  };

  const getPriorityIcon = (priority: string) => {
    switch (priority) {
      case 'high': return <AlertTriangle className="w-4 h-4" />;
      case 'medium': return <AlertTriangle className="w-4 h-4" />;
      case 'low': return <AlertTriangle className="w-4 h-4" />;
      default: return <AlertTriangle className="w-4 h-4" />;
    }
  };

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
                      <div className={`${getPriorityColor(incident.priority)}`}>
                        {getPriorityIcon(incident.priority)}
                      </div>
                      <span className={`text-sm font-medium uppercase tracking-wide ${getPriorityColor(incident.priority)}`}>
                        {incident.priority}
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
                      <span>Reported by: {incident.reportedBy}</span>
                    </div>
                    
                    <div className="flex items-center gap-2 text-gray-400">
                      <Calendar className="w-4 h-4" />
                      <span>
                        {new Date(incident.reportedAt).toLocaleDateString('en-US', {
                          year: 'numeric',
                          month: 'short',
                          day: 'numeric',
                          hour: '2-digit',
                          minute: '2-digit'
                        })}
                      </span>
                    </div>

                    {incident.assignedTo && (
                      <div className="flex items-center gap-2 text-gray-400">
                        <User className="w-4 h-4" />
                        <span>Assigned to: {incident.assignedTo}</span>
                      </div>
                    )}
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
