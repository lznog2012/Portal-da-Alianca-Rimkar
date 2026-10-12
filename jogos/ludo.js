// ================================================
// LUDO ALIENÍGENA - Servidor
// ================================================

const COLORS_A = [
  { name: 'Rimk',   hex: '#aaff00', dark: '#557700', planet: 'Rimkópolis' },
  { name: 'Sahrin', hex: '#ffcc00', dark: '#886600', planet: 'Kaal-7'      },
  { name: 'Nereid', hex: '#00ffcc', dark: '#006655', planet: 'Nereida'     },
  { name: 'Ferrum', hex: '#ff3344', dark: '#881122', planet: 'Marte'       }
];

const COLORS_B = [
  { name: 'Rimk',   hex: '#aaff00', dark: '#557700', team: 'RIMK', planet: 'Rimkópolis' },
  { name: 'Thrakk', hex: '#f0f0ff', dark: '#8888aa', team: 'ZUNK', planet: "Zunk'nir"    },
  { name: 'Nereid', hex: '#00ffcc', dark: '#006655', team: 'RIMK', planet: 'Nereida'     },
  { name: 'Vharn',  hex: '#aa66ff', dark: '#553388', team: 'ZUNK', planet: "Zunk'nir"    }
];

const START_INDICES = [0, 13, 26, 39];
const SAFE_INDICES = new Set([0, 8, 13, 21, 26, 34, 39, 47]);
const TURN_TIME = 30;
const DISCONNECT_GRACE = 30;
const MAX_SIXES = 3;
const FINISH_POS = 56;
const BOT_NAMES = ['Zorblax','Kryzzt','Vexnar','Quortan','Xyloph','Braxil','Nyzoth','Vrelka','Moxxi','Zarnak','Xerath','Quinlex','Nebulon','Kryon','Xylar','Vorlox','Zephyr','Quintar','Gorblax','Yvnar'];

