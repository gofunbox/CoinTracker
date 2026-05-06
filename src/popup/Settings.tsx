import React, { useState, useEffect } from 'react';
import { BackgroundMessage, ApiResponse, SupabaseCloudStatus } from '../types';

interface SettingsProps {
  onBack: () => void;
}

const Settings: React.FC<SettingsProps> = ({ onBack }) => {
  const [apiKey, setApiKey] = useState('');
  const [showKey, setShowKey] = useState(false);
  const [status, setStatus] = useState<{ type: 'success' | 'error'; message: string } | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [cloudUrl, setCloudUrl] = useState('');
  const [cloudAnonKey, setCloudAnonKey] = useState('');
  const [cloudEmail, setCloudEmail] = useState('');
  const [cloudPassword, setCloudPassword] = useState('');
  const [cloudStatus, setCloudStatus] = useState<SupabaseCloudStatus | null>(null);
  const [cloudMessage, setCloudMessage] = useState<{ type: 'success' | 'error'; message: string } | null>(null);
  const [isCloudBusy, setIsCloudBusy] = useState(false);

  const sendMessage = <T,>(message: BackgroundMessage): Promise<ApiResponse<T>> => {
    return new Promise((resolve) => {
      chrome.runtime.sendMessage(message, (response: ApiResponse<T>) => {
        resolve(response || { success: false, error: 'No response received' });
      });
    });
  };

  const loadCloudStatus = async () => {
    const response = await sendMessage<SupabaseCloudStatus & { supabaseUrl?: string; supabaseAnonKey?: string }>({ type: 'GET_SUPABASE_STATUS' });
    if (response.success && response.data) {
      setCloudStatus(response.data);
      setCloudUrl(response.data.supabaseUrl || '');
      setCloudAnonKey(response.data.supabaseAnonKey || '');
    }
  };

  useEffect(() => {
    // Load current API key
    if (chrome.runtime) {
      chrome.runtime.sendMessage({ type: 'GET_API_KEY' } as BackgroundMessage, (response: ApiResponse<string>) => {
        if (response && response.success && response.data) {
          setApiKey(response.data);
        }
      });
      loadCloudStatus();
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

  const runCloudAction = async (message: BackgroundMessage, successText: string) => {
    setIsCloudBusy(true);
    setCloudMessage(null);
    const response = await sendMessage<any>(message);
    setIsCloudBusy(false);

    if (response.success) {
      setCloudMessage({ type: 'success', message: response.data?.message || successText });
      await loadCloudStatus();
    } else {
      setCloudMessage({ type: 'error', message: response.error || '操作失败' });
    }
  };

  const handleSaveCloudConfig = () => {
    runCloudAction({
      type: 'SAVE_SUPABASE_CONFIG',
      supabaseUrl: cloudUrl,
      supabaseAnonKey: cloudAnonKey
    }, 'Supabase 配置已保存');
  };

  const handleCloudSignUp = () => {
    runCloudAction({
      type: 'SUPABASE_SIGN_UP',
      email: cloudEmail,
      password: cloudPassword
    }, '注册成功，已尝试同步本地数据');
  };

  const handleCloudSignIn = () => {
    runCloudAction({
      type: 'SUPABASE_SIGN_IN',
      email: cloudEmail,
      password: cloudPassword
    }, '登录成功');
  };

  const handleResendConfirmation = () => {
    runCloudAction({
      type: 'SUPABASE_RESEND_CONFIRMATION',
      email: cloudEmail
    }, '确认邮件已重新发送，请检查邮箱');
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
              <div className="relative">
                <input
                  type="text"
                  value={
                    showKey 
                      ? apiKey 
                      : (apiKey.length > 10 
                          ? apiKey.slice(0, 10) + '••••••••••••••••••••' 
                          : (apiKey ? apiKey.slice(0, 3) + '••••••••••••' : ''))
                  }
                  onChange={(e) => {
                    const val = e.target.value;
                    // 如果改动后不包含保护圆点，说明是粘贴了新Key或者全部清空
                    if (!val.includes('•')) {
                      setApiKey(val);
                    } else if (val.length < (apiKey.length > 10 ? 30 : 15)) {
                      // 长度变短说明用户按了删除键，直接一键清空方便重新输入
                      setApiKey('');
                    }
                  }}
                  placeholder="CG-xxxxxxxxx..."
                  className="w-full pl-3 pr-10 py-2.5 bg-slate-900 border border-slate-700 rounded-lg text-sm text-white placeholder-slate-600 focus:outline-none focus:border-blue-500/50 focus:ring-1 focus:ring-blue-500/50 transition-all font-mono tracking-wide"
                />
                <button
                  type="button"
                  onClick={() => setShowKey(!showKey)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-300 transition-colors"
                  title={showKey ? "隐藏" : "显示"}
                >
                  {showKey ? (
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l3.59 3.59m0 0A9.953 9.953 0 0112 5c4.478 0 8.268 2.943 9.543 7a10.025 10.025 0 01-4.132 5.411m0 0L21 21" />
                    </svg>
                  ) : (
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                    </svg>
                  )}
                </button>
              </div>
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

        <div className="bg-slate-800/80 rounded-xl p-4 border border-white/10 shadow-lg shadow-black/20">
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-sm font-bold text-white">Supabase 云同步</h2>
            <span className={`text-[11px] font-semibold px-2 py-1 rounded-md ${
              cloudStatus?.signedIn
                ? 'bg-emerald-500/10 text-emerald-400'
                : cloudStatus?.configured
                  ? 'bg-amber-500/10 text-amber-400'
                  : 'bg-slate-700 text-slate-400'
            }`}>
              {cloudStatus?.signedIn ? '已登录' : cloudStatus?.configured ? '已配置' : '未配置'}
            </span>
          </div>
          <p className="text-xs text-slate-400 mb-4 leading-relaxed">
            Supabase 支持邮箱注册和登录。登录后会把关注列表、持仓数量、提醒设置和加密后的 CoinGecko Token 同步到你的数据库。
          </p>

          <div className="space-y-3">
            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1.5 uppercase tracking-wider">Project URL</label>
              <input
                type="url"
                value={cloudUrl}
                onChange={(e) => setCloudUrl(e.target.value)}
                placeholder="https://xxxx.supabase.co"
                className="w-full px-3 py-2.5 bg-slate-900 border border-slate-700 rounded-lg text-sm text-white placeholder-slate-600 focus:outline-none focus:border-blue-500/50 focus:ring-1 focus:ring-blue-500/50 transition-all"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1.5 uppercase tracking-wider">Anon Public Key</label>
              <input
                type="password"
                value={cloudAnonKey}
                onChange={(e) => setCloudAnonKey(e.target.value)}
                placeholder="eyJhbGciOi..."
                className="w-full px-3 py-2.5 bg-slate-900 border border-slate-700 rounded-lg text-sm text-white placeholder-slate-600 focus:outline-none focus:border-blue-500/50 focus:ring-1 focus:ring-blue-500/50 transition-all font-mono"
              />
            </div>

            <button
              onClick={handleSaveCloudConfig}
              disabled={isCloudBusy}
              className="w-full btn-glass bg-slate-700 hover:bg-slate-600 text-white px-4 py-2 rounded-lg text-xs font-bold tracking-wide disabled:opacity-50 transition-all"
            >
              保存 Supabase 配置
            </button>

            {cloudStatus?.signedIn ? (
              <>
                <div className="rounded-lg bg-emerald-500/10 border border-emerald-500/20 px-3 py-2">
                  <p className="text-xs font-semibold text-emerald-300">当前账号</p>
                  <p className="text-[11px] text-emerald-200/80 mt-0.5">{cloudStatus.email || cloudStatus.userId}</p>
                </div>

                <div className="grid grid-cols-3 gap-2 pt-2">
                  <button
                    onClick={() => runCloudAction({ type: 'SUPABASE_UPLOAD_LOCAL' }, '本地数据已上传到云端')}
                    disabled={isCloudBusy}
                    className="btn-glass bg-blue-500/20 hover:bg-blue-500/30 text-blue-300 px-2 py-2 rounded-lg text-[11px] font-bold disabled:opacity-50 transition-all"
                  >
                    上传本地
                  </button>
                  <button
                    onClick={() => runCloudAction({ type: 'SUPABASE_DOWNLOAD_CLOUD' }, '云端数据已恢复到本地')}
                    disabled={isCloudBusy}
                    className="btn-glass bg-amber-500/20 hover:bg-amber-500/30 text-amber-300 px-2 py-2 rounded-lg text-[11px] font-bold disabled:opacity-50 transition-all"
                  >
                    下载云端
                  </button>
                  <button
                    onClick={() => runCloudAction({ type: 'SUPABASE_SIGN_OUT' }, '已退出登录')}
                    disabled={isCloudBusy}
                    className="btn-glass bg-slate-700 hover:bg-slate-600 text-slate-200 px-2 py-2 rounded-lg text-[11px] font-bold disabled:opacity-50 transition-all"
                  >
                    退出
                  </button>
                </div>
              </>
            ) : (
              <div className="grid grid-cols-1 gap-3 pt-2 border-t border-white/5">
                <input
                  type="email"
                  value={cloudEmail}
                  onChange={(e) => setCloudEmail(e.target.value)}
                  placeholder="邮箱"
                  className="w-full px-3 py-2.5 bg-slate-900 border border-slate-700 rounded-lg text-sm text-white placeholder-slate-600 focus:outline-none focus:border-blue-500/50 focus:ring-1 focus:ring-blue-500/50 transition-all"
                />
                <input
                  type="password"
                  value={cloudPassword}
                  onChange={(e) => setCloudPassword(e.target.value)}
                  placeholder="密码"
                  className="w-full px-3 py-2.5 bg-slate-900 border border-slate-700 rounded-lg text-sm text-white placeholder-slate-600 focus:outline-none focus:border-blue-500/50 focus:ring-1 focus:ring-blue-500/50 transition-all"
                />
                <div className="grid grid-cols-2 gap-2">
                  <button
                    onClick={handleCloudSignUp}
                    disabled={isCloudBusy || !cloudEmail || !cloudPassword}
                    className="btn-glass bg-blue-500 hover:bg-blue-400 text-white px-4 py-2 rounded-lg text-xs font-bold tracking-wide shadow-lg shadow-blue-500/20 disabled:opacity-50 transition-all"
                  >
                    注册
                  </button>
                  <button
                    onClick={handleCloudSignIn}
                    disabled={isCloudBusy || !cloudEmail || !cloudPassword}
                    className="btn-glass bg-emerald-500 hover:bg-emerald-400 text-white px-4 py-2 rounded-lg text-xs font-bold tracking-wide shadow-lg shadow-emerald-500/20 disabled:opacity-50 transition-all"
                  >
                    登录
                  </button>
                </div>
                <button
                  onClick={handleResendConfirmation}
                  disabled={isCloudBusy || !cloudEmail}
                  className="btn-glass bg-amber-500/10 hover:bg-amber-500/20 text-amber-300 px-4 py-2 rounded-lg text-xs font-bold tracking-wide border border-amber-500/20 disabled:opacity-50 transition-all"
                >
                  重发确认邮件
                </button>
                <p className="text-[11px] text-slate-500 leading-relaxed">
                  如果登录提示 Email not confirmed，请先点击邮箱里的确认链接；测试阶段也可以在 Supabase Authentication 的 Email 设置里关闭邮箱确认。
                </p>
              </div>
            )}

            {cloudMessage && (
              <p className={`text-[11px] ${cloudMessage.type === 'success' ? 'text-emerald-400' : 'text-rose-400'}`}>
                {cloudMessage.message}
              </p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default Settings;
