import { INITIAL_BOARD } from './constants.js';
import { getMoves, makeMove, getHash } from './engine.js';

let board = INITIAL_BOARD;
let turn = 1; 
let moveCount = 0;
let halfMoveClock = 0;
let gameHistory = [];
let activePiece = null; // FIXED: Added global tracker for mid-turn jumps

// Initialize Background AI Worker
const worker = new Worker(new URL('./worker.js', import.meta.url), { type: 'module' });

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
    
    let pct = 50 + 50 * (2 / (1 + Math.exp(-0.4 * pawns)) - 1);
    return Math.max(0, Math.min(100, pct));
}

// Helper to calculate total pieces remaining on the board
function countBoardPieces(b) {
    let count = 0;
    for (let r = 0; r < 8; r++) {
        for (let c = 0; c < 8; c++) {
            if (b[r][c] !== 0) count++;
        }
    }
    return count;
}

// Receive continuous messages from the background Engine
worker.onmessage = function(e) {
    const msg = e.data;
    
    if (msg.type === 'info') {
        // Update Eval Bar Live during think time
        document.getElementById('depth-val').innerText = msg.depth;
        let scoreDisplay = (msg.bestVal > 80000) ? "+M" : (msg.bestVal < -80000 ? "-M" : (msg.bestVal / 100).toFixed(2));
        document.getElementById('score-val').innerText = scoreDisplay;
        document.getElementById('eval-fill').style.height = getBarPercent(msg.bestVal) + "%";
        
    } else if (msg.type === 'bestmove') {
        // Move Confirmed! Execute on board.
        let bestMove = msg.bestMove;
        let bestVal = msg.bestVal;

        if (!bestMove) {
            document.getElementById('status').innerText = (turn === 1 ? "BLUE WINS" : "RED WINS");
            return;
        }

        executeMove(bestMove, bestVal);
    }
};

async function gameLoop() {
    // FIXED: Passed activePiece to getMoves to validate if the mid-jump piece still has targets
    let { moves } = getMoves(board, turn, activePiece);
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

    // --- DYNAMIC THINK TIME CALCULATION ---
    let thinkTime = Math.floor(Math.random() * 2) + 5;
    thinkTime *= 1000;

    // Offload calculation properties to the background worker thread
    worker.postMessage({
        cmd: 'search',
        board: board,
        turn: turn,
        gameHistory: gameHistory,
        thinkTime: thinkTime,
        activePiece: activePiece // FIXED: Engine now knows which piece is jumping
    });
}

function executeMove(bestMove, bestVal) {
    let currentHash = getHash(board, turn);
    let movingPiece = board[bestMove.from[0]][bestMove.from[1]];
    // FIXED: Identify if this specific move causes a promotion
    let isPromotion = (movingPiece === 1 && bestMove.to[0] === 0) || (movingPiece === 2 && bestMove.to[0] === 7);
    
    if (bestMove.capture || isPromotion) {
        halfMoveClock = 0;
        worker.postMessage({ cmd: 'clear' }); // Command worker to wipe Transposition Table cache on board state updates
    } else {
        halfMoveClock++;
    }

    board = makeMove(board, bestMove);
    gameHistory.push(currentHash);
    moveCount++;
    render();

    let scoreDisplay = (bestVal > 80000) ? "+M" : (bestVal < -80000 ? "-M" : (bestVal / 100).toFixed(2));
    document.getElementById('log').innerHTML = `<div>#${moveCount} ${turn === 1 ? 'RED' : 'BLU'}: ${bestMove.from}→${bestMove.to} (${scoreDisplay})</div>` + document.getElementById('log').innerHTML;

    // FIXED: Check for double jump opportunities, BUT abort if the piece was just crowned a king
    if (bestMove.capture && !isPromotion && getMoves(board, turn, bestMove.to).isJump) {
        activePiece = bestMove.to; // Lock the turn to this piece
        setTimeout(gameLoop, 200);
    } else {
        activePiece = null; // Reset and hand over the turn
        turn = (turn === 1) ? 2 : 1;
        setTimeout(gameLoop, 50);
    }
}

render();
setTimeout(gameLoop, 1000);
