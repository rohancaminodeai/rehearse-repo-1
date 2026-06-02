/**
 * In-memory cookie jar used to mock `next/headers` `cookies()` in integration
 * tests. App Router route handlers call `cookies()` (which throws outside a real
 * request scope), so `test/setup.ts` mocks `next/headers` to return this jar.
 * Tests can seed an auth cookie before calling a handler and assert on cookies
 * the handler sets/clears.
 */
export interface CookieOptions {
  httpOnly?: boolean;
  secure?: boolean;
  sameSite?: "lax" | "strict" | "none" | boolean;
  path?: string;
  maxAge?: number;
}

export interface JarCookie {
  name: string;
  value: string;
}

class TestCookieJar {
  private store = new Map<string, { value: string; options: CookieOptions }>();

  get(name: string): JarCookie | undefined {
    const entry = this.store.get(name);
    return entry === undefined ? undefined : { name, value: entry.value };
  }

  getAll(): JarCookie[] {
    return [...this.store.entries()].map(([name, { value }]) => ({ name, value }));
  }

  /** Options the handler passed when setting this cookie (for httpOnly/secure assertions). */
  getOptions(name: string): CookieOptions | undefined {
    return this.store.get(name)?.options;
  }

  set(name: string, value: string, options: CookieOptions = {}): void {
    // Mirrors next/headers cookies().set(name, value, options). We retain the
    // options so tests can assert httpOnly/secure (rule 6).
    this.store.set(name, { value, options });
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
