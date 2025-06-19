import { events } from "../config/database";
import redis from "../config/redis";

export default async function () {
	console.log('finder works');

	const pendingEvents = await events.find({status: 'pending'}).toArray();

	console.log(pendingEvents)
}