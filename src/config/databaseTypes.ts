export enum UserStatus {
    ADMIN = 0,
    ACTIVE = 1,
    INACTIVE = 2,
    PENDING = 3,
    BANNED = 4,
}

/**
 * Компонент для отображения информации о пользователе.
 *
 * @param UserStatus - 0 - администраторы
 *  1 - дефолтные пользователи
 *  2 - пользователи неактивные
 *  3 - В ожидании одобрения
 *  4 - Бан
 *  5 - Отказано в запросе
 */

export interface IUser {
    id: number;
    username: string;
    created_at: Date;
    last_update: Date;
    ref: number | string | null;
    status: UserStatus;
}

interface IBaseTransaction {
    id: string;
    validUntil: number;
    status: 'pending' | 'fraud' | 'complete' | 'canceled' | 'expired';
    hash: string | null;
    completedAt: Date | null;
    walletAddress: string;
    isVote: boolean;
    isWinner?: boolean;
    isFinished?: boolean;
    winningValue?: string;
}

export interface IVoteTransaction extends IBaseTransaction {
    vote: {
        userId: number;
        username?: string;
        eventId: string;
        eventTitle: string;
        eventImage: string;
        createdAt: Date;
        amount: string;
        pickedVote: 'v1' | 'v2';
        winningValue?: string;
    };
    
    isVote: true;
}

export interface IEventTransaction extends IBaseTransaction {
    event: {
        userId: number;
        username?: string;
        id: string;
        amount: string;
        creator: string;
    };
    isVote: false;
}

export interface ILike {
    eventId: string;
    userId: number;
    createdAt: Date;
}

export interface ITonTransaction {
    hash: string;
    in_msg?: {
        value: string;
        message_content?: {
            decoded?: {
                comment?: string;
            };
        };
    };
}
export interface IWallet {
    last_update: Date;
    created_at: Date;
    address: string;
    user_id: number;
    balance: string;
}

interface IVote {
    title: string;
    collected: string;
    members: number;
}

export interface ITokenEvent {
    id: string;
}

export interface IVoteItem {
    id: string;
    title: string;
    shortDescription: string;
    description: string;
    image: string;
    targetMcap: number;
    creator: string;
    creatorNft: ICreatorNft;
    votes: Record<'v1' | 'v2', IVote>;
    created_at: Date;
    expDateTimestamp: number;
    status: string;
    collectedAmount: string;
    category: string[];
    demoVotes: {
        v1: number;
        v2: number;
    };
    result: string;
    contractAddress: string;
    tokenAddress?: string | null;
    userId: number;
    startV1?: string;
    startV2?: string;
    finishData?: {
        date: Date;
        winner: string | null;
        totalAmountToSend: number;
        serviceFeeAmount: number;
        firstOwnerFeeAmount: number;
        nftOwnerAmount: number;
    }
}

export interface IDemoVote {
    userId: number;
    eventId: string;
    updatedAt: Date;
    voteType: string;
}

export interface ICreatorNft {
    address: string;
    symbol: string;
    collection: number;
    ownerFee: number;
    serviceFee: number;
    firstOwnerFee: number;
    index: number;
    firstOwner?: string;
}

export interface IPayment {
    eventId: string;
    createdAt: Date;
    messages: {
        address: string;
        value: string;
    }[];
    successMessages: number;
    errorMessages: number;
}
