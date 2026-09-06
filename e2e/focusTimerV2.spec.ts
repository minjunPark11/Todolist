import { expect, test, type Page } from "@playwright/test";
import { openApp, STORAGE_KEY } from "./addList.helpers";
const store = (page: Page) =>
  page.evaluate((key) => JSON.parse(localStorage.getItem(key)!), STORAGE_KEY);
async function openFocus(page: Page) {
  await page.clock.install();
  await openApp(page);
  await page.goto("/focus");
  await expect(
    page.getByRole("button", { name: "Start focus", exact: true }),
  ).toBeVisible();
}
test("unassigned stopwatch, pause, finish, records and immersion share a session", async ({
  page,
}) => {
  await openFocus(page);
  await page.getByRole("button", { name: "Start focus", exact: true }).click();
  await expect(page.getByText("Focusing", { exact: true })).toBeVisible();
  
  await page.clock.fastForward(10000);
  await page.getByRole("button", { name: "Pause", exact: true }).click();
  const paused = await store(page);
  expect(paused.focusSessions[0].accumulatedSeconds).toBeGreaterThanOrEqual(10);
  await page
    .getByRole("button", { name: "Immersive view", exact: true })
    .click();
  await expect(page.locator(".focus-immersive")).toBeVisible();
  await page.getByRole("button", { name: "Note", exact: true }).click();
  await page
    .getByRole("textbox", { name: "Note", exact: true })
    .fill("A preserved focus note");
  await page.keyboard.press("Escape");
  await expect(page.locator(".focus-immersive")).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(page.locator(".focus-immersive")).toHaveCount(0);
  await page.getByRole("button", { name: "Resume", exact: true }).click();
  await page.clock.fastForward(5000);
  await page.getByRole("button", { name: "Finish", exact: true }).click();
  await expect(page.getByText("Focus recorded", { exact: true })).toBeVisible();
  const done = await store(page);
  expect(done.focusSessions).toHaveLength(1);
  expect(done.focusSessions[0].taskId).toBeNull();
  expect(done.focusSessions[0].focusNote).toBe("A preserved focus note");
  expect(done.focusSessions[0].segments).toHaveLength(2);
  await page.getByRole("button", { name: "Records", exact: true }).click();
  await expect(page.locator(".focus-record-row")).toHaveCount(1);
});
test("pomodoro deadline saves focus once and keeps break out of records", async ({
  page,
}) => {
  await openFocus(page);
  await page.getByRole("button", {name:"Focus settings",exact:true}).click();
  await page.getByLabel("Focus (minutes)",{exact:true}).fill("1");
  await page.getByRole("button", {name:"Close",exact:true}).click();
  await page.getByRole("button", { name: "Pomodoro", exact: true }).click();
  await page.getByRole("button", { name: "Start focus", exact: true }).click();
  await expect(page.getByText("Focusing", { exact: true })).toBeVisible();
  
  await page.clock.runFor(61 * 1000);
  await expect(page.getByText("Taking a break", { exact: true })).toBeVisible();
  const d = await store(page);
  expect(d.focusSessions).toHaveLength(1);
  expect(d.focusSessions[0].accumulatedSeconds).toBe(60);
  await page.getByRole("button", { name: "End break", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "Start next focus", exact: true }),
  ).toBeVisible();
  expect((await store(page)).focusSessions).toHaveLength(1);
});
test("same-origin tabs do not create a second active timer", async ({
  page,
  context,
}) => {
  await openFocus(page);
  await page.getByRole("button", { name: "Start focus", exact: true }).click();
  await expect(page.getByText("Focusing", { exact: true })).toBeVisible();
  const other = await context.newPage();
  await other.goto("/focus");
  await expect(other.getByText("Focusing", { exact: true })).toBeVisible();
  await other.getByRole("button", { name: "Pause", exact: true }).click();
  await expect(page.getByText("Paused", { exact: true })).toBeVisible();
  expect((await store(page)).focusSessions).toHaveLength(1);
  await other.close();
});
test("main controls fit low desktop screens", async ({ page }) => {
  await openFocus(page);
  for (const [width, height] of [
    [1280, 720],
    [1366, 768],
    [1440, 900],
    [1920, 1080],
  ]) {
    await page.setViewportSize({ width, height });
    const box = await page
      .getByRole("button", { name: "Start focus", exact: true })
      .boundingBox();
    expect(box!.y + box!.height).toBeLessThan(height);
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= window.innerWidth,
      ),
    ).toBe(true);
  }
});

