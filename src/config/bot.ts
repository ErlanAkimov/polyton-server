import { Bot, Context } from 'grammy';
import dotenv from 'dotenv';
import { Conversation, ConversationFlavor } from '@grammyjs/conversations';
import { users } from './database';
import { IUser } from './databaseTypes';
import createNewUser from '../utils/createNewUser';
import { autoRetry } from '@grammyjs/auto-retry';

dotenv.config();

const webhookEndpoint = process.env.DOMAIN;
const webappurl = process.env.WEB_APP_URL;

if (!process.env.BOT_TOKEN) {
    throw new Error('BOT_TOKEN not found. Check your .env file.');
}

if (!webappurl) {
    throw new Error('WEB_APP_URL nor found. Check your .env file');
}

if (!webhookEndpoint) {
    throw new Error('bot.ts: DOMAIN not found. Check your .env file');
}

export type MyContext = Context & ConversationFlavor<Context>;
export type MyConversation = Conversation<MyContext>;

const bot = new Bot<MyContext>(process.env.BOT_TOKEN);

bot.api.config.use(autoRetry());
bot.command('start', async (ctx) => {
    let user: IUser = (await users.findOne({ id: ctx.chatId })) as IUser;

    if (!user) {
        user = await createNewUser({
            id: ctx.chatId!,
            username: ctx.from?.username,
            ref: Number(ctx.message?.text?.split(' ')[1]) || null,
        });
    }

    if (user.status === 0) {
        ctx.reply('Добро пожаловать в polyton, заходи в приложение и голосуй', {
            reply_markup: {
                inline_keyboard: [
                    [
                        { text: 'Admin', web_app: { url: `${webappurl}/admin-panel` } },
                        { text: 'Открыть приложение', web_app: { url: webappurl } },
                    ],
                ],
            },
        }).catch(() => {});
        return;
    }

    ctx.reply('Добро пожаловать в polyton, заходи в приложение и голосуй', {
        reply_markup: {
            inline_keyboard: [
                [{ text: 'Открыть приложение', web_app: { url: webappurl } }],
                [
                    {
                        text: 'Пригласить друга',
                        url: `https://t.me/share/url?url=https://t.me/${process.env.BOT_NAME}?start_app=ref_${ctx.from?.id}`,
                    },
                ],
            ],
        },
    }).catch(() => {});
});

const initBot = async () => {
    const getWebhook = await bot.api.getWebhookInfo();
    if (getWebhook.url !== process.env.DOMAIN) {
        await bot.api.setWebhook(`${webhookEndpoint}/bot-webhook-endpoint`);
    }
};

initBot();
export default bot;