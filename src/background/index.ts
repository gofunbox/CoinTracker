import { CoinGeckoService } from '../services/coinGecko';
import { WatchlistItem } from '../types';

console.log('CoinTracker background script started');

// 默认观察列表
const DEFAULT_WATCHLIST: WatchlistItem[] = [
  { coinId: 'bitcoin', addedAt: Date.now() },
  { coinId: 'ethereum', addedAt: Date.now() },
  { coinId: 'binancecoin', addedAt: Date.now() }
];

// 初始化默认观察列表
chrome.runtime.onInstalled.addListener(async () => {
  console.log('Extension installed, setting up default watchlist');
  
  const { watchlist } = await chrome.storage.sync.get(['watchlist']);
  
  if (!watchlist || watchlist.length === 0) {
    await chrome.storage.sync.set({ watchlist: DEFAULT_WATCHLIST });
  }
  
  // 设置定期更新 - 改为10分钟一次，避免频率限制
  chrome.alarms.create('updatePrices', { periodInMinutes: 10 });
});

// 处理定期价格更新
chrome.alarms.onAlarm.addListener(async (alarm) => {
  if (alarm.name === 'updatePrices') {
    console.log('Updating prices...');
    await updatePrices();
  }
});

// 处理来自popup的消息
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  console.log('Background received message:', message);
  
  switch (message.type) {
    case 'PING':
      console.log('Background: received PING, sending PONG');
      sendResponse({ success: true, message: 'PONG' });
      return false; // 同步响应
      
    case 'GET_WATCHLIST_PRICES':
      handleGetWatchlistPrices(sendResponse);
      return true; // 保持消息通道开启
      
    case 'SEARCH_COINS':
      handleSearchCoins(message.query, sendResponse);
      return true;
      
    case 'ADD_TO_WATCHLIST':
      handleAddToWatchlist(message.coinId, sendResponse);
      return true;
      
    case 'REMOVE_FROM_WATCHLIST':
      handleRemoveFromWatchlist(message.coinId, sendResponse);
      return true;

    case 'GET_COIN_HISTORY':
      handleGetCoinHistory(message.coinId, message.days, message.interval, sendResponse);
      return true;

    case 'GET_COIN_DETAILS':
      handleGetCoinDetails(message.coinId, sendResponse);
      return true;
  }
});

async function handleGetWatchlistPrices(sendResponse: (response: any) => void) {
  try {
    console.log('Background: handling GET_WATCHLIST_PRICES');
    const { watchlist } = await chrome.storage.sync.get(['watchlist']);
    console.log('Background: got watchlist from storage:', watchlist);
    
    const coinIds = (watchlist || DEFAULT_WATCHLIST).map((item: WatchlistItem) => item.coinId);
    console.log('Background: coin IDs to fetch:', coinIds);
    
    const coins = await CoinGeckoService.getCoins(coinIds);
    console.log('Background: got coins from API:', coins);
    
    if (coins.length === 0) {
      console.warn('Background: no coins returned from API');
      sendResponse({ success: false, error: 'API频率限制，请稍后再试' });
    } else {
      console.log('Background: sending successful response with coins');
      sendResponse({ success: true, data: coins });
    }
  } catch (error) {
    console.error('Background: error getting watchlist prices:', error);
    const errorMessage = error instanceof Error && error.message.includes('Rate limit') 
      ? 'API请求过于频繁，请稍后再试' 
      : '获取价格失败，请检查网络连接';
    sendResponse({ success: false, error: errorMessage });
  }
}

async function handleSearchCoins(query: string, sendResponse: (response: any) => void) {
  try {
    const results = await CoinGeckoService.searchCoins(query);
    sendResponse({ success: true, data: results });
  } catch (error) {
    console.error('Error searching coins:', error);
    const errorMessage = error instanceof Error && error.message.includes('Rate limit') 
      ? '搜索过于频繁，请稍后再试' 
      : '搜索失败，请检查网络连接';
    sendResponse({ success: false, error: errorMessage });
  }
}

async function handleAddToWatchlist(coinId: string, sendResponse: (response: any) => void) {
  try {
    const { watchlist } = await chrome.storage.sync.get(['watchlist']);
    const currentWatchlist: WatchlistItem[] = watchlist || [];
    
    // 检查是否已存在
    if (currentWatchlist.some(item => item.coinId === coinId)) {
      sendResponse({ success: false, error: 'Coin already in watchlist' });
      return;
    }
    
    const newItem: WatchlistItem = {
      coinId,
      addedAt: Date.now()
    };
    
    const updatedWatchlist = [...currentWatchlist, newItem];
    await chrome.storage.sync.set({ watchlist: updatedWatchlist });
    
    sendResponse({ success: true });
  } catch (error) {
    console.error('Error adding to watchlist:', error);
    sendResponse({ success: false, error: 'Failed to add coin' });
  }
}

async function handleRemoveFromWatchlist(coinId: string, sendResponse: (response: any) => void) {
  try {
    const { watchlist } = await chrome.storage.sync.get(['watchlist']);
    const currentWatchlist: WatchlistItem[] = watchlist || [];
    
    const updatedWatchlist = currentWatchlist.filter(item => item.coinId !== coinId);
    await chrome.storage.sync.set({ watchlist: updatedWatchlist });
    
    sendResponse({ success: true });
  } catch (error) {
    console.error('Error removing from watchlist:', error);
    sendResponse({ success: false, error: 'Failed to remove coin' });
  }
}

async function handleGetCoinHistory(coinId: string, days: number = 30, interval: 'daily' | 'weekly' = 'daily', sendResponse: (response: any) => void) {
  try {
    const data = await CoinGeckoService.getCoinHistory(coinId, days, interval);
    sendResponse({ success: true, data });
  } catch (error) {
    console.error('Error getting coin history:', error);
    sendResponse({ success: false, error: 'Failed to fetch history' });
  }
}

async function handleGetCoinDetails(coinId: string, sendResponse: (response: any) => void) {
  try {
    const data = await CoinGeckoService.getCoinDetails(coinId);
    sendResponse({ success: true, data });
  } catch (error) {
    console.error('Error getting coin details:', error);
    sendResponse({ success: false, error: 'Failed to fetch details' });
  }
}

async function updatePrices() {
  try {
    const { watchlist } = await chrome.storage.sync.get(['watchlist']);
    const coinIds = (watchlist || DEFAULT_WATCHLIST).map((item: WatchlistItem) => item.coinId);
    
    const coins = await CoinGeckoService.getCoins(coinIds);
    
    // 检查价格警报
    for (const coin of coins) {
      const watchlistItem = (watchlist || DEFAULT_WATCHLIST).find((item: WatchlistItem) => item.coinId === coin.id);
      
      if (watchlistItem && watchlistItem.alertPrice && watchlistItem.alertDirection) {
        const shouldAlert = 
          (watchlistItem.alertDirection === 'above' && coin.current_price >= watchlistItem.alertPrice) ||
          (watchlistItem.alertDirection === 'below' && coin.current_price <= watchlistItem.alertPrice);
          
        if (shouldAlert) {
          chrome.notifications.create({
            type: 'basic',
            iconUrl: 'icons/icon-48.png',
            title: 'CoinTracker Price Alert',
            message: `${coin.name} is now $${coin.current_price.toFixed(2)}`
          });
        }
      }
    }
  } catch (error) {
    console.error('Error updating prices:', error);
  }
}
