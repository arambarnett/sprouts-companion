(function () {
  const vscode = acquireVsCodeApi();

  const arenaSignedOut = document.getElementById("arenaSignedOut");
  const arenaApp = document.getElementById("arenaApp");
  const arenaViewMenu = document.getElementById("arenaViewMenu");
  const arenaViewPvp = document.getElementById("arenaViewPvp");
  const arenaViewBattle = document.getElementById("arenaViewBattle");
  const arenaPvpContent = document.getElementById("arenaPvpContent");
  const arenaBattleMain = document.getElementById("arenaBattleMain");
  const menuCanvas = document.getElementById("arenaMenuCanvas");
  const menuEmoji = document.getElementById("arenaMenuEmoji");
  const arenaMenuSproutName = document.getElementById("arenaMenuSproutName");
  const arenaMenuLevel = document.getElementById("arenaMenuLevel");
  const arenaMenuHint = document.getElementById("arenaMenuHint");
  const canvasYou = document.getElementById("arenaCanvasYou");
  const canvasOpp = document.getElementById("arenaCanvasOpp");
  const arenaGbDialogueText = document.getElementById("arenaGbDialogueText");
  const arenaGbYouName = document.getElementById("arenaGbYouName");
  const arenaGbYouLv = document.getElementById("arenaGbYouLv");
  const arenaGbYouHpFill = document.getElementById("arenaGbYouHpFill");
  const arenaGbYouHpNums = document.getElementById("arenaGbYouHpNums");
  const arenaGbYouAtk = document.getElementById("arenaGbYouAtk");
  const arenaGbOppName = document.getElementById("arenaGbOppName");
  const arenaGbOppLv = document.getElementById("arenaGbOppLv");
  const arenaGbOppHpFill = document.getElementById("arenaGbOppHpFill");
  const arenaGbOppHpNums = document.getElementById("arenaGbOppHpNums");
  const arenaGbOppAtk = document.getElementById("arenaGbOppAtk");

  const arenaBtnSignIn = document.getElementById("arenaBtnSignIn");
  const arenaBtnRefresh = document.getElementById("arenaBtnRefresh");
  const arenaBtnSignOut = document.getElementById("arenaBtnSignOut");
  const arenaNavPvp = document.getElementById("arenaNavPvp");
  const arenaNavCpu = document.getElementById("arenaNavCpu");
  const arenaNavRoster = document.getElementById("arenaNavRoster");
  const arenaPvpBack = document.getElementById("arenaPvpBack");
  const arenaBattleBack = document.getElementById("arenaBattleBack");

  let currentSprout = null;
  let profile = null;
  /** menu | hub | pvp | cpu */
  let gameMode = "menu";
  let cpuState = null;
  let onlineBattle = null;
  let lastPvpError = "";
  let arenaFeedNote = "";
  let hubPollTimer = null;
  let menuRaf = 0;
  let battleRaf = 0;
  let menuFrame = 0;
  let menuAcc = 0;
  let menuPrevT = 0;
  let battleFrame = 0;
  let battleAcc = 0;
  let battlePrevT = 0;
  const MENU_FPS = 5;
  const BATTLE_FPS = 5;
  /** @type {{ state: object, role: string, isCpu: boolean, flashYouUntil: number, flashOppUntil: number } | null} */
  let activeBattleDraw = null;

  const arenaQueue = [];
  let arenaRunning = null;

  function arenaPump() {
    if (arenaRunning || arenaQueue.length === 0) return;
    arenaRunning = arenaQueue.shift();
    vscode.postMessage(
      Object.assign({ type: "ideArenaApi", op: arenaRunning.op }, arenaRunning.extra)
    );
  }

  function arenaEnqueue(op, extra) {
    return new Promise(function (resolve, reject) {
      arenaQueue.push({ op: op, extra: extra || {}, resolve: resolve, reject: reject });
      arenaPump();
    });
  }

  const MOVE_LABELS = {
    fireball: "Fire Ball",
    ice_blast: "Ice Blast",
    pizza_party: "Pizza Party",
    harden: "Harden",
    anxiety: "Anxiety",
    fraud_fingers: "Fraud Fingers",
    doxxing: "Doxxing",
    exhaustion: "Exhaustion",
    audit: "Audit",
    liquidation: "Liquidation",
    cellphone: "Cellphone",
    code_leak: "Code Leak",
    nepotism: "Nepotism",
  };
  const PVP_POOL = Object.keys(MOVE_LABELS);

  function el(tag, cls, html) {
    const n = document.createElement(tag);
    if (cls) n.className = cls;
    if (html != null) n.innerHTML = html;
    return n;
  }

  function setArenaView(view) {
    if (arenaViewMenu) arenaViewMenu.hidden = view !== "menu";
    if (arenaViewPvp) arenaViewPvp.hidden = view !== "pvp";
    if (arenaViewBattle) arenaViewBattle.hidden = view !== "battle";
    if (arenaPvpContent) arenaPvpContent.scrollTop = 0;
    if (arenaBattleMain) arenaBattleMain.scrollTop = 0;
    try {
      window.scrollTo(0, 0);
    } catch (_e) {
      /* ignore */
    }
  }

  function stopMenuRaf() {
    if (menuRaf) {
      cancelAnimationFrame(menuRaf);
      menuRaf = 0;
    }
  }

  function stopBattleRaf() {
    if (battleRaf) {
      cancelAnimationFrame(battleRaf);
      battleRaf = 0;
    }
  }

  function stopHubPoll() {
    if (hubPollTimer) {
      clearInterval(hubPollTimer);
      hubPollTimer = null;
    }
  }

  function startHubPoll() {
    stopHubPoll();
    hubPollTimer = setInterval(function () {
      if (gameMode === "hub") void loadFullHub();
    }, 15000);
  }

  function sproutBattleReady(sp) {
    return (
      sp &&
      sp.isDead !== true &&
      sp.isDormant !== true &&
      sp.growthStage !== "Egg"
    );
  }

  function previewEggParams() {
    return {
      species: undefined,
      growthStage: "Egg",
      mood: undefined,
      rest: 100,
      water: 100,
      food: 100,
      health: 100,
    };
  }

  function buildMiniParams(sp) {
    if (!sp) return null;
    return {
      species: sp.species,
      growthStage: sp.growthStage,
      mood: sp.mood,
      rest: Number(sp.restScore) || 0,
      water: Number(sp.waterScore) || 0,
      food: Number(sp.foodScore) || 0,
      health: sp.healthPoints != null ? Number(sp.healthPoints) || 0 : 100,
      rarity: sp.rarity,
      isDormant: sp.isDormant === true,
      isDead: sp.isDead === true,
      incubatorType:
        sp.incubator && sp.incubator.type ? String(sp.incubator.type) : undefined,
    };
  }

  function paramsFromBrief(bs) {
    const lvl = Number(bs.level) || 1;
    const stage = lvl >= 8 ? "Adult" : "Teen";
    return {
      species: bs.species || "fox",
      growthStage: stage,
      mood: undefined,
      rest: 92,
      water: 92,
      food: 92,
      health: 100,
      rarity: undefined,
      isDormant: false,
      isDead: false,
    };
  }

  /** Battle HUD sprite params: HP drives mood; KO uses dead animation. */
  function paramsForBattle(brief, hp, maxHp, forceDead) {
    const base = paramsFromBrief(brief);
    if (forceDead || hp <= 0) {
      return Object.assign({}, base, { health: 0, isDead: true, mood: undefined });
    }
    const pct = maxHp > 0 ? Math.round((hp / maxHp) * 100) : 100;
    return Object.assign({}, base, {
      health: Math.max(1, pct),
      rest: 80,
      water: 80,
      food: 80,
      isDead: false,
      mood: undefined,
    });
  }

  function scheduleBattleFlash(state, role) {
    if (!activeBattleDraw || state.winner) return;
    const last = state.log.length ? String(state.log[state.log.length - 1]) : "";
    if (!last) return;
    const you = role === "challenger" ? state.sproutC : state.sproutD;
    const them = role === "challenger" ? state.sproutD : state.sproutC;
    const yn = String(you.name || "Sprout").trim();
    const tn = String(them.name || "Foe").trim();
    const t = performance.now() + 480;
    if (/used .*(dmg\.|missed)/.test(last)) {
      const m = last.match(/^(.+?) used /);
      const attacker = m ? m[1].trim() : "";
      if (attacker === yn || last.indexOf(yn + " used") === 0) {
        activeBattleDraw.flashOppUntil = t;
      } else if (attacker === tn || last.indexOf(tn + " used") === 0) {
        activeBattleDraw.flashYouUntil = t;
      }
    } else if (last.indexOf(" skips a turn") >= 0 || last.indexOf("frozen") >= 0) {
      if (last.indexOf(yn) === 0) activeBattleDraw.flashYouUntil = t;
      else if (last.indexOf(tn) === 0) activeBattleDraw.flashOppUntil = t;
    }
  }

  function updateBattleDialogue(state) {
    if (!arenaGbDialogueText) return;
    var line = "";
    if (state.winner && state.log.length) {
      line = String(state.log[state.log.length - 1]);
    } else if (state.log.length) {
      line = String(state.log[state.log.length - 1]);
    } else {
      line = "What will you do?";
    }
    if (arenaGbDialogueText.textContent !== line) {
      arenaGbDialogueText.textContent = line;
      arenaGbDialogueText.classList.remove("arena-gb-dialogue--flash");
      void arenaGbDialogueText.offsetWidth;
      arenaGbDialogueText.classList.add("arena-gb-dialogue--flash");
    }
  }

  function updateBattleHud(state, role) {
    const you = role === "challenger" ? state.sproutC : state.sproutD;
    const them = role === "challenger" ? state.sproutD : state.sproutC;
    const hpYou = role === "challenger" ? state.hpC : state.hpD;
    const maxYou = role === "challenger" ? state.maxHpC : state.maxHpD;
    const hpThem = role === "challenger" ? state.hpD : state.hpC;
    const maxThem = role === "challenger" ? state.maxHpD : state.maxHpC;
    const atkYou = role === "challenger" ? state.attackC : state.attackD;
    const atkThem = role === "challenger" ? state.attackD : state.attackC;
    const comYou = role === "challenger" ? state.commitsC : state.commitsD;
    const comThem = role === "challenger" ? state.commitsD : state.commitsC;

    const pct = function (h, m) {
      return m > 0 ? Math.min(100, Math.round((h / m) * 100)) : 0;
    };

    if (arenaGbYouName) arenaGbYouName.textContent = you.name || "You";
    if (arenaGbYouLv) arenaGbYouLv.textContent = "Lv" + (you.level != null ? String(you.level) : "?");
    if (arenaGbYouHpFill) arenaGbYouHpFill.style.width = pct(hpYou, maxYou) + "%";
    if (arenaGbYouHpNums)
      arenaGbYouHpNums.textContent = "HP " + String(hpYou) + " / " + String(maxYou);
    if (arenaGbYouAtk)
      arenaGbYouAtk.textContent =
        "ATK " + String(atkYou) + " · Commits +" + String(comYou != null ? comYou : 0);

    if (arenaGbOppName) arenaGbOppName.textContent = them.name || "Foe";
    if (arenaGbOppLv) arenaGbOppLv.textContent = "Lv" + (them.level != null ? String(them.level) : "?");
    if (arenaGbOppHpFill) arenaGbOppHpFill.style.width = pct(hpThem, maxThem) + "%";
    if (arenaGbOppHpNums)
      arenaGbOppHpNums.textContent = "HP " + String(hpThem) + " / " + String(maxThem);
    if (arenaGbOppAtk)
      arenaGbOppAtk.textContent =
        "ATK " + String(atkThem) + " · Commits +" + String(comThem != null ? comThem : 0);
  }

  function syncMenuSprite() {
    if (!menuCanvas || !menuEmoji) return;
    if (!window.SproutsPixel) {
      stopMenuRaf();
      menuCanvas.setAttribute("hidden", "");
      menuEmoji.removeAttribute("hidden");
      return;
    }
    menuCanvas.removeAttribute("hidden");
    menuEmoji.setAttribute("hidden", "");
    startMenuRaf();
  }

  function startMenuRaf() {
    stopMenuRaf();
    if (!window.SproutsPixel || !menuCanvas) return;
    const ctx = menuCanvas.getContext("2d");
    if (!ctx) return;
    menuFrame = 0;
    menuAcc = 0;
    menuPrevT = 0;
    const step = 1000 / MENU_FPS;
    function tick(t) {
      menuRaf = requestAnimationFrame(tick);
      if (!window.SproutsPixel) return;
      const sp = currentSprout;
      const params = sp ? buildMiniParams(sp) : previewEggParams();
      if (menuPrevT === 0) menuPrevT = t;
      menuAcc += t - menuPrevT;
      menuPrevT = t;
      const P = window.SproutsPixel;
      const frames = P.buildPetFrames(params);
      while (menuAcc >= step) {
        menuAcc -= step;
        menuFrame = (menuFrame + 1) % frames.length;
      }
      P.drawPetFrame(ctx, params, menuFrame);
    }
    menuRaf = requestAnimationFrame(tick);
  }

  function startBattleRaf() {
    if (battleRaf) {
      cancelAnimationFrame(battleRaf);
      battleRaf = 0;
    }
    if (!window.SproutsPixel || !canvasYou || !canvasOpp) return;
    const ctxY = canvasYou.getContext("2d");
    const ctxO = canvasOpp.getContext("2d");
    if (!ctxY || !ctxO) return;
    battleFrame = 0;
    battleAcc = 0;
    battlePrevT = 0;
    const step = 1000 / BATTLE_FPS;
    function tick(t) {
      battleRaf = requestAnimationFrame(tick);
      if (!window.SproutsPixel || !activeBattleDraw) return;
      const d = activeBattleDraw;
      const st = d.state;
      const you = d.role === "challenger" ? st.sproutC : st.sproutD;
      const them = d.role === "challenger" ? st.sproutD : st.sproutC;
      const fullYou =
        currentSprout &&
        String(currentSprout.name || "") === String(you.name || "") &&
        String(currentSprout.species || "") === String(you.species || "");
      const hpYou = d.role === "challenger" ? st.hpC : st.hpD;
      const maxYou = d.role === "challenger" ? st.maxHpC : st.maxHpD;
      const hpThem = d.role === "challenger" ? st.hpD : st.hpC;
      const maxThem = d.role === "challenger" ? st.maxHpD : st.maxHpC;
      const won = st.winner != null;
      const youLost =
        won &&
        ((d.role === "challenger" && st.winner === "defender") ||
          (d.role === "defender" && st.winner === "challenger"));
      const oppLost =
        won &&
        ((d.role === "challenger" && st.winner === "challenger") ||
          (d.role === "defender" && st.winner === "defender"));
      var pYou;
      if (fullYou) {
        pYou = Object.assign({}, buildMiniParams(currentSprout), {
          health: hpYou <= 0 || youLost ? 0 : Math.max(1, Math.round((hpYou / maxYou) * 100)),
          isDead: hpYou <= 0 || youLost,
          isDormant: false,
        });
      } else {
        pYou = paramsForBattle(you, hpYou, maxYou, !!youLost);
      }
      var pThem = paramsForBattle(them, hpThem, maxThem, !!oppLost);
      const now = performance.now();
      if (now < d.flashYouUntil) {
        pYou = Object.assign({}, pYou, { mood: "angry" });
      }
      if (now < d.flashOppUntil) {
        pThem = Object.assign({}, pThem, { mood: "angry" });
      }
      if (battlePrevT === 0) battlePrevT = t;
      battleAcc += t - battlePrevT;
      battlePrevT = t;
      const P = window.SproutsPixel;
      const fY = P.buildPetFrames(pYou);
      const fO = P.buildPetFrames(pThem);
      while (battleAcc >= step) {
        battleAcc -= step;
        battleFrame = (battleFrame + 1) % Math.max(fY.length, fO.length);
      }
      const iY = battleFrame % fY.length;
      const iO = battleFrame % fO.length;
      P.drawPetFrame(ctxY, pYou, iY);
      P.drawPetFrame(ctxO, pThem, iO);
    }
    battleRaf = requestAnimationFrame(tick);
  }

  function updateMenuCard() {
    if (!arenaMenuSproutName || !arenaMenuLevel) return;
    if (!currentSprout) {
      arenaMenuSproutName.textContent = "No sprout yet";
      arenaMenuLevel.textContent = "LVL —";
      if (arenaMenuHint)
        arenaMenuHint.textContent = "Open the Sprouts sidebar to hatch.";
    } else {
      arenaMenuSproutName.textContent = currentSprout.name || "Sprout";
      arenaMenuLevel.textContent = "LVL " + (currentSprout.level != null ? String(currentSprout.level) : "?");
      if (arenaMenuHint) {
        if (!sproutBattleReady(currentSprout)) {
          arenaMenuHint.textContent = "Hatch and wake your sprout to queue or battle.";
        } else {
          arenaMenuHint.textContent = "";
        }
      }
    }
  }

  function pickMoves(rng) {
    const pool = PVP_POOL.slice();
    const out = [];
    for (let i = 0; i < 4 && pool.length; i++) {
      const idx = Math.floor(rng() * pool.length);
      out.push(pool.splice(idx, 1)[0]);
    }
    while (out.length < 4) out.push("fireball");
    return out;
  }

  function attackStatFromSprout(sp) {
    const str = Number(sp.strength) || 10;
    const intel = Number(sp.intelligence) || 10;
    const lvl = Number(sp.level) || 1;
    return Math.max(5, Math.floor((str + intel + lvl * 2) / 2));
  }

  function maxHpFromSprout(sp) {
    const end = Number(sp.endurance) || 10;
    const lvl = Number(sp.level) || 1;
    return Math.max(60, 80 + end * 2 + lvl * 8);
  }

  function dmgMult(commits, level) {
    return (1 + commits / 300) * (1 + level / 25);
  }

  function applyLocalMove(state, actor, moveKey, rng) {
    const next = JSON.parse(JSON.stringify(state));
    if (next.winner) return { ok: false, error: "done" };
    if (next.turn !== actor) return { ok: false, error: "turn" };
    const self = actor === "challenger" ? "C" : "D";
    const opp = self === "C" ? "D" : "C";
    const fSelf = self === "C" ? next.fc : next.fd;
    const fOpp = opp === "C" ? next.fc : next.fd;
    const nameSelf = self === "C" ? next.sproutC.name : next.sproutD.name;
    const nameOpp = opp === "C" ? next.sproutC.name : next.sproutD.name;
    if (fSelf.frozen) {
      fSelf.frozen = false;
      next.log.push(nameSelf + " is frozen and skips a turn!");
      next.turn = actor === "challenger" ? "defender" : "challenger";
      return { ok: true, state: next };
    }
    const moves = self === "C" ? next.movesC : next.movesD;
    if (moves.indexOf(moveKey) < 0) return { ok: false, error: "move" };
    const M = {
      fireball: { n: "Fire Ball", p: 60, a: 90 },
      ice_blast: { n: "Ice Blast", p: 30, a: 80, freeze: 1 },
      pizza_party: { n: "Pizza Party", p: 40, a: 100 },
      harden: { n: "Harden", p: 0, a: 100, harden: 1 },
      anxiety: { n: "Anxiety", p: 0, a: 100, anxiety: 1 },
      fraud_fingers: { n: "Fraud Fingers", p: 18, a: 100 },
      doxxing: { n: "Doxxing", p: 50, a: 100, doxx: 1 },
      exhaustion: { n: "Exhaustion", p: 20, a: 100 },
      audit: { n: "Audit", p: 15, a: 100 },
      liquidation: { n: "Liquidation", p: 22, a: 100 },
      cellphone: { n: "Cellphone", p: 12, a: 100 },
      code_leak: { n: "Code Leak", p: 16, a: 100 },
      nepotism: { n: "Nepotism", p: 14, a: 100 },
    };
    const move = M[moveKey];
    if (!move) return { ok: false, error: "?" };
    if (rng() * 100 > move.a) {
      next.log.push(nameSelf + " used " + move.n + " — missed!");
      next.turn = actor === "challenger" ? "defender" : "challenger";
      return { ok: true, state: next };
    }
    const atk = self === "C" ? next.attackC : next.attackD;
    const lvl = self === "C" ? next.sproutC.level : next.sproutD.level;
    const commits = self === "C" ? next.commitsC : next.commitsD;
    let mult = dmgMult(commits, lvl);
    if (fSelf.nextDamageMult != null) {
      mult *= fSelf.nextDamageMult;
      fSelf.nextDamageMult = undefined;
    }
    if (move.harden) {
      fSelf.harden = true;
      next.log.push(nameSelf + " used " + move.n + "! Next hit blocked.");
    } else if (move.anxiety) {
      fOpp.nextDamageMult = 0.55;
      next.log.push(nameSelf + " used " + move.n + "! " + nameOpp + " is rattled.");
    } else {
      let base = move.p;
      let dmg = Math.floor(base * (atk / 10) * mult);
      var powMap = self === "C" ? next.powC : next.powD;
      var tier =
        powMap && powMap[moveKey] != null ? Math.min(5, Math.floor(Number(powMap[moveKey]))) : 0;
      if (tier > 0 && dmg > 0) {
        dmg = Math.floor(dmg * (1 + tier * 0.08));
      }
      if (move.doxx) dmg += 15;
      const targetIsC = self === "D";
      const fTarget = targetIsC ? next.fc : next.fd;
      if (fTarget.harden) {
        fTarget.harden = false;
        next.log.push(nameSelf + " used " + move.n + "! Blocked.");
      } else {
        if (targetIsC) {
          next.hpC = Math.max(0, next.hpC - dmg);
          if (next.hpC <= 0) {
            next.winner = "defender";
            next.log.push(next.sproutC.name + " lost. CPU wins.");
          }
        } else {
          next.hpD = Math.max(0, next.hpD - dmg);
          if (next.hpD <= 0) {
            next.winner = "challenger";
            next.log.push("You win!");
          }
        }
        if (!next.winner) {
          let line = nameSelf + " used " + move.n + "! " + dmg + " dmg.";
          if (move.freeze) {
            fOpp.frozen = true;
            line += " " + nameOpp + " is frozen!";
          }
          next.log.push(line);
        }
      }
    }
    if (next.winner) return { ok: true, state: next };
    next.turn = actor === "challenger" ? "defender" : "challenger";
    return { ok: true, state: next };
  }

  function runBattleRetreat(isCpu, role) {
    if (isCpu) {
      void (async function () {
        if (!cpuState) return;
        const m = await arenaEnqueue("cpuRetreat", {});
        if (!m.ok) {
          lastPvpError = m.error || "Could not process retreat";
          renderBattle(cpuState, role, true);
          return;
        }
        const paid = m.data && m.data.feedPaid != null ? Number(m.data.feedPaid) : 0;
        const next = JSON.parse(JSON.stringify(cpuState));
        next.winner = "defender";
        next.log = next.log.slice();
        next.log.push(
          "You retreated." + (paid > 0 ? " Paid " + paid + " Feed." : " No Feed deducted.")
        );
        cpuState = next;
        renderBattle(cpuState, role, true);
      })();
      return;
    }
    if (!onlineBattle || !onlineBattle.id) return;
    const rrole = onlineBattle.role || role;
    void (async function () {
      const m = await arenaEnqueue("surrender", { battleId: onlineBattle.id });
      if (m.ok && m.data && m.data.state) {
        const paid = m.data.feedPaid != null ? Number(m.data.feedPaid) : 0;
        if (paid > 0) {
          arenaFeedNote = "Retreat cost: " + paid + " Feed.";
        }
        renderBattle(m.data.state, rrole, false);
      } else {
        lastPvpError = m.error || "Could not retreat";
        if (activeBattleDraw && activeBattleDraw.state) {
          renderBattle(activeBattleDraw.state, rrole, false);
        }
      }
    })();
  }

  function renderBattle(state, role, isCpu) {
    if (!arenaBattleMain) return;
    setArenaView("battle");
    stopMenuRaf();
    activeBattleDraw = {
      state: state,
      role: role,
      isCpu: isCpu,
      flashYouUntil: 0,
      flashOppUntil: 0,
    };
    scheduleBattleFlash(state, role);
    startBattleRaf();

    updateBattleHud(state, role);
    updateBattleDialogue(state);

    arenaBattleMain.innerHTML = "";
    if (arenaFeedNote && !isCpu) {
      const note = el("p", "mini-game__muted", arenaFeedNote);
      note.style.opacity = "0.95";
      arenaBattleMain.appendChild(note);
      arenaFeedNote = "";
    }
    if (lastPvpError && !isCpu) {
      const er = el("p", "mini-game__muted", "");
      er.style.color = "#f87171";
      er.textContent = lastPvpError;
      arenaBattleMain.appendChild(er);
      lastPvpError = "";
    }

    const moves = role === "challenger" ? state.movesC : state.movesD;

    if (state.winner) {
      if (arenaBattleBack) arenaBattleBack.textContent = "Exit";
      const retreated = state.log.some(function (line) {
        return String(line).toLowerCase().indexOf("retreated") >= 0;
      });
      var sub =
        state.winner === role
          ? "Victory! Exit returns to the menu or hub."
          : retreated
            ? "You left the battle. Exit to continue."
            : "Exit to train moves in the Sprout sidebar, then try again.";
      arenaBattleMain.appendChild(el("p", "arena-gb-victory-hint", sub));
      return;
    }

    if (arenaBattleBack) arenaBattleBack.textContent = "Exit";

    const yourTurn = state.turn === role;
    const grid = el("div", "mini-game__moves");
    moves.forEach(function (key) {
      const btn = el("button", "mini-game__move", "");
      btn.textContent = MOVE_LABELS[key] || key;
      btn.disabled = !yourTurn;
      btn.onclick = function () {
        if (isCpu) {
          const r1 = applyLocalMove(cpuState, role, key, Math.random);
          if (!r1.ok) return;
          cpuState = r1.state;
          if (cpuState.winner) {
            renderBattle(cpuState, role, true);
            return;
          }
          if (cpuState.turn !== role) {
            setTimeout(function () {
              const keys = cpuState.movesD;
              const ck = keys[Math.floor(Math.random() * keys.length)];
              const r2 = applyLocalMove(cpuState, "defender", ck, Math.random);
              if (r2.ok) cpuState = r2.state;
              renderBattle(cpuState, role, true);
            }, 600);
          }
          renderBattle(cpuState, role, true);
        } else {
          btn.disabled = true;
          void (async function () {
            const m = await arenaEnqueue("move", {
              battleId: onlineBattle.id,
              moveKey: key,
            });
            if (m.ok && m.data && m.data.state) {
              if (m.data.feedTransferred > 0) {
                arenaFeedNote =
                  "Feed transferred: " +
                  String(m.data.feedTransferred) +
                  " (winner takes from loser).";
              }
              renderBattle(m.data.state, onlineBattle.role, false);
            } else {
              lastPvpError = m.error || "Move failed";
              if (m.data && m.data.state) renderBattle(m.data.state, onlineBattle.role, false);
            }
          })();
        }
      };
      grid.appendChild(btn);
    });
    arenaBattleMain.appendChild(grid);

    const retreatRow = el("div", "arena-proto-retreat-row");
    const retreatBtn = el(
      "button",
      "mini-game__btn mini-game__btn--ghost arena-proto-retreat-btn",
      "Retreat"
    );
    retreatBtn.type = "button";
    retreatBtn.title =
      "End the battle. You pay half your current Feed (rounded down).";
    retreatBtn.onclick = function () {
      if (
        !window.confirm(
          "Retreat ends this battle. You pay half your current Feed (rounded down). Continue?"
        )
      ) {
        return;
      }
      retreatBtn.disabled = true;
      runBattleRetreat(isCpu, role);
      setTimeout(function () {
        retreatBtn.disabled = false;
      }, 800);
    };
    retreatRow.appendChild(retreatBtn);
    arenaBattleMain.appendChild(retreatRow);

    if (!yourTurn && !isCpu) {
      arenaBattleMain.appendChild(
        el("p", "mini-game__muted", "Waiting for opponent…")
      );
    }
  }

  function exitBattleView() {
    stopBattleRaf();
    activeBattleDraw = null;
    if (arenaGbDialogueText) {
      arenaGbDialogueText.textContent = "";
      arenaGbDialogueText.classList.remove("arena-gb-dialogue--flash");
    }
    onlineBattle = null;
    cpuState = null;
    if (arenaBattleBack) arenaBattleBack.textContent = "Exit";
    if (gameMode === "cpu") {
      gameMode = "menu";
      stopHubPoll();
      setArenaView("menu");
      updateMenuCard();
      syncMenuSprite();
    } else {
      gameMode = "hub";
      setArenaView("pvp");
      startHubPoll();
      void loadFullHub();
    }
  }

  function startCpuBattle() {
    if (!currentSprout || !sproutBattleReady(currentSprout)) return;
    stopHubPoll();
    gameMode = "cpu";
    setArenaView("battle");
    if (arenaBattleMain) {
      arenaBattleMain.innerHTML =
        "<p class='mini-game__muted' style='text-align:center;padding:1.5rem'>Preparing battle…</p>";
    }
    if (arenaBattleBack) arenaBattleBack.textContent = "Exit";
    const commits = (profile && Number(profile.totalCreditedCommits)) || 0;
    const atk = attackStatFromSprout(currentSprout);
    const maxHp = maxHpFromSprout(currentSprout);
    const cpuSprout = {
      name: "CPU_BOT",
      species: "fox",
      level: Math.max(1, (Number(currentSprout.level) || 1) - 1 + Math.round(Math.random())),
    };
    const cpuAtk = Math.max(6, atk - 2 + Math.floor(Math.random() * 5));
    const cpuMax = maxHp - 10 + Math.floor(Math.random() * 24);
    onlineBattle = null;
    var movesC = pickMoves(Math.random);
    var powC = {};
    void (async function () {
      if (currentSprout.id) {
        const lr = await arenaEnqueue("arenaLoadout", { sproutId: currentSprout.id });
        if (
          lr.ok &&
          lr.data &&
          lr.data.loadout &&
          lr.data.loadout.moves &&
          lr.data.loadout.moves.length >= 4
        ) {
          movesC = lr.data.loadout.moves.slice(0, 4);
          powC =
            lr.data.loadout.power && typeof lr.data.loadout.power === "object"
              ? Object.assign({}, lr.data.loadout.power)
              : {};
        }
      }
      cpuState = {
        v: 1,
        turn: "challenger",
        hpC: maxHp,
        hpD: cpuMax,
        maxHpC: maxHp,
        maxHpD: cpuMax,
        movesC: movesC,
        movesD: pickMoves(Math.random),
        powC: powC,
        powD: {},
        sproutC: {
          name: currentSprout.name || "Sprout",
          species: currentSprout.species || "?",
          level: Number(currentSprout.level) || 1,
        },
        sproutD: cpuSprout,
        attackC: atk,
        attackD: cpuAtk,
        commitsC: commits,
        commitsD: 0,
        log: ["CPU practice — your turn first."],
        winner: null,
        fc: {},
        fd: {},
      };
      renderBattle(cpuState, "challenger", true);
    })();
  }

  async function loadFullHub() {
    if (!arenaPvpContent || gameMode !== "hub") return;
    arenaPvpContent.innerHTML = "";
    arenaPvpContent.appendChild(el("p", "mini-game__muted", "Loading…"));
    try {
      const actM = await arenaEnqueue("active", {});
      if (actM.ok && actM.data && actM.data.battle) {
        stopHubPoll();
        const b = actM.data.battle;
        onlineBattle = { id: b.id, role: b.role };
        gameMode = "pvp";
        renderBattle(b.state, b.role, false);
        return;
      }

      const shareM = await arenaEnqueue("share", {});
      const qM = await arenaEnqueue("queueStatus", {});
      const frM = await arenaEnqueue("friends", {});
      const friM = await arenaEnqueue("friendsIncoming", {});
      const invM = await arenaEnqueue("invites", {});

      arenaPvpContent.innerHTML = "";
      if (lastPvpError) {
        const er = el("p", "mini-game__muted", "");
        er.style.color = "#f87171";
        er.textContent = lastPvpError;
        arenaPvpContent.appendChild(er);
        lastPvpError = "";
      }

      const hero = el("div", "arena-hub-hero");
      hero.appendChild(el("div", "arena-hub-hero__badge", "Trainer hub"));
      hero.appendChild(el("h2", "arena-hub-hero__title", "Friends & matchmaking"));
      hero.appendChild(
        el(
          "p",
          "arena-hub-hero__sub",
          "Share your code, queue for a rival, or challenge a friend — Sprout Arena PvP."
        )
      );
      arenaPvpContent.appendChild(hero);

      const secShare = el("div", "arena-section");
      secShare.appendChild(el("h2", "arena-section__title", "Trainer ID"));
      if (shareM.ok && shareM.data) {
        const code = String(shareM.data.shareCode || "—");
        const em = shareM.data.email ? String(shareM.data.email) : "";
        secShare.appendChild(
          el("p", "mini-game__muted", "Code: <strong>" + code + "</strong> · Account: " + em)
        );
        const reg = el("button", "mini-game__btn mini-game__btn--ghost", "Regenerate code");
        reg.onclick = async function () {
          reg.disabled = true;
          const r = await arenaEnqueue("shareRegenerate", {});
          if (!r.ok) lastPvpError = r.error || "Could not regenerate";
          await loadFullHub();
        };
        secShare.appendChild(reg);
      } else {
        secShare.appendChild(
          el("p", "mini-game__muted", shareM.error || "Could not load share info")
        );
      }
      arenaPvpContent.appendChild(secShare);

      const secQ = el("div", "arena-section");
      secQ.appendChild(el("h2", "arena-section__title", "Battle queue"));
      if (!sproutBattleReady(currentSprout)) {
        secQ.appendChild(el("p", "mini-game__muted", "Hatch an active sprout to join the queue."));
      } else if (qM.ok && qM.data && qM.data.inQueue) {
        secQ.appendChild(
          el(
            "p",
            "mini-game__muted",
            "Waiting for an opponent… ahead in queue: " + String(qM.data.ahead ?? 0)
          )
        );
        const leave = el("button", "mini-game__btn mini-game__btn--ghost", "Leave queue");
        leave.onclick = async function () {
          leave.disabled = true;
          await arenaEnqueue("queueLeave", {});
          await loadFullHub();
        };
        secQ.appendChild(leave);
      } else {
        const join = el("button", "mini-game__btn", "Join matchmaking");
        join.onclick = async function () {
          if (!currentSprout || !currentSprout.id) return;
          join.disabled = true;
          const r = await arenaEnqueue("queueJoin", { sproutId: currentSprout.id });
          if (r.ok && r.data && r.data.matched === true && r.data.state) {
            stopHubPoll();
            onlineBattle = { id: r.data.battleId, role: r.data.role || "defender" };
            gameMode = "pvp";
            renderBattle(r.data.state, onlineBattle.role, false);
            return;
          }
          if (!r.ok) lastPvpError = r.error || "Could not join queue";
          await loadFullHub();
        };
        secQ.appendChild(join);
      }
      arenaPvpContent.appendChild(secQ);

      const secFr = el("div", "arena-section");
      secFr.appendChild(el("h2", "arena-section__title", "Friends"));
      if (friM.ok && friM.data && friM.data.requests && friM.data.requests.length) {
        friM.data.requests.forEach(function (req) {
          const row = el("div", "mini-game__invite arena-hub-invite");
          const nm = req.requester && req.requester.name ? req.requester.name : "Player";
          row.appendChild(el("div", "", "<strong>Request:</strong> " + nm));
          const act = el("div", "mini-game__invite-actions");
          const acc = el("button", "mini-game__btn", "Accept");
          acc.onclick = async function () {
            await arenaEnqueue("friendAccept", { friendshipId: req.id });
            await loadFullHub();
          };
          const dec = el("button", "mini-game__btn mini-game__btn--ghost", "Decline");
          dec.onclick = async function () {
            await arenaEnqueue("friendDecline", { friendshipId: req.id });
            await loadFullHub();
          };
          act.appendChild(acc);
          act.appendChild(dec);
          row.appendChild(act);
          secFr.appendChild(row);
        });
      }
      secFr.appendChild(el("p", "mini-game__muted", "Add by email and/or share code:"));
      const emInp = el("input", "mini-game__input");
      emInp.type = "email";
      emInp.placeholder = "friend@email.com";
      const codeInp = el("input", "mini-game__input");
      codeInp.placeholder = "Share code (optional)";
      const addBtn = el("button", "mini-game__btn", "Send friend request");
      addBtn.onclick = async function () {
        const email = emInp.value.trim();
        const shareCode = codeInp.value.trim();
        if (!email && !shareCode) return;
        addBtn.disabled = true;
        const r = await arenaEnqueue("friendRequest", { email: email, shareCode: shareCode });
        if (!r.ok) lastPvpError = r.error || "Request failed";
        await loadFullHub();
      };
      secFr.appendChild(emInp);
      secFr.appendChild(codeInp);
      secFr.appendChild(addBtn);
      if (frM.ok && frM.data && frM.data.friends && frM.data.friends.length) {
        frM.data.friends.forEach(function (f) {
          const row = el("div", "mini-game__invite arena-hub-invite");
          const label = (f.name || "Friend") + (f.email ? " · " + f.email : "");
          row.appendChild(el("div", "", label));
          const act = el("div", "mini-game__invite-actions");
          const ch = el("button", "mini-game__btn", "Challenge");
          ch.onclick = async function () {
            if (!currentSprout || !currentSprout.id) return;
            ch.disabled = true;
            const r = await arenaEnqueue("invite", {
              email: "",
              sproutId: currentSprout.id,
              targetUserId: f.userId,
            });
            if (!r.ok) lastPvpError = r.error || "Could not challenge";
            await loadFullHub();
          };
          const rm = el("button", "mini-game__btn mini-game__btn--ghost", "Remove");
          rm.onclick = async function () {
            await arenaEnqueue("friendRemove", { userId: f.userId });
            await loadFullHub();
          };
          act.appendChild(ch);
          act.appendChild(rm);
          row.appendChild(act);
          secFr.appendChild(row);
        });
      } else {
        secFr.appendChild(el("p", "mini-game__muted", "No friends yet."));
      }
      arenaPvpContent.appendChild(secFr);

      const secPvp = el("div", "arena-section");
      secPvp.appendChild(el("h2", "arena-section__title", "Challenges (email)"));
      if (profile && profile.email) {
        secPvp.appendChild(
          el(
            "p",
            "mini-game__muted",
            "Your account email: <strong>" + String(profile.email) + "</strong>"
          )
        );
      }
      const inp = el("input", "mini-game__input");
      inp.type = "email";
      inp.placeholder = "opponent@email.com";
      const send = el("button", "mini-game__btn", "Send challenge");
      send.onclick = async function () {
        const email = inp.value.trim();
        if (!email || !currentSprout || !currentSprout.id) return;
        send.disabled = true;
        const r = await arenaEnqueue("invite", { email: email, sproutId: currentSprout.id });
        if (!r.ok) lastPvpError = r.error || "Could not send";
        await loadFullHub();
      };
      secPvp.appendChild(inp);
      secPvp.appendChild(send);

      secPvp.appendChild(el("h4", "mini-game__muted", "<strong>Incoming</strong>"));
      const inc = invM.ok && invM.data ? invM.data.incoming || [] : [];
      if (inc.length === 0) {
        secPvp.appendChild(el("p", "mini-game__muted", "No pending challenges."));
      } else {
        inc.forEach(function (inv) {
          const box = el("div", "mini-game__invite arena-hub-invite");
          box.appendChild(
            el(
              "div",
              "",
              "<strong>" +
                (inv.challengerName || "Player") +
                "</strong><br/><span style='opacity:.85'>" +
                (inv.sproutName || "Sprout") +
                " · Lv" +
                (inv.sproutLevel || "?") +
                "</span>"
            )
          );
          const actions = el("div", "mini-game__invite-actions");
          const acc = el("button", "mini-game__btn", "Accept");
          acc.onclick = async function () {
            if (!currentSprout || !currentSprout.id) return;
            acc.disabled = true;
            const r = await arenaEnqueue("accept", {
              inviteId: inv.id,
              sproutId: currentSprout.id,
            });
            if (r.ok && r.data) {
              stopHubPoll();
              onlineBattle = { id: r.data.battleId, role: r.data.role || "defender" };
              gameMode = "pvp";
              renderBattle(r.data.state, onlineBattle.role, false);
            } else {
              lastPvpError = r.error || "Accept failed";
              await loadFullHub();
            }
          };
          const dec = el("button", "mini-game__btn mini-game__btn--ghost", "Decline");
          dec.onclick = async function () {
            await arenaEnqueue("decline", { inviteId: inv.id });
            await loadFullHub();
          };
          actions.appendChild(acc);
          actions.appendChild(dec);
          box.appendChild(actions);
          secPvp.appendChild(box);
        });
      }
      secPvp.appendChild(el("h4", "mini-game__muted", "<strong>Outgoing</strong>"));
      const out = invM.ok && invM.data ? invM.data.outgoing || [] : [];
      if (out.length === 0) {
        secPvp.appendChild(el("p", "mini-game__muted", "None yet."));
      } else {
        out.forEach(function (o) {
          secPvp.appendChild(
            el(
              "p",
              "mini-game__muted",
              "Waiting: <strong>" + (o.targetEmail || "?") + "</strong> · " + (o.yourSproutName || "")
            )
          );
        });
      }
      arenaPvpContent.appendChild(secPvp);
    } catch (e) {
      arenaPvpContent.innerHTML = "";
      arenaPvpContent.appendChild(
        el("p", "mini-game__muted", e instanceof Error ? e.message : "Something went wrong")
      );
    }
  }

  function onArenaState(m) {
    const signedIn = m.signedIn === true;
    currentSprout = m.sprout || null;
    profile = m.profile || null;
    if (!signedIn) {
      if (arenaSignedOut) arenaSignedOut.hidden = false;
      if (arenaApp) arenaApp.hidden = true;
      stopHubPoll();
      stopMenuRaf();
      stopBattleRaf();
      return;
    }
    if (arenaSignedOut) arenaSignedOut.hidden = true;
    if (arenaApp) arenaApp.hidden = false;
    gameMode = "menu";
    stopHubPoll();
    stopBattleRaf();
    activeBattleDraw = null;
    onlineBattle = null;
    cpuState = null;
    setArenaView("menu");
    updateMenuCard();
    syncMenuSprite();
  }

  window.addEventListener("message", function (e) {
    const m = e.data;
    if (m.type === "arenaApiResult") {
      if (arenaRunning && m.op === arenaRunning.op) {
        const job = arenaRunning;
        arenaRunning = null;
        job.resolve(m);
        arenaPump();
      }
      return;
    }
    if (m.type === "arenaState") {
      onArenaState(m);
    }
  });

  if (arenaBtnSignIn) {
    arenaBtnSignIn.addEventListener("click", function () {
      vscode.postMessage({ type: "companionSignIn" });
    });
  }
  if (arenaBtnSignOut) {
    arenaBtnSignOut.addEventListener("click", function () {
      vscode.postMessage({ type: "companionSignOut" });
    });
  }
  if (arenaBtnRefresh) {
    arenaBtnRefresh.addEventListener("click", function () {
      vscode.postMessage({ type: "arenaReloadState" });
      if (gameMode === "hub") void loadFullHub();
    });
  }

  if (arenaNavPvp) {
    arenaNavPvp.addEventListener("click", function () {
      if (!currentSprout) {
        if (arenaMenuHint)
          arenaMenuHint.textContent = "Pick or hatch a sprout in the Sprouts sidebar, then refresh.";
        return;
      }
      gameMode = "hub";
      setArenaView("pvp");
      startHubPoll();
      void loadFullHub();
    });
  }
  if (arenaNavCpu) {
    arenaNavCpu.addEventListener("click", function () {
      if (!sproutBattleReady(currentSprout)) {
        if (arenaMenuHint)
          arenaMenuHint.textContent =
            "Hatch and wake your sprout to run CPU practice (Refresh if you just hatched).";
        return;
      }
      startCpuBattle();
    });
  }
  if (arenaNavRoster) {
    arenaNavRoster.addEventListener("click", function () {
      if (arenaMenuHint) arenaMenuHint.textContent = "My Roster — coming soon (use Sprouts sidebar).";
    });
  }
  if (arenaPvpBack) {
    arenaPvpBack.addEventListener("click", function () {
      stopHubPoll();
      gameMode = "menu";
      setArenaView("menu");
      updateMenuCard();
      syncMenuSprite();
    });
  }
  if (arenaBattleBack) {
    arenaBattleBack.addEventListener("click", function () {
      var d = activeBattleDraw;
      if (gameMode === "cpu" && !cpuState) {
        exitBattleView();
        return;
      }
      if (d && d.state && d.state.winner) {
        exitBattleView();
        return;
      }
      if (
        !window.confirm(
          "Leave battle? If it is still in progress, this counts as a retreat (half your Feed, rounded down). Continue?"
        )
      ) {
        return;
      }
      var role = d ? d.role : "challenger";
      var isCpu = d ? d.isCpu : gameMode === "cpu";
      runBattleRetreat(isCpu, role);
    });
  }

  vscode.postMessage({ type: "arenaReady" });
})();
