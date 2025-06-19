import { Address, beginCell, fromNano, internal, MessageRelaxed, SendMode } from '@ton/core';
import { IVoteItem, IVoteTransaction } from '../config/databaseTypes';
import { events, transactions } from '../config/database';
import { openWallet, waitSeqno } from './wallet';
import bot from '../config/bot';
import axios from 'axios';
import { teamchat } from '../index';
import dotenv from 'dotenv';
dotenv.config();

interface IConfig {
    address: string;
    userId: number;
    value: number;
    text: string;
}

export default async function finishTokenEvent(event: IVoteItem) {
    if (process.env.DEV_MODE) {
        console.log('Stopped finishing event: DEVMODE');
        return;
    }
    console.log('Начало завершения токен события');
    const serviceFeePercent = event.creatorNft.serviceFee;
    const firstOwnerFeePercent = event.creatorNft.firstOwnerFee;
    const nftOwnerPercent = event.creatorNft.ownerFee;

    const collected: Record<'v1' | 'v2', number> = {
        v1: Number(event.votes.v1.collected) - Number(event.startV1 || '0'),
        v2: Number(event.votes.v2.collected) - Number(event.startV2 || '0'),
    };

    console.log(collected);

    if (!collected.v1 && !collected.v2) {
        await events.updateOne({ id: event.id }, { $set: { status: 'finish error' } });
        return;
    }

    const allVotes = (await transactions
        .find({ isVote: true, 'vote.eventId': event.id, status: 'complete' })
        .toArray()) as unknown as IVoteTransaction[];
    console.log('Votes:', allVotes.length);

    if (allVotes.length === 0) {
        return;
    }

    const votes = {
        v1: allVotes.filter((v) => v.vote.pickedVote === 'v1'),
        v2: allVotes.filter((v) => v.vote.pickedVote === 'v2'),
    };

    console.log('V1 Votes:', votes.v1.length);
    console.log('V2 Votes:', votes.v2.length);

    const totalV1 = votes.v1.reduce((sum, v) => sum + Number(v.vote.amount), 0);
    const totalV2 = votes.v2.reduce((sum, v) => sum + Number(v.vote.amount), 0);
    console.log('Collected V1:', Number(fromNano(totalV1)));
    console.log('Collected V2:', Number(fromNano(totalV2)));

    if (collected.v1 !== totalV1 || collected.v2 !== totalV2) {
        await bot.api.sendMessage(
            teamchat,
            `<code>${event.id}</code>\nОшибка завершения события. Данные в event не совпадают с данными в транзакциях.\n\nEvent скрыт от пользователей и ожидает проверки`,
            { parse_mode: 'HTML', message_thread_id: 4 }
        );

        console.log(`Ошибка завершения ${event.id}, не совпадают данные по collected и transactions collected`);
        await events.updateOne({ id: event.id }, { $set: { status: 'finish error' } });
        return;
    }

    let winner: 'v1' | 'v2' | null = null;
    let loser: 'v1' | 'v2' | null = null;

    try {
        const dexScreenerAnswer = await axios.get(`https://api.dexscreener.com/tokens/v1/ton/${event.tokenAddress}`);
        const marketCap = dexScreenerAnswer.data[0].marketCap;
        const isMoreThanTargetMcap = marketCap > event.targetMcap;

        if (event.result === 'v1') {
            winner = isMoreThanTargetMcap ? 'v1' : 'v2';
            loser = isMoreThanTargetMcap ? 'v2' : 'v1';
        } else {
            winner = isMoreThanTargetMcap ? 'v2' : 'v1';
            loser = isMoreThanTargetMcap ? 'v1' : 'v2';
        }
    } catch {
        console.log('cant find token');
        return;
    }

    const serviceFeeAmount = Math.floor(collected[loser] * serviceFeePercent);
    const firstOwnerFeeAmount = Math.floor(collected[loser] * firstOwnerFeePercent);
    const nftOwnerAmount = Math.floor(collected[loser] * nftOwnerPercent);
    const totalAmountToSend =
        collected[loser] - serviceFeeAmount     - firstOwnerFeeAmount - nftOwnerAmount + collected[winner];

    console.log('to send: ', Number(fromNano(totalAmountToSend)));

    let config: IConfig[] = [];

    // await events.updateOne({ id: event.id }, { $set: { status: 'finished' } });
    for (let tx of votes[winner]) {
        const total = collected[winner];
        const myAmount = Number(tx.vote.amount);

        const myPercent = myAmount / total;
        const value = Math.floor(totalAmountToSend * myPercent);

        await transactions.updateOne({ id: tx.id }, { $set: { isFinished: true, winningValue: value.toString() } });

        const text = `<b>✅ВЫ ОКАЗАЛИСЬ ПРАВЫ! ПОЗДРАВЛЯЕМ!</b>\n\nНа ваш голос в ${fromNano(myAmount)} TON приходится: ${fromNano(value)} профита - это +${(myPercent * 100).toFixed(2)}%\n\n<b>POLYTON</b> удерживает комиссию с профита:\n5% креатору голосования с NFT под номером (${event.creatorNft.symbol})\n2.5% за маркетинг другу или каналу, который вас пригласил\n2.5% комиссия на работу сервиса\n ⁃ Хотите стать креатором и зарабатывать 5% от Пула победителей вне зависимости от Исхода голосования?\nНапишите: @PMAssist ✍️`;
        config.push({
            address: tx.walletAddress,
            userId: tx.vote.userId,
            value,
            text,
        });
    }

    sendMessages(config);

    async function sendMessages(config: IConfig[]) {
        let messagesFull: MessageRelaxed[][] = [];
        let currentBatch: MessageRelaxed[] = [];
        let notificationsFull: IConfig[][] = [];
        let notificationsBatch: IConfig[] = [];

        for (let i = 0; i < config.length; i++) {
            const singleMessage = internal({
                to: Address.parse(config[i].address),
                value: fromNano(config[i].value),
                body: beginCell().storeUint(0, 32).storeStringTail('Polyton payment for vote').endCell(),
            });

            currentBatch.push(singleMessage);
            notificationsBatch.push(config[i]);

            if (currentBatch.length === 255 || i === config.length - 1) {
                messagesFull.push(currentBatch);
                notificationsFull.push(notificationsBatch);
                notificationsBatch = [];
                currentBatch = [];
            }
        }

        const wallet = await openWallet();

        if (!wallet) {
            console.log(`Не удалось подключиться к кошельку для выплат event: ${event.id}`);
            return;
        }

        let seqno = await wallet.contract.getSeqno();
        console.log('SEQNO:', seqno);
        let batchesCounter: number = 0;

        for (let messages of messagesFull) {
            console.log(messages);
            await wallet.contract.sendTransfer({
                seqno,
                secretKey: wallet.keyPair.secretKey,
                sendMode: SendMode.IGNORE_ERRORS,
                messages,
            });

            for (let config of notificationsFull[batchesCounter]) {
                // prettier-ignore
                // Уведомление пользователя о завершении из текущей batch раздачи
                await bot.api.sendMessage(config.userId, config.text, {parse_mode: "HTML"}).catch(() => console.log(`Не удалось уведомить пользователя о завершении события. userId: ${config.userId}, eventId: ${event.id}`));
            }

            // Ожидаем обновление seqno и переходим к следующей раздаче
            seqno = await waitSeqno(seqno, wallet);
            console.log('UPDATED:', seqno);
            batchesCounter++;
        }

        const teamNotifyConfig = {
            total: fromNano(collected.v1 + collected.v2),
            v1: fromNano(collected.v1),
            v2: fromNano(collected.v2),
        };

        await sendServiceMessages(event, nftOwnerAmount, serviceFeeAmount, firstOwnerFeeAmount);
        await notifyLosers(votes.v2);
        await eventFinishNotificationForTeam(event, teamNotifyConfig, true);
        await events.updateOne(
            { id: event.id },
            {
                $set: {
                    status: 'finished',
                    finishData: {
                        date: new Date(),
                        winner,
                        totalAmountToSend,
                        serviceFeeAmount,
                        firstOwnerFeeAmount,
                        nftOwnerAmount,
                    },
                },
            }
        );
    }
}

