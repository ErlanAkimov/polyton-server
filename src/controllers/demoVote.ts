import { Request, Response } from 'express';
import { demoVotes, events } from '../config/database';
import sharp from 'sharp';

export const demoVote = async (req: Request, res: Response) => {
    const eventId = req.body.eventId;
    const voteType = req.body.voteType;

    if (!eventId || !voteType || typeof eventId !== 'string' || typeof voteType !== 'string') {
        res.status(400).send({ message: 'incorrect body data' });
        return;
    }

    await demoVotes.updateOne(
        { userId: req.body.initData.id, eventId },
        { $set: { userId: req.body.initData.id, eventId, voteType, updatedAt: new Date() } },
        { upsert: true }
    );

    await events.updateOne({ id: eventId }, { $inc: { [`demoVotes.${voteType}`]: 1 } });
    const event = await events.findOne({ id: eventId });

    res.status(200).send({ event });
    res.status(200).send();
};