'use client';

import { useState, useRef, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Brain, Send, Plus, Paperclip, Home, Menu } from 'lucide-react';
import Link from 'next/link';

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
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Mock previous chats data
  const previousChats: Chat[] = [
    {
      id: '1',
      title: 'Student Fight Incident',
      lastMessage: 'I need help classifying this incident...',
      timestamp: new Date(Date.now() - 2 * 60 * 60 * 1000) // 2 hours ago
    },
    {
      id: '2',
      title: 'Bullying Report',
      lastMessage: 'What are the compliance requirements...',
      timestamp: new Date(Date.now() - 24 * 60 * 60 * 1000) // 1 day ago
    },
    {
      id: '3',
      title: 'Disciplinary Action',
      lastMessage: 'Help me understand the process...',
      timestamp: new Date(Date.now() - 3 * 24 * 60 * 60 * 1000) // 3 days ago
    }
  ];

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  const handleSendMessage = async () => {
    if (!inputValue.trim() || isLoading) return;

    const userMessage: Message = {
      id: Date.now().toString(),
      type: 'user',
      content: inputValue,
      timestamp: new Date()
    };

    setMessages(prev => [...prev, userMessage]);
    setInputValue('');
    setIsLoading(true);

    // Simulate AI response
    setTimeout(() => {
      const aiMessage: Message = {
        id: (Date.now() + 1).toString(),
        type: 'general',
        content: "I understand you need help with this incident. Let me guide you through the compliance process step by step. Can you provide more details about what happened?",
        timestamp: new Date()
      };
      setMessages(prev => [...prev, aiMessage]);
      setIsLoading(false);
    }, 1500);
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSendMessage();
    }
  };

  const formatTime = (date: Date) => {
    return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  };

  const formatDate = (date: Date) => {
    const now = new Date();
    const diffInHours = (now.getTime() - date.getTime()) / (1000 * 60 * 60);
    
    if (diffInHours < 24) {
      return formatTime(date);
    } else if (diffInHours < 168) { // 7 days
      return date.toLocaleDateString([], { weekday: 'short' });
    } else {
      return date.toLocaleDateString([], { month: 'short', day: 'numeric' });
    }
  };

  return (
    <div style={{ minHeight: '100vh', backgroundColor: '#111827', display: 'flex' }}>
      {/* Sidebar - Fixed Width Left */}
      <div 
        style={{ 
          width: sidebarOpen ? '320px' : '0px',
          transition: 'width 0.3s ease-in-out',
          backgroundColor: '#1f2937',
          borderRight: '1px solid #374151',
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden'
        }}
      >
        {/* Sidebar Header */}
        <div style={{ padding: '1rem', borderBottom: '1px solid #374151' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1rem' }}>
            <h2 style={{ fontSize: '1.125rem', fontWeight: '600', color: 'white' }}>General Chat</h2>
            <button
              onClick={() => setSidebarOpen(false)}
              style={{
                background: 'none',
                border: 'none',
                color: '#9ca3af',
                cursor: 'pointer',
                padding: '0.25rem'
              }}
            >
              ×
            </button>
          </div>
        </div>
        
        {/* New Chat Button */}
        <div style={{ padding: '1rem' }}>
          <button
            style={{
              width: '100%',
              backgroundColor: '#059669',
              color: 'white',
              height: '3rem',
              fontSize: '1.125rem',
              border: 'none',
              borderRadius: '0.5rem',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '0.5rem'
            }}
          >
            <Plus size={24} />
          </button>
        </div>
        
        {/* Previous Chats */}
        <div style={{ flex: 1, overflowY: 'auto' }}>
          <div style={{ padding: '0.5rem', display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
            {previousChats.map((chat) => (
              <div
                key={chat.id}
                style={{
                  padding: '0.75rem',
                  borderRadius: '0.5rem',
                  cursor: 'pointer',
                  transition: 'background-color 0.2s',
                  backgroundColor: 'transparent'
                }}
                onMouseEnter={(e) => e.target.style.backgroundColor = '#374151'}
                onMouseLeave={(e) => e.target.style.backgroundColor = 'transparent'}
              >
                <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: '0.25rem' }}>
                  <h3 style={{ fontSize: '0.875rem', fontWeight: '500', color: 'white', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {chat.title}
                  </h3>
                  <span style={{ fontSize: '0.75rem', color: '#9ca3af', marginLeft: '0.5rem' }}>
                    {formatDate(chat.timestamp)}
                  </span>
                </div>
                <p style={{ fontSize: '0.75rem', color: '#9ca3af', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {chat.lastMessage}
                </p>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Main Chat Area - Flexible Right */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
        {/* Top Navbar */}
        <div style={{ backgroundColor: '#1f2937', borderBottom: '1px solid #374151', padding: '0.75rem 1rem', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
            {!sidebarOpen && (
              <button
                onClick={() => setSidebarOpen(true)}
                style={{
                  background: 'none',
                  border: 'none',
                  color: '#9ca3af',
                  cursor: 'pointer',
                  padding: '0.25rem'
                }}
              >
                <Menu size={16} />
              </button>
            )}
            <Link href="/" style={{ display: 'flex', alignItems: 'center', color: '#9ca3af', textDecoration: 'none' }}>
              <Home size={16} style={{ marginRight: '0.5rem' }} />
              Dashboard
            </Link>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <div style={{ width: '8px', height: '8px', backgroundColor: '#10b981', borderRadius: '50%' }}></div>
            <span style={{ fontSize: '0.875rem', color: '#9ca3af' }}>General Online</span>
          </div>
        </div>

        {/* Messages Area */}
        <div style={{ flex: 1, overflowY: 'auto' }}>
          {messages.length === 0 ? (
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100%', textAlign: 'center', padding: '2rem' }}>
              <div style={{ padding: '1rem', borderRadius: '1rem', background: 'linear-gradient(135deg, rgba(16, 185, 129, 0.2) 0%, rgba(59, 130, 246, 0.2) 100%)', marginBottom: '1.5rem' }}>
                <Brain size={48} color="#10b981" />
              </div>
              <h2 style={{ fontSize: '1.5rem', fontWeight: 'bold', color: 'white', marginBottom: '1rem' }}>Chat with the General</h2>
              <p style={{ color: '#9ca3af', maxWidth: '28rem' }}>
                I'm here to help you navigate complex disciplinary incident compliance requirements. 
                Describe your incident and I'll guide you through the process.
              </p>
            </div>
          ) : (
            <div style={{ maxWidth: '56rem', margin: '0 auto', padding: '1rem', display: 'flex', flexDirection: 'column', gap: '1rem' }}>
              {messages.map((message) => (
                <div
                  key={message.id}
                  style={{ display: 'flex', justifyContent: message.type === 'user' ? 'flex-end' : 'flex-start' }}
                >
                  <div
                    style={{
                      maxWidth: '48rem',
                      padding: '0.75rem 1rem',
                      borderRadius: '1rem',
                      backgroundColor: message.type === 'user' ? '#059669' : '#374151',
                      color: message.type === 'user' ? 'white' : '#f3f4f6'
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'flex-start', gap: '0.75rem' }}>
                      {message.type === 'general' && (
                        <div style={{ width: '2rem', height: '2rem', borderRadius: '50%', background: 'linear-gradient(135deg, #10b981 0%, #3b82f6 100%)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                          <Brain size={16} color="white" />
                        </div>
                      )}
                      <div style={{ flex: 1 }}>
                        <p style={{ fontSize: '0.875rem', lineHeight: '1.5' }}>{message.content}</p>
                        <p style={{ fontSize: '0.75rem', opacity: 0.7, marginTop: '0.5rem' }}>
                          {formatTime(message.timestamp)}
                        </p>
                      </div>
                    </div>
                  </div>
                </div>
              ))}
              
              {isLoading && (
                <div style={{ display: 'flex', justifyContent: 'flex-start' }}>
                  <div style={{ backgroundColor: '#374151', color: '#f3f4f6', padding: '0.75rem 1rem', borderRadius: '1rem' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                      <div style={{ width: '8px', height: '8px', backgroundColor: '#9ca3af', borderRadius: '50%', animation: 'bounce 1s infinite' }}></div>
                      <div style={{ width: '8px', height: '8px', backgroundColor: '#9ca3af', borderRadius: '50%', animation: 'bounce 1s infinite 0.1s' }}></div>
                      <div style={{ width: '8px', height: '8px', backgroundColor: '#9ca3af', borderRadius: '50%', animation: 'bounce 1s infinite 0.2s' }}></div>
                    </div>
                  </div>
                </div>
              )}
              
              <div ref={messagesEndRef} />
            </div>
          )}
        </div>

        {/* Input Area - Bottom of main chat */}
        <div style={{ borderTop: '1px solid #374151', padding: '1rem' }}>
          <div style={{ maxWidth: '56rem', margin: '0 auto' }}>
            <div style={{ display: 'flex', alignItems: 'flex-end', gap: '0.75rem' }}>
              <button
                style={{
                  background: 'none',
                  border: 'none',
                  color: '#9ca3af',
                  cursor: 'pointer',
                  padding: '0.5rem'
                }}
              >
                <Paperclip size={20} />
              </button>
              <div style={{ flex: 1, position: 'relative' }}>
                <textarea
                  value={inputValue}
                  onChange={(e) => setInputValue(e.target.value)}
                  onKeyPress={handleKeyPress}
                  placeholder="Describe your incident and I'll help you with compliance..."
                  style={{
                    width: '100%',
                    backgroundColor: '#1f2937',
                    border: '1px solid #4b5563',
                    borderRadius: '0.75rem',
                    padding: '0.75rem 1rem',
                    paddingRight: '3rem',
                    color: 'white',
                    resize: 'none',
                    minHeight: '48px',
                    maxHeight: '120px',
                    outline: 'none'
                  }}
                  rows={1}
                />
              </div>
              <button
                onClick={handleSendMessage}
                disabled={!inputValue.trim() || isLoading}
                style={{
                  backgroundColor: '#059669',
                  color: 'white',
                  padding: '0.75rem',
                  borderRadius: '0.75rem',
                  border: 'none',
                  cursor: inputValue.trim() && !isLoading ? 'pointer' : 'not-allowed',
                  opacity: inputValue.trim() && !isLoading ? 1 : 0.5
                }}
              >
                <Send size={20} />
              </button>
            </div>
            <p style={{ fontSize: '0.75rem', color: '#6b7280', marginTop: '0.5rem', textAlign: 'center' }}>
              Press Enter to send, Shift+Enter for new line
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}