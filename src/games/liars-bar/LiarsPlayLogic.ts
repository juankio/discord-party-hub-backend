import { LiarsPlayer, Bid, LiarsGameState, LiarsRules } from './LiarsTypes.js';

export class LiarsPlayLogic {
    static isValidBid(currentBid: Bid | null, newCount: number, newFace: number): boolean {
        if (newCount <= 0) return false;
        if (newFace < 1 || newFace > 6) return false;
        if (!currentBid) return true;
        const currentCount = currentBid.count ?? (currentBid as any).amount;
        const currentFace = currentBid.face;
        if (newCount > currentCount) return true;
        else if (newCount === currentCount) return newFace > currentFace;
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
        
        const bidderUserId = currentBid.userId || (currentBid as any).playerId;
        const bidder = players.find(p => p.userId === bidderUserId);
        const caller = players.find(p => p.userId === callerId);
        const bidCount = currentBid.count ?? (currentBid as any).amount;

        if (totalFound >= bidCount) {
            loserId = callerId;
            winnerId = bidderUserId;
            message = `¡Hay ${totalFound} dados! ${caller?.nickname || 'Quien dudó'} (quien dudó) pierde un dado.`;
        } else {
            loserId = bidderUserId;
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

        return { winnerId, loserId, winner: winnerId, loser: loserId, roundWinner: winnerId, roundLoser: loserId, message, totalFound };
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

        const formattedBet = currentBid ? {
            ...currentBid,
            userId: currentBid.userId || (currentBid as any).playerId,
            playerId: currentBid.userId || (currentBid as any).playerId,
            count: currentBid.count ?? (currentBid as any).amount,
            amount: currentBid.count ?? (currentBid as any).amount,
            face: currentBid.face
        } : null;

        return {
            totalDiceCount,
            state,
            currentTurnId: currentTurnUserId,
            currentTurnUserId,
            currentBet: formattedBet,
            currentBid: formattedBet,
            winner,
            winnerId: winner,
            roundWinner,
            roundWinnerId: roundWinner,
            roundLoser,
            loserId: roundLoser,
            roundLoserId: roundLoser,
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
