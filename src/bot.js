import "dotenv/config";
import { Telegraf, Markup } from "telegraf";
import { analyzeComposition, formatTelegramReport } from "./analyzer.js";

const token = process.env.TELEGRAM_BOT_TOKEN;
const publicBaseUrl = process.env.PUBLIC_BASE_URL || "http://localhost:3000";

if (!token) {
  console.error("TELEGRAM_BOT_TOKEN is required. Copy .env.example to .env and fill it.");
  process.exit(1);
}

const bot = new Telegraf(token);

bot.start((ctx) => {
  return ctx.reply(
    [
      "Привет. Я MVP «Анатомии косметологии».",
      "",
      "Пришлите INCI-состав текстом, а я разберу активы, SPF-фильтры, отдушки, консерванты и возможные риски.",
      "",
      "Фото состава в этом MVP пока не распознается автоматически, но можно скопировать текст с этикетки."
    ].join("\n"),
    Markup.inlineKeyboard([
      Markup.button.webApp("Открыть приложение", `${publicBaseUrl}/miniapp`)
    ])
  );
});

bot.command("app", (ctx) => {
  return ctx.reply(
    "Откройте Telegram-приложение:",
    Markup.inlineKeyboard([
      Markup.button.webApp("Анатомия косметики", `${publicBaseUrl}/miniapp`)
    ])
  );
});

bot.on("text", async (ctx) => {
  const profile = {
    context: "Пользователь Telegram-бота. Профиль кожи не указан."
  };
  const result = analyzeComposition({ text: ctx.message.text, profile });
  await ctx.reply(formatTelegramReport(result));
});

bot.on("photo", (ctx) => {
  return ctx.reply(
    "Фото лучше обработать в Mini App: там можно открыть камеру, распознать текст и автоматически подставить состав. В чате бота OCR пока не включен.",
    Markup.inlineKeyboard([
      Markup.button.webApp("Открыть приложение", `${publicBaseUrl}/miniapp`)
    ])
  );
});

bot.launch();
console.log("Telegram bot is running.");

process.once("SIGINT", () => bot.stop("SIGINT"));
process.once("SIGTERM", () => bot.stop("SIGTERM"));
