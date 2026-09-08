// The asymmetry this closes cost a full debugging session: the browser accepted
// a value the functions did not, so the app signed in perfectly while every
// serverless call refused the resulting token.
import { describe, expect, it } from "vitest";
import { readSupabaseEnv } from "./data/repository";
import { readServiceRoleEnv } from "../integrations/google/env";
import { supabaseOrigin } from "./supabaseOrigin";

const PROJECT = "https://pxhbbnirodqjgpdbuqss.supabase.co";

describe("the project address", () => {
  it("is already itself when written plainly", () => {
    expect(supabaseOrigin(PROJECT)).toBe(PROJECT);
  });

  it("drops the path someone copied out of the address bar", () => {
    // The value that broke this deployment. `issuerFor` would otherwise append
    // a second `/auth/v1` and the key set would 404.
    expect(supabaseOrigin(`${PROJECT}/auth/v1`)).toBe(PROJECT);
    expect(supabaseOrigin(`${PROJECT}/rest/v1/`)).toBe(PROJECT);
    expect(supabaseOrigin(`${PROJECT}/auth/v1/.well-known/jwks.json`)).toBe(PROJECT);
  });

  it("drops trailing slashes and surrounding space", () => {
    expect(supabaseOrigin(`  ${PROJECT}///  `)).toBe(PROJECT);
  });

  it("hands back something that is not a URL, rather than emptying it", () => {
    // Emptying it would read as "the variable is missing", which is a different
    // repair from "the variable is a typo".
    expect(supabaseOrigin("  not a url/  ")).toBe("not a url");
  });
});

describe("both readers agree with the browser", () => {
  it("normalizes the anon-key environment", () => {
    const env = { SUPABASE_URL: `${PROJECT}/auth/v1`, SUPABASE_ANON_KEY: "anon" } as never;
    expect(readSupabaseEnv(env).url).toBe(PROJECT);
  });

  it("normalizes the service-role environment", () => {
    const env = { SUPABASE_URL: `${PROJECT}/auth/v1`, SUPABASE_SERVICE_ROLE_KEY: "service" } as never;
    expect(readServiceRoleEnv(env).url).toBe(PROJECT);
  });

  it("still falls back to the VITE_ pair, which is what deployments actually set", () => {
    const env = { VITE_SUPABASE_URL: `${PROJECT}/auth/v1`, VITE_SUPABASE_ANON_KEY: "anon" } as never;
    expect(readSupabaseEnv(env).url).toBe(PROJECT);
  });
});
