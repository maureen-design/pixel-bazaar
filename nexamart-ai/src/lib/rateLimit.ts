const attempts = new Map<string, { count: number; resetAt: number }>();

export function checkRateLimit(key: string, maxAttempts = 5, windowMs = 60000): boolean {
  const now = Date.now();
  const record = attempts.get(key);

  if (!record || now > record.resetAt) {
    attempts.set(key, { count: 1, resetAt: now + windowMs });
    return true;
  }

  if (record.count >= maxAttempts) {
    return false;
  }

  record.count++;
  return true;
}

export function getRemainingAttempts(key: string, maxAttempts = 5): number {
  const record = attempts.get(key);
  if (!record) return maxAttempts;
  return Math.max(0, maxAttempts - record.count);
}

export function resetRateLimit(key: string): void {
  attempts.delete(key);
}
