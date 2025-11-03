'use client';

import { useState, useRef, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Send, Plus, Paperclip, Menu } from 'lucide-react';
import Navbar from '@/components/Navbar';
import toast from 'react-hot-toast';
import Image from 'next/image';

interface Message {
  id: string;
  type: 'user' | 'general';
  content: string;
  timestamp: Date;
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
  const [incidentId, setIncidentId] = useState<string | null>(null);
  const [isGeneratingSummary, setIsGeneratingSummary] = useState(false);
  const [previousChats, setPreviousChats] = useState<Chat[]>([]);
  const [loadingHistories, setLoadingHistories] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const userId = 'demo-user'; // In production, get from auth session

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
      const response = await fetch(`/api/chat/history?userId=${userId}`);
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
          userId,
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
        timestamp: new Date()
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
    <div className="min-h-screen" style={{ background: 'var(--background)' }}>
      <Navbar />
      <div className="flex" style={{ height: 'calc(100vh - 52px)' }}>
        {/* Sidebar */}
        <div
          style={{
            width: sidebarOpen ? '260px' : '0px',
            borderRight: '1px solid var(--separator)',
            background: 'var(--background)',
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
                border: '1px solid var(--border)',
                borderRadius: '8px',
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                cursor: 'pointer',
                color: 'var(--foreground)',
                fontSize: '14px',
                fontWeight: 500,
                transition: 'background 0.2s'
              }}
              onMouseEnter={(e) => e.currentTarget.style.background = 'var(--secondary)'}
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
              <div style={{ padding: '10px 12px', color: 'var(--muted-foreground)', fontSize: '14px' }}>
                Loading...
              </div>
            ) : previousChats.length === 0 ? (
              <div style={{ padding: '10px 12px', color: 'var(--muted-foreground)', fontSize: '14px' }}>
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
                    background: incidentId === chat.id ? 'var(--secondary)' : 'transparent'
                  }}
                  onMouseEnter={(e) => e.currentTarget.style.background = 'var(--secondary)'}
                  onMouseLeave={(e) => {
                    if (incidentId !== chat.id) {
                      e.currentTarget.style.background = 'transparent';
                    }
                  }}
                >
                  <div style={{
                    fontSize: '14px',
                    color: 'var(--foreground)',
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
            borderBottom: '1px solid var(--separator)',
            flexShrink: 0
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
              {!sidebarOpen && (
                <button
                  onClick={() => setSidebarOpen(true)}
                  style={{
                    padding: '6px',
                    borderRadius: '6px',
                    color: 'var(--muted-foreground)',
                    background: 'transparent',
                    border: 'none',
                    cursor: 'pointer',
                    transition: 'all 0.2s'
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.color = 'var(--foreground)';
                    e.currentTarget.style.background = 'var(--secondary)';
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.color = 'var(--muted-foreground)';
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
                  border: '2px solid var(--primary)',
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
                  color: 'var(--foreground)',
                  marginBottom: '12px'
                }}>
                  Chat with the General
                </h2>
                <p style={{
                  fontSize: '15px',
                  color: 'var(--muted-foreground)',
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
                          border: '1px solid var(--primary)',
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
                          background: message.type === 'user' ? 'var(--secondary)' : 'transparent',
                          borderRadius: message.type === 'user' ? '16px' : '0',
                          fontSize: '15px',
                          lineHeight: '1.6',
                          color: 'var(--foreground)',
                          whiteSpace: 'pre-wrap',
                          wordBreak: 'break-word'
                        }}>
                          {message.content}
                        </div>
                      </div>
                    </div>
                  ))}

                  {isLoading && (
                    <div style={{ display: 'flex', gap: '12px' }}>
                      <div style={{
                        width: '32px',
                        height: '32px',
                        borderRadius: '50%',
                        overflow: 'hidden',
                        flexShrink: 0,
                        border: '1px solid var(--primary)',
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
                          background: 'var(--muted-foreground)',
                          animation: 'bounce 1.4s infinite ease-in-out both'
                        }}></div>
                        <div style={{
                          width: '8px',
                          height: '8px',
                          borderRadius: '50%',
                          background: 'var(--muted-foreground)',
                          animation: 'bounce 1.4s infinite ease-in-out both',
                          animationDelay: '0.16s'
                        }}></div>
                        <div style={{
                          width: '8px',
                          height: '8px',
                          borderRadius: '50%',
                          background: 'var(--muted-foreground)',
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
            borderTop: '1px solid var(--separator)',
            background: 'var(--background)',
            flexShrink: 0
          }}>
            <div style={{ maxWidth: '48rem', margin: '0 auto' }}>
              <div style={{
                border: '1px solid var(--border)',
                borderRadius: '12px',
                padding: '8px 12px',
                background: 'var(--background)',
                display: 'flex',
                alignItems: 'flex-end',
                gap: '8px'
              }}>
                <button
                  style={{
                    padding: '6px',
                    borderRadius: '6px',
                    color: 'var(--muted-foreground)',
                    background: 'transparent',
                    border: 'none',
                    cursor: 'pointer',
                    transition: 'all 0.2s',
                    display: 'flex',
                    alignItems: 'center'
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.color = 'var(--foreground)';
                    e.currentTarget.style.background = 'var(--secondary)';
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.color = 'var(--muted-foreground)';
                    e.currentTarget.style.background = 'transparent';
                  }}
                >
                  <Paperclip size={20} />
                </button>

                <textarea
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
                    color: 'var(--foreground)',
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
                  onClick={handleSendMessage}
                  disabled={!inputValue.trim() || isLoading}
                  style={{
                    padding: '6px',
                    borderRadius: '6px',
                    background: inputValue.trim() ? 'var(--primary)' : 'transparent',
                    color: inputValue.trim() ? 'white' : 'var(--muted-foreground)',
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
