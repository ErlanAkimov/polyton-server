import { teamchat } from '..';
import bot from '../config/bot';
import { events } from '../config/database';

export default async function hideExpiredEventWorker(eventId?: string) {
    const expiredEvent = await events.findOne({
        expDateTimestamp: { $lt: Date.now() - 30 * 1000 * 60 },
        status: {$in: ['active', 'hidden']},
    });

    if (!expiredEvent || expiredEvent.expDateTimestamp === 0) return;

    await events.updateOne({ id: expiredEvent.id }, { $set: { status: 'over' } });

    if (!eventId) {
        const text = `До завершения события осталось 30 минут.\n<b>${expiredEvent.title}</b>\n<code>${expiredEvent.id}</code>\n\nСобытие скрыто от новых пользователей и ставки по нему больше не принимаются`;
        await bot.api.sendMessage(teamchat, text, { parse_mode: 'HTML', message_thread_id: 4 });
    }
}

