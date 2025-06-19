import { NextFunction, Request, Response } from 'express';

import crypto from 'crypto';
import dotenv from 'dotenv';
import { users } from '../config/database';

dotenv.config();

const token = process.env.BOT_TOKEN;

if (!token) {
    throw new Error('BOT_TOKEN not found. check .env file');
}

function ValidateTelegramData(telegramInitData: string) {
    const initData = new URLSearchParams(telegramInitData);
    initData.sort();
    const hash = initData.get('hash');
    initData.delete('hash');

    const dataToCheck = [...initData.entries()].map(([key, value]) => key + '=' + value).join('\n');
    const secretKey = crypto.createHmac('sha256', 'WebAppData').update(token!).digest();
    const _hash = crypto.createHmac('sha256', secretKey).update(dataToCheck).digest('hex');

    return hash === _hash;
}

function getTelegramUserData(tg: string) {
    const initData = new URLSearchParams(tg);
    const user = initData.get('user');

    return JSON.parse(user!);
}

export const AuthMiddleware = async (req: Request, res: Response, next: NextFunction) => {
    let headerInitData = req.headers['init-data'] as string;

    if (!headerInitData) {
        headerInitData = decodeURIComponent(req.query['initData'] as string | '');
    }

    if (!headerInitData || !ValidateTelegramData(headerInitData)) {
        res.status(401).send({ error: 'Unauthorized' });
        return;
    }

    const initData = getTelegramUserData(headerInitData);

    if (!req.body) {
        req.body = {}
    }

    if (req.body?.ref) {
        initData.ref = Number(req.body.ref);
    }
    req.body.initData = initData;
    next();
};
