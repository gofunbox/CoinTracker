import { Coin, SearchResult } from '../types';

const API_BASE = 'https://api.coingecko.com/api/v3';

// 请求缓存 - 使用更长的缓存时间
const cache = new Map<string, { data: any; timestamp: number; ttl: number }>();

// 缓存时间配置（毫秒）
const CACHE_TTL = {
  COINS: 2.5 * 60 * 1000,      // 币种列表: 2.5分钟
  SEARCH: 15 * 60 * 1000,      // 搜索结果: 15分钟
  TRENDING: 30 * 60 * 1000,    // 热门币种: 30分钟
  HISTORY: 7.5 * 60 * 1000,    // 历史数据: 7.5分钟
  DETAILS: 5 * 60 * 1000,      // 币种详情: 5分钟
};

// 请求队列和限制
class RequestQueue {
  private queue: Array<() => Promise<any>> = [];
  private processing = false;
  private lastRequestTime = 0;
  private readonly MIN_INTERVAL = 2000; // 2秒间隔，更保守
  private requestCount = 0;
  private resetTime = Date.now();
  private readonly MAX_REQUESTS_PER_MINUTE = 25; // 每分钟最多25次请求

  async add<T>(requestFn: () => Promise<T>): Promise<T> {
    return new Promise((resolve, reject) => {
      this.queue.push(async () => {
        try {
          const result = await requestFn();
          resolve(result);
        } catch (error) {
          reject(error);
        }
      });
      this.process();
    });
  }

  private async process() {
    if (this.processing || this.queue.length === 0) return;
    
    this.processing = true;
    
    while (this.queue.length > 0) {
      const now = Date.now();
      
      // 重置每分钟计数器
      if (now - this.resetTime > 60000) {
        this.requestCount = 0;
        this.resetTime = now;
      }
      
      // 如果达到每分钟限制，等待
      if (this.requestCount >= this.MAX_REQUESTS_PER_MINUTE) {
        const waitTime = 60000 - (now - this.resetTime) + 1000;
        console.log(`Rate limit: waiting ${waitTime}ms before next request`);
        await new Promise(resolve => setTimeout(resolve, waitTime));
        this.requestCount = 0;
        this.resetTime = Date.now();
      }
      
      const timeSinceLastRequest = now - this.lastRequestTime;
      
      if (timeSinceLastRequest < this.MIN_INTERVAL) {
        await new Promise(resolve => setTimeout(resolve, this.MIN_INTERVAL - timeSinceLastRequest));
      }
      
      const request = this.queue.shift();
      if (request) {
        this.lastRequestTime = Date.now();
        this.requestCount++;
        await request();
      }
    }
    
    this.processing = false;
  }
}

const requestQueue = new RequestQueue();

export class CoinGeckoService {
  private static apiKey: string = '';

  static setApiKey(key: string) {
    this.apiKey = key;
    console.log('CoinGecko API key updated.');
  }

  // 缓存辅助函数
  private static getCacheKey(url: string): string {
    return btoa(url.replace(/[^a-zA-Z0-9]/g, '_')); // 安全的base64编码
  }

  private static getFromCache(key: string): any | null {
    const cached = cache.get(key);
    if (!cached) return null;
    
    const now = Date.now();
    if (now - cached.timestamp > cached.ttl) {
      cache.delete(key);
      return null;
    }
    
    return cached.data;
  }

  private static setCache(key: string, data: any, ttl: number = 300000): void {
    cache.set(key, {
      data,
      timestamp: Date.now(),
      ttl
    });
  }

  // 带缓存和频率限制的请求函数
  private static async fetchWithCache(url: string, ttl: number = 300000, forceRefresh: boolean = false): Promise<any> {
    const cacheKey = this.getCacheKey(url);
    
    if (forceRefresh) {
      cache.delete(cacheKey);
      console.log('Cache bypassed and cleared for:', url);
    } else {
      const cached = this.getFromCache(cacheKey);
      if (cached) {
        console.log('Using cached data for:', url);
        return cached;
      }
    }

    return requestQueue.add(async () => {
      // 再次检查缓存（可能在队列等待期间被其他请求填充）
      const cachedAgain = this.getFromCache(cacheKey);
      if (cachedAgain) {
        console.log('Using cached data (from queue):', url);
        return cachedAgain;
      }
      
      try {
        console.log('Making API request to:', url);
        
        const headers: HeadersInit = {};
        if (this.apiKey) {
          headers['x-cg-demo-api-key'] = this.apiKey;
        }

        const response = await fetch(url, { headers });
        
        if (!response.ok) {
          if (response.status === 429) {
            console.warn('Rate limit exceeded, waiting 30 seconds...');
            // 等待更长时间
            await new Promise(resolve => setTimeout(resolve, 30000));
            // 检查缓存中是否有过期数据可用
            const staleData = cache.get(cacheKey);
            if (staleData) {
              console.log('Returning stale cached data due to rate limit');
              return staleData.data;
            }
            throw new Error('API请求过于频繁，请稍后再试');
          }
          throw new Error(`HTTP error! status: ${response.status}`);
        }
        
        const data = await response.json();
        this.setCache(cacheKey, data, ttl);
        return data;
      } catch (error) {
        console.error('API request failed:', error);
        // 尝试返回过期缓存
        const staleData = cache.get(cacheKey);
        if (staleData) {
          console.log('Returning stale cached data due to error');
          return staleData.data;
        }
        throw error;
      }
    });
  }

