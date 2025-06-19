import { Request, Response } from 'express';
import { IUser } from '../config/databaseTypes';
import { likes } from '../config/database';

export const like = async (req: Request, res: Response) => {
    const initData = req.body.initData;
    const user: IUser = req.body.user;
    const eventId: string = req.body.eventId;

    const like = await likes.findOne({ userId: user.id, eventId });

    if (!like) {
        await likes.insertOne({ userId: user.id, eventId, createdAt: new Date() });
        res.status(200).send({ isLiked: true });
        return;
    } else {
        await likes.deleteOne({ userId: user.id, eventId });
        res.status(200).send({ isLiked: false });
        return;
    }
};
