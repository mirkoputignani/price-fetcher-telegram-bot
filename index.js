import puppeteer from "puppeteer";
import $ from "cheerio";
import { CronJob } from "cron";
import { Telegraf } from "telegraf";
import { config } from "dotenv";
config();
const bot = new Telegraf(process.env.BOT_TOKEN);

bot.start((ctx) => {
    addMessage(ctx.message);
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
    ).then((response) => addMessage(response));
})

bot.action("add", (ctx) => {
    ctx.reply("Inserisci il link del prodotto:", {
        reply_markup: {
            inline_keyboard: [
                [{ text: "❌ ANNULLA ❌", callback_data: "undo" }]
            ]
        }
    }).then((response) => addMessage(response));
    currentState = states.URL;
})

bot.action("list", (ctx) => {

})

bot.action("undo", (ctx) => {
    bot.stop();
})

bot.action("confirm", (ctx) => {
    deleteMessages(ctx);
    startTracking(url, targetPrice, ctx);
})

bot.on("message", (ctx) => {
    addMessage(ctx.message);
    let input = undefined;
    try {
        switch (currentState) {
            case states.URL:
                input = ctx.message.text;
                console.log("URL: ", input);
                if (isValidURL(input)) {
                    url = input;
                    ctx.reply("Inserisci il prezzo del prodotto:")
                        .then((response) => addMessage(response));
                    currentState = states.PRICE;
                }
                else
                    ctx.reply("Il link non è nel formato corretto!")
                        .then((response) => addMessage(response));
                break;
            case states.PRICE:
                input = ctx.message.text;
                if (!isNaN(input)) {
                    targetPrice = parseFloat(input);
                    products.push({ url: url, price: targetPrice });
                    ctx.replyWithPhoto(url, {
                        caption: "Desideri tracciare il seguente prodotto?\n\nTi avviserò quando il prezzo sarà minore di " + targetPrice + "\n\n",
                        reply_markup: {
                            inline_keyboard: [
                                [
                                    { text: "✔️ SI ✔️", callback_data: "confirm" },
                                    { text: "❌ NO ❌", callback_data: "undo" }
                                ]
                            ]
                        }
                    }).then((response) => addMessage(response));
                    currentState = states.NONE;
                }
                else ctx.reply("Il prezzo non è nel formato corretto!")
                    .then((response) => addMessage(response));
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
let messages = [];

function isValidURL(str) {
    try {
        new URL(str);
    } catch (e) {
        return false;
    }
    return true;
}

function addMessage(message) {
    messages.push({
        id: message.message_id,
        text: message.text
    });
}

function deleteMessages(ctx) {
    messages.map(msg => {
        ctx.deleteMessage(msg.id);
    })
    messages = [];
}

async function configureBrowser(url) {
    const browser = await puppeteer.launch();
    const page = await browser.newPage();
    await page.goto(url);
    return page;
}

async function checkPrice(page, targetPrice, ctx) {
    await page.reload();
    let html = await page.evaluate(() => document.body.innerHTML);
    let currentPrice = $("#priceblock_ourprice", html).text();
    currentPrice = currentPrice.replace(" ", "");
    const regex = new RegExp("(-?[0-9]+[\.]*[0-9]\€*)|(-?\$[0-9]+[\.]*[0-9]*)");
    currentPrice = currentPrice.match(regex)[0];
    currentPrice = Number(currentPrice);
    targetPrice = Number(targetPrice);
    let buyable = currentPrice <= targetPrice;
    if (buyable) {
        ctx.replyWithPhoto(url, {
            caption:
                "Il prezzo attuale è " + currentPrice +"\n",
            reply_markup: {
                inline_keyboard: [
                    [
                        { text: "🛒 Compra ora! 🛒", url: url }
                    ]
                ]
            }
        });
    }
}

async function startTracking(url, targetPrice, ctx) {
    const page = await configureBrowser(url);
    let job = new CronJob("*/15 * * * * *", () => {
        checkPrice(page, targetPrice, ctx);
    }, null, true, null, null, true);
    job.start();
}
