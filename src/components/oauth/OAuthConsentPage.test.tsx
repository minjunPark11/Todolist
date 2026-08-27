// @vitest-environment jsdom
//
// The consent screen is the one place where a person decides whether an
// outside AI may read their life, and the only defences on it are things they
// can see: the client's real name, the address the code will be sent to, and
// the state of the account they are about to share. None of that is verifiable
// by looking at the running app without a live OAuth request, so it is pinned
// here.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

const getSession = vi.fn();
const getAuthorizationDetails = vi.fn();
const approveAuthorization = vi.fn();
const denyAuthorization = vi.fn();
const readAccountReadiness = vi.fn();

vi.mock("../../services/supabaseClient", () => ({
  isSupabaseConfigured: true,
  supabaseUrl: "https://project.supabase.co",
  supabase: {
    auth: {
      getSession: () => getSession(),
      oauth: {
        getAuthorizationDetails: (id: string) => getAuthorizationDetails(id),
        approveAuthorization: (id: string, options: unknown) => approveAuthorization(id, options),
        denyAuthorization: (id: string, options: unknown) => denyAuthorization(id, options),
      },
    },
  },
}));

vi.mock("./accountReadiness", async () => {
  const actual = await vi.importActual<typeof import("./accountReadiness")>("./accountReadiness");
  return { ...actual, readAccountReadiness: () => readAccountReadiness() };
});

import { OAuthConsentPage } from "./OAuthConsentPage";

const replace = vi.fn();

function setLocation(search: string) {
  Object.defineProperty(window, "location", {
    configurable: true,
    value: { pathname: "/oauth/consent", search, replace, href: `http://app.test/oauth/consent${search}` },
  });
}

const CLAUDE = {
  authorization_id: "auth-1",
  redirect_uri: "https://claude.ai/api/mcp/auth_callback",
  client: { id: "client-1", name: "Claude", uri: "https://claude.ai", logo_uri: "" },
  user: { id: "user-1", email: "someone@example.com" },
  scope: "openid profile email",
};

beforeEach(() => {
  vi.clearAllMocks();
  setLocation("?authorization_id=auth-1");
  window.localStorage.setItem("focusflow.appData.v1", JSON.stringify({ appSettings: { language: "en" } }));
  getSession.mockResolvedValue({ data: { session: { access_token: "t" } } });
  getAuthorizationDetails.mockResolvedValue({ data: CLAUDE, error: null });
  readAccountReadiness.mockResolvedValue({ state: "ready", taskCount: 12 });
});

afterEach(cleanup);

describe("what the screen shows", () => {
  it("names the client and the address the code will be sent to, verbatim", async () => {
    // R4: dynamic registration lets anyone register a client called anything.
    // A person recognising "that is not where I came from" is the only defence
    // that exists, so the address is shown in full and never truncated.
    render(<OAuthConsentPage />);

    expect(await screen.findByText("Connect Claude?")).toBeTruthy();
    expect(screen.getByText("https://claude.ai/api/mcp/auth_callback")).toBeTruthy();
    expect(screen.getByText(/do not recognise the name and address/i)).toBeTruthy();
  });

  it("says what the connection can and cannot do", async () => {
    render(<OAuthConsentPage />);

    expect(await screen.findByText(/Cannot change or delete anything/i)).toBeTruthy();
    expect(screen.getByText(/disconnect it any time/i)).toBeTruthy();
  });
});

