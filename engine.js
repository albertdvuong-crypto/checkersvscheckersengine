import { zobristTable, zobristTurn } from './constants.js';

let tt = new Map();

// FIXED: Added Transposition Table Flags
const FLAG_EXACT = 0;
const FLAG_ALPHA = 1;
const FLAG_BETA = 2;

const EGDB_AVAILABLE = false; 

export let abortSearch = false;
let searchStartTime = 0;
let searchTimeLimit = 0;
let nodeCount = 0;

export function setTimeLimit(timeMs) {
    searchTimeLimit = timeMs;
    searchStartTime = Date.now();
    abortSearch = false;
    nodeCount = 0;
}

function checkTime() {
    if ((++nodeCount & 2047) === 0) {
        if (Date.now() - searchStartTime > searchTimeLimit) {
            abortSearch = true;
        }
    }
}

export function clearCache() { tt.clear(); }

export function getHash(b, t) {
    let h = (t === 1) ? zobristTurn : 0;
    for(let r=0; r<8; r++) {
        for(let c=0; c<8; c++) {
            if(b[r][c] !== 0) h ^= zobristTable[r][c][b[r][c]];
        }
    }
    return h;
}

export function makeMove(b, m) {
    let next = b.map(row => [...row]);
    let p = next[m.from[0]][m.from[1]];
    next[m.to[0]][m.to[1]] = p;
    next[m.from[0]][m.from[1]] = 0;
    if (m.capture) next[m.capture[0]][m.capture[1]] = 0;
    if (p === 1 && m.to[0] === 0) next[m.to[0]][m.to[1]] = 3;
    if (p === 2 && m.to[0] === 7) next[m.to[0]][m.to[1]] = 4;
    return next;
}

export function getMoves(b, player, activePiece = null) {
    let moves = [], jumps = [];
    const enemy = (p) => player === 1 ? (p === 2 || p === 4) : (p === 1 || p === 3);

    for(let r=0; r<8; r++) {
        for(let c=0; c<8; c++) {
            let p = b[r][c];
            if (p === 0 || p % 2 !== player % 2) continue;
            if (activePiece && (r !== activePiece[0] || c !== activePiece[1])) continue;

            let dirs = [];
            if (player === 1 || p > 2) dirs.push([-1, -1], [-1, 1]); 
            if (player === 2 || p > 2) dirs.push([1, -1], [1, 1]);   

            for(let [dr, dc] of dirs) {
                let nr = r + dr, nc = c + dc;
                if (nr>=0 && nr<8 && nc>=0 && nc<8) {
                    if (b[nr][nc] === 0) {
                        if (!activePiece) moves.push({from:[r,c], to:[nr,nc]});
                    } else if (enemy(b[nr][nc])) {
                        let jr = nr + dr, jc = nc + dc;
                        if (jr>=0 && jr<8 && jc>=0 && jc<8 && b[jr][jc] === 0) {
                            jumps.push({from:[r,c], to:[jr,jc], capture:[nr,nc]});
                        }
                    }
                }
            }
        }
    }
    return jumps.length > 0 ? {moves: jumps, isJump: true} : {moves: moves, isJump: false};
}

export function evaluate(b) {
    let redPawns=0, redKings=0;
    let bluePawns=0, blueKings=0;
    let redPos=0, bluePos=0;
    
    let redPieces = [], bluePieces = [];

    for(let r=0; r<8; r++) {
        for(let c=0; c<8; c++) {
            let p = b[r][c];
            if(p === 0) continue;
            
            let isCenter = (r >= 3 && r <= 4 && c >= 2 && c <= 5);
            let isEdge = (c === 0 || c === 7);

            if(p === 1) { 
                redPawns++;
                redPieces.push({r, c, type: 1});
                // FIXED: Flattened the honeypot math to a safe linear multiplier
                redPos += (((7 - r) * (7 - r)) / 2) >> 1; 
                if(isCenter) redPos += 5;
                if(isEdge) redPos -= 5;
            } else if(p === 3) { 
                redKings++;
                redPieces.push({r, c, type: 3});
                if(isCenter) redPos += 10;
                if(isEdge) redPos -= 5;
            } else if(p === 2) { 
                bluePawns++;
                bluePieces.push({r, c, type: 2});
                bluePos += ((r * r) / 2) >> 1;
                if(isCenter) bluePos += 5;
                if(isEdge) bluePos -= 5;
            } else if(p === 4) { 
                blueKings++;
                bluePieces.push({r, c, type: 4});
                if(isCenter) bluePos += 10;
                if(isEdge) bluePos -= 5;
            }
        }
    }

    let totalPieces = redPawns + redKings + bluePawns + blueKings;
    
    let kingVal = 135;
    if(totalPieces <= 8) kingVal = 175;
    if(totalPieces <= 6) kingVal = 185;
    if(totalPieces <= 4) kingVal = 195; 

    let redMat = (redPawns * 100) + (redKings * kingVal);
    let blueMat = (bluePawns * 100) + (blueKings * kingVal);

    let score = (redMat - blueMat) + (redPos - bluePos);

    if(b[7][0] === 1 || b[7][2] === 1) score += 15;
    if(b[7][4] === 1 || b[7][6] === 1) score += 15;
    if(b[0][1] === 2 || b[0][3] === 2) score -= 15;
    if(b[0][5] === 2 || b[0][7] === 2) score -= 15;

    if(totalPieces <= 6) {
        if(score > 0 && redKings > 0) {
            let totalDist = 0, pairs = 0;
            for(let r of redPieces) {
                if(r.type !== 3) continue;
                for(let blue of bluePieces) {
                    totalDist += Math.max(Math.abs(r.r - blue.r), Math.abs(r.c - blue.c));
                    pairs++;
                }
            }
            if(pairs > 0) score -= (totalDist / pairs) * 12; 
        } else if(score < 0 && blueKings > 0) {
            let totalDist = 0, pairs = 0;
            for(let b of bluePieces) {
                if(b.type !== 4) continue;
                for(let red of redPieces) {
                    totalDist += Math.max(Math.abs(b.r - red.r), Math.abs(b.c - red.c));
                    pairs++;
                }
            }
            if(pairs > 0) score += (totalDist / pairs) * 12;
        }
    }

    return score;
}

