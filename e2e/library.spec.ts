import { expect, test } from "@playwright/test";
import { readFileSync } from "node:fs";
import path from "path";

const tone = path.join(process.cwd(), "public", "fixtures", "tone.wav");

// Runs against production `npx next start -p 4173` (see playwright.config.ts). Not an iPhone or Drive upload check.
test("imports a generated tone, plays it, and reopens it offline", async ({ page, context }) => {
  await page.goto("/");
  await page.getByText("Nothing in the library yet").waitFor();
  await page.getByLabel("Import audio").setInputFiles(tone);
  await expect(page.getByText("Available offline")).toBeVisible();
  await page.getByRole("listitem").getByRole("button", { name: "Play" }).click();
  await expect(page.getByRole("contentinfo").getByRole("button", { name: "Pause" })).toBeVisible();
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
  await page.reload();
  await expect(page.getByText("Available offline")).toBeVisible();
});

test("restores the current queue track without autoplay after the final track ends", async ({ page }) => {
  await page.goto("/");
  await page.getByText("Nothing in the library yet").waitFor();
  await page.getByLabel("Import audio").setInputFiles(tone);
  await page.getByRole("button", { name: "Play tone", exact: true }).click();

  const audio = page.locator("audio");
  const current = page.getByRole("list", { name: "Queue" }).getByRole("listitem");
  await expect(audio).toHaveJSProperty("ended", true);
  await expect(current).toHaveAttribute("aria-current", "true");

  await page.reload();
  await expect(current).toHaveText("tone");
  await expect(current).toHaveAttribute("aria-current", "true");
  await expect(audio).toHaveJSProperty("paused", true);
  await page.getByRole("contentinfo").getByRole("button", { name: "Play", exact: true }).click();
  await expect(audio).toHaveJSProperty("paused", false);

  await page.getByRole("link", { name: "Settings" }).click();
  await page.getByLabel("New local profile name").fill("Second profile");
  await page.getByRole("button", { name: "Create and switch to a new local profile" }).click();
  await expect(page.getByRole("status")).toContainText("Second profile");
  await expect(current).toHaveCount(0);
  await expect(audio).toHaveJSProperty("paused", true);
  await page.getByRole("button", { name: "Choose local profile This device" }).click();
  await expect(current).toHaveText("tone");
  await expect(audio).toHaveJSProperty("paused", true);
});

test("appends tracks in order after a playlist removal", async ({ page }) => {
  await page.goto("/");
  await page.getByText("Nothing in the library yet").waitFor();
  await page.getByLabel("Import audio").setInputFiles(
    ["One", "Two", "Three", "Four"].map((title, index) => {
      const buffer = readFileSync(tone);
      buffer.writeInt16LE(index, 44);
      return { name: `${title}.wav`, mimeType: "audio/wav", buffer };
    }),
  );
  await expect(page.getByText("Available offline")).toHaveCount(4);
  await page.getByRole("link", { name: "Playlists" }).click();
  await page.getByLabel("Playlist name").fill("Test playlist");
  await page.getByRole("button", { name: "Create playlist" }).click();
  await expect(page.getByRole("heading", { name: "Test playlist" })).toBeVisible();
  await page.getByRole("link", { name: "Library" }).click();
  for (const title of ["One", "Two", "Three"]) {
    await page.getByRole("button", { name: `Add ${title} to Test playlist` }).click();
  }
  await page.getByRole("link", { name: "Playlists" }).click();
  const playlist = page.getByRole("article").filter({ has: page.getByRole("heading", { name: "Test playlist" }) });
  await expect(playlist.getByRole("listitem")).toHaveCount(3);
  await page.getByRole("button", { name: "Remove One from Test playlist" }).click();
  await expect(playlist.getByRole("listitem")).toHaveCount(2);
  await expect(playlist.getByText("Version 5.")).toBeVisible();
  await page.getByRole("link", { name: "Library" }).click();
  await page.getByRole("button", { name: "Add Four to Test playlist" }).click();
  await page.getByRole("link", { name: "Playlists" }).click();
  await expect(playlist.getByRole("listitem")).toHaveText([/1\. Two/, /2\. Three/, /3\. Four/]);
});
