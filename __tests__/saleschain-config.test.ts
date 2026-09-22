// @vitest-environment node
import { afterEach, expect, test, vi } from "vitest";
import { getSalesChainBaseUrl, SalesChainConfigError } from "@/lib/saleschain/config";

afterEach(() => {
  vi.unstubAllEnvs();
});

test("throws a config error when unset", () => {
  vi.stubEnv("SALESCHAIN_API_BASE_URL", "");
  expect(() => getSalesChainBaseUrl()).toThrow(SalesChainConfigError);
});

test("requires https in Production", () => {
  vi.stubEnv("NODE_ENV", "production");
  vi.stubEnv("SALESCHAIN_API_BASE_URL", "http://api.saleschain.example");
  expect(() => getSalesChainBaseUrl()).toThrow(SalesChainConfigError);
});

test("accepts an absolute https URL in Production", () => {
  vi.stubEnv("NODE_ENV", "production");
  vi.stubEnv("SALESCHAIN_API_BASE_URL", "https://api.saleschain.example");
  expect(getSalesChainBaseUrl()).toBe("https://api.saleschain.example");
});

test("rejects a non-localhost http URL outside Production", () => {
  vi.stubEnv("NODE_ENV", "development");
  vi.stubEnv("SALESCHAIN_API_BASE_URL", "http://api.saleschain.example");
  expect(() => getSalesChainBaseUrl()).toThrow(SalesChainConfigError);
});

test("permits an explicit http://localhost URL outside Production", () => {
  vi.stubEnv("NODE_ENV", "development");
  vi.stubEnv("SALESCHAIN_API_BASE_URL", "http://localhost:4000");
  expect(getSalesChainBaseUrl()).toBe("http://localhost:4000");
});

test("permits http://127.0.0.1 outside Production", () => {
  vi.stubEnv("NODE_ENV", "test");
  vi.stubEnv("SALESCHAIN_API_BASE_URL", "http://127.0.0.1:4000");
  expect(getSalesChainBaseUrl()).toBe("http://127.0.0.1:4000");
});

test("rejects http://localhost in Production", () => {
  vi.stubEnv("NODE_ENV", "production");
  vi.stubEnv("SALESCHAIN_API_BASE_URL", "http://localhost:4000");
  expect(() => getSalesChainBaseUrl()).toThrow(SalesChainConfigError);
});

test("trims a single trailing slash deterministically", () => {
  vi.stubEnv("NODE_ENV", "production");
  vi.stubEnv("SALESCHAIN_API_BASE_URL", "https://api.saleschain.example/");
  expect(getSalesChainBaseUrl()).toBe("https://api.saleschain.example");
});

test("rejects an unexpected base path", () => {
  vi.stubEnv("NODE_ENV", "production");
  vi.stubEnv("SALESCHAIN_API_BASE_URL", "https://api.saleschain.example/edge///");
  expect(() => getSalesChainBaseUrl()).toThrow(SalesChainConfigError);
});

test("rejects embedded credentials", () => {
  vi.stubEnv("NODE_ENV", "production");
  vi.stubEnv("SALESCHAIN_API_BASE_URL", "https://user:pass@api.saleschain.example");
  expect(() => getSalesChainBaseUrl()).toThrow(SalesChainConfigError);
});

test("rejects a malformed URL", () => {
  vi.stubEnv("NODE_ENV", "production");
  vi.stubEnv("SALESCHAIN_API_BASE_URL", "not a url");
  expect(() => getSalesChainBaseUrl()).toThrow(SalesChainConfigError);
});

test("rejects a base URL carrying a query string or fragment", () => {
  vi.stubEnv("NODE_ENV", "production");
  vi.stubEnv("SALESCHAIN_API_BASE_URL", "https://api.saleschain.example?x=1");
  expect(() => getSalesChainBaseUrl()).toThrow(SalesChainConfigError);
});
