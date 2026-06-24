import { getMoves, makeMove, alphaBeta, setTimeLimit, abortSearch, clearCache } from './engine.js';

self.onmessage = function(e) {
    const msg = e.data;
    
    if (msg.cmd === 'clear') {
        clearCache();
        return;
    }
    
    if (msg.cmd === 'search') {
        const { board, turn, gameHistory, thinkTime, activePiece } = msg;
        
        setTimeLimit(thinkTime);
        
        let { moves } = getMoves(board, turn, activePiece);
        if (moves.length === 0) {
            self.postMessage({ type: 'bestmove', bestMove: null, bestVal: 0 });
            return;
        }
        
        let globalBestMove = moves[0];
        let globalBestVal = (turn === 1) ? -Infinity : Infinity;
        
        // --- ITERATIVE DEEPENING LOOP ---
        for (let depth = 1; depth <= 50; depth++) {
            let iterationBestMove = null;
            let iterationBestVal = (turn === 1) ? -Infinity : Infinity;
            let iterationAborted = false;
            
            for (let m of moves) {
                let nextB = makeMove(board, m);
                
                let movingPiece = board[m.from[0]][m.from[1]];
                let isPromotion = (movingPiece === 1 && m.to[0] === 0) || (movingPiece === 2 && m.to[0] === 7);
                let continues = m.capture && !isPromotion && getMoves(nextB, turn, m.to).isJump;
                
                // FIXED: Pass a safe copy of the history array [...gameHistory] so parallel branches don't corrupt it
                let val = continues
                    ? alphaBeta(nextB, depth, -Infinity, Infinity, turn === 1, turn, m.to, [...gameHistory])
                    : alphaBeta(nextB, depth - 1, -Infinity, Infinity, turn !== 1, turn === 1 ? 2 : 1, null, [...gameHistory]);
                    
                if (abortSearch) {
                    iterationAborted = true;
                    break; 
                }
                
                if (Math.abs(val) < 80000) {
                    val += Math.round(Math.random() * 2 - 1);
                }
                
                if ((turn === 1 && val > iterationBestVal) || (turn === 2 && val < iterationBestVal)) {
                    iterationBestVal = val;
                    iterationBestMove = m;
                }
            }
            
            if (iterationAborted) break; 
            
            globalBestMove = iterationBestMove;
            globalBestVal = iterationBestVal;
            
            self.postMessage({
                type: 'info',
                depth: depth,
                bestVal: globalBestVal,
                bestMove: globalBestMove
            });
            
            moves.sort((a, b) => {
                if (a === globalBestMove) return -1;
                if (b === globalBestMove) return 1;
                return 0;
            });
        }
        
        self.postMessage({
            type: 'bestmove',
            bestMove: globalBestMove,
            bestVal: globalBestVal
        });
    }
};
