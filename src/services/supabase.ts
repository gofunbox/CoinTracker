import { WatchlistItem } from '../types';

export interface SupabaseConfig {
  url: string;
  anonKey: string;
}

export interface SupabaseSession {
  access_token: string;
  refresh_token?: string;
  user: {
    id: string;
    email?: string;
  };
}

export interface CloudUserData {
  user_id: string;
  watchlist: WatchlistItem[];
  encrypted_api_token?: string;
  updated_at?: string;
}

export class SupabaseService {
  private static normalizeUrl(url: string): string {
    return url.trim().replace(/\/+$/, '');
  }

  private static headers(config: SupabaseConfig, accessToken?: string): HeadersInit {
    return {
      apikey: config.anonKey,
      Authorization: `Bearer ${accessToken || config.anonKey}`,
      'Content-Type': 'application/json'
    };
  }

  private static async parseResponse(response: Response): Promise<any> {
    const text = await response.text();
    const data = text ? JSON.parse(text) : null;

    if (!response.ok) {
      const message = data?.msg || data?.message || data?.error_description || data?.error || `HTTP ${response.status}`;
      throw new Error(message);
    }

    return data;
  }

  static async signUp(config: SupabaseConfig, email: string, password: string, redirectTo?: string): Promise<SupabaseSession | null> {
    const params = redirectTo ? `?redirect_to=${encodeURIComponent(redirectTo)}` : '';
    const url = `${this.normalizeUrl(config.url)}/auth/v1/signup${params}`;
    const response = await fetch(url, {
      method: 'POST',
      headers: this.headers(config),
      body: JSON.stringify({ email, password })
    });

    const data = await this.parseResponse(response);
    if (!data.access_token || !data.user) return null;
    return data as SupabaseSession;
  }

  static async signIn(config: SupabaseConfig, email: string, password: string): Promise<SupabaseSession> {
    const url = `${this.normalizeUrl(config.url)}/auth/v1/token?grant_type=password`;
    const response = await fetch(url, {
      method: 'POST',
      headers: this.headers(config),
      body: JSON.stringify({ email, password })
    });

    return this.parseResponse(response) as Promise<SupabaseSession>;
  }

  static async getUser(config: SupabaseConfig, accessToken: string): Promise<SupabaseSession['user']> {
    const url = `${this.normalizeUrl(config.url)}/auth/v1/user`;
    const response = await fetch(url, {
      method: 'GET',
      headers: this.headers(config, accessToken)
    });

    return this.parseResponse(response) as Promise<SupabaseSession['user']>;
  }

  static async resendConfirmation(config: SupabaseConfig, email: string, redirectTo?: string): Promise<void> {
    const params = redirectTo ? `?redirect_to=${encodeURIComponent(redirectTo)}` : '';
    const url = `${this.normalizeUrl(config.url)}/auth/v1/resend${params}`;
    const response = await fetch(url, {
      method: 'POST',
      headers: this.headers(config),
      body: JSON.stringify({ type: 'signup', email })
    });

    await this.parseResponse(response);
  }

  static async upsertUserData(config: SupabaseConfig, session: SupabaseSession, data: CloudUserData): Promise<CloudUserData> {
    const url = `${this.normalizeUrl(config.url)}/rest/v1/coin_user_data?on_conflict=user_id`;
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        ...this.headers(config, session.access_token),
        Prefer: 'resolution=merge-duplicates,return=representation'
      },
      body: JSON.stringify(data)
    });

    const rows = await this.parseResponse(response);
    return rows?.[0] || data;
  }

  static async getUserData(config: SupabaseConfig, session: SupabaseSession): Promise<CloudUserData | null> {
    const params = new URLSearchParams({
      user_id: `eq.${session.user.id}`,
      select: '*'
    });
    const url = `${this.normalizeUrl(config.url)}/rest/v1/coin_user_data?${params.toString()}`;
    const response = await fetch(url, {
      method: 'GET',
      headers: this.headers(config, session.access_token)
    });

    const rows = await this.parseResponse(response);
    return rows?.[0] || null;
  }
}
