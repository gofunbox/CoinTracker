import React, { useState, useEffect } from 'react';
import { Coin, SearchResult, BackgroundMessage, ApiResponse, SupportedCurrency, WatchlistSort } from '../types';
import CoinDetail from './CoinDetail';
import Settings from './Settings';

const App: React.FC = () => {
  const [watchlistCoins, setWatchlistCoins] = useState<Coin[]>([]);
  const [searchResults, setSearchResults] = useState<SearchResult[]>([]);
  const [trendingCoins, setTrendingCoins] = useState<Coin[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [isLoading, setIsLoading] = useState(true);
  const [isSearching, setIsSearching] = useState(false);
  const [isTrendingLoading, setIsTrendingLoading] = useState(false);
  const [activeTab, setActiveTab] = useState<'watchlist' | 'search' | 'holdings'>('watchlist');
  const [error, setError] = useState<string | null>(null);
  const [selectedCoin, setSelectedCoin] = useState<{ id: string; name: string } | null>(null);
  const [editingAmountCoinId, setEditingAmountCoinId] = useState<string | null>(null);
  const [editAmountValue, setEditAmountValue] = useState('');
  const [editAlertPrice, setEditAlertPrice] = useState('');
  const [editAlertDirection, setEditAlertDirection] = useState<'above' | 'below'>('above');
  const [refreshSuccess, setRefreshSuccess] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [refreshCooldown, setRefreshCooldown] = useState(0);
  const [hideBalances, setHideBalances] = useState(() => localStorage.getItem('hideBalances') === 'true');
  const [timeframe, setTimeframe] = useState<'24h' | '30d' | '1y'>('24h');
  const [vsCurrency, setVsCurrency] = useState<SupportedCurrency>(() => (localStorage.getItem('vsCurrency') as SupportedCurrency) || 'usd');
  const [watchlistSort, setWatchlistSort] = useState<WatchlistSort>(() => (localStorage.getItem('watchlistSort') as WatchlistSort) || 'rank');

  const currencyLabels: Record<SupportedCurrency, { code: string; locale: string }> = {
    usd: { code: 'USD', locale: 'en-US' },
    cny: { code: 'CNY', locale: 'zh-CN' },
    hkd: { code: 'HKD', locale: 'zh-HK' },
    eur: { code: 'EUR', locale: 'de-DE' }
  };

  // 保存隐藏金额配置
  useEffect(() => {
    localStorage.setItem('hideBalances', hideBalances.toString());
  }, [hideBalances]);

  useEffect(() => {
    localStorage.setItem('vsCurrency', vsCurrency);
  }, [vsCurrency]);

  useEffect(() => {
    localStorage.setItem('watchlistSort', watchlistSort);
  }, [watchlistSort]);

  // 倒计时副作用
  useEffect(() => {
    if (refreshCooldown > 0) {
      const timer = setTimeout(() => setRefreshCooldown(c => c - 1), 1000);
      return () => clearTimeout(timer);
    }
  }, [refreshCooldown]);

  // 发送消息到背景脚本
  const sendMessage = (message: BackgroundMessage): Promise<ApiResponse<any>> => {
    return new Promise((resolve, reject) => {
      console.log('Sending message:', message);
      
      // 检查runtime是否可用
      if (!chrome.runtime) {
        console.error('Chrome runtime not available');
        reject(new Error('Chrome runtime not available'));
        return;
      }
      
      try {
        chrome.runtime.sendMessage(message, (response) => {
          // 检查是否有runtime错误
          if (chrome.runtime.lastError) {
            console.error('Runtime error:', chrome.runtime.lastError);
            reject(new Error(chrome.runtime.lastError.message));
            return;
          }
          
          console.log('Received response:', response);
          resolve(response || { success: false, error: 'No response received' });
        });
      } catch (error) {
        console.error('Error sending message:', error);
        reject(error);
      }
    });
  };

  // 加载观察列表数据
  const loadWatchlistPrices = async (forceRefresh: boolean = false) => {
    try {
      console.log(`Starting to load watchlist prices... (forceRefresh: ${forceRefresh})`);
      setIsLoading(true);
      setError(null);
      setRefreshSuccess(false);
      
      const response = await sendMessage({ type: 'GET_WATCHLIST_PRICES', forceRefresh, vsCurrency });
      console.log('Got watchlist response:', response);
      
      if (response.success && response.data) {
        setWatchlistCoins(response.data);
        setRefreshSuccess(true);
        console.log('Set watchlist coins:', response.data);
        
        // 2秒后隐藏成功提示
        setTimeout(() => {
          setRefreshSuccess(false);
        }, 2000);
      } else {
        console.error('Failed to load watchlist:', response.error);
        setError(response.error || '加载失败');
      }
    } catch (err) {
      console.error('Error loading watchlist:', err);
      setError(err instanceof Error ? err.message : '网络错误');
    } finally {
      setIsLoading(false);
    }
  };

  // 搜索币种
  const searchCoins = async (query: string) => {
    if (!query.trim()) {
      setSearchResults([]);
      return;
    }

    try {
      setIsSearching(true);
      const response = await sendMessage({ type: 'SEARCH_COINS', query });
      
      if (response.success && response.data) {
        setSearchResults(response.data.slice(0, 10)); // 限制显示10个结果
      } else {
        setSearchResults([]);
      }
    } catch (err) {
      setSearchResults([]);
    } finally {
      setIsSearching(false);
    }
  };

  const loadTrendingCoins = async () => {
    try {
      setIsTrendingLoading(true);
      const response = await sendMessage({ type: 'GET_TRENDING_COINS', vsCurrency });
      if (response.success && response.data) {
        setTrendingCoins(response.data.slice(0, 8));
      }
    } catch (err) {
      setTrendingCoins([]);
    } finally {
      setIsTrendingLoading(false);
    }
  };

  // 添加到观察列表
  const addToWatchlist = async (coinId: string) => {
    try {
      const response = await sendMessage({ type: 'ADD_TO_WATCHLIST', coinId });
      
      if (response.success) {
        // 重新加载观察列表
        await loadWatchlistPrices();
        // 切换到观察列表标签
        setActiveTab('watchlist');
      } else {
        alert(response.error || '添加失败');
      }
    } catch (err) {
      alert('添加失败');
    }
  };

  // 从观察列表移除
  const removeFromWatchlist = async (coinId: string) => {
    try {
      const response = await sendMessage({ type: 'REMOVE_FROM_WATCHLIST', coinId });
      
      if (response.success) {
        // 重新加载观察列表
        await loadWatchlistPrices();
      }
    } catch (err) {
      alert('移除失败');
    }
  };

  // 保存持仓数量
  const handleSaveAmount = async () => {
    if (!editingAmountCoinId) return;
    const amount = parseFloat(editAmountValue) || 0;
    const alertPrice = parseFloat(editAlertPrice) || 0;
    try {
      const response = await sendMessage({
        type: 'UPDATE_COIN_CONFIG',
        coinId: editingAmountCoinId,
        amount,
        alertPrice,
        alertDirection: alertPrice > 0 ? editAlertDirection : undefined,
        alertCurrency: vsCurrency
      });
      if (response.success) {
        await loadWatchlistPrices();
      } else {
        alert(response.error || '保存失败');
      }
    } catch (err) {
      alert('保存失败');
    } finally {
      setEditingAmountCoinId(null);
    }
  };

  const openCoinConfig = (coin: Coin) => {
    setEditingAmountCoinId(coin.id);
    setEditAmountValue((coin.amount || 0).toString());
    setEditAlertPrice(coin.alertPrice ? coin.alertPrice.toString() : '');
    setEditAlertDirection(coin.alertDirection || 'above');
  };

  // 格式化价格
  const formatPriceFor = (price: number, currency: SupportedCurrency = vsCurrency): string => {
    const meta = currencyLabels[currency];
    return new Intl.NumberFormat(meta.locale, {
      style: 'currency',
      currency: meta.code,
      minimumFractionDigits: price >= 1 ? 2 : 4,
      maximumFractionDigits: price >= 1 ? 2 : 6
    }).format(price || 0);
  };

  const formatPrice = (price: number): string => formatPriceFor(price, vsCurrency);

  // 格式化百分比
  const formatPercentage = (percentage: number): string => {
    const sign = percentage >= 0 ? '+' : '';
    return `${sign}${percentage.toFixed(2)}%`;
  };

  // 获取百分比颜色
  const getPercentageColor = (percentage: number): string => {
    return percentage >= 0 ? 'text-emerald-400' : 'text-rose-400';
  };

  // 同步列表页面的价格
  const handlePriceUpdate = (updateCoinId: string, currentPrice: number, priceChange24h: number) => {
    setWatchlistCoins(prevCoins => 
      prevCoins.map(coin => 
        coin.id === updateCoinId 
        ? { ...coin, current_price: currentPrice, price_change_percentage_24h: priceChange24h }
        : coin
      )
    );
  };

  // 搜索防抖
  useEffect(() => {
    const timer = setTimeout(() => {
      if (activeTab === 'search') {
        searchCoins(searchQuery);
      }
    }, 300);

    return () => clearTimeout(timer);
  }, [searchQuery, activeTab]);

  useEffect(() => {
    if (activeTab === 'search' && !searchQuery.trim() && trendingCoins.length === 0) {
      loadTrendingCoins();
    }
  }, [activeTab, searchQuery, vsCurrency]);

  // 初始化和定期更新
  useEffect(() => {
    console.log('App component mounted, checking service worker...');
    
    // 等待service worker准备就绪
    // 初始化应用，直接加载数据，无需等待PING
    // Chrome MV3 架构在发送消息时会自动唤醒 Service Worker
    loadWatchlistPrices();
    
    // 每2分钟更新一次（减少 API 请求频率）
    const interval = setInterval(() => {
      console.log('Auto refreshing prices...');
      loadWatchlistPrices();
    }, 120000);
    
    return () => clearInterval(interval);
  }, [vsCurrency]);

  // 如果显示设置页
  if (showSettings) {
    return <Settings onBack={() => setShowSettings(false)} />;
  }

  // 如果选择了币种，显示详情页
  if (selectedCoin) {
    return (
      <CoinDetail
        coinId={selectedCoin.id}
        coinName={selectedCoin.name}
        onBack={() => setSelectedCoin(null)}
        onPriceUpdate={handlePriceUpdate}
        vsCurrency={vsCurrency}
        formatPrice={formatPrice}
      />
    );
  }

  const holdings = watchlistCoins.filter(c => c.amount && c.amount > 0);
  let totalHoldingsUsd = 0;
  let totalHistoricalUsd = 0;

  holdings.forEach(coin => {
    const currentVal = (coin.current_price || 0) * (coin.amount || 0);
    totalHoldingsUsd += currentVal;

    let pctChange = 0;
    if (timeframe === '24h') pctChange = coin.price_change_percentage_24h_in_currency || coin.price_change_percentage_24h || 0;
    else if (timeframe === '30d') pctChange = coin.price_change_percentage_30d_in_currency || 0;
    else if (timeframe === '1y') pctChange = coin.price_change_percentage_1y_in_currency || 0;

    const factor = 1 + (pctChange / 100);
    const historicalVal = factor > 0 ? currentVal / factor : currentVal;
    totalHistoricalUsd += historicalVal;
  });

  const portfolioChangeUsd = totalHoldingsUsd - totalHistoricalUsd;
  const portfolioChangePct = totalHistoricalUsd > 0 ? (portfolioChangeUsd / totalHistoricalUsd) * 100 : 0;
  const portfolioChangeIsPositive = portfolioChangeUsd >= 0;

  const renderMasked = (val: string, mask: string = '******') => hideBalances ? mask : val;
  const sortedHoldings = [...holdings].sort((a, b) => ((b.current_price || 0) * (b.amount || 0)) - ((a.current_price || 0) * (a.amount || 0)));
  const sortedWatchlistCoins = [...watchlistCoins].sort((a, b) => {
    if (watchlistSort === 'priceChange') return (b.price_change_percentage_24h || 0) - (a.price_change_percentage_24h || 0);
    if (watchlistSort === 'holdingValue') return ((b.current_price || 0) * (b.amount || 0)) - ((a.current_price || 0) * (a.amount || 0));
    if (watchlistSort === 'name') return a.name.localeCompare(b.name);
    return (a.market_cap_rank || 999999) - (b.market_cap_rank || 999999);
  });

  return (
    <div className="w-full h-full bg-slate-900 bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 text-slate-100 flex flex-col font-sans">
      {/* 头部 */}
      <div className="bg-slate-900 border-b border-white/10 z-10 sticky top-0">
        <div className="px-4 py-3 flex items-center justify-between">
          <h1 className="text-lg font-bold text-white tracking-wide">
            <span className="text-blue-500">Coin</span>Tracker
          </h1>
          
          <div className="flex items-center space-x-2">
            <select
              value={vsCurrency}
              onChange={(e) => {
                setTrendingCoins([]);
                setVsCurrency(e.target.value as SupportedCurrency);
              }}
              className="bg-slate-800/80 border border-slate-700 rounded-lg text-[11px] font-bold text-slate-200 px-2 py-1.5 outline-none focus:border-blue-500/50"
              title="显示法币"
            >
              <option value="usd">USD</option>
              <option value="cny">CNY</option>
              <option value="hkd">HKD</option>
              <option value="eur">EUR</option>
            </select>
            {/* 刷新按钮移至头部 */}
            {activeTab === 'watchlist' && (
              <button
                onClick={() => {
                  if (refreshCooldown === 0) {
                    loadWatchlistPrices(true);
                    setRefreshCooldown(10);
                  }
                }}
                disabled={isLoading || refreshCooldown > 0}
                className={`flex items-center justify-center text-xs font-bold px-3 py-1.5 rounded-full transition-all ${
                  refreshSuccess
                    ? 'text-emerald-400 bg-emerald-500/10'
                    : 'text-slate-300 hover:bg-slate-800 bg-slate-800/50'
                } disabled:opacity-50 border border-slate-700 hover:border-slate-600 min-w-[36px]`}
              >
                {refreshCooldown > 0 ? (
                  <span className="text-[10px] tabular-nums font-mono">{refreshCooldown}s</span>
                ) : (
                  <svg className={`w-3.5 h-3.5 ${isLoading ? 'animate-spin' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                  </svg>
                )}
              </button>
            )}
            
            {/* 设置按钮 */}
            <button
               onClick={() => setShowSettings(true)}
               className="text-slate-400 hover:text-white p-1.5 rounded-full hover:bg-white/10 transition-all border border-transparent"
               title="高级设置"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
              </svg>
            </button>
          </div>
        </div>
        
        {/* 标签切换 */}
        <div className="flex px-2 pb-1 gap-2">
          <button
            onClick={() => setActiveTab('watchlist')}
            className={`flex-1 px-3 py-2 text-sm font-medium rounded-lg transition-all ${
              activeTab === 'watchlist'
                ? 'bg-blue-500/20 text-blue-400 shadow-sm border border-blue-500/30'
                : 'text-slate-400 hover:text-white hover:bg-white/5 border border-transparent'
            }`}
          >
            观察列表
          </button>
          <button
            onClick={() => setActiveTab('holdings')}
            className={`flex-1 px-3 py-2 text-sm font-medium rounded-lg transition-all ${
              activeTab === 'holdings'
                ? 'bg-blue-500/20 text-blue-400 shadow-sm border border-blue-500/30'
                : 'text-slate-400 hover:text-white hover:bg-white/5 border border-transparent'
            }`}
          >
            持仓
          </button>
          <button
            onClick={() => setActiveTab('search')}
            className={`flex-1 px-3 py-2 text-sm font-medium rounded-lg transition-all ${
              activeTab === 'search'
                ? 'bg-blue-500/20 text-blue-400 shadow-sm border border-blue-500/30'
                : 'text-slate-400 hover:text-white hover:bg-white/5 border border-transparent'
            }`}
          >
            搜索
          </button>
        </div>
      </div>

      {/* 内容区域 */}
      <div className="flex-1 overflow-hidden relative">
        {activeTab === 'holdings' ? (
          <div className="h-full flex flex-col relative z-10 w-full overflow-hidden">
            <div className="p-5 bg-gradient-to-r from-blue-900/40 to-slate-800/40 border-b border-white/5">
              <div className="flex justify-between items-center mb-2">
                <h2 className="text-slate-400 text-sm font-medium flex items-center">
                  总资产估值
                  <button 
                    onClick={() => setHideBalances(!hideBalances)} 
                    className="ml-2 text-slate-500 hover:text-slate-300 transition-colors focus:outline-none"
                    title={hideBalances ? "显示金额" : "隐藏金额"}
                  >
                    {hideBalances ? (
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l3.59 3.59m0 0A9.953 9.953 0 0112 5c4.478 0 8.268 2.943 9.543 7a10.025 10.025 0 01-4.132 5.411m0 0L21 21" /></svg>
                    ) : (
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" /></svg>
                    )}
                  </button>
                </h2>
                
                <div className="flex bg-black/20 rounded-lg p-0.5 border border-white/5">
                  <button onClick={() => setTimeframe('24h')} className={`px-2.5 py-1 text-xs font-medium rounded-md transition-all ${timeframe === '24h' ? 'bg-blue-500/20 text-blue-400' : 'text-slate-400 hover:text-slate-200'}`}>1天</button>
                  <button onClick={() => setTimeframe('30d')} className={`px-2.5 py-1 text-xs font-medium rounded-md transition-all ${timeframe === '30d' ? 'bg-blue-500/20 text-blue-400' : 'text-slate-400 hover:text-slate-200'}`}>1月</button>
                  <button onClick={() => setTimeframe('1y')} className={`px-2.5 py-1 text-xs font-medium rounded-md transition-all ${timeframe === '1y' ? 'bg-blue-500/20 text-blue-400' : 'text-slate-400 hover:text-slate-200'}`}>1年</button>
                </div>
              </div>

              <div className="text-3xl font-bold text-white tracking-tight shrink-0 flex items-baseline">
                {renderMasked(formatPrice(totalHoldingsUsd))}
              </div>

              {holdings.length > 0 && (
                <div className={`mt-2 text-sm font-medium flex items-center ${portfolioChangeIsPositive ? 'text-emerald-400' : 'text-rose-400'}`}>
                  {portfolioChangeIsPositive ? (
                    <svg className="w-4 h-4 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 10l7-7m0 0l7 7m-7-7v18" /></svg>
                  ) : (
                    <svg className="w-4 h-4 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M19 14l-7 7m0 0l-7-7m7 7V3" /></svg>
                  )}
                  {portfolioChangeIsPositive ? '+' : ''}{renderMasked(formatPrice(Math.abs(portfolioChangeUsd)))} ({portfolioChangeIsPositive ? '+' : ''}{renderMasked(portfolioChangePct.toFixed(2), '***')}%)
                </div>
              )}
            </div>
            <div className="flex-1 overflow-y-auto scrollbar-thin pb-4">
              {holdings.length === 0 ? (
                <div className="p-12 text-center text-slate-500 flex flex-col items-center">
                  <div className="w-16 h-16 rounded-full bg-white/5 flex items-center justify-center mx-auto mb-4 border border-white/5">
                    <svg className="w-8 h-8 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M3 10h18M7 15h1m4 0h1m-7 4h12a3 3 0 003-3V8a3 3 0 00-3-3H6a3 3 0 00-3 3v8a3 3 0 003 3z" />
                    </svg>
                  </div>
                  <p className="text-sm font-medium">暂无持仓</p>
                  <p className="text-xs mt-2">请在观察列表中点击配置按钮添加持仓数量</p>
                </div>
              ) : (
                sortedHoldings.map((coin) => (
                  <div key={coin.id} className="coin-card mx-3 my-3 p-4 rounded-xl bg-slate-800/80">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center flex-1 cursor-pointer" onClick={() => setSelectedCoin({ id: coin.id, name: coin.name })}>
                        <img 
                          src={coin.image} 
                          alt={coin.name} 
                          className="w-10 h-10 rounded-full mr-3 shadow-lg shadow-black/40" 
                          onError={(e) => {
                            e.currentTarget.src = 'data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iMzIiIGhlaWdodD0iMzIiIHZpZXdCb3g9IjAgMCAzMiAzMiIgZmlsbD0ibm9uZSIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj4KPGNpcmNsZSBjeD0iMTYiIGN5PSIxNiIgcj0iMTYiIGZpbGw9IiMzMzQxNTUiLz4KPHN2ZyB4PSI4IiB5PSI4IiB3aWR0aD0iMTYiIGhlaWdodD0iMTYiIHZpZXdCb3g9IjAgMCAyNCAyNCIgZmlsbD0ibm9uZSI+CjxwYXRoIGQ9Ik0xMiAyQzYuNDggMiAyIDYuNDggMiAxMlM2LjQ4IDIyIDEyIDIyIDIyIDE3LjUyIDIyIDEyUzE3LjUyIDIgMTIgMlpNMTIgMTZDMTAuODkgMTYgMTAgMTUuMTEgMTAgMTRTMTAuODkgMTIgMTIgMTJTMTQgMTIuODkgMTQgMTRTMTMuMTEgMTYgMTIgMTZaIiBmaWxsPSIjOThCREZGIi8+Cjwvc3ZnPgo8L3N2Zz4K';
                          }}
                        />
                        <div>
                          <div className="font-bold text-white text-base">{coin.symbol.toUpperCase()}</div>
                          <div className="text-xs text-slate-400">数量: {renderMasked(coin.amount?.toString() || '0', '***')}</div>
                        </div>
                      </div>
                      <div className="text-right mr-3 flex flex-col items-end">
                        <div className="font-bold text-white text-[15px]">
                          {renderMasked(formatPrice((coin.current_price || 0) * (coin.amount || 0)))}
                        </div>
                        <div className="text-xs text-slate-500">
                          {formatPrice(coin.current_price)}
                        </div>
                      </div>
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          openCoinConfig(coin);
                        }}
                        className="btn-glass bg-blue-500/20 hover:bg-blue-500/40 text-blue-400 px-3 py-1.5 rounded-lg text-xs font-bold transition-colors"
                      >
                        修改
                      </button>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        ) : activeTab === 'watchlist' ? (
          <div className="h-full flex flex-col relative z-10">
            {/* 去除了单独的刷新按钮行，以整合到上方头部 */}


            {/* 观察列表 */}
            <div className="flex-1 overflow-y-auto scrollbar-thin pb-4">
              {error && (
                <div className="m-4 p-4 rounded-xl bg-red-500/10 border border-red-500/20 text-center text-rose-400 text-sm">
                  {error}
                </div>
              )}
              
              {isLoading && !error && (
                <div className="flex flex-col items-center justify-center p-12">
                  <div className="loading-spinner mb-3"></div>
                  <span className="text-sm text-slate-400 font-medium tracking-wider">LOADING...</span>
                </div>
              )}

              {!isLoading && !error && watchlistCoins.length === 0 && (
                <div className="p-12 text-center text-slate-500 flex flex-col items-center">
                  <svg className="w-12 h-12 mb-4 opacity-20" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6" />
                  </svg>
                  <p className="text-base font-medium text-slate-400">暂无币种</p>
                  <p className="text-sm mt-2">点击"搜索添加"来关注您喜欢的数字资产</p>
                </div>
              )}

              {!isLoading && !error && watchlistCoins.length > 0 && (
                <div className="px-4 py-2 mb-2 mx-3 rounded-lg bg-blue-500/10 border border-blue-500/20 flex items-center">
                  <span className="text-lg mr-2">💡</span>
                  <p className="text-xs font-medium text-blue-300">点击币种卡片查看详情走势图，齿轮可配置持仓和价格提醒</p>
                </div>
              )}

              {!isLoading && !error && watchlistCoins.length > 0 && (
                <div className="mx-3 mb-3 flex items-center justify-between">
                  <span className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">排序</span>
                  <select
                    value={watchlistSort}
                    onChange={(e) => setWatchlistSort(e.target.value as WatchlistSort)}
                    className="bg-slate-800 border border-slate-700 rounded-lg text-xs text-slate-200 px-2 py-1.5 outline-none focus:border-blue-500/50"
                  >
                    <option value="rank">市值排名</option>
                    <option value="priceChange">24h 涨幅</option>
                    <option value="holdingValue">持仓市值</option>
                    <option value="name">名称</option>
                  </select>
                </div>
              )}

              {!isLoading && !error && sortedWatchlistCoins.map((coin) => (
                <div key={coin.id} className="coin-card mx-3 mb-3 p-4 rounded-xl bg-slate-800/80">
                  <div className="flex items-center justify-between">
                    <div 
                      className="flex items-center flex-1 cursor-pointer"
                      onClick={() => setSelectedCoin({ id: coin.id, name: coin.name })}
                    >
                      <img 
                        src={coin.image} 
                        alt={coin.name}
                        className="w-10 h-10 rounded-full mr-3 shadow-lg shadow-black/40"
                        onError={(e) => {
                          e.currentTarget.src = 'data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iMzIiIGhlaWdodD0iMzIiIHZpZXdCb3g9IjAgMCAzMiAzMiIgZmlsbD0ibm9uZSIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj4KPGNpcmNsZSBjeD0iMTYiIGN5PSIxNiIgcj0iMTYiIGZpbGw9IiMzMzQxNTUiLz4KPHN2ZyB4PSI4IiB5PSI4IiB3aWR0aD0iMTYiIGhlaWdodD0iMTYiIHZpZXdCb3g9IjAgMCAyNCAyNCIgZmlsbD0ibm9uZSI+CjxwYXRoIGQ9Ik0xMiAyQzYuNDggMiAyIDYuNDggMiAxMlM2LjQ4IDIyIDEyIDIyIDIyIDE3LjUyIDIyIDEyUzE3LjUyIDIgMTIgMlpNMTIgMTZDMTAuODkgMTYgMTAgMTUuMTEgMTAgMTRTMTAuODkgMTIgMTIgMTJTMTQgMTIuODkgMTQgMTRTMTMuMTEgMTYgMTIgMTZaIiBmaWxsPSIjOThCREZGIi8+Cjwvc3ZnPgo8L3N2Zz4K';
                        }}
                      />
                      <div className="flex-1">
                        <div className="flex items-baseline">
                          <span className="font-bold text-white text-base tracking-wide">{coin.symbol.toUpperCase()}</span>
                          <span className="ml-2 text-xs font-medium text-slate-400">{coin.name}</span>
                        </div>
                        <div className="text-[10px] uppercase font-bold tracking-wider text-slate-500 mt-0.5">
                          Rank #{coin.market_cap_rank}
                          {coin.alertPrice && coin.alertDirection && (
                            <span className="ml-2 text-amber-400 normal-case">
                              提醒 {coin.alertDirection === 'above' ? '高于' : '低于'} {formatPriceFor(coin.alertPrice, coin.alertCurrency || vsCurrency)}
                            </span>
                          )}
                        </div>
                      </div>
                    </div>
                    
                    <div className="text-right mr-3 flex flex-col items-end">
                      <div className="font-bold text-white text-[15px] tracking-tight">
                        {formatPrice(coin.current_price)}
                      </div>
                      <div className={`text-xs font-semibold px-1.5 py-0.5 rounded mt-0.5 ${
                        coin.price_change_percentage_24h >= 0 
                          ? 'bg-emerald-500/10 text-emerald-400' 
                          : 'bg-rose-500/10 text-rose-400'
                      }`}>
                        {formatPercentage(coin.price_change_percentage_24h)}
                      </div>
                    </div>
                    
                    <div className="flex items-center">
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          openCoinConfig(coin);
                        }}
                        className="text-slate-500 hover:text-blue-400 p-2 rounded-lg hover:bg-blue-500/10 transition-colors"
                        title="配置持仓"
                      >
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                        </svg>
                      </button>
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          if (window.confirm(`确定要从观察列表中移除 ${coin.name} (${coin.symbol.toUpperCase()}) 吗？`)) {
                            removeFromWatchlist(coin.id);
                          }
                        }}
                        className="text-slate-500 hover:text-rose-400 p-2 rounded-lg hover:bg-rose-500/10 transition-colors"
                        title="移除"
                      >
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                        </svg>
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        ) : (
          <div className="h-full flex flex-col relative z-10">
            {/* 搜索框 */}
            <div className="p-4 pt-5 pb-3 relative z-20">
              <div className="relative group">
                <input
                  type="text"
                  placeholder="搜索币种名称或代码 (如 btc)..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full pl-11 pr-4 py-3 bg-slate-800 border border-slate-700 rounded-xl focus:ring-2 focus:ring-blue-500/50 focus:border-blue-500/50 text-sm text-white placeholder-slate-500 transition-all shadow-inner focus:shadow-blue-500/10 outline-none"
                />
                <svg className="absolute left-3.5 top-3.5 w-4 h-4 text-slate-400 group-focus-within:text-blue-400 transition-colors" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                </svg>
              </div>
            </div>

            {/* 搜索结果 */}
            <div className="flex-1 overflow-y-auto scrollbar-thin pb-4">
              {isSearching && (
                 <div className="flex flex-col items-center justify-center p-12">
                 <div className="loading-spinner mb-3"></div>
                 <span className="text-sm text-slate-400 font-medium tracking-wider">SEARCHING...</span>
               </div>
              )}

              {!isSearching && searchQuery && searchResults.length === 0 && (
                <div className="p-12 text-center text-slate-500">
                  <p className="text-sm font-medium">未找到匹配的币种</p>
                </div>
              )}

              {!isSearching && !searchQuery && (
                <div className="px-3 pb-4">
                  <div className="px-1 pb-2 flex items-center justify-between">
                    <h2 className="text-xs font-bold uppercase tracking-wider text-slate-400">热门币种</h2>
                    {isTrendingLoading && <span className="text-[11px] text-slate-500">加载中...</span>}
                  </div>
                  {!isTrendingLoading && trendingCoins.length === 0 && (
                    <div className="p-8 text-center text-sm text-slate-500">暂无热门数据</div>
                  )}
                  {trendingCoins.map((coin) => (
                    <div key={coin.id} className="coin-card mb-2 p-3.5 rounded-xl bg-slate-800/80">
                      <div className="flex items-center justify-between">
                        <div
                          className="flex items-center flex-1 cursor-pointer"
                          onClick={() => setSelectedCoin({ id: coin.id, name: coin.name })}
                        >
                          <img
                            src={coin.image}
                            alt={coin.name}
                            className="w-8 h-8 rounded-full mr-3 shadow-md shadow-black/40"
                          />
                          <div className="flex-1">
                            <div className="flex items-baseline">
                              <span className="font-bold text-white tracking-wide">{coin.symbol.toUpperCase()}</span>
                              <span className="ml-2 text-xs font-medium text-slate-400">{coin.name}</span>
                            </div>
                            <div className="text-[10px] uppercase font-bold tracking-wider text-slate-500 mt-0.5">
                              Rank #{coin.market_cap_rank}
                            </div>
                          </div>
                        </div>
                        <div className="text-right mr-3">
                          <div className="text-xs font-bold text-white">{formatPrice(coin.current_price)}</div>
                          <div className={`text-[11px] font-semibold ${coin.price_change_percentage_24h >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                            {formatPercentage(coin.price_change_percentage_24h)}
                          </div>
                        </div>
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            addToWatchlist(coin.id);
                          }}
                          className="btn-glass bg-blue-500 hover:bg-blue-400 text-white px-3 py-1.5 rounded-lg text-xs font-bold tracking-wide shadow-lg shadow-blue-500/20"
                        >
                          关注
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {!isSearching && searchResults.map((coin) => (
                <div key={coin.id} className="coin-card mx-3 mb-2 p-3.5 rounded-xl bg-slate-800/80">
                  <div className="flex items-center justify-between">
                    <div 
                      className="flex items-center flex-1 cursor-pointer"
                      onClick={() => setSelectedCoin({ id: coin.id, name: coin.name })}
                    >
                      <img 
                        src={coin.thumb} 
                        alt={coin.name}
                        className="w-8 h-8 rounded-full mr-3 shadow-md shadow-black/40"
                        onError={(e) => {
                          e.currentTarget.src = 'data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iMzIiIGhlaWdodD0iMzIiIHZpZXdCb3g9IjAgMCAzMiAzMiIgZmlsbD0ibm9uZSIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj4KPGNpcmNsZSBjeD0iMTYiIGN5PSIxNiIgcj0iMTYiIGZpbGw9IiMzMzQxNTUiLz4KPHN2ZyB4PSI4IiB5PSI4IiB3aWR0aD0iMTYiIGhlaWdodD0iMTYiIHZpZXdCb3g9IjAgMCAyNCAyNCIgZmlsbD0ibm9uZSI+CjxwYXRoIGQ9Ik0xMiAyQzYuNDggMiAyIDYuNDggMiAxMlM2LjQ4IDIyIDEyIDIyIDIyIDE3LjUyIDIyIDEyUzE3LjUyIDIgMTIgMlpNMTIgMTZDMTAuODkgMTYgMTAgMTUuMTEgMTAgMTRTMTAuODkgMTIgMTIgMTJTMTQgMTIuODkgMTQgMTRTMTMuMTEgMTYgMTIgMTZaIiBmaWxsPSIjOThCREZGIi8+Cjwvc3ZnPgo8L3N2Zz4K';
                        }}
                      />
                      <div className="flex-1">
                        <div className="flex items-baseline">
                          <span className="font-bold text-white tracking-wide">{coin.symbol.toUpperCase()}</span>
                          <span className="ml-2 text-xs font-medium text-slate-400">{coin.name}</span>
                        </div>
                        {coin.market_cap_rank && (
                          <div className="text-[10px] uppercase font-bold tracking-wider text-slate-500 mt-0.5">
                            Rank #{coin.market_cap_rank}
                          </div>
                        )}
                      </div>
                    </div>
                    
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        addToWatchlist(coin.id);
                      }}
                      className="btn-glass bg-blue-500 hover:bg-blue-400 text-white px-4 py-1.5 rounded-lg text-xs font-bold tracking-wide shadow-lg shadow-blue-500/20"
                    >
                      关注 +
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
      
      {/* 配置持仓与提醒 */}
      {editingAmountCoinId && (
        <div className="absolute inset-0 z-50 bg-slate-900/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-slate-800 rounded-2xl border border-slate-700 p-5 w-full max-w-sm shadow-2xl">
            <h3 className="text-lg font-bold text-white mb-4">配置资产</h3>
            <label className="block text-[11px] font-semibold uppercase tracking-wider text-slate-400 mb-1.5">持仓数量</label>
            <input 
              type="number"
              value={editAmountValue}
              onChange={(e) => setEditAmountValue(e.target.value)}
              className="w-full bg-slate-900 border border-slate-700 rounded-xl px-4 py-3 text-white focus:ring-2 focus:ring-blue-500/50 focus:border-blue-500/50 outline-none mb-4"
              placeholder="输入持有数量"
              autoFocus
            />
            <div className="grid grid-cols-[1fr_auto] gap-2 mb-2">
              <div>
                <label className="block text-[11px] font-semibold uppercase tracking-wider text-slate-400 mb-1.5">提醒价格</label>
                <input
                  type="number"
                  value={editAlertPrice}
                  onChange={(e) => setEditAlertPrice(e.target.value)}
                  className="w-full bg-slate-900 border border-slate-700 rounded-xl px-4 py-3 text-white focus:ring-2 focus:ring-amber-500/40 focus:border-amber-500/50 outline-none"
                  placeholder={`${currencyLabels[vsCurrency].code} 价格，留空关闭`}
                />
              </div>
              <div>
                <label className="block text-[11px] font-semibold uppercase tracking-wider text-slate-400 mb-1.5">方向</label>
                <select
                  value={editAlertDirection}
                  onChange={(e) => setEditAlertDirection(e.target.value as 'above' | 'below')}
                  className="bg-slate-900 border border-slate-700 rounded-xl px-3 py-3 text-white outline-none focus:border-amber-500/50"
                >
                  <option value="above">高于</option>
                  <option value="below">低于</option>
                </select>
              </div>
            </div>
            <p className="text-[11px] text-slate-500 mb-5">提醒将按当前显示法币 {currencyLabels[vsCurrency].code} 保存，后台每 10 分钟检查一次。</p>
            <div className="flex gap-3">
              <button 
                onClick={() => {
                  setEditingAmountCoinId(null);
                  setEditAlertPrice('');
                }}
                className="flex-1 py-2.5 rounded-xl font-medium text-slate-300 bg-slate-700 hover:bg-slate-600 transition-colors"
              >
                取消
              </button>
              <button 
                onClick={handleSaveAmount}
                className="flex-1 py-2.5 rounded-xl font-bold text-white bg-blue-500 hover:bg-blue-400 transition-colors shadow-lg shadow-blue-500/20"
              >
                保存
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default App;
