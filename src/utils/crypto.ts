/**
 * Crypto utility for encrypting and decrypting sensitive data (like API keys)
 * in Chrome Extension storage using Web Crypto API (AES-GCM).
 */

declare const __ENCRYPTION_KEY__: string;
declare const __ENCRYPTION_SALT__: string;

const ENCRYPTION_KEY = __ENCRYPTION_KEY__;
const SALT = __ENCRYPTION_SALT__;
const ENCRYPTED_VALUE_PREFIX = 'v1:';

export const isEncryptedValue = (value: string): boolean => value.startsWith(ENCRYPTED_VALUE_PREFIX);

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
        
        return `${ENCRYPTED_VALUE_PREFIX}${btoa(String.fromCharCode(...Array.from(combined)))}`;
    } catch (error) {
        console.error('Encryption failed:', error);
        return '';
    }
};

export const decrypt = async (cipherTextBase64: string): Promise<string> => {
    if (!cipherTextBase64) return '';

    const hasVersionPrefix = cipherTextBase64.startsWith(ENCRYPTED_VALUE_PREFIX);
    const encodedValue = hasVersionPrefix
        ? cipherTextBase64.slice(ENCRYPTED_VALUE_PREFIX.length)
        : cipherTextBase64;

    try {
        const key = await getPasswordKey();
        const binaryStr = atob(encodedValue);
        const combined = new Uint8Array(binaryStr.length);
        for (let i = 0; i < binaryStr.length; i++) {
            combined[i] = binaryStr.charCodeAt(i);
        }

        // AES-GCM data contains a 12-byte IV and at least a 16-byte auth tag.
        // Short unversioned values are from releases that stored keys as plain text.
        if (combined.length < 28) {
            return hasVersionPrefix ? '' : cipherTextBase64;
        }
        
        const iv = combined.slice(0, 12);
        const data = combined.slice(12);
        
        const decrypted = await crypto.subtle.decrypt(
            { name: 'AES-GCM', iv },
            key,
            data
        );
        
        return new TextDecoder().decode(decrypted);
    } catch {
        // Older releases stored API keys and Supabase keys as plain text. Values
        // that are not base64 are safe to return for the caller to migrate.
        try {
            atob(encodedValue);
        } catch {
            return hasVersionPrefix ? '' : cipherTextBase64;
        }

        // A valid encrypted payload may have been created with another build key.
        // It cannot be recovered here, but it should not break the service worker.
        return '';
    }
};
