import { INITIAL_BOARD } from './constants.js';
import { getMoves, makeMove, alphaBeta, getHash, clearCache, countTotalPieces } from './engine.js';

// --- CONFIGURATION CONSTANTS ---
const MAX_SEARCH_DEPTH = 17;
const BASE_DEPTH = 12;

let board = INITIAL_BOARD;
let turn = 1; 
let moveCount = 0;
let halfMoveClock = 0;
let gameHistory = [];

function render() {
    const container = document.getElementById('board');
    if (!container) return;
    container.innerHTML = '';
    for (let r = 0; r < 8; r++) {
        for (let c = 0; c < 8; c++) {
            const sq = document.createElement('div');
            sq.className = `sq ${(r + c) % 2 === 0 ? 'light' : 'dark'}`;
            const p = board[r][c];
            if (p > 0) {
                const piece = document.createElement('div');
                piece.className = `piece ${p % 2 !== 0 ? 'red' : 'blue'} ${p > 2 ? 'king' : ''}`;
                sq.appendChild(piece);
            }
            container.appendChild(sq);
        }
    }
}

// Chess.com Non-Linear Logistic Curve Formula
function getBarPercent(bestVal) {
    if (bestVal > 80000) return 100; // Red Forced Mate
    if (bestVal < -80000) return 0;  // Blue Forced Mate
    
    // Convert points to "pawns" (100 pts = 1 pawn advantage)
    let pawns = bestVal / 100.0;
    
    // Logistic curve: at 0 advantage it's 50%. 
    // The multiplier (-0.4) controls how fast the bar fills up.
    let pct = 50 + 50 * (2 / (1 + Math.exp(-0.4 * pawns)) - 1);
    
    return Math.max(0, Math.min(100, pct));
}

async function gameLoop() {
    let {moves, isJump} = getMoves(board, turn);
    if (moves.length === 0) {
        document.getElementById('status').innerText = (turn === 1 ? "BLUE WINS" : "RED WINS");
        return;
    }

    let currentHash = getHash(board, turn);
    if (gameHistory.filter(h => h === currentHash).length >= 3) {
        document.getElementById('status').innerText = "DRAW (Repetition)";
        return;
    }
    if (halfMoveClock >= 100) { 
        document.getElementById('status').innerText = "DRAW (50-Move Rule)";
        return;
    }

    // --- DYNAMIC DEPTH SCALING ---
    // Start at BASE_DEPTH (11). Add 1 depth for every 3 pieces removed from the starting 24.
    let currentPieces = countTotalPieces(board);
    let depth = BASE_DEPTH + (currentPieces > 8 ? 0 : 5);
    depth = Math.min(depth, MAX_SEARCH_DEPTH); // Cap at 17

    document.getElementById('depth-val').innerText = depth;

    let bestMove = null;
    let bestVal = (turn === 1) ? -Infinity : Infinity;

    for(let m of moves) {
        let nextB = makeMove(board, m);
        let continues = m.capture && getMoves(nextB, turn, m.to).isJump;
        let val = continues
            ? alphaBeta(nextB, depth, -Infinity, Infinity, turn === 1, turn, m.to, gameHistory)
            : alphaBeta(nextB, depth - 1, -Infinity, Infinity, turn !== 1, turn === 1 ? 2 : 1, null, gameHistory);

        // Tiny randomness to pick between identical evaluations
        val += Math.round(Math.random() * 2 - 1);
        
        if ((turn === 1 && val > bestVal) || (turn === 2 && val < bestVal)) {
            bestVal = val;
            bestMove = m;
        }
    }

    let movingPiece = board[bestMove.from[0]][bestMove.from[1]];
    let isPromotion = (movingPiece === 1 && bestMove.to[0] === 0) || (movingPiece === 2 && bestMove.to[0] === 7);
    
    if (bestMove.capture || isPromotion) {
        halfMoveClock = 0;
        clearCache(); 
    } else {
        halfMoveClock++;
    }

    board = makeMove(board, bestMove);
    gameHistory.push(currentHash);
    moveCount++;
    render();

    let scoreDisplay = (bestVal > 80000) ? "+M" : (bestVal < -80000 ? "-M" : (bestVal / 100).toFixed(2));
    document.getElementById('score-val').innerText = scoreDisplay;
    document.getElementById('log').innerHTML = `<div>#${moveCount} ${turn === 1 ? 'RED' : 'BLU'}: ${bestMove.from}→${bestMove.to} (${scoreDisplay})</div>` + document.getElementById('log').innerHTML;
    
    // Fill vertical bar
    document.getElementById('eval-fill').style.height = getBarPercent(bestVal) + "%";

    if (bestMove.capture && getMoves(board, turn, bestMove.to).isJump) {
        setTimeout(gameLoop, 200);
    } else {
        turn = (turn === 1) ? 2 : 1;
        setTimeout(gameLoop, 50);
    }
}

render();
setTimeout(gameLoop, 1000);