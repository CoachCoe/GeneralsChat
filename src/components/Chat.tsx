import React, { useState } from 'react';
import { AIService } from '../services/aiService';

const aiService = new AIService();

export default function Chat() {
  const [messages, setMessages] = useState<{ sender: 'user' | 'bot'; text: string }[]>([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);

  const sendMessage = async () => {
    if (!input.trim()) return;
    setMessages((msgs) => [...msgs, { sender: 'user', text: input }]);
    setLoading(true);
    const response = await aiService.getResponse(input);
    setMessages((msgs) => [...msgs, { sender: 'bot', text: response }]);
    setInput('');
    setLoading(false);
  };

  return (
    <div>
      <div>
        {messages.map((msg, idx) => (
          <div key={idx} style={{ textAlign: msg.sender === 'user' ? 'right' : 'left' }}>
            <b>{msg.sender === 'user' ? 'You' : 'Bot'}:</b> {msg.text}
          </div>
        ))}
        {loading && <div>Loading...</div>}
      </div>
      <input
        value={input}
        onChange={(e) => setInput(e.target.value)}
        onKeyDown={(e) => e.key === 'Enter' && sendMessage()}
        disabled={loading}
      />
      <button onClick={sendMessage} disabled={loading || !input.trim()}>
        Send
      </button>
    </div>
  );
} 