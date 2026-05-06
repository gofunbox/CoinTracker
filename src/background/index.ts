import { CoinGeckoService } from '../services/coinGecko';
import { SupabaseConfig, SupabaseService, SupabaseSession } from '../services/supabase';
import { SupportedCurrency, WatchlistItem } from '../types';
import { encrypt, decrypt } from '../utils/crypto';

console.log('CoinTracker background script started');

// 默认观察列表
const DEFAULT_WATCHLIST: WatchlistItem[] = [
  { coinId: 'bitcoin', addedAt: Date.now() },
  { coinId: 'ethereum', addedAt: Date.now() },
  { coinId: 'binancecoin', addedAt: Date.now() }
];

interface StoredSupabaseConfig {
  url: string;
  anonKey?: string;
  encryptedAnonKey?: string;
}

// Initialize API key
chrome.storage.local.get(['coinGeckoApiKey']).then(async result => {
  if (result.coinGeckoApiKey) {
    const decryptedKey = await decrypt(result.coinGeckoApiKey);
    if (decryptedKey) {
      CoinGeckoService.setApiKey(decryptedKey);
    }
  }
});

// 初始化默认观察列表
chrome.runtime.onInstalled.addListener(async () => {
  console.log('Extension installed/updated, setting up storage...');
  
  // 从旧的 sync storage 迁移数据到 local persistence
  const syncData = await chrome.storage.sync.get(['watchlist']);
  if (syncData.watchlist && syncData.watchlist.length > 0) {
    console.log('Migrating watchlist from sync to local storage');
    await chrome.storage.local.set({ watchlist: syncData.watchlist });
    await chrome.storage.sync.remove('watchlist'); // 迁移后清理残留
  } else {
    const { watchlist } = await chrome.storage.local.get(['watchlist']);
    if (!watchlist || watchlist.length === 0) {
      await chrome.storage.local.set({ watchlist: DEFAULT_WATCHLIST });
    }
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
      handleGetWatchlistPrices(message.forceRefresh || false, sendResponse, message.vsCurrency || 'usd');
      return true; // 保持消息通道开启
      
    case 'SEARCH_COINS':
      handleSearchCoins(message.query, sendResponse);
      return true;

    case 'GET_TRENDING_COINS':
      handleGetTrendingCoins(message.vsCurrency || 'usd', sendResponse);
      return true;
      
    case 'ADD_TO_WATCHLIST':
      handleAddToWatchlist(message.coinId, sendResponse);
      return true;
      
    case 'REMOVE_FROM_WATCHLIST':
      handleRemoveFromWatchlist(message.coinId, sendResponse);
      return true;

    case 'GET_COIN_HISTORY':
      handleGetCoinHistory(message.coinId, message.days, message.interval, sendResponse, message.vsCurrency || 'usd');
      return true;

    case 'GET_COIN_DETAILS':
      handleGetCoinDetails(message.coinId, sendResponse);
      return true;

    case 'SAVE_API_KEY':
      handleSaveApiKey(message.apiKey || '', sendResponse);
      return true;

    case 'GET_API_KEY':
      handleGetApiKey(sendResponse);
      return true;

    case 'UPDATE_COIN_AMOUNT':
      handleUpdateCoinAmount(message.coinId, message.amount, sendResponse);
      return true;

    case 'UPDATE_COIN_CONFIG':
      handleUpdateCoinConfig(message, sendResponse);
      return true;

    case 'GET_SUPABASE_STATUS':
      handleGetSupabaseStatus(sendResponse);
      return true;

    case 'SAVE_SUPABASE_CONFIG':
      handleSaveSupabaseConfig(message.supabaseUrl || '', message.supabaseAnonKey || '', sendResponse);
      return true;

    case 'SUPABASE_SIGN_UP':
      handleSupabaseSignUp(message.email || '', message.password || '', sendResponse);
      return true;

    case 'SUPABASE_SIGN_IN':
      handleSupabaseSignIn(message.email || '', message.password || '', sendResponse);
      return true;

    case 'SUPABASE_RESEND_CONFIRMATION':
      handleSupabaseResendConfirmation(message.email || '', sendResponse);
      return true;

    case 'SUPABASE_COMPLETE_AUTH':
      handleSupabaseCompleteAuth(message.accessToken || '', message.refreshToken || '', sendResponse);
      return true;

    case 'SUPABASE_SIGN_OUT':
      handleSupabaseSignOut(sendResponse);
      return true;

    case 'SUPABASE_UPLOAD_LOCAL':
      handleSupabaseUploadLocal(sendResponse);
      return true;

    case 'SUPABASE_DOWNLOAD_CLOUD':
      handleSupabaseDownloadCloud(sendResponse);
      return true;
  }
});

