import { Request, Response } from 'express';
import { IEventTransaction, IUser, IVoteItem, IVoteTransaction } from '../config/databaseTypes';
import { events, transactions } from '../config/database';
import { Address, beginCell, fromNano, internal, MessageRelaxed, SendMode, toNano } from '@ton/core';
import bot from '../config/bot';
import { openedWallet, openWallet, waitSeqno } from '../utils/wallet';
import { teamchat } from '../index';
import dotenv from 'dotenv';
import redis from '../config/redis';
dotenv.config();

let processing = false;

export const finishEvent = async (req: Request, res: Response) => {
    const processing = await redis.get('finishStatus');
    if (processing) {
        res.status(200).send('PROCESSING');
        console.log(`Request to finish. Another task on process...`);
        return;
    }

    await redis.set('finishStatus', 'true', 'EX', 300);

    const initData = req.body.initData;
    const user: IUser = req.body.user;

    if (user.status !== 0) {
        res.status(401).send();
        return;
    }

    const { eventId, winner } = req.body;

    console.log('EVENT ID:', eventId);
    console.log('WINNER:', winner);

    const event = await events.findOne({ id: eventId });

    if (!event) {
        console.log('event not found');
        res.status(400).send();
        return;
    }

    if (event.status === 'finished') {
        res.status(400).send();
        return;
    }

    // prettier-ignore
    const allVotes = await transactions.find({isVote: true, 'vote.eventId': event.id, status: "complete"}).toArray() as unknown as IVoteTransaction[];
    const creatorTx = (await transactions.findOne({ 'event.id': event.id })) as unknown as IEventTransaction;
    const creatorTxAmount = Number(creatorTx?.event?.amount) / 2 || 0;

    const winnerVotes = allVotes.filter((v) => v.vote.pickedVote === winner);
    const loserVotes = allVotes.filter((v) => v.vote.pickedVote === (winner === 'v1' ? 'v2' : 'v1'));

    console.log(`Выплата по ${event.id}\n${event.title}`);
    console.log(`Всего голосов`, allVotes.length);
    console.log(`Победителей:`, winnerVotes.length);
    console.log(`Проигравших:`, loserVotes.length);

    if (!allVotes) {
        console.log('NO VOTES');
        await events.updateOne(
            { id: event.id },
            {
                $set: {
                    status: 'finished',
                    finishData: {
                        date: new Date(),
                        winner,
                        totalAmountToSend: 0,
                        serviceFeeAmount: 0,
                        firstOwnerFeeAmount: 0,
                        nftOwnerAmount: 0,
                    },
                },
            }
        );
        res.status(200).send({ message: 'no real votes' });
        return;
    }

    // Распределяем пул создателя на тоталы
    const winnerRealTotal = winnerVotes.reduce((sum, v) => sum + Number(v.vote.amount), 0) + creatorTxAmount;
    let loserRealTotal = loserVotes.reduce((sum, v) => sum + Number(v.vote.amount), 0) + creatorTxAmount;

    if (!loserRealTotal) {
        loserRealTotal = Number(toNano(1));
    }

    const serviceFee = Math.floor(loserRealTotal * event.creatorNft.serviceFee);
    const firstOwnerFee = Math.floor(loserRealTotal * event.creatorNft.firstOwnerFee);
    const creatorFee = Math.floor(loserRealTotal * event.creatorNft.ownerFee);

    const totalToSend = loserRealTotal - serviceFee - firstOwnerFee - creatorFee;

    console.log(`SERVICE FEE:`, fromNano(serviceFee));
    console.log(`FIRST OWNER FEE:`, fromNano(firstOwnerFee));
    console.log(`CREATOR FEE:`, fromNano(creatorFee));
    console.log(`TOTAL TO SEND:`, fromNano(totalToSend));

    const messages: MessageRelaxed[] = [];

    const myBalance = await getMyBalance();

    if (Number(fromNano(myBalance)) < Number(fromNano(totalToSend))) {
        console.log(
            `Недостаточно баланса для проведения операции. Мой баланс: ${fromNano(myBalance)}\nНеобходимо:${fromNano(totalToSend)}`
        );
        res.status(200).send(
            `Wallet Balance Error: ${fromNano(myBalance)} TON\nНужно: ${fromNano(Number(loserRealTotal) + Number(winnerRealTotal))} TON`
        );
        return;
    }

    res.status(200).send('OK');

    for (let tx of winnerVotes) {
        const txAmount = Number(tx.vote.amount);
        const percent = txAmount / winnerRealTotal;
        const amount = fromNano(Math.floor(totalToSend * percent) + txAmount);

        messages.push(
            internal({
                to: Address.parse(tx.walletAddress),
                value: amount,
                body: beginCell().storeUint(0, 32).storeStringTail('Polyton. Payment for winner').endCell(),
            })
        );

        if (process.env.DEV_MODE) {
            console.log('Режим разработки, уведомление победителю не отправляется!');
            continue;
        }

        await transactions.updateOne(
            { id: tx.id },
            { $set: { isWinner: true, isFinished: true, winningValue: toNano(amount).toString() } }
        );
        await notifyWinner(event, tx, txAmount, amount, percent, winner);
        await new Promise((r) => setTimeout(r, 30));
    }

    // Считаем месседж для создателя (его первая транзакция делится 50\50 за ДА и НЕТ)
    if (creatorTx) {
        const percent = creatorTxAmount / winnerRealTotal;
        const amountToSendForPool = fromNano(Math.floor(totalToSend * percent) + creatorTxAmount);
        messages.push(
            internal({
                to: event.creator,
                value: amountToSendForPool,
                body: beginCell().storeUint(0, 32).storeStringTail('Polyton. Payment for event creator').endCell(),
            })
        );
    }

    if (messages.length <= 253 && !process.env.DEV_MODE) {
        messages.push(
            internal({
                to: Address.parse(event.creator),
                value: fromNano(creatorFee),
                body: beginCell().storeUint(0, 32).storeStringTail('Polyton. Event Creator Fee').endCell(),
            })
        );

        messages.push(
            internal({
                to: Address.parse('UQC8ZgerrzoSP5-duBkPg9oo5aNItwixrFrWwaVcV7U19gZV'),
                value: fromNano(serviceFee),
                body: beginCell().storeUint(0, 32).storeStringTail('Polyton. Service Fee').endCell(),
            })
        );

        await sendMessages(messages);
        console.log('messages sended to blockchain');
    } else if (process.env.DEV_MODE) {
        console.log('Режим разработки: Сообщение в сеть TON не отправлено');
    }

    await events.updateOne(
        { id: event.id },
        {
            $set: {
                status: 'finished',
                finishData: {
                    date: new Date(),
                    winner,
                    totalAmountToSend: totalToSend,
                    serviceFeeAmount: serviceFee,
                    firstOwnerFeeAmount: firstOwnerFee,
                    nftOwnerAmount: creatorFee,
                },
            },
        }
    );

    console.log('event updated');

    console.log('start sending loser notifications');

    for (let loser of loserVotes) {
        if (process.env.DEV_MODE) {
            console.log('Режим разработки, нотификации пользователям не отправлены');
            break;
        }

        await transactions.updateOne(
            { id: loser.id },
            { $set: { isWinner: false, isFinished: true, winningValue: toNano(0).toString() } }
        );
        try {
            await notifyLoser(event, winner, loser.vote.userId);
        } catch {}
        await new Promise((r) => setTimeout(r, 30));
    }
    console.log('finish sending loser notifications');

    redis.del('finishStatus');
};

