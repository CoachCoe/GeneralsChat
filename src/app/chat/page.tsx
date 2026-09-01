'use client';

import { useState, useRef, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Send, Plus, Paperclip, Menu } from 'lucide-react';
import Navbar from '@/components/Navbar';
import toast from 'react-hot-toast';
import Image from 'next/image';
import { GuidanceBlock } from '@/components/design/GuidanceBlock';
import { SourceLadder } from '@/components/design/SourceLadder';
import { CoverageGapCard } from '@/components/design/CoverageGapCard';
import { ClassificationChip } from '@/components/design/ClassificationChip';
import { LibraryScopeNote } from '@/components/design/LibraryScopeNote';
import { ALWAYS_RETRIEVED_CATEGORY } from '@/types';

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
 * True when nothing the incident is actually *about* has a local policy.
 *
 * mandatory_reporting is appended to every incident and is nearly always
 * covered locally, so it has to be excluded — otherwise this is never true and
 * the scope note never appears.
 */
function isSubjectOutsideLibrary(coverage: Coverage): boolean {
  const subject = coverage.categories.filter(c => c !== ALWAYS_RETRIEVED_CATEGORY);
  if (subject.length === 0) return false;
  return subject.every(c => coverage.categoriesWithoutLocalPolicy.includes(c));
}

interface Message {
  id: string;
  type: 'user' | 'general';
  content: string;
  timestamp: Date;
  /** Policies the guidance was drawn from; empty means none matched. */
  citations?: Citation[];
  coverage?: Coverage;
  /** Present only on the turn where the incident was classified. */
  classification?: Classification | null;
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
  const [sidebarOpen, setSidebarOpen] = useState(true);

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

  // Fetch chat histories on mount
  useEffect(() => {
    fetchChatHistories();
  }, []);

  const fetchChatHistories = async () => {
    setLoadingHistories(true);
    try {
      // No userId param: the endpoint always scopes to the session user. (SEC-8)
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

  const loadConversation = async (chatId: string) => {
    try {
      const response = await fetch(`/api/chat/${chatId}`);
      if (!response.ok) throw new Error('Failed to load conversation');

      const data = await response.json();
      setIncidentId(data.incidentId);
      setMessages(data.messages.map((m: any) => ({
        ...m,
        timestamp: new Date(m.timestamp)
      })));
    } catch (error) {
      console.error('Error loading conversation:', error);
      toast.error('Failed to load conversation. Please try again.');
    }
  };

  const handleNewChat = () => {
    setMessages([]);
    setIncidentId(null);
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
        throw new Error(`API error: ${response.statusText}`);
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
        classification: data.classification
      };
      setMessages(prev => [...prev, aiMessage]);
    } catch (error) {
      console.error('Error calling API:', error);
      const errorMessage: Message = {
        id: (Date.now() + 1).toString(),
        type: 'general',
        content: "I'm sorry, I'm experiencing technical difficulties. Please try again in a moment.",
        timestamp: new Date()
      };
      setMessages(prev => [...prev, errorMessage]);
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
                <div
                  key={chat.id}
                  onClick={() => loadConversation(chat.id)}
                  style={{
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
                </div>
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

                        {message.type === 'general' && message.citations && (
                          <div data-testid="chat-sources" className="mt-4 flex flex-col gap-4">
                            {message.citations.length > 0 ? (
                              <SourceLadder
                                sources={message.citations.map((c) => ({
                                  jurisdiction: c.jurisdiction,
                                  title: c.title,
                                  sections: c.sections,
                                }))}
                                gapCategories={message.coverage?.categoriesWithoutLocalPolicy ?? []}
                              />
                            ) : (
                              <div className="text-[13px] text-text-muted">
                                No matching district policy was found for this question.
                              </div>
                            )}

                            {message.coverage &&
                              (isSubjectOutsideLibrary(message.coverage) ? (
                                // Nothing implicated has local cover: that is the
                                // subject being outside the library, not a partial
                                // miss, and it warrants a different sentence.
                                <LibraryScopeNote
                                  incidentType={message.classification?.type}
                                  categories={message.coverage.categoriesWithoutLocalPolicy.filter(
                                    (c) => c !== ALWAYS_RETRIEVED_CATEGORY
                                  )}
                                />
                              ) : (
                                <CoverageGapCard
                                  categories={message.coverage.categoriesWithoutLocalPolicy}
                                  byCategory={message.coverage.byCategory}
                                />
                              ))}
                          </div>
                        )}
                      </div>
                    </div>
                  ))}

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
      </div>
    </div>
  );
}
