'use client';

import { useState, useEffect } from 'react';
import Navbar from '@/components/Navbar';
import { Button } from '@/components/ui/button';
import { Save, Plus, Trash2, Check, X } from 'lucide-react';

interface SystemPrompt {
  id: string;
  name: string;
  content: string;
  description?: string;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

export default function PromptEditorPage() {
  const [prompts, setPrompts] = useState<SystemPrompt[]>([]);
  const [selectedPrompt, setSelectedPrompt] = useState<SystemPrompt | null>(null);
  const [isEditing, setIsEditing] = useState(false);
  const [isCreating, setIsCreating] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  // Form state
  const [name, setName] = useState('');
  const [content, setContent] = useState('');
  const [description, setDescription] = useState('');

  useEffect(() => {
    fetchPrompts();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const fetchPrompts = async () => {
    try {
      const response = await fetch('/api/admin/prompts');
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }
      const data = await response.json();

      // Ensure prompts is an array
      const promptsArray = data.prompts || [];
      setPrompts(promptsArray);

      // Auto-select active prompt or first one
      const activePrompt = promptsArray.find((p: SystemPrompt) => p.isActive);
      if (activePrompt) {
        loadPrompt(activePrompt.id);
      } else if (promptsArray.length > 0) {
        loadPrompt(promptsArray[0].id);
      }
    } catch (error) {
      console.error('Error fetching prompts:', error);
      // Don't show alert, just silently fail and show empty state
      setPrompts([]); // Set to empty array on error
    } finally {
      setLoading(false);
    }
  };

  const loadPrompt = async (id: string) => {
    try {
      const response = await fetch(`/api/admin/prompts/${id}`);
      const data = await response.json();
      setSelectedPrompt(data.prompt);
      setName(data.prompt.name);
      setContent(data.prompt.content);
      setDescription(data.prompt.description || '');
      setIsEditing(false);
      setIsCreating(false);
    } catch (error) {
      console.error('Error loading prompt:', error);
      alert('Failed to load prompt');
    }
  };

  const handleCreateNew = () => {
    setSelectedPrompt(null);
    setName('');
    setContent('');
    setDescription('');
    setIsCreating(true);
    setIsEditing(true);
  };

  const handleSave = async () => {
    if (!name.trim() || !content.trim()) {
      alert('Name and content are required');
      return;
    }

    setSaving(true);
    try {
      if (isCreating) {
        // Create new prompt
        const response = await fetch('/api/admin/prompts', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ name, content, description, createdBy: 'admin' })
        });

        if (!response.ok) throw new Error('Failed to create prompt');

        const data = await response.json();
        await fetchPrompts();
        await loadPrompt(data.prompt.id);
        alert('Prompt created successfully');
      } else if (selectedPrompt) {
        // Update existing prompt
        const response = await fetch(`/api/admin/prompts/${selectedPrompt.id}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ name, content, description })
        });

        if (!response.ok) throw new Error('Failed to update prompt');

        await fetchPrompts();
        await loadPrompt(selectedPrompt.id);
        alert('Prompt updated successfully');
      }
    } catch (error) {
      console.error('Error saving prompt:', error);
      alert('Failed to save prompt');
    } finally {
      setSaving(false);
    }
  };

  const handleActivate = async () => {
    if (!selectedPrompt) return;

    setSaving(true);
    try {
      const response = await fetch(`/api/admin/prompts/${selectedPrompt.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ isActive: true })
      });

      if (!response.ok) throw new Error('Failed to activate prompt');

