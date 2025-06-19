import { Request, Response } from 'express';
import { IUser } from '../config/databaseTypes';
import { events } from '../config/database';
import { fromNano, toNano } from '@ton/core';

export const updateStartValue = async (req: Request, res: Response) => {
    const initData = req.body.initData;
    const user: IUser = req.body.user;

    if (user.status !== 0) {
        res.status(401).send();
        return;
    }

    const eventId = req.body.eventId;
    const inc1 = Number(req.body.i1);
    const inc2 = Number(req.body.i2);

    if (isNaN(inc1) || isNaN(inc2) || !eventId) {
        res.status(400).send();
        return;
    }

    const event = await events.findOne({ id: eventId });

    if (!event) {
        res.status(400).send();
        return;
    }

    const collectedAmount = toNano(Number(fromNano(event.collectedAmount)) + inc1 + inc2).toString();
    let v1 = toNano(Number(fromNano(event.votes.v1.collected)) + inc1).toString();
    let v2 = toNano(Number(fromNano(event.votes.v2.collected)) + inc2).toString();
    const startV1 = toNano(Number(fromNano(event.startV1 || 0)) + inc1).toString();
    const startV2 = toNano(Number(fromNano(event.startV2 || 0)) + inc2).toString();

    const result = await events.updateOne(
        { id: event.id },
        { $set: { startV1, startV2, collectedAmount, 'votes.v1.collected': v1, 'votes.v2.collected': v2 } }
    );

    if (result.acknowledged) {
        res.status(200).send('OK');
    } else {
        res.status(500).send();
    }
};