function init(io, rooms, broadcastStats) {
  // ========== BOTS ==========
  function pickBotName(room) {
    const used = new Set(Object.values(room.players).map(p => p.name));
    for (let i = 0; i < 30; i++) {
      const n = BOT_NAMES[Math.floor(Math.random() * BOT_NAMES.length)]
        + (Math.random() < 0.3 ? ' ' + Math.floor(Math.random() * 99 + 1) : '');
      if (!used.has(n)) return n;
    }
    return BOT_NAMES[Math.floor(Math.random() * BOT_NAMES.length)] + '_' + Date.now().toString().slice(-3);
  }

  function getTakenColors(room) {
    const taken = new Set();
    Object.values(room.players).forEach(p => {
      if (p.playerIndex !== null && p.playerIndex !== undefined) {
        taken.add(p.playerIndex);
      }
    });
    return taken;
  }

  function getFirstAvailableColor(room) {
    const colors = getColors(room.mode);
    const taken = getTakenColors(room);
    for (let i = 0; i < colors.length; i++) {
      if (!taken.has(i)) return i;
    }
    return -1;
  }
  
  function pickBotMove(player, dice) {
    const valid = [];
    player.pawns.forEach((pos, idx) => {
      if (canMovePawn(pos, dice)) valid.push({ idx, pos });
    });
    if (!valid.length) return null;
    const onBoard = valid.filter(v => v.pos !== -1);
    const pool = onBoard.length ? onBoard : valid;
    pool.sort((a, b) => b.pos - a.pos);
    return pool[0].idx;
  }

  function scheduleBotTurn(room) {
    if (room.state !== 'PLAYING') return;
    const currentId = room.turnOrder[room.currentTurn];
    if (!currentId) return;
    const p = room.players[currentId];
    if (!p || !p.isBot || p.eliminated) return;
    if (room.dice !== null) return;
    if (room.isPaused) return;

    setTimeout(() => {
      const r = rooms[room.code];
      if (!r || r.state !== 'PLAYING') return;
      if (r.turnOrder[r.currentTurn] !== currentId) return;
      if (r.dice !== null) return;
      if (r.isPaused) return;
      performRoll(r, currentId);
    }, 1200 + Math.random() * 900);
  }

  function performRoll(room, playerId) {
    if (room.state !== 'PLAYING') return;
    const player = room.players[playerId];
    if (!player || player.eliminated) return;
    if (room.dice !== null) return;
    if (room.turnOrder[room.currentTurn] !== playerId) return;
    if (room.isPaused) return;

    const dice = rollDice();
    room.dice = dice;

    if (dice === 6) {
      room.sixesInARow++;
      if (room.sixesInARow > MAX_SIXES) {
        io.to(room.code).emit('ludoChat', {
          sender: 'SISTEMA',
          text: `⚀ ${player.name} tirou 6 três vezes! Perdeu o turno.`,
          type: 'system'
        });
        narrate(room, `${player.name} tirou 6 três vezes e perdeu o turno!`, '⚀', 'warn');
        nextTurn(room);
        return;
      }
    } else {
      room.sixesInARow = 0;
    }

    const anyMove = hasAnyMove(player, dice);
    io.to(room.code).emit('ludoDiceRolled', {
      playerId, playerName: player.name, dice, anyMove
    });
    narrate(room, `${player.name} rolou ${dice}.`, '🎲', 'roll');
    broadcastState(room);

    if (!anyMove) {
      io.to(room.code).emit('ludoChat', {
        sender: 'SISTEMA',
        text: `🎲 ${player.name} tirou ${dice}, mas não tem jogadas válidas.`,
        type: 'system'
      });
      narrate(room, `${player.name} não tem jogadas válidas.`, '💤', 'info');
      setTimeout(() => {
        const r = rooms[room.code];
        if (r && r.state === 'PLAYING' && r.dice === dice) nextTurn(r);
      }, 2000);
      return;
    }

    const validMoves = [];
    player.pawns.forEach((pos, idx) => {
      if (canMovePawn(pos, dice)) validMoves.push(idx);
    });

    if (validMoves.length === 1) {
      const delay = player.isBot ? 1300 : 1000;
      setTimeout(() => {
        const r = rooms[room.code];
        if (!r || r.state !== 'PLAYING') return;
        if (r.dice !== dice) return;
        if (r.turnOrder[r.currentTurn] !== playerId) return;

        if (!player.isBot) {
          io.to(room.code).emit('ludoChat', {
            sender: 'SISTEMA',
            text: `⚡ Movimento automático (única jogada válida).`,
            type: 'system'
          });
        }
        performMove(r, playerId, validMoves[0]);
      }, delay);
      return;
    }

    if (player.isBot) {
      setTimeout(() => {
        const r = rooms[room.code];
        if (!r || r.state !== 'PLAYING') return;
        if (r.dice !== dice) return;
        const pawnIdx = pickBotMove(player, dice);
        if (pawnIdx !== null) performMove(r, playerId, pawnIdx);
      }, 1300);
    }
  }

  function performMove(room, playerId, pawnIndex) {
    if (room.state !== 'PLAYING') return;
    if (room.turnOrder[room.currentTurn] !== playerId) return;
    if (room.dice === null) return;
    if (room.isPaused) return;

    const player = room.players[playerId];
    const result = applyMove(room, playerId, pawnIndex);
    if (result === false) return;

    if (result.captured.length) {
      io.to(room.code).emit('ludoCapture', {
        attackerId: playerId,
        attackerName: player.name,
        captured: result.captured
      });
      const victims = result.captured.map(c => c.playerName).join(', ');
      narrate(room, `${player.name} abduziu peão de ${victims}!`, '🛸', 'capture');
    }

    if (result.finished) {
      player.finished = true;
      narrate(room, `${player.name} levou todos os peões ao centro!`, '🏁', 'win');
      if (checkWin(room)) return;
    }

    if (result.dice === 6) {
      if (room.sixesInARow >= MAX_SIXES) {
        room.sixesInARow = 0;
        nextTurn(room);
      } else {
        room.dice = null;
        io.to(room.code).emit('ludoRollAgain', { playerId });
        startTurnTimer(room);
        broadcastState(room);
      }
    } else {
      nextTurn(room);
    }
  }
  
  // ========== HELPERS ==========
  function rollDice() { return Math.floor(Math.random() * 6) + 1; }

  function getColors(mode) { return mode === 'B' ? COLORS_B : COLORS_A; }

  function canMovePawn(pawnPos, dice) {
    if (pawnPos === -1) return dice === 6;
    if (pawnPos >= FINISH_POS) return false;
    if (pawnPos + dice > FINISH_POS) return false;
    return true;
  }

  function hasAnyMove(player, dice) {
    return player.pawns.some(p => canMovePawn(p, dice));
  }

  function getRingIndex(playerIndex, relativePos) {
    return (START_INDICES[playerIndex] + relativePos) % 52;
  }

  // ========== ROOM MANAGEMENT ==========
  function makeRoom(code, hostId, mode, maxPlayers) {
    return {
      code,
      gameType: 'L',
      mode,
      maxPlayers,
      hostId,
      state: 'LOBBY',
      players: {},
      turnOrder: [],
      currentTurn: 0,
      dice: null,
      sixesInARow: 0,
      turnTimer: null,
      turnTimeLeft: 0,
      disconnectTimers: {},
      isPaused: false,
      pauseVotes: null,
      pauseProposedBy: null,
      pauseTarget: null
    };
  }

  function publicState(room) {
    return {
      code: room.code,
      mode: room.mode,
      state: room.state,
      maxPlayers: room.maxPlayers,
      hostId: room.hostId,
      currentTurnId: room.turnOrder[room.currentTurn] || null,
      dice: room.dice,
      turnTimeLeft: room.turnTimeLeft,
      isPaused: !!room.isPaused,
      players: Object.values(room.players).map(p => ({
        id: p.id, name: p.name, avatar: p.avatar,
        color: p.color, colorName: p.colorName, team: p.team || null,
        isHost: p.isHost, isBot: !!p.isBot, ready: p.ready, disconnected: p.disconnected,
        pawns: [...p.pawns], finished: p.finished, eliminated: p.eliminated,
        playerIndex: p.playerIndex
      }))
    };
  }

  function broadcastState(room) {
    io.to(room.code).emit('ludoState', publicState(room));
  }

  function broadcastLobby(room) {
    const taken = getTakenColors(room);
    const colors = getColors(room.mode);
    const availableColors = colors.map((c, i) => ({ idx: i, taken: taken.has(i) }));

    io.to(room.code).emit('ludoLobby', {
      code: room.code,
      mode: room.mode,
      maxPlayers: room.maxPlayers,
      hostId: room.hostId,
      availableColors,
      players: Object.values(room.players).map(p => ({
        id: p.id, name: p.name, avatar: p.avatar,
        color: p.color, colorName: p.colorName, team: p.team || null,
        isHost: p.isHost, isBot: !!p.isBot, ready: p.ready, disconnected: p.disconnected,
        playerIndex: p.playerIndex
      }))
    });
  }

  function nextTurn(room) {
    clearInterval(room.turnTimer);
    room.dice = null;
    room.sixesInARow = 0;
    if (!room.turnOrder.length) return;
    let attempts = 0;
    do {
      room.currentTurn = (room.currentTurn + 1) % room.turnOrder.length;
      attempts++;
      const pid = room.turnOrder[room.currentTurn];
      const p = room.players[pid];
      if (p && !p.eliminated && !p.finished) break;
    } while (attempts < room.turnOrder.length);
    const nowPlayer = room.players[room.turnOrder[room.currentTurn]];
    if (nowPlayer) narrate(room, `Turno de ${nowPlayer.name}.`, '🎯', 'info');
    startTurnTimer(room);
    broadcastState(room);
  }

  function startTurnTimer(room, preserveTime) {
    clearInterval(room.turnTimer);
    if (!preserveTime) room.turnTimeLeft = TURN_TIME;
    io.to(room.code).emit('ludoTimer', room.turnTimeLeft);
    room.turnTimer = setInterval(() => {
      room.turnTimeLeft--;
      io.to(room.code).emit('ludoTimer', room.turnTimeLeft);
      if (room.turnTimeLeft <= 0) {
        clearInterval(room.turnTimer);
        const pid = room.turnOrder[room.currentTurn];
        const p = room.players[pid];
        io.to(room.code).emit('ludoChat', {
          sender: 'SISTEMA',
          text: `⏱ ${p?.name || 'Jogador'} demorou demais. Turno passado.`,
          type: 'system'
        });
        nextTurn(room);
      }
    }, 1000);

    scheduleBotTurn(room);
  }

  // ========== GAME LOGIC ==========
  function applyMove(room, playerId, pawnIndex) {
    const player = room.players[playerId];
    const dice = room.dice;
    const pos = player.pawns[pawnIndex];

    if (!canMovePawn(pos, dice)) return false;

    const newPos = pos === -1 ? 0 : pos + dice;
    player.pawns[pawnIndex] = newPos;

    const captured = [];
    if (newPos >= 0 && newPos <= 50) {
      const ringIdx = getRingIndex(player.playerIndex, newPos);
      if (!SAFE_INDICES.has(ringIdx)) {
        Object.values(room.players).forEach(other => {
          if (other.id === playerId || other.eliminated) return;
          if (player.team && other.team && player.team === other.team) return;
          other.pawns.forEach((op, oi) => {
            if (op >= 0 && op <= 50) {
              const oRingIdx = getRingIndex(other.playerIndex, op);
              if (oRingIdx === ringIdx) {
                other.pawns[oi] = -1;
                captured.push({ playerId: other.id, playerName: other.name, pawnIndex: oi });
              }
            }
          });
        });
      }
    }

    const finished = player.pawns.every(p => p === FINISH_POS);
    return { captured, finished, dice };
  }

  function checkWin(room) {
    if (room.mode === 'A') {
      const winner = Object.values(room.players).find(p => p.finished);
      if (winner) { 
        narrate(room, `🏆 ${winner.name} venceu a partida!`, '🏆', 'win');
        endGame(room, [winner.id]); 
        return true; 
      }
    } else {
      const rimk = Object.values(room.players).filter(p => p.team === 'RIMK');
      const zunk = Object.values(room.players).filter(p => p.team === 'ZUNK');
      if (rimk.length && rimk.every(p => p.finished)) { 
        narrate(room, `🏆 Time RIMK venceu a partida!`, '🏆', 'win');
        endGame(room, rimk.map(p => p.id)); 
        return true; 
      }
      if (zunk.length && zunk.every(p => p.finished)) { 
        narrate(room, `🏆 Time ZUNK venceu a partida!`, '🏆', 'win');
        endGame(room, zunk.map(p => p.id)); 
        return true; 
      }
    }
    return false;
  }

  function endGame(room, winnerIds) {
    room.state = 'END';
    clearInterval(room.turnTimer);
    io.to(room.code).emit('ludoEnd', {
      winnerIds,
      players: Object.values(room.players).map(p => ({
        id: p.id, name: p.name, color: p.color, team: p.team || null,
        pawns: p.pawns, finished: p.finished
      }))
    });
  }

  function handleLeave(room, playerId) {
    if (!room.players[playerId]) return;
    const p = room.players[playerId];

    if (room.disconnectTimers[playerId]) {
      clearTimeout(room.disconnectTimers[playerId]);
      delete room.disconnectTimers[playerId];
    }

    if (room.state === 'LOBBY') {
      delete room.players[playerId];
      room.turnOrder = room.turnOrder.filter(id => id !== playerId);
      if (room.hostId === playerId && room.turnOrder.length) {
        room.hostId = room.turnOrder[0];
        room.players[room.hostId].isHost = true;
      }
      if (!room.turnOrder.length) {
        delete rooms[room.code];
        if (typeof broadcastStats === 'function') broadcastStats();
      } else {
        broadcastLobby(room);
      }
    } else if (room.state === 'PLAYING') {
      p.eliminated = true;
      p.disconnected = true;
      p.pawns = [-1, -1, -1, -1];
      io.to(room.code).emit('ludoChat', {
        sender: 'SISTEMA',
        text: `⚠ ${p.name} foi desclassificado.`,
        type: 'system'
      });

      const activePlayers = Object.values(room.players).filter(pl => !pl.eliminated);
      if (activePlayers.length <= 1) {
        if (activePlayers.length === 1) endGame(room, [activePlayers[0].id]);
        else { room.state = 'END'; clearInterval(room.turnTimer); }
        return;
      }

      const currentId = room.turnOrder[room.currentTurn];
      if (currentId === playerId) nextTurn(room);
      else broadcastState(room);
    }

    io.to(room.code).emit('ludoPlayerLeft', { playerId, playerName: p.name });
  }

  function narrate(room, text, icone, tipo) {
    io.to(room.code).emit('ludoNarration', {
      text,
      icone: icone || '📡',
      tipo: tipo || 'info',
      timestamp: Date.now()
    });
  }
  
  function checkPauseVote(room, code) {
    if (!room.pauseVotes) return;
    const alive = Object.values(room.players).filter(pl => !pl.eliminated);
    const voted = Object.keys(room.pauseVotes).length;

    io.to(code).emit('ludoPauseVoteUpdate', {
      votes: room.pauseVotes,
      total: alive.length
    });

    if (voted < alive.length) return;

    const yes = Object.values(room.pauseVotes).filter(v => v).length;
    const no = voted - yes;
    const approved = yes > no;

    if (approved) {
      room.isPaused = room.pauseTarget;
      if (room.isPaused) {
        clearInterval(room.turnTimer);
      } else {
        startTurnTimer(room, true);
      }
    }

    io.to(code).emit('ludoPauseVoteResult', {
      approved,
      isPaused: room.isPaused,
      yes,
      no,
      total: alive.length
    });

    room.pauseVotes = null;
    room.pauseProposedBy = null;
    room.pauseTarget = null;
    broadcastState(room);
  }
  
  // ========== SOCKET HANDLERS ==========
  io.on('connection', (socket) => {

    socket.on('ludoCreate', ({ name, avatar, mode, maxPlayers }) => {
      const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ';
      let code;
      do {
        code = '';
        for (let i = 0; i < 4; i++) code += chars[Math.floor(Math.random() * chars.length)];
      } while (rooms[code]);

      const limit = Math.min(Math.max(parseInt(maxPlayers) || 4, 2), 4);
      const m = mode === 'B' ? 'B' : 'A';
      const colors = getColors(m);

      rooms[code] = makeRoom(code, socket.id, m, limit);
      rooms[code].players[socket.id] = {
        id: socket.id, name, avatar,
        color: null, colorName: null, team: null,
        playerIndex: null, isHost: true, ready: false, disconnected: false,
        pawns: [-1, -1, -1, -1], finished: false, eliminated: false
      };
      rooms[code].turnOrder = [socket.id];
      
      socket.join(code);
      socket.currentRoom = code;
      socket.emit('ludoJoined', { code, isHost: true });
      broadcastLobby(rooms[code]);
      if (typeof broadcastStats === 'function') broadcastStats();
    });

    socket.on('ludoListRooms', () => {
      const list = Object.values(rooms)
        .filter(r => r.state === 'LOBBY' && r.gameType === 'L')
        .map(r => ({
          code: r.code,
          mode: r.mode,
          currentPlayers: Object.keys(r.players).length,
          maxPlayers: r.maxPlayers,
          hostName: r.players[r.hostId]?.name || '???',
          hasBots: Object.values(r.players).some(p => p.isBot)
        }))
        .sort((a, b) => b.currentPlayers - a.currentPlayers);
      socket.emit('ludoRoomsList', { rooms: list });
    });
    
    socket.on('ludoJoin', ({ name, avatar, code }) => {
      const room = rooms[code];
      if (!room || room.gameType !== 'L') return socket.emit('errorMsg', 'Sala não encontrada.');
      if (room.state !== 'LOBBY') return socket.emit('errorMsg', 'Partida já iniciada.');
      if (Object.keys(room.players).length >= room.maxPlayers) return socket.emit('errorMsg', 'Sala cheia.');

      room.players[socket.id] = {
        id: socket.id, name, avatar,
        color: null, colorName: null, team: null,
        playerIndex: null, isHost: false, ready: false, disconnected: false,
        pawns: [-1, -1, -1, -1], finished: false, eliminated: false
      };
      room.turnOrder.push(socket.id);

      socket.join(code);
      socket.currentRoom = code;
      socket.emit('ludoJoined', { code, isHost: false });
      broadcastLobby(room);
    });

    socket.on('ludoReady', ({ code }) => {
      const room = rooms[code];
      if (!room || room.state !== 'LOBBY') return;
      const p = room.players[socket.id];
      if (!p) return;
      p.ready = !p.ready;
      broadcastLobby(room);
    });

    socket.on('ludoPickColor', ({ code, colorIdx }) => {
      const room = rooms[code];
      if (!room || room.state !== 'LOBBY') return;
      const p = room.players[socket.id];
      if (!p || p.isBot) return;

      const colors = getColors(room.mode);
      if (typeof colorIdx !== 'number' || colorIdx < 0 || colorIdx >= colors.length) return;

      const taken = Object.values(room.players).some(other =>
        other.id !== socket.id && other.playerIndex === colorIdx
      );
      if (taken) return socket.emit('errorMsg', 'Essa cor já foi escolhida por outro jogador.');

      const color = colors[colorIdx];
      p.playerIndex = colorIdx;
      p.color = color.hex;
      p.colorName = color.name;
      p.team = color.team || null;

      broadcastLobby(room);
    });
    
    socket.on('ludoAddBot', ({ code }) => {
      const room = rooms[code];
      if (!room || room.hostId !== socket.id) return;
      if (room.state !== 'LOBBY') return;
      if (Object.keys(room.players).length >= room.maxPlayers) return socket.emit('errorMsg', 'Sala cheia.');
      const colorIdx = getFirstAvailableColor(room);
      if (colorIdx === -1) return socket.emit('errorMsg', 'Todas as cores estão em uso.');
      const colors = getColors(room.mode);
      const color = colors[colorIdx];
      const botId = 'bot_' + Date.now() + '_' + Math.random().toString(36).slice(2, 6);
      room.players[botId] = {
        id: botId,
        name: pickBotName(room),
        avatar: {},
        color: color.hex, colorName: color.name, team: color.team || null,
        playerIndex: colorIdx, isHost: false, isBot: true, ready: true, disconnected: false,
        pawns: [-1, -1, -1, -1], finished: false, eliminated: false
      };
      room.turnOrder.push(botId);
      broadcastLobby(room);
    });

    socket.on('ludoRemoveBot', ({ code }) => {
      const room = rooms[code];
      if (!room || room.hostId !== socket.id) return;
      if (room.state !== 'LOBBY') return;
      const botIds = Object.keys(room.players).filter(id => room.players[id].isBot);
      if (!botIds.length) return socket.emit('errorMsg', 'Não há bots para remover.');
      const botId = botIds[botIds.length - 1];
      delete room.players[botId];
      room.turnOrder = room.turnOrder.filter(id => id !== botId);
      broadcastLobby(room);
    });
    
    socket.on('ludoStart', ({ code }) => {
      const room = rooms[code];
      if (!room || room.hostId !== socket.id) return;

      const num = Object.keys(room.players).length;
      if (num < 2) return socket.emit('errorMsg', 'Mínimo 2 jogadores.');

      if (room.mode === 'B' && num !== 2 && num !== 4) {
        return socket.emit('errorMsg', 'O modo 2v2 exige 2 ou 4 jogadores.');
      }

      if (!Object.values(room.players).every(p => p.ready)) {
        return socket.emit('errorMsg', 'Todos precisam estar prontos.');
      }

      const noColor = Object.values(room.players).find(p => p.playerIndex === null || p.playerIndex === undefined);
      if (noColor) {
        return socket.emit('errorMsg', `${noColor.name} ainda não escolheu uma cor.`);
      }

      if (room.mode === 'B') {
        const rimk = Object.values(room.players).filter(p => p.team === 'RIMK').length;
        const zunk = Object.values(room.players).filter(p => p.team === 'ZUNK').length;
        if (num === 2 && (rimk !== 1 || zunk !== 1)) {
          return socket.emit('errorMsg', 'No 2v2 com 2 jogadores, um precisa ser Rimk e o outro Zunk.');
        }
        if (num === 4 && (rimk !== 2 || zunk !== 2)) {
          return socket.emit('errorMsg', 'No 2v2 com 4 jogadores, precisa ser 2 Rimks e 2 Zunks.');
        }
      }

      room.state = 'PLAYING';
      room.currentTurn = 0;
      room.dice = null;
      room.sixesInARow = 0;

      io.to(code).emit('ludoStarted', publicState(room));
      narrate(room, `A partida começou. ${num} jogadores em campo.`, '🚀', 'info');
      setTimeout(() => {
        const firstP = room.players[room.turnOrder[0]];
        if (firstP) narrate(room, `Turno de ${firstP.name}.`, '🎯', 'info');
      }, 800);
      startTurnTimer(room);
    });

    socket.on('ludoRoll', ({ code }) => {
      const room = rooms[code];
      if (!room || room.state !== 'PLAYING') return;
      if (room.turnOrder[room.currentTurn] !== socket.id) return;
      performRoll(room, socket.id);
    });

    socket.on('ludoMove', ({ code, pawnIndex }) => {
      const room = rooms[code];
      if (!room || room.state !== 'PLAYING') return;
      if (room.turnOrder[room.currentTurn] !== socket.id) return;
      performMove(room, socket.id, pawnIndex);
    });

    socket.on('ludoChat', ({ code, text }) => {
      const room = rooms[code];
      if (!room) return;
      const p = room.players[socket.id];
      if (!p || !text?.trim()) return;
      io.to(code).emit('ludoChat', { 
        sender: p.name, 
        senderColor: p.color || '#00ff66',
        text: text.trim(), 
        type: 'normal' 
      });
    });

    socket.on('ludoProposePause', ({ code }) => {
      const room = rooms[code];
      if (!room || room.state !== 'PLAYING') return;
      const p = room.players[socket.id];
      if (!p || p.eliminated) return;
      if (room.pauseVotes) return socket.emit('errorMsg', 'Já existe uma votação em andamento.');

      room.pauseVotes = {};
      room.pauseProposedBy = socket.id;
      room.pauseTarget = !room.isPaused;

      room.pauseVotes[socket.id] = true;

      const alive = Object.values(room.players).filter(pl => !pl.eliminated);

      io.to(code).emit('ludoPauseVoteStarted', {
        proposedBy: p.name,
        proposedById: socket.id,
        target: room.pauseTarget,
        total: alive.length,
        votes: { ...room.pauseVotes }
      });

      alive.forEach(pl => {
        if (!pl.isBot) return;
        if (pl.id === socket.id) return;
        setTimeout(() => {
          const r = rooms[code];
          if (!r || !r.pauseVotes) return;
          if (r.pauseVotes[pl.id] !== undefined) return;
          r.pauseVotes[pl.id] = true;
          checkPauseVote(r, code);
        }, 800 + Math.random() * 1200);
      });

      checkPauseVote(room, code);
    });

    socket.on('ludoVotePause', ({ code, vote }) => {
      const room = rooms[code];
      if (!room || room.state !== 'PLAYING') return;
      const p = room.players[socket.id];
      if (!p || p.eliminated) return;
      if (!room.pauseVotes) return;
      if (room.pauseVotes[socket.id] !== undefined) return;

      room.pauseVotes[socket.id] = !!vote;
      checkPauseVote(room, code);
    });
    
    socket.on('ludoLeave', ({ code }) => {
      const room = rooms[code];
      if (!room) return;
      handleLeave(room, socket.id);
    });

    socket.on('disconnect', () => {
      const code = socket.currentRoom;
      if (!code || !rooms[code]) return;
      const room = rooms[code];
      if (room.gameType !== 'L') return;
      if (!room.players[socket.id]) return;

      room.players[socket.id].disconnected = true;
      broadcastLobby(room);
      broadcastState(room);

      room.disconnectTimers[socket.id] = setTimeout(() => {
        if (rooms[code] && rooms[code].players[socket.id]?.disconnected) {
          handleLeave(rooms[code], socket.id);
        }
      }, DISCONNECT_GRACE * 1000);
    });
  });
}

module.exports = { init };
