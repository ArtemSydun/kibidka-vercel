import fetch from "node-fetch";
import * as cheerio from "cheerio";
import { Redis } from "@upstash/redis";
import dotenv from "dotenv";
dotenv.config();

const regularUrl = process.env.REGULAR_URL;
const taxFreeUrl = process.env.TAXFREE_URL;

const telegramBotToken = process.env.TELEGRAM_BOT_TOKEN;
const telegramChatId = process.env.TELEGRAM_CHAT_ID;

const redis = new Redis({
  url: process.env.UPSTASH_REDIS_REST_URL,
  token: process.env.UPSTASH_REDIS_REST_TOKEN,
});

async function sendTelegramMessage(text) {
  const telegramUrl = `https://api.telegram.org/bot${telegramBotToken}/sendMessage`;
  await fetch(telegramUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ chat_id: telegramChatId, text }),
  });
}

async function scrapeQuotes(url, redisKey, tag = "") {
  const res = await fetch(url);
  const html = await res.text();
  const $ = cheerio.load(html);
  const newQuotes = [];

  $('div[data-testid="listing-grid"] div[data-cy="l-card"]').each((_, el) => {
    const title = $(el).find("h4").text();
    const price = $(el).find('p[data-testid="ad-price"]').text();
    const href = $(el).find("a").attr("href");
    const date = $(el).find('p[data-testid="location-date"]').text();
    const fullUrl = "https://www.olx.ua" + href;

    newQuotes.push({ title, price, date, url: fullUrl });
  });

  for (const quote of newQuotes) {
    const alreadySeen = await redis.sismember(redisKey, quote.url);
    if (!alreadySeen) {
      await redis.sadd(redisKey, quote.url);
      const msg = `${tag}${quote.title}\n${quote.price}\n${quote.date}\n${quote.url}`;
      await sendTelegramMessage(msg);
    }
  }
}

(async function main() {
  while (true) {
    console.log("🔍 Scraping...");
    try {
      await scrapeQuotes(regularUrl, "seen_regular");
      await scrapeQuotes(taxFreeUrl, "seen_taxfree", "‼️ БЕЗ КОМІСІЇ ‼️\n");
      console.log("✅ Done");
    } catch (e) {
      console.error("❌ Error:", e);
    }
    await new Promise((r) => setTimeout(r, 5 * 60 * 1000)); // 5 minutes
  }
})();
