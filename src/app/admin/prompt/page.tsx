'use client';

import { useCallback, useEffect, useState } from 'react';
import Navbar from '@/components/Navbar';
import { Button } from '@/components/ui/button';
import { Save } from 'lucide-react';
import toast from 'react-hot-toast';
import { DEFAULT_ADVISOR_PROFILE } from '@/lib/ai/advisor-profile';

/**
 * One advisor profile, editable in place.
 *
 * There is deliberately no list. Only one profile can ever be active, so a
 * gallery of alternatives offered a choice the product does not have -- and it
 * hid the thing it was replacing: creating a second profile silently displaced
 * the in-code default, which appeared nowhere in this UI, so an admin could
 * not see what they had just stopped using.
 *
 * Both ways back are here instead. "Restore original" is the shipped default,
 * read from the same constant the server sends to the model. "Undo last save"
 * is the text this row held before the most recent edit. Neither writes on its
 * own: they load the text into the editor, so the admin sees it before Save.
 */
interface Profile {
  id: string;
  name: string;
  content: string;
  previousContent: string | null;
  isActive: boolean;
  updatedAt: string;
}

export default function PromptEditorPage() {
  const [profile, setProfile] = useState<Profile | null>(null);
  const [content, setContent] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    try {
      const response = await fetch('/api/admin/prompts/active');
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const { prompt } = await response.json();

      if (!prompt) {
        // Nothing configured: the model is being sent the in-code default, so
        // that is what the editor should show rather than an empty box.
        setProfile(null);
        setContent(DEFAULT_ADVISOR_PROFILE);
        return;
      }

      setProfile(prompt);
      setContent(prompt.content);
    } catch (error) {
      console.error('Error loading advisor profile:', error);
      toast.error('Could not load the advisor profile.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const handleSave = async () => {
    if (content.trim().length < 10) {
      toast.error('The profile needs at least 10 characters.');
      return;
    }
    setSaving(true);
    try {
      // One endpoint, which decides for itself whether that means updating the
      // row already there or creating the first one. Choosing here meant
      // POSTing whenever no profile was *active* -- not the same condition as
      // none existing -- and minting a row nobody could reach on every save.
      const response = await fetch('/api/admin/prompts/active', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content }),
      });
      if (!response.ok) throw new Error('save failed');

      await load();
      toast.success('Advisor profile saved.');
    } catch (error) {
      console.error('Error saving advisor profile:', error);
      toast.error('Could not save the advisor profile.');
    } finally {
      setSaving(false);
    }
  };

  const dirty = profile ? content !== profile.content : content !== DEFAULT_ADVISOR_PROFILE;
  const isOriginal = content === DEFAULT_ADVISOR_PROFILE;
  const previous = profile?.previousContent ?? null;

  if (loading) {
    return (
      <div className="min-h-screen" style={{ background: 'var(--color-bg)' }}>
        <Navbar />
        <div className="flex h-screen items-center justify-center">
          <p className="body-text" style={{ color: 'var(--color-text-muted)' }}>Loading...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen" style={{ background: 'var(--color-bg)' }}>
      <Navbar />
      <div className="container mx-auto max-w-4xl px-4 py-8">
        <h1 className="heading-xl mb-6" style={{ color: 'var(--color-text)' }}>Advisor Profile</h1>

        {/*
          Says what this actually controls, which is the chat guidance only:
          classification and summaries use fixed prompts, and the compliance
          rules live in code and are prepended to every call, so nothing edited
          here can remove them.
        */}
        <div className="mb-6 rounded-[16px] border border-line bg-surface px-5 py-4 text-[14px] leading-[1.6] text-text-secondary">
          <span className="font-medium text-text">
            This sets tone, emphasis and district-specific context for chat guidance.
          </span>{' '}
          It does not replace the compliance rules: answering only from retrieved policy, never
          inventing a code or deadline, not presenting state law as district procedure, and saying
          plainly when the policy does not cover something are fixed in code and are applied to
          every answer whatever is written here. Incident classification and generated summaries
          use their own fixed prompts and are not affected by this profile.
        </div>

        <div className="card">
          <label htmlFor="profile-content" className="eyebrow mb-2 block">
            Profile content
          </label>
          <textarea
            id="profile-content"
            value={content}
            onChange={(e) => setContent(e.target.value)}
            spellCheck={false}
            className="w-full rounded-[12px] border border-input bg-bg p-4 font-mono text-[13px] leading-[1.6] text-text"
            style={{ minHeight: '420px', resize: 'vertical' }}
          />

          <p className="mt-2 text-[12px] text-text-muted">
            <span className="font-mono tabular-nums">{content.length}</span> characters
            {profile && !dirty && ' · saved'}
            {dirty && ' · unsaved changes'}
          </p>

          <div className="mt-5 flex flex-wrap items-center gap-2">
            <Button onClick={handleSave} disabled={saving || !dirty}>
              <Save size={18} style={{ marginRight: '8px' }} />
              {saving ? 'Saving...' : 'Save'}
            </Button>

            <button
              type="button"
              onClick={() => setContent(DEFAULT_ADVISOR_PROFILE)}
              disabled={isOriginal}
              className="min-h-[44px] rounded-[12px] border border-line px-4 text-[14px] text-text-secondary transition-colors hover:border-line-strong hover:text-text disabled:opacity-40"
            >
              Restore original
            </button>

            {/* Absent, not merely disabled, until an edit has been saved -- an
                undo that has never had anything to undo is noise. */}
            {previous !== null && (
              <button
                type="button"
                onClick={() => setContent(previous)}
                disabled={content === previous}
                className="min-h-[44px] rounded-[12px] border border-line px-4 text-[14px] text-text-secondary transition-colors hover:border-line-strong hover:text-text disabled:opacity-40"
              >
                Undo last save
              </button>
            )}

            {dirty && (
              <button
                type="button"
                onClick={() => setContent(profile ? profile.content : DEFAULT_ADVISOR_PROFILE)}
                className="min-h-[44px] px-2 text-[14px] text-text-muted underline underline-offset-2 hover:text-text"
              >
                Discard changes
              </button>
            )}
          </div>
        </div>

        <div className="mt-6 flex flex-wrap gap-x-10 gap-y-2 text-[13px] text-text-muted">
          <span>
            <span className="eyebrow mr-2">Status</span>
            <span data-testid="profile-status">
              {profile ? 'Active' : 'Using the shipped default'}
            </span>
          </span>
          {profile && (
            <span>
              <span className="eyebrow mr-2">Last updated</span>
              <span className="font-mono tabular-nums">{profile.updatedAt.slice(0, 10)}</span>
            </span>
          )}
        </div>
      </div>
    </div>
  );
}
