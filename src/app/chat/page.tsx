'use client';

import { useState, useRef, useEffect, useCallback } from 'react';
import { Button } from '@/components/ui/button';
import { Send, Plus, Paperclip, Menu, PanelRightClose } from 'lucide-react';
import Navbar from '@/components/Navbar';
import toast from 'react-hot-toast';
import Image from 'next/image';
import { GuidanceBlock } from '@/components/design/GuidanceBlock';
import type { TurnKind } from '@/lib/ai/turn-label';
import { ClassificationChip } from '@/components/design/ClassificationChip';
import { ProvenanceRail } from '@/components/design/ProvenanceRail';
import { conversationProvenance } from '@/lib/provenance';

interface Citation {
  policyId: string;
  title: string;
  jurisdiction: string;
  category: string;
  /** Provisions relied on, when the document had parseable structure. */
  sections?: string[];
}

interface Coverage {
  categories: string[];
  byCategory: Record<string, string[]>;
  categoriesWithoutLocalPolicy: string[];
}

interface Classification {
  type: string;
  severity?: string | null;
}

/**
 * A failed turn.
 *
 * Deliberately not a `Message`. Appended as one, a failure would render in the
 * same component, in the same place, behind the same avatar as real guidance,
 * so the administrator would see the assistant speaking -- and being
 * client-only, it would vanish on reload while their own question remained.
 *
 * `generateSchoolComplianceResponse` throws rather than returning filler text
 * precisely so a failed call cannot be mistaken for guidance; the client must
 * not reintroduce it visually. This renders as a notice about the request,
 * keeps the unsent text so it is not lost, and says plainly that nothing was
 * written.
 */
interface SendFailure {
  message: string;
  retryable: boolean;
  unsent: string;
}

interface Message {
  id: string;
  type: 'user' | 'general';
  content: string;
  timestamp: Date;
  /** Policies the guidance was drawn from; empty means none matched. */
  citations?: Citation[];
  coverage?: Coverage;
  /**
   * Whether this turn gave guidance or only asked for more information.
   *
   * Undefined means unknown -- an older stored turn, or a reply whose label
   * could not be read -- and unknown shows the provenance block, because a
   * guidance turn with nothing shown behind it is the failure that matters.
   */
  kind?: TurnKind;
  /** Present only on the turn where the incident was classified. */
  classification?: Classification | null;
}

/**
 * One turn as GET /api/chat/[incidentId] returns it -- the stored record,
 * whose timestamp is still a string. Typed rather than mapped through `any`,
 * so renaming a field on either side of that boundary fails the build instead
 * of silently dropping a turn's provenance.
 */
interface StoredMessage extends Omit<Message, 'timestamp'> {
  timestamp: string;
}

interface Chat {
  id: string;
  title: string;
  lastMessage: string;
  timestamp: Date;
}

