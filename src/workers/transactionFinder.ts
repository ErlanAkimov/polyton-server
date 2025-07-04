import redis from '../config/redis';
import { toncenter } from '../axios';
import { events, refPayments, transactions, users } from '../config/database';
import { IEventTransaction, IRefPayments, ITonTransaction, IVoteTransaction } from '../config/databaseTypes';
import bot from '../config/bot';
import { fromNano } from '@ton/core';
import dotenv from 'dotenv';
import { randomBytes } from 'crypto';
dotenv.config();

export default async function transactionFinder() {
    try {
        const keys = await redis.keys('transaction:*');

        if (!keys.length) return;
        console.log(keys);

        const comments = keys.map((k) => k.split(':')[1]);

        const toncenterAnswer = await toncenter.get('/transactions', {
            params: {
                account: 'UQC8ZgerrzoSP5-duBkPg9oo5aNItwixrFrWwaVcV7U19gZV',
                limit: 20,
                offset: 0,
            },
        });

        const allTransactions = toncenterAnswer.data.transactions;
        const filteredTransactions = allTransactions.filter((tx: any) => tx.in_msg?.message_content?.decoded?.comment);

        for (let comment of comments) {
            const redisTransaction: IVoteTransaction | IEventTransaction = JSON.parse(
                (await redis.get(`transaction:${comment}`))!
            );

            const tx = filteredTransactions.find(
                (tx: ITonTransaction) => tx.in_msg?.message_content?.decoded?.comment === comment
            );

            if (redisTransaction.validUntil < Math.floor(Date.now() / 1000) - 120 && !tx) {
                await redis.del(`transaction:${comment}`);
                await transactions.updateOne({ id: comment }, { $set: { status: 'expired' } });
                continue;
            }

            if (!tx) {
                continue;
            }

            let processingSuccess: boolean;

            if (!redisTransaction.isVote) {
                processingSuccess = await eventProcessing(redisTransaction, tx);
            } else {
                processingSuccess = await voteProcessing(redisTransaction, tx);
            }

            if (!processingSuccess) return;

            redisTransaction.status = 'complete';
            redisTransaction.hash = tx.hash;
            redisTransaction.completedAt = new Date();

            await transactions.updateOne({ id: comment }, { $set: redisTransaction });
            await redis.del(`transaction:${comment}`);
        }
    } catch (err) {
        console.log(err);
        console.log(`${new Date()}: transaction finder die`);
    }
}

function base64ToHex(base64: string) {
    const binaryStr = atob(base64);
    const bytes = new Uint8Array(binaryStr.length);
    for (let i = 0; i < binaryStr.length; i++) {
        bytes[i] = binaryStr.charCodeAt(i);
    }
    return Array.from(bytes)
        .map((b) => b.toString(16).padStart(2, '0'))
        .join('');
}

async function eventProcessing(eventTx: IEventTransaction, tx: ITonTransaction) {
    const event = await events.findOne({ id: eventTx.event.id });

    if (!tx.in_msg || !event) return false;

    const txValue = Number(fromNano(tx.in_msg.value));

    if (txValue < Number(fromNano(eventTx.event.amount))) {
        const caption = `<b>Transaction: <a href=https://tonviewer.com/transaction/${base64ToHex(tx.hash)}>${event.id}</a></b>\nНесоответствие ликвидности.\nЗаявлено: ${fromNano(event.collectedAmount)}\nПрислано: ${txValue}`;
        bot.api
            .sendMessage(-1002517178759, caption, {
                parse_mode: 'HTML',
                message_thread_id: 84,
            })
            .catch((a) => {
                console.log(a);
            });
        await redis.del(`transaction:${eventTx.id}`);
        return false;
    }

    await events.updateOne({ id: event.id }, { $set: { status: 'active' } });

    const caption = `<blockquote>${event.title}</blockquote>\n@${eventTx.event.username ? eventTx.event.username : eventTx.event.id}\n\nСоздано новое голосование. Ликвидность ${fromNano(event.collectedAmount)}`;
    await bot.api.sendMessage(-1002517178759, caption, {
        parse_mode: 'HTML',
        message_thread_id: 4,
        reply_markup: {
            inline_keyboard: [
                [
                    {
                        text: 'Open event',
                        url: `https://t.me/${process.env.BOT_NAME}?startapp=event_${event.id}`,
                    },
                ],
            ],
        },
    });

    return true;
}

