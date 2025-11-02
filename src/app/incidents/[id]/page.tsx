'use client';

import { useState, useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import Navbar from '@/components/Navbar';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ArrowLeft, FileText, Calendar, User, MessageSquare, Sparkles } from 'lucide-react';

interface Conversation {
  id: string;
  message: string;
  sender: string;
  timestamp: string;
}

interface Attachment {
  id: string;
  fileName: string;
  fileType: string;
  fileSize: number;
  uploadedAt: string;
}

interface Incident {
  id: string;
  title: string;
  description?: string;
  incidentType?: string;
  severity?: string;
  status: string;
  createdAt: string;
  updatedAt: string;
  reporter: {
    id: string;
    name: string;
    email: string;
  };
  conversations: Conversation[];
  attachments: Attachment[];
}

export default function IncidentDetailPage() {
  const params = useParams();
  const router = useRouter();
  const incidentId = params.id as string;

  const [incident, setIncident] = useState<Incident | null>(null);
  const [loading, setLoading] = useState(true);
  const [generatingSummary, setGeneratingSummary] = useState(false);
  const [summary, setSummary] = useState<string | null>(null);

  useEffect(() => {
    fetchIncident();
  }, [incidentId]);

  const fetchIncident = async () => {
    try {
      const response = await fetch(`/api/incidents/${incidentId}`);
      if (!response.ok) throw new Error('Failed to fetch incident');

      const data = await response.json();
      setIncident(data);
    } catch (error) {
      console.error('Error fetching incident:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleGenerateSummary = async () => {
    setGeneratingSummary(true);
    try {
      const response = await fetch(`/api/incidents/${incidentId}/summary`, {
        method: 'POST',
      });

      if (!response.ok) throw new Error('Failed to generate summary');

      const data = await response.json();
      setSummary(data.summary);
    } catch (error) {
      console.error('Error generating summary:', error);
      alert('Failed to generate summary. Please try again.');
    } finally {
      setGeneratingSummary(false);
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
    return status === 'open' ? 'bg-blue-500' : 'bg-gray-500';
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  const formatFileSize = (bytes: number) => {
    if (bytes < 1024) return bytes + ' B';
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
    return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
  };

  if (loading) {
    return (
      <div className="min-h-screen" style={{ background: 'var(--background)' }}>
        <Navbar />
        <div className="flex items-center justify-center" style={{ minHeight: '50vh' }}>
          <div className="text-center">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 mx-auto" style={{ borderColor: 'var(--primary)' }}></div>
            <p className="mt-4 text-apple-body" style={{ color: 'var(--muted-foreground)' }}>Loading incident...</p>
          </div>
        </div>
      </div>
    );
  }

  if (!incident) {
    return (
      <div className="min-h-screen" style={{ background: 'var(--background)' }}>
        <Navbar />
        <div className="container mx-auto px-6 py-8">
          <div className="text-center">
            <h1 className="text-apple-title1 mb-4" style={{ color: 'var(--foreground)' }}>Incident Not Found</h1>
            <p className="text-apple-body mb-6" style={{ color: 'var(--muted-foreground)' }}>
              The incident you're looking for doesn't exist or has been removed.
            </p>
            <Link href="/incidents">
              <Button>
                <ArrowLeft className="mr-2 h-4 w-4" />
                Back to Incidents
              </Button>
            </Link>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen" style={{ background: 'var(--background)' }}>
      <Navbar />
      <div className="container mx-auto px-6 py-8 max-w-5xl">
        {/* Header */}
        <div className="mb-6">
          <Link href="/incidents" className="navbar-link inline-flex items-center gap-2 mb-4">
            <ArrowLeft className="h-4 w-4" />
            Back to Incidents
          </Link>

          <div className="flex justify-between items-start mb-4">
            <div className="flex-1">
              <h1 className="text-apple-largetitle mb-2" style={{ color: 'var(--foreground)' }}>
                {incident.title}
              </h1>
              <div className="flex items-center gap-3 text-apple-body" style={{ color: 'var(--muted-foreground)' }}>
                <span className="flex items-center gap-1">
                  <User className="h-4 w-4" />
                  {incident.reporter.name}
                </span>
                <span className="flex items-center gap-1">
                  <Calendar className="h-4 w-4" />
                  {formatDate(incident.createdAt)}
                </span>
              </div>
            </div>
            <div className="flex gap-2">
              {incident.severity && (
                <Badge className={`${getSeverityColor(incident.severity)} text-white`}>
                  {incident.severity}
                </Badge>
              )}
              <Badge className={`${getStatusColor(incident.status)} text-white capitalize`}>
                {incident.status}
              </Badge>
            </div>
          </div>

          {incident.description && (
            <p className="text-apple-body" style={{ color: 'var(--foreground)' }}>
              {incident.description}
            </p>
          )}
        </div>

        {/* AI Summary Button */}
        <div className="mb-6">
          <div className="card-apple elevation-1" style={{ padding: 'var(--spacing-6)' }}>
            <div className="flex items-center justify-between">
              <div className="flex-1">
                <h3 className="text-apple-title3 font-semibold mb-1" style={{ color: 'var(--foreground)' }}>
                  AI Summary & Recommendations
                </h3>
                <p className="text-apple-footnote" style={{ color: 'var(--muted-foreground)' }}>
                  Get an AI-generated summary of this incident and recommended next steps
                </p>
              </div>
              <Button
                onClick={handleGenerateSummary}
                disabled={generatingSummary}
                className="ml-4"
              >
                {generatingSummary ? (
                  <>
                    <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2"></div>
                    Generating...
                  </>
                ) : (
                  <>
                    <Sparkles className="mr-2 h-4 w-4" />
                    Generate Summary
                  </>
                )}
              </Button>
            </div>

            {summary && (
              <div className="mt-4 pt-4" style={{ borderTop: '0.5px solid var(--separator)' }}>
                <div
                  className="text-apple-body prose prose-sm max-w-none"
                  style={{ color: 'var(--foreground)', whiteSpace: 'pre-wrap' }}
                >
                  {summary}
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Chat History */}
        <div className="mb-6">
          <div className="card-apple elevation-1" style={{ padding: 'var(--spacing-6)' }}>
            <h3 className="text-apple-title2 font-semibold mb-4 flex items-center gap-2" style={{ color: 'var(--foreground)' }}>
              <MessageSquare className="h-5 w-5" />
              Chat History
            </h3>

            {incident.conversations.length === 0 ? (
              <p className="text-apple-body" style={{ color: 'var(--muted-foreground)' }}>
                No messages yet
              </p>
            ) : (
              <div className="space-y-4">
                {incident.conversations.map((conversation) => (
                  <div
                    key={conversation.id}
                    className="p-4 rounded-lg"
                    style={{
                      background: conversation.sender === 'user'
                        ? 'rgba(0, 122, 255, 0.1)'
                        : 'var(--secondary)',
                    }}
                  >
                    <div className="flex items-center gap-2 mb-2">
                      <span className="text-apple-caption1 font-semibold" style={{
                        color: conversation.sender === 'user' ? 'var(--info)' : 'var(--foreground)'
                      }}>
                        {conversation.sender === 'user' ? 'User' : 'General'}
                      </span>
                      <span className="text-apple-caption2" style={{ color: 'var(--muted-foreground)' }}>
                        {formatDate(conversation.timestamp)}
                      </span>
                    </div>
                    <p className="text-apple-body" style={{ color: 'var(--foreground)', whiteSpace: 'pre-wrap' }}>
                      {conversation.message}
                    </p>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Attachments */}
        <div>
          <div className="card-apple elevation-1" style={{ padding: 'var(--spacing-6)' }}>
            <h3 className="text-apple-title2 font-semibold mb-4 flex items-center gap-2" style={{ color: 'var(--foreground)' }}>
              <FileText className="h-5 w-5" />
              Attachments ({incident.attachments.length})
            </h3>

            {incident.attachments.length === 0 ? (
              <p className="text-apple-body" style={{ color: 'var(--muted-foreground)' }}>
                No attachments
              </p>
            ) : (
              <div className="space-y-2">
                {incident.attachments.map((attachment) => (
                  <div
                    key={attachment.id}
                    className="p-3 rounded-lg flex items-center justify-between"
                    style={{ background: 'var(--secondary)' }}
                  >
                    <div className="flex items-center gap-3">
                      <FileText className="h-5 w-5" style={{ color: 'var(--muted-foreground)' }} />
                      <div>
                        <p className="text-apple-body font-medium" style={{ color: 'var(--foreground)' }}>
                          {attachment.fileName}
                        </p>
                        <p className="text-apple-caption2" style={{ color: 'var(--muted-foreground)' }}>
                          {formatFileSize(attachment.fileSize)} • {attachment.fileType}
                        </p>
                      </div>
                    </div>
                    <span className="text-apple-caption2" style={{ color: 'var(--muted-foreground)' }}>
                      {formatDate(attachment.uploadedAt)}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
