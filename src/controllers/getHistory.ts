import { Request, Response } from 'express';
import { IUser } from '../config/databaseTypes';
import { transactions } from '../config/database';

export const getHistory = async (req: Request, res: Response) => {
    const initData = req.body.initData;
    const user: IUser = req.body.user;

    const history = await transactions.find({ 'vote.userId': user.id, status: 'complete' }).sort({validUntil: -1}).toArray();

    res.status(200).send({ history });
};
