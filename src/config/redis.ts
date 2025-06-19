import dotenv from 'dotenv';
import Redis from 'ioredis';

const port = Number(process.env.REDIS_PORT);
const host = process.env.REDIS_HOST;
const password = process.env.REDIS_PASSWORD;

if (!port || !host || !password) {
    throw new Error('Redis connection data not found. Check .env file or environments');
}

const redis = new Redis({
    port,
    host,
    password,
});

export default redis;