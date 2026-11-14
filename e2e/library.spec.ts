import { expect, test } from "@playwright/test";
import path from "path";

// Runs against production `npx next start -p 4173` (see playwright.config.ts). Not an iPhone or Drive upload check.
test("imports a generated tone, plays it, and reopens it offline", async ({ page, context }) => {
  await page.goto("/");
  await page.getByText("Nothing in the library yet").waitFor();
  await page.getByLabel("Import audio").setInputFiles(path.join(process.cwd(), "public", "fixtures", "tone.wav"));
  await expect(page.getByText("Available offline")).toBeVisible();
  await page.getByRole("listitem").getByRole("button", { name: "Play" }).click();
  await expect(page.getByRole("contentinfo").getByRole("button", { name: "Pause" })).toBeVisible();
  const audio = page.locator("audio");
  await expect.poll(async () => audio.evaluate((element: HTMLAudioElement) => element.currentTime)).toBeGreaterThan(0.05);
  const beforeSeek = await audio.evaluate((element: HTMLAudioElement) => element.currentTime);
  await page.getByLabel("Seek").fill("1");
  await expect.poll(async () => audio.evaluate((element: HTMLAudioElement) => element.paused)).toBe(false);
  await expect.poll(async () => audio.evaluate((element: HTMLAudioElement) => element.currentTime)).toBeGreaterThan(beforeSeek);
  await page.getByRole("link", { name: "Playlists" }).click();
  await expect(page.getByRole("heading", { name: "Playlists" })).toBeVisible();
  await expect(page.getByRole("contentinfo").getByRole("button", { name: "Pause" })).toBeVisible();
  await page.evaluate(() => navigator.serviceWorker.ready);
  await page.goto("/");
  await expect(page.getByText("Available offline")).toBeVisible();
  await context.setOffline(true);
  await page.reload();
  await expect(page.getByRole("heading", { name: "Fujara" })).toBeVisible();
  await expect(page.getByText("Available offline")).toBeVisible();
  await page.getByRole("listitem").getByRole("button", { name: "Play" }).click();
  await expect.poll(async () => page.locator("audio").evaluate((element: HTMLAudioElement) => element.paused)).toBe(false);
  const offlineStart = await page.locator("audio").evaluate((element: HTMLAudioElement) => element.currentTime);
  await expect.poll(async () => page.locator("audio").evaluate((element: HTMLAudioElement) => element.currentTime)).toBeGreaterThan(offlineStart);
  await page.locator("audio").evaluate((element: HTMLAudioElement) => {
    element.currentTime = Math.min(1, (element.duration || 2) / 2);
  });
  await expect.poll(async () => page.locator("audio").evaluate((element: HTMLAudioElement) => element.currentTime)).toBeGreaterThan(0.4);
});
