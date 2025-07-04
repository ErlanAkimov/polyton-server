import { Router } from 'express';
import { AuthMiddleware } from './middleware/CheckTelegramAuth';
import { demoVotes, events, requestsToJoin, transactions, users } from './config/database';
import createNewUser from './utils/createNewUser';
import { IEventTransaction, IUser, IVoteItem } from './config/databaseTypes';
import prepareMessage from './bot/prepareMessage';
import { Address, beginCell, Cell, toNano } from '@ton/core';
import bot from './config/bot';
import { randomBytes } from 'crypto';
import { toncenter } from './axios';
import { like } from './controllers/like';
import { vote } from './controllers/vote';
import { demoVote } from './controllers/demoVote';
import axios from 'axios';
import { nftList } from './creatorNftList';
import redis from './config/redis';
import { getHistory } from './controllers/getHistory';
import { createEventAdmin } from './controllers/createEventAdmin';
import { getEventsAdmin } from './controllers/getEvents';
import { changeEventStatus } from './controllers/changeEventStatus';
import { updateStartValue } from './controllers/updateStartValue';
import {finishEvent} from './controllers/finishEvent'
import { getRefs } from './controllers/getRefs';

const authRouter = Router();

authRouter.use(AuthMiddleware);
authRouter.use('/', async (req, res, next) => {
    let user = (await users.findOne({ id: req.body.initData.id })) as IUser;

    if (!user) {
        user = await createNewUser({
            id: req.body.initData.id,
            username: req.body.initData.username,
            ref: req.body.initData.ref || null,
        });
    }

    req.body.user = user;
    if (req.body.user?.status === 4) {
        res.status(401).send({ reason: 'ban' });
        return;
    }

    if (req.path === '/') {
        res.status(200).send({ user });
        return;
    }
    next();
});

authRouter.use('/like', like);
authRouter.post('/vote', vote);
authRouter.post('/demoVote', demoVote);
authRouter.post('/createEventAdmin', createEventAdmin);
authRouter.get('/getHistory', getHistory);
authRouter.get('/getEventsAdmin', getEventsAdmin);
authRouter.post('/changeEventStatus', changeEventStatus)
authRouter.post('/updateStartValue', updateStartValue)
authRouter.post('/finishEvent', finishEvent)
authRouter.get('/getRefs', getRefs)

authRouter.get('/acceptMe', async (req, res) => {
    if (req.body.user.status === 3) {
        await users.updateOne({ id: req.body.user.id }, { $set: { status: 1 } });
    }

    res.status(200).send({ user: { ...req.body.user, status: 1 } });
});

authRouter.get('/prepare-invite-message', async (req, res) => {
    const result = await prepareMessage(req.body.user, req.body.eventId);
    res.status(200).send({ messageId: result.id });
});

authRouter.get('/getPendingUsers', async (req, res) => {
    if (req.body.user.status !== 0) {
        res.status(401).send({ message: 'Unauthorized' });
        return;
    }

    const usersList = await requestsToJoin.find({ status: 'pending' }).toArray();

    res.status(200).send({ usersList });
});

authRouter.get('/approveUser', async (req, res) => {
    if (req.body.user.status !== 0) {
        res.status(401).send({ message: 'Unauthorized' });
        return;
    }
    const id = Number(req.query.id);
    const status = Number(req.query.status);

    if (isNaN(id) || !id) {
        res.status(400).send({ message: 'id is missing' });
        return;
    }

    const mongoResult = await users.updateOne({ id }, { $set: { status } });

    if (mongoResult.acknowledged) {
        await requestsToJoin.updateOne(
            { userId: id },
            { $set: { status: 'complete', closeInfo: { status, closedBy: req.body.user.id, closedAt: new Date() } } }
        );

        await bot.api.sendMessage(id, 'Приняли твою заявку на вступление', {
            reply_markup: {
                inline_keyboard: [[{ text: 'Открыть приложение', web_app: { url: process.env.WEB_APP_URL! } }]],
            },
        });

        res.status(200).send({ status });
        return;
    } else {
        res.status(500).send('NOT OK');
        return;
    }
});

authRouter.post('/requestToJoin', async (req, res) => {
    const tonAmount = req.body.tonAmount;
    const transactionLink = req.body.hash;
    const text = req.body.text;

    const requestInDb = await requestsToJoin.findOne({ userId: req.body.initData.id });

    if (requestInDb) {
        res.status(200).send('OK');
        return;
    }

    const request = {
        userId: req.body.initData.id,
        username: req.body.initData.username,
        createdAt: new Date(),
        tonAmount: toNano(tonAmount).toString(),
        transactionLink,
        text,
        status: 'pending',
    };

    await requestsToJoin.insertOne(request);
    await users.updateOne({ id: req.body.initData.id }, { $set: { status: 3 } });
    res.status(200).send('OK');
});

