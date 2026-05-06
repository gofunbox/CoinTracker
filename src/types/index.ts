export interface Coin {
  id: string;
  symbol: string;
  name: string;
  image: string;
  current_price: number;
  price_change_percentage_24h: number;
  price_change_percentage_24h_in_currency?: number;
  price_change_percentage_30d_in_currency?: number;
  price_change_percentage_1y_in_currency?: number;
  market_cap: number;
  market_cap_rank: number;
  last_updated?: string;
  amount?: number;
  alertPrice?: number;
  alertDirection?: 'above' | 'below';
  alertCurrency?: SupportedCurrency;
}

export type SupportedCurrency = 'usd' | 'cny' | 'hkd' | 'eur';
export type WatchlistSort = 'rank' | 'priceChange' | 'holdingValue' | 'name';

// 观察列表项目
export interface WatchlistItem {
  coinId: string;
  addedAt: number;
  alertPrice?: number;
  alertDirection?: 'above' | 'below';
  alertCurrency?: SupportedCurrency;
  amount?: number;
}

// 搜索结果
export interface SearchResult {
  id: string;
  name: string;
  symbol: string;
  thumb: string;
  market_cap_rank?: number;
}

// API响应类型
export interface ApiResponse<T> {
  success: boolean;
  data?: T;
  error?: string;
}

// 背景脚本消息类型
export interface BackgroundMessage {
  type: 'GET_WATCHLIST_PRICES' | 'SEARCH_COINS' | 'GET_TRENDING_COINS' | 'ADD_TO_WATCHLIST' | 'REMOVE_FROM_WATCHLIST' | 'GET_COIN_HISTORY' | 'GET_COIN_DETAILS' | 'PING' | 'SAVE_API_KEY' | 'GET_API_KEY' | 'UPDATE_COIN_AMOUNT' | 'UPDATE_COIN_CONFIG';
  apiKey?: string;
  query?: string;
  coinId?: string;
  days?: number;
  interval?: 'daily' | 'weekly';
  forceRefresh?: boolean;
  amount?: number;
  alertPrice?: number;
  alertDirection?: 'above' | 'below';
  alertCurrency?: SupportedCurrency;
  vsCurrency?: SupportedCurrency;
}

// Chrome扩展类型声明将由@types/chrome包提供
