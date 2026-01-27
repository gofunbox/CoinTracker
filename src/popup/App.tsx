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
  const loadWatchlistPrices = async () => {
    try {
      console.log('Starting to load watchlist prices...');
      setIsLoading(true);
      setError(null);
      setRefreshSuccess(false);
      
      const response = await sendMessage({ type: 'GET_WATCHLIST_PRICES' });
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
    return percentage >= 0 ? 'text-green-600' : 'text-red-600';
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
    const initializeApp = async () => {
      try {
        // 发送一个简单的ping消息来检查service worker是否准备就绪
        await new Promise((resolve, reject) => {
          const timeout = setTimeout(() => {
            reject(new Error('Service worker timeout'));
          }, 5000);
          
          chrome.runtime.sendMessage({ type: 'PING' }, (response) => {
            clearTimeout(timeout);
            if (chrome.runtime.lastError) {
              console.log('Service worker not ready, waiting...');
              // Service worker可能还在启动中，稍后重试
              setTimeout(() => resolve(undefined), 1000);
            } else {
              console.log('Service worker ready');
              resolve(response);
            }
          });
        });
        
        console.log('Service worker ready, loading initial data...');
        loadWatchlistPrices();
      } catch (error) {
        console.error('Error initializing app:', error);
        // 即使ping失败，也尝试加载数据
        loadWatchlistPrices();
      }
    };
    
    initializeApp();
    
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
      />
    );
  }

  return (
    <div className="w-full h-full bg-gray-50 flex flex-col">
      {/* 头部 */}
      <div className="bg-white shadow-sm border-b">
        <div className="px-4 py-3">
          <h1 className="text-lg font-semibold text-gray-900">CoinTracker</h1>
        </div>
        
        {/* 标签切换 */}
        <div className="flex border-b">
          <button
            onClick={() => setActiveTab('watchlist')}
            className={`flex-1 px-4 py-2 text-sm font-medium ${
              activeTab === 'watchlist'
                ? 'text-blue-600 border-b-2 border-blue-600'
                : 'text-gray-500 hover:text-gray-700'
            }`}
          >
            观察列表
          </button>
          <button
            onClick={() => setActiveTab('search')}
            className={`flex-1 px-4 py-2 text-sm font-medium ${
              activeTab === 'search'
                ? 'text-blue-600 border-b-2 border-blue-600'
                : 'text-gray-500 hover:text-gray-700'
            }`}
          >
            搜索添加
          </button>
        </div>
      </div>

      {/* 内容区域 */}
      <div className="flex-1 overflow-hidden">
        {activeTab === 'watchlist' ? (
          <div className="h-full flex flex-col">
            {/* 刷新按钮 */}
            <div className="px-4 py-2 border-b bg-white">
              <button
                onClick={loadWatchlistPrices}
                disabled={isLoading}
                className={`flex items-center text-sm transition-colors ${
                  refreshSuccess
                    ? 'text-green-600 hover:text-green-700'
                    : 'text-blue-600 hover:text-blue-700'
                } disabled:opacity-50`}
              >
                {refreshSuccess ? (
                  <svg className="w-4 h-4 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                  </svg>
                ) : (
                  <svg className={`w-4 h-4 mr-1 ${isLoading ? 'animate-spin' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                  </svg>
                )}
                {refreshSuccess ? '刷新成功' : isLoading ? '刷新中...' : '刷新价格'}
              </button>
            </div>

            {/* 观察列表 */}
            <div className="flex-1 overflow-y-auto scrollbar-thin">
              {error && (
                <div className="p-4 text-center text-red-600 text-sm">
                  {error}
                </div>
              )}
              
              {isLoading && !error && (
                <div className="flex items-center justify-center p-8">
                  <div className="loading-spinner"></div>
                  <span className="ml-2 text-sm text-gray-600">加载中...</span>
                </div>
              )}

              {!isLoading && !error && watchlistCoins.length === 0 && (
                <div className="p-8 text-center text-gray-500">
                  <p className="text-sm">暂无币种</p>
                  <p className="text-xs mt-1">点击"搜索添加"来添加关注的币种</p>
                </div>
              )}

              {!isLoading && !error && watchlistCoins.length > 0 && (
                <div className="px-4 py-2 bg-blue-50 border-b">
                  <p className="text-xs text-blue-600">💡 点击币种名称查看K线图详情</p>
                </div>
              )}

              {!isLoading && !error && watchlistCoins.map((coin) => (
                <div key={coin.id} className="coin-card p-4 border-b bg-white hover:bg-gray-50">
                  <div className="flex items-center justify-between">
                    <div 
                      className="flex items-center flex-1 cursor-pointer"
                      onClick={() => setSelectedCoin({ id: coin.id, name: coin.name })}
                    >
                      <img 
                        src={coin.image} 
                        alt={coin.name}
                        className="w-8 h-8 rounded-full mr-3"
                        onError={(e) => {
                          e.currentTarget.src = 'data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iMzIiIGhlaWdodD0iMzIiIHZpZXdCb3g9IjAgMCAzMiAzMiIgZmlsbD0ibm9uZSIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj4KPGNpcmNsZSBjeD0iMTYiIGN5PSIxNiIgcj0iMTYiIGZpbGw9IiNGM0Y0RjYiLz4KPHN2ZyB4PSI4IiB5PSI4IiB3aWR0aD0iMTYiIGhlaWdodD0iMTYiIHZpZXdCb3g9IjAgMCAyNCAyNCIgZmlsbD0ibm9uZSI+CjxwYXRoIGQ9Ik0xMiAyQzYuNDggMiAyIDYuNDggMiAxMlM2LjQ4IDIyIDEyIDIyIDIyIDE3LjUyIDIyIDEyUzE3LjUyIDIgMTIgMlpNMTIgMTZDMTAuODkgMTYgMTAgMTUuMTEgMTAgMTRTMTAuODkgMTIgMTIgMTJTMTQgMTIuODkgMTQgMTRTMTMuMTEgMTYgMTIgMTZaIiBmaWxsPSIjOUIwN0VGIi8+Cjwvc3ZnPgo8L3N2Zz4K';
                        }}
                      />
                      <div className="flex-1">
                        <div className="flex items-center">
                          <span className="font-medium text-gray-900">{coin.symbol.toUpperCase()}</span>
                          <span className="ml-2 text-xs text-gray-500">{coin.name}</span>
                        </div>
                        <div className="text-xs text-gray-400">
                          #{coin.market_cap_rank}
                        </div>
                      </div>
                    </div>
                    
                    <div className="text-right mr-3">
                      <div className="font-medium text-gray-900">
                        {formatPrice(coin.current_price)}
                      </div>
                      <div className={`text-xs ${getPercentageColor(coin.price_change_percentage_24h)}`}>
                        {formatPercentage(coin.price_change_percentage_24h)}
                      </div>
                    </div>
                    
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        // 添加确认对话框
                        if (window.confirm(`确定要从观察列表中移除 ${coin.name} (${coin.symbol.toUpperCase()}) 吗？`)) {
                          removeFromWatchlist(coin.id);
                        }
                      }}
                      className="text-red-500 hover:text-red-700 p-1"
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
          <div className="h-full flex flex-col">
            {/* 搜索框 */}
            <div className="p-4 border-b bg-white">
              <div className="relative">
                <input
                  type="text"
                  placeholder="搜索币种名称或代码..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent text-sm"
                />
                <svg className="absolute left-3 top-2.5 w-4 h-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                </svg>
              </div>
            </div>

            {/* 搜索结果 */}
            <div className="flex-1 overflow-y-auto scrollbar-thin">
              {isSearching && (
                <div className="flex items-center justify-center p-8">
                  <div className="loading-spinner"></div>
                  <span className="ml-2 text-sm text-gray-600">搜索中...</span>
                </div>
              )}

              {!isSearching && searchQuery && searchResults.length === 0 && (
                <div className="p-8 text-center text-gray-500">
                  <p className="text-sm">未找到相关币种</p>
                </div>
              )}

              {!isSearching && !searchQuery && (
                <div className="p-8 text-center text-gray-500">
                  <p className="text-sm">请输入币种名称或代码</p>
                </div>
              )}

              {!isSearching && searchResults.map((coin) => (
                <div key={coin.id} className="coin-card p-4 border-b bg-white hover:bg-gray-50">
                  <div className="flex items-center justify-between">
                    <div 
                      className="flex items-center flex-1 cursor-pointer"
                      onClick={() => setSelectedCoin({ id: coin.id, name: coin.name })}
                    >
                      <img 
                        src={coin.thumb} 
                        alt={coin.name}
                        className="w-8 h-8 rounded-full mr-3"
                        onError={(e) => {
                          e.currentTarget.src = 'data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iMzIiIGhlaWdodD0iMzIiIHZpZXdCb3g9IjAgMCAzMiAzMiIgZmlsbD0ibm9uZSIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj4KPGNpcmNsZSBjeD0iMTYiIGN5PSIxNiIgcj0iMTYiIGZpbGw9IiNGM0Y0RjYiLz4KPHN2ZyB4PSI4IiB5PSI4IiB3aWR0aD0iMTYiIGhlaWdodD0iMTYiIHZpZXdCb3g9IjAgMCAyNCAyNCIgZmlsbD0ibm9uZSI+CjxwYXRoIGQ9Ik0xMiAyQzYuNDggMiAyIDYuNDggMiAxMlM2LjQ4IDIyIDEyIDIyIDIyIDE3LjUyIDIyIDEyUzE3LjUyIDIgMTIgMlpNMTIgMTZDMTAuODkgMTYgMTAgMTUuMTEgMTAgMTRTMTAuODkgMTIgMTIgMTJTMTQgMTIuODkgMTQgMTRTMTMuMTEgMTYgMTIgMTZaIiBmaWxsPSIjOUIwN0VGIi8+Cjwvc3ZnPgo8L3N2Zz4K';
                        }}
                      />
                      <div className="flex-1">
                        <div className="flex items-center">
                          <span className="font-medium text-gray-900">{coin.symbol.toUpperCase()}</span>
                          <span className="ml-2 text-xs text-gray-500">{coin.name}</span>
                        </div>
                        {coin.market_cap_rank && (
                          <div className="text-xs text-gray-400">
                            #{coin.market_cap_rank}
                          </div>
                        )}
                      </div>
                    </div>
                    
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        addToWatchlist(coin.id);
                      }}
                      className="bg-blue-500 hover:bg-blue-600 text-white px-3 py-1 rounded text-xs font-medium"
                    >
                      添加
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
