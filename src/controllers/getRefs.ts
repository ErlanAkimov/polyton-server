import { Request, Response } from 'express';
import { IUser } from '../config/databaseTypes';
import { refPayments, transactions, users } from '../config/database';

export const getRefs = async (req: Request, res: Response) => {
    const initData = req.body.initData;
    const user: IUser = req.body.user;

    const refsList = await users.find({ ref: user.id }).sort({ created_at: -1 }).toArray();
    const payments = await refPayments.find({ toUserId: user.id }).toArray();

    res.status(200).send({ refsList, payments });
};
