import { Request, Response } from 'express';
import { IDemoVote, ILike, IVoteItem } from '../config/databaseTypes';
import { demoVotes, events, likes } from '../config/database';

interface IResponse {
    events: IVoteItem[];
    demoVotes?: IDemoVote[];
    likes?: ILike[];
}

export const getEvents = async (req: Request, res: Response) => {
    const userId = req.query.userId;

    const list = await events.find({ status: 'active' }).toArray();

    let response: IResponse = {
        // prettier-ignore
        events: list.sort((a, b) => (Number(b.votes.v1.collected) + Number(b.votes.v2.collected)) - (Number(a.votes.v1.collected) + Number(a.votes.v1.collected))),
    };

    if (userId) {
        response.likes = await likes.find({ userId: Number(userId) }).toArray();
        response.demoVotes = await demoVotes.find({ userId: Number(userId) }).toArray();
    }

    res.status(200).send(response);
};

export const getEventsAdmin = async (req: Request, res: Response) => {
    const userId = req.query.userId;
    const eventId = req.query.eventId;
    const user = req.body.user;

    if (!user || user.status !== 0) {
        res.status(400).send({ message: 'not authorized' });
        return;
    }

    const all = await events.find().toArray();
    const filteredByData = all.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());

    res.status(200).send({ events: filteredByData });
};
