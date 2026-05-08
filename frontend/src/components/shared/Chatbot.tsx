'use client';

import { useState } from 'react';

export default function Chatbot() {
  const [isOpen, setIsOpen] = useState(false);
  const [messages, setMessages] = useState<{ role: 'user' | 'bot'; content: string }[]>([
    { role: 'bot', content: 'Hi! I\'m the Election Assistant. How can I help you today?' },
  ]);
  const [input, setInput] = useState('');

  const sendMessage = () => {
    if (!input.trim()) return;

    setMessages((prev) => [...prev, { role: 'user', content: input }]);
    // TODO: Integrate with AI service
    setMessages((prev) => [
      ...prev,
      { role: 'bot', content: 'Thanks for your question! I\'m processing your request...' },
    ]);
    setInput('');
  };

  return (
    <>
      {/* Floating Button */}
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="fixed bottom-6 right-6 z-50 w-14 h-14 rounded-full gradient-primary text-white text-2xl shadow-lg shadow-primary-500/30 hover:scale-110 transition-transform"
        id="chatbot-toggle"
      >
        {isOpen ? '✕' : '💬'}
      </button>

      {/* Chat Panel */}
      {isOpen && (
        <div className="fixed bottom-24 right-6 z-50 w-96 h-[500px] glass-card flex flex-col animate-slide-up">
          {/* Header */}
          <div className="pb-4 border-b border-surface-700">
            <h3 className="font-semibold text-surface-100">🤖 Election Assistant</h3>
            <p className="text-xs text-surface-500">Powered by AI</p>
          </div>

          {/* Messages */}
          <div className="flex-1 overflow-y-auto py-4 space-y-3">
            {messages.map((msg, i) => (
              <div key={i} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                <div
                  className={`max-w-[80%] px-4 py-2 rounded-2xl text-sm ${
                    msg.role === 'user'
                      ? 'bg-primary-500 text-white rounded-br-sm'
                      : 'bg-surface-800 text-surface-200 rounded-bl-sm'
                  }`}
                >
                  {msg.content}
                </div>
              </div>
            ))}
          </div>

          {/* Input */}
          <div className="pt-4 border-t border-surface-700 flex gap-2">
            <input
              type="text"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && sendMessage()}
              placeholder="Ask a question..."
              className="input-field text-sm"
              id="chatbot-input"
            />
            <button onClick={sendMessage} className="btn-primary !px-4 !py-2" id="chatbot-send">
              →
            </button>
          </div>
        </div>
      )}
    </>
  );
}
