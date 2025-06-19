import { Request, Response } from 'express';
import { IVoteItem } from '../config/databaseTypes';
import { randomBytes } from 'crypto';
import { nftList } from '../creatorNftList';
import { events } from '../config/database';
import { Address, fromNano } from '@ton/core';

export const createEventAdmin = async (req: Request, res: Response) => {
    const {
        title,
        shortDescription,
        description,
        image,
        creator,
        collectedV1,
        collectedV2,
        user,
        initData,
        result,
        nftIndex,
        targetMcap,
		expDateTimestamp
    } = req.body;

    if (user.status !== 0) {
        res.status(401).send({ message: 'no access' });
        return;
    }

	try {
		Address.parse(creator);
	}
	catch {
		res.status(400).send("Некорректный адрес creator")
		return;
	}

    const event: IVoteItem = {
        id: randomBytes(8).toString('hex'),
        title,
        shortDescription,
        description,
        image,
        creator,
        targetMcap: targetMcap,
        creatorNft: nftList.find((a) => a.index === Number(nftIndex))!,
        votes: {
            v1: {
                title: 'Да',
                collected: collectedV1,
                members: 0,
            },
            v2: {
                title: 'Нет',
                collected: collectedV2,
                members: 0,
            },
        },
        created_at: new Date(),
        expDateTimestamp,
        status: req.body.status,
        collectedAmount: (Number(collectedV1) + Number(collectedV2)).toString(),
        category: ['token'],
        demoVotes: {
            v1: 1,
            v2: 1,
        },
        result,
        contractAddress: '',
        tokenAddress: null,
        userId: user.id,
        startV1: collectedV1,
        startV2: collectedV2,
    };

    const createResult = await events.insertOne(event);

    if (createResult.acknowledged) {
        res.status(200).send("OK");
    } else {
        res.status(500).send('Не удалось сохранить ивент в базу данных');
    }
};
