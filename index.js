import { launch } from "puppeteer";
import $ from "cheerio";
import { CronJob } from "cron";
import { Telegraf } from "telegraf";
import dotenv from "dotenv";
dotenv.config();

const bot = new Telegraf(process.env.BOT_API);

bot.start((ctx) => {
    console.log("bot started");
    ctx.reply(
        "⭐ Benvenuto/a nel bot di tracciamento dei prezzi Amazon ⭐\n\nPuoi inserire i prodotti che desideri per comprarli al presso giusto!",
        {
            reply_markup: {
                inline_keyboard: [
                    [{ text: "➕ Aggiungi", callback_data: "add" }],
                    [{ text: "🗒️ Lista", callback_data: "list" }]
                ]
            }
        }
    )
})

bot.action("add", (ctx) => {
    ctx.deleteMessage();
    ctx.reply("Inserisci il link del prodotto:", {
        reply_markup: {
            inline_keyboard: [
                [{ text: "❌ ANNULLA ❌", callback_data: "undo" }]
            ]
        }
    });
    currentState = states.URL;
})

bot.action("list", (ctx) => {

})

bot.action("undo", (ctx) => {
    ctx.deleteMessage();
    bot.stop();
})

bot.on("message", (ctx) => {
    ctx.deleteMessage();
    let input = undefined;
    try {
        switch (currentState) {
            case states.URL:
                input = ctx.message.text;
                console.log("URL: ", input);
                if (isValidURL(input)) {
                    url = input;
                    ctx.reply("Inserisci il prezzo del prodotto:");
                    currentState = states.PRICE;
                }
                else
                    ctx.reply("Il link non è nel formato corretto!");
                break;
            case states.PRICE:
                input = ctx.message.text;
                if (!isNaN(input)) {
                    targetPrice = input;
                    products.push({ url: url, price: targetPrice });
                    console.log("products: ", products);
                    startTracking(url, targetPrice, ctx);
                    currentState = states.NONE;
                }
                else ctx.reply("Il prezzo non è nel formato corretto!");
                break;
            default:
                break;
        }
    } catch (e) {
        console.error(e);
    }
})

bot.launch();

let url = undefined;
let targetPrice = undefined;
let products = [];
let states = { NONE: undefined, URL: "URL", PRICE: "PRICE", DONE: "DONE" };
let currentState = states.NONE;

function isValidURL(str) {
    try {
        new URL(str);
    } catch (e) {
        console.error(e);
        return false;
    }
    return true;
}

async function configureBrowser(url) {
    const browser = await launch();
    const page = await browser.newPage();
    await page.goto(url);
    return page;
}

async function checkPrice(page, targetPrice, ctx) {
    await page.reload();
    let html = await page.evaluate(() => document.body.innerHTML);
    let productTitle = $("#productTitle", html).text().trim();
    let currentPrice = $("#priceblock_ourprice", html).text();
    currentPrice = currentPrice.replace(" ", "");
    const regex = new RegExp("(-?[0-9]+[\.]*[0-9]\€*)|(-?\$[0-9]+[\.]*[0-9]*)");
    currentPrice = currentPrice.match(regex)[0];
    currentPrice = Number(currentPrice);
    targetPrice = Number(targetPrice);
    let buyable = currentPrice <= targetPrice;
    const msgTitle = "Prodotto: " + productTitle;
    const msgPrice = "Prezzo corrente: " + currentPrice;
    const msgBuyable = "Da comprare? " + (buyable ? "SI" : "NO");
    ctx.reply(msgTitle + "\n\n" + msgPrice + "\n\n" + msgBuyable);
}

async function startTracking(url, targetPrice, ctx) {
    const page = await configureBrowser(url);
    let job = new CronJob("*/15 * * * * *", () => {
        checkPrice(page, targetPrice, ctx);
    }, null, true, null, null, true);
    job.start();
}
