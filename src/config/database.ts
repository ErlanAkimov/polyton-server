import { Collection, MongoClient } from 'mongodb';
import dotenv from 'dotenv';
import {
    IUser,
    IWallet,
    IVoteItem,
    IDemoVote,
    ILike,
    ICreatorNft,
    IVoteTransaction,
    IEventTransaction,
    IPayment,
} from './databaseTypes';
dotenv.config();

const mongoConnectionString = process.env.MONGO_STRING;

if (!mongoConnectionString) {
    throw new Error('database.ts MONGO_STRING not found. Check your .env file');
}

const mongo = new MongoClient(mongoConnectionString);

const db = mongo.db('polyton');

export const users: Collection<IUser> = db.collection('users');
export const wallets: Collection<IWallet> = db.collection('wallets');
export const events: Collection<IVoteItem> = db.collection('events');
export const likes: Collection<ILike> = db.collection('likes');
export const config: Collection<any> = db.collection('config');
export const demoVotes: Collection<IDemoVote> = db.collection('demoVotes');
export const nftCreators: Collection<ICreatorNft> = db.collection('nftCreators');

export const transactions: Collection<IVoteTransaction | IEventTransaction> = db.collection('transactions');

export const requestsToJoin = db.collection('requsetsToJoin');
export const payments: Collection<IPayment> = db.collection('payments');