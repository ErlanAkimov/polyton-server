import express from 'express';
import { webhookCallback } from 'grammy';
import bot from './bot';
import cors from 'cors';


const app = express().use(express.json());
app.use(cors({origin: "*"}))
// app.use('/api/bot-webhook-endpoint', webhookCallback(bot, 'express'));

export default app;