async function handleSaveApiKey(apiKey: string, sendResponse: (response: any) => void) {
  try {
    const encryptedKey = apiKey ? await encrypt(apiKey) : '';
    await chrome.storage.local.set({ coinGeckoApiKey: encryptedKey });
    CoinGeckoService.setApiKey(apiKey);
    await syncLocalToCloudSilently();
    sendResponse({ success: true });
  } catch (error) {
    sendResponse({ success: false, error: 'Failed to save API key' });
  }
}

async function handleGetApiKey(sendResponse: (response: any) => void) {
  try {
    const { coinGeckoApiKey } = await chrome.storage.local.get(['coinGeckoApiKey']);
    if (coinGeckoApiKey) {
      const decrypted = await decrypt(coinGeckoApiKey);
      sendResponse({ success: true, data: decrypted || '' });
    } else {
      sendResponse({ success: true, data: '' });
    }
  } catch (error) {
    sendResponse({ success: false, error: 'Failed to get API key' });
  }
}

async function handleGetWatchlistPrices(forceRefresh: boolean, sendResponse: (response: any) => void, vsCurrency: SupportedCurrency = 'usd') {
  try {
    console.log('Background: handling GET_WATCHLIST_PRICES, forceRefresh:', forceRefresh);
    const { watchlist } = await chrome.storage.local.get(['watchlist']);
    console.log('Background: got watchlist from storage:', watchlist);
    
    const coinIds = (watchlist || DEFAULT_WATCHLIST).map((item: WatchlistItem) => item.coinId);
    console.log('Background: coin IDs to fetch:', coinIds);
    
    const coins = await CoinGeckoService.getCoins(coinIds, forceRefresh, vsCurrency);
    console.log('Background: got coins from API:', coins);
    
    const coinsWithAmount = coins.map(coin => {
      const match = (watchlist || DEFAULT_WATCHLIST).find((w: WatchlistItem) => w.coinId === coin.id);
      return {
        ...coin,
        amount: match?.amount || 0,
        alertPrice: match?.alertPrice,
        alertDirection: match?.alertDirection,
        alertCurrency: match?.alertCurrency
      };
    });
    
    if (coins.length === 0) {
      console.warn('Background: no coins returned from API');
      sendResponse({ success: false, error: 'API频率限制，请稍后再试' });
    } else {
      console.log('Background: sending successful response with coins');
      sendResponse({ success: true, data: coinsWithAmount });
    }
  } catch (error) {
    console.error('Background: error getting watchlist prices:', error);
    const errorMessage = error instanceof Error && error.message.includes('Rate limit') 
      ? 'API请求过于频繁，请稍后再试' 
      : '获取价格失败，请检查网络连接';
    sendResponse({ success: false, error: errorMessage });
  }
}

async function handleGetTrendingCoins(vsCurrency: SupportedCurrency, sendResponse: (response: any) => void) {
  try {
    const results = await CoinGeckoService.getTrendingCoins(vsCurrency);
    sendResponse({ success: true, data: results });
  } catch (error) {
    console.error('Error getting trending coins:', error);
    sendResponse({ success: false, error: 'Failed to fetch trending coins' });
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
    const { watchlist } = await chrome.storage.local.get(['watchlist']);
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
    await chrome.storage.local.set({ watchlist: updatedWatchlist });
    await syncLocalToCloudSilently();
    
    sendResponse({ success: true });
  } catch (error) {
    console.error('Error adding to watchlist:', error);
    sendResponse({ success: false, error: 'Failed to add coin' });
  }
}

async function handleRemoveFromWatchlist(coinId: string, sendResponse: (response: any) => void) {
  try {
    const { watchlist } = await chrome.storage.local.get(['watchlist']);
    const currentWatchlist: WatchlistItem[] = watchlist || [];
    
    const updatedWatchlist = currentWatchlist.filter(item => item.coinId !== coinId);
    await chrome.storage.local.set({ watchlist: updatedWatchlist });
    await syncLocalToCloudSilently();
    
    sendResponse({ success: true });
  } catch (error) {
    console.error('Error removing from watchlist:', error);
    sendResponse({ success: false, error: 'Failed to remove coin' });
  }
}

