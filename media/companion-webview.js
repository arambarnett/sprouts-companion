(function () {
  const vscode = acquireVsCodeApi();
  const MEDIA_BASE =
    (document.body && document.body.getAttribute("data-sprouts-media")) || "";
  let state = {
    token: null,
    sproutId: null,
    isEgg: false,
    attachedIncubatorId: null,
    feedBalance: null,
    /** Editor settings fallback when API omits install URL (https only). */
    githubAppInstallUrl: "",
  };
  /** @type {{ streak?: number, level?: number, experience?: number, totalPoints?: number, totalCreditedCommits?: number, seasonPassActive?: boolean, levelBand?: { id?: string, minLevel?: number, title?: string }, githubAppInstallUrl?: string } | null} */
  let ideProfileCache = null;

  var PANEL_BY_TAB = {
    sprout: "panelSprout",
    arena: "panelArena",
    shop: "panelShop",
    settings: "panelSettings",
  };

  /** Legacy tab ids from deep links / mini panel → Shop sub-section. */
  var LEGACY_TAB_TO_SHOP = {
    feed: "care",
    wardrobe: "wardrobe",
    "season-pass": "season",
    store: "store",
    incubator: "eggs",
  };

  var lastShopSubtab = "care";

  /** Season 1 reward steps (cosmetics + Feed + egg/incubator flair). */
  var SEASON_REWARD_STEPS = [
    { min: 2, label: "+10 Feed", type: "Feed" },
    { min: 5, label: "Dev Glasses", type: "Accessory" },
    { min: 8, label: "+25 Feed", type: "Feed" },
    { min: 10, label: "React logo tint", type: "Logo" },
    { min: 14, label: "Common egg credit", type: "Egg" },
    { min: 18, label: "Audio Pro headphones", type: "Accessory" },
    { min: 22, label: "Basic incubator boost", type: "Incubator" },
    { min: 25, label: "+40 Feed", type: "Feed" },
    { min: 30, label: "GitHub logo tint", type: "Logo" },
    { min: 38, label: "Rare egg credit", type: "Egg" },
    { min: 45, label: "Coffee mug", type: "Accessory" },
    { min: 52, label: "+75 Feed", type: "Feed" },
    { min: 60, label: "Premium incubator trial", type: "Incubator" },
    { min: 75, label: "Docker logo tint", type: "Logo" },
    { min: 90, label: "+100 Feed", type: "Feed" },
    { min: 100, label: "Mechanical keyboard", type: "Accessory" },
    { min: 120, label: "Super incubator shard", type: "Incubator" },
    { min: 150, label: "VS Code logo tint", type: "Logo" },
    { min: 175, label: "+150 Feed", type: "Feed" },
    { min: 200, label: "Code King crown", type: "Accessory" },
  ];

  var WARDROBE_ROWS = [
    { id: "glasses", label: "Glasses", min: 5, accessory: "glasses" },
    { id: "headphones", label: "Headphones", min: 20, accessory: "headphones" },
    { id: "coffee", label: "Coffee", min: 50, accessory: "coffee" },
    { id: "keyboard", label: "Keyboard", min: 100, accessory: "keyboard" },
    { id: "crown", label: "Crown", min: 200, accessory: "crown" },
    { id: "react", label: "React logo", min: 10, sub: "Dev palette", devLogo: "react" },
    { id: "github", label: "GitHub logo", min: 30, sub: "Dev palette", devLogo: "github" },
    { id: "docker", label: "Docker logo", min: 75, sub: "Dev palette", devLogo: "docker" },
    { id: "vscode", label: "VS Code logo", min: 150, sub: "Dev palette", devLogo: "vscode" },
  ];
  const REVIVE_COST = 500;
  let sproutList = [];
  let petPixelParams = null;
  let petRaf = 0;
  let petFrame = 0;
  let petAcc = 0;
  let petPrevT = 0;
  var PET_FPS = 5;
  var incubatorTabRaf = 0;
  var incubatorFrame = 0;
  var incubatorAcc = 0;
  var incubatorPrevT = 0;
  /** Last GET /shop/incubators + /me/incubators payload for Incubator tab. */
  var incubatorTabCache = null;
  /** Last GET /shop/season1 (Store + Season upsell pricing). */
  var shopSeasonCache = null;
  var wardrobeTabRaf = 0;
  var wardrobeFrame = 0;
  var wardrobeAcc = 0;
  var wardrobePrevT = 0;
  var wardrobePreviewAccessory = "none";
  var wardrobePreviewDevLogo = "none";
  var wardrobeSelectedRowId = null;
  /** Last successful GET level-up-cost for affordance checks. */
  var lastLevelUpPreview = null;

  /** Canvas preview when signed out or user has zero sprouts (egg animation). */
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

  function sproutToPetPixelParams(sp) {
    const rs = sp.restScore != null ? Number(sp.restScore) : null;
    const ws = sp.waterScore != null ? Number(sp.waterScore) : null;
    const fs = sp.foodScore != null ? Number(sp.foodScore) : null;
    const hp = sp.healthPoints != null ? Number(sp.healthPoints) : null;
    return {
      species: sp.species,
      growthStage: sp.growthStage,
      mood: sp.mood,
      rest: rs != null && !isNaN(rs) ? rs : 0,
      water: ws != null && !isNaN(ws) ? ws : 0,
      food: fs != null && !isNaN(fs) ? fs : 0,
      health: hp != null && !isNaN(hp) ? hp : 0,
      rarity: sp.rarity,
      isDormant: sp.isDormant === true,
      isDead: sp.isDead === true,
      incubatorType:
        sp.incubator && sp.incubator.type ? String(sp.incubator.type) : undefined,
    };
  }

  function isShopPanelActive() {
    var p = document.getElementById("panelShop");
    return !!(p && p.classList.contains("active"));
  }

  function isIncubatorPanelActive() {
    if (!isShopPanelActive()) return false;
    var sub = document.querySelector('.shop-subpanel[data-shop-panel="eggs"]');
    return !!(sub && sub.classList.contains("active"));
  }

  function stopIncubatorTabLoop() {
    if (incubatorTabRaf) {
      cancelAnimationFrame(incubatorTabRaf);
      incubatorTabRaf = 0;
    }
  }

  function getIncubatorTabEggSprout() {
    const sel = document.getElementById("incubatorEggPick");
    const id = sel && sel.value;
    if (!id) return null;
    return sproutList.find((x) => x.id === id) || null;
  }

  function refreshIncubatorEggPick() {
    const sel = document.getElementById("incubatorEggPick");
    const hint = document.getElementById("incubatorTabHint");
    if (!sel) return;
    const eggs = sproutList.filter((s) => String(s.growthStage || "") === "Egg");
    const prev = sel.value;
    sel.innerHTML = "";
    if (eggs.length === 0) {
      const o = document.createElement("option");
      o.value = "";
      o.textContent = "No eggs yet — Store or pairing";
      sel.appendChild(o);
      if (hint) hint.style.display = "";
    } else {
      eggs.forEach((sp) => {
        const o = document.createElement("option");
        o.value = sp.id;
        const att =
          sp.incubator && sp.incubator.type ? " · " + String(sp.incubator.type) : "";
        o.textContent = (sp.name || "Egg") + att;
        sel.appendChild(o);
      });
      if (prev && eggs.some((e) => e.id === prev)) sel.value = prev;
      else sel.value = eggs[0].id;
      if (hint) hint.style.display = "none";
    }
    sel.onchange = function () {
      if (incubatorTabCache) renderIncubatorTabPanel(incubatorTabCache);
    };
  }

  function renderIncubatorTabPanel(data) {
    const incCat = document.getElementById("incubatorTabCatalog");
    const incOwn = document.getElementById("incubatorTabOwned");
    const incSta = document.getElementById("incubatorTabStatus");
    const incErr = document.getElementById("incubatorTabErr");
    if (!incCat || !incOwn) return;
    if (incErr) {
      incErr.textContent = data.error || "";
      incErr.style.display = data.error ? "block" : "none";
    }
    if (incSta && data.error) {
      incSta.textContent = "";
      incSta.classList.remove("feed-toast--err");
    }
    incCat.innerHTML = "";
    incOwn.innerHTML = "";
    const eggSp = getIncubatorTabEggSprout();
    const eggOk = eggSp && String(eggSp.growthStage || "") === "Egg";
    const attachedId =
      eggSp && eggSp.incubator && eggSp.incubator.id ? String(eggSp.incubator.id) : null;

    (data.incubatorCatalog || []).forEach((row) => {
      const div = document.createElement("div");
      div.className = "shop-item shop-card";
      const purchasable = row.purchasableWithFeed === true;
      const boost = row.speedBoost != null ? String(row.speedBoost) : "1";
      const meta =
        row.maxUses === -1
          ? "Unlimited uses · " + boost + "× speed"
          : (row.usesLabel || "") + " uses · " + boost + "× speed";
      let cta = "";
      if (purchasable) {
        cta =
          '<div class="shop-card__row"><span class="shop-card__price">' +
          (row.feedCost != null ? String(row.feedCost) : "—") +
          " Feed</span>" +
          '<button type="button" class="shop-card__cta" data-tab-purchase-inc="' +
          (row.type || "") +
          '">Buy with Feed</button></div>';
      } else {
        cta =
          '<div class="shop-card__row"><span class="shop-card__price">Free</span>' +
          '<button type="button" class="shop-card__cta" disabled>Included with account</button></div>';
      }
      div.innerHTML =
        '<div class="shop-card__badge">Incubator</div>' +
        '<strong class="shop-card__name">' +
        (row.name || row.type || "") +
        "</strong>" +
        '<p class="shop-card__desc">' +
        meta +
        "</p>" +
        cta;
      incCat.appendChild(div);
    });
    incCat.querySelectorAll("button[data-tab-purchase-inc]").forEach((btn) => {
      btn.addEventListener("click", () => {
        if (btn.disabled) return;
        vscode.postMessage({
          type: "purchaseIncubator",
          incubatorType: btn.getAttribute("data-tab-purchase-inc"),
        });
      });
    });

    (data.userIncubators || []).forEach((inc) => {
      const div = document.createElement("div");
      div.className = "shop-item shop-card";
      const rem =
        inc.remainingUses === "unlimited"
          ? "Unlimited uses left"
          : String(inc.remainingUses) + " uses left";
      const dead =
        inc.isActive === false || (inc.maxUses > 0 && inc.currentUses >= inc.maxUses);
      const onThisEgg = attachedId && attachedId === inc.id;
      let actionHtml = "";
      if (onThisEgg) {
        actionHtml =
          '<button type="button" class="shop-card__cta" data-tab-detach-inc="' +
          inc.id +
          '">Detach</button>';
      } else if (!dead && eggOk && eggSp) {
        actionHtml =
          '<button type="button" class="shop-card__cta" data-tab-attach-inc="' +
          inc.id +
          '">Attach to selected egg</button>';
      } else if (!eggOk) {
        actionHtml =
          '<button type="button" class="shop-card__cta" disabled>No egg selected</button>';
      } else {
        actionHtml = '<button type="button" class="shop-card__cta" disabled>Not available</button>';
      }
      div.innerHTML =
        '<div class="shop-card__badge">Owned</div>' +
        '<strong class="shop-card__name">' +
        (inc.type || "Incubator") +
        "</strong>" +
        '<p class="shop-card__desc">' +
        (inc.isActive ? rem : "Inactive") +
        " · " +
        String(inc.speedBoost) +
        "×</p>" +
        '<div class="shop-card__row">' +
        actionHtml +
        "</div>";
      incOwn.appendChild(div);
    });
    incOwn.querySelectorAll("button[data-tab-attach-inc]").forEach((btn) => {
      btn.addEventListener("click", () => {
        const iid = btn.getAttribute("data-tab-attach-inc");
        const sp = getIncubatorTabEggSprout();
        if (!sp || !iid) return;
        vscode.postMessage({
          type: "attachIncubator",
          sproutId: sp.id,
          incubatorId: iid,
        });
      });
    });
    incOwn.querySelectorAll("button[data-tab-detach-inc]").forEach((btn) => {
      btn.addEventListener("click", () => {
        const sp = getIncubatorTabEggSprout();
        if (!sp) return;
        vscode.postMessage({ type: "detachIncubator", sproutId: sp.id });
      });
    });
  }

  function startIncubatorTabLoop() {
    stopIncubatorTabLoop();
    if (!window.SproutsPixel) return;
    const canvas = document.getElementById("incubatorPreviewCanvas");
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    incubatorFrame = 0;
    incubatorAcc = 0;
    incubatorPrevT = 0;
    var step = 1000 / PET_FPS;

    function tick(t) {
      incubatorTabRaf = requestAnimationFrame(tick);
      if (!window.SproutsPixel || !isIncubatorPanelActive()) return;
      if (incubatorPrevT === 0) incubatorPrevT = t;
      var dt = t - incubatorPrevT;
      incubatorPrevT = t;
      incubatorAcc += dt;
      var P = window.SproutsPixel;
      var sp = getIncubatorTabEggSprout();
      var incRaw =
        sp && sp.incubator && sp.incubator.type ? String(sp.incubator.type).toLowerCase() : "basic";
      var incType = incRaw === "premium" || incRaw === "super" ? incRaw : "basic";
      var hasEgg = !!sp;
      var frames = P.buildIncubatorFrames(incType, 42, hasEgg);
      while (incubatorAcc >= step) {
        incubatorAcc -= step;
        incubatorFrame = (incubatorFrame + 1) % frames.length;
      }
      var grid = frames[incubatorFrame % frames.length];
      if (grid && P.drawIdeCompanionFrame) {
        ctx.imageSmoothingEnabled = false;
        ctx.clearRect(0, 0, 64, 64);
        P.drawIdeCompanionFrame(ctx, grid, 0, 0);
      }
    }
    incubatorTabRaf = requestAnimationFrame(tick);
  }

  function stopWardrobeTabLoop() {
    if (wardrobeTabRaf) {
      cancelAnimationFrame(wardrobeTabRaf);
      wardrobeTabRaf = 0;
    }
  }

  function isWardrobePanelActive() {
    if (!isShopPanelActive()) return false;
    var p = document.querySelector('.shop-subpanel[data-shop-panel="wardrobe"]');
    return !!(p && p.classList.contains("active"));
  }

  function getWardrobeSprout() {
    return sproutList.find((x) => x.id === state.sproutId) || null;
  }

  function wardrobePreviewStatus(sp) {
    if (!state.token) return { ok: false, msg: "Sign in on the Sprout tab first." };
    if (!sp) return { ok: false, msg: "Select a hatched Sprout on the Sprout tab." };
    if (String(sp.growthStage || "") === "Egg")
      return { ok: false, msg: "Hatch your egg first — wardrobe preview is for hatched Sprouts." };
    if (sp.isDead === true)
      return { ok: false, msg: "Revive your Sprout on the Sprout tab (500 Feed) to preview cosmetics." };
    return { ok: true };
  }

  function startWardrobeTabLoop() {
    stopWardrobeTabLoop();
    if (!window.SproutsPixel) return;
    var canvas = document.getElementById("wardrobePreviewCanvas");
    var hint = document.getElementById("wardrobePreviewHint");
    if (!canvas) return;
    var ctx = canvas.getContext("2d");
    if (!ctx) return;
    wardrobeFrame = 0;
    wardrobeAcc = 0;
    wardrobePrevT = 0;
    var step = 1000 / PET_FPS;

    function tick(t) {
      wardrobeTabRaf = requestAnimationFrame(tick);
      if (!window.SproutsPixel || !isWardrobePanelActive()) return;
      var sp = getWardrobeSprout();
      var st = wardrobePreviewStatus(sp);
      if (hint) {
        hint.textContent = st.msg || "Tap an item to preview (commit milestones unlock for real).";
      }
      if (!st.ok) {
        ctx.clearRect(0, 0, 64, 64);
        return;
      }
      if (wardrobePrevT === 0) wardrobePrevT = t;
      var dt = t - wardrobePrevT;
      wardrobePrevT = t;
      wardrobeAcc += dt;
      var P = window.SproutsPixel;
      var type = P.speciesKeyFromApi(sp.species);
      var variant = P.rarityToVariantIndex(sp.rarity);
      var acc = wardrobePreviewAccessory || "none";
      var dev = wardrobePreviewDevLogo || "none";
      var frames = P.buildAnimalFrames(type, "neutral", false, variant, acc, 1, dev, "sprout");
      while (wardrobeAcc >= step) {
        wardrobeAcc -= step;
        wardrobeFrame = (wardrobeFrame + 1) % frames.length;
      }
      var grid = frames[wardrobeFrame % frames.length];
      if (grid && P.drawIdeCompanionFrame) {
        ctx.imageSmoothingEnabled = false;
        ctx.clearRect(0, 0, 64, 64);
        P.drawIdeCompanionFrame(ctx, grid, 0, 0);
      }
    }
    wardrobeTabRaf = requestAnimationFrame(tick);
  }

  function updateAuthBar() {
    const signIn = document.getElementById("btnCompanionSignIn");
    const signOut = document.getElementById("btnCompanionSignOut");
    if (!signIn || !signOut) return;
    const authed = !!state.token;
    signIn.hidden = authed;
    signOut.hidden = !authed;
  }

  function renderApiMetaLine() {
    const el = document.getElementById("apiMetaLine");
    if (!el) return;
    el.classList.remove("api-meta--warn");
    if (!state.apiUrl) {
      el.textContent = "";
      return;
    }
    let line = "API: " + state.apiUrl;
    if (state.apiUrlUserOverride && state.homeConfigApiUrl && state.homeConfigApiUrl !== state.apiUrl) {
      line +=
        " — Cursor setting overrides ~/.sprouts/config.json (" + state.homeConfigApiUrl + ").";
      el.classList.add("api-meta--warn");
    }
    if (state.apiProbeOk === false && state.apiProbeHint) {
      line += " — " + state.apiProbeHint + " Run: Sprouts: Copy API diagnostics.";
      el.classList.add("api-meta--warn");
    }
    el.textContent = line;
  }

  function renderAccountStrip(profile) {
    const el = document.getElementById("accountStrip");
    if (!el) return;
    if (!profile) {
      el.textContent = "";
      return;
    }
    var sp =
      state.sproutId && sproutList.length
        ? sproutList.find(function (x) {
            return x.id === state.sproutId;
          })
        : null;
    var lead = sp && sp.name ? String(sp.name) : "You";
    var lv = sp && sp.level != null ? Number(sp.level) : 1;
    if (!Number.isFinite(lv) || lv < 1) lv = 1;
    const commits =
      profile.totalCreditedCommits != null ? Number(profile.totalCreditedCommits) : 0;
    el.textContent =
      lead +
      " · streak " +
      (profile.streak ?? 0) +
      " · Lv " +
      lv +
      " · " +
      (profile.experience ?? 0) +
      " XP · " +
      (profile.totalPoints ?? 0) +
      " pts · " +
      commits +
      " commits";
  }

  /** Screenshot-friendly strip: selected Sprout name + level + growth (for sharing). */
  function renderShareStrip() {
    const wrap = document.getElementById("shareStrip");
    const titleEl = document.getElementById("shareStripTitle");
    const statsEl = document.getElementById("shareStripStats");
    const nameEl = document.getElementById("name");
    if (!wrap || !titleEl || !statsEl) return;
    if (!ideProfileCache || !state.token) {
      wrap.hidden = true;
      return;
    }
    wrap.hidden = false;
    var sp =
      state.sproutId && sproutList.length
        ? sproutList.find(function (x) {
            return x.id === state.sproutId;
          })
        : null;
    var rawName = nameEl ? String(nameEl.textContent || "").trim() : "";
    var sproutName =
      sp && sp.name
        ? String(sp.name)
        : rawName &&
            rawName.indexOf("Sign in") !== 0 &&
            rawName.indexOf("No Sprouts") !== 0 &&
            rawName.indexOf("Sprouts icon") !== 0
          ? rawName
          : "Sprout";
    var lv = sp && sp.level != null ? Number(sp.level) : 1;
    if (!Number.isFinite(lv) || lv < 1) lv = 1;
    var stageLine = "—";
    if (sp) {
      var gs = sp.growthStage != null ? String(sp.growthStage) : "";
      var gr = sp.grade != null ? String(sp.grade) : "";
      if (gs && gr && gr !== "Normal") stageLine = gs + " · " + gr;
      else if (gs) stageLine = gs;
      else if (gr) stageLine = gr;
    }
    titleEl.textContent = sproutName + " · Lv " + lv + " · " + stageLine;
    statsEl.textContent =
      "Streak " +
      (ideProfileCache.streak ?? 0) +
      " · " +
      (ideProfileCache.totalCreditedCommits ?? 0) +
      " credited commits · getsprouts.io";
    var brandEl = document.getElementById("shareStripBrand");
    if (brandEl) {
      var pro = ideProfileCache && ideProfileCache.seasonPassActive === true;
      brandEl.textContent = pro ? "Sprouts Pro" : "Sprouts";
      brandEl.classList.toggle("share-strip__brand--pro", pro);
    }
  }

  function updateBrandHeader() {
    var title = document.getElementById("sproutsBrandTitle");
    var text = document.getElementById("sproutsBrandText");
    if (!title || !text) return;
    var pro = ideProfileCache && ideProfileCache.seasonPassActive === true;
    text.textContent = pro ? "Sprouts Pro" : "Sprouts";
    title.classList.toggle("sprouts-brand--pro", pro);
  }

  function updateGithubAppInstallButton() {
    const btn = document.getElementById("btnInstallGithubApp");
    const missingEl = document.getElementById("githubInstallMissingHint");
    if (!btn) return;
    const fromProfile =
      ideProfileCache && typeof ideProfileCache.githubAppInstallUrl === "string"
        ? ideProfileCache.githubAppInstallUrl.trim()
        : "";
    const fromState =
      typeof state.githubAppInstallUrl === "string" ? state.githubAppInstallUrl.trim() : "";
    const url = fromProfile || fromState;
    if (url) {
      btn.hidden = false;
      btn.dataset.installUrl = url;
      if (missingEl) missingEl.hidden = true;
    } else {
      btn.hidden = true;
      delete btn.dataset.installUrl;
      if (missingEl) missingEl.hidden = false;
    }
  }

  function formatSeasonPassUsdMonthly(usd) {
    if (!Number.isFinite(usd)) return "6.99";
    var cents = Math.round(usd * 100);
    var d = cents / 100;
    return d % 1 === 0 ? String(Math.floor(d)) : d.toFixed(2);
  }

  function applySeasonUpsellPricing() {
    var sp = shopSeasonCache && shopSeasonCache.seasonPass ? shopSeasonCache.seasonPass : null;
    var usd = sp && sp.priceUsdMonthly != null ? Number(sp.priceUsdMonthly) : 6.99;
    var priceStr = formatSeasonPassUsdMonthly(usd);
    var priceEl = document.getElementById("seasonPassUpsellPrice");
    if (priceEl) priceEl.textContent = "$" + priceStr + "/mo";
    var billEl = document.getElementById("seasonPassUpsellBilling");
    if (billEl)
      billEl.textContent =
        sp && sp.billingNote ? sp.billingNote : "Billed monthly (Stripe). Cancel anytime.";
    var seasonBtn = document.getElementById("btnBuySeasonPassSeasonTab");
    if (seasonBtn) {
      if (!shopSeasonCache) {
        seasonBtn.title = "";
      } else {
        var stripeOk = shopSeasonCache.stripeConfigured === true;
        seasonBtn.title = stripeOk
          ? ""
          : "Checkout needs Stripe on the API (set STRIPE_SECRET_KEY on the server).";
      }
    }
  }

  function fillSeasonUpsellRewardList() {
    var ul = document.getElementById("seasonPassUpsellList");
    if (!ul) return;
    ul.innerHTML = "";
    SEASON_REWARD_STEPS.forEach(function (row) {
      var li = document.createElement("li");
      li.className = "season-reward-row season-reward-row--upsell-tease";
      li.innerHTML =
        '<span class="season-reward-row__ico">✦</span><div class="season-reward-row__body"><span class="season-reward-row__type">' +
        escapeHtml(row.type) +
        '</span><span class="season-reward-row__label">' +
        escapeHtml(row.label) +
        '</span></div><span class="season-reward-row__min">' +
        row.min +
        "+ commits</span>";
      ul.appendChild(li);
    });
  }

  function renderStoreSeasonPassCard() {
    var wrap = document.getElementById("storeSeasonPassCard");
    var err = document.getElementById("shopErr");
    if (!wrap) return;
    wrap.innerHTML = "";
    if (err) err.textContent = shopSeasonCache && shopSeasonCache.error ? shopSeasonCache.error : "";
    if (!state.token) {
      wrap.innerHTML =
        '<p class="hint">Sign in on the Sprout tab to see subscription options.</p>';
      return;
    }
    var sp = shopSeasonCache && shopSeasonCache.seasonPass ? shopSeasonCache.seasonPass : null;
    var usd = sp && sp.priceUsdMonthly != null ? Number(sp.priceUsdMonthly) : 6.99;
    var priceStr = formatSeasonPassUsdMonthly(usd);
    var stripeOk = shopSeasonCache && shopSeasonCache.stripeConfigured === true;
    var hasPass = ideProfileCache && ideProfileCache.seasonPassActive === true;
    var div = document.createElement("div");
    div.className = "shop-item shop-card shop-card--season";
    div.innerHTML =
      '<div class="shop-card__badge">Season 1</div>' +
      "<strong class=\"shop-card__name\">" +
      escapeHtml((sp && sp.name) || "Season 1 Pass") +
      "</strong>" +
      '<p class="shop-card__desc">' +
      escapeHtml(
        (sp && sp.description) ||
          "Optional cosmetics pass — bonus Feed/XP on commits, monthly eggs and incubators. Core play stays free."
      ) +
      "</p>" +
      '<div class="shop-card__row"><span class="shop-card__price">$' +
      priceStr +
      '/mo</span><button type="button" class="shop-card__cta" id="btnBuySeasonPassStore"' +
      (stripeOk && !hasPass ? "" : " disabled") +
      ">" +
      (hasPass ? "Active" : stripeOk ? "Subscribe with Stripe" : "Configure Stripe") +
      "</button></div>";
    wrap.appendChild(div);
    var btn = document.getElementById("btnBuySeasonPassStore");
    if (btn && stripeOk && !hasPass) {
      btn.addEventListener("click", () => vscode.postMessage({ type: "checkoutSeasonPass" }));
    }
  }

  function renderSeasonPassAndWardrobe() {
    var pass = ideProfileCache && ideProfileCache.seasonPassActive === true;
    var up = document.getElementById("seasonPassUpsell");
    var mem = document.getElementById("seasonPassMember");
    if (up) up.hidden = pass;
    if (mem) mem.hidden = !pass;
    if (!pass) {
      fillSeasonUpsellRewardList();
      applySeasonUpsellPricing();
      var btn = document.getElementById("btnBuySeasonPassSeasonTab");
      if (btn) {
        var stripeOk = shopSeasonCache && shopSeasonCache.stripeConfigured === true;
        btn.disabled = !stripeOk;
      }
    }

    const c =
      ideProfileCache && ideProfileCache.totalCreditedCommits != null
        ? Number(ideProfileCache.totalCreditedCommits)
        : 0;
    if (pass) {
      const sc = document.getElementById("seasonPassCommits");
      if (sc) sc.textContent = String(c);
      var tierSize = 25;
      var within = c % tierSize;
      var pct = Math.min(100, (within / tierSize) * 100);
      var fill = document.getElementById("seasonPassBarFill");
      if (fill) fill.style.width = pct + "%";
      var nextEl = document.getElementById("seasonPassNext");
      if (nextEl) {
        nextEl.textContent =
          within === 0 && c > 0
            ? "Tier up! Next rewards at +" + tierSize + " commits."
            : tierSize - within + " credited commits to next Season tier (" + tierSize + "/block).";
      }
      var list = document.getElementById("seasonRewardList");
      if (list) {
        list.innerHTML = "";
        SEASON_REWARD_STEPS.forEach(function (row) {
          var unlocked = c >= row.min;
          var li = document.createElement("li");
          li.className = "season-reward-row" + (unlocked ? " season-reward-row--unlocked" : "");
          li.innerHTML =
            '<span class="season-reward-row__ico">' +
            (unlocked ? "✓" : "○") +
            '</span><div class="season-reward-row__body"><span class="season-reward-row__type">' +
            escapeHtml(row.type) +
            '</span><span class="season-reward-row__label">' +
            escapeHtml(row.label) +
            '</span></div><span class="season-reward-row__min">' +
            row.min +
            "+</span>";
          list.appendChild(li);
        });
      }
    }

    var wg = document.getElementById("wardrobeUnlockGrid");
    if (wg) {
      wg.innerHTML = "";
      WARDROBE_ROWS.forEach(function (row) {
        var unlocked = c >= row.min;
        var div = document.createElement("button");
        div.type = "button";
        div.className =
          "wardrobe-chip" +
          (unlocked ? " wardrobe-chip--unlocked" : "") +
          (wardrobeSelectedRowId === row.id ? " wardrobe-chip--selected" : "");
        div.setAttribute("data-wardrobe-id", row.id);
        div.innerHTML =
          "<strong>" +
          escapeHtml(row.label) +
          "</strong><span>" +
          (unlocked ? "Unlocked" : row.min + " commits") +
          "</span>" +
          (row.sub ? '<span class="wardrobe-chip__sub">' + escapeHtml(row.sub) + "</span>" : "");
        div.addEventListener("click", function () {
          wardrobeSelectedRowId = row.id;
          if (row.devLogo) {
            wardrobePreviewAccessory = "none";
            wardrobePreviewDevLogo = row.devLogo;
          } else {
            wardrobePreviewAccessory = row.accessory || "none";
            wardrobePreviewDevLogo = "none";
          }
          renderSeasonPassAndWardrobe();
          startWardrobeTabLoop();
        });
        wg.appendChild(div);
      });
    }
  }

  function updateFeedCareHint() {
    const hint = document.getElementById("feedPickHint");
    if (!hint) return;
    if (!state.token) {
      hint.textContent = "Sign in on the Sprout tab first.";
      return;
    }
    if (sproutList.length === 0) {
      hint.textContent =
        "No Sprouts yet — hatch an egg (git commits on the Sprout tab) or add one from your account.";
      return;
    }
    if (!state.sproutId) {
      hint.textContent = "Select a sprout on the Sprout tab first.";
      return;
    }
    const sp = sproutList.find((x) => x.id === state.sproutId);
    const nm = sp && sp.name ? String(sp.name) : "Sprout";
    hint.textContent =
      "Make a git commit (Sprout tab sync) to earn Feed · Caring for: " +
      nm +
      " (switch on Sprout tab if you have several).";
  }

  function setBar(id, pct) {
    const el = document.getElementById(id);
    if (el) el.style.width = Math.max(0, Math.min(100, pct)) + "%";
  }

  function setVitalBar(barId, pctId, raw) {
    const v = raw != null && !isNaN(raw) ? Number(raw) : 0;
    setBar(barId, v);
    const pe = document.getElementById(pctId);
    if (pe) pe.textContent = Math.round(v) + "%";
  }

  function resetVitalPcts() {
    ["pctRest", "pctWater", "pctFood", "pctHealth"].forEach(function (id) {
      const el = document.getElementById(id);
      if (el) el.textContent = "0%";
    });
  }

  function escapeHtml(str) {
    const d = document.createElement("div");
    d.textContent = str == null ? "" : String(str);
    return d.innerHTML;
  }

  function truncateMiddle(s, front, back) {
    const t = String(s);
    if (t.length <= front + back + 3) return t;
    return t.slice(0, front) + "…" + t.slice(-back);
  }

  function updateStatDetailVisibility() {
    const sd = document.getElementById("statDetail");
    if (!sd) return;
    sd.hidden = !!(state.token && sproutList.length > 0);
  }

  /** Signed-out / no-sprout lists: full default. Eggs: short commit hint. Hatched: hidden (less noise). */
  function resetSproutNameHintDefault() {
    const hint = document.getElementById("sproutNameHint");
    if (!hint) return;
    hint.hidden = false;
    hint.innerHTML =
      "<strong>Make a git commit</strong> (panel sync) to earn <strong>Feed</strong> and hatch your oldest egg. Hatch picks a random name; you can edit the display name below.";
  }

  function updateSproutNameHint(sp) {
    const hint = document.getElementById("sproutNameHint");
    if (!hint || !sp) return;
    const gs = String(sp.growthStage || "");
    if (gs === "Egg") {
      hint.hidden = false;
      hint.textContent =
        "Git commits (while this panel syncs) earn Feed and can hatch eggs—oldest first. Edit the name below anytime.";
    } else {
      hint.hidden = true;
    }
  }

  function refreshCompanionChrome() {
    const detail = document.getElementById("companionDetail");
    const carousel = document.getElementById("companionCarousel");
    const show = !!(state.token && sproutList.length > 0);
    if (detail) detail.hidden = !show;
    if (carousel) carousel.hidden = !show;
    const prev = document.getElementById("btnSproutPrev");
    const next = document.getElementById("btnSproutNext");
    const multi = sproutList.length > 1;
    if (prev) prev.disabled = !multi;
    if (next) next.disabled = !multi;
    if (!show) clearDetailPanels();
    updateStatDetailVisibility();
  }

  function clearDetailPanels() {
    const identity = document.getElementById("sproutIdentityPanel");
    const attr = document.getElementById("attributesPanelBody");
    const build = document.getElementById("attrBuildStats");
    const moves = document.getElementById("arenaMovesPanelBody");
    if (identity) identity.innerHTML = "";
    if (attr) attr.innerHTML = "";
    if (build) build.innerHTML = "";
    if (moves) moves.innerHTML = "";
    const lv = document.getElementById("attrLevelVal");
    const xn = document.getElementById("attrXpNum");
    const pl = document.getElementById("attrPointsLine");
    if (lv) lv.textContent = "—";
    if (xn) xn.textContent = "—";
    if (pl) pl.textContent = "—";
    setBar("attrXpBar", 0);
    const cs = document.getElementById("carouselSpecies");
    const cm = document.getElementById("carouselMeta");
    if (cs) cs.textContent = "—";
    if (cm) cm.textContent = "";
  }

  function setCompanionSubtab(name) {
    document.querySelectorAll(".companion-subtab").forEach((b) => {
      const on = b.getAttribute("data-subtab") === name;
      b.classList.toggle("active", on);
      b.setAttribute("aria-selected", on ? "true" : "false");
    });
    document.querySelectorAll(".companion-subpanel").forEach((p) => {
      const on = p.getAttribute("data-subpanel") === name;
      p.classList.toggle("active", on);
    });
    if (name === "moves") {
      requestArenaLoadout();
    }
  }

  function isArenaMovesSubtabActive() {
    const p = document.querySelector('.companion-subpanel.active[data-subpanel="moves"]');
    return !!p;
  }

  function requestArenaLoadout() {
    const body = document.getElementById("arenaMovesPanelBody");
    if (!state.sproutId) {
      if (body) body.innerHTML = "<p class='hint'>Select a sprout first.</p>";
      return;
    }
    if (body) body.innerHTML = "<p class='hint'>Loading…</p>";
    vscode.postMessage({ type: "loadArenaLoadout", sproutId: state.sproutId });
  }

  function renderArenaMovesPanel(m) {
    const body = document.getElementById("arenaMovesPanelBody");
    if (!body) return;
    const loadout = m.loadout || { moves: [], power: {} };
    const moves = loadout.moves || [];
    const power = loadout.power && typeof loadout.power === "object" ? loadout.power : {};
    const pool = Array.isArray(m.movePool) ? m.movePool : [];
    const costs = m.costs || { assignMove: 40, powerUp: 25, maxTier: 5 };
    const bal = m.foodBalance != null ? m.foodBalance : state.feedBalance;

    var html = "";
    html +=
      "<p class='arena-moves-intro'>Four moves for PvP and CPU practice. Assign a move to a slot or train power (+8% damage per tier, max " +
      costs.maxTier +
      ").</p>";
    html +=
      "<p class='arena-moves-feed'>Feed: <strong>" +
      (bal != null ? escapeHtml(String(bal)) : "—") +
      "</strong></p>";

    for (var slot = 0; slot < 4; slot++) {
      var cur = moves[slot] ? String(moves[slot]) : "fireball";
      html += "<div class='arena-move-slot-card'>";
      html += "<div class='arena-move-slot-card__title'>Move " + (slot + 1) + "</div>";
      html += "<div class='arena-move-slot-row'>";
      html += "<select class='arena-move-select' data-slot='" + slot + "' aria-label='Move slot " + (slot + 1) + "'>";
      pool.forEach(function (p) {
        var k = p.key != null ? String(p.key) : "";
        var nm = p.name != null ? String(p.name) : k;
        var pw = p.power != null ? Number(p.power) : 0;
        html +=
          "<option value='" +
          escapeHtml(k) +
          "'" +
          (k === cur ? " selected" : "") +
          ">" +
          escapeHtml(nm) +
          " (pwr " +
          pw +
          ")</option>";
      });
      html += "</select>";
      html +=
        "<button type='button' class='btn-primary' style='font-size:10px;padding:4px 8px' data-assign-slot='" +
        slot +
        "'>Set (" +
        costs.assignMove +
        ")</button>";
      html += "</div>";
      var tier = power[cur] != null ? Math.min(costs.maxTier, Math.floor(Number(power[cur]))) : 0;
      html +=
        "<div class='arena-move-power-row'><span>Power tier " +
        tier +
        " / " +
        costs.maxTier +
        "</span>";
      html +=
        "<button type='button' class='ghost' style='font-size:10px;padding:4px 8px' data-power-move='" +
        escapeHtml(cur) +
        "'" +
        (tier >= costs.maxTier ? " disabled" : "") +
        ">Train (+" +
        costs.powerUp +
        ")</button></div>";
      html += "</div>";
    }
    body.innerHTML = html;
    body.querySelectorAll("[data-assign-slot]").forEach(function (btn) {
      btn.addEventListener("click", function () {
        var sl = parseInt(btn.getAttribute("data-assign-slot"), 10);
        var sel = body.querySelector("select[data-slot='" + sl + "']");
        var mk = sel && sel.value ? sel.value : "";
        vscode.postMessage({
          type: "arenaLoadoutAssignSlot",
          sproutId: state.sproutId,
          slot: sl,
          moveKey: mk,
        });
      });
    });
    body.querySelectorAll("[data-power-move]").forEach(function (btn) {
      btn.addEventListener("click", function () {
        if (btn.disabled) return;
        var mk = btn.getAttribute("data-power-move");
        vscode.postMessage({
          type: "arenaLoadoutPowerUp",
          sproutId: state.sproutId,
          moveKey: mk,
        });
      });
    });
  }

  function detailRow(label, value, multiline) {
    const raw = value == null || value === "" ? null : String(value);
    const cls = multiline ? " detail-row__v--multiline" : "";
    var inner = "—";
    if (raw) {
      if (multiline && raw.indexOf("\n") >= 0) {
        inner = raw
          .split("\n")
          .map(function (line) {
            return escapeHtml(line);
          })
          .join("<br/>");
      } else {
        inner = escapeHtml(raw);
      }
    }
    return (
      '<div class="detail-row"><span class="detail-row__k">' +
      escapeHtml(label) +
      '</span><span class="detail-row__v' +
      cls +
      '">' +
      inner +
      "</span></div>"
    );
  }

  function renderSproutIdentityPanel(sp) {
    const el = document.getElementById("sproutIdentityPanel");
    if (!el) return;
    const nftRaw = sp.nftAddress ? String(sp.nftAddress) : "";
    const nft = nftRaw ? truncateMiddle(nftRaw, 6, 4) : "";
    el.innerHTML =
      detailRow("Species", sp.species) +
      detailRow("Category", sp.category) +
      detailRow("Rarity", sp.rarity) +
      detailRow("Grade", sp.grade) +
      detailRow("NFT", nft || "—") +
      detailRow("Token ID", sp.tokenId);
  }

  function renderTrainableStats(sp) {
    const wrap = document.getElementById("attrBuildStats");
    if (!wrap) return;
    const pts = Number(sp.attributePoints);
    const ptsSafe = Number.isFinite(pts) ? pts : 0;
    const strV = Number(sp.strength);
    const spdV = Number(sp.speed);
    const intV = Number(sp.intelligence);
    const endV = Number(sp.endurance);
    const creV = Number(sp.creativity);
    const luckV = Number(sp.luck);
    function row(stat, label, val) {
      var disabled = ptsSafe < 1 ? " disabled" : "";
      return (
        '<div class="attr-train-row">' +
        '<span class="attr-train-row__name">' +
        escapeHtml(label) +
        "</span>" +
        '<div class="attr-train-row__actions">' +
        '<span class="attr-train-row__val">' +
        escapeHtml(String(val)) +
        "</span>" +
        '<button type="button" class="attr-train-row__btn" data-allocate-stat="' +
        stat +
        '"' +
        disabled +
        ' title="Spend 1 attribute point">↻</button>' +
        "</div></div>"
      );
    }
    wrap.innerHTML =
      row("strength", "Strength", Number.isFinite(strV) ? strV : 10) +
      row("speed", "Speed", Number.isFinite(spdV) ? spdV : 10) +
      row("intelligence", "Intelligence", Number.isFinite(intV) ? intV : 10) +
      row("endurance", "Endurance", Number.isFinite(endV) ? endV : 10) +
      row("creativity", "Creativity", Number.isFinite(creV) ? creV : 10) +
      row("luck", "Luck", Number.isFinite(luckV) ? luckV : 10);
  }

  function applyLevelUpAffordability() {
    if (
      !lastLevelUpPreview ||
      lastLevelUpPreview.sproutId !== state.sproutId ||
      lastLevelUpPreview.feedCost == null ||
      lastLevelUpPreview.userXpCost == null
    ) {
      return;
    }
    const hint = document.getElementById("sproutLevelUpHint");
    const btn = document.getElementById("btnSproutLevelUp");
    const feed = lastLevelUpPreview.feedCost;
    const uxp = lastLevelUpPreview.userXpCost;
    if (hint) {
      hint.textContent =
        "Costs " + feed + " Feed + " + uxp + " account XP (one level).";
    }
    const fb = state.feedBalance;
    const ux =
      ideProfileCache && ideProfileCache.experience != null
        ? Number(ideProfileCache.experience)
        : NaN;
    const knowBal = fb != null && !isNaN(fb) && !isNaN(ux);
    if (knowBal) {
      const can = fb >= feed && ux >= uxp;
      if (btn) btn.disabled = !state.token || !can;
      if (hint && !can) {
        hint.textContent =
          "Costs " +
          feed +
          " Feed + " +
          uxp +
          " account XP. You have " +
          fb +
          " Feed and " +
          ux +
          " XP.";
      }
    } else if (btn) {
      btn.disabled = !state.token;
    }
  }

  function refreshSproutLevelUpOffer(sp) {
    const row = document.getElementById("sproutLevelUpRow");
    const hint = document.getElementById("sproutLevelUpHint");
    const st = document.getElementById("sproutLevelUpStatus");
    const btn = document.getElementById("btnSproutLevelUp");
    if (!row || !hint || !btn) return;
    lastLevelUpPreview = null;
    if (st) {
      st.textContent = "";
      st.classList.remove("err");
    }
    const gs = String(sp.growthStage || "");
    if (sp.isDead || gs === "Egg") {
      row.setAttribute("hidden", "");
      return;
    }
    row.removeAttribute("hidden");
    btn.disabled = !state.token;
    hint.textContent = "Loading cost…";
    if (state.token) {
      vscode.postMessage({ type: "sproutLevelUpPreview", sproutId: sp.id });
    }
  }

  function renderAttributesPanel(sp) {
    const el = document.getElementById("attributesPanelBody");
    if (!el) return;
    const lvl = sp.level != null ? String(sp.level) : "—";
    const exp = Number(sp.experience);
    const expSafe = Number.isFinite(exp) ? exp : 0;
    const lvlNum = Number(sp.level);
    const levelSafe = Number.isFinite(lvlNum) && lvlNum >= 1 ? lvlNum : 1;
    const xpNeed = Math.max(100, levelSafe * 100);
    const xpPct =
      xpNeed > 0 ? Math.min(100, Math.floor((expSafe / xpNeed) * 100)) : 0;
    const lvEl = document.getElementById("attrLevelVal");
    const xnEl = document.getElementById("attrXpNum");
    const pl = document.getElementById("attrPointsLine");
    const pts = Number(sp.attributePoints);
    const ptsSafe = Number.isFinite(pts) ? pts : 0;
    if (lvEl) lvEl.textContent = lvl;
    if (xnEl)
      xnEl.textContent = "XP " + String(expSafe) + " / " + String(xpNeed);
    if (pl) pl.textContent = "✦ " + ptsSafe + " available";
    setBar("attrXpBar", xpPct);
    renderTrainableStats(sp);
    refreshSproutLevelUpOffer(sp);

    var status = "Active";
    if (sp.isDead) status = "Dead";
    else if (sp.isDormant) status = "Dormant";

    const moodRaw = sp.mood != null ? String(sp.mood) : "";
    const moodDisplay = sp.isDead ? "dead" : moodRaw || "—";

    const acc = Array.isArray(sp.equippedAccessories) ? sp.equippedAccessories : [];
    const accStr = acc.length ? acc.join(", ") : "None";

    el.innerHTML =
      detailRow("Growth Stage", sp.growthStage) +
      detailRow("Mood", moodDisplay) +
      detailRow("Status", status) +
      detailRow("Revivals", sp.revivalCount != null ? String(sp.revivalCount) : null) +
      detailRow("Personality", sp.personality, true) +
      detailRow("Catchphrase", sp.catchphrase, true) +
      detailRow("Accessories", accStr, accStr.length > 60);
  }

  function updateCarousel(sp) {
    const cs = document.getElementById("carouselSpecies");
    const cm = document.getElementById("carouselMeta");
    if (!cs || !cm) return;
    const spec = sp.species ? String(sp.species) : "—";
    cs.textContent = sp.name ? String(sp.name) : "Sprout";
    const idx = sproutList.findIndex((x) => x.id === sp.id);
    const n = sproutList.length;
    cm.textContent =
      n > 0 ? spec + " · Sprout " + (idx + 1) + " / " + n : spec;
  }

  function shiftSprout(delta) {
    if (sproutList.length < 2) return;
    const i = sproutList.findIndex((x) => x.id === state.sproutId);
    if (i < 0) return;
    const sp = sproutList[(i + delta + sproutList.length) % sproutList.length];
    const sel = document.getElementById("sproutPick");
    if (sel) sel.value = sp.id;
    pickSprout(sp);
  }

  function disposeViewport() {
    /* 3D viewport bundle removed; sprites only. */
  }

  function stopPetLoop() {
    if (petRaf) {
      cancelAnimationFrame(petRaf);
      petRaf = 0;
    }
  }

  /** Procedural 64² canvas (SproutsPixel) or legacy PNG. */
  function syncViewport() {
    disposeViewport();
    const canvas = document.getElementById("spriteCanvas");
    const fb = document.getElementById("sprite");

    if (!window.SproutsPixel) {
      stopPetLoop();
      if (canvas) {
        canvas.classList.remove("pet__canvas--live");
        canvas.setAttribute("hidden", "");
      }
      const em = document.getElementById("spriteEmojiFallback");
      if (em) em.removeAttribute("hidden");
      if (fb) fb.setAttribute("hidden", "");
      return;
    }

    const emFb = document.getElementById("spriteEmojiFallback");
    if (emFb) emFb.setAttribute("hidden", "");
    if (canvas) canvas.removeAttribute("hidden");
    if (fb) fb.setAttribute("hidden", "");

    if (!state.token || sproutList.length === 0) {
      stopPetLoop();
      petPixelParams = previewEggParams();
      if (canvas) {
        canvas.classList.add("pet__canvas--live");
        startPetLoop();
      }
      return;
    }

    if (canvas) canvas.classList.add("pet__canvas--live");
    startPetLoop();
  }

  function startPetLoop() {
    stopPetLoop();
    if (!window.SproutsPixel || !petPixelParams) return;
    const canvas = document.getElementById("spriteCanvas");
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    petFrame = 0;
    petAcc = 0;
    petPrevT = 0;
    var step = 1000 / PET_FPS;

    function tick(t) {
      petRaf = requestAnimationFrame(tick);
      if (!petPixelParams || !window.SproutsPixel) return;
      if (petPrevT === 0) petPrevT = t;
      var dt = t - petPrevT;
      petPrevT = t;
      petAcc += dt;
      var P = window.SproutsPixel;
      var frames = P.buildPetFrames(petPixelParams);
      while (petAcc >= step) {
        petAcc -= step;
        petFrame = (petFrame + 1) % frames.length;
      }
      P.drawPetFrame(ctx, petPixelParams, petFrame);
    }
    petRaf = requestAnimationFrame(tick);
  }

  function setSproutNameRowVisible(on) {
    const row = document.querySelector(".sprout-name-row");
    if (row) row.classList.toggle("is-visible", !!on);
  }

  function runShopSubtabEffects(sub) {
    if (sub === "care") vscode.postMessage({ type: "loadFood" });
    if (sub === "store") vscode.postMessage({ type: "loadShop" });
    if (sub === "eggs") {
      vscode.postMessage({ type: "loadIncubatorTab" });
      refreshIncubatorEggPick();
      if (incubatorTabCache) renderIncubatorTabPanel(incubatorTabCache);
      startIncubatorTabLoop();
    }
    if (sub === "wardrobe" || sub === "season") {
      renderSeasonPassAndWardrobe();
    }
    if (sub === "wardrobe") {
      startWardrobeTabLoop();
    }
  }

  function applyShopSubtabUi(sub) {
    document.querySelectorAll(".shop-subtab").forEach((b) => {
      b.classList.toggle("active", b.getAttribute("data-shop-tab") === sub);
    });
    document.querySelectorAll(".shop-subpanel").forEach((p) => {
      p.classList.toggle("active", p.getAttribute("data-shop-panel") === sub);
    });
    runShopSubtabEffects(sub);
  }

  /**
   * @param {string} rawName Top-level tab id, or legacy id (feed, incubator, …) mapped into Shop.
   * @param {{ shopSub?: string }} [opt] When rawName is "shop", pick section (default last or care).
   */
  function setTab(rawName, opt) {
    opt = opt || {};
    var main = rawName;
    var shopSub = opt.shopSub;

    if (LEGACY_TAB_TO_SHOP[rawName] !== undefined) {
      main = "shop";
      shopSub = LEGACY_TAB_TO_SHOP[rawName];
    } else if (main === "shop") {
      shopSub = shopSub || lastShopSubtab || "care";
    }

    if (main === "shop" && shopSub) {
      lastShopSubtab = shopSub;
    }

    if (main !== "shop" || shopSub !== "eggs") stopIncubatorTabLoop();
    if (main !== "shop" || shopSub !== "wardrobe") stopWardrobeTabLoop();

    var tablist = document.getElementById("mainTablist");
    if (tablist) {
      tablist.querySelectorAll(".tab").forEach((b) => {
        b.classList.toggle("active", b.getAttribute("data-tab") === main);
      });
    }
    document.querySelectorAll(".panel").forEach((p) => p.classList.remove("active"));
    var pid = PANEL_BY_TAB[main];
    var panel = pid ? document.getElementById(pid) : null;
    if (panel) panel.classList.add("active");

    if (main === "shop" && shopSub) {
      applyShopSubtabUi(shopSub);
    }
  }

  /** Sprout tab → Incubator lab (preview + attach). */
  function goToIncubatorTab() {
    setTab("incubator");
  }

  var mainTablistEl = document.getElementById("mainTablist");
  if (mainTablistEl) {
    mainTablistEl.querySelectorAll(".tab").forEach((b) => {
      b.addEventListener("click", () => {
        var t = b.getAttribute("data-tab");
        if (t === "shop") {
          setTab("shop", { shopSub: lastShopSubtab || "care" });
        } else {
          setTab(t);
        }
      });
    });
  }

  document.querySelectorAll(".shop-subtab").forEach((btn) => {
    btn.addEventListener("click", () => {
      var sub = btn.getAttribute("data-shop-tab");
      if (sub) setTab("shop", { shopSub: sub });
    });
  });

  function pickSprout(sp) {
    state.sproutId = sp.id;
    const gs = String(sp.growthStage || "");
    state.isEgg = gs === "Egg";
    state.attachedIncubatorId =
      sp.incubator && sp.incubator.id ? String(sp.incubator.id) : null;
    const rare = sp.rarity ? String(sp.rarity) : "";
    const spec = sp.species ? String(sp.species) : "—";
    document.getElementById("name").textContent = sp.name || "Sprout";
    const moodLine = document.getElementById("sproutMoodLine");
    if (moodLine) {
      const m = sp.isDead ? "dead" : sp.mood != null ? String(sp.mood) : "—";
      moodLine.textContent = "Mood: " + m + (rare ? " · " + rare : "");
      moodLine.style.display = "block";
    }
    const nameInput = document.getElementById("sproutNameInput");
    if (nameInput) nameInput.value = sp.name || "";

    const rs = sp.restScore != null ? Number(sp.restScore) : null;
    const ws = sp.waterScore != null ? Number(sp.waterScore) : null;
    const fs = sp.foodScore != null ? Number(sp.foodScore) : null;
    const hp = sp.healthPoints != null ? Number(sp.healthPoints) : null;

    petPixelParams = sproutToPetPixelParams(sp);

    const grade = sp.grade ? String(sp.grade) : "";
    const mid = gs === "Sprout" ? spec : gs || "—";
    document.getElementById("statDetail").textContent =
      "Lv " +
      (sp.level != null ? sp.level : "—") +
      " · " +
      mid +
      (grade ? " · " + grade : "") +
      (rare ? " · " + rare : "");

    const reviveWrap = document.getElementById("vitalsReviveWrap");
    const reviveStatus = document.getElementById("vitalsReviveStatus");
    const reviveBtn = document.getElementById("btnReviveSprout");
    if (reviveWrap) reviveWrap.hidden = !sp.isDead;
    if (reviveStatus) reviveStatus.textContent = "";
    if (reviveBtn) {
      if (sp.isDead) {
        const bal = state.feedBalance;
        reviveBtn.disabled = bal != null && bal < REVIVE_COST;
        reviveBtn.textContent =
          bal != null && bal < REVIVE_COST
            ? "Revive (need " + REVIVE_COST + " Feed)"
            : "Revive (" + REVIVE_COST + " Feed)";
      } else {
        reviveBtn.disabled = false;
      }
    }
    if (sp.isDead) vscode.postMessage({ type: "loadFood" });

    updateFeedCareHint();
    setVitalBar("barRest", "pctRest", rs);
    setVitalBar("barWater", "pctWater", ws);
    setVitalBar("barFood", "pctFood", fs);
    setVitalBar("barHealth", "pctHealth", hp);
    const hatchPanel = document.getElementById("hatchPanel");
    if (hatchPanel) {
      hatchPanel.style.display = gs === "Egg" ? "block" : "none";
    }
    updateCarousel(sp);
    updateSproutNameHint(sp);
    updateStatDetailVisibility();
    renderSproutIdentityPanel(sp);
    renderAttributesPanel(sp);
    syncViewport();
    renderShareStrip();
    if (ideProfileCache) renderAccountStrip(ideProfileCache);
    if (isWardrobePanelActive()) startWardrobeTabLoop();
    if (isArenaMovesSubtabActive()) requestArenaLoadout();
  }

  function applyCompact(c) {
    document.body.classList.toggle("compact", !!c);
  }

  window.addEventListener("message", (e) => {
    const m = e.data;
    if (m.type === "requestDevGitSync") {
      vscode.postMessage({ type: "syncDevGitBonus" });
      return;
    }
    if (m.type === "navigateTab" && typeof m.tab === "string") {
      setTab(m.tab);
      return;
    }
    if (m.type === "state") {
      state.token = m.token;
      if (!m.token) state.feedBalance = null;
      state.apiUrl = m.apiUrl || "";
      state.apiProbeOk = m.apiProbeOk;
      state.apiProbeHint = m.apiProbeHint || "";
      state.apiUrlUserOverride = !!m.apiUrlUserOverride;
      state.homeConfigApiUrl = m.homeConfigApiUrl || "";
      state.githubAppInstallUrl =
        typeof m.githubAppInstallUrl === "string" && m.githubAppInstallUrl.trim()
          ? m.githubAppInstallUrl.trim()
          : "";
      applyCompact(m.compact);
      renderApiMetaLine();
      updateAuthBar();
      updateGithubAppInstallButton();
    }
    if (m.type === "sproutLevelUpPreviewResult") {
      const hint = document.getElementById("sproutLevelUpHint");
      const btn = document.getElementById("btnSproutLevelUp");
      if (m.error) {
        lastLevelUpPreview = null;
        if (hint) hint.textContent = m.error;
        if (btn) btn.disabled = true;
        return;
      }
      if (
        m.sproutId &&
        typeof m.feedCost === "number" &&
        typeof m.userXpCost === "number"
      ) {
        lastLevelUpPreview = {
          sproutId: m.sproutId,
          feedCost: m.feedCost,
          userXpCost: m.userXpCost,
        };
        applyLevelUpAffordability();
      }
    }
    if (m.type === "purchaseSproutLevelUpResult") {
      const st = document.getElementById("sproutLevelUpStatus");
      if (m.error) {
        if (st) {
          st.classList.add("err");
          st.textContent = m.error;
        }
        return;
      }
      if (m.ok && m.sprout && typeof m.sprout.id === "string") {
        if (typeof m.foodBalance === "number") state.feedBalance = m.foodBalance;
        if (ideProfileCache && typeof m.userExperience === "number") {
          ideProfileCache.experience = m.userExperience;
        }
        const idx = sproutList.findIndex((x) => x.id === m.sprout.id);
        if (idx >= 0) {
          sproutList[idx] = Object.assign({}, sproutList[idx], m.sprout);
          const sel = document.getElementById("sproutPick");
          const opt = sel && Array.from(sel.options).find((o) => o.value === m.sprout.id);
          if (opt) {
            const s = sproutList[idx];
            opt.textContent =
              (s.name || "Sprout") +
              (s.rarity ? " · " + s.rarity : "") +
              " · Lv " +
              (s.level || 1);
          }
          if (state.sproutId === m.sprout.id) pickSprout(sproutList[idx]);
        }
        renderAccountStrip(ideProfileCache);
        lastLevelUpPreview = null;
        const spNow = sproutList.find((x) => x.id === state.sproutId);
        if (spNow) refreshSproutLevelUpOffer(spNow);
        if (st) {
          st.classList.remove("err");
          st.textContent = "Leveled up!";
        }
        const foodBalEl = document.getElementById("foodBal");
        if (foodBalEl && typeof m.foodBalance === "number") {
          foodBalEl.textContent = "Feed balance: " + m.foodBalance;
        }
      }
    }
    if (m.type === "ideProfile") {
      ideProfileCache = m.profile && typeof m.profile === "object" ? m.profile : null;
      renderAccountStrip(ideProfileCache);
      applyLevelUpAffordability();
      updateBrandHeader();
      updateGithubAppInstallButton();
      renderSeasonPassAndWardrobe();
      renderStoreSeasonPassCard();
      renderShareStrip();
    }
    if (m.type === "linkGithubInstallationResult") {
      var gs = document.getElementById("githubLinkStatus");
      if (gs) {
        gs.textContent = m.ok
          ? "Linked installation " +
            (m.installationId != null ? String(m.installationId) : "") +
            (m.accountLogin ? " (@" + m.accountLogin + ")" : "") +
            "."
          : m.error || "Link failed.";
        gs.classList.toggle("github-link-card__status--err", !m.ok);
      }
    }
    if (m.type === "devActivityToast" && m.message) {
      const st = document.getElementById("status");
      if (st) {
        st.dataset.wasErr = st.classList.contains("err") ? "1" : "";
        st.classList.remove("err");
        st.style.color = "var(--vscode-descriptionForeground)";
        st.textContent = m.message;
        window.setTimeout(() => {
          st.textContent = "";
          st.style.color = "";
          if (st.dataset.wasErr === "1") st.classList.add("err");
          delete st.dataset.wasErr;
        }, 5000);
      }
    }
    if (m.type === "sprouts") {
      document.getElementById("status").textContent = m.error || "";
      if (m.error) {
        ideProfileCache = null;
        renderAccountStrip(null);
        updateBrandHeader();
        updateGithubAppInstallButton();
        renderSeasonPassAndWardrobe();
        renderShareStrip();
      }
      const sel = document.getElementById("sproutPick");
      sproutList = m.sprouts || [];
      sel.innerHTML = "";
      if (!state.token) {
        petPixelParams = null;
        sel.classList.remove("is-visible");
        setSproutNameRowVisible(false);
        const ml = document.getElementById("sproutMoodLine");
        if (ml) {
          ml.textContent = "";
          ml.style.display = "none";
        }
        const rw = document.getElementById("vitalsReviveWrap");
        if (rw) rw.hidden = true;
        document.getElementById("name").textContent =
          "Use Sign in above (or Command Palette: Sprouts: Sign in). CLI: npx sprouts-cli login";
        document.getElementById("statDetail").textContent = "";
        resetSproutNameHintDefault();
        setVitalBar("barRest", "pctRest", 0);
        setVitalBar("barWater", "pctWater", 0);
        setVitalBar("barFood", "pctFood", 0);
        setVitalBar("barHealth", "pctHealth", 0);
        syncViewport();
        updateFeedCareHint();
        refreshCompanionChrome();
        refreshIncubatorEggPick();
        renderShareStrip();
        return;
      }
      if (sproutList.length === 0) {
        petPixelParams = null;
        sel.classList.remove("is-visible");
        setSproutNameRowVisible(false);
        const ml0 = document.getElementById("sproutMoodLine");
        if (ml0) {
          ml0.textContent = "";
          ml0.style.display = "none";
        }
        const rw0 = document.getElementById("vitalsReviveWrap");
        if (rw0) rw0.hidden = true;
        document.getElementById("name").textContent =
          "No Sprouts yet — open Shop → Pass to buy an egg (Stripe), or sign in with a pairing code so we create a starter egg.";
        document.getElementById("statDetail").textContent = "";
        resetSproutNameHintDefault();
        setVitalBar("barRest", "pctRest", 0);
        setVitalBar("barWater", "pctWater", 0);
        setVitalBar("barFood", "pctFood", 0);
        setVitalBar("barHealth", "pctHealth", 0);
        syncViewport();
        updateFeedCareHint();
        refreshCompanionChrome();
        refreshIncubatorEggPick();
        renderShareStrip();
        return;
      }
      sel.classList.add("is-visible");
      setSproutNameRowVisible(true);
      const keepId = state.sproutId;
      sproutList.forEach((sp) => {
        const o = document.createElement("option");
        o.value = sp.id;
        o.textContent =
          (sp.name || "Sprout") +
          (sp.rarity ? " · " + sp.rarity : "") +
          " · Lv " +
          (sp.level || 1);
        sel.appendChild(o);
      });
      const chosen =
        (keepId && sproutList.find((x) => x.id === keepId)) || sproutList[0];
      if (chosen) {
        sel.value = chosen.id;
        pickSprout(chosen);
      }
      updateFeedCareHint();
      refreshCompanionChrome();
      refreshIncubatorEggPick();
      if (incubatorTabCache && isIncubatorPanelActive()) renderIncubatorTabPanel(incubatorTabCache);
    }
    if (m.type === "incubatorTab") {
      incubatorTabCache = {
        error: m.error,
        incubatorCatalog: m.incubatorCatalog || [],
        userIncubators: m.userIncubators || [],
      };
      if (isIncubatorPanelActive()) {
        refreshIncubatorEggPick();
        renderIncubatorTabPanel(incubatorTabCache);
      }
    }
    if (m.type === "food") {
      const bal = document.getElementById("foodBal");
      const apiErr = document.getElementById("feedApiErr");
      if (m.error) {
        state.feedBalance = null;
        if (bal) bal.textContent = "Feed balance: —";
        if (apiErr) {
          apiErr.style.display = "block";
          apiErr.textContent = m.error;
        }
      } else {
        if (apiErr) {
          apiErr.style.display = "none";
          apiErr.textContent = "";
        }
        const n = m.foodBalance ?? 0;
        state.feedBalance = n;
        if (bal) bal.textContent = "Feed balance: " + n;
        updateFeedCareHint();
        applyLevelUpAffordability();
        const cur = sproutList.find((x) => x.id === state.sproutId);
        if (cur && cur.isDead) pickSprout(cur);
      }
    }
    if (m.type === "reviveResult") {
      const st = document.getElementById("vitalsReviveStatus");
      if (m.error) {
        if (st) {
          st.textContent = m.error;
          st.classList.add("feed-toast--err");
        }
      } else {
        if (st) {
          st.textContent = m.message || "Revived!";
          st.classList.remove("feed-toast--err");
        }
        state.feedBalance =
          m.newFeedBalance != null ? Number(m.newFeedBalance) : state.feedBalance;
        const balEl = document.getElementById("foodBal");
        if (balEl && m.newFeedBalance != null)
          balEl.textContent = "Feed balance: " + m.newFeedBalance;
        if (m.sprout && m.sprout.id) {
          const idx = sproutList.findIndex((x) => x.id === m.sprout.id);
          if (idx >= 0) {
            sproutList[idx] = Object.assign({}, sproutList[idx], m.sprout);
            pickSprout(sproutList[idx]);
          }
        }
      }
    }
    if (m.type === "feedResult") {
      const fe = document.getElementById("feedStatus");
      if (!fe) return;
      if (m.error) {
        fe.textContent = m.error;
        fe.classList.add("feed-toast--err");
      } else {
        fe.classList.remove("feed-toast--err");
        fe.textContent = m.message || "Fed!";
        if (m.foodBalance != null) {
          state.feedBalance = Number(m.foodBalance);
          const bal = document.getElementById("foodBal");
          if (bal) bal.textContent = "Feed balance: " + m.foodBalance;
          applyLevelUpAffordability();
        }
        if (m.sprout) {
          const id = m.sprout.id;
          if (id) {
            const ix = sproutList.findIndex((x) => x.id === id);
            if (ix >= 0) sproutList[ix] = Object.assign({}, sproutList[ix], m.sprout);
            pickSprout(ix >= 0 ? sproutList[ix] : m.sprout);
          } else pickSprout(m.sprout);
        }
      }
    }
    if (m.type === "shop") {
      shopSeasonCache = {
        error: m.error || null,
        stripeConfigured: m.stripeConfigured === true,
        seasonPass: m.seasonPass && typeof m.seasonPass === "object" ? m.seasonPass : null,
      };
      var errEl = document.getElementById("shopErr");
      if (errEl) errEl.textContent = m.error || "";
      applySeasonUpsellPricing();
      renderStoreSeasonPassCard();
      renderSeasonPassAndWardrobe();
    }
    if (m.type === "windowFocused") {
      if (state.token) vscode.postMessage({ type: "loadFood" });
    }
    if (m.type === "ideProgress") {
      const pet = document.querySelector(".pet");
      if (pet) {
        pet.classList.remove("pet--celebrate");
        void pet.offsetWidth;
        pet.classList.add("pet--celebrate");
        window.setTimeout(() => pet.classList.remove("pet--celebrate"), 800);
      }
    }
    if (m.type === "hatchResult") {
      const overlay = document.getElementById("hatchOverlay");
      const eggEl = document.getElementById("hatchOverlayEgg");
      const msgEl = document.getElementById("hatchOverlayMsg");
      if (m.error) {
        if (overlay) overlay.classList.remove("is-open", "hatch-overlay--pop");
        if (eggEl) eggEl.textContent = "🥚";
        if (msgEl) msgEl.textContent = "Something wonderful is happening…";
        const st = document.getElementById("status");
        if (st) st.textContent = m.error;
        return;
      }
      if (m.ok && m.sprout) {
        if (overlay && eggEl && msgEl) {
          eggEl.textContent = "✨";
          msgEl.textContent = "Welcome to the world!";
          overlay.classList.add("is-open", "hatch-overlay--pop");
          setTimeout(() => {
            overlay.classList.remove("is-open", "hatch-overlay--pop");
            eggEl.textContent = "🥚";
            msgEl.textContent = "Something wonderful is happening…";
          }, 2200);
        }
        pickSprout(m.sprout);
      }
    }
    if (m.type === "purchaseIncubatorResult") {
      const incSta = document.getElementById("incubatorShopStatus");
      const tabSta = document.getElementById("incubatorTabStatus");
      if (m.error) {
        if (incSta) {
          incSta.textContent = m.error;
          incSta.classList.add("feed-toast--err");
        }
        if (tabSta) {
          tabSta.textContent = m.error;
          tabSta.classList.add("feed-toast--err");
        }
        return;
      }
      if (incSta) {
        incSta.classList.remove("feed-toast--err");
        incSta.textContent = "Purchased. Feed balance updated.";
      }
      if (tabSta) {
        tabSta.classList.remove("feed-toast--err");
        tabSta.textContent = "Purchased. Feed balance updated.";
      }
      vscode.postMessage({ type: "loadShop" });
      vscode.postMessage({ type: "loadIncubatorTab" });
      vscode.postMessage({ type: "loadFood" });
    }
    if (m.type === "attachIncubatorResult" || m.type === "detachIncubatorResult") {
      const incSta = document.getElementById("incubatorShopStatus");
      const tabSta = document.getElementById("incubatorTabStatus");
      if (m.error) {
        if (incSta) {
          incSta.textContent = m.error;
          incSta.classList.add("feed-toast--err");
        }
        if (tabSta) {
          tabSta.textContent = m.error;
          tabSta.classList.add("feed-toast--err");
        }
        return;
      }
      if (incSta) {
        incSta.classList.remove("feed-toast--err");
        incSta.textContent = m.ok ? "Updated." : "";
      }
      if (tabSta) {
        tabSta.classList.remove("feed-toast--err");
        tabSta.textContent = m.ok ? "Updated." : "";
      }
      if (m.sprout) {
        const idx = sproutList.findIndex((x) => x.id === m.sprout.id);
        if (idx >= 0) sproutList[idx] = Object.assign({}, sproutList[idx], m.sprout);
        if (idx >= 0) pickSprout(sproutList[idx]);
        else pickSprout(m.sprout);
        refreshIncubatorEggPick();
      }
      vscode.postMessage({ type: "loadShop" });
      vscode.postMessage({ type: "loadIncubatorTab" });
    }
    if (m.type === "updateCheckResult") {
      const b = document.getElementById("updateBanner");
      if (!b) return;
      if (m.error) {
        b.textContent =
          "Could not check updates (offline or blocked). Try again later or install a .vsix manually.";
        return;
      }
      const src = m.source === "openvsx" ? "Open VS X" : "GitHub";
      if (m.newer) {
        b.innerHTML =
          "Update available: v" +
          m.latest +
          " (via " +
          src +
          ') — <a href="#" id="openRelLink">Open page</a> or Install from VSIX.';
        const a = document.getElementById("openRelLink");
        if (a) {
          a.addEventListener("click", (ev) => {
            ev.preventDefault();
            vscode.postMessage({ type: "openExternal", url: m.url || "" });
          });
        }
      } else {
        b.textContent = "Up to date (v" + (m.current || "?") + ", checked " + src + ").";
      }
    }
    if (m.type === "renameResult") {
      const st = document.getElementById("status");
      if (m.error) {
        if (st) {
          st.classList.add("err");
          st.textContent = m.error;
        }
        return;
      }
      if (m.ok && m.sprout && typeof m.sprout.id === "string") {
        const idx = sproutList.findIndex((x) => x.id === m.sprout.id);
        if (idx >= 0) {
          sproutList[idx] = Object.assign({}, sproutList[idx], m.sprout);
          const sel = document.getElementById("sproutPick");
          const opt = sel && Array.from(sel.options).find((o) => o.value === m.sprout.id);
          if (opt) {
            const s = sproutList[idx];
            opt.textContent =
              (s.name || "Sprout") +
              (s.rarity ? " · " + s.rarity : "") +
              " · Lv " +
              (s.level || 1);
          }
          if (state.sproutId === m.sprout.id) pickSprout(sproutList[idx]);
        }
        if (st) {
          st.classList.remove("err");
          st.textContent = "Name saved.";
        }
      }
    }
    if (m.type === "allocateAttributeResult") {
      const st = document.getElementById("status");
      if (m.error) {
        if (st) {
          st.classList.add("err");
          st.textContent = m.error;
        }
        return;
      }
      if (m.ok && m.sprout && typeof m.sprout.id === "string") {
        const idx = sproutList.findIndex((x) => x.id === m.sprout.id);
        if (idx >= 0) {
          sproutList[idx] = Object.assign({}, sproutList[idx], m.sprout);
          if (state.sproutId === m.sprout.id) pickSprout(sproutList[idx]);
        }
        if (st) {
          st.classList.remove("err");
          st.textContent = "";
        }
      }
    }
    if (m.type === "arenaLoadoutData") {
      if (typeof m.foodBalance === "number") state.feedBalance = m.foodBalance;
      renderArenaMovesPanel(m);
      const st = document.getElementById("status");
      if (st) {
        st.classList.remove("err");
        st.textContent = "";
      }
    }
    if (m.type === "arenaLoadoutError") {
      const body = document.getElementById("arenaMovesPanelBody");
      if (body) {
        body.innerHTML =
          "<p class='hint err'>" + escapeHtml(m.error || "Could not load moves.") + "</p>";
      }
    }
  });

  document.getElementById("sproutPick").addEventListener("change", (ev) => {
    const id = ev.target.value;
    const sp = sproutList.find((x) => x.id === id);
    if (sp) pickSprout(sp);
  });

  const btnSaveName = document.getElementById("btnSaveName");
  if (btnSaveName) {
    btnSaveName.addEventListener("click", () => {
      const inp = document.getElementById("sproutNameInput");
      const name = inp && inp.value ? String(inp.value).trim() : "";
      const st = document.getElementById("status");
      if (!state.sproutId) {
        if (st) st.textContent = "Pick a sprout first.";
        return;
      }
      if (name.length < 1 || name.length > 48) {
        if (st) st.textContent = "Name must be 1–48 characters.";
        return;
      }
      if (st) {
        st.classList.remove("err");
        st.textContent = "";
      }
      vscode.postMessage({ type: "renameSprout", sproutId: state.sproutId, name: name });
    });
  }

  const btnReviveSprout = document.getElementById("btnReviveSprout");
  if (btnReviveSprout) {
    btnReviveSprout.addEventListener("click", () => {
      const st = document.getElementById("vitalsReviveStatus");
      if (!state.sproutId) {
        if (st) st.textContent = "Pick a sprout first.";
        return;
      }
      if (st) {
        st.textContent = "";
        st.classList.remove("feed-toast--err");
      }
      vscode.postMessage({
        type: "reviveSprout",
        sproutId: state.sproutId,
        cost: REVIVE_COST,
      });
    });
  }

  const btnSproutLevelUp = document.getElementById("btnSproutLevelUp");
  if (btnSproutLevelUp) {
    btnSproutLevelUp.addEventListener("click", () => {
      const st = document.getElementById("sproutLevelUpStatus");
      if (!state.sproutId) {
        if (st) st.textContent = "Pick a sprout first.";
        return;
      }
      if (st) {
        st.textContent = "";
        st.classList.remove("err");
      }
      vscode.postMessage({
        type: "purchaseSproutLevelUp",
        sproutId: state.sproutId,
      });
    });
  }

  const btnOpenChat = document.getElementById("btnOpenChat");
  if (btnOpenChat) {
    btnOpenChat.addEventListener("click", () => {
      vscode.postMessage({ type: "openCursorChat" });
    });
  }
  const btnOpenVsx = document.getElementById("btnOpenVsx");
  if (btnOpenVsx) {
    btnOpenVsx.addEventListener("click", () => {
      vscode.postMessage({
        type: "openExternal",
        url: "https://open-vsx.org/extension/sprouts/sprouts-companion",
      });
    });
  }

  document.querySelectorAll(".feed-actions button[data-feed]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const st = document.getElementById("feedStatus");
      if (!st) return;
      st.textContent = "";
      st.classList.remove("feed-toast--err");
      if (!state.sproutId) {
        st.textContent = "Pick a sprout on the Sprout tab.";
        st.classList.add("feed-toast--err");
        return;
      }
      vscode.postMessage({
        type: "feedStat",
        sproutId: state.sproutId,
        statType: btn.getAttribute("data-feed"),
        amount: 10,
      });
    });
  });

  const btnIncubateEgg = document.getElementById("btnIncubateEgg");
  if (btnIncubateEgg) {
    btnIncubateEgg.addEventListener("click", () => goToIncubatorTab());
  }

  document.getElementById("btnSetup").addEventListener("click", () => {
    vscode.postMessage({ type: "setupCursor" });
  });
  const btnSetupFromCallout = document.getElementById("btnSetupFromCallout");
  if (btnSetupFromCallout) {
    btnSetupFromCallout.addEventListener("click", () => {
      vscode.postMessage({ type: "setupCursor" });
    });
  }

  const btnBuySeasonPassSeasonTab = document.getElementById("btnBuySeasonPassSeasonTab");
  if (btnBuySeasonPassSeasonTab) {
    btnBuySeasonPassSeasonTab.addEventListener("click", () => {
      vscode.postMessage({ type: "checkoutSeasonPass" });
    });
  }

  function runUpdateCheck() {
    const b = document.getElementById("updateBanner");
    if (b) b.textContent = "Checking…";
    vscode.postMessage({ type: "checkUpdates" });
  }
  const btnCompanionSignIn = document.getElementById("btnCompanionSignIn");
  const btnCompanionSignOut = document.getElementById("btnCompanionSignOut");
  if (btnCompanionSignIn) {
    btnCompanionSignIn.addEventListener("click", () => {
      vscode.postMessage({ type: "companionSignIn" });
    });
  }
  if (btnCompanionSignOut) {
    btnCompanionSignOut.addEventListener("click", () => {
      vscode.postMessage({ type: "companionSignOut" });
    });
  }
  updateAuthBar();

  const btnUpdatesFromSettings = document.getElementById("btnUpdatesFromSettings");
  if (btnUpdatesFromSettings) btnUpdatesFromSettings.addEventListener("click", runUpdateCheck);
  const btnOpenFromSettings = document.getElementById("btnOpenFromSettings");
  if (btnOpenFromSettings)
    btnOpenFromSettings.addEventListener("click", () => vscode.postMessage({ type: "openCursorChat" }));
  const btnOpenArenaFromSettings = document.getElementById("btnOpenArenaFromSettings");
  if (btnOpenArenaFromSettings)
    btnOpenArenaFromSettings.addEventListener("click", () =>
      vscode.postMessage({ type: "openArena" })
    );
  const btnOpenArenaFromTab = document.getElementById("btnOpenArenaFromTab");
  if (btnOpenArenaFromTab)
    btnOpenArenaFromTab.addEventListener("click", () => vscode.postMessage({ type: "openArena" }));

  const btnInstallGithubApp = document.getElementById("btnInstallGithubApp");
  if (btnInstallGithubApp) {
    btnInstallGithubApp.addEventListener("click", () => {
      const u = btnInstallGithubApp.dataset.installUrl;
      if (u) vscode.postMessage({ type: "openExternal", url: u });
    });
  }

  const btnGithubLink = document.getElementById("btnGithubLink");
  const githubInstallationId = document.getElementById("githubInstallationId");
  if (btnGithubLink && githubInstallationId) {
    btnGithubLink.addEventListener("click", () => {
      const gs = document.getElementById("githubLinkStatus");
      if (gs) {
        gs.textContent = "";
        gs.classList.remove("github-link-card__status--err");
      }
      vscode.postMessage({
        type: "linkGithubInstallation",
        installationId: githubInstallationId.value.trim(),
      });
    });
  }

  document.querySelectorAll(".companion-subtab").forEach((b) => {
    b.addEventListener("click", () => setCompanionSubtab(b.getAttribute("data-subtab")));
  });
  setCompanionSubtab("vitals");

  const btnSproutPrev = document.getElementById("btnSproutPrev");
  const btnSproutNext = document.getElementById("btnSproutNext");
  if (btnSproutPrev) btnSproutPrev.addEventListener("click", () => shiftSprout(-1));
  if (btnSproutNext) btnSproutNext.addEventListener("click", () => shiftSprout(1));

  const attrBuildStats = document.getElementById("attrBuildStats");
  if (attrBuildStats) {
    attrBuildStats.addEventListener("click", function (e) {
      const btn = e.target && e.target.closest && e.target.closest("[data-allocate-stat]");
      if (!btn || btn.disabled) return;
      const stat = btn.getAttribute("data-allocate-stat");
      if (!state.sproutId || !stat) return;
      vscode.postMessage({
        type: "allocateAttribute",
        sproutId: state.sproutId,
        stat: stat,
      });
    });
  }

  updateGithubAppInstallButton();

  vscode.postMessage({ type: "ready" });
})();