      await fetchPrompts();
      await loadPrompt(selectedPrompt.id);
      alert('Prompt activated successfully');
    } catch (error) {
      console.error('Error activating prompt:', error);
      alert('Failed to activate prompt');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!selectedPrompt) return;

    if (!confirm('Are you sure you want to delete this prompt?')) return;

    try {
      const response = await fetch(`/api/admin/prompts/${selectedPrompt.id}`, {
        method: 'DELETE'
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || 'Failed to delete prompt');
      }

      await fetchPrompts();
      setSelectedPrompt(null);
      alert('Prompt deleted successfully');
    } catch (error: any) {
      console.error('Error deleting prompt:', error);
      alert(error.message || 'Failed to delete prompt');
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen" style={{ background: 'var(--background)' }}>
        <Navbar />
        <div className="flex items-center justify-center h-screen">
          <p className="text-apple-body" style={{ color: 'var(--muted-foreground)' }}>Loading...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen" style={{ background: 'var(--background)' }}>
      <Navbar />
      <div className="container mx-auto px-4 py-8 max-w-7xl">
        <div className="flex items-center justify-between mb-6">
          <h1 className="text-apple-largetitle" style={{ color: 'var(--foreground)' }}>System Prompt Editor</h1>
          <Button onClick={handleCreateNew}>
            <Plus size={20} style={{ marginRight: 'var(--spacing-2)' }} />
            New Prompt
          </Button>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
          {/* Sidebar - Prompt List */}
          <div className="lg:col-span-1">
            <div className="card-apple">
              <h2 className="text-apple-title3 mb-4" style={{ color: 'var(--foreground)' }}>Saved Prompts</h2>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--spacing-2)' }}>
                {(prompts || []).map((prompt) => (
                  <button
                    key={prompt.id}
                    onClick={() => loadPrompt(prompt.id)}
                    className={`list-item-apple text-left ${
                      selectedPrompt?.id === prompt.id ? 'bg-[var(--primary)] text-[var(--primary-foreground)]' : ''
                    }`}
                    style={{
                      width: '100%',
                      justifyContent: 'flex-start'
                    }}
                  >
                    <div className="flex-1">
                      <div className="flex items-center justify-between">
                        <span className="text-apple-subheadline font-medium truncate">{prompt.name}</span>
                        {prompt.isActive && (
                          <span className="badge-apple flex-shrink-0 ml-2" style={{
                            background: 'var(--success)',
                            color: 'white',
                            fontSize: '12px'
                          }}>
                            Active
                          </span>
                        )}
                      </div>
                      {prompt.description && (
                        <p className="text-apple-caption1 mt-1 truncate" style={{ opacity: 0.7 }}>
                          {prompt.description}
                        </p>
                      )}
                    </div>
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* Main Editor */}
          <div className="lg:col-span-3">
            <div className="card-apple">
              {selectedPrompt || isCreating ? (
                <>
                  {/* Header */}
                  <div className="flex items-center justify-between mb-6">
                    <div className="flex-1">
                      {isEditing ? (
                        <input
                          type="text"
                          value={name}
                          onChange={(e) => setName(e.target.value)}
                          placeholder="Prompt name..."
                          className="input-apple text-apple-title2"
                          style={{ fontWeight: 600 }}
                        />
                      ) : (
                        <h2 className="text-apple-title2" style={{ color: 'var(--foreground)' }}>{selectedPrompt?.name}</h2>
                      )}
                    </div>
                    <div className="flex items-center gap-2 ml-4">
                      {!isEditing ? (
                        <>
                          <Button
                            onClick={() => setIsEditing(true)}
                            variant="secondary"
                            size="sm"
                          >
                            Edit
                          </Button>
                          {!selectedPrompt?.isActive && (
                            <Button
                              onClick={handleActivate}
                              disabled={saving}
                              size="sm"
                              style={{
                                background: 'var(--success)',
                                color: 'white'
                              }}
                            >
                              <Check size={20} style={{ marginRight: 'var(--spacing-2)' }} />
                              Activate
                            </Button>
                          )}
                          <Button
                            onClick={handleDelete}
                            variant="destructive"
                            size="sm"
                          >
                            <Trash2 size={20} />
                          </Button>
                        </>
                      ) : (
                        <>
                          <Button
                            onClick={handleSave}
                            disabled={saving}
                            size="sm"
                          >
                            <Save size={20} style={{ marginRight: 'var(--spacing-2)' }} />
                            {saving ? 'Saving...' : 'Save'}
                          </Button>
                          <Button
                            onClick={() => {
                              if (selectedPrompt) {
                                loadPrompt(selectedPrompt.id);
                              } else {
                                setIsCreating(false);
                                setIsEditing(false);
                              }
                            }}
                            variant="secondary"
                            size="sm"
                          >
                            <X size={20} style={{ marginRight: 'var(--spacing-2)' }} />
                            Cancel
                          </Button>
                        </>
                      )}
                    </div>
                  </div>

                  {/* Description */}
                  <div className="mb-4">
                    {isEditing ? (
                      <input
                        type="text"
                        value={description}
                        onChange={(e) => setDescription(e.target.value)}
                        placeholder="Optional description..."
                        className="input-apple text-apple-body"
                      />
                    ) : (
                      selectedPrompt?.description && (
                        <p className="text-apple-body" style={{ color: 'var(--muted-foreground)' }}>
                          {selectedPrompt.description}
                        </p>
                      )
                    )}
                  </div>

                  {/* Content Editor */}
                  <div className="mb-4">
                    <label className="block text-apple-subheadline font-medium mb-2" style={{ color: 'var(--foreground)' }}>
                      System Prompt Content
                    </label>
                    <textarea
                      value={content}
                      onChange={(e) => setContent(e.target.value)}
                      disabled={!isEditing}
                      placeholder="Enter the system prompt that Claude will use..."
                      className="textarea-apple"
                      style={{
                        width: '100%',
                        height: '384px',
                        fontFamily: 'SF Mono, ui-monospace, monospace',
                        fontSize: '15px',
                        resize: 'none',
                        opacity: isEditing ? 1 : 0.7
                      }}
                    />
                    <p className="text-apple-caption1 mt-2" style={{ color: 'var(--muted-foreground)' }}>
                      Characters: {content.length} | Lines: {content.split('\n').length}
                    </p>
                  </div>

                  {/* Metadata */}
                  {selectedPrompt && !isEditing && (
                    <div className="mt-6 pt-6" style={{ borderTop: `0.5px solid var(--separator)` }}>
                      <div className="grid grid-cols-2 gap-4">
                        <div>
                          <p className="text-apple-caption1" style={{ color: 'var(--muted-foreground)' }}>Status</p>
                          <p className="text-apple-body font-medium" style={{ color: 'var(--foreground)' }}>
                            {selectedPrompt.isActive ? (
                              <span style={{ color: 'var(--success)' }}>Active</span>
                            ) : (
                              <span style={{ color: 'var(--muted-foreground)' }}>Inactive</span>
                            )}
                          </p>
                        </div>
                        <div>
                          <p className="text-apple-caption1" style={{ color: 'var(--muted-foreground)' }}>Last Updated</p>
                          <p className="text-apple-body font-medium" style={{ color: 'var(--foreground)' }}>
                            {new Date(selectedPrompt.updatedAt).toLocaleDateString()}
                          </p>
                        </div>
                      </div>
                    </div>
                  )}
                </>
              ) : (
                <div className="text-center" style={{ padding: 'var(--spacing-8) 0' }}>
                  <p className="text-apple-body mb-4" style={{ color: 'var(--muted-foreground)' }}>No prompt selected</p>
                  <Button onClick={handleCreateNew}>
                    <Plus size={20} style={{ marginRight: 'var(--spacing-2)' }} />
                    Create Your First Prompt
                  </Button>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