async function voteProcessing(voteTx: IVoteTransaction, tx: ITonTransaction) {
    console.log('start vote processing');
    try {
        const pick = voteTx.vote.pickedVote;
        const event = await events.findOne({ id: voteTx.vote.eventId });

        if (!event || !tx.in_msg) return false;

        if (voteTx.vote.amount !== tx.in_msg.value) {
            const message = `<a href=https://tonviewer.com/transaction/${base64ToHex(tx.hash)}>Transaction</a>\nЗаявлено <b>${fromNano(voteTx.vote.amount)} TON.</b>\nПрислано <b>${fromNano(tx.in_msg.value)} TON.</b>\n\nДанная транзакция не обработана. Состояние пула не изменено.`;
            await bot.api
                .sendMessage(-1002517178759, message, { message_thread_id: 84, parse_mode: 'HTML' })
                .catch(() => {});
            voteTx.status = 'fraud';
            await redis.del(`transaction:${voteTx.id}`);
            return false;
        }

        // 7% уходит на комиссии проекта
        const incrementValue = (Number(tx.in_msg.value) / 100) * 93;

        event.votes[pick].members++;
        event.votes[pick].collected = String(Number(event.votes[pick].collected) + incrementValue);
        event.collectedAmount = String(Number(event.collectedAmount) + incrementValue);
        await events.updateOne({ id: event.id }, { $set: event });

        voteTx.status = 'complete';
        voteTx.hash = tx.hash;
        voteTx.completedAt = new Date();

        const user = await users.findOne({ id: voteTx.vote.userId });
        
        if (user && event.userId) {
            const profit = fromNano(Math.floor(Number(tx.in_msg.value) * event.creatorNft.ownerFee));


            await bot.api.sendMessage(
                event.userId,
                `<b>💵+${profit} TON</b> заработало Голосование. Пользователь: @${user.username} разместил голос в ${fromNano(Number(tx.in_msg.value))} TON на исход ${voteTx.vote.pickedVote === 'v1' ? 'Да' : 'Нет'}\nСобытие: <code>${event.title}</code>\n\n*Ваша комиссия за всех Голосующих будет отправлена после ИСХОДА голосования\n- Хотите повысить уровень вашего NFT и получать больше на 38%?`,
                { parse_mode: 'HTML' }
            );
        }

        if (user && user.ref && event.creatorNft.refFee) {
            const refAmount = Math.floor(Number(tx.in_msg.value) * event.creatorNft.refFee).toString();
            const refPayment: IRefPayments = {
                id: randomBytes(8).toString('hex'),
                status: 'pending',
                fromUserId: user.id,
                toUserId: user.ref,
                transactionId: voteTx.id,
                eventId: event.id,
                transactionAmount: tx.in_msg.value,
                createdAt: new Date(),
                amount: refAmount,
            };

            await refPayments.insertOne(refPayment);


            await bot.api.sendMessage(
                user.ref,
                `<b>💵+${fromNano(refAmount)} TON</b> за голос вашего пользователя: @${user.username}  разместил голос в <b>${fromNano(tx.in_msg.value)} TON</b> на исход ${voteTx.vote.pickedVote === 'v1' ? 'Да' : 'Нет'}\n<b>Событие:</b> <code>${event.title}</code>\n\n*если это событие было создано с помощью NFT FIRST 7 или iNFLS 9, ваша комиссия здесь 1%\n**Ваша выплата будет зачислена после завршения ивента на Реферальный баланс и вы можете получать выплаты кратно 10 TON, как только наберёте 10 TON\n\n- Хотите получить NFT CREATORS, чтобы создавать Ивенты и зарабатывать +3.6% СО ВСЕГО ПУЛА созданного Вами голосования? `,
                { parse_mode: 'HTML' }
            ).catch(() => {
                console.log('Не смогли отправить сообщение рефу')
            })
        }

        await bot.api
            .sendMessage(
                -1002517178759,
                `<blockquote>${event.title}</blockquote>${voteTx.vote.username ? `@${voteTx.vote.username}` : 'username скрыт'}\nПроголосовал за: ${voteTx.vote.pickedVote === 'v1' ? 'Да' : 'Нет'}\n\n<i>Collected: <b>${fromNano(event.collectedAmount)} TON</b>\namount: <b>${fromNano(tx.in_msg.value)} TON</b></i>`,
                {
                    message_thread_id: 4,
                    parse_mode: 'HTML',
                    reply_markup: {
                        inline_keyboard: [
                            [
                                {
                                    text: 'Tonviewer',
                                    url: `https://tonviewer.com/transaction/${base64ToHex(tx.hash)}`,
                                },
                            ],
                            [
                                {
                                    text: 'Open event',
                                    url: `https://t.me/${process.env.BOT_NAME}?startapp=event_${event.id}`,
                                },
                            ],
                        ],
                    },
                }
            )
            .catch((e) => {
                console.log(e);
                console.log('Не удалось отправить системное сообщение');
            });
        return true;
    } catch (err) {
        console.log(err)
        return false;
    }
}
