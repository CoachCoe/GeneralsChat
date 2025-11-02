'use client';

import { useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Brain, Send, ArrowLeft, MessageCircle, FileText, Clock, CheckCircle } from 'lucide-react';
import Link from 'next/link';
import Navbar from '@/components/Navbar';

interface Message {
  id: string;
  type: 'user' | 'ai';
  content: string;
  timestamp: Date;
}

export default function NewIncidentPage() {
  const [messages, setMessages] = useState<Message[]>([
    {
      id: '1',
      type: 'ai',
      content: "Hello! I'm the General, your AI compliance assistant. I'll help you report and classify this incident properly. Please describe what happened in your own words, and I'll guide you through the process.",
      timestamp: new Date()
    }
  ]);
  const [inputValue, setInputValue] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [currentStep, setCurrentStep] = useState<'description' | 'classification' | 'compliance' | 'complete'>('description');

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
      const aiResponse: Message = {
        id: (Date.now() + 1).toString(),
        type: 'ai',
        content: getAIResponse(inputValue, currentStep),
        timestamp: new Date()
      };
      setMessages(prev => [...prev, aiResponse]);
      setIsLoading(false);
      
      // Update step based on conversation
      if (currentStep === 'description' && inputValue.length > 50) {
        setCurrentStep('classification');
      }
    }, 1500);
  };

  const getAIResponse = (input: string, step: string) => {
    const responses = {
      description: [
        "Thank you for that information. I can see this involves a student incident. Let me ask a few follow-up questions to better understand the situation: What was the approximate time and location of this incident?",
        "I understand. To properly classify this incident, could you tell me more about the individuals involved? Were there any witnesses present?",
        "Thank you for those details. Based on what you've described, I'm analyzing this against our school policies. Can you provide any additional context about the severity or impact of this incident?"
      ],
      classification: [
        "Based on your description, I'm classifying this as a Level 2 incident requiring immediate attention. This appears to involve bullying behavior that violates our student conduct policy.",
        "I've identified this as a potential Title IX matter based on the nature of the incident. I'll need to gather some additional information to ensure proper compliance procedures.",
        "This incident has been classified as a disciplinary matter requiring parent notification within 24 hours according to our policy guidelines."
      ],
      compliance: [
        "Perfect! I've completed the initial classification. Here are the required next steps: 1) Notify parents within 24 hours, 2) Complete investigation report within 5 days, 3) Schedule follow-up meeting. Would you like me to help you with any of these steps?",
        "I've identified the compliance requirements for this incident. The system will automatically track deadlines and send reminders. Is there anything specific you'd like me to clarify about the process?",
        "Great! I've documented everything and created a compliance timeline. The incident has been properly classified and all required actions have been identified. You can now proceed with the formal reporting process."
      ],
      complete: [
        "Excellent! Your incident report has been successfully processed. All compliance requirements have been identified and documented. You can now submit this report or continue with the formal documentation process.",
        "Perfect! The AI has completed the incident classification and compliance analysis. Your report is ready for submission with all necessary details properly documented."
      ]
    };

    const stepResponses = responses[step as keyof typeof responses] || responses.description;
    return stepResponses[Math.floor(Math.random() * stepResponses.length)];
  };

  const getStepIcon = (step: string) => {
    switch (step) {
      case 'description': return <MessageCircle className="h-5 w-5" />;
      case 'classification': return <FileText className="h-5 w-5" />;
      case 'compliance': return <Clock className="h-5 w-5" />;
      case 'complete': return <CheckCircle className="h-5 w-5" />;
      default: return <MessageCircle className="h-5 w-5" />;
    }
  };

  const getStepTitle = (step: string) => {
    switch (step) {
      case 'description': return 'Incident Description';
      case 'classification': return 'AI Classification';
      case 'compliance': return 'Compliance Analysis';
      case 'complete': return 'Report Complete';
      default: return 'Incident Description';
    }
  };

  return (
    <div className="min-h-screen gradient-bg">
      <Navbar />
      <div className="container mx-auto px-6 py-8">
        {/* Header */}
        <div className="flex items-center justify-between mb-8">
          <Link href="/" className="flex items-center text-gray-400 hover:text-white transition-colors">
            <ArrowLeft className="h-5 w-5 mr-2" />
            Back to Dashboard
          </Link>
          <div className="text-center">
            <h1 className="text-3xl font-bold text-white mb-2">Chat with the General</h1>
            <p className="text-gray-400">Let the General guide you through the incident reporting process</p>
          </div>
          <div className="w-24"></div> {/* Spacer for centering */}
        </div>

        <div className="max-w-4xl mx-auto">
          {/* Progress Steps */}
          <div className="mb-8">
            <div className="flex items-center justify-between">
              {['description', 'classification', 'compliance', 'complete'].map((step, index) => (
                <div key={step} className="flex items-center">
                  <div className={`flex items-center justify-center w-12 h-12 rounded-full border-2 transition-all ${
                    currentStep === step 
                      ? 'border-green-400 bg-green-400/20 text-green-400' 
                      : index < ['description', 'classification', 'compliance', 'complete'].indexOf(currentStep)
                      ? 'border-green-400 bg-green-400 text-white'
                      : 'border-gray-600 text-gray-600'
                  }`}>
                    {index < ['description', 'classification', 'compliance', 'complete'].indexOf(currentStep) ? (
                      <CheckCircle className="h-6 w-6" />
                    ) : (
                      getStepIcon(step)
                    )}
                  </div>
                  {index < 3 && (
                    <div className={`w-16 h-0.5 mx-4 ${
                      index < ['description', 'classification', 'compliance', 'complete'].indexOf(currentStep)
                        ? 'bg-green-400'
                        : 'bg-gray-600'
                    }`} />
                  )}
                </div>
              ))}
            </div>
            <div className="flex justify-between mt-4">
              {['description', 'classification', 'compliance', 'complete'].map((step) => (
                <div key={step} className="text-center">
                  <p className={`text-sm font-medium ${
                    currentStep === step ? 'text-white' : 'text-gray-500'
                  }`}>
                    {getStepTitle(step)}
                  </p>
                </div>
              ))}
            </div>
          </div>

          {/* Chat Interface */}
          <Card className="card-modern mb-6">
            <CardHeader className="pb-4">
              <CardTitle className="text-xl text-white flex items-center gap-3">
                <div className="p-2 rounded-lg bg-green-500/20">
                  <Brain className="h-5 w-5 text-green-400" />
                </div>
                Chat with the General
              </CardTitle>
              <CardDescription className="text-gray-400">
                Describe the incident and the General will help you through the compliance process
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-4 mb-6 max-h-96 overflow-y-auto">
                {messages.map((message) => (
                  <div
                    key={message.id}
                    className={`flex ${message.type === 'user' ? 'justify-end' : 'justify-start'}`}
                  >
                    <div
                      className={`max-w-xs lg:max-w-md px-4 py-3 rounded-2xl ${
                        message.type === 'user'
                          ? 'bg-gradient-to-r from-green-500 to-green-600 text-white'
                          : 'bg-gray-800/50 text-gray-100 border border-gray-700'
                      }`}
                    >
                      <p className="text-sm leading-relaxed">{message.content}</p>
                      <p className="text-xs opacity-70 mt-1">
                        {message.timestamp.toLocaleTimeString()}
                      </p>
                    </div>
                  </div>
                ))}
                {isLoading && (
                  <div className="flex justify-start">
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
                )}
              </div>

              {/* Input Area */}
              <div className="flex gap-3">
                <input
                  type="text"
                  value={inputValue}
                  onChange={(e) => setInputValue(e.target.value)}
                  onKeyPress={(e) => e.key === 'Enter' && handleSendMessage()}
                  placeholder="Describe the incident or ask a question..."
                  className="flex-1 px-4 py-3 bg-gray-800/50 border border-gray-700 rounded-xl text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-green-500/50 focus:border-green-500"
                  disabled={isLoading}
                />
                <Button
                  onClick={handleSendMessage}
                  disabled={!inputValue.trim() || isLoading}
                  className="btn-primary px-6"
                >
                  <Send className="h-4 w-4" />
                </Button>
              </div>
            </CardContent>
          </Card>

          {/* AI Analysis Card */}
          {currentStep !== 'description' && (
            <Card className="card-modern">
              <CardHeader>
                <CardTitle className="text-xl text-white flex items-center gap-3">
                  <div className="p-2 rounded-lg bg-blue-500/20">
                    <FileText className="h-5 w-5 text-blue-400" />
                  </div>
                  General&apos;s Analysis
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  <div className="p-4 rounded-lg bg-green-500/10 border border-green-500/20">
                    <h4 className="font-semibold text-green-400 mb-2">Incident Classification</h4>
                    <p className="text-sm text-gray-300">Level 2 - Disciplinary Matter</p>
                  </div>
                  <div className="p-4 rounded-lg bg-yellow-500/10 border border-yellow-500/20">
                    <h4 className="font-semibold text-yellow-400 mb-2">Required Actions</h4>
                    <ul className="text-sm text-gray-300 space-y-1">
                      <li>• Notify parents within 24 hours</li>
                      <li>• Complete investigation within 5 days</li>
                      <li>• Schedule follow-up meeting</li>
                    </ul>
                  </div>
                  <div className="p-4 rounded-lg bg-blue-500/10 border border-blue-500/20">
                    <h4 className="font-semibold text-blue-400 mb-2">Compliance Status</h4>
                    <p className="text-sm text-gray-300">All requirements identified and documented</p>
                  </div>
                </div>
              </CardContent>
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}