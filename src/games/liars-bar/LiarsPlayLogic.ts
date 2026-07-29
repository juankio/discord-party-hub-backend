import { LiarsPlayer, Bid, LiarsGameState, LiarsRules } from './LiarsTypes.js';

export class LiarsPlayLogic {
    static isValidBid(currentBid: Bid | null, newCount: number, newFace: number): boolean {
        if (newCount <= 0) return false;
        if (newFace < 1 || newFace > 6) return false;
        if (!currentBid) return true;
        if (newCount > currentBid.count) return true;
        else if (newCount === currentBid.count) return newFace > currentBid.face;
        return false;
    }

    static countDiceForBid(players: LiarsPlayer[], face: number, onesAreWild: boolean): number {
        let count = 0;
        for (const player of players) {
            if (player.isEliminated) continue;
            for (const die of player.dice) {
                if (die === face || (onesAreWild && face !== 1 && die === 1)) {
                    count++;
                }
            }
        }
        return count;
    }

    static rollDiceForPlayers(players: LiarsPlayer[]): void {
        for (const player of players) {
            if (player.isEliminated) {
                player.dice = [];
                continue;
            }
            player.dice = [];
            for (let i = 0; i < player.diceCount; i++) {
                player.dice.push(Math.floor(Math.random() * 6) + 1);
            }
        }
    }

    static resolveCallLiar(players: LiarsPlayer[], currentBid: Bid, callerId: string, rules: LiarsRules) {
        const totalFound = this.countDiceForBid(players, currentBid.face, rules.onesAreWild);
        let loserId: string;
        let winnerId: string;
        let message: string;
        
        const bidder = players.find(p => p.userId === currentBid.userId);
        const caller = players.find(p => p.userId === callerId);

        if (totalFound >= currentBid.count) {
            loserId = callerId;
            winnerId = currentBid.userId;
            message = `¡Hay ${totalFound} dados! ${caller?.nickname} (quien dudó) pierde un dado.`;
        } else {
            loserId = currentBid.userId;
            winnerId = callerId;
            message = `¡Solo hay ${totalFound} dados! ${bidder?.nickname || 'El mentiroso'} pierde un dado.`;
        }

        const loserPlayer = players.find(p => p.userId === loserId);
        if (loserPlayer) {
            loserPlayer.diceCount--;
            if (loserPlayer.diceCount <= 0) {
                loserPlayer.isEliminated = true;
                message += `\n${loserPlayer.nickname} se ha quedado sin dados y ha sido eliminado.`;
            }
        }

        return { winnerId, loserId, message, totalFound };
    }

    static getPublicState(playerId: string, state: LiarsGameState, players: LiarsPlayer[], currentTurnUserId: string, currentBid: Bid | null, winner: string | null, roundWinner: string | null, roundLoser: string | null, rules: LiarsRules) {
        const myIndex = players.findIndex(x => x.userId === playerId);
        const p = players[myIndex];
        const orderedRivals = [];
        for (let i = 1; i < players.length; i++) {
            const rivalIndex = (myIndex + i) % players.length;
            if (players[rivalIndex]) orderedRivals.push(players[rivalIndex]);
        }

        const mapRival = (r: LiarsPlayer) => ({
            id: r.userId,
            userId: r.userId,
            name: r.nickname,
            nickname: r.nickname,
            avatarId: r.avatarId,
            color: r.color,
            diceCount: r.diceCount,
            dice: (state === 'RESOLUTION' || r.isEliminated || state === 'FINISHED') ? r.dice : [],
            isEliminated: r.isEliminated,
            isOffline: r.isOffline
        });

        const totalDiceCount = players.filter(p => !p.isEliminated).reduce((acc, p) => acc + p.diceCount, 0);

        return {
            totalDiceCount,
            state,
            currentTurnId: currentTurnUserId,
            currentTurnUserId,
            currentBid,
            winner,
            roundWinner,
            roundLoser,
            myDice: p?.dice || [],
            myDiceCount: p?.diceCount || 0,
            isEliminated: p?.isEliminated || false,
            rivals: orderedRivals.map(mapRival),
            players: players.map(r => ({
                id: r.userId,
                userId: r.userId,
                name: r.nickname,
                nickname: r.nickname,
                avatarId: r.avatarId,
                color: r.color,
                diceCount: r.diceCount,
                dice: (state === 'RESOLUTION' || r.isEliminated || state === 'FINISHED' || r.userId === playerId) ? r.dice : [],
                isEliminated: r.isEliminated,
                isOffline: r.isOffline
            })),
            rules
        };
    }
}