async function handleGetCoinHistory(coinId: string, days: number = 30, interval: 'daily' | 'weekly' = 'daily', sendResponse: (response: any) => void, vsCurrency: SupportedCurrency = 'usd') {
  try {
    const data = await CoinGeckoService.getCoinHistory(coinId, days, interval, vsCurrency);
    sendResponse({ success: true, data });
  } catch (error) {
    console.error('Error getting coin history:', error);
    const errorMessage = error instanceof Error && error.message.includes('401')
      ? 'CoinGecko API Key 无效，请在设置中清空或重新填写'
      : 'Failed to fetch history';
    sendResponse({ success: false, error: errorMessage });
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
    const { watchlist } = await chrome.storage.local.get(['watchlist']);
    const watchlistItems: WatchlistItem[] = watchlist || DEFAULT_WATCHLIST;
    const alertItems = watchlistItems.filter(item => item.alertPrice && item.alertDirection);
    const currencies = Array.from(new Set(alertItems.map(item => item.alertCurrency || 'usd'))) as SupportedCurrency[];

    for (const currency of currencies) {
      const itemsForCurrency = alertItems.filter(item => (item.alertCurrency || 'usd') === currency);
      const coinIds = itemsForCurrency.map(item => item.coinId);
      const coins = await CoinGeckoService.getCoins(coinIds, false, currency);
      
      for (const coin of coins) {
        const watchlistItem = itemsForCurrency.find((item: WatchlistItem) => item.coinId === coin.id);
        if (!watchlistItem || !watchlistItem.alertPrice || !watchlistItem.alertDirection) continue;

        const shouldAlert = 
          (watchlistItem.alertDirection === 'above' && coin.current_price >= watchlistItem.alertPrice) ||
          (watchlistItem.alertDirection === 'below' && coin.current_price <= watchlistItem.alertPrice);
          
        if (shouldAlert) {
          chrome.notifications.create({
            type: 'basic',
            iconUrl: 'icons/icon.svg',
            title: 'CoinTracker Price Alert',
            message: `${coin.name} is now ${currency.toUpperCase()} ${coin.current_price.toFixed(2)}`
          });
        }
      }
    }
  } catch (error) {
    console.error('Error updating prices:', error);
  }
}

async function handleUpdateCoinAmount(coinId: string | undefined, amount: number | undefined, sendResponse: (response: any) => void) {
  try {
    if (!coinId) {
      sendResponse({ success: false, error: 'Missing coinId' });
      return;
    }
    const { watchlist } = await chrome.storage.local.get(['watchlist']);
    const currentWatchlist: WatchlistItem[] = watchlist || [];
    
    let updated = false;
    const updatedWatchlist = currentWatchlist.map(item => {
      if (item.coinId === coinId) {
        updated = true;
        return { ...item, amount: amount || 0 };
      }
      return item;
    });
    
    // 如果不在列表中但需要更新数额（理论上不会走到这），自动添加
    if (!updated) {
      updatedWatchlist.push({ coinId, addedAt: Date.now(), amount: amount || 0 });
    }
    
    await chrome.storage.local.set({ watchlist: updatedWatchlist });
    await syncLocalToCloudSilently();
    sendResponse({ success: true });
  } catch (error) {
    console.error('Error updating holding amount:', error);
    sendResponse({ success: false, error: 'Failed to update holding amount' });
  }
}

async function handleUpdateCoinConfig(message: any, sendResponse: (response: any) => void) {
  try {
    if (!message.coinId) {
      sendResponse({ success: false, error: 'Missing coinId' });
      return;
    }

    const { watchlist } = await chrome.storage.local.get(['watchlist']);
    const currentWatchlist: WatchlistItem[] = watchlist || [];
    const alertPrice = typeof message.alertPrice === 'number' && message.alertPrice > 0 ? message.alertPrice : undefined;
    const alertDirection = alertPrice ? message.alertDirection : undefined;
    const alertCurrency = alertPrice ? (message.alertCurrency || 'usd') : undefined;

    let updated = false;
    const updatedWatchlist = currentWatchlist.map(item => {
      if (item.coinId !== message.coinId) return item;
      updated = true;
      return {
        ...item,
        amount: message.amount || 0,
        alertPrice,
        alertDirection,
        alertCurrency
      };
    });

    if (!updated) {
      updatedWatchlist.push({
        coinId: message.coinId,
        addedAt: Date.now(),
        amount: message.amount || 0,
        alertPrice,
        alertDirection,
        alertCurrency
      });
    }

    await chrome.storage.local.set({ watchlist: updatedWatchlist });
    await syncLocalToCloudSilently();
    sendResponse({ success: true });
  } catch (error) {
    console.error('Error updating coin config:', error);
    sendResponse({ success: false, error: 'Failed to update coin config' });
  }
}

