import React, { useState, useEffect } from 'react';
import { Coin, WatchlistItem, SearchResult, BackgroundMessage, ApiResponse } from '../types';
import CoinDetail from './CoinDetail';

const App: React.FC = () => {
  const [watchlistCoins, setWatchlistCoins] = useState<Coin[]>([]);
  const [searchResults, setSearchResults] = useState<SearchResult[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [isLoading, setIsLoading] = useState(true);
  const [isSearching, setIsSearching] = useState(false);
  const [activeTab, setActiveTab] = useState<'watchlist' | 'search'>('watchlist');
  const [error, setError] = useState<string | null>(null);
  const [selectedCoin, setSelectedCoin] = useState<{ id: string; name: string } | null>(null);
  const [refreshSuccess, setRefreshSuccess] = useState(false);

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
      
      const response = await sendMessage({ type: 'GET_WATCHLIST_PRICES', forceRefresh });
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

  // 格式化价格
  const formatPrice = (price: number): string => {
    if (price >= 1) {
      return `$${price.toFixed(2)}`;
    } else {
      return `$${price.toFixed(6)}`;
    }
  };

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
  }, []);

  // 如果选择了币种，显示详情页
  if (selectedCoin) {
    return (
      <CoinDetail
        coinId={selectedCoin.id}
        coinName={selectedCoin.name}
        onBack={() => setSelectedCoin(null)}
        onPriceUpdate={handlePriceUpdate}
      />
    );
  }

  return (
    <div className="w-full h-full bg-slate-900 bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 text-slate-100 flex flex-col font-sans">
      {/* 头部 */}
      <div className="bg-slate-900 border-b border-white/10 z-10 sticky top-0">
        <div className="px-4 py-3 flex items-center justify-between">
          <h1 className="text-lg font-bold text-white tracking-wide">
            <span className="text-blue-500">Coin</span>Tracker
          </h1>
          {/* 刷新按钮移至头部 */}
          {activeTab === 'watchlist' && (
            <button
              onClick={() => loadWatchlistPrices(true)}
              disabled={isLoading}
              className={`flex items-center text-xs font-bold px-3 py-1.5 rounded-full transition-all ${
                refreshSuccess
                  ? 'text-emerald-400 bg-emerald-500/10'
                  : 'text-slate-300 hover:bg-slate-800 bg-slate-800/50'
              } disabled:opacity-50 border border-slate-700 hover:border-slate-600`}
            >
              <svg className={`w-3.5 h-3.5 ${isLoading ? 'animate-spin' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
              </svg>
            </button>
          )}
        </div>
        
        {/* 标签切换 */}
        <div className="flex px-2 pb-1 gap-2">
          <button
            onClick={() => setActiveTab('watchlist')}
            className={`flex-1 px-4 py-2 text-sm font-medium rounded-lg transition-all ${
              activeTab === 'watchlist'
                ? 'bg-blue-500/20 text-blue-400 shadow-sm border border-blue-500/30'
                : 'text-slate-400 hover:text-white hover:bg-white/5 border border-transparent'
            }`}
          >
            观察列表
          </button>
          <button
            onClick={() => setActiveTab('search')}
            className={`flex-1 px-4 py-2 text-sm font-medium rounded-lg transition-all ${
              activeTab === 'search'
                ? 'bg-blue-500/20 text-blue-400 shadow-sm border border-blue-500/30'
                : 'text-slate-400 hover:text-white hover:bg-white/5 border border-transparent'
            }`}
          >
            搜索添加
          </button>
        </div>
      </div>

      {/* 内容区域 */}
      <div className="flex-1 overflow-hidden relative">
        {activeTab === 'watchlist' ? (
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
                  <p className="text-xs font-medium text-blue-300">点击币种卡片查看详情走势图</p>
                </div>
              )}

              {!isLoading && !error && watchlistCoins.map((coin) => (
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
                <div className="p-12 mt-4 text-center text-slate-500">
                  <div className="w-16 h-16 rounded-full bg-white/5 flex items-center justify-center mx-auto mb-4 border border-white/5">
                     <svg className="w-6 h-6 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                    </svg>
                  </div>
                  <p className="text-sm font-medium">请输入币种名称或代码以开始</p>
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
    </div>
  );
};

export default App;
