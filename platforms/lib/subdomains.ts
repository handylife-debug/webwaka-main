import { redis, safeRedisOperation } from '@/lib/redis';

export function isValidIcon(str: string) {
  if (str.length > 10) {
    return false;
  }

  try {
    // Primary validation: Check if the string contains at least one emoji character
    // This regex pattern matches most emoji Unicode ranges
    const emojiPattern = /[\p{Emoji}]/u;
    if (emojiPattern.test(str)) {
      return true;
    }
  } catch (error) {
    // If the regex fails (e.g., in environments that don't support Unicode property escapes),
    // fall back to a simpler validation
    console.warn(
      'Emoji regex validation failed, using fallback validation',
      error
    );
  }

  // Fallback validation: Check if the string is within a reasonable length
  // This is less secure but better than no validation
  return str.length >= 1 && str.length <= 10;
}

type SubdomainData = {
  emoji: string;
  createdAt: number;
};

export async function getSubdomainData(subdomain: string): Promise<SubdomainData | null> {
  const sanitizedSubdomain = subdomain.toLowerCase().replace(/[^a-z0-9-]/g, '');
  
  return await safeRedisOperation(
    async () => {
      const data = await redis.get<SubdomainData>(`subdomain:${sanitizedSubdomain}`);
      return data ?? null;
    },
    null
  );
}

export async function getAllSubdomains() {
  return await safeRedisOperation(
    async () => {
      const keys = await redis.list('subdomain:');

      if (!keys.length) {
        return [];
      }

      const values = await Promise.all(
        keys.map(key => redis.get<SubdomainData>(key))
      );

      return keys.map((key: string, index: number) => {
        const subdomain = key.replace('subdomain:', '');
        const data = values[index];

        return {
          subdomain,
          emoji: data?.emoji || '❓',
          createdAt: data?.createdAt || Date.now()
        };
      });
    },
    []
  );
}