async function getSupabaseAuth(): Promise<{ config?: SupabaseConfig; session?: SupabaseSession }> {
  const { supabaseConfig, supabaseSession } = await chrome.storage.local.get(['supabaseConfig', 'supabaseSession']);
  const storedConfig = supabaseConfig as StoredSupabaseConfig | undefined;
  let config: SupabaseConfig | undefined;

  if (storedConfig?.url) {
    let anonKey = '';
    if (storedConfig.encryptedAnonKey) {
      anonKey = await decrypt(storedConfig.encryptedAnonKey);
    } else if (storedConfig.anonKey) {
      anonKey = storedConfig.anonKey;
      const encryptedAnonKey = await encrypt(anonKey);
      await chrome.storage.local.set({
        supabaseConfig: {
          url: storedConfig.url,
          encryptedAnonKey
        }
      });
    }

    config = anonKey ? { url: storedConfig.url, anonKey } : undefined;
  }

  return {
    config,
    session: supabaseSession
  };
}

async function getCloudPayload(session: SupabaseSession) {
  const { watchlist, coinGeckoApiKey } = await chrome.storage.local.get(['watchlist', 'coinGeckoApiKey']);
  return {
    user_id: session.user.id,
    watchlist: watchlist || DEFAULT_WATCHLIST,
    encrypted_api_token: coinGeckoApiKey || undefined
  };
}

async function getVerifiedSession(config: SupabaseConfig, session: SupabaseSession): Promise<SupabaseSession> {
  const user = await SupabaseService.getUser(config, session.access_token);
  const verifiedSession = { ...session, user };
  await chrome.storage.local.set({ supabaseSession: verifiedSession });
  return verifiedSession;
}

async function syncLocalToCloudSilently() {
  try {
    const { config, session } = await getSupabaseAuth();
    if (!config || !session) return;
    const verifiedSession = await getVerifiedSession(config, session);
    await SupabaseService.upsertUserData(config, verifiedSession, await getCloudPayload(verifiedSession));
  } catch (error) {
    console.warn('Cloud sync skipped:', error);
  }
}

async function handleGetSupabaseStatus(sendResponse: (response: any) => void) {
  try {
    const { config, session } = await getSupabaseAuth();
    sendResponse({
      success: true,
      data: {
        configured: Boolean(config?.url && config?.anonKey),
        signedIn: Boolean(session?.access_token && session?.user?.id),
        email: session?.user?.email,
        userId: session?.user?.id,
        supabaseUrl: config?.url || '',
        supabaseAnonKey: config?.anonKey || ''
      }
    });
  } catch (error) {
    sendResponse({ success: false, error: 'Failed to get cloud status' });
  }
}

async function handleSaveSupabaseConfig(supabaseUrl: string, supabaseAnonKey: string, sendResponse: (response: any) => void) {
  try {
    const url = supabaseUrl.trim();
    const anonKey = supabaseAnonKey.trim();
    const config: SupabaseConfig = {
      url,
      anonKey
    };

    if (!config.url || !config.anonKey) {
      await chrome.storage.local.remove(['supabaseConfig', 'supabaseSession']);
      sendResponse({ success: true });
      return;
    }

    const encryptedAnonKey = await encrypt(config.anonKey);
    await chrome.storage.local.set({
      supabaseConfig: {
        url: config.url,
        encryptedAnonKey
      }
    });
    sendResponse({ success: true });
  } catch (error) {
    sendResponse({ success: false, error: 'Failed to save Supabase config' });
  }
}

async function handleSupabaseSignUp(email: string, password: string, sendResponse: (response: any) => void) {
  try {
    const { config } = await getSupabaseAuth();
    if (!config) {
      sendResponse({ success: false, error: '请先保存 Supabase 配置' });
      return;
    }

    const redirectTo = chrome.runtime.getURL('popup.html');
    const session = await SupabaseService.signUp(config, email.trim(), password, redirectTo);
    if (session) {
      await chrome.storage.local.set({ supabaseSession: session });
      const verifiedSession = await getVerifiedSession(config, session);
      await SupabaseService.upsertUserData(config, verifiedSession, await getCloudPayload(verifiedSession));
      sendResponse({ success: true, data: { signedIn: true, email: session.user.email } });
    } else {
      sendResponse({ success: true, data: { signedIn: false, message: '注册成功，请先打开邮箱确认链接，然后再登录' } });
    }
  } catch (error) {
    sendResponse({ success: false, error: error instanceof Error ? error.message : '注册失败' });
  }
}

