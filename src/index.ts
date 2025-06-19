import app from './config/express';
import bot from './config/bot';
import authRouter from './authRouter';
import { getEvents } from './controllers/getEvents';
import { getEvent } from './controllers/getEvent';
import transactionFinder from './workers/transactionFinder';

import hideExpiredEventWorker from './workers/hideExpiredEventWorker';

export const teamchat = -1002517178759;

app.use('/api/v1/auth/', authRouter);

app.get('/api/v1/getEvents', getEvents);
app.get('/api/v1/getEvent', getEvent);

bot.on('message', async (ctx) => {
    if (ctx.chat.type !== 'private') return;
});

setInterval(transactionFinder, 10000);
setInterval(hideExpiredEventWorker, 10000);
