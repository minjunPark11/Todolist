// @vitest-environment jsdom
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { I18nProvider } from "../../i18n";
import { GoogleCalendarSourceList } from "./GoogleCalendarSourceList";

const mocks = vi.hoisted(() => ({
  token: vi.fn(), list: vi.fn(), remember: vi.fn(), read: vi.fn(), select: vi.fn(),
}));
vi.mock("../../lib/googleCalendar", async () => ({
  ...await vi.importActual<typeof import("../../lib/googleCalendar")>("../../lib/googleCalendar"),
  currentAccessToken: mocks.token,
  notifyGoogleConnectionChanged: vi.fn(),
}));
vi.mock("../../lib/googleCalendarSources", () => ({
  listGoogleCalendars: mocks.list,
  rememberGoogleCalendars: mocks.remember,
  readGoogleSources: mocks.read,
  setGoogleSourceSelected: mocks.select,
}));

const WORK = { calendarId: "work@example.com", summary: "Work", color: "#ff0000", writable: true, primary: false };
const HOLIDAYS = { calendarId: "holidays", summary: "Holidays", color: "#00ff00", writable: false, primary: false };

beforeEach(() => {
  vi.clearAllMocks();
  mocks.token.mockResolvedValue("ya29.token");
  mocks.list.mockResolvedValue([WORK, HOLIDAYS]);
  mocks.remember.mockResolvedValue(undefined);
  mocks.read.mockResolvedValue([{ ...WORK, selected: true }]);
  mocks.select.mockResolvedValue(undefined);
});
afterEach(cleanup);

const mount = () => render(<I18nProvider lang="en"><GoogleCalendarSourceList /></I18nProvider>);

it("lists the account's calendars with the stored choice already ticked", async () => {
  mount();
  await screen.findByText("Work");
  expect((screen.getByLabelText(/Work/) as HTMLInputElement).checked).toBe(true);
  expect((screen.getByLabelText(/Holidays/) as HTMLInputElement).checked).toBe(false);
});

it("says which calendars cannot be written to, before an edit is attempted", async () => {
  // §6.2: a subscribed holiday calendar is readable and not writable, and
  // offering an edit Google will refuse is worse than not offering one.
  mocks.read.mockResolvedValue([{ ...WORK, selected: true }, { ...HOLIDAYS, selected: true }]);
  mount();
  await screen.findByText("Holidays");
  expect(screen.getByText("read-only")).toBeTruthy();
});

it("saves a tick, and ticks immediately rather than after the round trip", async () => {
  mount();
  await screen.findByText("Holidays");
  fireEvent.click(screen.getByLabelText(/Holidays/));
  expect((screen.getByLabelText(/Holidays/) as HTMLInputElement).checked).toBe(true);
  await waitFor(() => expect(mocks.select).toHaveBeenCalledWith("holidays", true));
});

it("puts the tick back when saving fails, so the screen is not a lie", async () => {
  mocks.select.mockRejectedValueOnce(new Error("offline"));
  mount();
  await screen.findByText("Holidays");
  fireEvent.click(screen.getByLabelText(/Holidays/));
  await screen.findByRole("alert");
  expect((screen.getByLabelText(/Holidays/) as HTMLInputElement).checked).toBe(false);
});

it("offers a retry when the list cannot be read", async () => {
  mocks.list.mockRejectedValueOnce(new Error("nope"));
  mount();
  await screen.findByRole("alert");
  mocks.list.mockResolvedValue([WORK]);
  fireEvent.click(screen.getByRole("button", { name: "Check again" }));
  await screen.findByText("Work");
});

it("draws nothing to choose from when the grant is already gone", async () => {
  mocks.token.mockResolvedValue(null);
  mount();
  await screen.findByText("This account has no calendars to sync.");
});
