'use client';

import { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { FileText, Upload, Eye, Download } from 'lucide-react';

interface Policy {
  id: string;
  title: string;
  content?: string;
  filePath?: string;
  version: number;
  effectiveDate: string;
  policyType: string;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

export default function PoliciesPage() {
  const [policies, setPolicies] = useState<Policy[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState('all');

  useEffect(() => {
    fetchPolicies();
  }, [filter]);

  const fetchPolicies = async () => {
    try {
      const params = new URLSearchParams();
      if (filter !== 'all') {
        params.append('type', filter);
      }
      
      const response = await fetch(`/api/policies?${params}`);
      const data = await response.json();
      
      if (data.error) {
        throw new Error(data.error);
      }
      
      setPolicies(data.policies);
    } catch (error) {
      console.error('Error fetching policies:', error);
    } finally {
      setLoading(false);
    }
  };

  const getPolicyTypeColor = (type: string) => {
    switch (type) {
      case 'federal': return 'bg-red-500';
      case 'state': return 'bg-blue-500';
      case 'district': return 'bg-green-500';
      case 'school': return 'bg-purple-500';
      default: return 'bg-gray-500';
    }
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    });
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const formData = new FormData();
    formData.append('file', file);
    formData.append('title', file.name.replace(/\.[^/.]+$/, ''));
    formData.append('policyType', 'district');
    formData.append('effectiveDate', new Date().toISOString().split('T')[0]);

    try {
      const response = await fetch('/api/policies', {
        method: 'POST',
        body: formData,
      });

      const data = await response.json();

      if (data.error) {
        throw new Error(data.error);
      }

      // Refresh policies list
      fetchPolicies();
    } catch (error) {
      console.error('Error uploading policy:', error);
      alert('Failed to upload policy. Please try again.');
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-500 mx-auto"></div>
          <p className="mt-4 text-gray-600">Loading policies...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="container mx-auto px-4 py-8">
        <div className="flex justify-between items-center mb-8">
          <div>
            <h1 className="text-3xl font-bold text-gray-900">Policy Management</h1>
            <p className="text-gray-600 mt-2">
              Upload and manage school policies for AI-powered compliance guidance
            </p>
          </div>
          <div className="flex gap-2">
            <input
              type="file"
              id="file-upload"
              accept=".pdf,.doc,.docx,.txt"
              onChange={handleFileUpload}
              className="hidden"
            />
            <label htmlFor="file-upload">
              <Button asChild>
                <span>
                  <Upload className="mr-2 h-4 w-4" />
                  Upload Policy
                </span>
              </Button>
            </label>
          </div>
        </div>

        <div className="flex gap-4 mb-6">
          {['all', 'federal', 'state', 'district', 'school'].map((type) => (
            <Button
              key={type}
              variant={filter === type ? 'default' : 'outline'}
              onClick={() => setFilter(type)}
              className="capitalize"
            >
              {type}
            </Button>
          ))}
        </div>

        <div className="grid gap-6">
          {policies.length === 0 ? (
            <Card>
              <CardContent className="text-center py-12">
                <FileText className="h-12 w-12 text-gray-300 mx-auto mb-4" />
                <h3 className="text-lg font-medium text-gray-900 mb-2">No policies found</h3>
                <p className="text-gray-600 mb-4">
                  {filter === 'all' 
                    ? 'No policies have been uploaded yet.'
                    : `No ${filter} policies found.`
                  }
                </p>
                <label htmlFor="file-upload">
                  <Button asChild>
                    <span>
                      <Upload className="mr-2 h-4 w-4" />
                      Upload First Policy
                    </span>
                  </Button>
                </label>
              </CardContent>
            </Card>
          ) : (
            policies.map((policy) => (
              <Card key={policy.id} className="hover:shadow-md transition-shadow">
                <CardHeader>
                  <div className="flex justify-between items-start">
                    <div className="flex-1">
                      <CardTitle className="text-lg">{policy.title}</CardTitle>
                      <CardDescription className="mt-1">
                        Version {policy.version} • Effective {formatDate(policy.effectiveDate)}
                      </CardDescription>
                    </div>
                    <div className="flex gap-2">
                      <Badge className={`${getPolicyTypeColor(policy.policyType)} text-white`}>
                        {policy.policyType}
                      </Badge>
                      <Badge variant={policy.isActive ? 'default' : 'outline'}>
                        {policy.isActive ? 'Active' : 'Inactive'}
                      </Badge>
                    </div>
                  </div>
                </CardHeader>
                
                <CardContent>
                  {policy.content && (
                    <p className="text-gray-700 mb-4 line-clamp-3">
                      {policy.content.substring(0, 200)}...
                    </p>
                  )}
                  
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-4 text-sm text-gray-600">
                      <span className="flex items-center gap-1">
                        <FileText className="h-4 w-4" />
                        {policy.filePath ? 'Document' : 'Text'}
                      </span>
                      <span>
                        Created {formatDate(policy.createdAt)}
                      </span>
                    </div>
                    
                    <div className="flex gap-2">
                      <Button variant="outline" size="sm">
                        <Eye className="mr-2 h-4 w-4" />
                        View
                      </Button>
                      {policy.filePath && (
                        <Button variant="outline" size="sm">
                          <Download className="mr-2 h-4 w-4" />
                          Download
                        </Button>
                      )}
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
