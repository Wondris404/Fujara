import { expect, test } from "@playwright/test";
import path from "path";

test("imports a generated tone and shows it in the library", async ({ page }) => {
  await page.goto("/");
  await page.getByLabel("Import audio").setInputFiles(path.join(process.cwd(), "public", "fixtures", "tone.wav"));
  await expect(page.getByText("tone")).toBeVisible();
  await expect(page.getByText("Available offline")).toBeVisible();
  await page.getByRole("button", { name: "Play" }).click();
  await page.getByRole("link", { name: "Playlists" }).click();
  await expect(page.getByRole("heading", { name: "Playlists" })).toBeVisible();
  await page.getByRole("link", { name: "Library" }).click();
  await expect(page.getByText("Available offline")).toBeVisible();
});
