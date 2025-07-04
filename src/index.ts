import app from './config/express';
import bot from './config/bot';
import authRouter from './authRouter';
import { getEvents } from './controllers/getEvents';
import { getEvent } from './controllers/getEvent';
import transactionFinder from './workers/transactionFinder';

import hideExpiredEventWorker from './workers/hideExpiredEventWorker';
import dotenv from 'dotenv';
import { openWallet } from './utils/wallet';
dotenv.config();

if (!process.env.EXPRESS_PORT) {
    throw new Error('Express port not found. Check .env file or environment variables');
}

export const teamchat = -1002517178759;
app.use('/api/v1/auth/', authRouter);

app.get('/api/v1/getEvents', getEvents);
app.get('/api/v1/getEvent', getEvent);

bot.on('message', async (ctx) => {
    if (ctx.chat.type !== 'private') return;
});

setInterval(transactionFinder, 10000);
setInterval(hideExpiredEventWorker, 10000);

app.listen(process.env.EXPRESS_PORT, () => console.log(`express run on ${process.env.EXPRESS_PORT}`));