function probeTablebase(b) {
    return null; 
}

export function countTotalPieces(b) {
    let count = 0;
    for(let r=0; r<8; r++) for(let c=0; c<8; c++) if(b[r][c] !== 0) count++;
    return count;
}

export function alphaBeta(b, depth, alpha, beta, maximizing, player, activePiece = null, gameHistory = []) {
    checkTime();
    if (abortSearch) return 0;

    let hash = getHash(b, player);

    // FIXED: Internal Repetition Draw Prevention
    // If this position exists in the current search path, score it as a Draw (0)
    if (gameHistory.includes(hash)) {
        return 0;
    }

    // FIXED: Safely query the TT using verified alpha/beta boundaries
    if (!activePiece && tt.has(hash)) {
        let entry = tt.get(hash);
        if (entry.depth >= depth) {
            if (entry.flag === FLAG_EXACT) return entry.val;
            if (entry.flag === FLAG_ALPHA && entry.val <= alpha) return alpha;
            if (entry.flag === FLAG_BETA && entry.val >= beta) return beta;
        }
    }
    
    if (EGDB_AVAILABLE && !activePiece && countTotalPieces(b) <= 6) {
        let tbScore = probeTablebase(b);
        if (tbScore !== null) {
            if (tbScore > 0) return tbScore + depth;
            if (tbScore < 0) return tbScore - depth;
            return 0; 
        }
    }

    if (depth <= 0 && !activePiece) return quiescence(b, alpha, beta, maximizing, player);

    let {moves} = getMoves(b, player, activePiece);
    if (moves.length === 0) {
        if (activePiece) {
            return alphaBeta(b, depth - 1, alpha, beta, !maximizing, player === 1 ? 2 : 1, null, gameHistory);
        }
        return maximizing ? (-100000 + 2 * (10 - depth)) : (100000 - 2 * (10 - depth));
    }

    let originalAlpha = alpha;
    let bestVal = maximizing ? -Infinity : Infinity;
    
    moves.sort((a, b) => (b.capture ? 1 : 0) - (a.capture ? 1 : 0));

    for(let m of moves) {
        let nextB = makeMove(b, m);
        
        let movingPiece = b[m.from[0]][m.from[1]];
        let isPromotion = (movingPiece === 1 && m.to[0] === 0) || (movingPiece === 2 && m.to[0] === 7);
        let continues = m.capture && !isPromotion && getMoves(nextB, player, m.to).isJump;
        
        // Push the board hash to history to track internal repetitions
        gameHistory.push(hash);

        let val = continues 
            ? alphaBeta(nextB, depth, alpha, beta, maximizing, player, m.to, gameHistory)
            : alphaBeta(nextB, depth - 1, alpha, beta, !maximizing, player === 1 ? 2 : 1, null, gameHistory);

        // Pop it off when stepping back up the tree
        gameHistory.pop();

        if (abortSearch) return 0;

        if (maximizing) {
            bestVal = Math.max(bestVal, val);
            alpha = Math.max(alpha, val);
        } else {
            bestVal = Math.min(bestVal, val);
            beta = Math.min(beta, val);
        }
        if (beta <= alpha) break; 
    }

    // FIXED: Save entries with precise flags so they don't corrupt future searches
    if (!activePiece && !abortSearch) {
        let flag = FLAG_EXACT;
        if (bestVal <= originalAlpha) flag = FLAG_ALPHA;
        else if (bestVal >= beta) flag = FLAG_BETA;
        tt.set(hash, {val: bestVal, depth: depth, flag: flag});
    }
    return bestVal;
}

function quiescence(b, alpha, beta, maximizing, player, activePiece = null) {
    checkTime();
    if (abortSearch) return 0;

    let standPat = evaluate(b); 
    if (maximizing) {
        if (standPat >= beta) return beta;
        alpha = Math.max(alpha, standPat);
    } else {
        if (standPat <= alpha) return alpha;
        beta = Math.min(beta, standPat);
    }
    
    let {moves, isJump} = getMoves(b, player, activePiece);
    if (activePiece && !isJump) return standPat; 
    if (!isJump && !activePiece) return standPat; 
    
    for (let m of moves) {
        let nextB = makeMove(b, m);
        
        let movingPiece = b[m.from[0]][m.from[1]];
        let isPromotion = (movingPiece === 1 && m.to[0] === 0) || (movingPiece === 2 && m.to[0] === 7);
        let continues = m.capture && !isPromotion && getMoves(nextB, player, m.to).isJump;
        
        let score = continues 
            ? quiescence(nextB, alpha, beta, maximizing, player, m.to)
            : quiescence(nextB, alpha, beta, !maximizing, player === 1 ? 2 : 1, null);

        if (abortSearch) return 0;

        if (maximizing) {
            alpha = Math.max(alpha, score);
            if (alpha >= beta) break;
        } else {
            beta = Math.min(beta, score);
            if (beta <= alpha) break;
        }
    }
    return maximizing ? alpha : beta;
}
