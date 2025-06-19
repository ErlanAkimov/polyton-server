import express from 'express';
import dotenv from 'dotenv';
import { webhookCallback } from 'grammy';
import bot from './bot';
import cors from 'cors';
dotenv.config();

if (!process.env.EXPRESS_PORT) {
    throw new Error('Express port not found. Check .env file or environment variables');
}

const app = express().use(express.json());
app.use(cors({origin: "*"}))
app.use('/api/bot-webhook-endpoint', webhookCallback(bot, 'express'));

app.listen(process.env.EXPRESS_PORT, () => console.log(`express run on ${process.env.EXPRESS_PORT}`));
export default app;

