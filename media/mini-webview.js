(function () {
  const vscode = acquireVsCodeApi();
  const miniBtnChat = document.getElementById("miniBtnChat");
  const miniBtnSignOut = document.getElementById("miniBtnSignOut");
  const miniBtnArena = document.getElementById("miniBtnArena");
  const miniArenaBadge = document.getElementById("miniArenaBadge");
  const miniArenaHint = document.getElementById("miniArenaHint");
  const miniHome = document.getElementById("miniHome");
  const miniGame = document.getElementById("miniGame");
  const miniGameBack = document.getElementById("miniGameBack");
  const miniGameTitle = document.getElementById("miniGameTitle");
  const miniGameScreen = document.getElementById("miniGameScreen");
  let currentSprout = null;
  let miniSignedIn = false;
  let miniProfile = null;
  let pvpIncomingCount = 0;
  let miniRaf = 0;
  let miniFrame = 0;
  let miniAcc = 0;
  let miniPrevT = 0;
  var MINI_FPS = 5;

  var gameMode = "off";
  var pvpPollTimer = null;
  var cpuState = null;
  var onlineBattle = null;
  var lastPvpError = "";

  var MOVE_LABELS = {
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

  var PVP_POOL = Object.keys(MOVE_LABELS);

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

  function setBar(id, pct) {
    const el = document.getElementById(id);
    if (el) el.style.width = Math.max(0, Math.min(100, pct)) + "%";
  }

  function disposeMiniViewport() {
    /* 3D viewport bundle removed; sprites only. */
  }

  function stopMiniLoop() {
    if (miniRaf) {
      cancelAnimationFrame(miniRaf);
      miniRaf = 0;
    }
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

  function syncMiniViewport() {
    disposeMiniViewport();
    const canvas = document.getElementById("miniSpriteCanvas");
    const fallback = document.getElementById("miniEmojiFallback");

    if (!window.SproutsPixel) {
      stopMiniLoop();
      if (canvas) canvas.setAttribute("hidden", "");
      if (fallback) fallback.removeAttribute("hidden");
      return;
    }

    if (fallback) fallback.setAttribute("hidden", "");
    if (canvas) canvas.removeAttribute("hidden");
    startMiniLoop();
  }

  function startMiniLoop() {
    stopMiniLoop();
    if (!window.SproutsPixel) return;
    const canvas = document.getElementById("miniSpriteCanvas");
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    miniFrame = 0;
    miniAcc = 0;
    miniPrevT = 0;
    var step = 1000 / MINI_FPS;

    function tick(t) {
      miniRaf = requestAnimationFrame(tick);
      if (!window.SproutsPixel) return;
      const sp = currentSprout;
      const params = sp ? buildMiniParams(sp) : previewEggParams();
      if (miniPrevT === 0) miniPrevT = t;
      var dt = t - miniPrevT;
      miniPrevT = t;
      miniAcc += dt;
      var P = window.SproutsPixel;
      var frames = P.buildPetFrames(params);
      while (miniAcc >= step) {
        miniAcc -= step;
        miniFrame = (miniFrame + 1) % frames.length;
      }
      P.drawPetFrame(ctx, params, miniFrame);
    }
    miniRaf = requestAnimationFrame(tick);
  }

  function setMiniUnauthedClickable(on) {
    const title = document.getElementById("miniTitle");
    const mood = document.getElementById("miniMood");
    const signIn = () => vscode.postMessage({ type: "companionSignIn" });
    const openSidebar = () => vscode.postMessage({ type: "openCompanionSidebar" });
    if (on) {
      title.style.cursor = "pointer";
      title.style.textDecoration = "underline";
      title.title = "Sign in to Sprouts (opens browser)";
      mood.style.cursor = "pointer";
      mood.style.textDecoration = "underline";
      mood.title = "Open full Sprouts sidebar";
      title.onclick = signIn;
      mood.onclick = openSidebar;
    } else {
      title.style.cursor = "";
      title.style.textDecoration = "";
      title.title = "";
      mood.style.cursor = "";
      mood.style.textDecoration = "";
      mood.title = "";
      title.onclick = null;
      mood.onclick = null;
    }
  }

  function updateArenaButton() {
    if (!miniBtnArena) return;
    var canPlay =
      currentSprout &&
      currentSprout.isDead !== true &&
      currentSprout.isDormant !== true &&
      currentSprout.growthStage !== "Egg";
    miniBtnArena.disabled = !miniSignedIn;
    miniBtnArena.title = miniSignedIn
      ? "Open the full Sprout Arena panel (PvP, friends, CPU practice)"
      : "Sign in to open Arena";
    if (miniArenaBadge) {
      if (pvpIncomingCount > 0 && canPlay) {
        miniArenaBadge.hidden = false;
        miniArenaBadge.textContent = pvpIncomingCount > 9 ? "9+" : String(pvpIncomingCount);
        miniArenaBadge.style.fontSize = "8px";
        miniArenaBadge.style.minWidth = "14px";
        miniArenaBadge.style.height = "14px";
        miniArenaBadge.style.lineHeight = "14px";
      } else {
        miniArenaBadge.hidden = true;
      }
    }
  }

  function stopPvpPoll() {
    if (pvpPollTimer) {
      clearInterval(pvpPollTimer);
      pvpPollTimer = null;
    }
  }

  function startArenaPolling() {
    stopPvpPoll();
    pvpPollTimer = setInterval(function () {
      if (gameMode !== "menu" && gameMode !== "lobby") return;
      vscode.postMessage({ type: "miniPvp", op: "active" });
      if (gameMode === "lobby") vscode.postMessage({ type: "miniPvp", op: "invites" });
    }, 12000);
  }

  function showGameUI() {
    gameMode = "menu";
    if (miniHome) miniHome.hidden = true;
    if (miniGame) miniGame.hidden = false;
    if (miniGameTitle) miniGameTitle.textContent = "Sprout Arena";
    renderGameMenu();
    startArenaPolling();
  }

  function hideGameUI() {
    gameMode = "off";
    stopPvpPoll();
    onlineBattle = null;
    cpuState = null;
    if (miniHome) miniHome.hidden = false;
    if (miniGame) miniGame.hidden = true;
    if (miniArenaHint) miniArenaHint.hidden = true;
  }

  function el(tag, cls, html) {
    var n = document.createElement(tag);
    if (cls) n.className = cls;
    if (html != null) n.innerHTML = html;
    return n;
  }

  function renderGameMenu() {
    if (!miniGameScreen) return;
    miniGameScreen.innerHTML = "";
    var p = el("p", "mini-game__muted", "Use your sprout’s strength, intelligence, level, and commit bonuses in battle.");
    miniGameScreen.appendChild(p);
    var b1 = el("button", "mini-game__btn", "PvP — challenge by email");
    b1.onclick = function () {
      gameMode = "lobby";
      vscode.postMessage({ type: "miniPvp", op: "invites" });
      renderLobbyLoading();
    };
    var b2 = el("button", "mini-game__btn mini-game__btn--ghost", "CPU practice (local)");
    b2.onclick = function () {
      startCpuBattle();
    };
    miniGameScreen.appendChild(b1);
    miniGameScreen.appendChild(b2);
    vscode.postMessage({ type: "miniPvp", op: "active" });
    vscode.postMessage({ type: "miniPvp", op: "invites" });
  }

  function renderLobbyLoading() {
    if (!miniGameScreen) return;
    miniGameScreen.innerHTML = "";
    miniGameScreen.appendChild(el("p", "mini-game__muted", "Loading…"));
  }

  function renderLobby(data) {
    if (!miniGameScreen || gameMode !== "lobby") return;
    miniGameScreen.innerHTML = "";
    if (lastPvpError) {
      var err = el("p", "mini-game__muted", "");
      err.style.color = "var(--vscode-errorForeground, #f87171)";
      err.textContent = lastPvpError;
      miniGameScreen.appendChild(err);
      lastPvpError = "";
    }
    if (miniProfile && miniProfile.email) {
      miniGameScreen.appendChild(
        el(
          "p",
          "mini-game__muted",
          "Challenges are matched to <strong>account email</strong>. Yours: " +
            String(miniProfile.email)
        )
      );
    }
    var row = el("div", "mini-game__row");
    var inp = el("input", "mini-game__input");
    inp.type = "email";
    inp.placeholder = "opponent@email.com";
    inp.setAttribute("aria-label", "Opponent email");
    var send = el("button", "mini-game__btn", "Send challenge");
    send.onclick = function () {
      email = inp.value.trim();
      if (!email || !currentSprout || !currentSprout.id) return;
      send.disabled = true;
      vscode.postMessage({
        type: "miniPvp",
        op: "invite",
        email: email,
        sproutId: currentSprout.id,
      });
    };
    miniGameScreen.appendChild(el("p", "mini-game__muted", "We match accounts by the email stored on their Sprouts profile."));
    miniGameScreen.appendChild(inp);
    miniGameScreen.appendChild(send);

    miniGameScreen.appendChild(el("h4", "mini-game__muted", "<strong>Incoming</strong>"));
    var inc = (data && data.incoming) || [];
    if (inc.length === 0) {
      miniGameScreen.appendChild(el("p", "mini-game__muted", "No pending challenges."));
    } else {
      inc.forEach(function (inv) {
        var box = el("div", "mini-game__invite");
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
        var actions = el("div", "mini-game__invite-actions");
        var acc = el("button", "mini-game__btn", "Accept");
        acc.onclick = function () {
          if (!currentSprout || !currentSprout.id) return;
          acc.disabled = true;
          vscode.postMessage({
            type: "miniPvp",
            op: "accept",
            inviteId: inv.id,
            sproutId: currentSprout.id,
          });
        };
        var dec = el("button", "mini-game__btn mini-game__btn--ghost", "Decline");
        dec.onclick = function () {
          vscode.postMessage({ type: "miniPvp", op: "decline", inviteId: inv.id });
        };
        actions.appendChild(acc);
        actions.appendChild(dec);
        box.appendChild(actions);
        miniGameScreen.appendChild(box);
      });
    }

    miniGameScreen.appendChild(el("h4", "mini-game__muted", "<strong>Outgoing</strong>"));
    var out = (data && data.outgoing) || [];
    if (out.length === 0) {
      miniGameScreen.appendChild(el("p", "mini-game__muted", "None yet."));
    } else {
      out.forEach(function (o) {
        miniGameScreen.appendChild(
          el(
            "p",
            "mini-game__muted",
            "Waiting: <strong>" + (o.targetEmail || "?") + "</strong> · " + (o.yourSproutName || "")
          )
        );
      });
    }

    var ref = el("button", "mini-game__btn mini-game__btn--ghost", "Refresh");
    ref.onclick = function () {
      vscode.postMessage({ type: "miniPvp", op: "invites" });
      vscode.postMessage({ type: "miniPvp", op: "active" });
    };
    miniGameScreen.appendChild(ref);
  }

  function pickMoves(rng) {
    var pool = PVP_POOL.slice();
    var out = [];
    for (var i = 0; i < 4 && pool.length; i++) {
      var idx = Math.floor(rng() * pool.length);
      out.push(pool.splice(idx, 1)[0]);
    }
    while (out.length < 4) out.push("fireball");
    return out;
  }

  function attackStatFromSprout(sp) {
    var str = Number(sp.strength) || 10;
    var intel = Number(sp.intelligence) || 10;
    var lvl = Number(sp.level) || 1;
    return Math.max(5, Math.floor((str + intel + lvl * 2) / 2));
  }

  function maxHpFromSprout(sp) {
    var end = Number(sp.endurance) || 10;
    var lvl = Number(sp.level) || 1;
    return Math.max(60, 80 + end * 2 + lvl * 8);
  }

  function startCpuBattle() {
    if (!currentSprout) return;
    var commits = (miniProfile && Number(miniProfile.totalCreditedCommits)) || 0;
    var atk = attackStatFromSprout(currentSprout);
    var maxHp = maxHpFromSprout(currentSprout);
    var cpuSprout = {
      name: "CPU_BOT",
      species: "fox",
      level: Math.max(1, (Number(currentSprout.level) || 1) - 1 + Math.round(Math.random())),
    };
    var cpuAtk = Math.max(6, atk - 2 + Math.floor(Math.random() * 5));
    var cpuMax = maxHp - 10 + Math.floor(Math.random() * 24);
    onlineBattle = null;
    cpuState = {
      v: 1,
      turn: "challenger",
      hpC: maxHp,
      hpD: cpuMax,
      maxHpC: maxHp,
      maxHpD: cpuMax,
      movesC: pickMoves(Math.random),
      movesD: pickMoves(Math.random),
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
    gameMode = "cpu";
    renderBattle(cpuState, "challenger", true);
  }

  function dmgMult(commits, level) {
    return (1 + commits / 300) * (1 + level / 25);
  }

  function applyLocalMove(state, actor, moveKey, rng) {
    var next = JSON.parse(JSON.stringify(state));
    if (next.winner) return { ok: false, error: "done" };
    if (next.turn !== actor) return { ok: false, error: "turn" };
    var self = actor === "challenger" ? "C" : "D";
    var opp = self === "C" ? "D" : "C";
    var fSelf = self === "C" ? next.fc : next.fd;
    var fOpp = opp === "C" ? next.fc : next.fd;
    var nameSelf = self === "C" ? next.sproutC.name : next.sproutD.name;
    var nameOpp = opp === "C" ? next.sproutC.name : next.sproutD.name;
    if (fSelf.frozen) {
      fSelf.frozen = false;
      next.log.push(nameSelf + " is frozen and skips a turn!");
      next.turn = actor === "challenger" ? "defender" : "challenger";
      return { ok: true, state: next };
    }
    var moves = self === "C" ? next.movesC : next.movesD;
    if (moves.indexOf(moveKey) < 0) return { ok: false, error: "move" };
    var M = {
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
    var move = M[moveKey];
    if (!move) return { ok: false, error: "?" };
    if (rng() * 100 > move.a) {
      next.log.push(nameSelf + " used " + move.n + " — missed!");
      next.turn = actor === "challenger" ? "defender" : "challenger";
      return { ok: true, state: next };
    }
    var atk = self === "C" ? next.attackC : next.attackD;
    var lvl = self === "C" ? next.sproutC.level : next.sproutD.level;
    var commits = self === "C" ? next.commitsC : next.commitsD;
    var mult = dmgMult(commits, lvl);
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
      var base = move.p;
      var dmg = Math.floor(base * (atk / 10) * mult);
      if (move.doxx) dmg += 15;
      var targetIsC = self === "D";
      var fTarget = targetIsC ? next.fc : next.fd;
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
          var line = nameSelf + " used " + move.n + "! " + dmg + " dmg.";
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

  function renderBattle(state, role, isCpu) {
    if (!miniGameScreen) return;
    miniGameScreen.innerHTML = "";
    if (lastPvpError && !isCpu) {
      var er = el("p", "mini-game__muted", "");
      er.style.color = "var(--vscode-errorForeground, #f87171)";
      er.textContent = lastPvpError;
      miniGameScreen.appendChild(er);
      lastPvpError = "";
    }
    var you = role === "challenger" ? state.sproutC : state.sproutD;
    var them = role === "challenger" ? state.sproutD : state.sproutC;
    var hpYou = role === "challenger" ? state.hpC : state.hpD;
    var maxYou = role === "challenger" ? state.maxHpC : state.maxHpD;
    var hpThem = role === "challenger" ? state.hpD : state.hpC;
    var maxThem = role === "challenger" ? state.maxHpD : state.maxHpC;
    var moves = role === "challenger" ? state.movesC : state.movesD;

    miniGameScreen.appendChild(
      el("div", "", "<strong>You:</strong> " + you.name + " · Lv" + you.level)
    );
    var hy = el("div", "mini-game__hp");
    var hyFill = el("div", "mini-game__hp-fill");
    hyFill.style.width = (100 * hpYou) / maxYou + "%";
    hy.appendChild(hyFill);
    miniGameScreen.appendChild(hy);

    miniGameScreen.appendChild(
      el("div", "", "<strong>Opponent:</strong> " + them.name + " · Lv" + them.level)
    );
    var ht = el("div", "mini-game__hp");
    var hf = el("div", "mini-game__hp-fill");
    hf.style.width = (100 * hpThem) / maxThem + "%";
    ht.appendChild(hf);
    miniGameScreen.appendChild(ht);

    var log = el("div", "mini-game__log");
    log.textContent = state.log.slice(-8).join("\n");
    miniGameScreen.appendChild(log);

    if (state.winner) {
      var w = el("p", "mini-game__muted", "");
      w.textContent =
        state.winner === role
          ? "You won this round."
          : state.winner
            ? "You were disrupted. Train stats in the sidebar and try again."
            : "";
      miniGameScreen.appendChild(w);
      var back = el("button", "mini-game__btn", "Back to menu");
      back.onclick = function () {
        if (isCpu) {
          hideGameUI();
        } else {
          onlineBattle = null;
          gameMode = "menu";
          renderGameMenu();
          startArenaPolling();
        }
      };
      miniGameScreen.appendChild(back);
      return;
    }

    var yourTurn = state.turn === role;
    var grid = el("div", "mini-game__moves");
    moves.forEach(function (key) {
      var btn = el("button", "mini-game__move", "");
      btn.textContent = MOVE_LABELS[key] || key;
      btn.disabled = !yourTurn;
      btn.onclick = function () {
        if (isCpu) {
          var r1 = applyLocalMove(cpuState, role, key, Math.random);
          if (!r1.ok) return;
          cpuState = r1.state;
          if (cpuState.winner) {
            renderBattle(cpuState, role, true);
            return;
          }
          if (cpuState.turn !== role) {
            setTimeout(function () {
              var keys = cpuState.movesD;
              var ck = keys[Math.floor(Math.random() * keys.length)];
              var r2 = applyLocalMove(cpuState, "defender", ck, Math.random);
              if (r2.ok) cpuState = r2.state;
              renderBattle(cpuState, role, true);
            }, 600);
          }
          renderBattle(cpuState, role, true);
        } else {
          btn.disabled = true;
          vscode.postMessage({
            type: "miniPvp",
            op: "move",
            battleId: onlineBattle.id,
            moveKey: key,
          });
        }
      };
      grid.appendChild(btn);
    });
    miniGameScreen.appendChild(grid);
    if (!yourTurn && !isCpu) {
      miniGameScreen.appendChild(el("p", "mini-game__muted", "Waiting for opponent… (ask them to open the mini panel)"));
    }
  }

  function onPvpResult(m) {
    if (m.op === "invite") {
      if (!m.ok) lastPvpError = m.error || "Could not send challenge";
      vscode.postMessage({ type: "miniPvp", op: "invites" });
      return;
    }
    if (m.op === "invites" && m.ok && gameMode === "lobby") {
      renderLobby(m.data);
      return;
    }
    if (m.op === "accept" && m.ok) {
      onlineBattle = { id: m.data.battleId, role: m.data.role || "defender" };
      gameMode = "pvp";
      renderBattle(m.data.state, onlineBattle.role, false);
      return;
    }
    if (m.op === "decline" && m.ok && gameMode === "lobby") {
      vscode.postMessage({ type: "miniPvp", op: "invites" });
      return;
    }
    if (m.op === "active" && m.ok && m.data && m.data.battle) {
      if (gameMode === "pvp") return;
      if (gameMode === "menu" || gameMode === "lobby") {
        var b = m.data.battle;
        onlineBattle = { id: b.id, role: b.role };
        gameMode = "pvp";
        if (miniGame && !miniGame.hidden) renderBattle(b.state, b.role, false);
      }
      return;
    }
    if (m.op === "move" && onlineBattle && gameMode === "pvp") {
      if (m.ok && m.data && m.data.state) renderBattle(m.data.state, onlineBattle.role, false);
      else {
        lastPvpError = m.error || "Move failed";
        if (m.data && m.data.state) renderBattle(m.data.state, onlineBattle.role, false);
      }
      return;
    }
    if (m.op === "accept" && !m.ok) {
      lastPvpError = m.error || "Could not accept";
      vscode.postMessage({ type: "miniPvp", op: "invites" });
    }
  }

  document.querySelectorAll(".mini-jump[data-mini-tab]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const tab = btn.getAttribute("data-mini-tab");
      if (tab) vscode.postMessage({ type: "openCompanionTab", tab });
    });
  });

  if (miniBtnArena) {
    miniBtnArena.addEventListener("click", function () {
      if (!miniSignedIn) return;
      if (miniArenaHint) miniArenaHint.hidden = false;
      vscode.postMessage({ type: "openArena" });
    });
  }
  if (miniGameBack) {
    miniGameBack.addEventListener("click", function () {
      hideGameUI();
    });
  }

  window.addEventListener("message", (e) => {
    const m = e.data;
    if (m.type === "miniPvpResult") {
      onPvpResult(m);
      return;
    }
    if (m.type === "miniState") {
      const signedIn = m.signedIn === true;
      miniSignedIn = signedIn;
      pvpIncomingCount = typeof m.pvpIncomingCount === "number" ? m.pvpIncomingCount : 0;
      miniProfile = m.profile || null;
      if (!signedIn) {
        currentSprout = null;
        document.getElementById("miniTitle").textContent = "Sign in";
        document.getElementById("miniMood").textContent = "Open sidebar for full UI";
        setMiniUnauthedClickable(true);
        setBar("barRest", 0);
        setBar("barWater", 0);
        setBar("barFood", 0);
        if (miniBtnChat) miniBtnChat.style.display = "none";
        if (miniBtnSignOut) miniBtnSignOut.hidden = true;
        updateArenaButton();
        syncMiniViewport();
        return;
      }
      if (!m.sprout) {
        currentSprout = null;
        document.getElementById("miniTitle").textContent = "No sprout yet";
        document.getElementById("miniMood").textContent = "Open sidebar to hatch or pick";
        setMiniUnauthedClickable(false);
        setBar("barRest", 0);
        setBar("barWater", 0);
        setBar("barFood", 0);
        if (miniBtnChat) miniBtnChat.style.display = "none";
        if (miniBtnSignOut) miniBtnSignOut.hidden = false;
        updateArenaButton();
        syncMiniViewport();
        return;
      }
      if (miniBtnChat) miniBtnChat.style.display = "inline-block";
      if (miniBtnSignOut) miniBtnSignOut.hidden = false;
      setMiniUnauthedClickable(false);
      currentSprout = m.sprout;
      const sp = m.sprout;
      document.getElementById("miniTitle").textContent = sp.name || "Sprout";
      const rare = sp.rarity ? String(sp.rarity) : "";
      const gs = String(sp.growthStage || "");
      const stageLabel = gs === "Egg" ? "Egg · " : "";
      document.getElementById("miniMood").textContent =
        stageLabel + (rare ? rare + " · " : "") + "Mood: " + (sp.mood || "—");
      setBar("barRest", Number(sp.restScore) || 0);
      setBar("barWater", Number(sp.waterScore) || 0);
      setBar("barFood", Number(sp.foodScore) || 0);
      updateArenaButton();
      syncMiniViewport();
    }
  });

  if (miniBtnChat) {
    miniBtnChat.addEventListener("click", () => {
      vscode.postMessage({ type: "openCursorChat" });
    });
  }
  if (miniBtnSignOut) {
    miniBtnSignOut.addEventListener("click", () => {
      vscode.postMessage({ type: "companionSignOut" });
    });
  }

  vscode.postMessage({ type: "miniReady" });
})();