  // 获取多个币种的市场数据
  static async getCoins(coinIds: string[], forceRefresh: boolean = false): Promise<Coin[]> {
    try {
      console.log('CoinGecko: getCoins called with:', coinIds, 'forceRefresh:', forceRefresh);
      
      if (coinIds.length === 0) {
        console.log('CoinGecko: no coin IDs provided, returning empty array');
        return [];
      }
      
      const ids = coinIds.join(',');
      const url = `${API_BASE}/coins/markets?vs_currency=usd&ids=${ids}&order=market_cap_desc&per_page=100&page=1&sparkline=false&price_change_percentage=24h,30d,1y&locale=en`;
      console.log('CoinGecko: making request to:', url);
      
      const data = await this.fetchWithCache(url, CACHE_TTL.COINS, forceRefresh);
      console.log('CoinGecko: received data:', data);
      
      const coins = data.map((coin: any) => ({
        id: coin.id,
        symbol: coin.symbol,
        name: coin.name,
        image: coin.image,
        current_price: coin.current_price || 0,
        price_change_percentage_24h: coin.price_change_percentage_24h || 0,
        price_change_percentage_24h_in_currency: coin.price_change_percentage_24h_in_currency || 0,
        price_change_percentage_30d_in_currency: coin.price_change_percentage_30d_in_currency || 0,
        price_change_percentage_1y_in_currency: coin.price_change_percentage_1y_in_currency || 0,
        market_cap: coin.market_cap || 0,
        market_cap_rank: coin.market_cap_rank || 0,
        last_updated: coin.last_updated
      }));
      
      console.log('CoinGecko: processed coins:', coins);
      return coins;
    } catch (error) {
      console.error('CoinGecko: error fetching coins:', error);
      return [];
    }
  }

  // 搜索币种
  static async searchCoins(query: string): Promise<SearchResult[]> {
    try {
      if (!query || query.trim().length < 2) return [];
      
      const url = `${API_BASE}/search?query=${encodeURIComponent(query.trim())}`;
      const data = await this.fetchWithCache(url, CACHE_TTL.SEARCH);
      
      return (data.coins || []).slice(0, 10).map((coin: any) => ({
        id: coin.id,
        name: coin.name,
        symbol: coin.symbol,
        thumb: coin.thumb || coin.large || coin.small,
        market_cap_rank: coin.market_cap_rank
      }));
    } catch (error) {
      console.error('Error searching coins:', error);
      return [];
    }
  }

  // 获取热门币种
  static async getTrendingCoins(): Promise<Coin[]> {
    try {
      const url = `${API_BASE}/search/trending`;
      const data = await this.fetchWithCache(url, CACHE_TTL.TRENDING);
      
      const trendingIds = (data.coins || []).map((coin: any) => coin.item.id).slice(0, 10);
      
      if (trendingIds.length === 0) return [];
      return this.getCoins(trendingIds);
    } catch (error) {
      console.error('Error fetching trending coins:', error);
      return [];
    }
  }

  // 获取币种历史价格数据（用于K线图）
  static async getCoinHistory(coinId: string, days: number = 30, interval: 'daily' | 'weekly' = 'daily'): Promise<any> {
    try {
      const url = `${API_BASE}/coins/${coinId}/market_chart?vs_currency=usd&days=${days}&interval=${interval}`;
      const data = await this.fetchWithCache(url, CACHE_TTL.HISTORY);
      
      // 转换为图表所需的格式
      const chartData = data.prices.map((price: [number, number], index: number) => ({
        time: Math.floor(price[0] / 1000),
        open: index > 0 ? data.prices[index - 1][1] : price[1],
        high: price[1] * 1.02,
        low: price[1] * 0.98,
        close: price[1]
      }));
      
      return {
        prices: chartData,
        market_caps: data.market_caps,
        total_volumes: data.total_volumes
      };
    } catch (error) {
      console.error('Error fetching coin history:', error);
      throw error;
    }
  }

  // 获取币种详细信息
  static async getCoinDetails(coinId: string): Promise<any> {
    try {
      const url = `${API_BASE}/coins/${coinId}?localization=false&tickers=false&market_data=true&community_data=false&developer_data=false&sparkline=true`;
      const data = await this.fetchWithCache(url, CACHE_TTL.DETAILS);
      
      return data;
    } catch (error) {
      console.error('Error fetching coin details:', error);
      throw error;
    }
  }
}
