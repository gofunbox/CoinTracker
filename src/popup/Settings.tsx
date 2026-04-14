import React, { useState, useEffect } from 'react';
import { BackgroundMessage, ApiResponse } from '../types';

interface SettingsProps {
  onBack: () => void;
}

const Settings: React.FC<SettingsProps> = ({ onBack }) => {
  const [apiKey, setApiKey] = useState('');
  const [status, setStatus] = useState<{ type: 'success' | 'error'; message: string } | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    // Load current API key
    if (chrome.runtime) {
      chrome.runtime.sendMessage({ type: 'GET_API_KEY' } as BackgroundMessage, (response: ApiResponse<string>) => {
        if (response && response.success && response.data) {
          setApiKey(response.data);
        }
      });
    }
  }, []);

  const handleSave = () => {
    setIsSaving(true);
    setStatus(null);
    chrome.runtime.sendMessage({ type: 'SAVE_API_KEY', apiKey: apiKey.trim() } as BackgroundMessage, (response: ApiResponse<any>) => {
      setIsSaving(false);
      if (response && response.success) {
        setStatus({ type: 'success', message: '保存成功！' });
        setTimeout(() => setStatus(null), 3000);
      } else {
        setStatus({ type: 'error', message: '保存失败，请重试' });
      }
    });
  };

  return (
    <div className="w-full h-full bg-slate-900 bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 text-slate-100 flex flex-col font-sans">
      {/* 头部 */}
      <div className="bg-slate-900 border-b border-white/10 z-10 sticky top-0">
        <div className="px-4 py-3 flex items-center">
          <button
            onClick={onBack}
            className="mr-3 text-slate-400 hover:text-white transition-colors"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M15 19l-7-7 7-7" />
            </svg>
          </button>
          <h1 className="text-lg font-bold text-white tracking-wide">高级设置</h1>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-4 space-y-6">
        <div className="bg-slate-800/80 rounded-xl p-4 border border-white/10 shadow-lg shadow-black/20">
          <h2 className="text-sm font-bold text-white mb-3">CoinGecko API 配置</h2>
          <p className="text-xs text-slate-400 mb-4 leading-relaxed">
            配置个人的 API Key 可以大幅提升刷新频率限额，彻底解决 <strong>Rate Limit</strong> (429) 限流问题。
          </p>
          
          <div className="space-y-3">
            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1.5 uppercase tracking-wider">
                Demo API Key
              </label>
              <input
                type="text"
                value={apiKey}
                onChange={(e) => setApiKey(e.target.value)}
                placeholder="CG-xxxxxxxxx..."
                className="w-full px-3 py-2.5 bg-slate-900 border border-slate-700 rounded-lg text-sm text-white placeholder-slate-600 focus:outline-none focus:border-blue-500/50 focus:ring-1 focus:ring-blue-500/50 transition-all font-mono"
              />
            </div>
            
            <div className="flex items-center justify-between pt-2">
              <p className="text-[11px] text-slate-500 flex-1">
                {status && (
                  <span className={status.type === 'success' ? 'text-emerald-400' : 'text-rose-400'}>
                    {status.message}
                  </span>
                )}
              </p>
              <button
                onClick={handleSave}
                disabled={isSaving}
                className="btn-glass bg-blue-500 hover:bg-blue-400 text-white px-5 py-2 rounded-lg text-xs font-bold tracking-wide shadow-lg shadow-blue-500/20 disabled:opacity-50 transition-all"
              >
                {isSaving ? '保存中...' : '保存'}
              </button>
            </div>
          </div>
        </div>

        <div className="bg-blue-500/10 rounded-xl p-4 border border-blue-500/20">
          <h3 className="text-sm font-bold text-blue-400 mb-2 flex items-center">
            <svg className="w-4 h-4 mr-1.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            如何获取免费的 API Key？
          </h3>
          <ol className="list-decimal list-inside text-xs text-blue-200/80 space-y-2 leading-relaxed ml-1">
            <li>访问 <a href="https://www.coingecko.com/en/api" target="_blank" rel="noreferrer" className="text-blue-400 hover:text-blue-300 underline underline-offset-2">CoinGecko Demo API</a> 页面。</li>
            <li>注册或登录您的免费账号。</li>
            <li>进入开发者面板 (Developer Dashboard)，点击 "Add New Key"。</li>
            <li>将生成的 Key 复制并粘贴到上方输入框中保存。</li>
          </ol>
        </div>
      </div>
    </div>
  );
};

export default Settings;