interface ITeamNotifyConfig {
    total: string;
    v1: string;
    v2: string;
}

export async function notifyLosers(losers: { vote: { eventTitle: string; userId: number } }[]) {
    const text = `<b>Завершился ивент: ${losers[0].vote.eventTitle}</b>🔴В ЭТОТ РАЗ ВЫ ОШИБЛИСЬ\n\nГолосуйте точнее, мы будем рады видеть вас в Пуле победителей в следующем голосовании❤️\n- Хотите стать креатором и зарабатывать 5% от Пула победителей вне зависимости от Исхода голосования?\nНапишите: @PMAssist ✍️`;

    for (let loser of losers) {
        await bot.api.sendMessage(loser.vote.userId, text).catch(() => {});
    }
}

export async function eventFinishNotificationForTeam(event: IVoteItem, config: ITeamNotifyConfig, isHandle: boolean) {
    const text = `<b>${event.title}</b>\n<code>${event.id}</code>\nСобытие завершено\nСобрано: ${config.total} | ${config.v1} | ${config.v2}${isHandle ? '\n\nЗавершено вручную' : ''}`;

    await bot.api
        .sendMessage(teamchat, text, {
            message_thread_id: 4,
            parse_mode: 'HTML',
        })
        .catch(() => console.log('Не удалось уведомить для события', event.id));
}

export async function sendServiceMessages(
    event: IVoteItem,
    nftOwnerAmount: number,
    serviceFee: number,
    firstOwnerFee?: number
) {
    let creatorFeeMessage = internal({
        to: Address.parse(event.creator),
        value: fromNano(nftOwnerAmount),
        body: beginCell().storeUint(0, 32).storeStringTail('Polyton. Creator payment').endCell(),
    });

    let serviceFeeMessage = internal({
        to: Address.parse('UQC8ZgerrzoSP5-duBkPg9oo5aNItwixrFrWwaVcV7U19gZV'),
        value: fromNano(serviceFee),
        body: beginCell().storeUint(0, 32).storeStringTail('Polyton. Service Fee').endCell(),
    });

    let firstOwnerFeeMessage: MessageRelaxed | null = null;

    let messages: MessageRelaxed[] = [serviceFeeMessage, creatorFeeMessage];

    if (firstOwnerFee && event.creatorNft.firstOwner) {
        firstOwnerFeeMessage = internal({
            to: Address.parse(event.creatorNft.firstOwner),
            value: fromNano(firstOwnerFee),
            body: beginCell()
                .storeUint(0, 32)
                .storeStringTail('Polyton. First Owner Fee')
                .endCell()
                .toBoc()
                .toString('base64'),
        });

        messages.push(firstOwnerFeeMessage);
    }

    const wallet = await openWallet();

    if (!wallet) return;

    let seqno = await wallet.contract.getSeqno();

    wallet.contract.sendTransfer({
        seqno,
        secretKey: wallet.keyPair.secretKey,
        sendMode: SendMode.IGNORE_ERRORS,
        messages,
    });

    seqno = await waitSeqno(seqno, wallet);
}