authRouter.post('/createEvent', async (req, res) => {
    try {
        const expDate = req.body.expDate;
        const tokenAddress = req.body.token;
        const position = Number(req.body.position);
        const mcap = Number(req.body.mcap);
        const result = req.body.result;
        const creatorNft = req.body.creatorNft;

        const eventsCounter = await events.countDocuments({
            'creatorNft.index': creatorNft.index,
            status: { $in: ['active', 'hided'] },
        });

        if (eventsCounter >= 1 && creatorNft.index <= 100) {
            res.status(400).send({ reason: 'limit', max: 1 });
            return;
        }

        if (eventsCounter >= 2 && creatorNft.index >= 101 && creatorNft.index <= 109) {
            res.status(400).send({ reason: 'limit', max: 2 });
            return;
        }

        if (eventsCounter >= 1 && creatorNft.index >= 110) {
            res.status(400).send({ reason: 'limit', max: 3 });
            return;
        }

        let creator: string = '';

        try {
            creator = Address.parse(req.body.creator).toString({ bounceable: false });
        } catch {
            res.status(400).send({ message: 'Invalid address' });
            return;
        }

        let image: string = '';
        let symbol: string = '';

        try {
            const { data } = await axios.get(`https://toncenter.com/api/v3/jetton/masters?address=${tokenAddress}`);
            image = data.jetton_masters[0].jetton_content.image;
            symbol = data.jetton_masters[0].jetton_content.symbol;
        } catch {
            res.status(522).send({ message: 'Что-то пошло не так, попробуйте позже' });
            return;
        }

        const event: IVoteItem = {
            id: randomBytes(16).toString('hex'),
            title: `MCap ${symbol} ${result === 'v1' ? 'выше' : 'ниже'} ${mcap > 1000 ? Math.floor(mcap / 1000) + 'K' : mcap}$?`,
            shortDescription: `Будет ли MCap токена ${symbol} ${result === 'v1' ? 'выше' : 'ниже'} значения: ${mcap}$`,
            description: req.body.description,
            targetMcap: mcap,
            tokenAddress: Address.parse(tokenAddress).toString(),
            image: image,
            creator,
            userId: req.body.id,
            creatorNft: req.body.creatorNft,
            status: 'pending',
            votes: {
                v1: {
                    title: 'Да',
                    collected: (Number(toNano(position)) / 2).toString(),
                    members: 0,
                },
                v2: {
                    title: 'Нет',
                    collected: (Number(toNano(position)) / 2).toString(),
                    members: 0,
                },
            },
            created_at: new Date(),
            expDateTimestamp: expDate.getTime(),
            collectedAmount: toNano(position).toString(),
            category: ['token'],
            demoVotes: {
                v1: 0,
                v2: 0,
            },
            result: req.body.result,
            contractAddress: '',
        };

        const comment = randomBytes(8).toString('hex');
        const validUntil = Math.floor(Date.now() / 1000) + 300;

        const eventTransaction: IEventTransaction = {
            id: comment,
            validUntil,
            event: {
                userId: req.body.user.id,
                username: req.body.user.username,
                id: event.id,
                amount: toNano(position).toString(),
                creator,
            },
            status: 'pending',
            hash: null,
            completedAt: null,
            isVote: false,
            walletAddress: creator,
        };

        const transaction = {
            validUntil,
            messages: [
                {
                    address: 'UQC8ZgerrzoSP5-duBkPg9oo5aNItwixrFrWwaVcV7U19gZV',
                    amount: toNano(position).toString(),
                    payload: beginCell()
                        .storeUint(0, 32)
                        .storeStringTail(`${comment}`)
                        .endCell()
                        .toBoc()
                        .toString('base64'),
                },
            ],
        };

        await redis.set(`transaction:${eventTransaction.id}`, JSON.stringify(eventTransaction));

        await transactions.insertOne(eventTransaction);
        await events.insertOne(event);

        res.status(200).send({ transaction, comment });
    } catch {
        res.status(500).send();
    }
});

authRouter.post('/shareEvent', async (req, res) => {
    const eventId = req.body.eventId;

    const result = await prepareMessage(req.body.user, eventId);
    res.status(200).send(result);
});
export default authRouter;

function formatDate(timestamp: number): string {
    const date = new Date(timestamp);

    const day = String(date.getDate()).padStart(2, '0');
    const month = String(date.getMonth() + 1).padStart(2, '0'); // Месяцы 0-11
    const year = date.getFullYear();

    const hours = String(date.getHours()).padStart(2, '0');
    const minutes = String(date.getMinutes()).padStart(2, '0');

    return `${day}.${month}.${year} ${hours}:${minutes}`;
}
