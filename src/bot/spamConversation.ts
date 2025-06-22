import { Conversation } from "@grammyjs/conversations";
import { Context } from "grammy";

export default async function spamConversation(conversation: Conversation, ctx: Context) {
    await ctx.reply('Отправьте сообщение, которое будет полностью скопировано и разослано по пользователям', {
        reply_markup: { inline_keyboard: [[{ text: 'Отменить рассылку', callback_data: 'return' }]] },
    });

    const ctx2 = await conversation.waitFor('message', {
        otherwise: async (x) => {
            await x.reply('Рассылка отменена');
        },
    });
}