async function getMyBalance() {
    const wallet = await openWallet();

    if (!wallet) {
        await bot.api
            .sendMessage(teamchat, 'Не удалось открыть кошелек для выплат', { message_thread_id: 4 })
            .catch(() => {});
        return 0;
    }

    return await wallet.contract.getBalance();
}

async function sendMessages(messages: MessageRelaxed[]) {
    const wallet = await openWallet();

    if (!wallet) {
        await bot.api
            .sendMessage(teamchat, 'Не удалось открыть кошелек для выплат', { message_thread_id: 4 })
            .catch(() => {});
        return false;
    }
    let seqno = await wallet.contract.getSeqno();

    await wallet.contract.sendTransfer({
        seqno,
        secretKey: wallet.keyPair.secretKey,
        sendMode: SendMode.IGNORE_ERRORS,
        messages,
    });

    try {
        seqno = await waitSeqno(seqno, wallet);
    } catch {
        // если произошла ошибка при получении seqno выжидаем 1 минуту
        await new Promise((resolve) => setTimeout(resolve, 60000));
    }
}

async function notifyWinner(
    e: IVoteItem,
    tx: IVoteTransaction,
    txAmount: number,
    amount: string,
    p: number,
    winner: string
) {
    const profit = ((Number(amount) - Number(fromNano(txAmount))) / Number(fromNano(txAmount))) * 100;
    const text = `Завершился ивент:\n<code>${e.title}</code>\n\nИсход: <b>${winner === 'v1' ? 'Да' : 'Нет'}</b> в ${formatDate(new Date(e.expDateTimestamp))}\n\n<b>✅ВЫ ОКАЗАЛИСЬ ПРАВЫ! ПОЗДРАВЛЯЕМ!</b>\n\nНа ваш голос в <b>${fromNano(txAmount)} TON</b> приходится: <b>${Number(amount).toFixed(2)} TON</b> профита - это <b>+${profit.toFixed(2)}%</b>\n\n<b>POLYTON</b> удерживает комиссию с профита:\n5% креатору голосования с NFT под номером (${e.creatorNft.symbol})\n2.5% за маркетинг другу или каналу, который вас пригласил\n2.5% комиссия на работу сервиса\n ⁃ Хотите стать креатором и зарабатывать 5% от Пула победителей вне зависимости от Исхода голосования?\nНапишите: @PMAssist ✍️`;
    await bot.api.sendMessage(tx.vote.userId, text, { parse_mode: 'HTML' }).catch(() => {});
}

async function notifyLoser(event: IVoteItem, winner: 'v1' | 'v2', id: number) {
    const text = `<b>Завершился ивент:</b>\n<code>${event.title}</code>\n\nИсход: <b>${winner === 'v1' ? 'Да' : 'Нет'}</b> в ${formatDate(new Date(event.expDateTimestamp))}\n\n🔴В ЭТОТ РАЗ ВЫ ОШИБЛИСЬ\n\nГолосуйте точнее, мы будем рады видеть вас в Пуле победителей в следующем голосовании❤️\n- Хотите стать креатором и зарабатывать 5% от Пула победителей вне зависимости от Исхода голосования?\nНапишите: @PMAssist ✍️`;
    await bot.api.sendMessage(id, text, { parse_mode: 'HTML' }).catch(() => {});
}

function formatDate(date: string | Date): string {
    const d = new Date(date);

    const day = String(d.getDate()).padStart(2, '0');
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const year = d.getFullYear();

    const time = d.toLocaleString('ru-RU', {
        timeZone: 'Europe/Moscow',
        hour: '2-digit',
        minute: '2-digit',
        hour12: false,
    });

    return `${day}.${month}.${year} ${time} МСК`;
}
