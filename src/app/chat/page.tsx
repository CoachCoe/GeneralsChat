'use client';

import { useState, useRef, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Brain, Send, Plus, Paperclip, MessageSquare, Clock, Menu } from 'lucide-react';
import Link from 'next/link';

interface Message {
  id: string;
  type: 'user' | 'general';
  content: string;
  timestamp: Date;
}

export default function ChatPage() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [inputValue, setInputValue] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const messagesEndRef = useRef<HTMLDivElement>(null);

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

    // Simulate General's response
    setTimeout(() => {
      const generalResponse: Message = {
        id: (Date.now() + 1).toString(),
        type: 'general',
        content: "I understand. Let me help you with that. Can you provide more details about the incident you're reporting?",
        timestamp: new Date()
      };
      setMessages(prev => [...prev, generalResponse]);
      setIsLoading(false);
    }, 1500);
  };

  const formatTime = (date: Date) => {
    return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  };

  const startNewChat = () => {
    setMessages([]);
  };

  return (
    <div className="min-h-screen gradient-bg">
      <div className="flex h-screen">
        {/* Sidebar */}
        <div className={`${sidebarOpen ? 'w-80' : 'w-0'} transition-all duration-300 bg-gray-900/80 backdrop-blur-xl border-r border-white/10 overflow-hidden`}>
          <div className="p-4 border-b border-white/10">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-semibold text-white">Previous Chats</h2>
              <Button
                onClick={startNewChat}
                className="btn-primary px-3 py-2 text-sm"
              >
                <Plus className="h-4 w-4 mr-2" />
                New Chat
              </Button>
            </div>
          </div>
          
          <div className="flex-1 overflow-y-auto p-4 space-y-2">
            <div className="p-3 rounded-lg cursor-pointer transition-all bg-gray-800/30 hover:bg-gray-800/50 border border-transparent">
              <h3 className="font-medium text-white text-sm mb-2">Bullying Incident Report</h3>
              <p className="text-xs text-gray-400 mb-2">The General has classified this as a Level 2 incident...</p>
              <div className="flex items-center justify-between text-xs text-gray-500">
                <span className="flex items-center">
                  <MessageSquare className="h-3 w-3 mr-1" />
                  8
                </span>
                <span className="flex items-center">
                  <Clock className="h-3 w-3 mr-1" />
                  2h ago
                </span>
              </div>
            </div>
            
            <div className="p-3 rounded-lg cursor-pointer transition-all bg-gray-800/30 hover:bg-gray-800/50 border border-transparent">
              <h3 className="font-medium text-white text-sm mb-2">Title IX Investigation</h3>
              <p className="text-xs text-gray-400 mb-2">Based on the information provided, this requires...</p>
              <div className="flex items-center justify-between text-xs text-gray-500">
                <span className="flex items-center">
                  <MessageSquare className="h-3 w-3 mr-1" />
                  12
                </span>
                <span className="flex items-center">
                  <Clock className="h-3 w-3 mr-1" />
                  Yesterday
                </span>
              </div>
            </div>
          </div>
        </div>

        {/* Main Chat Area */}
        <div className="flex-1 flex flex-col">
          {/* Header */}
          <div className="p-4 border-b border-white/10 bg-gray-900/50 backdrop-blur-xl">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <Button
                  onClick={() => setSidebarOpen(!sidebarOpen)}
                  className="btn-secondary p-2"
                >
                  <Menu className="h-5 w-5" />
                </Button>
                <div>
                  <h1 className="text-lg font-semibold text-white">General Chat</h1>
                  <p className="text-sm text-gray-400">Your AI compliance assistant</p>
                </div>
              </div>
              <Link href="/" className="text-gray-400 hover:text-white transition-colors text-sm">
                Back to Dashboard
              </Link>
            </div>
          </div>

          {/* Messages Area */}
          <div className="flex-1 overflow-y-auto">
            {messages.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-full text-center p-8">
                <div className="p-4 rounded-2xl bg-gradient-to-r from-green-500/20 to-blue-500/20 w-fit mb-6">
                  <Brain className="h-8 w-8 text-green-400" />
                </div>
                <h2 className="text-xl font-semibold text-white mb-3">Welcome to General Chat</h2>
                <p className="text-gray-400 max-w-md mb-8">
                  I'm the General, your AI compliance assistant. I'm here to help you navigate incident reporting and ensure proper compliance procedures.
                </p>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3 max-w-2xl">
                  <div 
                    className="p-4 rounded-lg bg-gray-800/30 hover:bg-gray-800/50 border border-gray-700 cursor-pointer transition-all"
                    onClick={() => setInputValue("I need to report a bullying incident")}
                  >
                    <h3 className="font-medium text-white mb-1">Report an Incident</h3>
                    <p className="text-sm text-gray-400">Get help with incident classification</p>
                  </div>
                  <div 
                    className="p-4 rounded-lg bg-gray-800/30 hover:bg-gray-800/50 border border-gray-700 cursor-pointer transition-all"
                    onClick={() => setInputValue("What are the compliance requirements for Title IX?")}
                  >
                    <h3 className="font-medium text-white mb-1">Compliance Questions</h3>
                    <p className="text-sm text-gray-400">Ask about policies and procedures</p>
                  </div>
                </div>
              </div>
            ) : (
              <div className="max-w-4xl mx-auto p-4 space-y-6">
                {messages.map((message) => (
                  <div
                    key={message.id}
                    className={`flex ${message.type === 'user' ? 'justify-end' : 'justify-start'}`}
                  >
                    <div className={`max-w-3xl ${message.type === 'user' ? 'ml-12' : 'mr-12'}`}>
                      <div className="flex items-start gap-3">
                        {message.type === 'general' && (
                          <div className="p-2 rounded-lg bg-green-500/20 flex-shrink-0 mt-1">
                            <Brain className="h-5 w-5 text-green-400" />
                          </div>
                        )}
                        <div className="flex-1">
                          <div
                            className={`px-4 py-3 rounded-2xl ${
                              message.type === 'user'
                                ? 'bg-gradient-to-r from-green-500 to-green-600 text-white'
                                : 'bg-gray-800/50 text-gray-100 border border-gray-700'
                            }`}
                          >
                            <p className="text-sm leading-relaxed">{message.content}</p>
                          </div>
                          <p className="text-xs text-gray-500 mt-1 px-1">
                            {formatTime(message.timestamp)}
                          </p>
                        </div>
                        {message.type === 'user' && (
                          <div className="p-2 rounded-lg bg-gray-800/50 flex-shrink-0 mt-1">
                            <div className="w-5 h-5 rounded-full bg-gradient-to-r from-green-400 to-blue-500"></div>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                ))}
                {isLoading && (
                  <div className="flex justify-start">
                    <div className="flex items-start gap-3">
                      <div className="p-2 rounded-lg bg-green-500/20 flex-shrink-0 mt-1">
                        <Brain className="h-5 w-5 text-green-400" />
                      </div>
                      <div className="bg-gray-800/50 text-gray-100 border border-gray-700 px-4 py-3 rounded-2xl">
                        <div className="flex items-center space-x-2">
                          <div className="animate-pulse">The General is thinking...</div>
                          <div className="flex space-x-1">
                            <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce"></div>
                            <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '0.1s' }}></div>
                            <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '0.2s' }}></div>
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                )}
                <div ref={messagesEndRef} />
              </div>
            )}
          </div>

          {/* Input Area */}
          <div className="p-4 border-t border-white/10 bg-gray-900/50 backdrop-blur-xl">
            <div className="max-w-4xl mx-auto">
              <div className="flex gap-3">
                <div className="flex-1 relative">
                  <input
                    type="text"
                    value={inputValue}
                    onChange={(e) => setInputValue(e.target.value)}
                    onKeyPress={(e) => e.key === 'Enter' && !e.shiftKey && handleSendMessage()}
                    placeholder="Message the General..."
                    className="w-full px-4 py-3 bg-gray-800/50 border border-gray-700 rounded-xl text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-green-500/50 focus:border-green-500 pr-12"
                    disabled={isLoading}
                  />
                  <Button
                    onClick={handleSendMessage}
                    disabled={!inputValue.trim() || isLoading}
                    className="absolute right-2 top-1/2 transform -translate-y-1/2 btn-primary px-3 py-2"
                  >
                    <Send className="h-4 w-4" />
                  </Button>
                </div>
              </div>
              
              <p className="text-xs text-gray-500 mt-2 text-center">
                The General can help with incident classification, compliance guidance, and policy questions
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}