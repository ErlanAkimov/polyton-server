import { Request, Response } from 'express';
import { IUser } from '../config/databaseTypes';
import { events } from '../config/database';

export const changeEventStatus = async (req: Request, res: Response) => {
    const initData = req.body.initData;
    const user: IUser = req.body.user;

    if (user.status !== 0) {
        res.status(401).send();
        return;
    }

    const eventId = req.body.eventId;
    const status = req.body.status;	

    if (!eventId || !status) {
        res.status(400).send();
        return;
    }

    if (status === 'finished') {
        res.status(400).send();
        return;
    }

    if (['hidden', 'active'].includes(status)) {
        await events.updateOne({ id: eventId }, { $set: { status: status } });

        res.status(200).send("OK");
    } else {
        res.status(403).send();
    }
};
