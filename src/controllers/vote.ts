import { Request, Response } from 'express';
import { IUser, IVoteTransaction } from '../config/databaseTypes';
import { beginCell, toNano } from '@ton/core';
import { randomBytes } from 'crypto';
import redis from '../config/redis';
import { events, transactions } from '../config/database';

export const vote = async (req: Request, res: Response) => {
    try {
        const eventId = req.body.eventId;
        const eventTitle = req.body.eventTitle;
        const eventImage = req.body.eventImage;
        const pickedVote = req.body.pickedVote;
        const amount = req.body.amount;
        const user = req.body.user;
		const walletAddress = req.body.walletAddress;


        if (!amount || isNaN(Number(amount)) || !eventId) {
        res.status(400).send('invalid body');
            return;
        }

        const event = await events.findOne({id: eventId});

        if (!event) {
            res.status(400).send({message: "event not found"})
            return;
        }

        if (event.status !== 'active' && user.status !== 0) {
            res.status(400).send({message: "Ставки на событие уже не принимаются"})
            return;
        }

        const validUntil = Math.floor(Date.now() / 1000) + 180;
        const comment = randomBytes(6).toString('hex');

        const transaction = {
            validUntil,
            messages: [
                {
                    address: 'UQC8ZgerrzoSP5-duBkPg9oo5aNItwixrFrWwaVcV7U19gZV',
                    amount: toNano(amount).toString(),
                    payload: beginCell().storeUint(0, 32).storeStringTail(comment).endCell().toBoc().toString('base64'),
                },
            ],
        };

        const tx: IVoteTransaction = {
            id: comment,
			validUntil,
            vote: {
                userId: user.id,
				username: user.username,
                eventId,
                eventTitle,
                eventImage,
                createdAt: new Date(),
                amount: toNano(amount).toString(),
                pickedVote,
            },
            status: 'pending',
			hash: null,
			completedAt: null,
			isVote: true,
			walletAddress,
        };

        await redis.set(`transaction:${tx.id}`, JSON.stringify(tx));
        await transactions.insertOne(tx);

        res.status(200).send({ transaction });
    } catch {
        res.status(500).send({ message: 'internal' });
    }
};