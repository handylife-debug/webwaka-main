import { createCipheriv, createDecipheriv, randomBytes, scrypt, createHash } from 'crypto';
import { promisify } from 'util';

const scryptAsync = promisify(scrypt);

// Get encryption key from environment or generate for development
const getEncryptionKey = async (): Promise<Buffer> => {
  const key = process.env.ENCRYPTION_KEY;
  if (!key) {
    if (process.env.NODE_ENV === 'production') {
      throw new Error('ENCRYPTION_KEY environment variable is required in production');
    }
    // Use a default key for development (not secure, only for dev)
    return Buffer.from('dev-key-32-chars-not-secure-at-all!');
  }
  
  // Derive 32-byte key from environment variable
  return (await scryptAsync(key, 'salt', 32)) as Buffer;
};

/**
 * Encrypt data using AES-256-CBC
 */
export async function encrypt(text: string): Promise<string> {
  try {
    const key = await getEncryptionKey();
    const iv = randomBytes(16);
    const cipher = createCipheriv('aes-256-cbc', key, iv);
    
    let encrypted = cipher.update(text, 'utf8', 'hex');
    encrypted += cipher.final('hex');
    
    // Return IV + encrypted data as hex string
    return iv.toString('hex') + ':' + encrypted;
  } catch (error) {
    console.error('Encryption failed:', error);
    throw new Error('Failed to encrypt data');
  }
}

/**
 * Decrypt data using AES-256-CBC
 */
export async function decrypt(encryptedText: string): Promise<string> {
  try {
    const key = await getEncryptionKey();
    const parts = encryptedText.split(':');
    
    if (parts.length !== 2) {
      throw new Error('Invalid encrypted data format');
    }
    
    const iv = Buffer.from(parts[0], 'hex');
    const encrypted = parts[1];
    
    const decipher = createDecipheriv('aes-256-cbc', key, iv);
    let decrypted = decipher.update(encrypted, 'hex', 'utf8');
    decrypted += decipher.final('utf8');
    
    return decrypted;
  } catch (error) {
    console.error('Decryption failed:', error);
    throw new Error('Failed to decrypt data');
  }
}

/**
 * Simple hash function for non-sensitive data
 */
export function simpleHash(data: string): string {
  return createHash('sha256').update(data).digest('hex');
}

// Synchronous versions for compatibility
export function encryptSync(text: string): string {
  try {
    const key = process.env.ENCRYPTION_KEY;
    if (!key) {
      if (process.env.NODE_ENV === 'production') {
        throw new Error('ENCRYPTION_KEY environment variable is required in production');
      }
      // Use a simple encoding for development (not secure)
      return Buffer.from(text).toString('base64');
    }
    
    // For synchronous operation, use a simpler approach
    const keyBuffer = Buffer.from(key.padEnd(32, '0').slice(0, 32));
    const iv = randomBytes(16);
    const cipher = createCipheriv('aes-256-cbc', keyBuffer, iv);
    
    let encrypted = cipher.update(text, 'utf8', 'hex');
    encrypted += cipher.final('hex');
    
    return iv.toString('hex') + ':' + encrypted;
  } catch (error) {
    console.error('Sync encryption failed:', error);
    throw new Error('Failed to encrypt data');
  }
}

export function decryptSync(encryptedText: string): string {
  try {
    const key = process.env.ENCRYPTION_KEY;
    if (!key) {
      if (process.env.NODE_ENV === 'production') {
        throw new Error('ENCRYPTION_KEY environment variable is required in production');
      }
      // Use simple decoding for development
      return Buffer.from(encryptedText, 'base64').toString();
    }
    
    const parts = encryptedText.split(':');
    if (parts.length !== 2) {
      throw new Error('Invalid encrypted data format');
    }
    
    const keyBuffer = Buffer.from(key.padEnd(32, '0').slice(0, 32));
    const iv = Buffer.from(parts[0], 'hex');
    const encrypted = parts[1];
    
    const decipher = createDecipheriv('aes-256-cbc', keyBuffer, iv);
    let decrypted = decipher.update(encrypted, 'hex', 'utf8');
    decrypted += decipher.final('utf8');
    
    return decrypted;
  } catch (error) {
    console.error('Sync decryption failed:', error);
    throw new Error('Failed to decrypt data');
  }
}