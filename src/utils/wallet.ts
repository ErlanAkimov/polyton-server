// Конфигурация

import { KeyPair, mnemonicToPrivateKey } from '@ton/crypto';
import { OpenedContract, TonClient, WalletContractV5R1 } from '@ton/ton';
import dotenv from 'dotenv';
dotenv.config();
import axios from 'axios';

export interface openedWallet {
    contract: OpenedContract<WalletContractV5R1>;
    keyPair: KeyPair;
    client: TonClient;
}

export const toncenter = process.env.DEV_MODE ? "https://testnet.toncenter.com" :  'https://toncenter.com';
export const tonapiUrl = process.env.DEV_MODE ? "https://testnet.tonapi.io" :  'https://tonapi.io';

export async function openWallet() {
    const m = process.env.WALLET_MNEMONIC;

    if (!m) return;

    const keyPair = await mnemonicToPrivateKey([m]);
    const client = new TonClient({
        endpoint: `${toncenter}/api/v2/jsonRPC`,
        apiKey: 'c21c38e2cad78072beb7303787b1876828b554f12785a8d7a664d47547e00162',
    });

    const wallet = WalletContractV5R1.create({
        workchain: 0,
        publicKey: keyPair.publicKey,
    });

    const contract = client.open(wallet);
    return { contract, keyPair, client };
}
export const toncenterApi = axios.create({
    baseURL: `${toncenter}/api/`,
    params: {
        api_key: 'c21c38e2cad78072beb7303787b1876828b554f12785a8d7a664d47547e00162',
    },
});
export const tonapi = axios.create({
    baseURL: `${tonapiUrl}/v2/nfts`,
});

export async function waitSeqno(seqno: number, wallet: openedWallet) {
    let seqnoAfter;
    for (let attempt = 0; attempt < 100; attempt++) {
        await sleep(2000);
        seqnoAfter = await wallet.contract.getSeqno();
        if (seqnoAfter == seqno + 1) break;
    }

    if (seqnoAfter) return seqnoAfter;
    else return 0;
}

export function sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
}