test("failed finish holds its time and retries without adding it twice", async ({page}) => {
  await openFocus(page);
  await page.getByRole("button",{name:"Start focus",exact:true}).click();
  await expect(page.getByText("Focusing",{exact:true})).toBeVisible();
   await page.clock.fastForward(20000);
  await page.evaluate(() => {
    const original=Storage.prototype.setItem;
    (window as unknown as {failFocus:boolean}).failFocus=true;
    Storage.prototype.setItem=function(key,value) { if(key==="focusflow.appData.v1" && (window as unknown as {failFocus:boolean}).failFocus)throw new Error("test quota failure"); original.call(this,key,value); };
  });
  await page.getByRole("button",{name:"Finish",exact:true}).click();
  await expect(page.getByRole("alert")).toContainText("Could not save focus");
  const time=await page.locator(".focus-time").textContent();
  await page.clock.fastForward(60000); expect(await page.locator(".focus-time").textContent()).toBe(time);
  await page.evaluate(()=>{(window as unknown as {failFocus:boolean}).failFocus=false;});
  await page.getByRole("button",{name:"Retry",exact:true}).click();
  await expect(page.getByText("Focus recorded",{exact:true})).toBeVisible();
  const d=await store(page); expect(d.focusSessions).toHaveLength(1); expect(d.focusSessions[0].accumulatedSeconds).toBeLessThan(25);
});

test("web mini window pauses the same session and clears after finish",async({page})=>{
  await openFocus(page); await page.getByRole("button",{name:"Start focus",exact:true}).click();
  await expect(page.getByText("Focusing",{exact:true})).toBeVisible();
  const popupPromise=page.waitForEvent("popup"); await page.getByRole("button",{name:"Mini timer",exact:true}).click(); const popup=await popupPromise;
  await popup.getByRole("button",{name:"Pause",exact:true}).click();
  await expect(page.getByText("Paused",{exact:true})).toBeVisible();
  await popup.getByRole("button",{name:"Finish",exact:true}).click();
  await expect(page.getByText("Focus recorded",{exact:true})).toBeVisible();
  await expect(popup.locator("#status")).toHaveText("Idle"); await expect(popup.locator("#finish")).toBeDisabled();
});

test("link, relink and delete preserve the task contribution balance",async({page})=>{
  await page.clock.install(); await openApp(page); await page.goto("/board");
  const cell=page.locator(".ff-matrix-cell-II");
  for(const title of ["Focus task A","Focus task B"]) {
    await cell.getByRole("button",{name:"Add a task to Schedule"}).click();
    const input=cell.getByRole("textbox",{name:"What belongs in this box?"});
    await input.fill(title); await input.press("Enter"); await expect(cell).toContainText(title);
  }
  await page.goto("/focus"); await page.getByRole("button",{name:"Start focus",exact:true}).click();
  await expect(page.getByText("Focusing",{exact:true})).toBeVisible();  await page.clock.runFor(18000);
  await page.getByRole("button",{name:"Finish",exact:true}).click();
  await page.locator(".focus-result .focus-picker-trigger").click();
  await page.locator(".focus-choice-list").getByRole("button",{name:/Focus task A/}).click();
  let d=await store(page); const seconds=d.focusSessions[0].accumulatedSeconds;
  expect(d.tasks.find((t:{title:string})=>t.title==="Focus task A").actualSeconds).toBe(seconds);
  await page.getByRole("button",{name:"Records",exact:true}).click(); await page.locator(".focus-record-row").click();
  await page.getByRole("button",{name:"Change task",exact:true}).click(); await page.locator(".focus-choice-list").getByRole("button",{name:/Focus task B/}).click();
  d=await store(page); expect(d.tasks.find((t:{title:string})=>t.title==="Focus task A").actualSeconds).toBe(0); expect(d.tasks.find((t:{title:string})=>t.title==="Focus task B").actualSeconds).toBe(seconds);
  await page.getByRole("button",{name:"Delete",exact:true}).click(); await page.getByRole("button",{name:"Delete",exact:true}).click();
  d=await store(page); expect(d.focusSessions).toHaveLength(0); expect(d.tasks.find((t:{title:string})=>t.title==="Focus task B").actualSeconds).toBe(0);
});

test("restores a 47-minute checkpoint without a stopwatch cap",async({page})=>{
  await openApp(page);
  await page.addInitScript(()=>{
    const key="focusflow.appData.v1", d=JSON.parse(localStorage.getItem(key)!);
    const now=new Date().toISOString(), start=new Date(Date.now()-47*60000).toISOString();
    d.focusSessions=[{id:"checkpoint-test",schemaVersion:2,taskId:null,title:"",measurementMode:"stopwatch",mode:"focus",status:"running",durationMinutes:25,accumulatedSeconds:0,accumulatedMs:0,segments:[],startedAt:start,startAt:start,checkpointAt:now,createdAt:start,updatedAt:start}];d.activeSessionId="checkpoint-test";
    localStorage.setItem(key,JSON.stringify(d));
  });
  await page.goto("/focus"); await expect(page.getByText("Recovered · Paused",{exact:true})).toBeVisible();
  const recovered=await store(page); expect(recovered.focusSessions[0].accumulatedSeconds).toBeGreaterThanOrEqual(47*60);
});
