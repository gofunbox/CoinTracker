/**
 * Crypto utility for encrypting and decrypting sensitive data (like API keys)
 * in Chrome Extension storage using Web Crypto API (AES-GCM).
 */

declare var process: any;

const ENCRYPTION_KEY = process.env.ENCRYPTION_KEY || 'cointracker-secure-key-2026-v2';
const SALT = process.env.ENCRYPTION_SALT || 'cointracker-salt-static';

const getPasswordKey = async () => {
    const enc = new TextEncoder();
    const keyMaterial = await crypto.subtle.importKey(
        'raw', 
        enc.encode(ENCRYPTION_KEY), 
        { name: 'PBKDF2' }, 
        false, 
        ['deriveKey']
    );
    return crypto.subtle.deriveKey(
        {
            name: 'PBKDF2',
            salt: enc.encode(SALT),
            iterations: 100000,
            hash: 'SHA-256'
        },
        keyMaterial,
        { name: 'AES-GCM', length: 256 },
        false,
        ['encrypt', 'decrypt']
    );
};

export const encrypt = async (plainText: string): Promise<string> => {
    if (!plainText) return '';
    try {
        const key = await getPasswordKey();
        const iv = crypto.getRandomValues(new Uint8Array(12));
        const encoded = new TextEncoder().encode(plainText);
        
        const ciphertext = await crypto.subtle.encrypt(
            { name: 'AES-GCM', iv },
            key,
            encoded
        );
        
        const combined = new Uint8Array(iv.length + ciphertext.byteLength);
        combined.set(iv, 0);
        combined.set(new Uint8Array(ciphertext), iv.length);
        
        return btoa(String.fromCharCode(...Array.from(combined)));
    } catch (error) {
        console.error('Encryption failed:', error);
        return '';
    }
};

export const decrypt = async (cipherTextBase64: string): Promise<string> => {
    if (!cipherTextBase64) return '';
    try {
        const key = await getPasswordKey();
        const binaryStr = atob(cipherTextBase64);
        const combined = new Uint8Array(binaryStr.length);
        for (let i = 0; i < binaryStr.length; i++) {
            combined[i] = binaryStr.charCodeAt(i);
        }
        
        const iv = combined.slice(0, 12);
        const data = combined.slice(12);
        
        const decrypted = await crypto.subtle.decrypt(
            { name: 'AES-GCM', iv },
            key,
            data
        );
        
        return new TextDecoder().decode(decrypted);
    } catch (error) {
        console.error('Decryption failed:', error);
        return '';
    }
};
