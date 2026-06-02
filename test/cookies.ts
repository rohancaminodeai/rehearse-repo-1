/**
 * In-memory cookie jar used to mock `next/headers` `cookies()` in integration
 * tests. App Router route handlers call `cookies()` (which throws outside a real
 * request scope), so `test/setup.ts` mocks `next/headers` to return this jar.
 * Tests can seed an auth cookie before calling a handler and assert on cookies
 * the handler sets/clears.
 */
export interface JarCookie {
  name: string;
  value: string;
}

class TestCookieJar {
  private store = new Map<string, string>();

  get(name: string): JarCookie | undefined {
    const value = this.store.get(name);
    return value === undefined ? undefined : { name, value };
  }

  getAll(): JarCookie[] {
    return [...this.store.entries()].map(([name, value]) => ({ name, value }));
  }

  set(name: string, value: string): void {
    // Mirrors the subset of next/headers cookie options our code passes; we only
    // need name+value for assertions. maxAge:0 (clear) removes the entry.
    this.store.set(name, value);
  }

  delete(name: string): void {
    this.store.delete(name);
  }

  reset(): void {
    this.store.clear();
  }
}

export const cookieJar = new TestCookieJar();
export const resetCookieJar = (): void => cookieJar.reset();
