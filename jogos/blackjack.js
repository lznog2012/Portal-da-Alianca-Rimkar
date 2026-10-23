// ================================================
// BLACKJACK (21) - Servidor
// Regras padrão de cassino:
//  - Baralho de 6 baralhos (embaralha quando restam ~25%)
//  - Cada jogador joga contra o Dealer (de 1 a 4 jogadores por mesa, bots opcionais)
//  - Blackjack natural paga 3:2 · vitória 1:1 · empate devolve a aposta
//  - Dealer compra até 16 e PARA em qualquer 17 (inclusive 17 "soft")
//  - Dealer confere blackjack (peek) com Ás ou figura/10 aberto
//  - Seguro (insurance) quando o Dealer mostra Ás: custa metade da aposta, paga 2:1
//  - Pedir, Parar, Dobrar (2 primeiras cartas), Dividir (pares de mesmo valor, até 4 mãos),
//    Desistir (late surrender, só na 1ª decisão)
//  - Ases divididos recebem só 1 carta e 21 depois de split não é blackjack
//  - Estourou perde, mesmo que o Dealer estoure depois
// ================================================

const DECKS = 6;
const MIN_BET = 10;
const MAX_BET = 500;
const START_CHIPS = 1000;
const MAX_SEATS = 4;
const BET_TIME = 20;
const INSURANCE_TIME = 10;
const ACTION_TIME = 25;
const RESULT_TIME = 8;
const DISCONNECT_GRACE = 30;
const RESHUFFLE_AT = DECKS * 52 * 0.25;
const MAX_HANDS = 4;

const RANKS = ['A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K'];
const SUITS = ['♠', '♥', '♦', '♣'];
const BOT_NAMES = ['Zorblax', 'Kryzzt', 'Vexnar', 'Quortan', 'Xyloph', 'Braxil', 'Nyzoth', 'Vrelka', 'Moxxi', 'Zarnak', 'Xerath', 'Quinlex', 'Nebulon', 'Kryon', 'Xylar', 'Vorlox'];

// ---------- helpers de cartas ----------
function cardValue(r) {
  if (r === 'A') return 11;
  if (r === 'K' || r === 'Q' || r === 'J' || r === '10') return 10;
  return parseInt(r, 10);
}
// valor para comparar pares no split (10, J, Q, K valem igual)
function splitValue(r) { return cardValue(r); }

function handTotal(cards) {
  let total = 0, aces = 0;
  for (const c of cards) {
    total += cardValue(c.r);
    if (c.r === 'A') aces++;
  }
  while (total > 21 && aces > 0) { total -= 10; aces--; }
  return { total, soft: aces > 0 };
}

function pick(a) { return a[Math.floor(Math.random() * a.length)]; }

