import React, { useEffect, useRef, useState } from 'react';
import { createChart, IChartApi, ISeriesApi, CandlestickData } from 'lightweight-charts';
import { BackgroundMessage, ApiResponse } from '../types';

interface CoinDetailProps {
  coinId: string;
  coinName: string;
  onBack: () => void;
}

const CoinDetail: React.FC<CoinDetailProps> = ({ coinId, coinName, onBack }) => {
  const chartContainerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const candlestickSeriesRef = useRef<ISeriesApi<'Candlestick'> | null>(null);
  
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [coinDetails, setCoinDetails] = useState<any>(null);
  const [timeframe, setTimeframe] = useState<number>(30);

  // 发送消息到背景脚本
  const sendMessage = (message: BackgroundMessage): Promise<ApiResponse<any>> => {
    return new Promise((resolve) => {
      chrome.runtime.sendMessage(message, (response) => {
        resolve(response);
      });
    });
  };

  const initChart = () => {
    if (!chartContainerRef.current || chartRef.current) return;

    const chart = createChart(chartContainerRef.current, {
      width: 360,
      height: 300,
      layout: {
        background: { color: 'white' },
        textColor: '#333',
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
  };

  const loadData = async () => {
    try {
      setLoading(true);
      setError(null);

      // 并行加载历史数据和详细信息
      const [historyResponse, detailsResponse] = await Promise.all([
        sendMessage({ type: 'GET_COIN_HISTORY', coinId, days: timeframe }),
        sendMessage({ type: 'GET_COIN_DETAILS', coinId })
      ]);

      if (detailsResponse.success) {
        setCoinDetails(detailsResponse.data);
      }

      // 更新图表数据
      if (historyResponse.success && candlestickSeriesRef.current && historyResponse.data?.prices) {
        candlestickSeriesRef.current.setData(historyResponse.data.prices as CandlestickData[]);
      }

      if (!historyResponse.success || !detailsResponse.success) {
        setError(historyResponse.error || detailsResponse.error || '加载数据失败');
      }

    } catch (err) {
      setError('加载数据失败');
      console.error('Error loading coin data:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    initChart();
    return () => {
      if (chartRef.current) {
        chartRef.current.remove();
        chartRef.current = null;
        candlestickSeriesRef.current = null;
      }
    };
  }, []);

  useEffect(() => {
    if (chartRef.current) {
      loadData();
    }
  }, [coinId, timeframe]);

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

            {/* K线图 */}
            <div className="bg-white p-4">
              <h3 className="text-sm font-medium text-gray-700 mb-3">价格走势</h3>
              <div ref={chartContainerRef} className="w-full" />
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
