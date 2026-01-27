import React, { useEffect, useRef, useState } from 'react';
import { BackgroundMessage, ApiResponse } from '../types';

// 动态导入图表库类型
type IChartApi = any;
type ISeriesApi<T> = any;
type CandlestickData = any;

interface CoinDetailProps {
  coinId: string;
  coinName: string;
  onBack: () => void;
}

const CoinDetail: React.FC<CoinDetailProps> = ({ coinId, coinName, onBack }) => {
  const chartContainerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const candlestickSeriesRef = useRef<ISeriesApi<'Candlestick'> | null>(null);
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
      const { createChart } = await import('lightweight-charts');
      
      // 获取容器宽度，如果为0则使用默认值
      const containerWidth = chartContainerRef.current.clientWidth || 340;
      console.log('CoinDetail: Using chart width:', containerWidth);
      
      const chart = createChart(chartContainerRef.current, {
        width: containerWidth,
        height: 300,
        layout: {
          background: { color: '#ffffff' },
          textColor: '#333333',
        },
        grid: {
          vertLines: { color: '#eeeeee' },
          horzLines: { color: '#eeeeee' },
        },
        crosshair: {
          mode: 1,
        },
        rightPriceScale: {
          borderColor: '#cccccc',
        },
        timeScale: {
          borderColor: '#cccccc',
          timeVisible: true,
          secondsVisible: false,
        },
      });

      const candlestickSeries = chart.addCandlestickSeries({
        upColor: '#22c55e',
        downColor: '#ef4444',
        borderDownColor: '#ef4444',
        borderUpColor: '#22c55e',
        wickDownColor: '#ef4444',
        wickUpColor: '#22c55e',
      });

      chartRef.current = chart;
      candlestickSeriesRef.current = candlestickSeries;
      
      console.log('CoinDetail: Chart initialized successfully');
      
      // 如果已经有数据，设置到图表
      if (chartDataRef.current && chartDataRef.current.length > 0) {
        console.log('CoinDetail: Setting saved chart data after init:', chartDataRef.current.length, 'items');
        console.log('CoinDetail: First data point:', chartDataRef.current[0]);
        candlestickSeries.setData(chartDataRef.current);
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
        } else {
          const errorMsg = detailsResponse.error || '加载数据失败';
          console.error('CoinDetail: API error:', errorMsg);
          setError(errorMsg);
        }
      }

      // 加载历史数据（用于图表）
      try {
        const historyResponse = await sendMessage({ type: 'GET_COIN_HISTORY', coinId, days: timeframe, interval: chartInterval });
        console.log('CoinDetail: History response:', historyResponse);

        // 保存并更新图表数据
        if (historyResponse.success && historyResponse.data?.prices) {
          const prices = historyResponse.data.prices;
          console.log('CoinDetail: Got chart data:', prices.length, 'items');
          chartDataRef.current = prices;
          
          // 如果图表已经初始化，直接设置数据
          if (candlestickSeriesRef.current && chartRef.current) {
            console.log('CoinDetail: Setting chart data immediately');
            console.log('CoinDetail: First data point:', prices[0]);
            candlestickSeriesRef.current.setData(prices as CandlestickData[]);
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
        candlestickSeriesRef.current = null;
      }
    };
  }, [coinId]);

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

  const formatPrice = (price: number): string => {
    if (price >= 1) {
      return `$${price.toFixed(2)}`;
    } else {
      return `$${price.toFixed(6)}`;
    }
  };

  const formatPercentage = (percentage: number): string => {
    const sign = percentage >= 0 ? '+' : '';
    return `${sign}${percentage.toFixed(2)}%`;
  };

  const formatMarketCap = (value: number): string => {
    if (value >= 1e9) {
      return `$${(value / 1e9).toFixed(2)}B`;
    } else if (value >= 1e6) {
      return `$${(value / 1e6).toFixed(2)}M`;
    } else {
      return `$${value.toLocaleString()}`;
    }
  };

  return (
    <div className="w-full h-full bg-gray-50 flex flex-col">
      {/* 头部 */}
      <div className="bg-white shadow-sm border-b">
        <div className="px-4 py-3 flex items-center">
          <button
            onClick={onBack}
            className="mr-3 text-gray-600 hover:text-gray-800"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
          </button>
          <div className="flex items-center">
            {coinDetails && (
              <img 
                src={coinDetails.image?.small} 
                alt={coinName}
                className="w-6 h-6 rounded-full mr-2"
              />
            )}
            <h1 className="text-lg font-semibold text-gray-900">{coinName}</h1>
          </div>
        </div>
      </div>

      {/* 内容区域 */}
      <div className="flex-1 overflow-y-auto">
        {loading && (
          <div className="flex items-center justify-center p-8">
            <div className="loading-spinner"></div>
            <span className="ml-2 text-sm text-gray-600">加载中...</span>
          </div>
        )}

        {error && (
          <div className="p-4 text-center text-red-600 text-sm">
            {error}
          </div>
        )}

        {!loading && !error && coinDetails && (
          <div className="space-y-4">
            {/* 价格信息 */}
            <div className="bg-white p-4 border-b">
              <div className="flex items-center justify-between mb-2">
                <div className="text-2xl font-bold text-gray-900">
                  {formatPrice(coinDetails.market_data.current_price.usd)}
                </div>
                <div className={`text-sm font-medium ${
                  coinDetails.market_data.price_change_percentage_24h >= 0 
                    ? 'text-green-600' 
                    : 'text-red-600'
                }`}>
                  {formatPercentage(coinDetails.market_data.price_change_percentage_24h)}
                </div>
              </div>
              
              <div className="grid grid-cols-2 gap-4 text-sm">
                <div>
                  <span className="text-gray-500">市值排名</span>
                  <div className="font-medium">#{coinDetails.market_cap_rank}</div>
                </div>
                <div>
                  <span className="text-gray-500">市值</span>
                  <div className="font-medium">{formatMarketCap(coinDetails.market_data.market_cap.usd)}</div>
                </div>
                <div>
                  <span className="text-gray-500">24h最高</span>
                  <div className="font-medium">{formatPrice(coinDetails.market_data.high_24h.usd)}</div>
                </div>
                <div>
                  <span className="text-gray-500">24h最低</span>
                  <div className="font-medium">{formatPrice(coinDetails.market_data.low_24h.usd)}</div>
                </div>
              </div>
            </div>

            {/* 时间范围选择 */}
            <div className="bg-white px-4 py-2 border-b">
              <div className="mb-2">
                <div className="text-xs text-gray-500 mb-1">时间范围</div>
                <div className="flex space-x-2">
                  {[7, 30, 90, 365].map((days) => (
                    <button
                      key={days}
                      onClick={() => setTimeframe(days)}
                      className={`px-3 py-1 rounded text-sm font-medium ${
                        timeframe === days
                          ? 'bg-blue-500 text-white'
                          : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                      }`}
                    >
                      {days === 7 ? '7天' : days === 30 ? '30天' : days === 90 ? '90天' : '1年'}
                    </button>
                  ))}
                </div>
              </div>
              <div>
                <div className="text-xs text-gray-500 mb-1">K线周期</div>
                <div className="flex space-x-2">
                  <button
                    onClick={() => setChartInterval('daily')}
                    className={`px-3 py-1 rounded text-sm font-medium ${
                      chartInterval === 'daily'
                        ? 'bg-green-500 text-white'
                        : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                    }`}
                  >
                    日线
                  </button>
                  <button
                    onClick={() => setChartInterval('weekly')}
                    className={`px-3 py-1 rounded text-sm font-medium ${
                      chartInterval === 'weekly'
                        ? 'bg-green-500 text-white'
                        : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                    }`}
                  >
                    周线
                  </button>
                </div>
              </div>
            </div>

            {/* K线图 */}
            <div className="bg-white p-4">
              <h3 className="text-sm font-medium text-gray-700 mb-3">价格走势</h3>
              <div ref={chartContainerRef} className="w-full" style={{ height: '300px' }} />
            </div>

            {/* 描述 */}
            {coinDetails.description?.en && (
              <div className="bg-white p-4">
                <h3 className="text-sm font-medium text-gray-700 mb-2">项目介绍</h3>
                <p className="text-sm text-gray-600 leading-relaxed">
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