function init(io, rooms, broadcastStats) {

  // ========== BARALHO ==========
  function newShoe() {
    const shoe = [];
    for (let d = 0; d < DECKS; d++) for (const s of SUITS) for (const r of RANKS) shoe.push({ r, s });
    for (let i = shoe.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [shoe[i], shoe[j]] = [shoe[j], shoe[i]];
    }
    return shoe;
  }
  function draw(room) {
    if (!room.shoe || !room.shoe.length) room.shoe = newShoe();
    return room.shoe.pop();
  }

  // ========== UTIL ==========
  function cleanName(n) {
    return String(n == null ? '' : n).replace(/[<>&"'`]/g, '').replace(/\s+/g, ' ').trim().slice(0, 16);
  }
  function cleanText(t) {
    return String(t == null ? '' : t).replace(/[<>&"'`]/g, '').replace(/\s+/g, ' ').trim().slice(0, 200);
  }
  function pickBotName(room) {
    const used = new Set(Object.values(room.players).map(p => p.name));
    for (let i = 0; i < 30; i++) {
      const n = pick(BOT_NAMES) + (Math.random() < 0.3 ? ' ' + Math.floor(Math.random() * 99 + 1) : '');
      if (!used.has(n)) return n;
    }
    return pick(BOT_NAMES) + '_' + Date.now().toString().slice(-3);
  }
  function makeBot(room) {
    room.botCounter = (room.botCounter || 0) + 1;
    return {
      id: 'bot_' + room.botCounter + '_' + Date.now() + '_' + Math.random().toString(36).slice(2, 6),
      clientId: null,
      name: pickBotName(room),
      avatar: {
        b: pick(['rimk', 'sahrin', 'vharn', 'thraak', 'ferrum', 'nereids']),
        bg: pick([null, 'rimkopolis', 'ferrum', 'kaal7', 'nereid', 'cowboy']),
        i: [pick(['chapeu-chef', 'chapeu-coroa', 'chapeu-cowboy', 'olhos-cool', 'roupa-jaleco', 'roupa-rei', 'antena-verde', 'fone-fone'])]
      },
      isHost: false, isBot: true, ready: true, disconnected: false, gone: false,
      ...freshSeat()
    };
  }
  function freshSeat() {
    return {
      chips: START_CHIPS, rebuys: 0,
      bet: 0, betLocked: false, insurance: 0, insuranceAnswered: false,
      hands: [], status: 'waiting', roundNet: 0
    };
  }

  const live = (room) => room.order.map(id => room.players[id]).filter(p => p && !p.gone);
  const humans = (room) => live(room).filter(p => !p.isBot);

  function clearTimers(room) {
    clearInterval(room.timer); room.timer = null;
    clearTimeout(room.stepTimer); room.stepTimer = null;
    room.seq = (room.seq || 0) + 1;     // invalida callbacks pendentes
  }
  // agenda um passo; se a fase mudar antes, o callback é ignorado
  function later(room, ms, fn) {
    const seq = room.seq;
    return setTimeout(() => {
      const r = rooms[room.code];
      if (!r || r !== room || r.seq !== seq) return;
      fn();
    }, ms);
  }
  function countdown(room, secs, onEnd) {
    clearInterval(room.timer);
    room.timeLeft = secs;
    io.to(room.code).emit('bjTimer', room.timeLeft);
    const seq = room.seq;
    room.timer = setInterval(() => {
      if (rooms[room.code] !== room || room.seq !== seq) { clearInterval(room.timer); return; }
      room.timeLeft--;
      io.to(room.code).emit('bjTimer', Math.max(0, room.timeLeft));
      if (room.timeLeft <= 0) { clearInterval(room.timer); room.timer = null; onEnd(); }
    }, 1000);
  }
  function log(room, text, tipo) {
    io.to(room.code).emit('bjLog', { text, tipo: tipo || 'info', t: Date.now() });
  }

  // ========== ESTADO PÚBLICO ==========
  function publicHand(h) {
    const t = handTotal(h.cards);
    return {
      cards: h.cards, bet: h.bet, total: t.total, soft: t.soft,
      done: !!h.done, bust: t.total > 21, bj: !!h.bj, doubled: !!h.doubled,
      surrendered: !!h.surrendered, splitAces: !!h.splitAces,
      result: h.result || null, net: h.net || 0
    };
  }
  function publicState(room) {
    const d = room.dealer;
    const shown = d.reveal ? d.cards : d.cards.slice(0, 1);
    const dt = handTotal(shown);
    return {
      code: room.code,
      state: room.state,
      phase: room.phase,
      round: room.round,
      maxPlayers: room.maxPlayers,
      hostId: room.hostId,
      timeLeft: room.timeLeft,
      shoeLeft: room.shoe ? room.shoe.length : 0,
      shoeTotal: DECKS * 52,
      limits: { min: MIN_BET, max: MAX_BET, start: START_CHIPS },
      dealer: {
        cards: d.cards.map((c, i) => (i === 1 && !d.reveal) ? { hidden: true } : c),
        total: dt.total, soft: dt.soft, reveal: !!d.reveal,
        bust: d.reveal && handTotal(d.cards).total > 21,
        bj: !!d.reveal && d.cards.length === 2 && handTotal(d.cards).total === 21
      },
      turn: room.turn ? { id: room.turn.pid, hand: room.turn.hi } : null,
      players: room.order.map(id => room.players[id]).filter(Boolean).map(p => ({
        id: p.id, name: p.name, avatar: p.avatar,
        isHost: !!p.isHost, isBot: !!p.isBot, disconnected: !!p.disconnected, gone: !!p.gone,
        chips: p.chips, rebuys: p.rebuys, bet: p.bet, betLocked: !!p.betLocked,
        insurance: p.insurance, insuranceAnswered: !!p.insuranceAnswered,
        status: p.status, roundNet: p.roundNet,
        hands: p.hands.map(publicHand)
      }))
    };
  }
  function broadcast(room) { io.to(room.code).emit('bjState', publicState(room)); }

  function broadcastLobby(room) {
    io.to(room.code).emit('bjLobby', {
      code: room.code,
      maxPlayers: room.maxPlayers,
      hostId: room.hostId,
      state: room.state,
      players: live(room).map(p => ({
        id: p.id, name: p.name, avatar: p.avatar,
        isHost: !!p.isHost, isBot: !!p.isBot, disconnected: !!p.disconnected
      }))
    });
  }

  function makeRoom(code, hostId, maxPlayers) {
    return {
      code, gameType: 'B', maxPlayers, hostId,
      state: 'LOBBY', phase: 'LOBBY', round: 0,
      players: {}, order: [],
      shoe: [], dealer: { cards: [], reveal: false },
      turn: null, timer: null, stepTimer: null, timeLeft: 0, seq: 0,
      disconnectTimers: {}, botCounter: 0
    };
  }

  // ========== RODADA ==========
  function startBetting(room) {
    if (room.state !== 'PLAYING') return;
    if (!['LOBBY', 'RESULT', 'IDLE'].includes(room.phase)) return;
    clearTimers(room);

    // quem saiu durante a rodada some da mesa agora
    room.order = room.order.filter(id => room.players[id] && !room.players[id].gone);
    Object.keys(room.players).forEach(id => { if (room.players[id].gone) delete room.players[id]; });

    if (!humans(room).length) return destroyRoom(room);

    if (!room.shoe || room.shoe.length < RESHUFFLE_AT) {
      room.shoe = newShoe();
      if (room.round > 0) log(room, '🔀 O Dealer embaralhou os baralhos.', 'info');
    }

    room.round++;
    room.dealer = { cards: [], reveal: false };
    room.turn = null;
    room.phase = 'BETTING';

    live(room).forEach(p => {
      if (p.chips < MIN_BET) {
        p.chips = START_CHIPS; p.rebuys++;
        log(room, `💰 ${p.name} ficou sem fichas e recebeu ${START_CHIPS} novas.`, 'warn');
      }
      p.bet = 0; p.betLocked = false; p.insurance = 0; p.insuranceAnswered = false;
      p.hands = []; p.roundNet = 0; p.status = 'active';
    });

    broadcast(room);
    countdown(room, BET_TIME, () => dealCards(room));

    // bots apostam depois de um tempinho
    live(room).filter(p => p.isBot).forEach(bot => {
      later(room, 1200 + Math.random() * 3500, () => {
        if (room.phase !== 'BETTING' || bot.betLocked) return;
        const opts = [10, 20, 50, 50, 100, 100, 200].filter(v => v <= bot.chips);
        placeBet(room, bot, opts.length ? pick(opts) : MIN_BET);
      });
    });
  }

  function placeBet(room, p, amount) {
    if (room.phase !== 'BETTING' || p.betLocked || p.status !== 'active' || p.gone) return false;
    amount = parseInt(amount, 10);
    if (!Number.isFinite(amount) || amount % 10 !== 0) return false;
    if (amount < MIN_BET || amount > MAX_BET || amount > p.chips) return false;
    p.bet = amount; p.chips -= amount; p.betLocked = true;
    broadcast(room);
    checkAllBet(room);
    return true;
  }

  function checkAllBet(room) {
    if (room.phase !== 'BETTING') return;
    const waiting = live(room).filter(p => p.status === 'active' && !p.disconnected && !p.betLocked);
    if (!waiting.length) {
      clearInterval(room.timer); room.timer = null;
      const seq = room.seq;
      setTimeout(() => { if (rooms[room.code] === room && room.seq === seq && room.phase === 'BETTING') dealCards(room); }, 500);
    }
  }

  function dealCards(room) {
    if (room.phase !== 'BETTING') return;
    clearTimers(room);
    const seated = live(room).filter(p => p.betLocked);
    if (!seated.length) {
      log(room, '⏳ Ninguém apostou. Nova rodada de apostas...', 'info');
      room.phase = 'IDLE'; broadcast(room);
      later(room, 1500, () => startBetting(room));
      return;
    }
    // quem não apostou fica de fora desta rodada
    live(room).filter(p => !p.betLocked).forEach(p => { p.status = 'sitout'; p.hands = []; });

    room.phase = 'DEALING';
    seated.forEach(p => { p.hands = [{ cards: [], bet: p.bet }]; });
    // duas voltas: jogadores e depois Dealer
    for (let round = 0; round < 2; round++) {
      seated.forEach(p => p.hands[0].cards.push(draw(room)));
      room.dealer.cards.push(draw(room));
    }
    seated.forEach(p => {
      const h = p.hands[0];
      if (handTotal(h.cards).total === 21) { h.bj = true; h.done = true; }
    });
    broadcast(room);
    log(room, `🃏 Rodada ${room.round}: cartas distribuídas.`, 'info');
    later(room, 900 + seated.length * 450, () => afterDeal(room));
  }

  function afterDeal(room) {
    const up = room.dealer.cards[0];
    if (up.r === 'A') return startInsurance(room);
    if (cardValue(up.r) === 10) return peek(room);
    startPlayers(room);
  }

  // ----- seguro -----
  function startInsurance(room) {
    room.phase = 'INSURANCE';
    live(room).forEach(p => { p.insuranceAnswered = false; });
    // bots nunca pegam seguro
    live(room).filter(p => p.isBot || p.disconnected).forEach(p => { p.insuranceAnswered = true; });
    log(room, '🛡 O Dealer mostra um Ás. Seguro disponível (paga 2:1).', 'warn');
    broadcast(room);
    if (!pendingInsurance(room).length) return later(room, 800, () => peek(room));
    countdown(room, INSURANCE_TIME, () => peek(room));
  }
  const pendingInsurance = (room) => live(room).filter(p => p.betLocked && !p.insuranceAnswered);

  function answerInsurance(room, p, take) {
    if (room.phase !== 'INSURANCE' || !p.betLocked || p.insuranceAnswered) return;
    p.insuranceAnswered = true;
    const cost = p.bet / 2;
    if (take && p.chips >= cost && !p.hands[0].bj) { p.chips -= cost; p.insurance = cost; }
    else if (take && p.hands[0].bj) { /* "even money" não tratado: já tem blackjack, segue sem seguro */ }
    broadcast(room);
    if (!pendingInsurance(room).length) {
      clearInterval(room.timer); room.timer = null;
      later(room, 600, () => peek(room));
    }
  }

  // ----- peek: Dealer confere blackjack -----
  function peek(room) {
    if (room.phase !== 'INSURANCE' && room.phase !== 'DEALING') return;
    clearInterval(room.timer); room.timer = null;
    room.phase = 'PEEK'; broadcast(room);
    later(room, 900, () => {
      const dBJ = handTotal(room.dealer.cards).total === 21;
      if (dBJ) {
        room.dealer.reveal = true;
        log(room, '🂡 O Dealer tem BLACKJACK!', 'alert');
        live(room).forEach(p => {
          if (p.insurance > 0) { p.chips += p.insurance * 3; }
        });
        broadcast(room);
        return later(room, 1200, () => settle(room, true));
      }
      const hadIns = live(room).some(p => p.insurance > 0);
      if (hadIns) log(room, 'O Dealer não tem blackjack. Os seguros foram perdidos.', 'info');
      startPlayers(room);
    });
  }

  // ----- vez dos jogadores -----
  function startPlayers(room) {
    room.phase = 'PLAYER';
    advanceTurn(room);
  }

  function nextOpenHand(room) {
    for (const id of room.order) {
      const p = room.players[id];
      if (!p || p.gone || !p.betLocked) continue;
      for (let hi = 0; hi < p.hands.length; hi++) {
        if (!p.hands[hi].done) return { pid: id, hi };
      }
    }
    return null;
  }

  function advanceTurn(room) {
    clearInterval(room.timer); room.timer = null;
    room.seq++;   // cancela passos pendentes da vez anterior
    const nxt = nextOpenHand(room);
    if (!nxt) { room.turn = null; return dealerPlay(room); }
    room.turn = nxt;
    room.phase = 'PLAYER';
    const p = room.players[nxt.pid];
    broadcast(room);

    if (p.isBot) {
      later(room, 1000 + Math.random() * 900, () => botAct(room, p));
      return;
    }
    if (p.disconnected) {
      later(room, 500, () => { p.hands[nxt.hi].done = true; advanceTurn(room); });
      return;
    }
    countdown(room, ACTION_TIME, () => {
      log(room, `⏱ ${p.name} demorou e parou automaticamente.`, 'warn');
      const h = p.hands[room.turn.hi]; if (h) h.done = true;
      advanceTurn(room);
    });
  }

  function canDouble(p, h) { return h.cards.length === 2 && !h.splitAces && p.chips >= h.bet; }
  function canSplit(p, h) {
    return p.hands.length < MAX_HANDS && h.cards.length === 2 && !h.splitAces &&
      splitValue(h.cards[0].r) === splitValue(h.cards[1].r) && p.chips >= h.bet;
  }
  function canSurrender(p, h) { return p.hands.length === 1 && h.cards.length === 2 && !h.fromSplit && !h.acted; }

  function doAction(room, p, action) {
    if (room.phase !== 'PLAYER' || !room.turn || room.turn.pid !== p.id) return false;
    const hi = room.turn.hi;
    const h = p.hands[hi];
    if (!h || h.done) return false;

    if (action === 'hit') {
      h.acted = true;
      h.cards.push(draw(room));
      const t = handTotal(h.cards).total;
      if (t > 21) { h.done = true; log(room, `💥 ${p.name} estourou com ${t}.`, 'alert'); }
      else if (t === 21) h.done = true;
    } else if (action === 'stand') {
      h.done = true;
    } else if (action === 'double') {
      if (!canDouble(p, h)) return false;
      p.chips -= h.bet; h.bet *= 2; h.doubled = true; h.acted = true;
      h.cards.push(draw(room));
      h.done = true;
      const t = handTotal(h.cards).total;
      log(room, `✖2 ${p.name} dobrou a aposta${t > 21 ? ' e estourou' : ''}.`, t > 21 ? 'alert' : 'info');
    } else if (action === 'split') {
      if (!canSplit(p, h)) return false;
      p.chips -= h.bet;
      const second = { cards: [h.cards.pop()], bet: h.bet, fromSplit: true };
      h.fromSplit = true;
      const aces = h.cards[0].r === 'A';
      h.cards.push(draw(room));
      second.cards.push(draw(room));
      if (aces) { h.splitAces = true; second.splitAces = true; h.done = true; second.done = true; }
      else {
        if (handTotal(h.cards).total === 21) h.done = true;
        if (handTotal(second.cards).total === 21) second.done = true;
      }
      p.hands.splice(hi + 1, 0, second);
      log(room, `✂ ${p.name} dividiu o par.`, 'info');
    } else if (action === 'surrender') {
      if (!canSurrender(p, h)) return false;
      h.surrendered = true; h.done = true;
      log(room, `🏳 ${p.name} desistiu (recebe metade da aposta).`, 'info');
    } else return false;

    broadcast(room);
    if (h.done) {
      later(room, 600, () => advanceTurn(room));
    } else {
      // mão continua: reinicia o relógio de decisão
      if (!p.isBot) countdown(room, ACTION_TIME, () => {
        log(room, `⏱ ${p.name} demorou e parou automaticamente.`, 'warn');
        const hh = p.hands[room.turn && room.turn.hi]; if (hh) hh.done = true;
        advanceTurn(room);
      });
      else later(room, 900 + Math.random() * 700, () => botAct(room, p));
    }
    return true;
  }

  // ----- estratégia básica simplificada dos bots -----
  function botAct(room, bot) {
    if (room.phase !== 'PLAYER' || !room.turn || room.turn.pid !== bot.id) return;
    const h = bot.hands[room.turn.hi];
    if (!h || h.done) return advanceTurn(room);
    const up = cardValue(room.dealer.cards[0].r);
    const { total, soft } = handTotal(h.cards);
    let act = 'stand';

    if (canSplit(bot, h)) {
      const v = cardValue(h.cards[0].r);
      if (h.cards[0].r === 'A' || v === 8) act = 'split';
      else if (v === 9 && up !== 7 && up < 10 && up !== 11) act = 'split';
      else if ((v === 7 || v === 6 || v === 2 || v === 3) && up >= 2 && up <= 6) act = 'split';
    }
    if (act !== 'split') {
      if (soft) {
        if (total >= 19) act = 'stand';
        else if (total === 18) act = up >= 9 ? 'hit' : (up <= 6 && canDouble(bot, h) ? 'double' : 'stand');
        else act = (total >= 15 && up >= 4 && up <= 6 && canDouble(bot, h)) ? 'double' : 'hit';
      } else if (total >= 17) act = 'stand';
      else if (total >= 13) act = up <= 6 ? 'stand' : 'hit';
      else if (total === 12) act = (up >= 4 && up <= 6) ? 'stand' : 'hit';
      else if (total === 11) act = canDouble(bot, h) ? 'double' : 'hit';
      else if (total === 10) act = (up <= 9 && canDouble(bot, h)) ? 'double' : 'hit';
      else if (total === 9) act = (up >= 3 && up <= 6 && canDouble(bot, h)) ? 'double' : 'hit';
      else act = 'hit';
    }
    if (!doAction(room, bot, act)) { h.done = true; advanceTurn(room); }
  }

  // ----- vez do Dealer -----
  function dealerPlay(room) {
    clearInterval(room.timer); room.timer = null;
    room.phase = 'DEALER';
    room.dealer.reveal = true;
    broadcast(room);

    // só compra se existir alguma mão viva (sem estourar, sem desistir e que não seja blackjack natural)
    const needDraw = live(room).some(p => p.betLocked && p.hands.some(h => !h.surrendered && handTotal(h.cards).total <= 21 && !h.bj));
    const step = () => {
      const t = handTotal(room.dealer.cards).total;
      if (needDraw && t < 17) {
        room.dealer.cards.push(draw(room));
        broadcast(room);
        later(room, 950, step);
      } else {
        later(room, 700, () => settle(room, false));
      }
    };
    later(room, 1100, step);
  }

  // ----- pagamento -----
  function settle(room, dealerBJ) {
    if (room.phase === 'RESULT') return;
    clearTimers(room);
    room.phase = 'RESULT';
    const dT = handTotal(room.dealer.cards).total;
    const dBust = dT > 21;

    live(room).filter(p => p.betLocked).forEach(p => {
      let net = 0;
      p.hands.forEach(h => {
        const t = handTotal(h.cards).total;
        let payout = 0, result;
        if (h.surrendered) { payout = h.bet / 2; result = 'surrender'; }
        else if (t > 21) { result = 'bust'; }
        else if (dealerBJ) { if (h.bj) { payout = h.bet; result = 'push'; } else result = 'lose'; }
        else if (h.bj) { payout = h.bet * 2.5; result = 'blackjack'; }
        else if (dBust) { payout = h.bet * 2; result = 'win'; }
        else if (t > dT) { payout = h.bet * 2; result = 'win'; }
        else if (t === dT) { payout = h.bet; result = 'push'; }
        else result = 'lose';
        h.result = result; h.payout = payout; h.net = payout - h.bet;
        p.chips += payout;
        net += h.net;
      });
      if (p.insurance > 0) net += dealerBJ ? p.insurance * 2 : -p.insurance;
      p.roundNet = net;
    });

    broadcast(room);
    const parts = live(room).filter(p => p.betLocked).map(p => `${p.name} ${p.roundNet > 0 ? '+' : ''}${p.roundNet}`);
    log(room, `📊 Resultado: ${dealerBJ ? 'Dealer com blackjack' : dBust ? 'Dealer estourou (' + dT + ')' : 'Dealer com ' + dT}${parts.length ? ' · ' + parts.join(' · ') : ''}`, 'result');

    countdown(room, RESULT_TIME, () => startBetting(room));
  }

  // ========== SALA ==========
  function destroyRoom(room) {
    clearTimers(room);
    Object.values(room.disconnectTimers).forEach(t => clearTimeout(t));
    delete rooms[room.code];
    if (typeof broadcastStats === 'function') broadcastStats();
  }

  function pickNewHost(room) {
    const nh = humans(room).find(p => !p.disconnected) || humans(room)[0];
    Object.values(room.players).forEach(p => { p.isHost = false; });
    if (nh) { nh.isHost = true; room.hostId = nh.id; }
  }

  function handleLeave(room, playerId) {
    const p = room.players[playerId];
    if (!p) return;
    if (room.disconnectTimers[playerId]) { clearTimeout(room.disconnectTimers[playerId]); delete room.disconnectTimers[playerId]; }

    const midRound = room.state === 'PLAYING' && ['DEALING', 'INSURANCE', 'PEEK', 'PLAYER', 'DEALER', 'RESULT'].includes(room.phase) && p.betLocked;

    if (midRound) {
      // a aposta já está na mesa: a vaga é liberada, mas a rodada termina normalmente
      p.gone = true; p.disconnected = true; p.insuranceAnswered = true;
      p.hands.forEach(h => { if (room.phase !== 'RESULT') h.done = true; });
    } else {
      delete room.players[playerId];
      room.order = room.order.filter(id => id !== playerId);
    }

    log(room, `${p.name} saiu da mesa.`, 'warn');
    if (!humans(room).length) return destroyRoom(room);
    if (room.hostId === playerId) pickNewHost(room);

    if (room.state === 'LOBBY') return broadcastLobby(room);

    if (midRound && room.phase === 'PLAYER' && room.turn && room.turn.pid === playerId) {
      advanceTurn(room);
    } else if (room.phase === 'INSURANCE' && !pendingInsurance(room).length) {
      later(room, 400, () => peek(room));
    } else if (room.phase === 'BETTING') {
      broadcast(room); checkAllBet(room);
    } else broadcast(room);
    broadcastLobby(room);
  }

  function leaveStaleRooms(socket, clientId) {
    for (const code of Object.keys(rooms)) {
      const room = rooms[code];
      if (!room || room.gameType !== 'B') continue;
      for (const pid of Object.keys(room.players)) {
        const pl = room.players[pid];
        if (pl.isBot) continue;
        const sameSocket = pid === socket.id;
        const sameClient = clientId && pl.clientId === clientId && (pl.disconnected || !io.sockets.sockets.get(pid));
        if (sameSocket || sameClient) {
          try { socket.leave(code); } catch (e) {}
          handleLeave(room, pid);
        }
      }
    }
  }

  function tryReconnect(socket, clientId) {
    if (!clientId) return false;
    for (const code of Object.keys(rooms)) {
      const room = rooms[code];
      if (!room || room.gameType !== 'B') continue;
      const oldId = Object.keys(room.players).find(pid => {
        const pl = room.players[pid];
        return !pl.isBot && !pl.gone && pl.clientId === clientId && pid !== socket.id && (pl.disconnected || !io.sockets.sockets.get(pid));
      });
      if (!oldId) continue;
      if (room.disconnectTimers[oldId]) { clearTimeout(room.disconnectTimers[oldId]); delete room.disconnectTimers[oldId]; }
      const pl = room.players[oldId];
      delete room.players[oldId];
      pl.id = socket.id; pl.disconnected = false;
      room.players[socket.id] = pl;
      room.order = room.order.map(id => id === oldId ? socket.id : id);
      if (room.hostId === oldId) room.hostId = socket.id;
      if (room.turn && room.turn.pid === oldId) room.turn.pid = socket.id;
      socket.join(code);
      socket.currentRoom = code;
      socket.emit('bjReconnected', { code, isHost: room.hostId === socket.id, state: room.state });
      broadcastLobby(room);
      if (room.state === 'PLAYING') broadcast(room);
      return true;
    }
    return false;
  }

  // ========== SOCKET ==========
  io.on('connection', (socket) => {
    const roomOf = (code) => {
      const room = rooms[code];
      return (room && room.gameType === 'B') ? room : null;
    };

    socket.on('bjIdentify', ({ clientId } = {}) => {
      if (typeof clientId !== 'string' || !clientId) return;
      socket.clientId = clientId;
      if (!tryReconnect(socket, clientId)) socket.emit('bjNoSession');
    });

    socket.on('bjCreate', ({ name, avatar, maxPlayers, clientId } = {}) => {
      name = cleanName(name);
      if (!name) return socket.emit('errorMsg', 'Digite seu nome!');
      if (typeof clientId === 'string' && clientId) socket.clientId = clientId;
      leaveStaleRooms(socket, socket.clientId);

      const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ';
      let code;
      do {
        code = '';
        for (let i = 0; i < 4; i++) code += chars[Math.floor(Math.random() * chars.length)];
      } while (rooms[code]);

      const limit = Math.min(Math.max(parseInt(maxPlayers, 10) || MAX_SEATS, 1), MAX_SEATS);
      const room = makeRoom(code, socket.id, limit);
      rooms[code] = room;
      room.players[socket.id] = {
        id: socket.id, clientId: socket.clientId || null, name, avatar,
        isHost: true, isBot: false, ready: true, disconnected: false, gone: false,
        ...freshSeat()
      };
      room.order = [socket.id];
      socket.join(code);
      socket.currentRoom = code;
      socket.emit('bjJoined', { code, isHost: true });
      broadcastLobby(room);
      if (typeof broadcastStats === 'function') broadcastStats();
    });

    socket.on('bjListRooms', () => {
      const list = Object.values(rooms)
        .filter(r => r.gameType === 'B' && live(r).length < r.maxPlayers)
        .map(r => ({
          code: r.code,
          state: r.state,
          currentPlayers: live(r).length,
          maxPlayers: r.maxPlayers,
          hostName: (r.players[r.hostId] && r.players[r.hostId].name) || '???',
          hasBots: live(r).some(p => p.isBot)
        }))
        .sort((a, b) => b.currentPlayers - a.currentPlayers);
      socket.emit('bjRoomsList', { rooms: list });
    });

    socket.on('bjJoin', ({ name, avatar, code, clientId } = {}) => {
      name = cleanName(name);
      if (!name) return socket.emit('errorMsg', 'Digite seu nome!');
      code = String(code || '').trim().toUpperCase();
      if (typeof clientId === 'string' && clientId) socket.clientId = clientId;
      const existing = roomOf(code);
      if (existing && existing.players[socket.id] && !existing.players[socket.id].gone) {
        socket.emit('bjJoined', { code, isHost: !!existing.players[socket.id].isHost });
        broadcastLobby(existing);
        if (existing.state === 'PLAYING') broadcast(existing);
        return;
      }
      leaveStaleRooms(socket, socket.clientId);
      const room = roomOf(code);
      if (!room) return socket.emit('errorMsg', 'Mesa não encontrada.');
      if (live(room).length >= room.maxPlayers) return socket.emit('errorMsg', 'Mesa cheia.');

      room.players[socket.id] = {
        id: socket.id, clientId: socket.clientId || null, name, avatar,
        isHost: false, isBot: false, ready: true, disconnected: false, gone: false,
        ...freshSeat()
      };
      room.order.push(socket.id);
      // quem entra com as apostas abertas já pode apostar; senão espera a próxima rodada
      if (room.state === 'PLAYING' && room.phase === 'BETTING') room.players[socket.id].status = 'active';

      socket.join(code);
      socket.currentRoom = code;
      socket.emit('bjJoined', { code, isHost: false });
      log(room, `👋 ${name} sentou à mesa.`, 'info');
      broadcastLobby(room);
      if (room.state === 'PLAYING') broadcast(room);
      if (typeof broadcastStats === 'function') broadcastStats();
    });

    socket.on('bjAddBot', ({ code } = {}) => {
      const room = roomOf(code);
      if (!room || room.hostId !== socket.id) return;
      if (live(room).length >= room.maxPlayers) return socket.emit('errorMsg', 'Mesa cheia.');
      const bot = makeBot(room);
      room.players[bot.id] = bot;
      room.order.push(bot.id);
      if (room.state === 'PLAYING' && room.phase === 'BETTING') bot.status = 'active';
      log(room, `🤖 ${bot.name} (bot) sentou à mesa.`, 'info');
      broadcastLobby(room);
      if (room.state === 'PLAYING') {
        broadcast(room);
        if (room.phase === 'BETTING') later(room, 1200 + Math.random() * 2500, () => {
          if (room.phase === 'BETTING' && !bot.betLocked) placeBet(room, bot, pick([10, 20, 50, 100].filter(v => v <= bot.chips)) || MIN_BET);
        });
      }
    });

    socket.on('bjRemoveBot', ({ code } = {}) => {
      const room = roomOf(code);
      if (!room || room.hostId !== socket.id) return;
      const bots = live(room).filter(p => p.isBot);
      if (!bots.length) return socket.emit('errorMsg', 'Não há bots para remover.');
      const inRound = room.state === 'PLAYING' && ['DEALING', 'INSURANCE', 'PEEK', 'PLAYER', 'DEALER'].includes(room.phase);
      const target = bots[bots.length - 1];
      if (inRound && target.betLocked) return socket.emit('errorMsg', 'Espere a rodada terminar para remover o bot.');
      delete room.players[target.id];
      room.order = room.order.filter(id => id !== target.id);
      broadcastLobby(room);
      if (room.state === 'PLAYING') { broadcast(room); if (room.phase === 'BETTING') checkAllBet(room); }
    });

    socket.on('bjStart', ({ code } = {}) => {
      const room = roomOf(code);
      if (!room || room.hostId !== socket.id || room.state !== 'LOBBY') return;
      room.state = 'PLAYING';
      room.round = 0;
      io.to(room.code).emit('bjStarted', { code: room.code });
      log(room, '🎰 A mesa está aberta! Boa sorte, tripulantes.', 'info');
      startBetting(room);
    });

    socket.on('bjBet', ({ code, amount } = {}) => {
      const room = roomOf(code); if (!room) return;
      const p = room.players[socket.id]; if (!p) return;
      if (!placeBet(room, p, amount)) socket.emit('errorMsg', 'Aposta inválida.');
    });

    socket.on('bjInsurance', ({ code, take } = {}) => {
      const room = roomOf(code); if (!room) return;
      const p = room.players[socket.id]; if (!p) return;
      answerInsurance(room, p, !!take);
    });

    socket.on('bjAction', ({ code, action } = {}) => {
      const room = roomOf(code); if (!room) return;
      const p = room.players[socket.id]; if (!p) return;
      if (!doAction(room, p, String(action))) socket.emit('bjActionDenied', { action });
    });

    socket.on('bjChat', ({ code, text } = {}) => {
      const room = roomOf(code); if (!room) return;
      const p = room.players[socket.id]; if (!p) return;
      text = cleanText(text);
      if (!text) return;
      io.to(room.code).emit('bjChat', { sender: p.name, text });
    });

    socket.on('bjLeave', ({ code } = {}) => {
      const room = roomOf(code); if (!room) return;
      try { socket.leave(code); } catch (e) {}
      socket.currentRoom = null;
      handleLeave(room, socket.id);
    });

    socket.on('disconnect', () => {
      const code = socket.currentRoom;
      const room = code && roomOf(code);
      if (!room) return;
      const p = room.players[socket.id];
      if (!p) return;
      p.disconnected = true;
      broadcastLobby(room);
      if (room.state === 'PLAYING') {
        broadcast(room);
        if (room.phase === 'BETTING') checkAllBet(room);
        if (room.phase === 'INSURANCE' && !pendingInsurance(room).length) later(room, 400, () => peek(room));
        if (room.phase === 'PLAYER' && room.turn && room.turn.pid === socket.id) {
          later(room, 400, () => { const h = p.hands[room.turn && room.turn.hi]; if (h) h.done = true; advanceTurn(room); });
        }
      }
      room.disconnectTimers[socket.id] = setTimeout(() => {
        const r = rooms[code];
        if (r && r.players[socket.id] && r.players[socket.id].disconnected) handleLeave(r, socket.id);
      }, DISCONNECT_GRACE * 1000);
    });
  });
}

module.exports = { init, _test: { handTotal, cardValue } };
