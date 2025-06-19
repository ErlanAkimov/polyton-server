import { randomBytes } from 'crypto';
import bot from '../config/bot';
import { config } from '../config/database';
import { IUser } from '../config/databaseTypes';

async function prepareMessage(user: IUser, eventId: string) {

    const preparedMessage = await bot.api.savePreparedInlineMessage(
        user.id,
        {
            type: 'photo',
            id: randomBytes(16).toString('hex'),
            photo_url: 'https://static.daytona-project.com/images/polyton-prepare-image.jpg',
            thumbnail_url: 'https://static.daytona-project.com/images/polyton-prepare-image-thumbnail.jpg',
            title: 'prepared',
            caption: 'Теперь ты можешь голосовать TONами за результат событий в рынке TONа. Если вы правы, забираете всё!',
            parse_mode: 'HTML',
            reply_markup: {
                inline_keyboard: [
                    [{ text: 'Голосовать за Профит!', url: `https://t.me/testwebassistbot?startapp=event_${eventId}-ref_${user.id}` }],
                ],
            },
        },
        { allow_bot_chats: false, allow_channel_chats: true, allow_group_chats: true, allow_user_chats: true }
    );

    return preparedMessage;
}

export default prepareMessage;
