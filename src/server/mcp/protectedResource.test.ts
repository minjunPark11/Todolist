import { describe, expect, it } from "vitest";
import { issuerFor, protectedResourceMetadata, protectedResourceUrl, readAppUrl } from "./protectedResource";

describe("protectedResourceMetadata", () => {
  const metadata = protectedResourceMetadata({
    appUrl: "https://focusflow.example/",
    supabaseUrl: "https://abcdef.supabase.co",
  });

  it("names the MCP endpoint as the resource, not the app", () => {
    // The token a client obtains is bound to this identifier. Naming the app
    // would let a token minted for the website be replayed at the API.
    expect(metadata.resource).toBe("https://focusflow.example/api/mcp");
  });

  it("points at Supabase's OAuth server, /auth/v1 and all", () => {
    // A client that looks for the metadata one path segment up finds nothing
    // (§26.4b: the document is published under /auth/v1).
    expect(metadata.authorization_servers).toEqual(["https://abcdef.supabase.co/auth/v1"]);
  });

  it("asks for tokens in the header and claims no custom scope", () => {
    // Custom scopes are not supported, which is why read-only is enforced in
    // the database rather than by a scope name (§6.5).
    expect(metadata.bearer_methods_supported).toEqual(["header"]);
    expect(metadata.scopes_supported).not.toContain("focusflow.read");
  });
});

describe("issuerFor", () => {
  it("tolerates a trailing slash", () => {
    expect(issuerFor("https://abcdef.supabase.co/")).toBe("https://abcdef.supabase.co/auth/v1");
  });
});

describe("protectedResourceUrl", () => {
  it("is the address the 401 challenge sends a client to", () => {
    expect(protectedResourceUrl("https://focusflow.example/")).toBe(
      "https://focusflow.example/.well-known/oauth-protected-resource",
    );
  });
});

describe("readAppUrl", () => {
  it("prefers what the deployment was told", () => {
    expect(readAppUrl({ APP_URL: "https://focusflow.example/" } as never)).toBe("https://focusflow.example");
  });

  it("falls back to the deployment's own host so previews work unconfigured", () => {
    expect(readAppUrl({ VERCEL_URL: "preview-abc.vercel.app" } as never)).toBe("https://preview-abc.vercel.app");
  });

  it("answers nothing rather than guessing", () => {
    // A document naming the wrong host sends connectors somewhere real and
    // wrong, which is harder to diagnose than its absence.
    expect(readAppUrl({} as never)).toBeUndefined();
  });
});
