import { Bot, Context, session } from 'grammy';
import dotenv from 'dotenv';
import { type Conversation, type ConversationFlavor, conversations, createConversation } from '@grammyjs/conversations';
import { IUser } from './databaseTypes';
import createNewUser from '../utils/createNewUser';
import { autoRetry } from '@grammyjs/auto-retry';
import spamConversation from '../bot/spamConversation';
import { users } from './database';

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

const bot = new Bot<ConversationFlavor<Context>>(process.env.BOT_TOKEN);
bot.use(conversations());

bot.use(createConversation(spamConversation, 'spamConversation'));

bot.api.config.use(
    autoRetry({
        maxRetryAttempts: 3,
        maxDelaySeconds: 100,
        rethrowInternalServerErrors: true,
    })
);

bot.command('spam', async (ctx) => {
    const user = await users.findOne({ id: ctx.chatId });

    if (!user || user.status !== 0) {
        await ctx.reply('Нет доступа к данной команде').catch(() => {});
        return;
    }

    await ctx.conversation.enter('spamConversation');
});

bot.command('start', async (ctx) => {
    let user: IUser = (await users.findOne({ id: ctx.chatId })) as IUser;

    if (!user) {
        user = await createNewUser({
            id: ctx.chatId!,
            username: ctx.from?.username,
            ref: Number(ctx.message?.text?.split(' ')[1]) || null,
        });
    } else if (user && !user.allows_write_to_pm) {
        await users.updateOne({ id: user.id }, { $set: { allows_write_to_pm: true } });
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

bot.on('callback_query:data', async (ctx) => {
    const data = ctx.callbackQuery.data;

    await ctx.editMessageReplyMarkup().catch(() => console.log('Не удалось почистить reply-markup'));
    await ctx.answerCallbackQuery().catch(() => {});

    if (data === 'clear-reply') {
        await ctx.answerCallbackQuery();
        return;
    }

    if (data.startsWith('copyMessagesForAll:')) {
        const messageId = Number(data.split(':')[1]);
        const list = await users.find({ allows_write_to_pm: { $ne: false } }).toArray();

        let success = 0;
        let blocked = 0;

        for (let user of list) {
            try {
                await ctx.api.copyMessage(user.id, ctx.chatId!, messageId);
                success++;
            } catch {
                await users.updateOne({ id: user.id }, { $set: { allows_write_to_pm: false } });
                blocked++;
            }

            await new Promise((r) => setTimeout(r, 60));
        }

        await ctx
            .reply(
                `Рассылка завершена (${list.length})\nУспешно: ${success}\nЗаблокирован: ${blocked}\n\nОстальные ${list.length - success - blocked} не запускали бота`
            )
            .catch(() => console.log('Не удалось отчитаться о завершении рассылки'));
    }
});

bot.start();

export default bot;
