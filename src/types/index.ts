// 基础币种数据接口
export interface Coin {
  id: string;
  symbol: string;
  name: string;
  image: string;
  current_price: number;
  price_change_percentage_24h: number;
  market_cap: number;
  market_cap_rank: number;
  last_updated?: string;
}

// 观察列表项目
export interface WatchlistItem {
  coinId: string;
  addedAt: number;
  alertPrice?: number;
  alertDirection?: 'above' | 'below';
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
  type: 'GET_WATCHLIST_PRICES' | 'SEARCH_COINS' | 'ADD_TO_WATCHLIST' | 'REMOVE_FROM_WATCHLIST' | 'GET_COIN_HISTORY' | 'GET_COIN_DETAILS' | 'PING' | 'SAVE_API_KEY' | 'GET_API_KEY';
  apiKey?: string;
  query?: string;
  coinId?: string;
  days?: number;
  interval?: 'daily' | 'weekly';
  forceRefresh?: boolean;
}

// Chrome扩展类型声明将由@types/chrome包提供
