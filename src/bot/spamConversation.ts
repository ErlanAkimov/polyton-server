import { Conversation } from '@grammyjs/conversations';
import { Context } from 'grammy';
import { users } from '../config/database';
import bot from '../config/bot';

export default async function spamConversation(conversation: Conversation, ctx: Context) {
    const allUsers = await users
        .find({ allows_write_to_pm: { $ne: false } })
        .skip(175)
        .toArray();

    console.log(allUsers.length);

    const myCtx = await ctx
        .reply(
            `${allUsers.length} пользователей, участвуют в рассылке.\nОтправьте сообщение, которое нужно разослать пользователям. Бот полностью скопирует его и отправит от своего имени.`,
            {
                reply_markup: { inline_keyboard: [[{ text: 'Отменить рассылку', callback_data: 'return-spam' }]] },
            }
        )
        .catch(() => console.log('spam conversation: first reply error'));

    const ctx2 = await conversation.wait();

    if (!ctx2.message || ctx2.callbackQuery?.data === 'return-spam') {
        await ctx2
            .editMessageText('Рассылка отменена')
            .catch(() => console.log('spam conversation: edit message to return 1 error'));
        return;
    }

    if (!myCtx) return;

    await ctx.api
        .editMessageReplyMarkup(ctx.chatId!, myCtx.message_id)
        .catch(() => console.log('spam conversation: edit message reply markup error'));

    await ctx2.api
        .copyMessage(ctx.chatId!, ctx.chatId!, ctx2.message.message_id)
        .catch(() => console.log('spam conversation: error to copy message to approve'));
    await ctx2
        .reply(
            'Теперь надо проверить сообщение выше ☝🏻\n\nЕсли все в порядке - подтвердите рассылку и бот постарается отправить копию каждому пользователю.\n\nЕсли что-то не так - можно отменить',
            {
                reply_markup: {
                    inline_keyboard: [
                        [{ text: 'Разослать', callback_data: `copyMessagesForAll:${ctx2.message.message_id}` }],
                        [{ text: 'Отменить', callback_data: 'clear-reply' }],
                    ],
                },
            }
        )
        .catch(() => console.log('spam conversation: edit to reply with confirming message'));


}
