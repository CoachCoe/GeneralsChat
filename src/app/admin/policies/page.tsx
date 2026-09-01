'use client';

import { useState, useEffect } from 'react';
import Navbar from '@/components/Navbar';
import {
  CATEGORY_LABELS,
  JURISDICTION_LABELS,
  POLICY_CATEGORIES,
  POLICY_JURISDICTIONS,
} from '@/types';
import { Button } from '@/components/ui/button';
import { Upload, Link as LinkIcon, FileText, Trash2, Calendar, Tag } from 'lucide-react';

interface Policy {
  id: string;
  title: string;
  jurisdiction: string;
  category: string;
  effectiveDate: string;
  isActive: boolean;
  version: number;
  createdAt: string;
  _count?: {
    chunks: number;
  };
}

export default function PoliciesPage() {
  const [policies, setPolicies] = useState<Policy[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [showUploadModal, setShowUploadModal] = useState(false);
  const [uploadMethod, setUploadMethod] = useState<'file' | 'url' | 'text'>('text');

  // Form state
  const [title, setTitle] = useState('');
  const [content, setContent] = useState('');
  const [jurisdiction, setJurisdiction] = useState('district');
  const [category, setCategory] = useState('bullying');
  const [effectiveDate, setEffectiveDate] = useState(new Date().toISOString().split('T')[0]);
  const [keywords, setKeywords] = useState('');
  const [url, setUrl] = useState('');
  const [file, setFile] = useState<File | null>(null);

  useEffect(() => {
    fetchPolicies();
  }, []);

  const fetchPolicies = async () => {
    try {
      const response = await fetch('/api/admin/policies');
      const data = await response.json();
      setPolicies(data.policies || []);
    } catch (error) {
      console.error('Error fetching policies:', error);
      // Don't show alert, just silently fail and show empty state
      setPolicies([]);
    } finally {
      setLoading(false);
    }
  };

  const handleUpload = async () => {
    if (!title.trim() || !jurisdiction || !category || !effectiveDate) {
      alert('Title, policy type, and effective date are required');
      return;
    }

    setUploading(true);
    try {
      if (uploadMethod === 'text') {
        // Upload as JSON
        if (!content.trim()) {
          alert('Content is required');
          return;
        }

        const response = await fetch('/api/admin/policies', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            title,
            content,
            jurisdiction,
            category,
            effectiveDate,
            keywords: keywords.split(',').map(k => k.trim()).filter(Boolean)
          })
        });

        if (!response.ok) {
          const data = await response.json();
          throw new Error(data.error || 'Failed to upload policy');
        }

        alert('Policy uploaded successfully');
      } else if (uploadMethod === 'url') {
        // Upload from URL
        if (!url.trim()) {
          alert('URL is required');
          return;
        }

        const formData = new FormData();
        formData.append('url', url);
        formData.append('title', title);
        formData.append('jurisdiction', jurisdiction);
        formData.append('category', category);
        formData.append('effectiveDate', effectiveDate);
        formData.append('keywords', keywords);

        const response = await fetch('/api/admin/policies/upload', {
          method: 'POST',
          body: formData
        });

        if (!response.ok) {
          const data = await response.json();
          throw new Error(data.error || 'Failed to upload policy');
        }

        alert('Policy uploaded successfully');
      } else if (uploadMethod === 'file') {
        // Upload file
        if (!file) {
          alert('File is required');
          return;
        }

        const formData = new FormData();
        formData.append('file', file);
        formData.append('title', title);
        formData.append('jurisdiction', jurisdiction);
        formData.append('category', category);
        formData.append('effectiveDate', effectiveDate);
        formData.append('keywords', keywords);

        const response = await fetch('/api/admin/policies/upload', {
          method: 'POST',
          body: formData
        });

        if (!response.ok) {
          const data = await response.json();
          throw new Error(data.error || 'Failed to upload policy');
        }

        alert('Policy uploaded successfully');
      }

      // Reset form
      setShowUploadModal(false);
      setTitle('');
      setContent('');
      setUrl('');
      setFile(null);
      setKeywords('');
      fetchPolicies();
    } catch (error: any) {
      console.error('Error uploading policy:', error);
      alert(error.message || 'Failed to upload policy');
    } finally {
      setUploading(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Are you sure you want to delete this policy and all its chunks?')) return;

    try {
      const response = await fetch(`/api/admin/policies/${id}`, {
        method: 'DELETE'
      });

      if (!response.ok) throw new Error('Failed to delete policy');

      alert('Policy deleted successfully');
      fetchPolicies();
    } catch (error) {
      console.error('Error deleting policy:', error);
      alert('Failed to delete policy');
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen" style={{ background: 'var(--background)' }}>
        <Navbar />
        <div className="flex items-center justify-center h-screen">
          <p className="body-text" style={{ color: 'var(--muted-foreground)' }}>Loading...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen" style={{ background: 'var(--background)' }}>
      <Navbar />
      <div className="container mx-auto px-4 py-8 max-w-7xl">
        <div className="flex items-center justify-between mb-6">
          <h1 className="heading-xl" style={{ color: 'var(--foreground)' }}>Policy Management</h1>
          <Button onClick={() => setShowUploadModal(true)}>
            <Upload size={20} style={{ marginRight: 'var(--spacing-2)' }} />
            Upload Policy
          </Button>
        </div>

        {/* Policies List */}
        <div className="card">
          <div style={{ padding: 'var(--spacing-6)' }}>
            <h2 className="heading-md mb-4" style={{ color: 'var(--foreground)' }}>
              Current Policies ({policies.length})
            </h2>

            {policies.length === 0 ? (
              <div className="text-center" style={{ padding: 'var(--spacing-8) 0' }}>
                <FileText size={48} className="mx-auto mb-4" style={{ color: 'var(--muted-foreground)' }} />
                <p className="body-text mb-4" style={{ color: 'var(--muted-foreground)' }}>No policies uploaded yet</p>
                <Button onClick={() => setShowUploadModal(true)}>
                  <Upload size={20} style={{ marginRight: 'var(--spacing-2)' }} />
                  Upload Your First Policy
                </Button>
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--spacing-4)' }}>
                {policies.map((policy) => (
                  <div
                    key={policy.id}
                    className="card"
                    style={{
                      padding: 'var(--spacing-4)',
                      transition: 'all 0.2s cubic-bezier(0.25, 0.1, 0.25, 1)',
                      cursor: 'default'
                    }}
                  >
                    <div className="flex items-start justify-between">
                      <div className="flex-1">
                        <div className="flex items-center gap-3 mb-2">
                          <h3 className="heading-md" style={{ color: 'var(--foreground)' }}>{policy.title}</h3>
                          {policy.isActive && (
                            <span className="badge" style={{
                              background: 'var(--success)',
                              color: 'white',
                              fontSize: '12px'
                            }}>
                              Active
                            </span>
                          )}
                        </div>

                        <div className="flex flex-wrap gap-4 caption" style={{ color: 'var(--muted-foreground)' }}>
                          <div className="flex items-center gap-1">
                            <Tag size={14} />
                            <span className="capitalize">{policy.jurisdiction}</span>
                            <span>·</span>
                            <span>{CATEGORY_LABELS[policy.category] ?? policy.category}</span>
                          </div>
                          <div className="flex items-center gap-1">
                            <Calendar size={14} />
                            <span>Effective: {new Date(policy.effectiveDate).toLocaleDateString()}</span>
                          </div>
                          <div>
                            <span>Version: {policy.version}</span>
                          </div>
                          {policy._count && (
                            <div>
                              <span>{policy._count.chunks} chunks</span>
                            </div>
                          )}
                        </div>
                      </div>

                      <Button
                        onClick={() => handleDelete(policy.id)}
                        variant="destructive"
                        size="sm"
                      >
                        <Trash2 size={16} />
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Upload Modal */}
        {showUploadModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{
            background: 'rgba(0, 0, 0, 0.5)',
            backdropFilter: 'blur(20px)'
          }}>
            <div className="card max-w-2xl w-full max-h-[90vh] overflow-y-auto">
              <div style={{ padding: 'var(--spacing-6)' }}>
                <h2 className="heading-lg mb-6" style={{ color: 'var(--foreground)' }}>Upload Policy</h2>

                {/* Upload Method Selection */}
                <div className="mb-6">
                  <label className="block label-sm font-medium mb-2" style={{ color: 'var(--foreground)' }}>
                    Upload Method
                  </label>
                  <div className="grid grid-cols-3 gap-2">
                    <button
                      onClick={() => setUploadMethod('text')}
                      className={`transition-colors ${
                        uploadMethod === 'text'
                          ? 'bg-[var(--primary)] text-[var(--primary-foreground)]'
                          : 'bg-[var(--secondary)] text-[var(--foreground)] hover:bg-[var(--secondary-hover)]'
                      }`}
                      style={{
                        padding: 'var(--spacing-3)',
                        borderRadius: 'var(--radius)',
                        border: uploadMethod === 'text' ? 'none' : '0.5px solid var(--border)'
                      }}
                    >
                      <FileText size={20} className="mx-auto mb-1" />
                      <span className="caption">Paste Text</span>
                    </button>
                    <button
                      onClick={() => setUploadMethod('url')}
                      className={`transition-colors ${
                        uploadMethod === 'url'
                          ? 'bg-[var(--primary)] text-[var(--primary-foreground)]'
                          : 'bg-[var(--secondary)] text-[var(--foreground)] hover:bg-[var(--secondary-hover)]'
                      }`}
                      style={{
                        padding: 'var(--spacing-3)',
                        borderRadius: 'var(--radius)',
                        border: uploadMethod === 'url' ? 'none' : '0.5px solid var(--border)'
                      }}
                    >
                      <LinkIcon size={20} className="mx-auto mb-1" />
                      <span className="caption">From URL</span>
                    </button>
                    <button
                      onClick={() => setUploadMethod('file')}
                      className={`transition-colors ${
                        uploadMethod === 'file'
                          ? 'bg-[var(--primary)] text-[var(--primary-foreground)]'
                          : 'bg-[var(--secondary)] text-[var(--foreground)] hover:bg-[var(--secondary-hover)]'
                      }`}
                      style={{
                        padding: 'var(--spacing-3)',
                        borderRadius: 'var(--radius)',
                        border: uploadMethod === 'file' ? 'none' : '0.5px solid var(--border)'
                      }}
                    >
                      <Upload size={20} className="mx-auto mb-1" />
                      <span className="caption">Upload File</span>
                    </button>
                  </div>
                </div>

                {/* Title */}
                <div className="mb-4">
                  <label className="block label-sm font-medium mb-2" style={{ color: 'var(--foreground)' }}>
                    Policy Title *
                  </label>
                  <input
                    type="text"
                    value={title}
                    onChange={(e) => setTitle(e.target.value)}
                    placeholder="e.g., School District Bullying Prevention Policy"
                    className="field body-text"
                  />
                </div>

                {/* Jurisdiction: where the policy comes from */}
                <div className="mb-4">
                  <label htmlFor="jurisdiction" className="block label-sm font-medium mb-2" style={{ color: 'var(--foreground)' }}>
                    Jurisdiction *
                  </label>
                  <select
                    id="jurisdiction"
                    value={jurisdiction}
                    onChange={(e) => setJurisdiction(e.target.value)}
                    className="field body-text"
                  >
                    {POLICY_JURISDICTIONS.map((value) => (
                      <option key={value} value={value}>
                        {JURISDICTION_LABELS[value]}
                      </option>
                    ))}
                  </select>
                  <p className="caption mt-1" style={{ color: 'var(--muted-foreground)' }}>
                    Who issued it. District and school policies should implement the federal and state requirements.
                  </p>
                </div>

                {/* Category: what the policy is about */}
                <div className="mb-4">
                  <label htmlFor="category" className="block label-sm font-medium mb-2" style={{ color: 'var(--foreground)' }}>
                    Category *
                  </label>
                  <select
                    id="category"
                    value={category}
                    onChange={(e) => setCategory(e.target.value)}
                    className="field body-text"
                  >
                    {POLICY_CATEGORIES.map((value) => (
                      <option key={value} value={value}>
                        {CATEGORY_LABELS[value] ?? value}
                      </option>
                    ))}
                  </select>
                  <p className="caption mt-1" style={{ color: 'var(--muted-foreground)' }}>
                    What it covers. Incident classification matches on this to decide which policies apply.
                  </p>
                </div>

                {/* Effective Date */}
                <div className="mb-4">
                  <label className="block label-sm font-medium mb-2" style={{ color: 'var(--foreground)' }}>
                    Effective Date *
                  </label>
                  <input
                    type="date"
                    value={effectiveDate}
                    onChange={(e) => setEffectiveDate(e.target.value)}
                    className="field body-text"
                  />
                </div>

                {/* Keywords */}
                <div className="mb-4">
                  <label className="block label-sm font-medium mb-2" style={{ color: 'var(--foreground)' }}>
                    Keywords (comma-separated)
                  </label>
                  <input
                    type="text"
                    value={keywords}
                    onChange={(e) => setKeywords(e.target.value)}
                    placeholder="e.g., bullying, harassment, Title IX"
                    className="field body-text"
                  />
                </div>

                {/* Content Input (varies by method) */}
                {uploadMethod === 'text' && (
                  <div className="mb-4">
                    <label className="block label-sm font-medium mb-2" style={{ color: 'var(--foreground)' }}>
                      Policy Content *
                    </label>
                    <textarea
                      value={content}
                      onChange={(e) => setContent(e.target.value)}
                      placeholder="Paste the full policy text here..."
                      className="field field-textarea"
                      style={{
                        width: '100%',
                        height: '256px',
                        fontFamily: 'SF Mono, ui-monospace, monospace',
                        fontSize: '15px',
                        resize: 'none'
                      }}
                    />
                  </div>
                )}

                {uploadMethod === 'url' && (
                  <div className="mb-4">
                    <label className="block label-sm font-medium mb-2" style={{ color: 'var(--foreground)' }}>
                      Policy URL *
                    </label>
                    <input
                      type="url"
                      value={url}
                      onChange={(e) => setUrl(e.target.value)}
                      placeholder="https://example.com/policy.txt"
                      className="field body-text"
                    />
                    <p className="caption mt-2" style={{ color: 'var(--muted-foreground)' }}>
                      URL must point to a text-based document
                    </p>
                  </div>
                )}

                {uploadMethod === 'file' && (
                  <div className="mb-4">
                    <label className="block label-sm font-medium mb-2" style={{ color: 'var(--foreground)' }}>
                      Policy File *
                    </label>
                    <input
                      type="file"
                      accept=".txt,.md"
                      onChange={(e) => setFile(e.target.files?.[0] || null)}
                      className="field body-text"
                    />
                    <p className="caption mt-2" style={{ color: 'var(--muted-foreground)' }}>
                      Supported formats: .txt, .md
                    </p>
                  </div>
                )}

                {/* Buttons */}
                <div className="flex gap-3 justify-end">
                  <Button
                    onClick={() => setShowUploadModal(false)}
                    variant="secondary"
                  >
                    Cancel
                  </Button>
                  <Button
                    onClick={handleUpload}
                    disabled={uploading}
                  >
                    {uploading ? 'Uploading...' : 'Upload Policy'}
                  </Button>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
