import { users } from '../config/database';
import { IUser } from '../config/databaseTypes';

export default async function createNewUser({
    id,
    username,
    ref,
}: {
    id: number;
    ref: number | null;
    username?: string;
}) {
    const user: IUser = {
        id,
        username: username || '',
        created_at: new Date(),
        last_update: new Date(),
        ref,
        status: 2,
    };

    await users.insertOne(user);

    return user;
}
