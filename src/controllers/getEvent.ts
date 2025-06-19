import { Request, Response } from 'express';
import { IUser } from '../config/databaseTypes';
import { demoVotes, events } from '../config/database';

export const getEvent = async (req: Request, res: Response) => {
    const userId = req.query.userId;
    const eventId = req.query.eventId;

    const event = await events.findOne({ id: eventId });

    if (!event) {
        res.status(400).send('not found');
        return;
    }

    const myDemoVote = await demoVotes.findOne({ userId: Number(userId), eventId });

    res.status(200).send({ event: { ...event, myDemoVote: myDemoVote?.voteType || null } });
};


