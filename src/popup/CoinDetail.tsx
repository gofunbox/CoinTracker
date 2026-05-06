import React, { useEffect, useRef, useState } from 'react';
import { BackgroundMessage, ApiResponse, SupportedCurrency } from '../types';

// 动态导入图表库类型
type IChartApi = any;
type ISeriesApi<T> = any;
type LineData = any;

interface CoinDetailProps {
  coinId: string;
  coinName: string;
  onBack: () => void;
  onPriceUpdate?: (coinId: string, currentPrice: number, priceChange24h: number) => void;
  vsCurrency: SupportedCurrency;
  formatPrice: (price: number) => string;
}

const CoinDetail: React.FC<CoinDetailProps> = ({ coinId, coinName, onBack, onPriceUpdate, vsCurrency, formatPrice }) => {
  const chartContainerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const areaSeriesRef = useRef<ISeriesApi<'Area'> | null>(null);
  const chartDataRef = useRef<any[] | null>(null);
  
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [coinDetails, setCoinDetails] = useState<any>(null);
  const [timeframe, setTimeframe] = useState<number>(30);
  const [chartInterval, setChartInterval] = useState<'daily' | 'weekly'>('daily');

  console.log('CoinDetail: Component rendering', { coinId, coinName });

  // 发送消息到背景脚本
  const sendMessage = (message: BackgroundMessage): Promise<ApiResponse<any>> => {
    return new Promise((resolve, reject) => {
      console.log('CoinDetail: Sending message:', message);
      
      // 检查runtime是否可用
      if (!chrome.runtime) {
        console.error('CoinDetail: Chrome runtime not available');
        reject(new Error('Chrome runtime not available'));
        return;
      }
      
      try {
        chrome.runtime.sendMessage(message, (response) => {
          // 检查是否有runtime错误
          if (chrome.runtime.lastError) {
            console.error('CoinDetail: Runtime error:', chrome.runtime.lastError);
            reject(new Error(chrome.runtime.lastError.message));
            return;
          }
          
          console.log('CoinDetail: Received response:', response);
          resolve(response || { success: false, error: 'No response received' });
        });
      } catch (error) {
        console.error('CoinDetail: Error sending message:', error);
        reject(error);
      }
    });
  };

  const initChart = async () => {
    if (!chartContainerRef.current) {
      console.log('CoinDetail: Chart container not ready');
      return;
    }
    
    if (chartRef.current) {
      console.log('CoinDetail: Chart already exists');
      return;
    }

    console.log('CoinDetail: Initializing chart...');
    console.log('CoinDetail: Container size:', chartContainerRef.current.clientWidth, chartContainerRef.current.clientHeight);

    try {
      // 动态导入图表库
      const { createChart, ColorType } = await import('lightweight-charts');
      
      // 获取容器宽度，如果为0则使用默认值
      const containerWidth = chartContainerRef.current.clientWidth || 340;
      console.log('CoinDetail: Using chart width:', containerWidth);
      
      const chart = createChart(chartContainerRef.current, {
        width: containerWidth,
        height: 300,
        layout: {
          background: { type: ColorType.Solid, color: 'transparent' },
          textColor: '#94a3b8',
        },
        grid: {
          vertLines: { color: 'rgba(255, 255, 255, 0.05)' },
          horzLines: { color: 'rgba(255, 255, 255, 0.05)' },
        },
        crosshair: {
          mode: 1,
        },
        rightPriceScale: {
          borderColor: 'rgba(255, 255, 255, 0.1)',
        },
        timeScale: {
          borderColor: 'rgba(255, 255, 255, 0.1)',
          timeVisible: true,
          secondsVisible: false,
        },
      });

      const areaSeries = chart.addAreaSeries({
        lineColor: '#38bdf8',
        topColor: 'rgba(56, 189, 248, 0.35)',
        bottomColor: 'rgba(56, 189, 248, 0.02)',
        lineWidth: 2,
      });

      chartRef.current = chart;
      areaSeriesRef.current = areaSeries;
      
      console.log('CoinDetail: Chart initialized successfully');
      
      // 如果已经有数据，设置到图表
      if (chartDataRef.current && chartDataRef.current.length > 0) {
        console.log('CoinDetail: Setting saved chart data after init:', chartDataRef.current.length, 'items');
        console.log('CoinDetail: First data point:', chartDataRef.current[0]);
        areaSeries.setData(chartDataRef.current);
        chart.timeScale().fitContent();
      }
    } catch (error) {
      console.error('CoinDetail: Error initializing chart:', error);
      // 图表初始化失败不阻止显示数据
    }
  };

  const loadData = async (isInitial: boolean = true) => {
    try {
      console.log('CoinDetail: Starting to load data for', coinId, 'timeframe:', timeframe, 'isInitial:', isInitial);
      
      // 只有初次加载才显示 loading 状态
      if (isInitial) {
        setLoading(true);
      }
      setError(null);

      // 初次加载时获取详细信息
      if (isInitial) {
        const detailsResponse = await sendMessage({ type: 'GET_COIN_DETAILS', coinId });
        console.log('CoinDetail: Details response:', detailsResponse);

        if (detailsResponse.success && detailsResponse.data) {
          setCoinDetails(detailsResponse.data);
          console.log('CoinDetail: Set coin details:', detailsResponse.data);
          
          if (onPriceUpdate && detailsResponse.data.market_data) {
            onPriceUpdate(
              coinId,
              detailsResponse.data.market_data.current_price[vsCurrency],
              detailsResponse.data.market_data.price_change_percentage_24h
            );
          }
        } else {
          const errorMsg = detailsResponse.error || '加载数据失败';
          console.error('CoinDetail: API error:', errorMsg);
          setError(errorMsg);
        }
      }

      // 加载历史数据（用于图表）
      try {
        const historyResponse = await sendMessage({ type: 'GET_COIN_HISTORY', coinId, days: timeframe, interval: chartInterval, vsCurrency });
        console.log('CoinDetail: History response:', historyResponse);

        // 保存并更新图表数据
        if (historyResponse.success && historyResponse.data?.prices) {
          const prices = historyResponse.data.prices;
          console.log('CoinDetail: Got chart data:', prices.length, 'items');
          chartDataRef.current = prices;
          
          // 如果图表已经初始化，直接设置数据
          if (areaSeriesRef.current && chartRef.current) {
            console.log('CoinDetail: Setting chart data immediately');
            console.log('CoinDetail: First data point:', prices[0]);
            areaSeriesRef.current.setData(prices as LineData[]);
            chartRef.current.timeScale().fitContent();
          }
        }
      } catch (historyErr) {
        console.warn('CoinDetail: History load failed, but continuing:', historyErr);
      }

    } catch (err) {
      console.error('CoinDetail: Error loading coin data:', err);
      setError(err instanceof Error ? err.message : '加载数据失败');
    } finally {
      if (isInitial) {
        setLoading(false);
      }
    }
  };

  useEffect(() => {
    console.log('CoinDetail: Component mounted, coinId:', coinId);
    
    // 加载数据
    loadData();
    
    return () => {
      if (chartRef.current) {
        console.log('CoinDetail: Cleaning up chart...');
        chartRef.current.remove();
        chartRef.current = null;
        areaSeriesRef.current = null;
      }
    };
  }, [coinId, vsCurrency]);

  // 当数据加载完成后初始化图表
  useEffect(() => {
    if (coinDetails && !loading && !chartRef.current) {
      console.log('CoinDetail: Data loaded, initializing chart...');
      // 延迟一帧确保 DOM 已渲染
      const timer = setTimeout(() => {
        initChart();
      }, 50);
      return () => clearTimeout(timer);
    }
  }, [coinDetails, loading]);

  // 当时间参数改变时重新加载数据
  useEffect(() => {
    console.log('CoinDetail: Timeframe/interval changed', { timeframe, chartInterval });
    if (coinDetails && chartRef.current) {
      // 只有已经加载过数据且图表存在才重新加载历史数据
      loadData(false);
    }
  }, [timeframe, chartInterval]);

  const formatPercentage = (percentage: number): string => {
    const sign = percentage >= 0 ? '+' : '';
    return `${sign}${percentage.toFixed(2)}%`;
  };

  const formatMarketCap = (value: number): string => {
    const formatted = formatPrice(value);
    if (value >= 1e9) {
      return `${formatPrice(value / 1e9)}B`;
    } else if (value >= 1e6) {
      return `${formatPrice(value / 1e6)}M`;
    } else {
      return formatted;
    }
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
          <div className="flex items-center">
            {coinDetails && (
              <img 
                src={coinDetails.image?.small} 
                alt={coinName}
                className="w-6 h-6 rounded-full mr-2 shadow-md shadow-black/40"
              />
            )}
            <h1 className="text-lg font-bold text-white tracking-wide">{coinName}</h1>
          </div>
        </div>
      </div>

      {/* 内容区域 */}
      <div className="flex-1 overflow-y-auto scrollbar-thin relative pb-4">
        {loading && (
           <div className="flex flex-col items-center justify-center p-12">
           <div className="loading-spinner mb-3"></div>
           <span className="text-sm text-slate-400 font-medium tracking-wider">LOADING...</span>
         </div>
        )}

        {error && (
          <div className="m-4 p-4 rounded-xl bg-red-500/10 border border-red-500/20 text-center text-rose-400 text-sm">
            {error}
          </div>
        )}

        {!loading && !error && coinDetails && (
          <div className="space-y-3 relative z-10 pt-3">
            {/* 价格信息 */}
            <div className="bg-slate-800/80 p-5 rounded-xl mx-3 border border-white/10 shadow-lg shadow-black/20">
              <div className="flex items-center justify-between mb-4">
                <div className="text-3xl font-black text-white tracking-tight">
                  {formatPrice(coinDetails.market_data.current_price[vsCurrency])}
                </div>
                <div className={`text-sm font-bold px-2 py-1 rounded-md ${
                  coinDetails.market_data.price_change_percentage_24h >= 0 
                    ? 'bg-emerald-500/10 text-emerald-400' 
                    : 'bg-rose-500/10 text-rose-400'
                }`}>
                  {formatPercentage(coinDetails.market_data.price_change_percentage_24h)}
                </div>
              </div>
              
              <div className="grid grid-cols-2 gap-y-4 gap-x-2 text-sm">
                <div className="bg-white/5 rounded-lg p-2.5 border border-white/5">
                  <span className="text-[11px] font-semibold tracking-wider uppercase text-slate-400 block mb-1">Rank</span>
                  <div className="font-bold text-white">#{coinDetails.market_cap_rank}</div>
                </div>
                <div className="bg-white/5 rounded-lg p-2.5 border border-white/5">
                  <span className="text-[11px] font-semibold tracking-wider uppercase text-slate-400 block mb-1">Market Cap</span>
                  <div className="font-bold text-white">{formatMarketCap(coinDetails.market_data.market_cap[vsCurrency])}</div>
                </div>
                <div className="bg-white/5 rounded-lg p-2.5 border border-white/5">
                  <span className="text-[11px] font-semibold tracking-wider uppercase text-slate-400 block mb-1">24h High</span>
                  <div className="font-bold text-slate-200">{formatPrice(coinDetails.market_data.high_24h[vsCurrency])}</div>
                </div>
                <div className="bg-white/5 rounded-lg p-2.5 border border-white/5">
                  <span className="text-[11px] font-semibold tracking-wider uppercase text-slate-400 block mb-1">24h Low</span>
                  <div className="font-bold text-slate-200">{formatPrice(coinDetails.market_data.low_24h[vsCurrency])}</div>
                </div>
              </div>
            </div>

            {/* 时间范围选择 */}
            <div className="bg-slate-800/80 px-4 py-3 rounded-xl mx-3 border border-white/10 shadow-lg shadow-black/20">
              <div className="mb-3">
                <div className="text-[11px] font-semibold tracking-wider uppercase text-slate-400 mb-2">Timeframe</div>
                <div className="flex space-x-2">
                  {[7, 30, 90, 365].map((days) => (
                    <button
                      key={days}
                      onClick={() => setTimeframe(days)}
                      className={`btn-glass px-3.5 py-1.5 rounded-lg text-xs font-bold transition-all ${
                        timeframe === days
                          ? 'bg-blue-500/20 text-blue-400 border border-blue-500/30 shadow-md shadow-blue-500/10'
                          : 'bg-white/5 text-slate-300 border border-white/5 hover:bg-white/10 hover:text-white'
                      }`}
                    >
                      {days === 7 ? '7D' : days === 30 ? '1M' : days === 90 ? '3M' : '1Y'}
                    </button>
                  ))}
                </div>
              </div>
              <div className="pt-2 border-t border-white/5 mt-3">
                <div className="text-[11px] font-semibold tracking-wider uppercase text-slate-400 mb-2">Interval</div>
                <div className="flex space-x-2">
                  <button
                    onClick={() => setChartInterval('daily')}
                    className={`btn-glass px-3.5 py-1.5 rounded-lg text-xs font-bold transition-all ${
                      chartInterval === 'daily'
                        ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 shadow-md shadow-emerald-500/10'
                        : 'bg-white/5 text-slate-300 border border-white/5 hover:bg-white/10 hover:text-white'
                    }`}
                  >
                    Daily
                  </button>
                  <button
                    onClick={() => setChartInterval('weekly')}
                    className={`btn-glass px-3.5 py-1.5 rounded-lg text-xs font-bold transition-all ${
                      chartInterval === 'weekly'
                        ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 shadow-md shadow-emerald-500/10'
                        : 'bg-white/5 text-slate-300 border border-white/5 hover:bg-white/10 hover:text-white'
                    }`}
                  >
                    Weekly
                  </button>
                </div>
              </div>
            </div>

            {/* K线图 */}
            <div className="bg-slate-800/80 p-4 rounded-xl mx-3 border border-white/10 shadow-lg shadow-black/20">
              <h3 className="text-[11px] font-semibold tracking-wider uppercase text-slate-400 mb-3">Price Trend</h3>
              <div ref={chartContainerRef} className="w-full rounded-lg overflow-hidden" style={{ height: '300px' }} />
            </div>

            {/* 描述 */}
            {coinDetails.description?.en && (
              <div className="bg-slate-800/80 p-4 rounded-xl mx-3 mb-2 border border-white/10 shadow-lg shadow-black/20">
                <h3 className="text-[11px] font-semibold tracking-wider uppercase text-slate-400 mb-2">About</h3>
                <p className="text-xs text-slate-300 leading-relaxed font-normal">
                  {coinDetails.description.en.split('.')[0]}.
                </p>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
};

export default CoinDetail;
