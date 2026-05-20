import React, { useEffect, useMemo, useRef, useState } from 'react';
import { ApiResponse, AssetSnapshot, BackgroundMessage } from '../types';

type TrendRange = '7d' | '30d' | '90d' | 'all';
type IChartApi = any;
type ISeriesApi<T> = any;

const rangeLimits: Record<TrendRange, number | null> = {
  '7d': 7,
  '30d': 30,
  '90d': 90,
  all: null
};

const rangeLabels: Record<TrendRange, string> = {
  '7d': '7D',
  '30d': '30D',
  '90d': '90D',
  all: 'ALL'
};

const formatCompactDate = (date: string) => {
  const [, month, day] = date.split('-');
  return `${month}/${day}`;
};

interface AssetTrendProps {
  formatPriceFor: (price: number, currency: 'usd' | 'cny') => string;
}

const AssetTrend: React.FC<AssetTrendProps> = ({ formatPriceFor }) => {
  const chartContainerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const usdSeriesRef = useRef<ISeriesApi<'Area'> | null>(null);
  const rmbSeriesRef = useRef<ISeriesApi<'Line'> | null>(null);
  const [snapshots, setSnapshots] = useState<AssetSnapshot[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [range, setRange] = useState<TrendRange>('30d');

  const sendMessage = <T,>(message: BackgroundMessage): Promise<ApiResponse<T>> => {
    return new Promise((resolve) => {
      chrome.runtime.sendMessage(message, (response: ApiResponse<T>) => {
        resolve(response || { success: false, error: 'No response received' });
      });
    });
  };

  useEffect(() => {
    let cancelled = false;

    const loadSnapshots = async () => {
      setIsLoading(true);
      setError(null);
      const response = await sendMessage<AssetSnapshot[]>({ type: 'GET_ASSET_SNAPSHOTS' });
      if (cancelled) return;

      if (response.success && response.data) {
        setSnapshots(response.data);
      } else {
        setError(response.error || '加载资产趋势失败');
      }
      setIsLoading(false);
    };

    loadSnapshots();
    return () => {
      cancelled = true;
    };
  }, []);

  const filteredSnapshots = useMemo(() => {
    const limit = rangeLimits[range];
    return limit ? snapshots.slice(-limit) : snapshots;
  }, [range, snapshots]);

  const latest = snapshots[snapshots.length - 1];
  const previous = snapshots[snapshots.length - 2];

  const getChangeFromOffset = (days: number) => {
    if (!latest || snapshots.length < 2) return null;
    const baseline = snapshots[Math.max(0, snapshots.length - 1 - days)];
    if (!baseline || baseline.date === latest.date) return null;

    const usdChange = latest.totalUsd - baseline.totalUsd;
    const rmbChange = latest.totalRmb - baseline.totalRmb;
    return {
      usdChange,
      rmbChange,
      pct: baseline.totalUsd > 0 ? (usdChange / baseline.totalUsd) * 100 : 0
    };
  };

  const latestChange = latest && previous
    ? {
        usdChange: latest.totalUsd - previous.totalUsd,
        rmbChange: latest.totalRmb - previous.totalRmb,
        pct: previous.totalUsd > 0 ? ((latest.totalUsd - previous.totalUsd) / previous.totalUsd) * 100 : 0
      }
    : null;
  const sevenDayChange = getChangeFromOffset(7);
  const thirtyDayChange = getChangeFromOffset(30);

  const dailyChanges = useMemo(() => {
    return filteredSnapshots.map((snapshot, index) => {
      const prev = index > 0 ? filteredSnapshots[index - 1] : null;
      return {
        date: snapshot.date,
        usdChange: prev ? snapshot.totalUsd - prev.totalUsd : 0,
        rmbChange: prev ? snapshot.totalRmb - prev.totalRmb : 0
      };
    }).slice(1);
  }, [filteredSnapshots]);

  const maxAbsDailyChange = Math.max(1, ...dailyChanges.map(item => Math.abs(item.usdChange)));

  useEffect(() => {
    let cancelled = false;

    const initChart = async () => {
      if (isLoading || filteredSnapshots.length < 2 || !chartContainerRef.current || chartRef.current) return;
      const { createChart, ColorType } = await import('lightweight-charts');
      if (cancelled || !chartContainerRef.current) return;

      const chart = createChart(chartContainerRef.current, {
        width: chartContainerRef.current.clientWidth || 330,
        height: 220,
        layout: {
          background: { type: ColorType.Solid, color: 'transparent' },
          textColor: '#94a3b8'
        },
        grid: {
          vertLines: { color: 'rgba(148, 163, 184, 0.08)' },
          horzLines: { color: 'rgba(148, 163, 184, 0.08)' }
        },
        leftPriceScale: {
          visible: true,
          borderColor: 'rgba(245, 158, 11, 0.24)'
        },
        rightPriceScale: {
          visible: true,
          borderColor: 'rgba(34, 211, 238, 0.24)'
        },
        timeScale: {
          borderColor: 'rgba(148, 163, 184, 0.16)',
          timeVisible: false,
          secondsVisible: false
        }
      });

      const usdSeries = chart.addAreaSeries({
        priceScaleId: 'right',
        lineColor: '#22d3ee',
        topColor: 'rgba(34, 211, 238, 0.28)',
        bottomColor: 'rgba(34, 211, 238, 0.02)',
        lineWidth: 2
      });

      const rmbSeries = chart.addLineSeries({
        priceScaleId: 'left',
        color: '#f59e0b',
        lineWidth: 2
      });

      chartRef.current = chart;
      usdSeriesRef.current = usdSeries;
      rmbSeriesRef.current = rmbSeries;
      usdSeries.setData(filteredSnapshots.map(snapshot => ({
        time: snapshot.date,
        value: snapshot.totalUsd
      })));
      rmbSeries.setData(filteredSnapshots.map(snapshot => ({
        time: snapshot.date,
        value: snapshot.totalRmb
      })));
      chart.timeScale().fitContent();
    };

    initChart();

    return () => {
      cancelled = true;
    };
  }, [filteredSnapshots.length, isLoading]);

  useEffect(() => {
    const handleResize = () => {
      if (chartRef.current && chartContainerRef.current) {
        chartRef.current.applyOptions({ width: chartContainerRef.current.clientWidth || 330 });
      }
    };

    window.addEventListener('resize', handleResize);
    return () => {
      window.removeEventListener('resize', handleResize);
      if (chartRef.current) {
        chartRef.current.remove();
        chartRef.current = null;
        usdSeriesRef.current = null;
        rmbSeriesRef.current = null;
      }
    };
  }, []);

  useEffect(() => {
    if (!chartRef.current || !usdSeriesRef.current || !rmbSeriesRef.current) return;
    usdSeriesRef.current.setData(filteredSnapshots.map(snapshot => ({
      time: snapshot.date,
      value: snapshot.totalUsd
    })));
    rmbSeriesRef.current.setData(filteredSnapshots.map(snapshot => ({
      time: snapshot.date,
      value: snapshot.totalRmb
    })));
    chartRef.current.timeScale().fitContent();
  }, [filteredSnapshots]);

  const renderChange = (label: string, change: { usdChange: number; rmbChange: number; pct: number } | null) => {
    const positive = (change?.usdChange || 0) >= 0;
    return (
      <div className="rounded-lg border border-white/10 bg-slate-900/60 px-3 py-2">
        <div className="text-[10px] font-semibold uppercase tracking-wider text-slate-500">{label}</div>
        <div className={`mt-1 text-xs font-bold tabular-nums ${positive ? 'text-emerald-400' : 'text-rose-400'}`}>
          {change
            ? `${positive ? '+' : '-'}${formatPriceFor(Math.abs(change.usdChange), 'usd')}`
            : '--'}
        </div>
        <div className={`text-[11px] tabular-nums ${positive ? 'text-emerald-400/80' : 'text-rose-400/80'}`}>
          {change
            ? `${positive ? '+' : '-'}${formatPriceFor(Math.abs(change.rmbChange), 'cny')} · ${positive ? '+' : ''}${change.pct.toFixed(2)}%`
            : '--'}
        </div>
      </div>
    );
  };

  if (isLoading) {
    return (
      <div className="flex flex-col items-center justify-center p-12">
        <div className="loading-spinner mb-3"></div>
        <span className="text-sm text-slate-400 font-medium tracking-wider">LOADING...</span>
      </div>
    );
  }

  if (error) {
    return (
      <div className="m-4 p-4 rounded-xl bg-red-500/10 border border-red-500/20 text-center text-rose-400 text-sm">
        {error}
      </div>
    );
  }

  if (!latest) {
    return (
      <div className="p-12 text-center text-slate-500 flex flex-col items-center">
        <div className="w-16 h-16 rounded-full bg-white/5 flex items-center justify-center mx-auto mb-4 border border-white/5">
          <svg className="w-8 h-8 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4 19V5m0 14h16M8 15l3-3 3 2 5-7" />
          </svg>
        </div>
        <p className="text-sm font-medium">暂无资产快照</p>
        <p className="text-xs mt-2 leading-relaxed">每天 10:00 后会自动记录，总资产数据积累后会显示趋势。</p>
      </div>
    );
  }

  return (
    <div className="px-3 py-3 space-y-3">
      <div className="rounded-xl border border-white/10 bg-slate-800/70 p-4 shadow-lg shadow-black/20">
        <div className="flex items-start justify-between gap-3">
          <div>
            <div className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">最新快照</div>
            <div className="mt-1 text-2xl font-bold tracking-tight text-white tabular-nums">
              {formatPriceFor(latest.totalUsd, 'usd')}
            </div>
            <div className="mt-1 text-sm font-semibold text-amber-300 tabular-nums">
              ≈ {formatPriceFor(latest.totalRmb, 'cny')}
            </div>
            <div className="mt-1 text-xs text-slate-400">
              {latest.date} 记录 · {latest.holdingCount} 项持仓
            </div>
          </div>
          <div className="rounded-lg border border-white/10 bg-black/20 px-2.5 py-2 text-right">
            <div className="text-[10px] font-semibold uppercase tracking-wider text-slate-500">USD/RMB</div>
            <div className="mt-1 text-xs font-bold text-slate-200 tabular-nums">
              {latest.usdToRmbRate ? latest.usdToRmbRate.toFixed(4) : '--'}
            </div>
          </div>
        </div>

        <div className="mt-4 grid grid-cols-3 gap-2">
          {renderChange('上次', latestChange)}
          {renderChange('7日', sevenDayChange)}
          {renderChange('30日', thirtyDayChange)}
        </div>
      </div>

      <div className="rounded-xl border border-white/10 bg-slate-800/70 p-3 shadow-lg shadow-black/20">
        <div className="mb-3 flex items-center justify-between">
          <div>
            <div className="text-xs font-bold text-slate-300">资产曲线</div>
            <div className="mt-1 flex items-center gap-3 text-[10px] font-bold uppercase tracking-wider">
              <span className="flex items-center text-cyan-300"><span className="mr-1.5 h-2 w-2 rounded-full bg-cyan-300" />USD</span>
              <span className="flex items-center text-amber-300"><span className="mr-1.5 h-2 w-2 rounded-full bg-amber-400" />RMB</span>
            </div>
          </div>
          <div className="flex rounded-lg border border-white/10 bg-black/20 p-0.5">
            {(Object.keys(rangeLabels) as TrendRange[]).map(item => (
              <button
                key={item}
                onClick={() => setRange(item)}
                className={`px-2 py-1 text-[11px] font-bold rounded-md transition-all ${range === item ? 'bg-blue-500/20 text-blue-300' : 'text-slate-500 hover:text-slate-300'}`}
              >
                {rangeLabels[item]}
              </button>
            ))}
          </div>
        </div>

        {filteredSnapshots.length < 2 ? (
          <div className="h-[220px] flex items-center justify-center text-center text-xs text-slate-500 leading-relaxed">
            已有 1 条快照，明天 10:00 后会开始形成曲线。
          </div>
        ) : (
          <div ref={chartContainerRef} className="h-[220px] w-full" />
        )}
      </div>

      {dailyChanges.length > 0 && (
        <div className="rounded-xl border border-white/10 bg-slate-800/70 p-3 shadow-lg shadow-black/20">
          <div className="mb-3 flex items-center justify-between">
            <div className="text-xs font-bold text-slate-300">每日变化</div>
            <div className="text-[11px] text-slate-500">{filteredSnapshots.length} 条记录</div>
          </div>
          <div className="space-y-2">
            {dailyChanges.slice(-10).map(item => {
              const positive = item.usdChange >= 0;
              const width = `${Math.max(8, Math.round((Math.abs(item.usdChange) / maxAbsDailyChange) * 100))}%`;
              return (
                <div key={item.date} className="grid grid-cols-[42px_1fr_118px] items-center gap-2">
                  <div className="text-[11px] font-semibold text-slate-500 tabular-nums">{formatCompactDate(item.date)}</div>
                  <div className="h-2 rounded-full bg-slate-950/60 overflow-hidden">
                    <div
                      className={`h-full rounded-full ${positive ? 'bg-emerald-400' : 'bg-rose-400'}`}
                      style={{ width }}
                    />
                  </div>
                  <div className={`text-right text-[11px] font-bold tabular-nums ${positive ? 'text-emerald-400' : 'text-rose-400'}`}>
                    {positive ? '+' : '-'}{formatPriceFor(Math.abs(item.usdChange), 'usd')}
                    <div className="text-[10px] font-semibold opacity-80">
                      {positive ? '+' : '-'}{formatPriceFor(Math.abs(item.rmbChange), 'cny')}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
};

export default AssetTrend;
