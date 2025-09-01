import { Coin } from '../types';

const API_BASE = 'https://api.coingecko.com/api/v3';

export class CoinGeckoService {
  static async getCoins(ids: string[]): Promise<Coin[]> {
    try {
      const idsParam = ids.join(',');
      const response = await fetch(
        `${API_BASE}/coins/markets?vs_currency=usd&ids=${idsParam}&order=market_cap_desc&per_page=100&page=1&sparkline=false&price_change_percentage=24h`
      );
      
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }
      
      return await response.json();
    } catch (error) {
      console.error('Error fetching coins:', error);
      return [];
    }
  }

  static async searchCoins(query: string): Promise<any[]> {
    try {
      const response = await fetch(`${API_BASE}/search?query=${encodeURIComponent(query)}`);
      
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }
      
      const data = await response.json();
      return data.coins || [];
    } catch (error) {
      console.error('Error searching coins:', error);
      return [];
    }
  }

  static async getTrendingCoins(): Promise<Coin[]> {
    try {
      const response = await fetch(`${API_BASE}/search/trending`);
      
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }
      
      const data = await response.json();
      const trendingIds = data.coins.map((coin: any) => coin.item.id).slice(0, 10);
      
      return this.getCoins(trendingIds);
    } catch (error) {
      console.error('Error fetching trending coins:', error);
      return [];
    }
  }

  // 获取币种历史价格数据（用于K线图）
  static async getCoinHistory(coinId: string, days: number = 30): Promise<any> {
    try {
      const response = await fetch(
        `${API_BASE}/coins/${coinId}/market_chart?vs_currency=usd&days=${days}&interval=daily`
      );
      
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }
      
      const data = await response.json();
      
      // 转换为图表所需的格式
      const chartData = data.prices.map((price: [number, number], index: number) => ({
        time: Math.floor(price[0] / 1000), // 转换为秒时间戳
        open: index > 0 ? data.prices[index - 1][1] : price[1],
        high: price[1] * 1.02, // 模拟高价
        low: price[1] * 0.98,  // 模拟低价
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
      const response = await fetch(
        `${API_BASE}/coins/${coinId}?localization=false&tickers=false&market_data=true&community_data=false&developer_data=false&sparkline=true`
      );
      
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }
      
      return await response.json();
    } catch (error) {
      console.error('Error fetching coin details:', error);
      throw error;
    }
  }
}