async function handleSupabaseResendConfirmation(email: string, sendResponse: (response: any) => void) {
  try {
    const { config } = await getSupabaseAuth();
    if (!config) {
      sendResponse({ success: false, error: '请先保存 Supabase 配置' });
      return;
    }

    if (!email.trim()) {
      sendResponse({ success: false, error: '请输入邮箱' });
      return;
    }

    const redirectTo = chrome.runtime.getURL('popup.html');
    await SupabaseService.resendConfirmation(config, email.trim(), redirectTo);
    sendResponse({ success: true, data: { message: '确认邮件已重新发送，请检查邮箱' } });
  } catch (error) {
    sendResponse({ success: false, error: error instanceof Error ? error.message : '发送确认邮件失败' });
  }
}

async function handleSupabaseSignIn(email: string, password: string, sendResponse: (response: any) => void) {
  try {
    const { config } = await getSupabaseAuth();
    if (!config) {
      sendResponse({ success: false, error: '请先保存 Supabase 配置' });
      return;
    }

    const session = await SupabaseService.signIn(config, email.trim(), password);
    await chrome.storage.local.set({ supabaseSession: session });
    sendResponse({ success: true, data: { signedIn: true, email: session.user.email } });
  } catch (error) {
    sendResponse({ success: false, error: error instanceof Error ? error.message : '登录失败' });
  }
}

async function handleSupabaseCompleteAuth(accessToken: string, refreshToken: string, sendResponse: (response: any) => void) {
  try {
    const { config } = await getSupabaseAuth();
    if (!config) {
      sendResponse({ success: false, error: '请先保存 Supabase 配置' });
      return;
    }

    if (!accessToken) {
      sendResponse({ success: false, error: '缺少 Supabase access token' });
      return;
    }

    const user = await SupabaseService.getUser(config, accessToken);
    const session: SupabaseSession = {
      access_token: accessToken,
      refresh_token: refreshToken,
      user
    };

    await chrome.storage.local.set({ supabaseSession: session });
    const verifiedSession = await getVerifiedSession(config, session);
    await SupabaseService.upsertUserData(config, verifiedSession, await getCloudPayload(verifiedSession));
    sendResponse({ success: true, data: { signedIn: true, email: user.email } });
  } catch (error) {
    sendResponse({ success: false, error: error instanceof Error ? error.message : '确认登录失败' });
  }
}

async function handleSupabaseSignOut(sendResponse: (response: any) => void) {
  try {
    await chrome.storage.local.remove(['supabaseSession']);
    sendResponse({ success: true });
  } catch (error) {
    sendResponse({ success: false, error: '退出失败' });
  }
}

async function handleSupabaseUploadLocal(sendResponse: (response: any) => void) {
  try {
    const { config, session } = await getSupabaseAuth();
    if (!config || !session) {
      sendResponse({ success: false, error: '请先登录 Supabase' });
      return;
    }

    const verifiedSession = await getVerifiedSession(config, session);
    const data = await SupabaseService.upsertUserData(config, verifiedSession, await getCloudPayload(verifiedSession));
    sendResponse({ success: true, data });
  } catch (error) {
    sendResponse({ success: false, error: error instanceof Error ? error.message : '上传失败' });
  }
}

async function handleSupabaseDownloadCloud(sendResponse: (response: any) => void) {
  try {
    const { config, session } = await getSupabaseAuth();
    if (!config || !session) {
      sendResponse({ success: false, error: '请先登录 Supabase' });
      return;
    }

    const verifiedSession = await getVerifiedSession(config, session);
    const data = await SupabaseService.getUserData(config, verifiedSession);
    if (!data) {
      sendResponse({ success: false, error: '云端暂无数据' });
      return;
    }

    await chrome.storage.local.set({
      watchlist: data.watchlist || DEFAULT_WATCHLIST,
      coinGeckoApiKey: data.encrypted_api_token || ''
    });

    if (data.encrypted_api_token) {
      const decryptedKey = await decrypt(data.encrypted_api_token);
      CoinGeckoService.setApiKey(decryptedKey);
    } else {
      CoinGeckoService.setApiKey('');
    }

    sendResponse({ success: true, data });
  } catch (error) {
    sendResponse({ success: false, error: error instanceof Error ? error.message : '下载失败' });
  }
}
