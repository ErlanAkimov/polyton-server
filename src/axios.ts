import axios from 'axios';
import dotenv from 'dotenv';
dotenv.config();

export const toncenter = axios.create({
    baseURL: process.env.DEV_MODE ? 'https://testnet.toncenter.com/api/v3' : 'https://toncenter.com/api/v3',
    headers: {
        'X-Api-Key': process.env.TONCENTER_API_KEY,
    },
});