describe("the sync gate", () => {
  it("blocks an account that holds nothing", async () => {
    // M2. Connecting an empty account produces an assistant that says "you
    // have nothing today" forever, with complete confidence.
    readAccountReadiness.mockResolvedValue({ state: "empty", taskCount: 0 });
    render(<OAuthConsentPage />);

    const allow = await screen.findByRole("button", { name: "Allow" });
    await waitFor(() => expect((allow as HTMLButtonElement).disabled).toBe(true));
    expect(screen.getByText(/holds nothing yet/i)).toBeTruthy();
  });

  it("blocks when it could not check", async () => {
    readAccountReadiness.mockResolvedValue({ state: "unknown", taskCount: 0 });
    render(<OAuthConsentPage />);

    const allow = await screen.findByRole("button", { name: "Allow" });
    await waitFor(() => expect((allow as HTMLButtonElement).disabled).toBe(true));
  });

  it("warns about a stale account but lets it through", async () => {
    readAccountReadiness.mockResolvedValue({ state: "stale", taskCount: 4 });
    render(<OAuthConsentPage />);

    expect(await screen.findByText(/not synced in a while/i)).toBeTruthy();
    const allow = screen.getByRole("button", { name: "Allow" });
    await waitFor(() => expect((allow as HTMLButtonElement).disabled).toBe(false));
  });
});

describe("the decision", () => {
  it("approves and sends the browser where Supabase says", async () => {
    approveAuthorization.mockResolvedValue({ data: { redirect_url: "https://claude.ai/cb?code=abc" }, error: null });
    render(<OAuthConsentPage />);

    const allow = await screen.findByRole("button", { name: "Allow" });
    await waitFor(() => expect((allow as HTMLButtonElement).disabled).toBe(false));
    await userEvent.click(allow);

    expect(approveAuthorization).toHaveBeenCalledWith("auth-1", { skipBrowserRedirect: true });
    await waitFor(() => expect(replace).toHaveBeenCalledWith("https://claude.ai/cb?code=abc"));
  });

  it("denies without asking anything else", async () => {
    denyAuthorization.mockResolvedValue({ data: { redirect_url: "https://claude.ai/cb?error=access_denied" }, error: null });
    render(<OAuthConsentPage />);

    await userEvent.click(await screen.findByRole("button", { name: "Deny" }));

    expect(denyAuthorization).toHaveBeenCalledWith("auth-1", { skipBrowserRedirect: true });
    await waitFor(() => expect(replace).toHaveBeenCalledWith("https://claude.ai/cb?error=access_denied"));
  });

  it("keeps a failure on this page instead of redirecting into an error", async () => {
    approveAuthorization.mockResolvedValue({ data: null, error: { message: "no" } });
    render(<OAuthConsentPage />);

    const allow = await screen.findByRole("button", { name: "Allow" });
    await waitFor(() => expect((allow as HTMLButtonElement).disabled).toBe(false));
    await userEvent.click(allow);

    expect(await screen.findByText(/did not go through/i)).toBeTruthy();
    expect(replace).not.toHaveBeenCalled();
  });
});

describe("before there is anyone to ask", () => {
  it("sends a signed-out visitor to sign in, and asks to be sent back", async () => {
    getSession.mockResolvedValue({ data: { session: null } });
    render(<OAuthConsentPage />);

    const link = (await screen.findByRole("link", { name: "Go to sign in" })) as HTMLAnchorElement;
    expect(link.getAttribute("href")).toBe(
      `/login?returnTo=${encodeURIComponent("/oauth/consent?authorization_id=auth-1")}`,
    );
  });

  it("says so when the request is missing or expired", async () => {
    setLocation("");
    render(<OAuthConsentPage />);
    expect(await screen.findByText(/no request here/i)).toBeTruthy();

    cleanup();
    setLocation("?authorization_id=auth-1");
    getAuthorizationDetails.mockResolvedValue({ data: null, error: { message: "gone" } });
    render(<OAuthConsentPage />);
    expect(await screen.findByText(/expired or is not valid/i)).toBeTruthy();
  });

  it("does not ask twice when consent was already given", async () => {
    // Supabase answers with a redirect instead of details. Showing the screen
    // again would train people to click Allow without reading it.
    getAuthorizationDetails.mockResolvedValue({ data: { redirect_url: "https://claude.ai/cb?code=xyz" }, error: null });
    render(<OAuthConsentPage />);

    await waitFor(() => expect(replace).toHaveBeenCalledWith("https://claude.ai/cb?code=xyz"));
  });
});
