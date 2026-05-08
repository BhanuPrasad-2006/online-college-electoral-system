'use client';

import { useState } from 'react';

export default function ManifestoEditor() {
  const [title, setTitle] = useState('');
  const [content, setContent] = useState('');
  const [isAnalyzing, setIsAnalyzing] = useState(false);

  const handleAnalyze = async () => {
    setIsAnalyzing(true);
    // TODO: Integrate with AI service
    console.log('Analyzing manifesto...');
    setTimeout(() => setIsAnalyzing(false), 2000);
  };

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
      {/* Editor */}
      <div className="lg:col-span-2 glass-card space-y-5">
        <div>
          <label htmlFor="manifesto-title" className="block text-sm font-medium text-surface-300 mb-2">
            Manifesto Title
          </label>
          <input
            id="manifesto-title"
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            className="input-field"
            placeholder="Your manifesto title..."
          />
        </div>

        <div>
          <label htmlFor="manifesto-content" className="block text-sm font-medium text-surface-300 mb-2">
            Content
          </label>
          <textarea
            id="manifesto-content"
            value={content}
            onChange={(e) => setContent(e.target.value)}
            className="input-field min-h-[400px] resize-y font-mono text-sm"
            placeholder="Write your manifesto here. Use markdown for formatting..."
          />
        </div>

        <div className="flex gap-4">
          <button className="btn-primary">Save Draft</button>
          <button className="btn-secondary" onClick={handleAnalyze} disabled={isAnalyzing}>
            {isAnalyzing ? '🔄 Analyzing...' : '🤖 AI Analysis'}
          </button>
        </div>
      </div>

      {/* AI Analysis Panel */}
      <div className="glass-card space-y-6">
        <h3 className="text-lg font-semibold text-surface-100">AI Analysis</h3>

        <div className="space-y-4">
          <div className="p-3 rounded-xl bg-surface-900">
            <p className="text-xs text-surface-500 mb-1">Sentiment Score</p>
            <div className="flex items-center gap-2">
              <div className="flex-1 h-2 bg-surface-800 rounded-full overflow-hidden">
                <div className="h-full w-3/4 gradient-primary rounded-full" />
              </div>
              <span className="text-sm font-bold text-surface-200">75%</span>
            </div>
          </div>

          <div className="p-3 rounded-xl bg-surface-900">
            <p className="text-xs text-surface-500 mb-1">Feasibility Score</p>
            <div className="flex items-center gap-2">
              <div className="flex-1 h-2 bg-surface-800 rounded-full overflow-hidden">
                <div className="h-full w-[60%] bg-gradient-to-r from-amber-500 to-orange-500 rounded-full" />
              </div>
              <span className="text-sm font-bold text-surface-200">60%</span>
            </div>
          </div>

          <div className="p-3 rounded-xl bg-surface-900">
            <p className="text-xs text-surface-500 mb-2">Key Themes</p>
            <div className="flex flex-wrap gap-1">
              {['Education', 'Infrastructure', 'Sports'].map((theme) => (
                <span key={theme} className="px-2 py-0.5 rounded-full text-xs bg-primary-500/10 text-primary-300">
                  {theme}
                </span>
              ))}
            </div>
          </div>

          <div className="p-3 rounded-xl bg-surface-900">
            <p className="text-xs text-surface-500 mb-2">AI Summary</p>
            <p className="text-sm text-surface-300">
              Submit your manifesto content to receive an AI-generated analysis with actionable insights.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