export default function ChatPage() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [inputValue, setInputValue] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [sendError, setSendError] = useState<SendFailure | null>(null);
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [railOpen, setRailOpen] = useState(true);

  // The sidebar is 260px and defaulted open, which left 115px for the
  // conversation on a phone -- the composer was effectively unreachable.
  // Collapse it below the md breakpoint; it is still togglable. (design 1i)
  useEffect(() => {
    const narrow = window.matchMedia('(max-width: 767px)');
    const apply = (matches: boolean) => {
      if (matches) setSidebarOpen(false);
    };
    apply(narrow.matches);
    const onChange = (e: MediaQueryListEvent) => apply(e.matches);
    narrow.addEventListener('change', onChange);
    return () => narrow.removeEventListener('change', onChange);
  }, []);

  // With both panels open it is the answer that loses width first, so the
  // rail folds before the history does. Still togglable. (design 1i)
  useEffect(() => {
    const narrow = window.matchMedia('(max-width: 1179px)');
    const apply = (matches: boolean) => setRailOpen(!matches);
    apply(narrow.matches);
    const onChange = (e: MediaQueryListEvent) => apply(e.matches);
    narrow.addEventListener('change', onChange);
    return () => narrow.removeEventListener('change', onChange);
  }, []);
  const [incidentId, setIncidentId] = useState<string | null>(null);
  const [isGeneratingSummary, setIsGeneratingSummary] = useState(false);
  const [previousChats, setPreviousChats] = useState<Chat[]>([]);
  const [loadingHistories, setLoadingHistories] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);


  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  useEffect(() => {
    fetchChatHistories();
  }, []);

  const fetchChatHistories = async () => {
    setLoadingHistories(true);
    try {
      // No userId param: the endpoint always scopes to the session user.
      const response = await fetch('/api/chat/history');
      if (!response.ok) throw new Error('Failed to fetch histories');

      const data = await response.json();
      setPreviousChats(data.histories.map((h: any) => ({
        ...h,
        timestamp: new Date(h.timestamp)
      })));
    } catch (error) {
      console.error('Error fetching chat histories:', error);
    } finally {
      setLoadingHistories(false);
    }
  };

  const loadConversation = useCallback(async (chatId: string) => {
    try {
      const response = await fetch(`/api/chat/${chatId}`);
      if (!response.ok) throw new Error('Failed to load conversation');

      const data = await response.json();
      setIncidentId(data.incidentId);
      setMessages(
        (data.messages as StoredMessage[]).map(m => ({
          ...m,
          timestamp: new Date(m.timestamp),
        }))
      );
    } catch (error) {
      console.error('Error loading conversation:', error);
      toast.error('Failed to load conversation. Please try again.');
    }
  }, []);

  /*
   * Open the incident named in `?incident=`, so an obligation row and the
   * incident page have somewhere to send an administrator.
   *
   * Read from `window.location` in an effect rather than through
   * `useSearchParams`, which would oblige this page to sit inside a Suspense
   * boundary and stop being statically rendered. Nothing derives from it
   * during render, so there is no hydration mismatch to guard.
   *
   * An id that is not the caller's own 404s in the route and is reported as a
   * failure to load -- it is never confirmed to exist.
   */
  useEffect(() => {
    const requested = new URLSearchParams(window.location.search).get('incident');
    if (requested) loadConversation(requested);
  }, [loadConversation]);

  /*
   * The address follows the thread. `?incident=` is read on mount, so an
   * address left naming a previous thread sends a reload somewhere the user
   * has already navigated away from -- and a thread started here would have no
   * address at all until it was reopened.
   *
   * Only ever set, never cleared: on mount `incidentId` is null while the
   * deep-link effect above is still resolving, and clearing here would strip
   * the parameter before it has been read. Starting a new chat clears it
   * where that happens. `replaceState` rather than push, because opening a
   * thread is not a step to go Back through.
   */
  useEffect(() => {
    if (!incidentId) return;
    if (new URLSearchParams(window.location.search).get('incident') === incidentId) return;
    window.history.replaceState(null, '', `/chat?incident=${incidentId}`);
  }, [incidentId]);

  const handleNewChat = () => {
    setMessages([]);
    setIncidentId(null);
    // Cleared here rather than in the effect above, which must not strip the
    // parameter while the deep link is still resolving it on mount.
    window.history.replaceState(null, '', '/chat');
  };

  const handleSendMessage = async () => {
    if (!inputValue.trim() || isLoading) return;

    const userMessage: Message = {
      id: Date.now().toString(),
      type: 'user',
      content: inputValue,
      timestamp: new Date()
    };

    setMessages(prev => [...prev, userMessage]);
    const currentInput = inputValue;
    setInputValue('');
    setSendError(null);
    setIsLoading(true);

    try {
      const response = await fetch('/api/chat', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          message: currentInput,
          incidentId,
        }),
      });

      if (!response.ok) {
        // Read the endpoint's own message where it has one: a 429 says when to
        // retry and a 503 names the outage, and both are more useful than a
        // generic apology.
        let detail = '';
        try {
          const body = await response.json();
          if (typeof body?.error === 'string') detail = body.error;
        } catch {
          // Not JSON.
        }
        setSendError({
          message:
            response.status === 401
              ? 'Your session has expired. Sign in again to continue.'
              : detail ||
                'The assistant could not answer. Nothing has been added to this incident.',
          retryable: response.status !== 401,
          unsent: currentInput,
        });
        return;
      }

      const data = await response.json();

      if (data.incidentId && !incidentId) {
        setIncidentId(data.incidentId);
        // Refresh chat histories when new incident is created
        fetchChatHistories();
      }

      const aiMessage: Message = {
        id: (Date.now() + 1).toString(),
        type: 'general',
        content: data.response,
        timestamp: new Date(),
        citations: data.citations ?? [],
        coverage: data.coverage,
        classification: data.classification,
        kind: data.kind
      };
      setMessages(prev => [...prev, aiMessage]);
    } catch {
      setSendError({
        message: 'Could not reach the server. Nothing has been added to this incident.',
        retryable: true,
        unsent: currentInput,
      });
    } finally {
      setIsLoading(false);
    }
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSendMessage();
    }
  };

  const handleEndChat = async () => {
    if (!incidentId) {
      toast.error('No active chat to end. Start a conversation first.');
      return;
    }

    if (messages.length < 2) {
      toast.error('Please have at least one exchange before ending the chat.');
      return;
    }

    setIsGeneratingSummary(true);

    try {
      const response = await fetch('/api/chat/summary', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ incidentId }),
      });

      if (!response.ok) {
        throw new Error(`API error: ${response.statusText}`);
      }

      const data = await response.json();

      const summaryMessage: Message = {
        id: Date.now().toString(),
        type: 'general',
        content: data.summary,
        timestamp: new Date()
      };
      setMessages(prev => [...prev, summaryMessage]);

      toast.success('Chat ended. Summary generated and saved to incident record.');

    } catch (error) {
      console.error('Error generating summary:', error);
      toast.error('Failed to generate summary. Please try again.');
    } finally {
      setIsGeneratingSummary(false);
    }
  };

  const provenance = conversationProvenance(messages);
  // The last classification wins: it is refined as the administrator says
  // more, and the scope note names what the system currently thinks this is.
  const incidentType = messages.filter(m => m.classification).pop()?.classification?.type;

  return (
    <div className="min-h-screen" style={{ background: 'var(--color-bg)' }}>
      <Navbar />
      <div className="flex" style={{ height: 'calc(100vh - 52px)' }}>
        {/* Sidebar */}
        <div
          style={{
            width: sidebarOpen ? '260px' : '0px',
            borderRight: '1px solid var(--color-line)',
            background: 'var(--color-bg)',
            display: 'flex',
            flexDirection: 'column',
            overflow: 'hidden',
            transition: 'width 0.3s ease'
          }}
        >
          {/* New Chat Button */}
          <div style={{ padding: '12px', flexShrink: 0 }}>
            <button
              onClick={handleNewChat}
              style={{
                width: '100%',
                padding: '10px 14px',
                background: 'transparent',
                border: '1px solid var(--color-line)',
                borderRadius: '8px',
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                cursor: 'pointer',
                color: 'var(--color-text)',
                fontSize: '14px',
                fontWeight: 500,
                transition: 'background 0.2s'
              }}
              onMouseEnter={(e) => e.currentTarget.style.background = 'var(--color-input)'}
              onMouseLeave={(e) => e.currentTarget.style.background = 'transparent'}
            >
              <Plus size={18} />
              <span>New chat</span>
            </button>
          </div>

          {/* Previous Chats */}
          <div style={{
            flex: 1,
            overflowY: 'auto',
            overflowX: 'hidden',
            padding: '0 8px',
            display: 'flex',
            flexDirection: 'column'
          }}>
            {loadingHistories ? (
              <div style={{ padding: '10px 12px', color: 'var(--color-text-muted)', fontSize: '14px' }}>
                Loading...
              </div>
            ) : previousChats.length === 0 ? (
              <div style={{ padding: '10px 12px', color: 'var(--color-text-muted)', fontSize: '14px' }}>
                No previous chats
              </div>
            ) : (
              previousChats.map((chat) => (
                // A button, not a clickable div: this is the only way back to
                // a past incident, and on a div it was unreachable by keyboard
                // and announced as nothing.
                <button
                  key={chat.id}
                  type="button"
                  data-testid="chat-history-item"
                  data-incident-id={chat.id}
                  aria-current={incidentId === chat.id ? 'true' : undefined}
                  onClick={() => loadConversation(chat.id)}
                  style={{
                    display: 'block',
                    width: '100%',
                    textAlign: 'left',
                    font: 'inherit',
                    border: 'none',
                    padding: '10px 12px',
                    marginBottom: '4px',
                    borderRadius: '8px',
                    cursor: 'pointer',
                    transition: 'background 0.2s',
                    background: incidentId === chat.id ? 'var(--color-input)' : 'transparent'
                  }}
                  onMouseEnter={(e) => e.currentTarget.style.background = 'var(--color-input)'}
                  onMouseLeave={(e) => {
                    if (incidentId !== chat.id) {
                      e.currentTarget.style.background = 'transparent';
                    }
                  }}
                >
                  <div style={{
                    fontSize: '14px',
                    color: 'var(--color-text)',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap',
                    marginBottom: '2px'
                  }}>
                    {chat.title}
                  </div>
                </button>
              ))
            )}
          </div>
        </div>

        {/* Main Chat Area */}
        <div style={{
          flex: 1,
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden'
        }}>
          {/* Top Bar */}
          <div style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: '0 16px',
            minHeight: '48px',
            borderBottom: '1px solid var(--color-line)',
            flexShrink: 0
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
              {!sidebarOpen && (
                <button
                  onClick={() => setSidebarOpen(true)}
                  style={{
                    padding: '6px',
                    borderRadius: '6px',
                    color: 'var(--color-text-muted)',
                    background: 'transparent',
                    border: 'none',
                    cursor: 'pointer',
                    transition: 'all 0.2s'
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.color = 'var(--color-text)';
                    e.currentTarget.style.background = 'var(--color-input)';
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.color = 'var(--color-text-muted)';
                    e.currentTarget.style.background = 'transparent';
                  }}
                >
                  <Menu size={20} />
                </button>
              )}
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              {provenance && !railOpen && (
                <button
                  onClick={() => setRailOpen(true)}
                  className="eyebrow"
                  style={{
                    padding: '6px 10px',
                    borderRadius: '6px',
                    color: 'var(--color-text-muted)',
                    background: 'transparent',
                    border: '1px solid var(--color-line)',
                    cursor: 'pointer',
                  }}
                >
                  Sources
                </button>
              )}

              {messages.length > 0 && incidentId && (
                <Button
                  onClick={handleEndChat}
                  disabled={isGeneratingSummary}
                  variant="destructive"
                  size="sm"
                >
                  {isGeneratingSummary ? 'Generating Summary...' : 'End Chat'}
                </Button>
              )}
            </div>
          </div>

          {/* Messages Area */}
          <div style={{
            flex: 1,
            overflowY: 'auto',
            overflowX: 'hidden'
          }}>
            {messages.length === 0 ? (
              <div style={{
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'center',
                height: '100%',
                textAlign: 'center',
                padding: '32px'
              }}>
                <div style={{
                  width: '64px',
                  height: '64px',
                  borderRadius: '50%',
                  overflow: 'hidden',
                  marginBottom: '24px',
                  border: '2px solid var(--color-text)',
                }}>
                  <Image
                    src="/General.jpeg"
                    alt="The General"
                    width={64}
                    height={64}
                    style={{ objectFit: 'cover', width: '100%', height: '100%' }}
                  />
                </div>
                <h2 style={{
                  fontSize: '24px',
                  fontWeight: 600,
                  color: 'var(--color-text)',
                  marginBottom: '12px'
                }}>
                  Chat with the General
                </h2>
                <p style={{
                  fontSize: '15px',
                  color: 'var(--color-text-muted)',
                  maxWidth: '420px',
                  lineHeight: '1.5'
                }}>
                  I&apos;m here to help you navigate complex disciplinary incident compliance requirements.
                  Describe your incident and I&apos;ll guide you through the process.
                </p>
              </div>
            ) : (
              <div style={{ padding: '24px 16px' }}>
                <div style={{ maxWidth: '48rem', margin: '0 auto', display: 'flex', flexDirection: 'column', gap: '24px' }}>
                  {messages.map((message) => (
                    <div
                      key={message.id}
                      style={{
                        display: 'flex',
                        gap: '12px',
                        flexDirection: message.type === 'user' ? 'row-reverse' : 'row'
                      }}
                    >
                      {message.type === 'general' && (
                        <div style={{
                          width: '32px',
                          height: '32px',
                          borderRadius: '50%',
                          overflow: 'hidden',
                          flexShrink: 0,
                          border: '1px solid var(--color-text)',
                        }}>
                          <Image
                            src="/General.jpeg"
                            alt="The General"
                            width={32}
                            height={32}
                            style={{ objectFit: 'cover', width: '100%', height: '100%' }}
                          />
                        </div>
                      )}
                      <div style={{
                        flex: 1,
                        maxWidth: message.type === 'user' ? '80%' : '100%'
                      }}>
                        <div style={{
                          padding: message.type === 'user' ? '12px 16px' : '0',
                          background: message.type === 'user' ? 'var(--color-input)' : 'transparent',
                          borderRadius: message.type === 'user' ? '16px' : '0',
                          fontSize: '15px',
                          lineHeight: '1.6',
                          color: 'var(--color-text)',
                          whiteSpace: message.type === 'user' ? 'pre-wrap' : 'normal',
                          wordBreak: 'break-word'
                        }}>
                          {message.type === 'general' ? (
                            <>
                              {message.classification?.type && (
                                <div className="mb-4">
                                  <ClassificationChip
                                    incidentType={message.classification.type}
                                    severity={message.classification.severity}
                                  />
                                </div>
                              )}
                              <GuidanceBlock>{message.content}</GuidanceBlock>
                            </>
                          ) : (
                            message.content
                          )}
                        </div>

                      </div>
                    </div>
                  ))}

                  {sendError && !isLoading && (
                    <div
                      role="alert"
                      data-testid="chat-error"
                      style={{
                        border: '1px solid var(--color-line-strong)',
                        borderRadius: '12px',
                        padding: '14px 16px',
                        display: 'flex',
                        flexDirection: 'column',
                        gap: '8px',
                        background: 'var(--color-surface)',
                      }}
                    >
                      <span style={{ fontSize: '15px', color: 'var(--color-text)' }}>
                        {sendError.message}
                      </span>
                      {sendError.retryable && (
                        <button
                          type="button"
                          onClick={() => {
                            const text = sendError.unsent;
                            setSendError(null);
                            setInputValue(text);
                          }}
                          style={{
                            alignSelf: 'flex-start',
                            minHeight: '36px',
                            padding: '0 12px',
                            borderRadius: '10px',
                            border: '1px solid var(--color-line-strong)',
                            background: 'transparent',
                            color: 'var(--color-text)',
                            fontSize: '13px',
                            cursor: 'pointer',
                          }}
                        >
                          Put my message back
                        </button>
                      )}
                    </div>
                  )}

                  {isLoading && (
                    <div data-testid="chat-loading" role="status" aria-live="polite" style={{ display: 'flex', gap: '12px' }}>
                      <div style={{
                        width: '32px',
                        height: '32px',
                        borderRadius: '50%',
                        overflow: 'hidden',
                        flexShrink: 0,
                        border: '1px solid var(--color-text)',
                      }}>
                        <Image
                          src="/General.jpeg"
                          alt="The General"
                          width={32}
                          height={32}
                          style={{ objectFit: 'cover', width: '100%', height: '100%' }}
                        />
                      </div>
                      <div style={{ padding: '12px 0', display: 'flex', gap: '6px', alignItems: 'center' }}>
                        <div style={{
                          width: '8px',
                          height: '8px',
                          borderRadius: '50%',
                          background: 'var(--color-text-muted)',
                          animation: 'bounce 1.4s infinite ease-in-out both'
                        }}></div>
                        <div style={{
                          width: '8px',
                          height: '8px',
                          borderRadius: '50%',
                          background: 'var(--color-text-muted)',
                          animation: 'bounce 1.4s infinite ease-in-out both',
                          animationDelay: '0.16s'
                        }}></div>
                        <div style={{
                          width: '8px',
                          height: '8px',
                          borderRadius: '50%',
                          background: 'var(--color-text-muted)',
                          animation: 'bounce 1.4s infinite ease-in-out both',
                          animationDelay: '0.32s'
                        }}></div>
                      </div>
                    </div>
                  )}

                  <div ref={messagesEndRef} />
                </div>
              </div>
            )}
          </div>

          {/* Input Area */}
          <div style={{
            padding: '16px',
            borderTop: '1px solid var(--color-line)',
            background: 'var(--color-bg)',
            flexShrink: 0
          }}>
            <div style={{ maxWidth: '48rem', margin: '0 auto' }}>
              <div style={{
                border: '1px solid var(--color-line)',
                borderRadius: '12px',
                padding: '8px 12px',
                background: 'var(--color-bg)',
                display: 'flex',
                alignItems: 'flex-end',
                gap: '8px'
              }}>
                <button
                  style={{
                    padding: '6px',
                    borderRadius: '6px',
                    color: 'var(--color-text-muted)',
                    background: 'transparent',
                    border: 'none',
                    cursor: 'pointer',
                    transition: 'all 0.2s',
                    display: 'flex',
                    alignItems: 'center'
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.color = 'var(--color-text)';
                    e.currentTarget.style.background = 'var(--color-input)';
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.color = 'var(--color-text-muted)';
                    e.currentTarget.style.background = 'transparent';
                  }}
                >
                  <Paperclip size={20} />
                </button>

                <textarea
                  data-testid="chat-input"
                  aria-label="Message"
                  value={inputValue}
                  onChange={(e) => setInputValue(e.target.value)}
                  onKeyPress={handleKeyPress}
                  placeholder="Message General..."
                  style={{
                    flex: 1,
                    minHeight: '24px',
                    maxHeight: '200px',
                    resize: 'none',
                    border: 'none',
                    outline: 'none',
                    background: 'transparent',
                    color: 'var(--color-text)',
                    fontSize: '15px',
                    lineHeight: '1.5',
                    fontFamily: 'inherit',
                    padding: '0'
                  }}
                  rows={1}
                  onInput={(e) => {
                    const target = e.target as HTMLTextAreaElement;
                    target.style.height = 'auto';
                    target.style.height = target.scrollHeight + 'px';
                  }}
                />

                <button
                  data-testid="chat-send"
                  type="button"
                  aria-label="Send message"
                  onClick={handleSendMessage}
                  disabled={!inputValue.trim() || isLoading}
                  style={{
                    padding: '6px',
                    borderRadius: '6px',
                    background: inputValue.trim() ? 'var(--color-text)' : 'transparent',
                    color: inputValue.trim() ? 'white' : 'var(--color-text-muted)',
                    border: 'none',
                    cursor: inputValue.trim() ? 'pointer' : 'not-allowed',
                    transition: 'all 0.2s',
                    display: 'flex',
                    alignItems: 'center',
                    opacity: inputValue.trim() ? 1 : 0.5
                  }}
                >
                  <Send size={20} />
                </button>
              </div>
            </div>
          </div>
        </div>

        {provenance && railOpen && (
          <aside
            aria-label="Sources"
            style={{
              width: '340px',
              flexShrink: 0,
              borderLeft: '1px solid var(--color-line)',
              background: 'var(--color-bg)',
              overflowY: 'auto',
            }}
          >
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                padding: '0 16px',
                minHeight: '48px',
                borderBottom: '1px solid var(--color-line)',
              }}
            >
              <span className="eyebrow">This incident rests on</span>
              <button
                onClick={() => setRailOpen(false)}
                aria-label="Hide sources"
                style={{
                  padding: '6px',
                  borderRadius: '6px',
                  color: 'var(--color-text-muted)',
                  background: 'transparent',
                  border: 'none',
                  cursor: 'pointer',
                  lineHeight: 0,
                }}
              >
                <PanelRightClose size={18} />
              </button>
            </div>

            <ProvenanceRail provenance={provenance} incidentType={incidentType} />
          </aside>
        )}
      </div>
    </div>
  );
}
