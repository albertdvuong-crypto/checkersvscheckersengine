import { zobristTable, zobristTurn } from './constants.js';

let tt = new Map();

// Set this to true once you connect a WebAssembly or Node.js EGDB reader
const EGDB_AVAILABLE = false; 

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

// --- GRANDMASTER STATIC EVALUATION (No Recursion) ---
export function evaluate(b) {
    let redPawns=0, redKings=0;
    let bluePawns=0, blueKings=0;
    let redPos=0, bluePos=0;
    
    let redPieces = [], bluePieces = [];

    for(let r=0; r<8; r++) {
        for(let c=0; c<8; c++) {
            let p = b[r][c];
            if(p === 0) continue;
            
            // Grandmaster positioning heuristics
            let isCenter = (r >= 3 && r <= 4 && c >= 2 && c <= 5);
            let isEdge = (c === 0 || c === 7);

            if(p === 1) { // Red Pawn (Moves UP from 7 to 0)
                redPawns++;
                redPieces.push({r, c, type: 1});
                redPos += Math.pow((7 - r), 2) * 2; // Non-linear advancement bonus
                if(isCenter) redPos += 15;
                if(isEdge) redPos -= 10;
            } else if(p === 3) { // Red King
                redKings++;
                redPieces.push({r, c, type: 3});
                if(isCenter) redPos += 20;
                if(isEdge) redPos -= 15;
            } else if(p === 2) { // Blue Pawn (Moves DOWN from 0 to 7)
                bluePawns++;
                bluePieces.push({r, c, type: 2});
                bluePos += Math.pow(r, 2) * 2;
                if(isCenter) bluePos += 15;
                if(isEdge) bluePos -= 10;
            } else if(p === 4) { // Blue King
                blueKings++;
                bluePieces.push({r, c, type: 4});
                if(isCenter) bluePos += 20;
                if(isEdge) bluePos -= 15;
            }
        }
    }

    let totalPieces = redPawns + redKings + bluePawns + blueKings;
    
    // Phase-Aware Dynamic Material Values
    let kingVal = 175;
    if(totalPieces <= 8) kingVal = 210;
    if(totalPieces <= 4) kingVal = 260; // Kings dominate the deep endgame

    let redMat = (redPawns * 100) + (redKings * kingVal);
    let blueMat = (bluePawns * 100) + (blueKings * kingVal);

    let score = (redMat - blueMat) + (redPos - bluePos);

    // The Bridge Heuristic: Huge bonus for keeping the back-row anchors intact
    if(b[7][0] === 1 || b[7][2] === 1) score += 15;
    if(b[7][4] === 1 || b[7][6] === 1) score += 15;
    if(b[0][1] === 2 || b[0][3] === 2) score -= 15;
    if(b[0][5] === 2 || b[0][7] === 2) score -= 15;

    // Endgame Mop-up: Force the winning side to corner the loser using Chebyshev distance
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
            if(pairs > 0) score -= (totalDist / pairs) * 12; // Penalize distance
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

// 6-Piece Tablebase Stub (Requires external Wasm or API connection)
function probeTablebase(b) {
    // Replace with your actual Wasm call: return window.EGDB.probe(b);
    // Should return 90000 (Win), -90000 (Loss), or 0 (Draw).
    return null; 
}

// EXPORTED so app.js can calculate dynamic depth scaling
export function countTotalPieces(b) {
    let count = 0;
    for(let r=0; r<8; r++) for(let c=0; c<8; c++) if(b[r][c] !== 0) count++;
    return count;
}

export function alphaBeta(b, depth, alpha, beta, maximizing, player, activePiece = null, gameHistory = []) {
    let hash = getHash(b, player);
    if (!activePiece && tt.has(hash) && tt.get(hash).depth >= depth) return tt.get(hash).val;
    
    // --- 6-PIECE TABLEBASE LOOKUP ---
    if (EGDB_AVAILABLE && !activePiece && countTotalPieces(b) <= 6) {
        let tbScore = probeTablebase(b);
        if (tbScore !== null) {
            // Apply depth modifier to force the *fastest* win or *slowest* loss
            if (tbScore > 0) return tbScore + depth;
            if (tbScore < 0) return tbScore - depth;
            return 0; // Draw
        }
    }

    if (depth === 0 && !activePiece) return quiescence(b, alpha, beta, maximizing, player);

    let {moves} = getMoves(b, player, activePiece);
    if (moves.length === 0) return maximizing ? (-100000 + (10 - depth)) : (100000 - (10 - depth));

    let bestVal = maximizing ? -Infinity : Infinity;
    
    // Move Ordering: Captures first
    moves.sort((a, b) => (b.capture ? 1 : 0) - (a.capture ? 1 : 0));

    for(let m of moves) {
        let nextB = makeMove(b, m);
        let continues = m.capture && getMoves(nextB, player, m.to).isJump;
        let val = continues 
            ? alphaBeta(nextB, depth, alpha, beta, maximizing, player, m.to, gameHistory)
            : alphaBeta(nextB, depth - 1, alpha, beta, !maximizing, player === 1 ? 2 : 1, null, gameHistory);

        if (maximizing) {
            bestVal = Math.max(bestVal, val);
            alpha = Math.max(alpha, val);
        } else {
            bestVal = Math.min(bestVal, val);
            beta = Math.min(beta, val);
        }
        if (beta <= alpha) break; // Pruning
    }
    if (!activePiece) tt.set(hash, {val: bestVal, depth: depth});
    return bestVal;
}

function quiescence(b, alpha, beta, maximizing, player, activePiece = null) {
    let standPat = evaluate(b); 
    if (maximizing) {
        if (standPat >= beta) return beta;
        alpha = Math.max(alpha, standPat);
    } else {
        if (standPat <= alpha) return alpha;
        beta = Math.min(beta, standPat);
    }
    
    let {moves, isJump} = getMoves(b, player, activePiece);
    if (!isJump && !activePiece) return standPat; 
    
    for (let m of moves) {
        let nextB = makeMove(b, m);
        let continues = m.capture && getMoves(nextB, player, m.to).isJump;
        let score = continues 
            ? quiescence(nextB, alpha, beta, maximizing, player, m.to)
            : quiescence(nextB, alpha, beta, !maximizing, player === 1 ? 2 : 1, null);

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