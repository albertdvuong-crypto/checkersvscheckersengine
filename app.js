import { INITIAL_BOARD } from './constants.js';
import { getMoves, makeMove, getHash } from './engine.js';
import { toStandardNotation } from './notation.js';

let board = INITIAL_BOARD;
let turn = 1; 
let moveCount = 0;
let halfMoveClock = 0;
let gameHistory = [];
let activePiece = null; 

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

function getBarPercent(bestVal) {
    if (bestVal > 80000) return 100; 
    if (bestVal < -80000) return 0;  
    let pawns = bestVal / 100.0;
    let pct = 50 + 50 * (2 / (1 + Math.exp(-0.4 * pawns)) - 1);
    return Math.max(0, Math.min(100, pct));
}

worker.onmessage = function(e) {
    const msg = e.data;
    
    if (msg.type === 'info') {
        document.getElementById('depth-val').innerText = msg.depth;
        let scoreDisplay = (msg.bestVal > 80000) ? "+M" : (msg.bestVal < -80000 ? "-M" : (msg.bestVal / 100).toFixed(2));
        document.getElementById('score-val').innerText = scoreDisplay;
        document.getElementById('eval-fill').style.height = getBarPercent(msg.bestVal) + "%";
        
    } else if (msg.type === 'bestmove') {
        let bestMove = msg.bestMove;
        let bestVal = msg.bestVal;
        let depth = msg.depth; // Receiving exact search depth

        if (!bestMove) {
            document.getElementById('status').innerText = (turn === 1 ? "BLUE WINS" : "RED WINS");
            return;
        }

        executeMove(bestMove, bestVal, depth);
    }
};

async function gameLoop() {
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

    let thinkTime = Math.floor(Math.random() * 2) + 5;
    thinkTime *= 1000;

    worker.postMessage({
        cmd: 'search',
        board: board,
        turn: turn,
        gameHistory: gameHistory,
        thinkTime: thinkTime,
        activePiece: activePiece 
    });
}

function executeMove(bestMove, bestVal, depth) {
    let currentHash = getHash(board, turn);
    let movingPiece = board[bestMove.from[0]][bestMove.from[1]];
    let isPromotion = (movingPiece === 1 && bestMove.to[0] === 0) || (movingPiece === 2 && bestMove.to[0] === 7);
    
    if (bestMove.capture || isPromotion) {
        halfMoveClock = 0;
        worker.postMessage({ cmd: 'clear' }); 
    } else {
        halfMoveClock++;
    }

    board = makeMove(board, bestMove);
    gameHistory.push(currentHash);
    moveCount++;
    render();

    // FIXED: Convert move to readable Checker notation and append DOM cleanly
    let notation = toStandardNotation(bestMove);
    let scoreDisplay = (bestVal > 80000) ? "+M" : (bestVal < -80000 ? "-M" : (bestVal / 100).toFixed(2));
    
    let logBox = document.getElementById('log');
    let moveEntry = document.createElement('div');
    moveEntry.innerText = `#${moveCount} ${turn === 1 ? 'RED' : 'BLU'}: ${notation} (Depth: ${depth}, Score: ${scoreDisplay})`;
    logBox.appendChild(moveEntry);
    
    // Auto-scroll log to the bottom 
    logBox.scrollTop = logBox.scrollHeight;

    if (bestMove.capture && !isPromotion && getMoves(board, turn, bestMove.to).isJump) {
        activePiece = bestMove.to; 
        setTimeout(gameLoop, 200);
    } else {
        activePiece = null; 
        turn = (turn === 1) ? 2 : 1;
        setTimeout(gameLoop, 50);
    }
}

render();
setTimeout(gameLoop, 1000);