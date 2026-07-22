import React, { useState, useRef, useEffect, useCallback } from "react";

/* =====================================================================
   ALDERBROOK v6 (Stage 2.3 WIP: the justice overhaul) — on top of the
   Stage 1 map rollout (three towns ~2x area, each a real municipality:
   hall, Watch presence, clinic access, eateries, graveyard; Hearth & Holt
   in Mossford, Mayor Vance in Stonecross) v6 now carries:
   - Stage 2:   occupations — 5 skill tracks, completeTask pay pipe,
                Claude-run interviews, NPC job market with title ladders,
                promotions, and the 15-min player headstart.
   - Stage 2.1: NPC self-care — mild-sick self-cure/clinic trips, pantry
                buffers, demand-driven restocking.
   - Stage 2.2: all-town exempt pulse (owners + authority) and genuine
                skillCheck adjudication (printer / at-scene medical /
                investigation) with canAttempt/recordFail brakes.
   - Stage 2.3: justice overhaul — witnessed/attributable murder → 5-star
                life sentence, real holding cells in every town lockup,
                assignCell overflow, the prison-break loop, and the new
                cast: Dr. Reyes, Dr. Noor, enforcer Briar.
   - Stage 3.7: the owner economy — every shop/eatery owner runs a MENU drawn
                from a candidate pool (eateries get the cooked catalogue, plain
                stores get 2 baked goods max), sets their own sell prices via a
                rare per-owner AI call (free to 2x base allowed, nudged to
                base+-1), and revises up to 2 items on day 7 then every 14 days
                (swapped-in items start at 0 stock). Delivery gains a per-item
                surcharge above 5c base (+1c per 2c over). All buy/sell/display
                routes through priceOf().
   - Stage 3.6: the kitchen opens — sugar/milk/fruit, a dozen new recipes
                (dough, fresh bread, cookies, salad, candy apple, fish sticks,
                noodles), five HARD recipes gated by an oven-knob temperature
                set + a Cooking skill check (cake, pie, taco, sushi, croissant),
                spacebar as the timing button in Computer mode, and a hospital
                that actually feeds you. Eatery pantries no longer cold-start
                a famine in unstaffed towns.
   - Stage 3.5: survival + justice realism — night sync (fastForwardNight),
                staff couches, thirst/hunger/sickness damage with grace
                windows, dying = crawling (no doors), non-pausing REAL jail
                for the player, conviction-at-contact justice, steal
                two-tap, crime/arrest FX, and Sable the career criminal.
   - Stage 3:   the cost of living — business bills on a 3-day cycle,
                weekly rent with eviction, bench-sleeping + vagrancy through
                the star ladder, treasury escrow in the hall safes (collection
                live, spending stubbed for Stage 6), civic medicine (doctors
                bill for care, hourly tax stipend, free restock + Pete's
                mileage), and the option to kick Dex to the curb.
   Stages 4-8 are ALL LIVE: furniture + the weekly gross-takings tax,
   registers + upgrades (incl. cabinets speed + truck cheap-drive), the
   civic core (wealth tax, rotating weekly Council Call, treasury-funded
   town upgrades), Claude-planned heists (the Heist Nudge, wealth-
   weighted marks, night-vs-day tradecraft), and mayor approval with
   riots when a town's faith collapses.
   Carried from v5 — quantified stock & supply chains, owner economics,
   sickness & injury, letters, cross-town visits, house parties, and
   Justice 2.0: the star ladder, case investigation, lethal weapons,
   the dying state, murder, bodies, and Watch vehicles.
   (v6 is reserved for the job polish pass — v5 wires economics through
   the existing minigames without re-tuning their feel.)
   ---------------------------------------------------------------------
   API spend per town per day:
   - 1 Daily Pulse (6:00) — plans the day.
   - up to 2 Micro-Nudges (12:00/17:00) — small executed directives.
   - Incident Calls — ONLY when NPCs witness a crime or face a robbery;
     Claude decides their reaction from personality, relations and
     stakes. Event-driven, so they can exceed the daily rhythm on a
     rowdy day; limit or disable them in ⚙️ settings if desired.
   - chat: 1 call per message, with memory/relationship/impression
     piggybacked. All budgets adjustable in the ⚙️ settings panel.
   ===================================================================== */

/* ===== CONFIG ===== */
const CFG = {
  TILE: 32,
  ZOOM: { min: 1, max: 3, step: 0.25 },   // 1 = fit the whole map on screen (the classic view); >1 = a camera that follows you
  MINUTES_PER_SEC: 2.5,
  PLAYER_SPEED: 4.2, NPC_SPEED: 2.0,
  DECAY: { hunger: 5.5, thirst: 7.5, energy: 4.0 },
  HYGIENE: { decay: 2.2, social: 25, npcWashAt: 28, washMin: 10 },  // social: below this, people comment & warmth stalls
  HEALTH: { regenAwake: 1.5, regenSleep: 4, critical: 25 },
  NPC_DECAY_SCALE: 0.85,
  GREET_RADIUS: 2.2, GREET_COOLDOWN: 50, TALK_RADIUS: 1.8,
  BUBBLE_SECONDS: 4.5,
  CHAT_MAX_TOKENS: 340, PULSE_MAX_TOKENS: 900, NUDGE_MAX_TOKENS: 400,
  PULSE_ENABLED: true,
  NUDGE_HOURS: [12, 17],
  /* Stage 6 — ambient life: sprinkled NPC↔NPC chatter + player speech. Kept CHEAP: tiny calls,
     hard per-hour caps, and only fires when there's something notable to say. */
  AMBIENT: {
    maxPerHour: 2,            // town-wide cap on AI-driven exchanges per in-game hour
    chatTokens: 90,           // a two-line exchange
    nearTiles: 3,             // two NPCs must be this close to strike up a chat
    chatChance: 0.15,         // per eligible pairing per check, before the cap
    speechTokens: 80,         // a nearby NPC's reply to the player
    speechReplyTiles: 4,      // how close an NPC must be to hear the player
    speechCooldownMs: 12000,  // real-time throttle on player speech replies
    gossipMax: 6,             // how many news items an NPC carries
    gossipRelStep: 1,         // relationship steps a bad rumor nudges the listener against the subject
  },
  INCIDENT: { tokens: 280 },                       // crime/robbery reaction calls — event-driven, uncapped by default
  CHAT_MEMORY: 6, MAX_MEMORIES: 5,
  NPC_CHAT_INTERVAL: 18,
  START_COINS: 10, START_HOUR: 8,
  /* distance-based fares + travel minutes, symmetric (Mo's route menu) */
  FARES: {
    alderbrook: { mossford: { c: 4, min: 30 }, stonecross: { c: 7, min: 45 }, ferndale: { c: 5, min: 35 } },
    mossford:   { alderbrook: { c: 4, min: 30 }, stonecross: { c: 5, min: 35 }, ferndale: { c: 6, min: 40 } },
    stonecross: { alderbrook: { c: 7, min: 45 }, mossford: { c: 5, min: 35 }, ferndale: { c: 8, min: 50 } },
    ferndale:   { alderbrook: { c: 5, min: 35 }, mossford: { c: 6, min: 40 }, stonecross: { c: 8, min: 50 } },
    outlands: {},   // Mo does NOT drive out there. The shady route is on foot.
    hills: {},      // no bus up the hill either — the walk is the point
  },
  WAGE_PER_HOUR: 2,
  PAY: { office: 5, food: 5, mailPer: 2, mailBonus: 3, dish: 4, restock: 5, clean: 3 },   // balance: menial cluster ~12c/hr
  WORK_COST: {
    office: { min: 40, energy: 8 }, food: { min: 25, energy: 6 }, mail: { energy: 2 },
    dish: { min: 20, energy: 5 }, restock: { energy: 4 }, clean: { energy: 4 },
    fish: { min: 30, energy: 4 }, sweep: { min: 8, energy: 3 }, cook: { min: 15, energy: 3 },   // balance: a cast is a real sit-down
  },
  OFFICE_ROUNDS: 6, DISH_PLATES: 4,
  FISH_PERIOD_MS: 1200, FISH_ZONE: 0.17, FISH_TENSION_MS: 3200,   // tension bar oscillates slower than the hook
  COOK_PERIOD_MS: 1500, COOK_ZONE: 0.15,          // the "don't burn it" window
  MESS: { ambient: 0.8, perOccupant: 2.5, npcSweepAt: 55, npcSweepAmount: 30, npcSweepCooldownH: 2, playerSweep: 30, broomSweep: 25 },
  INN_BED: 5,                                      // rent a bed anywhere but home
  HOSPITAL: { walkIn: 5, walkInHeal: 40, incapBill: 10, reviveBill: 25, bedRegenDoc: 20, bedRegen: 8, dischargeHp: 60, admitNeedFloor: 50 },
  /* ===== Stage 3 — the cost of living ===== */
  BILLS: {                                       // business upkeep, drawn from the OWNER's pocket (debt allowed)
    cycle: 3,                                    // charged every N days (fires on day % cycle === 0)
    kind: { office: 6, eatery: 5, retail: 3 },   // per-cycle rates: electricity bleeds offices, utilities bleed kitchens
    kindOf: { office: "office", cafe: "eatery", fastfood: "eatery", diner: "eatery", inn: "eatery", store_f: "retail", grill_f: "eatery", blackmarket_o: "retail", grill_o: "eatery", market_s: "retail", store_m: "retail", workshop_s: "retail",
              market: "retail", store: "retail", mart: "retail", furn: "retail" },
    // medical buildings pay nothing (civic) — Stage 6 hands the mayor a law that can flip this
  },
  RENT: { amount: 2, weekday: 1, evictAt: 8 },   // weekly on day%7===weekday; 4 missed weeks (-8c) → locked out
  TAX: { weekday: 4, rate: 0.15, min: 1 },       // Stage 4: weekly business tax — 15% of the period's gross takings, min 1c, into the local hall safe
  WEALTH_TAX: { base: 3, per: 2, bracket: 30, floor: 15 },   // Stage 6: adults holding ≥floor pay base + per×⌊coins/bracket⌋ weekly (the hoard drain)
  COUNCIL: { weekday: 0, tokens: 140 },          // Stage 6: weekly Council Call — the mayor reviews a town (rotating) and may fund an upgrade
  HEIST: { everyDays: 4, startDay: 7, tokens: 180, minLoot: 20 },   // Stage 7: planned burglaries — start after week 1 so the job market absorbs newcomers first
  WATCH_PLAN: { weekday: 5, tokens: 200, dwellMin: 300 },
  TRADE: { tokens: 110, noteMax: 120, maxCoins: 30 },   // trade offers: coins/items both ways + an optional favor note
  CRAFT: {   // v7 Stage 5: the workshop. tier: easy (1 drag, 1 button) / medium (2 drags, 2 buttons)
    // / hard (BALANCE pre-stage + 3 drags + 3 buttons). tools = required in inventory. furn = output
    // is furniture, not an item. Craft at the workshop bench, or at home with a Workbench placed.
    recipes: {   // "many different crafts, like a lot" — every recipe is self-craft OR commission
      toy:       { tier: "easy",   mats: { wood: 1 },           tools: ["saw"] },
      frame:     { tier: "easy",   mats: { wood: 1 },           tools: ["saw"] },
      whistle:   { tier: "easy",   mats: { wood: 1 },           tools: ["saw"] },
      club:      { tier: "easy",   mats: { wood: 1 },           tools: ["saw"] },
      broom:     { tier: "easy",   mats: { wood: 1, fiber: 1 }, tools: ["saw"] },
      arrow:     { tier: "easy",   mats: { wood: 1 },           tools: ["saw"], out: 3 },
      bat:       { tier: "easy",   mats: { wood: 2 },           tools: ["saw"] },
      knife:     { tier: "medium", mats: { wood: 1, ore: 1 },   tools: ["saw", "hammer"] },
      hatchet:   { tier: "medium", mats: { wood: 1, ore: 2 },   tools: ["hammer"] },
      slingshot: { tier: "medium", mats: { wood: 1, fiber: 1 }, tools: ["saw"] },
      bolt:      { tier: "medium", mats: { ore: 1 },            tools: ["hammer"], out: 3 },
      birdhouse: { tier: "medium", mats: { wood: 2 },           tools: ["saw", "hammer"] },
      drum:      { tier: "medium", mats: { wood: 1, fiber: 1 }, tools: ["saw", "hammer"] },
      pipe:      { tier: "easy",   mats: { ore: 1 },            tools: ["hammer"] },
      nozzle:    { tier: "medium", mats: { ore: 1, fiber: 1 },  tools: ["screwdriver"] },
      heatcoil:  { tier: "medium", mats: { ore: 2 },            tools: ["hammer", "screwdriver"] },
      bow:       { tier: "hard",   mats: { wood: 2, fiber: 1 }, tools: ["saw", "screwdriver"] },
      hardware:  { tier: "hard",   mats: { ore: 2, fiber: 1 },  tools: ["screwdriver", "hammer"] },
      chair:     { tier: "hard",   mats: { wood: 2, ore: 1 },   tools: ["saw", "hammer", "screwdriver"], furn: true },
    },
    /* the balance scale, graded by tier. easy: ±1 counts. medium: exact, both ends shown.
       hard: LARGER range and you only see the MIN — the max is yours to find. Ranges always
       overlap (mins cap below maxes' floor), so a common middle value ALWAYS exists. */
    balance: {
      easy:   { minLo: 1, minHi: 20, maxLo: 30, maxHi: 40, tol: 1, showMax: true },
      medium: { minLo: 1, minHi: 20, maxLo: 30, maxHi: 40, tol: 0, showMax: true },
      hard:   { minLo: 1, minHi: 15, maxLo: 45, maxHi: 60, tol: 0, showMax: false },
    },
    labor: { easy: 8, medium: 14, hard: 24 },  // commission labor on top of material value
    daysByTier: { easy: 1, medium: 2, hard: 3 },
    letterFee: 2,                              // Garrick posts you a note when it's ready
    smelt: { rocks: 3, fee: 3 },               // the owner turns 3 round rocks into 1 iron bits (fee waived if YOU own it)
    holdMs: 1000,                              // per SCREW — held one at a time, like actually screwing something in
    chopPerTree: 2,                            // GLOBAL daily cap per tree — across everyone
  },
  CHAIR: { perMark: 3, markMin: 12, maxMarks: 5 },   // 3 energy per FULL 12-min mark, an hour tops, REAL time — no skip
  HILLS: { price: 500, trailAlder: { x: 32, y: 1 }, trailHills: { x: 2, y: 9 }, walkMin: 15 },   // the capstone: the house above your first town
  REPAIR: {   // v7 Stage 5c: appliances BREAK — and the mechanic trade is born
    baseChance: 0.02, perUse: 0.01,          // 2% first use, +1% per use — slow, but there are a LOT of appliances
    parts: { wash: "pipe", stove: "heatcoil", grill: "heatcoil", drinks: "nozzle" },   // station kind → the part it takes
    fee: { wash: 18, stove: 24, grill: 24, drinks: 20 },   // paid by the owner — good profit for anyone with the part
    playerMin: 40,                            // the job skips 40 game-min for the player (the rest was the minigame)
    npcMin: 100, npcEnergy: 25,               // NPCs sit on it for a couple of hours — hefty time, hefty energy
  },
  INTERRO_OFFLINE: {                             // the no-API interrogation: tactics, dice, and a detective's nose
    /* Monte-Carlo tuned (6k runs/cell). Charge rates — innocent: 0% clean, ~20% @1 evidence,
       ~73% @3; guilty: ~53% @1, ~96% @3. Truth always confesses guilt and always clears
       innocence. Silence never clears you. Evidence and the detective's skill both bite. */
    base: 30, perEvidence: 10,                   // starting suspicion (0-100); ≥70 at the end = charged
    edgeBase: 30, detSkillW: 6, evidW: 4,        // the bar your nerve roll (d100) must beat
    guiltPenalty: 22, truthSwing: 28,            // guilt shakes the nerve; truth is absolute
    tactics: {                                   // risk = swing on a failed roll, reward = on a clean one
      deny:    { label: "🙅 Flat denial",       risk: 12, reward: -10, blurb: "Say nothing useful. Cheap, but they've heard it." },
      alibi:   { label: "🗺️ Offer an alibi",    risk: 18, reward: -20, blurb: "Name a place and a time. If it holds, it holds." },
      deflect: { label: "🎭 Point elsewhere",   risk: 22, reward: -18, blurb: "Give them a better suspect. Bold. Memorable." },
      silence: { label: "🤐 Say nothing",       risk: 8,  reward: -4,  blurb: "Nothing to catch. Also nothing to clear you." },
      truth:   { label: "🕊️ Tell the truth",    risk: 0,  reward: 0,   blurb: "Whatever that's worth in here." },
    },
  },
  OUTLANDS: {                                    // v7 Stage 4: the lawless frontier
    trailStone: { x: 28, y: 16 }, trailOut: { x: 2, y: 12 },   // the shady route's two ends (Stonecross SE corner ↔ the rotted sign)
    walkMin: 25,                                 // on foot, both ways — Mo won't drive it
    ambushTravel: 0.30, ambushLinger: 0.06,      // jumped on the road / per-hour while hanging around
    wealthDiv: 250,                              // + coins/250 to the roll: fat purses draw eyes
    marketMult: 2,                               // contraband economics: double price, no questions
    stewRisk: 0.15, stewHit: 12, stewHeal: 8,    // the Mystery Stew: usually wonderful
    tradeBase: 14, tradeVar: 12,                 // overnight runners: the camp's only outside income (14-25c/shop/day)
  },  // Pass 3: Cole plans the week's patrol routes for the Juniors (CFG.PATROL is the old cadence key)
  APPROVAL: {                                    // Stage 8: how each town feels about the mayor (0-100)
    start: 65, revertTo: 60, revertStep: 1,      // weekly drift back toward a wary baseline
    taxHit: 2, upgradeBoost: 8, noFundHit: 1,    // taxes sting; visible spending soothes
    crimeHit: 3, deathHit: 4,                    // every opened case / death erodes faith
    riotBelow: 30, riotVent: 12, riotCleanup: 10, riotMess: 25,   // unrest boils over; venting resets some anger
  },
  SHIPPING: {                                    // Pete's truck: 1c per 20 miles out of the Alderbrook depot
    perMileChunk: 20, miles: { alderbrook: 5, mossford: 20, stonecross: 40, ferndale: 30, outlands: 60, hills: 15 },   // frontier freight costs
  },
  MEDICAL: {                                     // Stage 3: civic medicine
    stipendHours: [9, 12, 15, 18],               // the treasury pays each doctor 1c at these hours (if the safe can)
    stipendAmount: 1,
    friendCoverChance: 0.6,                      // odds a solvent friend covers a heavy bill the patient can't
  },
  TREASURY_SEED: 12,                             // each hall safe opens with a float so stipends run pre-first-rent
  /* ===== Stage 3.5 — survival, rest, and the professional ===== */
  STARVE: {                                      // damage is PER REAL SECOND (dt), everyone bleeds the same
    thirstDps: 2,                                // total dehydration kills a healthy adult in under a minute
    hungerDps: 0.5,                              // starvation is slower, but it gets there
    sickEverySec: 10,                            // a BAD illness bites every 10 real seconds...
    // Stage 3.7b: ...but graduated by how sick you already are — full force while strong, easing as
    // you weaken, so illness CAN still kill (no hard floor) yet leaves a real window to reach care.
    sickTierHi: 75, sickTierMid: 50,             // HP thresholds
    sickDmgHi: 3, sickDmgMid: 2, sickDmgLo: 1,   // 3/10s above 75, 2/10s above 50, 1/10s below
    jailNeedFloor: 30,                           // the Watch feeds its prisoners — grim, not lethal
    desperateAt: 10,                             // below this hunger an adult eats on CREDIT rather than starve
    criticalNeed: 15,                            // Stage 3.7b: at/below this, thirst/hunger PREEMPTS all discretionary AI
    graceThirstSec: 30, graceHungerSec: 90,      // real-seconds AT ZERO before damage starts (≈75 / 225 sim-min):
                                                 // dry mouth isn't death — but staying dry is. Fits NPC walk-to-water loops.
  },
  COUCH: { regenPerHr: 25, npcRestAt: 40, npcRestUntil: 70 },   // staff couch: one seat, employees only
  OUTLAW: {                                      // Stage 3.5: the career criminal's dials (see Sable)
    heistChance: 0.035,                          // per-decide roll (doubled at night) — diagnosis: 0.02 = 2 attempts in 9 DAYS
    spreeDays: 2, spreeBoost: 3,                 // post-jailbreak rampage: bolder, ignores the Watch
    jailbreakChance: 0.12,                       // per-day roll for a jailed outlaw
    reformBase: 0.30, reformPer: 0.15,           // released: chance they go straight (grows with stints served)
    watchDeter: 0.65,                            // an officer in town deters MOST attempts — not all (cat needs mice)
    heistCoinCap: 25,                            // flush enough → lie idle, spend, look normal
    layLowHours: 20,                             // how long she stays scarce after skipping town
  },
  RESCUE_WINDOW_MIN: 60,                           // found in time → hospital; not → death
  /* the star ladder — 1: warning/fine · 2: short jail · 3: long jail + debt
     4: attempted murder · 5: murder — life, assets seized, active pursuit */
  WANTED: { arrestAt: 2, finePerLevel: 6, stealFineMult: 3,
    jailHours: { 2: 6, 3: 24, 4: 48 }, debtFine: { 3: 15, 4: 30 } },
  DYING_WINDOW_MIN: 32,            // lethal wounds: found fast, or not at all (32: drag at 12 + cries-carry need real margin under v7 crime volume)
  SICK: { baseHr: 0.0008, lowNeedHr: 0.018, hygieneMult: 3, contam: 0.06,
          burn: 0.35, burnBad: 0.2, mildEnergyMult: 1.5, badHealthHr: 1.5,
          sleepCure: 0.3, medFee: 4 },                     // medFee: doctor's illness visit
  ECON: {                          // owner revenue / worker wage per completed task
    office_sort:  { rev: 7,  wage: 5 },                    // Bruno nets 2 per sort he delegates
    office_print: { rev: 12, wage: 9 },                    // the hard task tops the office ladder (balance)
    chef:         { rev: 0,  wage: 4 },                    // owner profits later via meal sales
    workTickMin: 45,               // NPC staff complete one abstract task per tick
  },
  STOCK: { seed: [4, 8], low: 2, orderQty: 6, cookBatch: 3, maxMeal: 10,
           files: 10, printAt: 6, printBatch: 8, meds: 6, bandages: 8, wholesale: 0.5,
           drinkNerf: 2 },   // Stage 3.8: non-café shops restock DRINKS at orderQty−this (water exempt, cafés exempt)
  DELIVERY: { feeSame: 2, feeCrossBase: 2 },               // cross-town fee = fare + base
  /* ===== Stage 3.7 — the owner economy ===== */
  /* Stage 4 — furniture economy + home burglary */
  /* Stage 5 — cash registers & business upgrades */
  /* Stage 5 — dirty dishes: eateries generate dishes as meals are served; a cluttered kitchen
     can't plate fresh food until someone washes down the pile. NPCs wash too. Soap = wash more. */
  DISHES: { perMeal: 1, stallAt: 12, washBase: 4, soapMult: 1.5, npcWashAt: 8 },
  /* Stage 5 — per-business UPGRADES (register-gated, paid from the till). effect keys read by systems. */
  UPGRADES: {
    restock:  { name: "Bulk Restock Deal", emoji: "📦", cost: 40, for: ["shop", "eatery"], effect: "restock +50% per order" },
    oven:     { name: "Quality Oven",      emoji: "🔥", cost: 55, for: ["eatery"], effect: "chef task faster" },
    soap:     { name: "Dish Soap",         emoji: "🧼", cost: 25, for: ["eatery"], effect: "wash more dishes per scrub" },
    drinkbar: { name: "Pro Drink Station", emoji: "🍹", cost: 48, for: ["cafe_s"], effect: "barista shift faster" },
    paper:    { name: "Extra Paper Trays", emoji: "🖨️", cost: 35, for: ["office"], effect: "printer makes more files" },
    cabinets: { name: "Sorting Cabinets",  emoji: "🗄️", cost: 45, for: ["office"], effect: "NPC sorting faster" },
    carts:    { name: "Walking Carts",     emoji: "🛒", cost: 40, for: ["post"], effect: "+1 parcel per courier" },
    routes:   { name: "Extended Routes",   emoji: "🗺️", cost: 70, for: ["post"], effect: "serve other towns; mail pay doubled" },
    truck:    { name: "Delivery Truck",    emoji: "🚚", cost: 150, for: ["post"], effect: "drive cross-town cheaply" },
  },
  REGISTER: {
    unlockCost: 30, lightCost: 75, highCost: 179,        // three tiers: none→base(0)→light(1)→high(2)
    capBase: 100, capUpgraded: 500,                      // till capacity: 100c base, 500c once light/high
    bonusAt50: 1, bonusAt200: 2,                          // per-transaction bonus when the till holds >=50 / >=200
    robYield: [0.9, 0.6, 0.3],                            // cash grabbed by security level: base / light / high
    highAlarmChance: 0.35,                                // Stage 5: high-security till can trip an alarm on a robbery
    npcConsiderFloor: 40,                                 // an NPC owner mulls a register upgrade with this much spare (over cost)
  },
  FURN: {
    npcSpareFloor: 50,          // an NPC considers furniture only with this many coins BEYOND its price
    npcPiggyAt: 50, npcSafeAt: 180,   // auto-buy cash storage when holding beyond these
    diningBonus: 5,             // +this to each fed stat (and always energy) at a home dining table
    burglaryYield: 0.7,         // fraction of stored cash a successful burglary takes
    burglarStoreTier: { onhand: 1, piggy: 2, safe: 3 },   // difficulty tiers for the three targets
  },
  OWNERECON: {
    surchargeAbove: 5,           // delivery surcharge kicks in above this base value (per item)...
    surchargePer: 2,             // ...at +1c per this many coins of base value over the threshold
    menuSize: 8,                 // how many items a shop/eatery carries at once
    reviseDay: 7, reviseEvery: 14,  // first revision day 7, then 21, 35, ... (every 14)
    maxSwaps: 2,                 // up to this many drop-A/add-B swaps per revision
    priceMinMult: 0, priceMaxMult: 2,   // hard bounds: free to 2× base is ALLOWED...
    priceSuggestLo: -1, priceSuggestHi: 1,  // ...but the owner is nudged toward base−1 .. base+1
    survivalFloor: 4,            // eatery base-meal plates seeded at open (famine guard, esp. chef-less towns)
    firstFill: 6,                // Stage 3.7 (corrected): units per OPENING menu item dealt on day 1 — swaps start at 0
    apiMaxTokens: 400,           // the pricing/revision call — a touch heavier, but rare (per owner, biweekly)
  },
  VISIT: { budget: 15, dailyChance: 0.12, stayMin: 180 },  // budget threshold + occasional urge
  PARTY: { hour: 18, endHour: 21, minCost: 50, lateCutoffH: 20, repFame: 6, repRenown: 10, giftChance: 0.8 },
  PATROL: { everyH: 4 },
  SKILL: {                          // training: every completed task teaches its trade
    levels: [3, 12, 40, 90, 180, 800, 4000],   // Stage 3.7c: xp thresholds I-VII. Mid-tiers dilated so
                                    // Professional (V) is a real 180-task climb; VI/VII (Expert/Master) are
                                    // long-haul achievements — reaching them grants big renown.
    bonusPerLevel: 0.10, cap: 0.50, // employed-on-shift multiplier: +10%/level, max +50% — lifts wage AND owner revenue
    expertReownAt: 6, masterRenownAt: 7,     // tier at which a big renown bump fires (Expert / Master)
    expertRenown: 6, masterRenown: 20,       // how much renown the milestone confers
  },
  JOBS: {                           // the contract every employer offers
    employers: ["office", "cafe", "fastfood", "diner", "mart", "inn", "post", "store_f", "grill_f", "market_s", "store_m", "workshop_s"],   // post: Pete can hire delivery couriers; the new quarters hire too
    days: [1, 2, 3, 4, 5],          // day-of-week (day % 7) — 6 and 0 are the weekend
    shift: [9, 17],
    interviewHour: 10, interviewWindow: 2,               // show up 10:00-12:00 on opening day
    openingChance: 0.5,             // daily roll for a new opening when none exists (Pass 4: a bigger town hires faster)
    banDays: 5,                     // failed interview: reapply cooldown
    maxStrikes: 2,                  // missed scheduled shifts before you're let go
  },
  /* Stage 2 — the occupation layer: titles, promotions, and the NPC side of
     the job market. Everything here rides ON TOP of JOBS/SKILL/ECON; it does
     not replace them. A "category" is the NATURE of the work, keyed so one
     ladder serves every business of that kind (DRY). */
  OCCUPATION: {
    // title rungs per category; array index === rank (0-based). Promotion climbs it.
    titles: {
      office:  ["Filing Clerk", "Analyst", "Senior Analyst", "Office Manager"],
      kitchen: ["Line Cook", "Cook", "Head Cook", "Kitchenmaster"],
      service: ["Server", "Floor Lead", "Shift Manager", "Proprietor"],
      stock:   ["Stocker", "Stockkeeper", "Floor Manager", "Quartermaster"],
      civic:   ["Clerk", "Deputy", "Officer", "Chief"],            // Watch, clinic, hall
      trade:   ["Apprentice", "Journeyman", "Craftsman", "Master"], // Juniper, Gus, Finn
    },
    promoteAtLevel: [0, 2, 3, 4],   // skill level required to HOLD each rank (rank 0 is free)
    rankRaisePct: 0.08,             // each rank above 0 lifts the worker's take +8% (stacks with skillMult)
    ownerRank: 3,                   // business owners sit at the top rung of their category
    unemploymentStipendH: 1,        // civic dole per idle work-hour — keeps jobless NPCs solvent
    seekJobAfterDays: 2,            // an employable NPC idle this long starts hunting work
    playerHeadstartMin: 15,         // an opening is player-exclusive for its first N sim-minutes
    retitleReviewHour: 9,           // daily promotion review runs at this hour
  },
  ETHICS: { everyDays: 2, messLimit: 65, fine: 5 },        // business compliance inspections
  /* Stage 2.1 — the self-care layer: NPCs treat mild illness, keep a pantry
     buffer on hand, and stores chase demand between dawn reorders. Balanced
     priority: none of this interrupts a work shift, but it will pull an NPC
     away from wandering or socializing. All values tuned for "alive, not manic." */
  SELFCARE: {
    pantryFoodTarget: 4,        // Stage 3.7b: carry a HEALTHY buffer of food — precaution is the point
    pantryDrinkTarget: 4,       // and a matching buffer of drinks — thirst should never mean a desperate run
    pantryMedTarget: 2,         // two doses on hand: enough to self-cure a bad case AND keep one spare
    likesBuffer: 2,            // also grab up to N of their personal "likes" items per trip
    shopWhenBelow: 2,          // Stage 3.7b: top up EARLY (at 2 left, not the last one) — stay ahead of need
    shopCoinFloor: 8,          // never shop themselves broke — keep this much in reserve
    shopCooldownH: 6,          // hours between voluntary stocking trips (no constant loitering)
    mildClinicChance: 0.5,     // per-decision odds a mild-sick, off-shift NPC seeks the clinic
    mildClinicCoinFloor: 6,    // won't spend their last coins on a cough
    hungerBuyThreshold: 40,    // hungry-with-no-food → buy to CARRY (higher than the eat trigger)
    restockCheckH: 3,          // how often the mid-day demand sweep runs (sim-hours)
    demandLow: 3,              // a tracked item at/below this stock WITH recent demand → expedite
    demandDecay: 0.5,          // each dawn, recent-demand counters fade by this factor
    demandReorderQty: 6,       // units pulled in on an expedited (mid-day) restock
  },
  /* Stage 2.2 — genuine AI skill checks. Hard tasks (printer, at-scene medical
     stabilization, investigation beats) call the API for a real pass/fail verdict
     instead of running a timer or an RNG roll. The API adjudicates ability vs a
     LOCALLY-computed difficulty; higher difficulty = harder. Both brakes (cooldown
     + daily cap) bound worst-case call volume per actor per task. */
  /* Stage 6 — task XP & player-side difficulty scaling.
     XP = floor(base × fibTier[tier]); Fibonacci tier multiplier rewards harder work.
     Logistics is special (fee/distance based), handled at its call sites. */
  TASKXP: {
    fibTier: [1, 2, 4, 7],              // Entry / Simple / Hard / Extreme multiplier (steeper: harder work, real reward)
    base: { kitchen: 1.75, office: 1.4, service: 1, fishing: 1, healthcare: 1, foraging: 1 },   // per-category entry base
    letterLocal: 1, letterMossford: 2, letterStonecross: 3,   // letter XP by destination
  },
  /* Stage 6 — PLAYER task difficulty scales with skill-vs-tier GAP (same idea as NPC tierSuccess):
     under-skilled = pressure (tight goals, time limits, more loops/sliders, no undo);
     at/above tier = leniency (wider goals, fewer loops/sliders, undo). Each minigame reads knobs
     from taskParams(). gap = skillLevel − tierTargetLevel[tier] (can be negative). */
  TASKDIFF: {
    // multipliers/deltas per point of gap, clamped — tuned per knob at the call sites
    goalPerGap: 0.12,        // timing/fill goal widens this fraction per gap level above target
    goalTightPerGap: 0.10,   // and tightens this much per level below
    goalMin: 0.4, goalMax: 2.2,   // clamp on the goal-width multiplier
  },
  SKILLCHECK: {
    maxTokens: 16,             // verdict-only JSON — the leanest call in the game
    baseDifficulty: 70,        // starting difficulty (0-100) before easing — deliberately hard
    perSkillLevel: 9,          // each relevant skill level shaves this much difficulty
    perRank: 6,                // each occupation rank shaves this much (boss/senior get it easier)
    ownerEase: 12,             // extra easing when the actor owns/runs the building in question
    expertiseEase: 45,         // Stage 3.7c: (legacy, still used by non-tiered checks) domain expertise cut
    /* Stage 3.7d: TASK TIERS — each hard task has a difficulty tier (0-3). Success is driven by the
       gap between the actor's skill LEVEL and the level at which the task is "comfortable":
         tier 0 Entry (comfortable at I) · 1 Simple (II) · 2 Hard (V) · 3 Extreme (VI)
       At/above target: solid and climbing. Below: you CAN try, but it's rough. Expertise ~= +2 levels. */
    tierTargetLevel: [1, 2, 5, 6],   // skill level where each task tier becomes comfortable (~60%)
    tierBaseChance: 0.60,            // success AT the target level
    tierPerLevelUp: 0.12,            // +per level above target
    tierPerLevelDown: 0.15,          // −per level below target (softer: a Novice still ~15% on a Hard task)
    tierExpertiseLevels: 2,          // domain expertise shifts effective level up by this much
    tierMax: 0.97, tierMin: 0.05,
    minDifficulty: 8,          // floor — even a master can fumble occasionally
    cooldownMin: 45,           // sim-minutes an actor waits after a FAILED attempt before retrying
    dailyCap: 4,               // max attempts per actor per task-type per day, then they give up
    medMinSkill: 8,            // minimum service-skill xp to even ATTEMPT at-scene stabilization
    invMaxSuspects: 3,         // an investigation questions at most this many suspects
    invMaxQuestionsPerSuspect: 2,  // and presses each suspect at most this many times
    /* ===== Stage 3.9 — adversarial interrogation ===== */
    interrogateQuestions: 3,   // questions per suspect in the real exchange (detective ↔ suspect)
    interrogateMaxPerCase: 4,  // a case allows at most this many full interrogations — make them count
    wrongfulBase: 10,          // compensation an innocent gets on overturn...
    wrongfulPerNight: 4,       // ...plus this per night they were jailed (from the DETECTIVE's pocket)
    wrongfulFireDays: 7,       // if a cleared innocent was jailed at least this long, the detective is FIRED
    // (and firing is automatic if a wrongly-convicted innocent DIES in prison, regardless of days)
  },
  /* Stage 2.3 — the justice overhaul. Witnessed/attributable murder now means a
     REAL life sentence in a holding cell, escapable only via a prison-break skill
     loop. Cells exist in every town's Watch building; capacity + overflow keep a
     spree from breaking the jail. Break difficulty scales with guards on duty and
     the chosen difficulty tier. */
  PRISON: {
    breakBaseDifficulty: 82,       // life-sentence break starts brutally hard (0-100)
    breakPerSkillLevel: 7,         // relevant skill (stealth via 'service') shaves this per level
    guardPenalty: 14,              // each awake enforcer in the building adds this much difficulty
    nightEaseHour: [22, 5],        // between these hours, fewer guards → easier (see guard count)
    breakCooldownMin: 90,          // sim-minutes between break attempts (failed OR aborted)
    breakDailyCap: 3,              // attempts per day before the player must wait for tomorrow
    escapeeWanted: 5,              // a successful escapee is a 5-star fugitive, hunted on sight
    diffMult: { easy: 0.65, normal: 1, hardcore: 1.4 },   // per-tier difficulty scaling
    lifeTriggerFameFloor: -60,     // conviction floors fame here (matches old parole penalty)
  },
  COMBAT: { roundMs: 700, fistDmg: [4, 9], fleeBase: 45 },
  ROBBERY: { take: 0.4, escapeBase: 40 },
  /* ===== the civic overhaul: elections, the robbable treasury, and trespass ===== */
  ELECTION: { everyDays: 14, firstDay: 10, regFee: 5 },   // vote every 2 weeks; register at any hall for a small fee
  SAFE_ROB: { yield: 0.6, minLoot: 5 },                   // cracking a hall safe: 3★, Extreme-tier check, takes 60% of escrow
  TRESPASS: { graceMin: 25, reportMin: 60 },              // uninvited lingering in a private home: warning, then a 1★ report
  /* difficulty — set on the start screen or in ⚙️; only touches death & bills */
  DIFF: {
    easy:     { label: "Easy",     deathEnabled: false, revive: true,  billMult: 0.5 },
    normal:   { label: "Normal",   deathEnabled: true,  revive: true,  billMult: 1 },
    hardcore: { label: "Hardcore", deathEnabled: true,  revive: false, billMult: 1 },
  },
  SAVE_KEY: "alderbrook_save_v6", SAVE_INTERVAL: 45,
};

/* ===== small utilities ===== */
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
const pad2 = (n) => String(n).padStart(2, "0");
const rand = (arr) => arr[Math.floor(Math.random() * arr.length)];
const randInt = ([a, b]) => a + Math.floor(Math.random() * (b - a + 1));
const REL_ORDER = ["hates", "dislikes", "neutral", "likes", "friend"];

function fameTier(fame, renown) {
  if (renown < 8) return "a newcomer nobody really knows yet";
  if (fame >= 35) return "genuinely beloved around town";
  if (fame >= 12) return "well thought of";
  if (fame <= -35) return "outright notorious";
  if (fame <= -12) return "considered a bit shady";
  return "a familiar face around town";
}
const hygieneDesc = (h) =>
  h > 70 ? "freshly washed" : h > 40 ? "presentable" : h > CFG.HYGIENE.social ? "a bit ripe" : "frankly, you can smell them coming";
const healthDesc = (h) =>
  h > 85 ? "healthy" : h > 50 ? "banged up a little" : h > CFG.HEALTH.critical ? "visibly injured" : "in critical shape";

/* =====================================================================
   ITEMS — food, drink, gifts, tools, INGREDIENTS and WEAPONS.
   Cooking turns cheap ingredients into high-value meals: the work IS
   the value. Weapons carry a dmg roll range; fists are the fallback.
   ===================================================================== */
const ITEMS = {
  /* meals & drink */
  bread:        { name: "Bread",          emoji: "🍞", price: 2,  cat: "food",   eat: { hunger: 30 } },
  meal:         { name: "Hot Meal",       emoji: "🍲", price: 3,  cat: "food",   eat: { hunger: 55 } },
  snack:        { name: "Snack",          emoji: "🍒", price: 2,  cat: "food",   eat: { hunger: 28 } },   // Stage 3.6: apple went to fruit, cookie went to cookies — snack takes the cherry
  milk:         { name: "Milk",           emoji: "🥛", price: 2,  cat: "drink",  eat: { thirst: 28, hunger: 6 } },   // Stage 3.6: plain milk (chocolate milk waits...)
  fruit:        { name: "Fresh Fruit",    emoji: "🍎", price: 2,  cat: "food",   eat: { hunger: 14, thirst: 10 } },  // Stage 3.6: light, refreshing
  combo:        { name: "Crispy Combo",   emoji: "🍔", price: 4,  cat: "food",   eat: { hunger: 45, thirst: 15 } },
  stew:         { name: "Stew",           emoji: "🥘", price: 3,  cat: "food",   eat: { hunger: 50 } },
  mystery_stew: { name: "Mystery Stew",   emoji: "🍲", price: 2,  cat: "food",   eat: { hunger: 85 } },   // Howl's special. Cheap. Enormous. Usually fine.
  chocolate:    { name: "Chocolate",      emoji: "🍫", price: 3,  cat: "food",   eat: { hunger: 15, energy: 8 } },
  water:        { name: "Bottled Water",  emoji: "🧴", price: 1,  cat: "drink",  eat: { thirst: 40 } },
  coffee:       { name: "Coffee",         emoji: "☕", price: 2,  cat: "drink",  eat: { energy: 14, thirst: 10 } },   // Stage 3.8: nerfed (mocha is the energy king now)
  cider:        { name: "Cider",          emoji: "🍺", price: 1,  cat: "drink",  eat: { thirst: 30 } },
  tea:          { name: "Herbal Tea",     emoji: "🍵", price: 2,  cat: "drink",  eat: { energy: 10, thirst: 25 } },
  /* Stage 3.8 — the drinks station's output (barista-made) */
  choco_milk:   { name: "Chocolate Milk", emoji: "🥛", price: 3,  cat: "drink",  eat: { thirst: 26, hunger: 10, energy: 6 } },
  hot_choc:     { name: "Hot Chocolate",  emoji: "☕", price: 3,  cat: "drink",  eat: { thirst: 22, energy: 12, hunger: 6 } },
  milkshake:    { name: "Milkshake",      emoji: "🥤", price: 4,  cat: "drink",  eat: { thirst: 24, hunger: 16, energy: 8 } },
  lemonade:     { name: "Lemonade",       emoji: "🧃", price: 3,  cat: "drink",  eat: { thirst: 38, energy: 4 } },
  mocha:        { name: "Mocha",          emoji: "☕", price: 4,  cat: "drink",  eat: { energy: 24, thirst: 12 } },   // the "old coffee stats" energy option
  trop_shake:   { name: "Tropical Shake", emoji: "🥤", price: 5,  cat: "drink",  eat: { thirst: 30, hunger: 20, energy: 14 } },
  nutrient:     { name: "Nutrient Drink", emoji: "🧪", price: 9,  cat: "drink",  eat: { thirst: 40, hunger: 40, energy: 40 }, heal: 30 },   // Stage 3.8: the first EXTREME recipe
  /* ingredients — cheap, low direct value, meant for the stove */
  fish:         { name: "Raw Fish",       emoji: "🐟", price: 3,  cat: "ingredient", eat: { hunger: 8 } },   // edible in desperation. barely.
  tropical_fish:{ name: "Tropical Fish",  emoji: "🐠", price: 12, cat: "ingredient", eat: { hunger: 12 } },   // Stage 6: a rare hard-fishing catch
  goodie_crate: { name: "Goodie Crate",   emoji: "🎲", price: 0,  cat: "misc",    use: "goodie" },            // Stage 6: open for 3 random items
  fish_stew:    { name: "Hearty Fish Stew", emoji: "🫕", price: 16, cat: "food",   eat: { hunger: 75, energy: 15 } },   // Stage 6: hard cook from tropical fish
  flour:        { name: "Flour",          emoji: "🌾", price: 2,  cat: "ingredient" },
  sugar:        { name: "Sugar",          emoji: "🍬", price: 2,  cat: "ingredient" },   // Stage 3.6: baking staple
  dough:        { name: "Dough",          emoji: "🥣", price: 3,  cat: "ingredient" },   // Stage 3.6: a made ingredient — flour+water, then baked on
  veg:          { name: "Vegetables",     emoji: "🥕", price: 2,  cat: "ingredient", eat: { hunger: 12 } },
  /* cooked — where the value comes from */
  grilled_fish: { name: "Grilled Fish",   emoji: "🍥", price: 7,  cat: "food",   eat: { hunger: 45 } },
  veg_soup:     { name: "Veggie Soup",    emoji: "🥫", price: 4,  cat: "food",   eat: { hunger: 30, thirst: 10 } },   // 🍜→noodles, 🍲→meal, so soup takes the can
  hearty_stew:  { name: "Hearty Stew",    emoji: "🍛", price: 9,  cat: "food",   eat: { hunger: 65, energy: 10 } },
  /* Stage 3.6 — simple-recipe outputs (peak-timing minigame) */
  fresh_bread:  { name: "Fresh Bread",    emoji: "🥖", price: 5,  cat: "food", alsoIngredient: true, eat: { hunger: 40, thirst: 6, energy: 4 } },   // Stage 3.8: absorbed loaf, took its 🥖. Edible food AND a made ingredient (→ croissant). Kitchen-baked only.
  cookies:      { name: "Cookie",         emoji: "🍪", price: 2,  cat: "food",   eat: { hunger: 22, energy: 12 } },   // one cookie per buy — a snack, cheaper end
  salad:        { name: "Garden Salad",   emoji: "🥗", price: 5,  cat: "food",   eat: { hunger: 30, thirst: 14 } },
  candy_apple:  { name: "Candy Apple",    emoji: "🍭", price: 4,  cat: "food",   eat: { hunger: 18, energy: 14 } },
  fish_sticks:  { name: "Fish Sticks",    emoji: "🍤", price: 6,  cat: "food",   eat: { hunger: 42 } },
  noodles:      { name: "Noodles",        emoji: "🍜", price: 5,  cat: "food",   eat: { hunger: 38, thirst: 12 } },
  /* Stage 3.6 — hard-recipe outputs (temp knob → timing → cook skill check) */
  cake:         { name: "Layer Cake",     emoji: "🍰", price: 8,  cat: "food",   eat: { hunger: 30, energy: 24 } },   // Stage 3.8: energy buff
  pie:          { name: "Berry Pie",      emoji: "🥧", price: 8,  cat: "food",   eat: { hunger: 34, energy: 10 } },
  taco:         { name: "Taco",           emoji: "🌮", price: 7,  cat: "food",   eat: { hunger: 46, thirst: 6, energy: 10 } },   // Stage 3.8
  sushi:        { name: "Sushi",          emoji: "🍣", price: 10, cat: "food",   eat: { hunger: 48, thirst: 8 } },
  croissant:    { name: "Croissant",      emoji: "🥐", price: 7,  cat: "food",   eat: { hunger: 36, energy: 5 } },   // Stage 3.8
  burnt:        { name: "Burnt Mess",     emoji: "🍳", price: 0,  cat: "food",   eat: { hunger: 5 } },        // failure has flavor
  sludge:       { name: "Sludge",         emoji: "🫗", price: 0,  cat: "drink",  eat: { thirst: 5 } },        // Stage 6: a botched drink — barely wet
  /* gifts & tools */
  flowers:      { name: "Flowers",        emoji: "💐", price: 3,  cat: "gift" },
  rock:         { name: "Round Rock",     emoji: "🪨", price: 1,  cat: "gift" },
  /* v7 Stage 5: the workshop economy — tools enable recipes, materials feed them */
  saw:          { name: "Saw",            emoji: "🪚", price: 26, cat: "tool" },
  hammer:       { name: "Hammer",         emoji: "🔨", price: 22, cat: "tool" },
  screwdriver:  { name: "Screwdriver",    emoji: "🪛", price: 18, cat: "tool" },
  hatchet:      { name: "Hatchet",        emoji: "🪓", price: 34, cat: "tool" },   // craftable; also the wood-chopping tool
  wood:         { name: "Cut Wood",       emoji: "🪵", price: 4,  cat: "gift" },
  ore:          { name: "Iron Bits",      emoji: "🔩", price: 6,  cat: "gift" },   // smelted from 3 round rocks
  toy:          { name: "Wooden Toy",     emoji: "🧸", price: 9,  cat: "gift" },
  bat:          { name: "Club Bat",       emoji: "🏏", price: 14, cat: "gift", dmg: [10, 20] },
  hardware:     { name: "Hardware Parts", emoji: "🔌", price: 22, cat: "gift" },   // hard-tier assembly; fiddly, valuable
  birdhouse:    { name: "Birdhouse",      emoji: "🐦", price: 16, cat: "gift" },
  frame:        { name: "Picture Frame",  emoji: "🖼️", price: 11, cat: "gift" },
  whistle:      { name: "Reed Whistle",   emoji: "🪈", price: 8,  cat: "gift" },
  drum:         { name: "Toy Drum",       emoji: "🥁", price: 18, cat: "gift" },
  /* repair parts — crafted at the workshop, or bought there. Broken town = busy wright. */
  pipe:         { name: "Pipe",           emoji: "🚰", price: 10, cat: "gift" },
  heatcoil:     { name: "Heat Coil",      emoji: "🌡️", price: 14, cat: "gift" },
  nozzle:       { name: "Nozzle",         emoji: "🚿", price: 12, cat: "gift" },
  tie:          { name: "Silk Tie",       emoji: "👔", price: 8,  cat: "gift" },
  paint:        { name: "Paint Set",      emoji: "🎨", price: 6,  cat: "gift" },
  stamp:        { name: "Rare Stamp",     emoji: "📮", price: 5,  cat: "gift" },
  candle:       { name: "Candle",         emoji: "🕯️", price: 2,  cat: "gift" },
  broom:        { name: "Broom",          emoji: "🧹", price: 4,  cat: "tool" },
  /* party catering + medical supplies */
  pizza:        { name: "Pizza",          emoji: "🍕", price: 6,  cat: "food",   eat: { hunger: 60, thirst: 5, energy: 12 } },   // Stage 3.8
  medicine:     { name: "Medicine",       emoji: "💊", price: 6,  cat: "med",    cure: true },
  bandage:      { name: "Bandage",        emoji: "🩹", price: 3,  cat: "med",    heal: 20 },
  /* weapons — enforcement carries batons free; the mart sells one under the counter */
  club:         { name: "Walking Club",   emoji: "🏏", price: 10, cat: "weapon", dmg: [12, 22] },
  knife:        { name: "Boning Knife",   emoji: "🔪", price: 14, cat: "weapon", dmg: [18, 30], lethal: true },  // will NOT stop at incapacitation
  /* v7 Stage 2 — the ranged ladder: range = engagement tiles, ammo gates the opening shot */
  slingshot:    { name: "Slingshot",      emoji: "🪃", price: 10,  cat: "weapon", dmg: [8, 16],  range: 4, ammo: "rock" },
  bow:          { name: "Hunting Bow",    emoji: "🏹", price: 42,  cat: "weapon", dmg: [16, 28], range: 6, ammo: "arrow" },
  crossbow:     { name: "Crossbow",       emoji: "🎯", price: 200, cat: "weapon", dmg: [26, 40], range: 7, ammo: "bolt", lethal: true },   // the world's status weapon — Watch-issue or black market only
  arrow:        { name: "Arrow",          emoji: "🪶", price: 2,   cat: "gift" },
  bolt:         { name: "Crossbow Bolt",  emoji: "🔩", price: 4,   cat: "gift" },
  fiber:        { name: "Grass Bundle",   emoji: "🌾", price: 1,   cat: "gift" },
  herb:         { name: "Wild Herb",      emoji: "🌿", price: 3,   cat: "gift", heal: 6 },
  ring:         { name: "Tarnished Ring", emoji: "💍", price: 8,   cat: "gift" },
  baton:        { name: "Watch Baton",    emoji: "🪃", price: 0,  cat: "weapon", dmg: [10, 18] },
};

/* stove recipes: ingredients in → cooked item out (burnt on a missed window) */
/* Stage 3.6: recipes now carry an optional `out` (yield >1), `temp` (°F the
   knob must be set to before the timing game — presence of `temp` marks a HARD
   recipe), and `hard: true` (a Cooking-track skill check gates plating). Simple
   recipes omit all three and behave exactly as before. */
const RECIPES = {
  /* --- simple: the classic peak-timing game --- */
  grilled_fish: { needs: { fish: 1 },              tier: 0, label: "Grill a fish" },
  bread:        { needs: { flour: 1 },             tier: 0, label: "Bake normal bread" },
  fresh_bread:  { needs: { dough: 1, flour: 1 },   tier: 1, label: "Bake fresh bread" },
  dough:        { needs: { flour: 2, water: 1 },   out: 2, tier: 0, label: "Mix dough (makes 2)" },
  cookies:      { needs: { chocolate: 1, dough: 1 }, out: 3, tier: 1, label: "Bake cookies (makes 3)" },
  veg_soup:     { needs: { veg: 1 },               tier: 0, label: "Simmer veggie soup" },
  fish_stew:    { needs: { hearty_stew: 1, tropical_fish: 1 }, tier: 2, temp: 210, out: 1, label: "Hearty Fish Stew (hard)" },   // Stage 6
  hearty_stew:  { needs: { fish: 1, veg: 1 },      tier: 1, label: "Hearty stew (the good stuff)" },
  stew:         { needs: { fish: 1, veg: 1 },      tier: 0, label: "Simmer a stew" },
  salad:        { needs: { fruit: 1, veg: 1 },     tier: 0, label: "Toss a salad" },
  candy_apple:  { needs: { sugar: 1, fruit: 1 },   tier: 1, label: "Dip a candy apple" },
  fish_sticks:  { needs: { fish: 1, flour: 1 },    tier: 1, label: "Fry fish sticks" },
  noodles:      { needs: { water: 1, flour: 1 },   tier: 0, label: "Pull noodles" },
  /* --- hard: set the knob, hit the timing, then pass the cook check --- */
  cake:         { needs: { flour: 1, sugar: 2, fruit: 1 }, temp: 350, hard: true, tier: 2, label: "Bake a layer cake" },
  pie:          { needs: { dough: 1, sugar: 1, fruit: 1 }, temp: 375, hard: true, tier: 2, label: "Bake a berry pie" },
  taco:         { needs: { dough: 1, veg: 1, milk: 1 },    temp: 400, hard: true, tier: 2, label: "Build tacos" },
  sushi:        { needs: { fish: 1, flour: 1, veg: 1 },    temp: 220, hard: true, tier: 2, label: "Roll sushi" },
  croissant:    { needs: { fresh_bread: 1, milk: 1 },      temp: 375, hard: true, tier: 2, label: "Fold croissants" },
  /* Stage 3.8 — DRINKS (made at the drink station; hard/extreme also gate on temp+timing) */
  choco_milk:   { needs: { milk: 1, chocolate: 1 },        drink: true, tier: 0, label: "Mix chocolate milk" },
  hot_choc:     { needs: { water: 1, chocolate: 1 },       drink: true, tier: 0, label: "Heat hot chocolate" },
  milkshake:    { needs: { fruit: 1, milk: 1 },            drink: true, tier: 1, label: "Blend a milkshake" },
  lemonade:     { needs: { water: 1, fruit: 1 },           drink: true, tier: 0, label: "Squeeze lemonade" },
  mocha:        { needs: { coffee: 1, chocolate: 1, sugar: 1 }, drink: true, temp: 190, hard: true, tier: 2, label: "Pull a mocha" },
  trop_shake:   { needs: { milk: 1, fruit: 2, sugar: 1 },  drink: true, temp: 200, hard: true, tier: 2, label: "Blend a tropical shake" },
  nutrient:     { needs: { fruit: 2, veg: 2, water: 1, flour: 1 }, drink: true, temp: 320, hard: true, tier: 3, label: "Formulate a nutrient drink" },
};
const COOK_TEMP_TOL = 20;   // Stage 3.6.1: ±°F window on the oven dial — a bit forgiving for drag aiming

const SHOP_STOCK = {
  cafe:     ["meal", "coffee", "bread", "flour"],
  cafe_s:   ["coffee", "tea", "cookies"],
  store_f:  ["bread", "water", "veg", "flour"],
  grill_f:  ["stew", "bread", "coffee"],
  market_s: ["bread", "veg", "fruit", "water", "milk"],
  workshop_s: ["saw", "hammer", "screwdriver", "wood", "rock", "pipe", "heatcoil", "nozzle"],   // tools, materials, and REPAIR PARTS: the owner's extra sales
  store_m:  ["bread", "water", "snack", "candle", "rock"],
  blackmarket_o: ["crossbow", "bolt", "arrow", "knife", "club", "water"],
  grill_o:  ["mystery_stew", "stew", "coffee", "water"],
  market:   ["snack", "water", "bread", "chocolate", "rock", "flowers", "flour", "veg", "sugar", "fruit", "milk"],
  fastfood: ["combo", "pizza"],
  diner:    ["stew", "cider", "tea", "grilled_fish"],
  inn:      ["stew", "cider", "tea"],
  furn:     ["candle", "broom", "paint"],   // Stage 4: only small homewares stock here; furniture is fixed-catalog (FURNITURE)
  store:    ["snack", "water", "candle", "flowers", "tea", "veg", "fruit", "milk"],
  mart:     ["bread", "snack", "water", "coffee", "tea", "chocolate", "flowers", "rock", "tie", "paint", "stamp", "candle", "broom", "flour", "veg", "sugar", "fruit", "milk", "club", "medicine", "bandage", "knife", "slingshot", "arrow", "bow"],   // Stage 3.6: cake/pie now come from eateries, not the mart shelf
};
const SHOP_STATION = { cafe: "counter", market: "shop", fastfood: "counter", diner: "counter", store: "shop", mart: "shop", inn: "inn", furn: "shop", cafe_s: "counter", store_f: "shop", grill_f: "counter", blackmarket_o: "shop", grill_o: "counter", market_s: "shop", store_m: "shop", workshop_s: "shop" };
/* where the sick go: local walk-in clinics, or Mercy itself in Stonecross */
const TOWN_CLINIC = { alderbrook: "clinic_a", mossford: "clinic_m", stonecross: "hospital", ferndale: "clinic_f", outlands: "hospital", hills: "clinic_a" };   // the Outlands wounded ride to Mercy — if anyone hauls them
/* Stage 3: civic medicine — the practicing doctor of each facility. Care fees
   flow to them (heavy bills may be covered by a friend), the treasury tops
   them up on CFG.MEDICAL.stipendHours, and their restock goods arrive free —
   they only pay Pete's mileage on delivery. */
const FACILITY_DOCTOR = { hospital: "amara", clinic_a: "reyes", clinic_m: "noor", clinic_f: "sana" };
/* Stage 2.3: each town's Watch building that holds cells. Jailing routes to the
   convict's local lockup; overflow spills toward Stonecross (the main lockup). */
const TOWN_LOCKUP = { alderbrook: "watchpost_a", mossford: "watchpost_m", stonecross: "hq", ferndale: "hq", outlands: "hq", hills: "watchpost_a" };   // frontier convicts ride to the main lockup
const LOCKUP_ORDER = ["hq", "watchpost_m", "watchpost_a"];   // overflow preference: main lockup first
/* what venues buy back from the player, and for how much */
const SELLABLE = { fish: 2, grilled_fish: 6, fresh_bread: 4, veg_soup: 3, hearty_stew: 7 };
/* ===== Stage 4 — Hearth & Holt furniture catalog =====
   Furniture is a persistent home INSTALLATION (lives in ent.furniture[], not inventory).
   `store` = cash-storage cap; `secure` = burglary difficulty tier (2 Hard / 3 Extreme);
   `upkeep` = coins/week added to the housing bill; `slots` = chest item-storage slots;
   `grants` = a station the home gains; `dining` = the meal-buff table. NPCs buy these too. */
const FURNITURE = {
  piggy:    { name: "Piggy Bank",     emoji: "🐷", price: 25, store: 40,  secure: 2, anchor: { x: 1, y: 3 } },
  safe:     { name: "Indoor Safe",    emoji: "🔒", price: 90, store: 250, secure: 3, anchor: { x: 7, y: 3 } },
  workbench:{ name: "Workbench",      emoji: "🛠️", price: 320, craftAt: true, anchor: { x: 8, y: 1 } },   // hefty — it's a LOT: craft at home
  chair:    { name: "Easy Chair",     emoji: "🪑", price: 95, chairRest: true, anchor: { x: 2, y: 1 } },   // 15 energy/hr, real-time, 3 per 12-min mark
  bedup:    { name: "Feather Bed",    emoji: "🛏️", price: 50, restEase: 0.5, anchor: { x: 1, y: 2 } },   // slows morning energy decay
  fridge:   { name: "Fridge",         emoji: "🧊", price: 42, upkeep: 2, foodStore: true, anchor: { x: 6, y: 1 } },
  fountain: { name: "Home Fountain",  emoji: "⛲", price: 33, upkeep: 1, grants: "drink", anchor: { x: 3, y: 3 } },
  chest:    { name: "Storage Chest",  emoji: "🧰", price: 30, slots: 8, anchor: { x: 5, y: 3 } },
  oven:     { name: "Oven",           emoji: "🔥", price: 55, grants: "stove", anchor: { x: 4, y: 2 } },
  drinkbar: { name: "Drink Station",  emoji: "🍹", price: 48, grants: "drinks", anchor: { x: 2, y: 2 } },
  table:    { name: "Dining Table",   emoji: "🍽️", price: 70, dining: true, anchor: { x: 4, y: 4 } },   // +5 to every stat a home meal already feeds, +5 energy always
};
/* ===== furniture PLACEMENT — predetermined slots per home =====
   Every home template reserves specific tiles that may hold furniture. Slots hug the
   walls and leave the door column, the stations (bed/stove/bath/table), the seats and
   the room's crossing lanes untouched — so no arrangement can ever wall anyone in.
   A placed piece BLOCKS its tile (it's real), which is why the slots are curated. */
const HOME_SLOTS_STD = [    // the standard 9×6 cottage (every home_*, shack_*)
  { x: 2, y: 1, label: "north wall, by the bed" },
  { x: 4, y: 1, label: "north wall, center" },
  { x: 5, y: 1, label: "north wall, right of center" },
  { x: 6, y: 1, label: "north wall, by the washroom" },
  { x: 1, y: 3, label: "west wall, beside the table" },
  { x: 5, y: 3, label: "mid-room, right of the table" },
  { x: 6, y: 3, label: "east side of the room" },
  { x: 7, y: 3, label: "east wall corner" },
];
const HOME_SLOTS_MANOR = [  // Vance Manor's 11×7 floor (home_o)
  { x: 2, y: 1, label: "north wall, by the bed" },
  { x: 3, y: 1, label: "north wall, left" },
  { x: 5, y: 1, label: "north wall, center" },
  { x: 6, y: 1, label: "north wall, right of center" },
  { x: 7, y: 1, label: "north wall, right" },
  { x: 8, y: 1, label: "north wall, by the washroom" },
  { x: 1, y: 3, label: "west wall, beside the table" },
  { x: 9, y: 3, label: "east wall, past the tables" },
  { x: 9, y: 4, label: "east wall, south corner" },
];
const homeSlots = (homeId) => {
  const d = INTERIOR_DEFS[homeId]; if (!d) return [];
  return d.rows[0].length >= 11 ? HOME_SLOTS_MANOR : HOME_SLOTS_STD;
};
/* which building ids count as private homes (trespass + furniture placement) */
const isHomeId = (bId) => /^(home_|shack_)/.test(bId || "");

/* ===== furniture & register vector art =====
   Small hand-built canvas paintings — simple shapes, warm colors, readable at 32px.
   (x, y) is the tile's top-left in screen px; T is the tile size. */
const drawFurnitureArt = (ctx, fid, x, y, T) => {
  const u = T / 10;                       // art unit
  ctx.save(); ctx.translate(x, y);
  const box = (bx, by, bw, bh, c) => { ctx.fillStyle = c; ctx.fillRect(bx * u, by * u, bw * u, bh * u); };
  const dot = (cx, cy, r, c) => { ctx.fillStyle = c; ctx.beginPath(); ctx.arc(cx * u, cy * u, r * u, 0, 7); ctx.fill(); };
  switch (fid) {
    case "piggy":
      dot(5, 6, 3, "#e79db1"); dot(7.6, 5.2, 1, "#e79db1");            // body + snout
      box(2.6, 8, 1, 1.4, "#c97f95"); box(6, 8, 1, 1.4, "#c97f95");    // legs
      ctx.fillStyle = "#c97f95"; ctx.beginPath(); ctx.moveTo(3.4 * u, 3.6 * u); ctx.lineTo(4.6 * u, 3.2 * u); ctx.lineTo(4.4 * u, 4.6 * u); ctx.fill();   // ear
      box(4.4, 3.4, 1.4, 0.5, "#8a5563"); dot(8, 5.2, 0.28, "#7d4b59"); // coin slot + nostril
      break;
    case "safe":
      box(1.5, 2, 7, 7, "#4a5158"); box(2.1, 2.6, 5.8, 5.8, "#5b636b");
      dot(5, 5.5, 1.4, "#394046"); dot(5, 5.5, 0.5, "#c9ccd0");          // dial
      box(7, 4.8, 0.7, 1.6, "#c9ccd0");                                  // handle
      box(1.8, 9, 1.2, 0.8, "#3a4046"); box(7, 9, 1.2, 0.8, "#3a4046"); // feet
      break;
    case "workbench":
      box(1, 4.5, 8, 1.2, "#8a6a42"); box(1.6, 5.7, 1, 3.6, "#6e5334"); box(7.4, 5.7, 1, 3.6, "#6e5334");
      box(2.5, 3.6, 1.8, 0.9, "#9aa1a8"); dot(6.5, 4.1, 0.5, "#c0692e"); // vise + tool
      box(5.5, 3.9, 2, 0.4, "#5b636b");
      break;
    case "chair":
      box(2, 3, 1.6, 5.5, "#7d5a8c"); box(2, 5.5, 6, 2.4, "#8f6a9e");   // back + seat
      box(6.6, 5, 1.4, 2.9, "#7d5a8c");                                  // arm
      box(2.4, 7.9, 1, 1.6, "#5e4570"); box(6.8, 7.9, 1, 1.6, "#5e4570");
      break;
    case "bedup":
      box(1, 3.5, 8, 4.5, "#b48a54"); box(1.4, 2.6, 7.2, 3, "#e8e2d4"); // frame + duvet
      box(1.8, 3, 2.4, 1.6, "#d8b8c4");                                  // pillow
      box(1, 7.8, 1, 1.6, "#8a6a42"); box(8, 7.8, 1, 1.6, "#8a6a42");
      break;
    case "fridge":
      box(2.5, 1.5, 5, 8, "#dfe4e8"); box(2.5, 4.4, 5, 0.4, "#aab2ba");
      box(6.4, 2.3, 0.5, 1.6, "#8a9299"); box(6.4, 5.2, 0.5, 2.2, "#8a9299");
      break;
    case "fountain":
      dot(5, 7, 3.4, "#7fa8c9"); dot(5, 7, 2.6, "#a8c8e0");
      box(4.6, 3, 0.8, 4, "#8a9299"); dot(5, 2.8, 0.7, "#c9dfef");
      dot(3.4, 4.2, 0.35, "#c9dfef"); dot(6.6, 4.2, 0.35, "#c9dfef");   // spray
      break;
    case "chest":
      box(1.8, 4, 6.4, 4.6, "#8a6a42"); box(1.8, 3.2, 6.4, 1.6, "#75592f");
      box(1.8, 5.6, 6.4, 0.5, "#5e4a2e");
      box(4.6, 5, 0.9, 1.6, "#d8c25e");                                  // clasp
      break;
    case "oven":
      box(2, 2.5, 6, 7, "#4a4e55"); box(2.7, 4.4, 4.6, 3.4, "#2c2f34");
      dot(4, 5.9, 1.1, "#e8a04a"); dot(5.6, 6.2, 0.7, "#f0c56a");        // the glow
      dot(3, 3.4, 0.4, "#c9ccd0"); dot(4.4, 3.4, 0.4, "#c9ccd0"); dot(5.8, 3.4, 0.4, "#c9ccd0");
      break;
    case "drinkbar":
      box(1.5, 5.5, 7, 1.2, "#8a6a42"); box(2, 6.7, 1, 2.6, "#6e5334"); box(7, 6.7, 1, 2.6, "#6e5334");
      box(2.6, 2.8, 1, 2.7, "#7fb069"); box(4.2, 2.2, 1, 3.3, "#c05252"); box(5.8, 3.1, 1, 2.4, "#e0b345");   // bottles
      dot(7.4, 4.6, 0.8, "#a8c8e0");                                     // a glass
      break;
    case "table":
      dot(5, 5.5, 3.6, "#8a6a42"); dot(5, 5.5, 3, "#9c7a4e");
      dot(3.6, 5, 0.9, "#e8e2d4"); dot(6.4, 5, 0.9, "#e8e2d4"); dot(5, 7, 0.9, "#e8e2d4");   // set places
      break;
    default:                                                             // crafted pieces (chair from the workshop etc.)
      box(2, 3, 6, 5, "#8a6a42"); box(2.5, 3.5, 5, 4, "#9c7a4e");
  }
  ctx.restore();
};
/* the till on the counter — three visible looks: base / light security / high security */
const drawRegisterArt = (ctx, x, y, T, security) => {
  const u = T / 10;
  ctx.save(); ctx.translate(x, y);
  const box = (bx, by, bw, bh, c) => { ctx.fillStyle = c; ctx.fillRect(bx * u, by * u, bw * u, bh * u); };
  // the base till: a squat machine with a keypad and a drawer
  box(2, 3.6, 6, 3.6, security >= 2 ? "#3d4a5c" : security >= 1 ? "#4f5a4a" : "#6e6152");
  box(2.4, 2.4, 5.2, 1.4, "#2c2f34"); box(2.9, 2.7, 4.2, 0.8, "#9fe0a8");    // display
  box(2, 7.2, 6, 1.2, "#4a4438");                                             // drawer
  for (let i = 0; i < 3; i++) for (let j = 0; j < 2; j++) box(2.8 + i * 1.6, 4.2 + j * 1.3, 1, 0.8, "#c9ccd0");   // keys
  if (security >= 1) {                                                        // light: a lock plate on the drawer
    box(6.6, 7.3, 1, 1, "#d8c25e"); ctx.fillStyle = "#4a4438"; ctx.fillRect(6.9 * u, 7.7 * u, 0.4 * u, 0.4 * u);
  }
  if (security >= 2) {                                                        // high: alarm beacon + camera stalk
    ctx.fillStyle = "#c05252"; ctx.beginPath(); ctx.arc(5 * u, 1.7 * u, 0.7 * u, 0, 7); ctx.fill();
    box(4.7, 2, 0.6, 0.6, "#8a3a3a");
    box(0.8, 2.2, 0.5, 5, "#5b636b"); box(0.4, 1.4, 1.6, 1.1, "#394046");     // the little camera
    ctx.fillStyle = "#9fe0a8"; ctx.beginPath(); ctx.arc(1.2 * u, 1.95 * u, 0.3 * u, 0, 7); ctx.fill();
  }
  ctx.restore();
};

const FOOD_BUYERS = ["diner", "mart"];
/* Stage 3.7: what each owner is ALLOWED to put on their menu. Eateries get the
   cooked/baked catalogue (their kitchen makes it); plain stores get non-cooked
   goods and only the simplest baked items. The active menu (a subset, priced by
   the owner) lives in sim.menu[bId]; this is just the legal pool to draw from. */
const SHOP_CANDIDATES = {
  cafe:     ["meal", "coffee", "bread", "fresh_bread", "cookies", "salad", "candy_apple", "cake", "pie", "croissant", "tea", "milk", "fruit"],
  market:   ["snack", "water", "bread", "chocolate", "flowers", "flour", "veg", "sugar", "fruit", "milk", "rock", "candle"],
  fastfood: ["combo", "pizza", "fish_sticks", "noodles", "taco", "water", "coffee", "cookies"],
  diner:    ["stew", "grilled_fish", "veg_soup", "hearty_stew", "fish_sticks", "noodles", "sushi", "cider", "tea", "salad"],
  inn:      ["stew", "salad", "cider", "tea", "bread", "milk"],
  store:    ["snack", "water", "candle", "flowers", "tea", "veg", "fruit", "milk", "bread", "chocolate", "broom", "paint"],
  mart:     ["bread", "snack", "water", "coffee", "tea", "chocolate", "flowers", "rock", "tie", "paint", "stamp", "candle", "broom", "flour", "veg", "sugar", "fruit", "milk", "club", "medicine", "bandage", "knife", "slingshot", "arrow", "bow"],
  furn:     ["piggy", "safe", "bedup", "fridge", "fountain", "chest", "oven", "drinkbar", "table", "candle", "broom", "paint"],   // Stage 4: furniture (fixed-price) + small homewares (menu)
  cafe_s:   ["coffee", "tea", "milk", "choco_milk", "hot_choc", "milkshake", "lemonade", "mocha", "trop_shake", "nutrient", "cookies", "bread", "fresh_bread", "croissant"],   // Stage 3.8
  store_f:  ["bread", "water", "veg", "flour", "milk", "chocolate", "candle"],
  grill_f:  ["stew", "bread", "coffee", "tea", "grilled_fish", "meal"],
  market_s: ["bread", "veg", "fruit", "water", "milk", "flour", "sugar", "chocolate"],
  workshop_s: ["saw", "hammer", "screwdriver", "wood", "rock", "club", "bat", "toy", "pipe", "heatcoil", "nozzle"],
  store_m:  ["bread", "water", "snack", "candle", "rock", "tea", "coffee", "flowers"],
  blackmarket_o: ["crossbow", "bolt", "arrow", "knife", "club", "rock", "slingshot", "bow", "water"],
  grill_o:  ["mystery_stew", "stew", "coffee", "bread", "water"],
};
/* which candidate items are "baked/cooked" — plain stores may carry at most a couple */
const COOKED_ITEMS = new Set(["meal","bread","fresh_bread","cookies","salad","candy_apple","cake","pie","croissant","combo","pizza","fish_sticks","noodles","taco","stew","grilled_fish","veg_soup","hearty_stew","sushi","choco_milk","hot_choc","milkshake","lemonade","mocha","trop_shake","nutrient"]);
/* who owns each business — revenue flows to them, wages flow out of them.
   null = civic (post, HQ): the town mints those paychecks. */
const OWNERS = { cafe: "marge", market: "theo", office: "bruno", fastfood: "rosa", post: "pete",
                 diner: "wren", store: "nadia", mart: "opal", hospital: null /* Stage 3: civic — doctors bill for care instead */, inn: "hollis", hq: null,
                 furn: "juniper",                              // Hearth & Holt — full furniture catalog lands in Stage 4
                 cafe_s: "juno",                               // Stage 3.8: The Grindstone
                 store_f: "hazel", grill_f: "yusuf", clinic_f: null, townhall_f: null,   // Ferndale
                 blackmarket_o: "mara", grill_o: "howl", shack_o1: null, shack_o2: null,   // the Outlands
                 market_s: "delia", store_m: "briggs", workshop_s: "garrick",   // the new quarters
                 townhall_a: null, townhall_m: null, townhall_s: null,
                 watchpost_a: null, watchpost_m: null, clinic_a: null, clinic_m: null };
/* meals each kitchen produces IN-HOUSE (owners cook these into shop stock;
   everything else arrives by delivery order through the post office) */
const KITCHEN = {   // Stage 3.6: what each eatery's chef can produce at the stove
  cafe:     ["meal", "bread", "fresh_bread", "cookies", "salad", "candy_apple", "cake", "pie", "croissant"],
  fastfood: ["combo", "pizza", "fish_sticks", "noodles", "taco", "cookies"],
  diner:    ["stew", "grilled_fish", "veg_soup", "hearty_stew", "fish_sticks", "noodles", "sushi", "salad"],
  inn:      ["stew", "salad", "bread"],
  cafe_s:   ["cookies", "bread", "fresh_bread", "croissant", "choco_milk", "hot_choc", "milkshake", "lemonade", "mocha", "trop_shake", "nutrient"],   // Stage 3.8: drinks + light bakes, no full meals
  grill_f:  ["stew", "bread", "grilled_fish"],   // Ferndale: mill-town comfort food
  grill_o:  ["stew", "mystery_stew"],   // the Outlands: don't ask what's in the pot
};
const EATERY_MEAL = { cafe: "meal", diner: "stew", inn: "stew", cafe_s: "coffee", grill_f: "stew", grill_o: "stew" };    // what a seated NPC consumes
/* five trades; every paid task grants xp in exactly one of them */
const SKILL_TRACKS = {
  crafting: "Crafting",
  mechanic: "Mechanic", office: "Clerical", kitchen: "Cooking", service: "Service", stock: "Logistics", fishing: "Fishing", healthcare: "Medicine", foraging: "Foraging" };   // healthcare was missing (Pass 4 toast bug); foraging is v7 Stage 3
/* Stage 3.7c: DOMAINS — specialties WITHIN a track. Raw track XP helps a little everywhere;
   domain EXPERTISE (earned by repetition, or seeded for veterans) is the big near-guarantee,
   and ONLY in that domain. "Good at something" means good AT SOMETHING, not everything. */
const TASK_DOMAIN = {
  // kitchen
  cake: "pastry", pie: "pastry", cookies: "pastry", croissant: "pastry", candy_apple: "pastry",
  bread: "bread", fresh_bread: "bread", dough: "bread",
  taco: "savory", sushi: "savory", fish_sticks: "savory", stew: "savory", hearty_stew: "savory",
  noodles: "savory", salad: "savory", veg_soup: "savory", grilled_fish: "savory", meal: "savory",
  // office
  printer: "paperwork",                 // coaxing the printer → paperwork expertise
  filing: "sorting", parcel: "sorting", letter: "sorting",   // file/post tasks → sorting expertise
  // Stage 3.8: barista drinks — their own kitchen domain
  choco_milk: "drinks", hot_choc: "drinks", milkshake: "drinks", lemonade: "drinks",
  mocha: "drinks", trop_shake: "drinks", nutrient: "drinks",
};
const DOMAIN_LABEL = { pastry: "Pastry", savory: "Savory", bread: "Baking", paperwork: "Paperwork", sorting: "Sorting", drinks: "Drinks" };
const TASK_TIER_NAME = ["Entry", "Simple", "Hard", "Extreme"];   // Stage 3.7d: difficulty tiers
// how many completions in a domain before an actor EARNS that expertise (permanent, that domain only)
const EXPERTISE_EARN_AT = 40;
// veterans start already-expert in their signature domains (not "good at all of it" — good AT something)
const EXPERTISE_SEED = {
  bruno: { office: ["paperwork", "sorting"] },      // the office fixer — knows the machines and the files
  priya: { office: ["paperwork"] },                 // "some of it" — the printer, not the whole trade
  marge: { kitchen: ["pastry", "bread"] },          // baker
  wren:  { kitchen: ["savory", "bread"] },          // line cook
  rosa:  { kitchen: ["savory"] },
  hollis:{ kitchen: ["bread"] },
  pete:  { stock: ["sorting"] },                     // post — parcels & letters
  juno:  { service: ["drinks"] },                    // Stage 3.8: the barista knows her craft
};
const ROMAN = ["0", "I", "II", "III", "IV", "V", "VI", "VII"];
// Stage 3.7c: a name for each level — the desc reads e.g. "Cooking Novice (II)", "Logistics Master (VII)"
const SKILL_TIER = ["Untrained", "Casual", "Novice", "Apprentice", "Adept", "Professional", "Expert", "Master"];
/* Stage 2 — every employer maps to ONE occupation category (its title ladder)
   and ONE skill track (what promotion is measured against). Spot-based trades
   (fishing dock, graveyard, carpentry) resolve via JOB_TRACK below. */
const JOB_CATEGORY = {
  office: "office", cafe: "service", market: "stock", fastfood: "kitchen",
  diner: "kitchen", store: "stock", mart: "stock", inn: "service",
  hospital: "civic", hq: "civic", post: "trade", furn: "trade", cafe_s: "service",
  clinic_a: "civic", clinic_m: "civic", watchpost_a: "civic", watchpost_m: "civic",   // Stage 2.3
  store_f: "trade", grill_f: "service", clinic_f: "civic", townhall_f: "civic",   // Ferndale
  blackmarket_o: "trade", grill_o: "service",   // the Outlands
  market_s: "trade", store_m: "trade", workshop_s: "trade",   // the new quarters
  townhall_a: "civic", townhall_m: "civic", townhall_s: "civic",
};
/* which skill track governs advancement at each employer (falls back to the
   category name when a business trains its own trade cleanly) */
const JOB_TRACK = {
  office: "office", cafe: "service", market: "stock", fastfood: "kitchen",
  diner: "kitchen", store: "stock", mart: "stock", inn: "service",
  hospital: "service", hq: "service", post: "stock", furn: "stock", cafe_s: "service",
  clinic_a: "service", clinic_m: "service", watchpost_a: "service", watchpost_m: "service",   // Stage 2.3
  store_f: "stock", grill_f: "service", clinic_f: "service", townhall_f: "service",   // Ferndale
  blackmarket_o: "stock", grill_o: "service",   // the Outlands
  market_s: "stock", store_m: "stock", workshop_s: "stock",   // the new quarters
  townhall_a: "office", townhall_m: "office", townhall_s: "office",
};
/* module-level so it's usable at NPC construction (before component-scope
   helpers exist). Resolves a title string for a category+rank, ladder-clamped. */
const titleFor = (category, rank) => {
  const ladder = CFG.OCCUPATION.titles[category] || CFG.OCCUPATION.titles.service;
  return ladder[Math.min(Math.max(rank, 0), ladder.length - 1)];
};
/* seed an occupation record from a def's work.bId. Owners sit at the top rung;
   everyone else starts at rank 0 and climbs via reviewOccupation. Spot-based
   trades (dock, graveyard) with no bId become self-employed tradesfolk. */
const seedOccupation = (def) => {
  const bId = def.work?.bId || null;
  const day = 1;
  if (!bId) {
    // dock fisher, graveyard keeper: independent trade, no employer building
    if (def.work?.spot) {
      const track = def.work.spot === "dock" ? "fishing" : "stock";
      return { bId: null, spot: def.work.spot, category: "trade", track,
               rank: 2, title: titleFor("trade", 2), owner: true, hiredDay: day,
               missed: 0, workedDay: -1, idleSince: null };
    }
    return { bId: null, category: null, track: null, rank: 0, title: "Unemployed",
             owner: false, hiredDay: day, missed: 0, workedDay: -1, idleSince: day };
  }
  const owner = OWNERS[bId] === def.id;
  const category = JOB_CATEGORY[bId] || "service";
  const track = JOB_TRACK[bId] || category;
  const rank = owner ? CFG.OCCUPATION.ownerRank : 0;   // staff earn their rank in-sim
  return { bId, category, track, rank, title: titleFor(category, rank),
           owner, hiredDay: day, missed: 0, workedDay: -1, idleSince: null };
};
/* veterans seed skilled — Priya has filed for years; Gus IS fishing */
const NPC_SKILL_SEED = { priya: { office: 60 }, bruno: { office: 35 }, dex: { office: 8 },
  marge: { kitchen: 60 }, rosa: { kitchen: 35 }, wren: { kitchen: 60 }, hollis: { kitchen: 18 },
  opal: { stock: 35 }, pete: { stock: 35 }, gus: { fishing: 60 }, juniper: { stock: 18 },
  reyes: { service: 18 }, noor: { service: 18 }, briar: { service: 18 } };   // Stage 2.3: lvl-2 medics + working enforcer
const PARTY_MENU = { dinner: ["pizza", "combo"], dessert: ["cake", "pie"], drink: ["cider", "water", "coffee", "tea"] };

/* =====================================================================
   THREE TOWNS — Alderbrook (home), Mossford (commerce), Stonecross
   (civic: hospital, watch HQ, inn, and a graveyard that starts empty)
   ===================================================================== */
const TOWN_DEFS = {
  /* v6: every town roughly doubles in area and becomes a real municipality —
     its own hall, watch presence, clinic access, eat+drink, and graveyard */
  alderbrook: {
    name: "Alderbrook", w: 34, h: 20,
    roadRows: [2, 8, 14], roadCols: [1, 12, 22, 32],
    park: { x: 24, y: 10, w: 6, h: 3 },
    water: { x: 26, y: 11, w: 2, h: 1 },
    grave: { x: 2, y: 16, w: 5, h: 3 },                // small yard south of the road — empty, for now
    drink: { x: 25, y: 11, label: "fountain" },
    busStop: { x: 8, y: 15 },
    trees: [[9, 16], [17, 16], [30, 10], [31, 17], [21, 4]],
    spots: { plaza: { x: 12, y: 8 }, park: { x: 26, y: 12 }, cafe: { x: 4, y: 7 }, market: { x: 9, y: 7 },
             fountain: { x: 25, y: 11 }, homerow: { x: 11, y: 12 }, townhall: { x: 15, y: 7 },
             graveyard: { x: 4, y: 17 }, bench: { x: 28, y: 12 } },
  },
  ferndale: {   // the fourth town — a working-class mill town, mostly ordinary folks
    name: "Ferndale", w: 26, h: 16,
    roadRows: [2, 8, 13], roadCols: [1, 9, 17, 24],
    park: { x: 19, y: 14, w: 4, h: 2 },
    drink: { x: 20, y: 14, label: "fountain" },
    busStop: { x: 6, y: 14 },
    trees: [[2, 14], [15, 14], [25, 7], [8, 7]],
    spots: { plaza: { x: 12, y: 7 }, park: { x: 20, y: 15 }, fountain: { x: 20, y: 14 },
             homerow: { x: 13, y: 11 }, townhall: { x: 12, y: 7 }, bench: { x: 21, y: 15 } },
  },
  hills: {   // v7 Stage 5 capstone: the hills above Alderbrook. One house. One view. No neighbors.
    name: "The Hills", w: 18, h: 11,
    roadRows: [8], roadCols: [2],
    park: { x: 10, y: 8, w: 4, h: 2 },
    drink: { x: 11, y: 8, label: "spring" },
    busStop: { x: 2, y: 9 },   // nothing stops here — legs-safety coord only
    trees: [[3, 2], [7, 1], [12, 2], [15, 4], [5, 6], [14, 7], [9, 3], [16, 9]],
    spots: { plaza: { x: 8, y: 8 }, park: { x: 11, y: 9 }, fountain: { x: 11, y: 8 },
             homerow: { x: 8, y: 8 }, townhall: { x: 8, y: 8 }, bench: { x: 12, y: 9 } },
  },
  outlands: {   // v7 Stage 4: NOT a town — a lawless camp past the tree line. No hall, no
    // Watch, no bus. Absent from approval/treasury-civic/council/patrol maps BY DESIGN.
    name: "The Outlands", w: 24, h: 14,
    roadRows: [7], roadCols: [3, 20],
    park: { x: 9, y: 10, w: 5, h: 2 },
    drink: { x: 10, y: 10, label: "creek" },
    busStop: { x: 2, y: 12 },   // a rotted sign — no fares route here (legs-safety coord only)
    trees: [[1, 1], [5, 2], [9, 1], [14, 2], [18, 1], [22, 3], [1, 5], [6, 5], [16, 5], [21, 6], [2, 9], [6, 11], [15, 11], [19, 10], [22, 12], [12, 5]],
    spots: { plaza: { x: 11, y: 8 }, park: { x: 10, y: 11 }, fountain: { x: 10, y: 10 },
             homerow: { x: 17, y: 8 }, townhall: { x: 11, y: 8 }, bench: { x: 12, y: 11 } },
  },
  mossford: {
    name: "Mossford", w: 36, h: 22,   // the river town spreads: the old bank (unchanged), a river walk east, cottages south
    roadRows: [2, 8, 13, 18], roadCols: [1, 10, 19, 26, 33],
    park: { x: 5, y: 14, w: 3, h: 2 },
    water: { x: 23, y: 14, w: 4, h: 2 },
    water2: { x: 29, y: 17, w: 6, h: 4 },              // the wide bend — the real river, and the far dock
    grave: { x: 15, y: 14, w: 3, h: 2 },
    drink: { x: 12, y: 15, label: "well" },
    busStop: { x: 3, y: 13 },
    trees: [[18, 3], [9, 14], [2, 15], [27, 10], [30, 3], [34, 7], [28, 12], [33, 13], [4, 19], [11, 20], [17, 19], [22, 21], [25, 18], [7, 17]],
    spots: { plaza: { x: 10, y: 8 }, park: { x: 5, y: 14 }, dock: { x: 22, y: 14 }, diner: { x: 4, y: 7 },
             riverwalk: { x: 31, y: 12 }, fardock: { x: 31, y: 16 }, cottages: { x: 14, y: 18 },
             well: { x: 12, y: 15 }, furn: { x: 21, y: 7 }, graveyard: { x: 16, y: 15 }, bench: { x: 6, y: 15 } },
  },
  stonecross: {
    name: "Stonecross", w: 40, h: 24,   // the capital sprawls: the old core (unchanged) + an east quarter and a south commons
    roadRows: [2, 8, 14, 20], roadCols: [1, 11, 20, 28, 37],
    park: { x: 22, y: 15, w: 4, h: 2 },
    grave: { x: 22, y: 9, w: 6, h: 5 },                // the big yard — the government town buries with ceremony
    water: { x: 33, y: 19, w: 5, h: 3 },               // the reservoir: the capital's water, and a second dock
    drink: { x: 10, y: 15, label: "old pump" },
    busStop: { x: 4, y: 15 },
    trees: [[26, 4], [27, 16], [6, 15], [10, 9], [31, 3], [36, 6], [33, 11], [38, 15], [3, 20], [9, 21], [15, 20], [20, 22], [29, 22], [24, 19]],
    spots: { plaza: { x: 11, y: 8 }, graveyard: { x: 24, y: 11 }, hospital: { x: 3, y: 7 }, pump: { x: 10, y: 15 },
             watch: { x: 8, y: 7 }, townhall: { x: 18, y: 7 }, park: { x: 23, y: 15 }, bench: { x: 23, y: 16 },
             eastgate: { x: 34, y: 8 }, commons: { x: 12, y: 20 }, reservoir: { x: 34, y: 18 }, dock: { x: 33, y: 18 } },
  },
};

const BUILDINGS = [
  // --- Alderbrook: the commercial hub ---
  { id: "cafe",        town: "alderbrook", name: "Marge's Café",     x: 2,  y: 3,  w: 4, h: 3, door: { x: 3,  y: 6 },  color: "#c96f4a", roof: "#8f4a30", enterable: true },
  { id: "market",      town: "alderbrook", name: "Theo's Market",    x: 7,  y: 3,  w: 3, h: 3, door: { x: 8,  y: 6 },  color: "#5b8a72", roof: "#3f6152", enterable: true },
  { id: "townhall_a",  town: "alderbrook", name: "Alderbrook Hall",  x: 13, y: 3,  w: 4, h: 3, door: { x: 14, y: 6 },  color: "#b8a86a", roof: "#8a7a42", enterable: true },
  { id: "fastfood",    town: "alderbrook", name: "Crispy Hen",       x: 18, y: 3,  w: 3, h: 3, door: { x: 19, y: 6 },  color: "#d1a23e", roof: "#9c752a", enterable: true },
  { id: "office",      town: "alderbrook", name: "Brightleaf Co.",   x: 24, y: 3,  w: 4, h: 3, door: { x: 25, y: 6 },  color: "#7a86a8", roof: "#525c7d", enterable: true },
  { id: "watchpost_a", town: "alderbrook", name: "Watch Post",       x: 29, y: 3,  w: 3, h: 3, door: { x: 30, y: 6 },  color: "#6a7a9c", roof: "#485570", enterable: true },
  { id: "home_p",      town: "alderbrook", name: "Your House",       x: 2,  y: 10, w: 3, h: 2, door: { x: 3,  y: 12 }, color: "#c9a24a", roof: "#96762e", enterable: true },
  { id: "post",        town: "alderbrook", name: "Post Office",      x: 6,  y: 10, w: 3, h: 2, door: { x: 7,  y: 12 }, color: "#8a6f5b", roof: "#5e4a3a", enterable: true },
  { id: "home_a",      town: "alderbrook", name: "Rowhouse A",       x: 10, y: 10, w: 2, h: 2, door: { x: 10, y: 12 }, color: "#b06a8a", roof: "#7d4560", enterable: true },
  { id: "clinic_a",    town: "alderbrook", name: "Alder Clinic",     x: 14, y: 10, w: 4, h: 3, door: { x: 15, y: 13 }, color: "#a8c0b8", roof: "#70908a", enterable: true },
  { id: "home_c",      town: "alderbrook", name: "Rowhouse C",       x: 19, y: 10, w: 2, h: 2, door: { x: 19, y: 12 }, color: "#6a9ab0", roof: "#45707d", enterable: true },
  // --- Mossford: the craft town ---
  { id: "diner",       town: "mossford",   name: "Rustpan Diner",    x: 2,  y: 3,  w: 4, h: 3, door: { x: 3,  y: 6 },  color: "#b05e50", roof: "#7d3f34", enterable: true },
  { id: "store",       town: "mossford",   name: "Nadia's Goods",    x: 7,  y: 3,  w: 3, h: 3, door: { x: 8,  y: 6 },  color: "#5e7ab0", roof: "#40547d", enterable: true },
  { id: "mart",        town: "mossford",   name: "Bigway Mart",      x: 12, y: 3,  w: 4, h: 3, door: { x: 13, y: 6 },  color: "#4a8ab0", roof: "#31607d", enterable: true },
  /* ---- Stonecross: the east quarter + south commons (the v7 expansion) ---- */
  { id: "market_s",   town: "stonecross", name: "Eastgate Market",  x: 31, y: 3,  w: 4, h: 3, door: { x: 32, y: 6 },  color: "#5a8a6a", roof: "#3e6048", enterable: true },
  { id: "home_s1",    town: "stonecross", name: "Eastgate Row 1",   x: 31, y: 10, w: 2, h: 2, door: { x: 31, y: 12 }, color: "#9a8a7a", roof: "#6e6254", enterable: true },
  { id: "home_s2",    town: "stonecross", name: "Eastgate Row 2",   x: 35, y: 10, w: 2, h: 2, door: { x: 35, y: 12 }, color: "#7a8a9a", roof: "#54626e", enterable: true },
  { id: "home_s3",    town: "stonecross", name: "Commons Cottage",  x: 6,  y: 17, w: 2, h: 2, door: { x: 6,  y: 19 }, color: "#8a9a7a", roof: "#626e54", enterable: true },
  { id: "home_s4",    town: "stonecross", name: "Old Mill House",   x: 17, y: 16, w: 3, h: 3, door: { x: 18, y: 19 }, color: "#9a7a6a", roof: "#6e5648", enterable: true },
  /* ---- Mossford: the river walk + south cottages (the v7 expansion) ---- */
  { id: "store_m",    town: "mossford",   name: "Riverwalk Goods",  x: 29, y: 3,  w: 4, h: 3, door: { x: 30, y: 6 },  color: "#5a7a9a", roof: "#3e5670", enterable: true },
  { id: "home_m1",    town: "mossford",   name: "Riverwalk Flat",   x: 29, y: 9,  w: 2, h: 2, door: { x: 29, y: 11 }, color: "#7a9a8a", roof: "#546e62", enterable: true },
  { id: "home_m2",    town: "mossford",   name: "Bend Cottage",     x: 33, y: 9,  w: 2, h: 2, door: { x: 33, y: 11 }, color: "#9a8a5a", roof: "#6e6240", enterable: true },
  { id: "home_m3",    town: "mossford",   name: "South Cottage",    x: 8,  y: 16, w: 2, h: 2, door: { x: 8,  y: 18 }, color: "#8a7a9a", roof: "#62566e", enterable: true },
  { id: "home_m4",    town: "mossford",   name: "Willow House",     x: 20, y: 16, w: 3, h: 3, door: { x: 21, y: 19 }, color: "#7a9a6a", roof: "#546e48", enterable: true },
  { id: "hillhouse",   town: "hills",      name: "Hillcrest Manor",  x: 6,  y: 3,  w: 6, h: 4, door: { x: 8,  y: 7 },  color: "#8a7a5a", roof: "#5e5240", enterable: true },
  { id: "workshop_s",  town: "stonecross", name: "Garrick's Works",  x: 11, y: 16, w: 4, h: 3, door: { x: 12, y: 19 }, color: "#7a6a4a", roof: "#564a32", enterable: true },
  /* ---- The Outlands: the lawless camp ---- */
  { id: "blackmarket_o", town: "outlands", name: "The Exchange",  x: 5,  y: 3,  w: 4, h: 3, door: { x: 6,  y: 6 },  color: "#4a4040", roof: "#2e2828", enterable: true },
  { id: "grill_o",       town: "outlands", name: "The Last Pot",  x: 15, y: 3,  w: 4, h: 3, door: { x: 16, y: 6 },  color: "#5a4a3a", roof: "#3a3028", enterable: true },
  { id: "shack_o1",      town: "outlands", name: "Mara's Shack",  x: 5,  y: 9,  w: 2, h: 2, door: { x: 5,  y: 11 }, color: "#5a5248", roof: "#3a352e", enterable: true },
  { id: "shack_o2",      town: "outlands", name: "Howl's Shack",  x: 17, y: 9,  w: 2, h: 2, door: { x: 17, y: 11 }, color: "#4a5248", roof: "#2e352e", enterable: true },
  /* ---- Ferndale: the mill town ---- */
  { id: "townhall_f",  town: "ferndale",   name: "Ferndale Hall",    x: 11, y: 3,  w: 4, h: 3, door: { x: 12, y: 6 },  color: "#b0a080", roof: "#7d7058", enterable: true },
  { id: "clinic_f",    town: "ferndale",   name: "Ferndale Clinic",  x: 19, y: 3,  w: 4, h: 3, door: { x: 20, y: 6 },  color: "#a8c0b8", roof: "#70908a", enterable: true },
  { id: "store_f",     town: "ferndale",   name: "Mill Supply Co.",  x: 3,  y: 3,  w: 3, h: 3, door: { x: 4,  y: 6 },  color: "#8a9a5a", roof: "#5e6b3a", enterable: true },
  { id: "grill_f",     town: "ferndale",   name: "The Millstone",    x: 3,  y: 9,  w: 4, h: 3, door: { x: 4,  y: 12 }, color: "#b07a4a", roof: "#7d5530", enterable: true },
  { id: "home_f1",     town: "ferndale",   name: "Hazel's House",    x: 11, y: 9,  w: 2, h: 2, door: { x: 11, y: 11 }, color: "#a08a70", roof: "#6f5e4a", enterable: true },
  { id: "home_f2",     town: "ferndale",   name: "Yusuf's Place",    x: 14, y: 9,  w: 2, h: 2, door: { x: 14, y: 11 }, color: "#7a90a0", roof: "#526470", enterable: true },
  { id: "home_f3",     town: "ferndale",   name: "Sana's Cottage",  x: 19, y: 9,  w: 2, h: 2, door: { x: 19, y: 11 }, color: "#90a07a", roof: "#647052", enterable: true },
  { id: "home_f4",     town: "ferndale",   name: "The Corner Flat",  x: 22, y: 9,  w: 2, h: 2, door: { x: 22, y: 11 }, color: "#a07a90", roof: "#705264", enterable: true },
  { id: "home_f5",     town: "ferndale",   name: "Mill Row 5",       x: 7,  y: 9,  w: 2, h: 2, door: { x: 7,  y: 11 }, color: "#8a7aa0", roof: "#5e5270", enterable: true },
  { id: "home_f6",     town: "ferndale",   name: "Mill Row 6",       x: 24, y: 9,  w: 2, h: 2, door: { x: 24, y: 11 }, color: "#a09a6a", roof: "#706b48", enterable: true },
  { id: "furn",        town: "mossford",   name: "Hearth & Holt",    x: 20, y: 3,  w: 4, h: 3, door: { x: 21, y: 6 },  color: "#a07a50", roof: "#735536", enterable: true },
  { id: "home_w",      town: "mossford",   name: "Wren's Place",     x: 2,  y: 10, w: 2, h: 2, door: { x: 2,  y: 12 }, color: "#a08ac0", roof: "#6f5c8d", enterable: true },
  { id: "home_g",      town: "mossford",   name: "Gus's Shack",      x: 5,  y: 10, w: 2, h: 2, door: { x: 5,  y: 12 }, color: "#7a8a5b", roof: "#525e3d", enterable: true },
  { id: "home_m",      town: "mossford",   name: "Milo's Loft",      x: 8,  y: 10, w: 2, h: 2, door: { x: 8,  y: 12 }, color: "#c98a4a", roof: "#8f5f30", enterable: true },
  { id: "home_j",      town: "mossford",   name: "Holt Cottage",     x: 11, y: 10, w: 2, h: 2, door: { x: 11, y: 12 }, color: "#8a6f4a", roof: "#5e4a30", enterable: true },
  { id: "townhall_m",  town: "mossford",   name: "Mossford Hall",    x: 14, y: 10, w: 4, h: 3, door: { x: 15, y: 13 }, color: "#b8a86a", roof: "#8a7a42", enterable: true },
  { id: "watchpost_m", town: "mossford",   name: "Watch Post",       x: 20, y: 10, w: 2, h: 3, door: { x: 20, y: 13 }, color: "#6a7a9c", roof: "#485570", enterable: true },
  { id: "clinic_m",    town: "mossford",   name: "Moss Clinic",      x: 23, y: 10, w: 3, h: 3, door: { x: 24, y: 13 }, color: "#a8c0b8", roof: "#70908a", enterable: true },
  // --- Stonecross: the government town ---
  { id: "hospital",    town: "stonecross", name: "Mercy Hospital",   x: 2,  y: 3,  w: 4, h: 3, door: { x: 3,  y: 6 },  color: "#b0b8c8", roof: "#7d8494", enterable: true },
  { id: "hq",          town: "stonecross", name: "Stonecross Watch", x: 7,  y: 3,  w: 3, h: 3, door: { x: 8,  y: 6 },  color: "#6a7a9c", roof: "#485570", enterable: true },
  { id: "inn",         town: "stonecross", name: "Quiet Lantern Inn",x: 13, y: 3,  w: 3, h: 3, door: { x: 14, y: 6 },  color: "#a8885a", roof: "#7a6240", enterable: true },
  { id: "townhall_s",  town: "stonecross", name: "Stonecross Hall",  x: 17, y: 3,  w: 3, h: 3, door: { x: 18, y: 6 },  color: "#b8a86a", roof: "#8a7a42", enterable: true },
  { id: "home_d",      town: "stonecross", name: "Doctor's House",   x: 2,  y: 10, w: 2, h: 2, door: { x: 2,  y: 12 }, color: "#8ab0a0", roof: "#5e7d70", enterable: true },
  { id: "home_h",      town: "stonecross", name: "Watch House",      x: 5,  y: 10, w: 2, h: 2, door: { x: 5,  y: 12 }, color: "#9c8a6a", roof: "#6e6048", enterable: true },
  { id: "home_f",      town: "stonecross", name: "Keeper's Shack",   x: 8,  y: 10, w: 2, h: 2, door: { x: 8,  y: 12 }, color: "#7a7a6a", roof: "#565648", enterable: true },
  { id: "home_o",      town: "stonecross", name: "Vance Manor",      x: 13, y: 10, w: 4, h: 3, door: { x: 14, y: 13 }, color: "#8a6a9c", roof: "#5e4570", enterable: true },  // the mayor lives LARGE
  { id: "cafe_s",      town: "stonecross", name: "The Grindstone",    x: 22, y: 3,  w: 4, h: 3, door: { x: 23, y: 6 },  color: "#a5764a", roof: "#6e4d30", enterable: true },   // Stage 3.8: the only café outside Alderbrook
  { id: "home_j2",     town: "stonecross", name: "Barista's Flat",    x: 18, y: 10, w: 2, h: 2, door: { x: 18, y: 12 }, color: "#b0885a", roof: "#7d5e3a", enterable: true }
];

/* Interiors — new solid chars: 'W' washbasin. Stations sit on floor tiles.
   home_p gained a stove + bathroom; eateries gained washrooms + stoves;
   Stonecross adds hospital (ward beds), HQ (cells), inn (rentable beds). */
const INTERIOR_DEFS = {
  cafe: {
    rows: ["##########", "#G......W#", "#.KK.KKK.#", "#........#", "#.TT..TT.#", "#........#", "####D#####"],
    stations: { stove: { x: 1, y: 3, label: "Stove" }, wash: { x: 8, y: 3, label: "Washroom" }, staff: { x: 4, y: 1 }, counter: { x: 4, y: 3, label: "Café counter" }, couch: { x: 7, y: 5, label: "Staff couch" } },
    seats: [{ x: 1, y: 4 }, { x: 4, y: 4 }, { x: 5, y: 4 }, { x: 8, y: 4 }],
    floor: "#e8d9bd", wall: "#8f4a30",
  },
  cafe_s: {   // Stage 3.8: The Grindstone — a drink bar with light baked goods, no full kitchen
    rows: ["##########", "#G......W#", "#.KK.KKK.#", "#........#", "#.TT..TT.#", "#........#", "####D#####"],
    stations: { drinks: { x: 2, y: 3, label: "Drink bar" }, wash: { x: 8, y: 3, label: "Washroom" }, staff: { x: 4, y: 1 }, counter: { x: 4, y: 3, label: "Counter" }, couch: { x: 7, y: 5, label: "Staff couch" } },
    seats: [{ x: 1, y: 4 }, { x: 4, y: 4 }, { x: 5, y: 4 }, { x: 8, y: 4 }],
    floor: "#e6dcc4", wall: "#6e4d30",
  },
  market: {
    rows: ["#########", "#.......#", "#.KK.KK.#", "#.......#", "#T.T.T.T#", "#.......#", "####D####"],
    stations: { staff: { x: 4, y: 1 }, shop: { x: 4, y: 3, label: "Market counter" }, couch: { x: 6, y: 5, label: "Staff couch" } },
    seats: [], floor: "#d9e0cc", wall: "#3f6152",
  },
  office: {
    rows: ["###########", "#T.T.T.T..#", "#.........#", "#.........#", "#.........#", "#####D#####"],
    stations: { desk_priya: { x: 1, y: 2 }, desk_bruno: { x: 3, y: 2 }, desk_dex: { x: 5, y: 2 }, desk_you: { x: 7, y: 2, label: "Your desk" }, couch: { x: 9, y: 3, label: "Staff couch" } },
    seats: [], floor: "#dcdfe8", wall: "#525c7d",
  },
  fastfood: {
    rows: ["##########", "#GG......#", "#........#", "#.KKK.KK.#", "#........#", "#.TT..TT.#", "####D#####"],
    stations: { grill: { x: 2, y: 2, label: "Grill" }, staff: { x: 6, y: 2 }, counter: { x: 6, y: 4, label: "Order counter" }, couch: { x: 8, y: 4, label: "Staff couch" } },
    seats: [{ x: 1, y: 4 }, { x: 8, y: 4 }], floor: "#efe2c4", wall: "#9c752a",
  },
  post: {
    rows: ["#########", "#MM...MM#", "#.......#", "#.KKK.K.#", "#.......#", "####D####"],
    stations: { staff: { x: 3, y: 2 }, mail: { x: 3, y: 4, label: "Mail counter" }, couch: { x: 6, y: 2, label: "Staff couch" } },
    seats: [], floor: "#e3dbcf", wall: "#5e4a3a",
  },
  home_p: {
    rows: ["#########", "#B.G...W#", "#.......#", "#..TT...#", "#.......#", "####D####"],
    stations: { bed: { x: 1, y: 2, label: "Bedside" }, stove: { x: 3, y: 2, label: "Stove" }, bath: { x: 7, y: 2, label: "Bathroom" }, table: { x: 2, y: 4, label: "Dining table" } },
    seats: [{ x: 1, y: 4 }, { x: 5, y: 4 }, { x: 6, y: 4 }], floor: "#e8d9bd", wall: "#96762e",
  },
  home_a: {
    rows: ["#########", "#B.G...W#", "#.......#", "#..TT...#", "#.......#", "####D####"],
    stations: { bed: { x: 1, y: 2, label: "Bedside" }, stove: { x: 3, y: 2, label: "Stove" }, bath: { x: 7, y: 2, label: "Bathroom" }, table: { x: 2, y: 4, label: "Dining table" } },
    seats: [{ x: 1, y: 4 }, { x: 5, y: 4 }, { x: 6, y: 4 }], floor: "#f0e0e8", wall: "#7d4560",
  },
  home_c: {
    rows: ["#########", "#B.G...W#", "#.......#", "#..TT...#", "#.......#", "####D####"],
    stations: { bed: { x: 1, y: 2, label: "Bedside" }, stove: { x: 3, y: 2, label: "Stove" }, bath: { x: 7, y: 2, label: "Bathroom" }, table: { x: 2, y: 4, label: "Dining table" } },
    seats: [{ x: 1, y: 4 }, { x: 5, y: 4 }, { x: 6, y: 4 }], floor: "#e0ecf0", wall: "#45707d",
  },
  home_w: {
    rows: ["#########", "#B.G...W#", "#.......#", "#..TT...#", "#.......#", "####D####"],
    stations: { bed: { x: 1, y: 2, label: "Bedside" }, stove: { x: 3, y: 2, label: "Stove" }, bath: { x: 7, y: 2, label: "Bathroom" }, table: { x: 2, y: 4, label: "Dining table" } },
    seats: [{ x: 1, y: 4 }, { x: 5, y: 4 }, { x: 6, y: 4 }], floor: "#e8e0f0", wall: "#6f5c8d",
  },
  home_g: {
    rows: ["#########", "#B.G...W#", "#.......#", "#..TT...#", "#.......#", "####D####"],
    stations: { bed: { x: 1, y: 2, label: "Bedside" }, stove: { x: 3, y: 2, label: "Stove" }, bath: { x: 7, y: 2, label: "Bathroom" }, table: { x: 2, y: 4, label: "Dining table" } },
    seats: [{ x: 1, y: 4 }, { x: 5, y: 4 }, { x: 6, y: 4 }], floor: "#e8ecdc", wall: "#525e3d",
  },
  home_m: {
    rows: ["#########", "#B.G...W#", "#.......#", "#..TT...#", "#.......#", "####D####"],
    stations: { bed: { x: 1, y: 2, label: "Bedside" }, stove: { x: 3, y: 2, label: "Stove" }, bath: { x: 7, y: 2, label: "Bathroom" }, table: { x: 2, y: 4, label: "Dining table" } },
    seats: [{ x: 1, y: 4 }, { x: 5, y: 4 }, { x: 6, y: 4 }], floor: "#f0e4d4", wall: "#8f5f30",
  },
  home_j: {
    rows: ["#########", "#B.G...W#", "#.......#", "#..TT...#", "#.......#", "####D####"],
    stations: { bed: { x: 1, y: 2, label: "Bedside" }, stove: { x: 3, y: 2, label: "Stove" }, bath: { x: 7, y: 2, label: "Bathroom" }, table: { x: 2, y: 4, label: "Dining table" } },
    seats: [{ x: 1, y: 4 }, { x: 5, y: 4 }, { x: 6, y: 4 }], floor: "#efe6d8", wall: "#7d5e3a",
  },
  home_d: {
    rows: ["#########", "#B.G...W#", "#.......#", "#..TT...#", "#.......#", "####D####"],
    stations: { bed: { x: 1, y: 2, label: "Bedside" }, stove: { x: 3, y: 2, label: "Stove" }, bath: { x: 7, y: 2, label: "Bathroom" }, table: { x: 2, y: 4, label: "Dining table" } },
    seats: [{ x: 1, y: 4 }, { x: 5, y: 4 }, { x: 6, y: 4 }], floor: "#dcf0e8", wall: "#5e7d70",
  },
  home_h: {
    rows: ["#########", "#B.G...W#", "#.......#", "#..TT...#", "#.......#", "####D####"],
    stations: { bed: { x: 1, y: 2, label: "Bedside" }, stove: { x: 3, y: 2, label: "Stove" }, bath: { x: 7, y: 2, label: "Bathroom" }, table: { x: 2, y: 4, label: "Dining table" } },
    seats: [{ x: 1, y: 4 }, { x: 5, y: 4 }, { x: 6, y: 4 }], floor: "#eee8dc", wall: "#6e6048",
  },
  home_f: {
    rows: ["#########", "#B.G...W#", "#.......#", "#..TT...#", "#.......#", "####D####"],
    stations: { bed: { x: 1, y: 2, label: "Bedside" }, stove: { x: 3, y: 2, label: "Stove" }, bath: { x: 7, y: 2, label: "Bathroom" }, table: { x: 2, y: 4, label: "Dining table" } },
    seats: [{ x: 1, y: 4 }, { x: 5, y: 4 }, { x: 6, y: 4 }], floor: "#e8e8e0", wall: "#565648",
  },
  home_o: {
    rows: ["###########", "#B..G....W#", "#.........#", "#..TT.TT..#", "#.........#", "#........W#", "#####D#####"],
    stations: { bed: { x: 1, y: 2, label: "Bedside" }, stove: { x: 4, y: 2, label: "Stove" }, bath: { x: 8, y: 2, label: "Bathroom" }, table: { x: 2, y: 4, label: "Dining table" } },
    seats: [{ x: 1, y: 4 }, { x: 5, y: 4 }, { x: 7, y: 4 }, { x: 1, y: 5 }, { x: 4, y: 5 }, { x: 6, y: 5 }], floor: "#efe4f0", wall: "#5e4570",
  },
  home_j2: {
    rows: ["#########", "#B.G...W#", "#.......#", "#..TT...#", "#.......#", "####D####"],
    stations: { bed: { x: 1, y: 2, label: "Bedside" }, stove: { x: 3, y: 2, label: "Stove" }, bath: { x: 7, y: 2, label: "Bathroom" }, table: { x: 2, y: 4, label: "Dining table" } },
    seats: [{ x: 1, y: 4 }, { x: 5, y: 4 }, { x: 6, y: 4 }], floor: "#f0e6d8", wall: "#7d5e3a",
  },

  diner: {
    rows: ["#########", "#G.....W#", "#.KK.KK.#", "#.......#", "#.TT.TT.#", "#.......#", "####D####"],
    stations: { stove: { x: 1, y: 3, label: "Stove" }, wash: { x: 7, y: 3, label: "Washroom" }, staff: { x: 4, y: 1 }, counter: { x: 4, y: 3, label: "Diner counter" }, couch: { x: 6, y: 5, label: "Staff couch" } },
    seats: [{ x: 1, y: 4 }, { x: 4, y: 4 }, { x: 7, y: 4 }], floor: "#e6d2c4", wall: "#7d3f34",
  },
  store: {
    rows: ["#########", "#.......#", "#.KK.KK.#", "#.......#", "#T.T.T.T#", "#.......#", "####D####"],
    stations: { staff: { x: 4, y: 1 }, shop: { x: 4, y: 3, label: "Store counter" }, couch: { x: 6, y: 5, label: "Staff couch" } },
    seats: [], floor: "#d6dce6", wall: "#40547d",
  },
  mart: {
    rows: ["###########", "#.........#", "#MM.MM.MM.#", "#.........#", "#MM.MM.MM.#", "#.........#", "#.KKK.....#", "#####D#####"],
    stations: { staff: { x: 3, y: 5 }, shop: { x: 5, y: 6, label: "Mart checkout" }, couch: { x: 8, y: 5, label: "Staff couch" } },
    seats: [], floor: "#dde6ea", wall: "#31607d",
  },
  hospital: {
    rows: ["###########", "#BB.BB.BB.#", "#.........#", "#...KK....#", "#.........#", "#W........#", "#####D#####"],
    stations: { doctor: { x: 5, y: 2, label: "Doing rounds" }, treat: { x: 4, y: 4, label: "Reception" }, wash: { x: 1, y: 4, label: "Washroom" }, couch: { x: 8, y: 4, label: "Staff couch" } },
    bedSpots: [{ x: 1, y: 2 }, { x: 4, y: 2 }, { x: 7, y: 2 }],   // ward beds — the incapacitated wake up here
    seats: [], floor: "#e8ecf0", wall: "#7d8494",
  },
  hq: {
    rows: ["############", "#BB....B#..#", "#......L#..#", "#..KK..L#..#", "#......L#..#", "#####D######"],
    stations: { duty: { x: 5, y: 3, label: "Duty desk" }, report: { x: 3, y: 1, label: "Report desk" }, couch: { x: 1, y: 4, label: "Staff couch" } },
    cellSpots: [{ x: 9, y: 1 }, { x: 9, y: 2 }, { x: 9, y: 3 }],   // Stage 2.3: main lockup — 3 holding cells (walkable floor behind bars)
    seats: [], floor: "#d8dce4", wall: "#485570",
  },
  inn: {
    rows: ["##########", "#BB.BB..W#", "#........#", "#.KK.....#", "#........#", "#.TT.....#", "####D#####"],
    stations: { staff: { x: 2, y: 2 }, inn: { x: 2, y: 4, label: "Inn counter" }, rentbed: { x: 3, y: 2, label: "Guest bed" }, wash: { x: 8, y: 2, label: "Washroom" }, couch: { x: 6, y: 4, label: "Staff couch" } },
    seats: [{ x: 1, y: 5 }], floor: "#e8dcc4", wall: "#7a6240",
  },
  /* v6 civic set: each town's hall (tax window + town safe), local Watch
     posts (report crimes without the bus ride), walk-in clinics, and the
     furnishing store. Hall safes become the town treasuries in Stage 6. */
  townhall_a: {
    rows: ["##########", "#T......T#", "#..KKKK..#", "#........#", "#.MM..GG.#", "#........#", "####D#####"],
    stations: { mayor: { x: 1, y: 3, label: "Mayor's desk" }, tax: { x: 4, y: 3, label: "Tax window" }, safe: { x: 6, y: 5, label: "Town safe" }, couch: { x: 8, y: 3, label: "Staff couch" } },
    seats: [], floor: "#e8e2cc", wall: "#8a7a42",
  },
  townhall_m: {
    rows: ["##########", "#T......T#", "#..KKKK..#", "#........#", "#.MM..GG.#", "#........#", "####D#####"],
    stations: { mayor: { x: 1, y: 3, label: "Mayor's desk" }, tax: { x: 4, y: 3, label: "Tax window" }, safe: { x: 6, y: 5, label: "Town safe" }, couch: { x: 8, y: 3, label: "Staff couch" } },
    seats: [], floor: "#e8e2cc", wall: "#8a7a42",
  },
  townhall_s: {
    rows: ["##########", "#T......T#", "#..KKKK..#", "#........#", "#.MM..GG.#", "#........#", "####D#####"],
    stations: { mayor: { x: 1, y: 3, label: "Mayor's desk" }, tax: { x: 4, y: 3, label: "Tax window" }, safe: { x: 6, y: 5, label: "Town safe" }, couch: { x: 8, y: 3, label: "Staff couch" } },
    seats: [], floor: "#ece4ca", wall: "#8a7a42",
  },
  watchpost_a: {
    rows: ["##########", "#KK...L#.#", "#.....L#.#", "#.T...L#.#", "####D#####"],
    stations: { duty: { x: 4, y: 1, label: "Duty desk" }, report: { x: 4, y: 3, label: "Report desk" }, couch: { x: 1, y: 2, label: "Staff couch" } },
    cellSpots: [{ x: 8, y: 1 }, { x: 8, y: 3 }],                  // Stage 2.3: 2 holding cells
    seats: [], floor: "#d8dce4", wall: "#485570",
  },
  watchpost_m: {
    rows: ["##########", "#KK...L#.#", "#.....L#.#", "#.T...L#.#", "####D#####"],
    stations: { duty: { x: 4, y: 1, label: "Duty desk" }, report: { x: 4, y: 3, label: "Report desk" }, couch: { x: 1, y: 2, label: "Staff couch" } },
    cellSpots: [{ x: 8, y: 1 }, { x: 8, y: 3 }],                  // Stage 2.3: 2 holding cells
    seats: [], floor: "#d8dce4", wall: "#485570",
  },
  clinic_a: {
    rows: ["#########", "#B..KK..#", "#.......#", "#W......#", "####D####"],
    stations: { treat: { x: 4, y: 2, label: "Clinic desk" }, couch: { x: 6, y: 2, label: "Staff couch" } },
    seats: [], floor: "#e8f0ec", wall: "#70908a",
  },
  clinic_m: {
    rows: ["#########", "#B..KK..#", "#.......#", "#W......#", "####D####"],
    stations: { treat: { x: 4, y: 2, label: "Clinic desk" }, couch: { x: 6, y: 2, label: "Staff couch" } },
    seats: [], floor: "#e8f0ec", wall: "#70908a",
  },
  furn: {
    rows: ["###########", "#MM.MM.MM.#", "#.........#", "#.TT..TT..#", "#.........#", "#.KKK.....#", "#####D#####"],
    stations: { staff: { x: 7, y: 5 }, shop: { x: 5, y: 5, label: "Holt counter" }, couch: { x: 8, y: 4, label: "Staff couch" } },
    seats: [], floor: "#e8dcc8", wall: "#735536",
  },
};
/* which wash station an NPC in each town heads for when they get ripe */
/* Hillcrest Manor — the biggest interior in the game: a bed, a hearth, and ROOM */
INTERIOR_DEFS.hillhouse = {
  rows: ["###########", "#.........#", "#.B......K#", "#.........#", "#....T....#", "#.........#", "#####D#####"],
  stations: { bed: { x: 2, y: 3, label: "The big bed" }, hearth: { x: 9, y: 3, label: "Hearth" }, table: { x: 5, y: 5, label: "Oak table" } },   // on the floor BESIDE the furniture glyphs
  seats: [], floor: "#e0d4bc", wall: "#4a3e2e",
};

/* The workshop interior — explicit (not a clone): it needs a WORKBENCH station */
INTERIOR_DEFS.workshop_s = {
  rows: ["#########", "#.......#", "#.KK.KK.#", "#.......#", "#T.T.T.T#", "#.......#", "####D####"],
  stations: { staff: { x: 4, y: 1 }, shop: { x: 4, y: 3, label: "Workshop counter" }, bench: { x: 2, y: 5, label: "Workbench" }, couch: { x: 6, y: 5, label: "Staff couch" } },
  seats: [], floor: "#d8d0bc", wall: "#4a4232",
};

/* Expansion interiors — the new quarters, cloned from proven templates */
for (const [nid, tpl] of [["market_s","market"],["store_m","mart"],
                          ["home_s1","home_w"],["home_s2","home_w"],["home_s3","home_w"],["home_s4","home_w"],
                          ["home_m1","home_w"],["home_m2","home_w"],["home_m3","home_w"],["home_m4","home_w"]])
  INTERIOR_DEFS[nid] = { ...INTERIOR_DEFS[tpl] };

/* Outlands interiors — cloned; the camp is scrappy but functional */
for (const [nid, tpl] of [["blackmarket_o","mart"],["grill_o","diner"],["shack_o1","home_w"],["shack_o2","home_w"]])
  INTERIOR_DEFS[nid] = { ...INTERIOR_DEFS[tpl] };

/* Ferndale interiors — cloned from proven templates (same rows/stations/seats) */
for (const [nid, tpl] of [["home_f1","home_w"],["home_f2","home_w"],["home_f3","home_w"],["home_f4","home_w"],["home_f5","home_w"],["home_f6","home_w"],
                          ["store_f","mart"],["grill_f","diner"],["clinic_f","clinic_a"],["townhall_f","townhall_a"]])
  INTERIOR_DEFS[nid] = { ...INTERIOR_DEFS[tpl] };

const TOWN_WASH = { alderbrook: { bId: "cafe", st: "wash" }, mossford: { bId: "diner", st: "wash" }, stonecross: { bId: "inn", st: "wash" }, ferndale: { bId: "grill_f", st: "wash" }, outlands: { bId: "grill_o", st: "wash" }, hills: { bId: "cafe", st: "wash" } };
/* Where a hungry local sits down to eat. This WAS a hardcoded 3-town ternary that silently
   sent Ferndale and Outlands residents to the Stonecross inn — a town they'd never reach.
   They starved with food in the shops. Every new town MUST land here. */
const TOWN_EATERY = { alderbrook: "cafe", mossford: "diner", stonecross: "inn", ferndale: "grill_f", outlands: "grill_o", hills: "cafe" };   // the hills eat down in Alderbrook

/* ===== NPC ROSTER =====
   New in v4: hygiene/health seeds, and roles — thief (Dex: the night
   guard has been the thief all along), enforcers (Cole, Tessa), doctor
   (Amara), innkeeper (Hollis), and Finn, a criminal quietly in hiding
   who tends an empty graveyard and avoids the Watch. `minor` flags kids
   for the incident fallback (they flee, never intervene). */
const NPC_DEFS = [
  /* --- v6 additions: the shopkeeper of Hearth & Holt, and the man whose
     job (and troubles) arrive in Stage 6 — for now, a well-dressed
     townsperson at a very nice desk --- */
  { id: "juniper", name: "Juniper", town: "mossford", color: "#a07a50", home: "home_j",
    desc: "the 41-year-old carpenter who runs Hearth & Holt", personality: "measures twice, sawdust in her hair, quietly proud of every joint she's ever cut, immune to haggling",
    work: { bId: "furn", station: "staff" }, schedule: [9, 18],
    coins: 24, startInv: { candle: 2, tea: 1 }, fame: 10, renown: 18,
    likes: ["honest wood", "well-oiled hinges", "strong tea"], dislikes: ["wobbly furniture", "haggling", "veneer"],
    rel: { wren: "friend", opal: "likes", nadia: "likes" },
    greets: ["Solid oak. Feel that? SOLID.", "A good chair outlives its maker.", "No haggling. The price is the price."] },
  { id: "odell", name: "Odell Vance", town: "stonecross", color: "#8a6a9c", home: "home_o",
    desc: "the 55-year-old career politician, the region's most seasoned council voice (and mayor, whenever the chair is his)", personality: "silver-tongued, genuinely civic-minded underneath the vanity, obsessed with his legacy, counts the treasury twice",
    work: { bId: "townhall_s", station: "mayor" }, schedule: [9, 16],
    coins: 60, startInv: { tie: 1, coffee: 1 }, fame: 20, renown: 45,
    likes: ["ribbon cuttings", "balanced ledgers", "his own speeches"], dislikes: ["tax dodgers", "mess near the hall", "being interrupted"],
    rel: { bruno: "likes", hollis: "friend", cole: "likes", dex: "dislikes" },
    greets: ["A citizen! Wonderful. Vote... well, when that's a thing.", "The ledgers balance. Mostly.", "Legacy, friend. It's all about legacy."] },
  // --- Alderbrook ---
  { id: "marge", name: "Marge", town: "alderbrook", color: "#e2543e", home: "home_a",
    desc: "the 58-year-old baker who runs the café", personality: "warm, chatty, hopeless gossip, feeds everyone whether they like it or not",
    work: { bId: "cafe", station: "staff" }, schedule: [6, 17],
    coins: 20, startInv: { bread: 2, flour: 1 }, fame: 18, renown: 30, cooks: ["meal"],
    likes: ["fresh bread smell", "town gossip", "feeding people"], dislikes: ["wasted food", "Bruno's speeches"],
    rel: { eleanor: "friend", sam: "likes", bruno: "dislikes" },
    greets: ["Fresh rolls just came out, dear!", "You look thin. Eat something.", "Have you heard about Bruno's new tie? Awful."] },
  { id: "theo", name: "Theo", town: "alderbrook", color: "#3e7a5e", home: "home_c",
    desc: "the gruff 45-year-old shopkeeper", personality: "gruff, frugal, secretly kind, complains about wholesale prices constantly",
    work: { bId: "market", station: "staff" }, schedule: [7, 19],
    coins: 30, startInv: { chocolate: 1 }, fame: 4, renown: 22,
    likes: ["a balanced ledger", "quiet mornings"], dislikes: ["haggling", "Bruno's tie budget"],
    rel: { bruno: "dislikes", eleanor: "likes", nadia: "hates", sam: "likes" },
    greets: ["Buy something or browse quieter.", "Prices went up. Not my fault.", "Hmph. Morning."] },
  { id: "priya", name: "Priya", town: "alderbrook", color: "#4a6fd1", home: "home_c",
    desc: "a 29-year-old ambitious office analyst", personality: "ambitious, over-caffeinated, speaks in productivity metaphors, kind under the hustle",
    work: { bId: "office", station: "desk_priya" }, schedule: [8, 18],
    coins: 25, startInv: { coffee: 2 }, fame: 6, renown: 12,
    likes: ["espresso", "closed tickets", "color-coded plans"], dislikes: ["meetings that could be emails"],
    rel: { ivy: "likes", dex: "dislikes", bruno: "likes" },
    greets: ["Can't stop — sprint review at ten!", "Have you tried time-blocking? Life changing.", "Coffee count today: four. It's fine."] },
  { id: "bruno", name: "Bruno", town: "alderbrook", color: "#8a6fd1", home: "home_c",
    desc: "the 52-year-old pompous office manager", personality: "pompous, loves the sound of his own title, harmless, fishing for compliments",
    work: { bId: "office", station: "desk_bruno" }, schedule: [9, 17],
    coins: 60, startInv: { tie: 1 }, fame: -8, renown: 28,
    likes: ["Italian ties", "his own title", "being agreed with"], dislikes: ["being interrupted", "Theo's attitude"],
    rel: { priya: "likes", theo: "dislikes" },
    greets: ["Ah, a citizen! You may greet me.", "Managing a firm is a heavy crown.", "Notice the tie? Italian. Probably."] },
  { id: "sam", name: "Sam", town: "alderbrook", color: "#e2a13e", home: "home_a", minor: true,
    desc: "a curious 10-year-old kid", personality: "endlessly curious, asks too many questions, collects weird rocks, no filter",
    work: null, schedule: null,
    coins: 2, startInv: { rock: 3 }, fame: 10, renown: 15,
    likes: ["round rocks", "the fountain", "questions"], dislikes: ["bedtime", "vegetables probably"],
    rel: { ivy: "friend", marge: "likes", milo: "friend" },
    greets: ["Wanna see my rock? It's SO round.", "Do fish sleep? Be honest.", "Race you to the fountain!"] },
  { id: "eleanor", name: "Eleanor", town: "alderbrook", color: "#b0688a", home: "home_a",
    desc: "a retired 74-year-old schoolteacher", personality: "wise, dry-witted, sits in the park judging pigeons, remembers everyone's childhood",
    work: null, schedule: null, noWork: true,             // retired — out of the workforce
    coins: 18, startInv: { tea: 1 }, fame: 22, renown: 35,
    likes: ["good posture", "the park bench", "well-behaved pigeons"], dislikes: ["sloppy grammar", "Bruno's speeches"],
    rel: { marge: "friend", gus: "likes", bruno: "dislikes" },
    greets: ["Sit. The pigeons are misbehaving again.", "I taught half this town. It shows.", "Lovely light today, isn't it."] },
  { id: "dex", name: "Dex", town: "alderbrook", color: "#556070", home: "home_p", thief: true,
    desc: "the 34-year-old night guard who rents your spare room", personality: "nocturnal, deadpan, chronically sleepy by day, weirdly poetic about the night, and — though nobody's proven it — the lightest fingers in four towns",
    work: { bId: "office", station: "desk_dex" }, schedule: [21, 29],
    coins: 12, startInv: { tea: 1 }, fame: 2, renown: 8,
    likes: ["3am silence", "strong tea", "the moon", "unattended shelves"], dislikes: ["alarm clocks", "Bruno's morning meetings", "bright lights"],
    rel: { ivy: "likes", bruno: "dislikes", cole: "dislikes" },
    greets: ["*yawns* Is it night yet.", "The town hums at 3am. You wouldn't get it.", "Five more minutes..."] },
  { id: "ivy", name: "Ivy", town: "alderbrook", color: "#4ab0a0", home: "home_c",
    desc: "a 26-year-old wandering artist", personality: "whimsical, sees colors in everything, mid-project always, paint on her sleeves",
    work: null, schedule: null, noWork: true,             // freelance artist by choice
    coins: 8, startInv: { paint: 1 }, fame: 8, renown: 14,
    likes: ["ochre rooftops", "fountain light", "half-finished canvases"], dislikes: ["beige", "finishing things"],
    rel: { sam: "friend", milo: "likes" },
    greets: ["That roof is SUCH a good ochre.", "I'm painting the fountain. Again. It changed.", "Hold still — no wait, lost it."] },
  { id: "rosa", name: "Rosa", town: "alderbrook", color: "#d17a4a", home: "home_c",
    desc: "the 31-year-old fry cook running the Crispy Hen", personality: "fast-talking, competitive about food, flour on everything, secretly proud of the fryer",
    work: { bId: "fastfood", station: "grill" }, schedule: [10, 20],
    coins: 15, startInv: { combo: 1 }, fame: 6, renown: 12, cooks: ["combo", "pizza"],
    likes: ["a clean fryer", "rush hour chaos", "Marge's bread (won't admit it)"], dislikes: ["soggy fries", "slow mail"],
    rel: { marge: "likes", pete: "dislikes" },
    greets: ["Order up! Oh wait, you haven't ordered.", "The fryer and I have an understanding.", "Marge's bread is fine. FINE."] },
  { id: "pete", name: "Pete", town: "alderbrook", color: "#6f8a9c", home: "home_a",
    desc: "the 48-year-old owner of the Landwide Postal Service", personality: "unhurried to a fault, philosophical about lost letters, knows every address by heart, quietly proud that the whole region's mail runs through him",
    work: { bId: "post", station: "staff" }, schedule: [8, 18],
    coins: 15, startInv: { stamp: 1 }, fame: 5, renown: 18,
    likes: ["neat handwriting", "stamps", "a slow morning"], dislikes: ["being rushed", "email"],
    rel: { eleanor: "likes" },
    greets: ["Mail moves at the speed of mail.", "A letter finds you when it's ready.", "Nice stamp weather today."] },
  // --- Mossford ---
  { id: "juno", name: "Juno", town: "stonecross", color: "#a5764a", home: "home_j2",
    desc: "the 34-year-old who runs The Grindstone, Stonecross's only café",
    personality: "warm but unhurried, remembers everyone's order, treats a good pour like a small ceremony",
    work: { bId: "cafe_s", station: "drinks" }, schedule: [7, 17],
    coins: 24, startInv: { coffee: 2, cookies: 1 }, fame: 12, renown: 20, cooks: ["mocha", "hot_choc", "cookies"],
    likes: ["the first pour of the day", "regulars", "rainy afternoons"], dislikes: ["rushing", "burnt beans", "decaf"],
    rel: {},
    greets: ["What can I get started for you?", "The usual? Or something new today?", "Grab a seat — I'll bring it over."] },
  { id: "wren", name: "Wren", town: "mossford", color: "#c25e8a", home: "home_w",
    desc: "the 39-year-old cook who runs the Rustpan Diner", personality: "sharp-tongued, generous portions, zero patience for tall tales",
    work: { bId: "diner", station: "staff" }, schedule: [7, 19],
    coins: 22, startInv: { stew: 1, veg: 1 }, fame: 12, renown: 25, cooks: ["stew", "grilled_fish"],
    likes: ["cast iron", "honest reviews", "Milo's songs (some of them)"], dislikes: ["fish stories", "picky eaters"],
    rel: { gus: "dislikes", milo: "likes" },
    greets: ["Sit down, you look hungry.", "If Gus told you about the pike — it's a lie.", "Stew's on. It's always on."] },
  { id: "gus", name: "Gus", town: "mossford", color: "#5b7a8a", home: "home_g",
    desc: "a 61-year-old fisherman who never leaves the dock", personality: "slow-talking, patient as the pond, every fish he's caught grows a little each retelling",
    work: { spot: "dock" }, schedule: [6, 14],
    coins: 10, startInv: { fish: 2 }, fame: 6, renown: 20,
    likes: ["still water", "long silences", "the pike (it was HUGE)"], dislikes: ["hurry", "doubters"],
    rel: { eleanor: "likes", wren: "likes" },
    greets: ["The pond's thinking today.", "Caught a pike here once. Big as a door.", "Sit. Fish don't like standing folk."] },
  { id: "nadia", name: "Nadia", town: "mossford", color: "#8a5bb0", home: "home_w",
    desc: "the 44-year-old general store owner", personality: "superstitious, sharp bargainer, reads omens in receipts, feud with Theo runs deep",
    work: { bId: "store", station: "staff" }, schedule: [8, 18],
    coins: 28, startInv: { candle: 2 }, fame: -4, renown: 20,
    likes: ["lucky numbers", "a good omen", "undercutting Theo"], dislikes: ["Theo of Alderbrook", "broken mirrors"],
    rel: { theo: "hates", wren: "likes" },
    greets: ["The receipts say today is lucky. Buy something.", "Theo's prices? A curse upon them.", "Careful — that shelf is unlucky."] },
  { id: "milo", name: "Milo", town: "mossford", color: "#d1b04a", home: "home_m", minor: true,
    desc: "a 17-year-old aspiring musician", personality: "dramatic, writes songs about everything, treats minor events as epic sagas",
    work: null, schedule: null,
    coins: 4, startInv: {}, fame: 4, renown: 10,
    likes: ["minor chords", "dramatic weather", "an audience"], dislikes: ["being told to practice quietly"],
    rel: { ivy: "friend", sam: "friend", wren: "likes" },
    greets: ["I wrote a ballad about the pond. Twelve verses.", "This town NEEDS an anthem.", "Shh — I'm composing."] },
  { id: "opal", name: "Opal", town: "mossford", color: "#4a9a8a", home: "home_m",
    desc: "the 50-year-old Bigway Mart manager, Milo's aunt", personality: "brisk, aisle-proud, quietly bankrolls Milo's music habit, treats restocking as an art form",
    work: { bId: "mart", station: "staff" }, schedule: [9, 19],
    coins: 26, startInv: { broom: 1 }, fame: 8, renown: 16,
    likes: ["straight shelf lines", "bulk discounts", "Milo's ballads (all of them)"], dislikes: ["crooked labels", "shopping carts left out"],
    rel: { milo: "friend", nadia: "likes" },
    greets: ["Aisle three is IMMACULATE today.", "We restock at dawn. Like professionals.", "Milo's new song? A masterpiece. I'm unbiased."] },
  // --- Stonecross ---
  { id: "amara", name: "Dr. Amara", town: "stonecross", color: "#5aa0b0", home: "home_d", doctor: true,
    desc: "the 46-year-old physician who runs Mercy Hospital", personality: "warm but clinical, has seen everything twice, prescribes soup as often as medicine",
    work: { bId: "hospital", station: "doctor" }, schedule: [7, 21],
    coins: 30, startInv: { tea: 2 }, fame: 25, renown: 30,
    likes: ["clean hands", "honest patients", "quiet shifts"], dislikes: ["untreated wounds", "tough-guy acts"],
    rel: { hollis: "likes", cole: "likes" },
    greets: ["You look upright. Good start.", "Eat something green today. Doctor's orders.", "Quiet shift so far. Don't jinx it."] },
  { id: "cole", name: "Cole", town: "stonecross", color: "#48628a", home: "home_h", enforcer: true,
    desc: "the 50-year-old captain of the Stonecross Watch", personality: "by-the-book but fair, believes most crime is hunger wearing a mask, never raises his voice",
    work: { bId: "hq", station: "duty" }, schedule: [7, 19],
    coins: 24, startInv: { baton: 1, crossbow: 1, bolt: 12 }, fame: 15, renown: 32,   // v7: the senior officer carries the Watch crossbow
    likes: ["order", "second chances", "a quiet ledger of a town"], dislikes: ["repeat offenders", "excuses"],
    rel: { tessa: "friend", amara: "likes", dex: "dislikes" },
    greets: ["All quiet. Keep it that way.", "The Watch sees more than you'd think.", "Stay fed, stay honest."] },
  { id: "tessa", name: "Tessa", town: "stonecross", color: "#7a5a8a", home: "home_h", enforcer: true,
    desc: "the 29-year-old night deputy of the Watch", personality: "sharp-eyed rookie energy, takes the night shift personally, keeps a tally of everything",
    work: { bId: "hq", station: "duty" }, schedule: [15, 27],
    coins: 16, startInv: { baton: 1 }, fame: 8, renown: 14,
    likes: ["night patrols", "her tally book", "catching people mid-lie"], dislikes: ["cold coffee", "the phrase 'it's fine'"],
    rel: { cole: "friend" },
    greets: ["Tally's clean tonight. So far.", "I count everything. Everything.", "Move along — kindly."] },
  /* Stage 2.3: the two towns with clinics but no resident physician finally get
     one each (level-2 doctors — they auto-pass at-scene stabilization checks). */
  { id: "reyes", name: "Dr. Reyes", town: "alderbrook", color: "#5a9aa8", home: "home_a", doctor: true,
    desc: "the 38-year-old physician who keeps the Alder Clinic", personality: "brisk, kind-eyed, treats first and lectures after, keeps peppermints in every pocket",
    work: { bId: "clinic_a", station: "treat" }, schedule: [8, 20],
    coins: 22, startInv: { medicine: 1, tea: 1 }, fame: 14, renown: 18,
    likes: ["prompt patients", "a well-stocked shelf", "walkable towns"], dislikes: ["heroics", "hidden symptoms"],
    rel: { amara: "likes", eleanor: "likes" },
    greets: ["Sit, let me look at you.", "Small hurts now save big ones later.", "You're overdue for water, I can tell."] },
  { id: "noor", name: "Dr. Noor", town: "mossford", color: "#6a95b5", home: "home_j", doctor: true,
    desc: "the 44-year-old physician who runs the Moss Clinic", personality: "calm, unflappable, has a story for every injury, believes in tea and rest as much as stitches",
    work: { bId: "clinic_m", station: "treat" }, schedule: [8, 20],
    coins: 25, startInv: { medicine: 1, tea: 2 }, fame: 16, renown: 20,
    likes: ["steady hands", "honest answers", "quiet clinics"], dislikes: ["bravado", "skipped checkups"],
    rel: { amara: "friend", wren: "likes", juniper: "likes" },
    greets: ["Breathe. Now tell me where it hurts.", "Rest is a medicine most folks skip.", "You'll live — but let's be sure."] },
  /* Stage 2.3: an intermediate-rank enforcer for a town that had a Watch post but
     no officer. Below Cole (captain), above a raw recruit — a working deputy. */
  /* Stage 3.5: the career criminal. No home (bench-sleeper — Stage 3 loop), no job
     (canSeekWork skips outlaws), a professional theft cadence via thiefTick, and an
     evasion brain: heat in this town means work in the next one. */
  { id: "vik", name: "Vik", town: "ferndale", color: "#6a5a4a", home: null,   // a FENCE, not a burglar: heist-pool candidate (broke+jobless), no autonomous theft cadence
    desc: "a 36-year-old fence who moves what others lift", personality: "affable, patient, never touches the merchandise twice, keeps every favor on a mental ledger",
    coins: 4, startInv: {}, fame: 3, renown: 1,
    likes: ["back doors", "cash buyers", "people who don't count"], dislikes: ["receipts", "the Watch", "loose talk"],
    rel: { sable: "likes" },
    greets: ["Buying or selling?", "I know a guy. I'm the guy.", "Didn't catch your name. Keep it that way."] },
  { id: "sable", name: "Sable", town: "mossford", color: "#8a5a72", home: null, thief: true, outlaw: true,
    desc: "a 31-year-old drifter nobody remembers inviting", personality: "unhurried, professionally friendly, counts exits before she counts change, treats theft as a trade and towns as shifts",
    coins: 6, startInv: {}, fame: 2, renown: 0,
    likes: ["unlatched windows", "bus timetables", "strangers who don't ask"], dislikes: ["dogs", "small towns with long memories", "the word 'loiter'"],
    rel: {},
    greets: ["Just passing through.", "Lovely town. Very... trusting.", "You didn't see me, and I wasn't here."] },
  { id: "briar", name: "Briar", town: "mossford", color: "#5a7290", home: "home_g", enforcer: true,
    desc: "the 34-year-old Watch officer posted to Mossford", personality: "even-tempered, walks the whole town twice a day, knows every shopkeeper by name and every excuse by heart",
    work: { bId: "watchpost_m", station: "duty" }, schedule: [8, 20],
    coins: 20, startInv: { baton: 1 }, fame: 11, renown: 22,
    likes: ["a good beat", "shopkeepers who wave back", "trouble that stays small"], dislikes: ["out-of-towners causing grief", "paperwork after dark"],
    rel: { cole: "likes", wren: "friend", noor: "likes" },
    greets: ["Morning. Keeping it quiet, I hope.", "I walk this town twice a day. I notice things.", "Trouble? Not on my beat."] },
  { id: "hollis", name: "Hollis", town: "stonecross", color: "#b08a5a", home: "inn",
    desc: "the 55-year-old keeper of the Quiet Lantern Inn", personality: "hears every rumor in four towns and trades them like currency, aggressively hospitable",
    work: { bId: "inn", station: "staff" }, schedule: [7, 21],
    coins: 26, startInv: { cider: 2 }, fame: 12, renown: 28, cooks: ["stew"],
    likes: ["fresh linens", "a full guest book", "rumors with legs"], dislikes: ["empty rooms", "people who don't say goodnight"],
    rel: { amara: "likes", finn: "likes" },
    greets: ["A bed's cheaper than a bad night. Five coins.", "Heard something INTERESTING today...", "Welcome to the Lantern. Wipe your feet."] },
  { id: "finn", name: "Finn", town: "stonecross", color: "#6a7a5a", home: "home_f",
    desc: "the 41-year-old graveyard keeper", personality: "soft-spoken, evasive about his past, tends an empty graveyard with suspicious dedication, goes very quiet when the Watch walks by — a criminal in hiding who wants no trouble at all",
    work: { spot: "graveyard" }, schedule: [6, 14], avoids: ["cole", "tessa"],
    coins: 9, startInv: { candle: 1 }, fame: 0, renown: 6,
    likes: ["quiet corners", "well-kept grass", "being unremarkable"], dislikes: ["questions about the old days", "uniforms"],
    rel: { hollis: "likes", cole: "dislikes", tessa: "dislikes" },
    greets: ["Nobody's buried here. I like it that way.", "Just keeping the grass honest.", "...You didn't see me. Kidding. Mostly."] },
  /* ---- The new quarters: Stonecross east/south + Mossford riverwalk/south ---- */
  { id: "garrick", name: "Garrick", town: "stonecross", color: "#7a6a4a", home: "home_s4",
    desc: "the 41-year-old wright who opened a workshop off the commons", personality: "measures twice, speaks once, quietly proud of clean joints",
    work: { bId: "workshop_s", station: "shop" }, schedule: [9, 17],
    coins: 30, startInv: { saw: 1, hammer: 1, wood: 3 }, fame: 5, renown: 12,
    likes: ["square corners", "sharp tools"], dislikes: ["warped boards", "rushed work"],
    rel: { wendell: "friend" }, greets: ["Mind the sawdust.", "Tools are on the wall. Prices are on the tools."] },
  { id: "delia", name: "Delia", town: "stonecross", color: "#5a8a6a", home: "home_s1",
    desc: "the 44-year-old who runs Eastgate Market", personality: "sharp with numbers, warmer than she lets on, knows every regular's order",
    work: { bId: "market_s", station: "shop" }, schedule: [9, 17],
    coins: 28, startInv: { veg: 2, fruit: 1 }, fame: 7, renown: 16, cooks: ["bread"],
    likes: ["fresh stock", "early risers"], dislikes: ["bruised fruit", "credit"],
    rel: {}, greets: ["Fresh in this morning.", "What do you need, then?"] },
  { id: "briggs", name: "Briggs", town: "mossford", color: "#5a7a9a", home: "home_m1",
    desc: "the 49-year-old keeper of Riverwalk Goods", personality: "slow-talking, endlessly patient, has an opinion on every fishing rod ever made",
    work: { bId: "store_m", station: "shop" }, schedule: [9, 17],
    coins: 26, startInv: { bread: 1, water: 2 }, fame: 6, renown: 15,
    likes: ["the river at dawn", "honest weights"], dislikes: ["rushing", "haggling"],
    rel: {}, greets: ["Take your time.", "River's high today."] },
  { id: "posy", name: "Posy", town: "stonecross", color: "#9a7a8a", home: "home_s2",
    desc: "a 26-year-old looking for steady work in the east quarter", personality: "bright, tireless, applies for everything",
    coins: 7, startInv: { bread: 1 }, fame: 2, renown: 4,
    likes: ["first days", "full shifts"], dislikes: ["waiting lists", "no"],
    rel: {}, greets: ["Anyone hiring out east?", "I'm quick, I promise."] },
  { id: "edgar", name: "Edgar", town: "stonecross", color: "#7a8a9a", home: "home_s2",
    desc: "a 34-year-old rooming with Posy, between things", personality: "wry, sleeps late, means to fix that",
    coins: 4, startInv: {}, fame: 2, renown: 3,
    likes: ["late mornings", "borrowed time"], dislikes: ["rent day", "alarms"],
    rel: { posy: "likes" }, greets: ["Posy's the ambitious one.", "I'm between things. Long between."] },
  { id: "tilda", name: "Tilda", town: "stonecross", color: "#8a9a7a", home: "home_s3",
    desc: "a 52-year-old who keeps the commons tidy and everyone's business", personality: "brisk, nosy in a kindly way, misses nothing",
    coins: 16, startInv: { bread: 1 }, fame: 5, renown: 11, cooks: ["stew"],
    likes: ["swept paths", "a good rumor"], dislikes: ["litter", "secrets"],
    rel: {}, greets: ["Heard about the Council?", "Mind the path, I just swept."] },
  { id: "wendell", name: "Wendell", town: "stonecross", color: "#9a7a6a", home: "home_s4",
    desc: "a 61-year-old retired mill foreman in the Old Mill House", personality: "gruff, generous, tells the same three stories",
    coins: 34, startInv: { stew: 1 }, fame: 6, renown: 19, cooks: ["stew"],
    likes: ["a full pot", "young workers"], dislikes: ["idleness", "new machines"],
    rel: { tilda: "friend" }, greets: ["Sit down, I'll tell you about the mill.", "Work's honest. Mostly."] },
  { id: "nell", name: "Nell", town: "mossford", color: "#9a8a5a", home: "home_m2",
    desc: "a 30-year-old taking work along the river walk", personality: "steady, saving hard, dreams about a boat",
    coins: 11, startInv: { water: 1 }, fame: 3, renown: 6,
    likes: ["payday", "the far dock"], dislikes: ["debts", "rain on wash day"],
    rel: {}, greets: ["Morning. Cold one.", "Saving for a boat. Slowly."] },
  { id: "gideon", name: "Gideon", town: "mossford", color: "#7a9a6a", home: "home_m4",
    desc: "a 38-year-old who fishes the bend and sells the surplus", personality: "quiet, contented, up before everyone",
    coins: 19, startInv: { fish: 2 }, fame: 4, renown: 9, cooks: ["grilled_fish"],
    likes: ["the bend at dawn", "a full net"], dislikes: ["crowds", "empty water"],
    rel: { briggs: "likes" }, greets: ["Bend's good this week.", "Fish? I've plenty."] },
  { id: "orla", name: "Orla", town: "mossford", color: "#8a7a9a", home: "home_m3",
    desc: "a 24-year-old rooming south of the river, new in town", personality: "eager, homesick, trying hard to belong",
    coins: 5, startInv: {}, fame: 1, renown: 3,
    likes: ["invitations", "learning names"], dislikes: ["being new", "quiet nights"],
    rel: { nell: "likes" }, greets: ["I'm new — Orla.", "Still learning where everything is."] },
  /* ---- The Outlands: the lawless camp ---- */
  { id: "mara", name: "Mara", town: "outlands", color: "#4a4040", home: "shack_o1",
    desc: "the 50-year-old who runs The Exchange — everything's for sale, nothing's questioned", personality: "flat-voiced, fair to a fault by her own code, keeps a club under the counter",
    work: { bId: "blackmarket_o", station: "shop" }, schedule: [10, 18],
    coins: 45, startInv: { club: 1, crossbow: 1, bolt: 8 }, fame: 6, renown: 4,   // she SELLS crossbows — of course she keeps one loaded
    likes: ["exact change", "quiet customers"], dislikes: ["haggling", "the Watch"],
    rel: {}, greets: ["Buy or leave.", "Double price. That's the discount for no questions."] },
  { id: "howl", name: "Howl", town: "outlands", color: "#5a4a3a", home: "shack_o2",
    desc: "the cook at The Last Pot — nobody has ever seen a delivery arrive", personality: "cheerful in an unsettling way, generous portions, evasive about ingredients",
    work: { bId: "grill_o", station: "staff" }, schedule: [9, 17],
    coins: 12, startInv: { stew: 2, knife: 1 }, fame: 5, renown: 3, cooks: ["stew", "mystery_stew"],   // light purse, sharp knife: a bad mark
    likes: ["clean bowls", "no questions"], dislikes: ["recipe talk", "food inspectors"],
    rel: {}, greets: ["Pot's full. Sit.", "It's stew. Mostly.", "Everyone asks. Nobody really wants to know."] },
  { id: "cutter", name: "Cutter", town: "outlands", color: "#3a3a44", home: null, outlaw: true,
    desc: "a 33-year-old who takes what he wants and dares you to mind", personality: "coiled, direct, respects nerve and nothing else",
    coins: 6, startInv: { knife: 1 }, fame: 4, renown: 1,
    likes: ["easy marks", "the tree line"], dislikes: ["locks", "witnesses"],
    rel: { sable: "likes", vik: "likes" }, greets: ["Wrong road, friend.", "Toll's whatever you're carrying."] },
  { id: "sly", name: "Sly", town: "outlands", color: "#44503a", home: null,
    desc: "a 27-year-old drifter who watches the shady route like a hawk", personality: "grinning, patient, never the first to swing but always the first to run",
    coins: 3, startInv: {}, fame: 2, renown: 1,
    likes: ["fat wallets walking", "the creek at dawn"], dislikes: ["dogs", "crossbows"],
    rel: { cutter: "friend" }, greets: ["Lost? Everyone here is.", "Nice coin purse. Heavy-looking."] },
  /* ---- Ferndale: the mill town — mostly ordinary folks ---- */
  { id: "hazel", name: "Hazel", town: "ferndale", color: "#8a9a5a", home: "home_f1",
    desc: "the 45-year-old who runs Mill Supply Co.", personality: "practical, keeps a ledger in her head, soft spot for strays",
    work: { bId: "store_f", station: "shop" }, schedule: [9, 17],
    coins: 26, startInv: { bread: 2, water: 2 }, fame: 8, renown: 18, cooks: ["bread"],
    likes: ["full shelves", "prompt payment"], dislikes: ["haggling", "dust"],
    rel: {}, greets: ["Shelves are stocked. Mostly.", "Need supplies?"] },
  { id: "yusuf", name: "Yusuf", town: "ferndale", color: "#b07a4a", home: "home_f2",
    desc: "the 52-year-old cook who runs The Millstone", personality: "steady hands, big laugh, feeds anyone who looks thin",
    work: { bId: "grill_f", station: "staff" }, schedule: [8, 16],
    coins: 24, startInv: { stew: 2 }, fame: 10, renown: 22, cooks: ["stew", "grilled_fish"],
    likes: ["a full room", "morning prep"], dislikes: ["waste", "cold stew"],
    rel: {}, greets: ["Sit, eat. Talk after.", "Stew's fresh."] },
  { id: "sana", name: "Dr. Sana", town: "ferndale", color: "#a8c0b8", home: "home_f3", doctor: true,
    desc: "the 38-year-old physician at Ferndale Clinic", personality: "calm under pressure, blunt diagnoses, gentle hands",
    work: { bId: "clinic_f", station: "treat" }, schedule: [9, 17],
    coins: 30, startInv: { bandage: 2, medicine: 1 }, fame: 10, renown: 26,
    likes: ["quiet shifts", "honest patients"], dislikes: ["self-diagnosis", "mill accidents"],
    rel: {}, greets: ["Sit. Where does it hurt?", "You look... fine, actually."] },
  { id: "ivy", name: "Ivy", town: "ferndale", color: "#a07a90", home: "home_f4",
    desc: "a 27-year-old looking for steady work", personality: "quick learner, restless, saving for something she won't name",
    coins: 6, startInv: { bread: 1 }, fame: 2, renown: 4,
    likes: ["payday", "new starts"], dislikes: ["idle days", "pity"],
    rel: {}, greets: ["Know anyone hiring?", "I'll take any shift."] },
  { id: "rowan", name: "Rowan", town: "ferndale", color: "#7a90a0", home: "home_f4",
    desc: "a 31-year-old odd-jobber rooming with Ivy", personality: "easygoing to a fault, always a week behind on something",
    coins: 3, startInv: {}, fame: 1, renown: 3,
    likes: ["long lunches", "luck"], dislikes: ["deadlines", "rent day"],
    rel: { ivy: "likes" }, greets: ["Work finds me eventually.", "Rent? Already?"] },
  { id: "marcus", name: "Marcus", town: "ferndale", color: "#8a7aa0", home: "home_f5",
    desc: "a 40-year-old ex-mill hand between jobs", personality: "proud, punctual, hates owing anyone anything",
    coins: 9, startInv: { water: 1 }, fame: 3, renown: 8,
    likes: ["earned wages", "quiet evenings"], dislikes: ["handouts", "gossip"],
    rel: { quinn: "friend" }, greets: ["Morning.", "Work's thin, but I manage."] },
  { id: "quinn", name: "Quinn", town: "ferndale", color: "#90a07a", home: "home_f5",
    desc: "a 29-year-old rooming with Marcus", personality: "chatty, generous when flush, broke by Thursday",
    coins: 4, startInv: {}, fame: 2, renown: 4,
    likes: ["card nights", "Marcus's cooking"], dislikes: ["quiet rooms", "IOUs"],
    rel: { marcus: "friend" }, greets: ["Marcus is the responsible one.", "Spot me a coin?"] },
  { id: "lena", name: "Lena", town: "ferndale", color: "#a09a6a", home: "home_f6",
    desc: "a 35-year-old seamstress taking piecework", personality: "precise, private, counts every stitch and coin",
    coins: 14, startInv: { bread: 1 }, fame: 3, renown: 9, cooks: ["bread"],
    likes: ["straight seams", "paid invoices"], dislikes: ["freeloaders", "wrinkles"],
    rel: { tobin: "neutral" }, greets: ["I take mending. Coins up front.", "Yes?"] },
  { id: "tobin", name: "Tobin", town: "ferndale", color: "#6a8a9a", home: "home_f6",
    desc: "a 26-year-old rooming with Lena, chronically short on rent", personality: "charming, means well, always one job from square",
    coins: 2, startInv: {}, fame: 2, renown: 3,
    likes: ["second chances", "warm rooms"], dislikes: ["lectures", "eviction talk"],
    rel: { lena: "likes" }, greets: ["I'm good for it. Mostly.", "Lena's a saint, honestly."] },
  { id: "dora", name: "Dora", town: "alderbrook", color: "#9a8a7a", home: null,
    desc: "a 48-year-old sleeping rough in Alderbrook since the Ferndale mill cut shifts", personality: "sharp-eyed, proud, keeps her corner of the park tidy",
    coins: 6, startInv: { bread: 1, water: 1 }, fame: 1, renown: 2,
    likes: ["warm benches", "being useful"], dislikes: ["pity", "rain"],
    rel: {}, greets: ["Bench is taken. Kidding. Sit.", "Seen worse winters."] },
  { id: "felix", name: "Felix", town: "stonecross", color: "#7a9a8a", home: null,
    desc: "a 23-year-old drifter working the Stonecross streets for a first break", personality: "eager, unlucky, first in line for any opening",
    coins: 6, startInv: { bread: 1, water: 1 }, fame: 1, renown: 2,
    likes: ["open doors", "hot meals"], dislikes: ["locked gates", "no"],
    rel: {}, greets: ["Anyone hiring? Anyone?", "I work hard, I swear it."] },
  { id: "ash", name: "Ash", town: "ferndale", color: "#8a8a8a", home: null,
    desc: "a 55-year-old who lost the house and won't talk about it", personality: "quiet, watchful, remembers every kindness",
    coins: 5, startInv: { bread: 1, water: 1 }, fame: 1, renown: 2,
    likes: ["early mornings", "left-alone"], dislikes: ["questions", "charity with strings"],
    rel: {}, greets: ["...morning.", "Don't mind me."] },

];

const CHATTER = {
  friend: [
    ["{a}: There you are! Day's better already.", "{b}: Flatterer. What's new?", "{a}: Been thinking about {aLike} all morning."],
    ["{a}: Lunch later?", "{b}: Only if you're buying.", "{a}: Deal. As always."],
  ],
  likes: [
    ["{a}: Morning, {b}. Good to see you.", "{b}: Likewise. Fine day for it."],
    ["{a}: How's things?", "{b}: Can't complain. Well — I could.", "{a}: Ha. Save it for Marge."],
  ],
  neutral: [
    ["{a}: Weather's holding.", "{b}: For now."],
    ["{a}: {b}.", "{b}: {a}.", "{a}: ...Good talk."],
  ],
  dislikes: [
    ["{a}: Oh. It's you.", "{b}: Charming as ever, {a}.", "{a}: I try."],
    ["{a}: Still going on about {bDislike}?", "{b}: Still making that face?"],
  ],
  hates: [
    ["{a}: You've got nerve showing up here.", "{b}: I walk where I please, {a}.", "{a}: Hmph. We'll see."],
    ["{a}: Don't start.", "{b}: I finished years ago.", "{a}: THAT'S IT— *deep breath* ...fine."],
  ],
};

/* =====================================================================
   WORLD BUILD + PATHFINDING + TRAVEL
   ===================================================================== */
function buildWorld() {
  const towns = {};
  for (const [tid, def] of Object.entries(TOWN_DEFS)) {
    const grid = Array.from({ length: def.h }, () => Array(def.w).fill("."));
    for (const r of def.roadRows) for (let x = def.roadCols[0]; x <= def.roadCols[def.roadCols.length - 1]; x++) grid[r][x] = "r";
    for (const c of def.roadCols) for (let y = def.roadRows[0]; y <= def.roadRows[def.roadRows.length - 1]; y++) grid[y][c] = "r";
    if (def.park) { const p = def.park; for (let y = p.y; y < p.y + p.h; y++) for (let x = p.x; x < p.x + p.w; x++) grid[y][x] = "p"; }
    if (def.grave) { const g = def.grave; for (let y = g.y; y < g.y + g.h; y++) for (let x = g.x; x < g.x + g.w; x++) grid[y][x] = "g"; }
    if (def.water) { const w = def.water; for (let y = w.y; y < w.y + w.h; y++) for (let x = w.x; x < w.x + w.w; x++) grid[y][x] = "w"; }
    const walk = grid.map(row => row.map(t => t !== "w"));
    for (const b of BUILDINGS.filter(b => b.town === tid))
      for (let y = b.y; y < b.y + b.h; y++) for (let x = b.x; x < b.x + b.w; x++) walk[y][x] = false;
    towns[tid] = { ...def, id: tid, grid, walk };
  }
  const interiors = {};
  for (const [bid, def] of Object.entries(INTERIOR_DEFS)) {
    const h = def.rows.length, w = def.rows[0].length;
    const walk = def.rows.map(row => [...row].map(ch => ch === "." || ch === "D"));
    let exit = { x: 0, y: 0 };
    const floors = [];
    def.rows.forEach((row, y) => [...row].forEach((ch, x) => {
      if (ch === "D") exit = { x, y };
      if (ch === ".") floors.push({ x, y });
    }));
    interiors[bid] = { ...def, id: bid, w, h, walk, exit, floors };
  }
  return { towns, interiors };
}

const sceneGrid = (world, scene) => {
  if (scene.startsWith("t:")) { const t = world.towns[scene.slice(2)]; return { walk: t.walk, w: t.w, h: t.h }; }
  const i = world.interiors[scene.slice(2)]; return { walk: i.walk, w: i.w, h: i.h };
};
const townOfScene = (world, scene) =>
  scene.startsWith("t:") ? scene.slice(2) : BUILDINGS.find(b => b.id === scene.slice(2)).town;
const bld = (id) => BUILDINGS.find(b => b.id === id);
const findShop = (itemId, town) =>
  BUILDINGS.find(b => b.town === town && SHOP_STOCK[b.id]?.includes(itemId))?.id || null;
const keeperOf = (sim, bId) => sim.npcs.find(n => n.alive && n.work?.bId === bId) || null;
/* best weapon in an inventory (by average damage); bare fists otherwise */
/* v7 Stage 5: the endgame ladder — every private business has a price. Civic buildings and
   Pete's post are NOT for sale. Ownership overrides persist and reapply on load. */
const BUSINESS_PRICE = { cafe: 180, market: 200, fastfood: 160, diner: 190, mart: 240, inn: 260,
  store: 170, furn: 200, cafe_s: 150, store_f: 150, grill_f: 160, grill_o: 120, blackmarket_o: 350,
  market_s: 175, store_m: 165, workshop_s: 300 };

/* v7 Stage 3: bushes grow beside every tree — derived, not authored, so all towns have them */
const bushSpots = (town) => town.trees.map(([x, y]) => [x + 1, y]).filter(([x, y]) => x < town.w - 1 && y < town.h - 1);

const bestWeapon = (ent) => {
  let best = null;
  for (const [id, c] of Object.entries(ent.inv)) {
    if (c > 0 && ITEMS[id].dmg && (!best || ITEMS[id].dmg[1] > ITEMS[best].dmg[1])) best = id;
  }
  return best;
};
const weaponDmg = (ent) => randInt(bestWeapon(ent) ? ITEMS[bestWeapon(ent)].dmg : CFG.COMBAT.fistDmg);

function findPath(gridInfo, sx, sy, gx, gy) {
  const { walk, w, h } = gridInfo;
  sx = Math.round(sx); sy = Math.round(sy); gx = Math.round(gx); gy = Math.round(gy);
  if (sx === gx && sy === gy) return [];
  const key = (x, y) => y * w + x;
  const prev = new Map([[key(sx, sy), null]]);
  const q = [[sx, sy]];
  while (q.length) {
    const [x, y] = q.shift();
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const nx = x + dx, ny = y + dy;
      if (nx < 0 || ny < 0 || nx >= w || ny >= h || !walk[ny][nx] || prev.has(key(nx, ny))) continue;
      prev.set(key(nx, ny), [x, y]);
      if (nx === gx && ny === gy) {
        const path = []; let cur = [nx, ny];
        while (cur && !(cur[0] === sx && cur[1] === sy)) { path.unshift({ x: cur[0], y: cur[1] }); cur = prev.get(key(cur[0], cur[1])); }
        return path;
      }
      q.push([nx, ny]);
    }
  }
  return [];
}

/* Travel planner. `cross: true` (enforcers on dispatch, rescue runs)
   permits town-to-town legs via bus-stop teleports — the Watch rides free. */
function planTravel(world, from, goal, opts = {}) {
  if (from.scene === goal.scene) return [{ scene: goal.scene, x: goal.x, y: goal.y }];
  const legs = [];
  let cur = { ...from };
  if (cur.scene.startsWith("i:")) {
    const b = bld(cur.scene.slice(2)), ex = world.interiors[b.id].exit;
    legs.push({ scene: cur.scene, x: ex.x, y: ex.y, tp: { scene: `t:${b.town}`, x: b.door.x, y: b.door.y } });
    cur = { scene: `t:${b.town}` };
  }
  const goalTown = townOfScene(world, goal.scene);
  if (cur.scene !== `t:${goalTown}`) {
    if (!opts.cross) return [{ scene: from.scene, x: from.x, y: from.y }];   // civilians stay town-locked
    const fromTown = world.towns[cur.scene.slice(2)], toTown = world.towns[goalTown];
    legs.push({ scene: cur.scene, x: fromTown.busStop.x, y: fromTown.busStop.y,
      tp: { scene: `t:${goalTown}`, x: toTown.busStop.x, y: toTown.busStop.y } });
    cur = { scene: `t:${goalTown}` };
  }
  if (goal.scene.startsWith("i:")) {
    const b = bld(goal.scene.slice(2)), ex = world.interiors[b.id].exit;
    legs.push({ scene: cur.scene, x: b.door.x, y: b.door.y, tp: { scene: goal.scene, x: ex.x, y: ex.y } });
  }
  legs.push({ scene: goal.scene, x: goal.x, y: goal.y });
  return legs;
}

/* shelves start stocked; kitchens/files/meds seeded to sensible levels */
function initStock() {
  // Stage 3.7: shops open EMPTY — the owner's day-1 AI call composes the menu, and
  // deliveries fill the shelves. We seed an empty bucket per shop so stock ops are safe.
  const stock = {};
  for (const bId of Object.keys(SHOP_STOCK)) stock[bId] = {};
  // Survival floor ONLY: every eatery keeps a small base-meal pantry so a chef-less town
  // (e.g. Stonecross's inn) can't starve on day 1 before its first delivery. Everything
  // else — the whole menu — starts bare and arrives via the owner economy + post.
  for (const [bId, meal] of Object.entries(EATERY_MEAL)) { stock[bId] = stock[bId] || {}; stock[bId][meal] = CFG.OWNERECON.survivalFloor; }
  stock.office = { files: CFG.STOCK.files };
  stock.hospital = { medicine: CFG.STOCK.meds, bandage: CFG.STOCK.bandages };
  stock.clinic_a = { medicine: 4 }; stock.clinic_m = { medicine: 4 };   // walk-in shelves, smaller
  return stock;
}

/* =====================================================================
   CLAUDE API — chat (full dossier), pulse, nudge, and the Incident Call
   ===================================================================== */
/* Optional: in the Claude artifact environment the API call is authenticated automatically.
   For a STANDALONE webpage deployment there's no injection, so a user can supply their own
   Anthropic key (see Settings → API key). When set, it's sent with the request; otherwise the
   call runs keyless (artifact mode). Stored only in memory unless the player saves it. */
/* ===== Procedural sound design — Web Audio, zero external assets (works in artifact + webpage).
   Soft & warm: sine/triangle voices, short envelopes, gentle. Crime/fail sounds get a little
   bite for contrast. Everything defeatable via Settings (sfx.enabled / sfx.volume). ===== */
const sfx = {
  ctx: null, enabled: true, volume: 0.6, _last: {},
  _ac() {
    if (this.ctx) return this.ctx;
    try { this.ctx = new (window.AudioContext || window.webkitAudioContext)(); } catch (e) { this.ctx = null; }
    return this.ctx;
  },
  // one shaped voice: freq glide + gain envelope
  _voice(freq, { type = "sine", dur = 0.14, gain = 0.5, to = null, attack = 0.008, decay = null } = {}) {
    const ac = this._ac(); if (!ac || !this.enabled) return;
    const t = ac.currentTime, o = ac.createOscillator(), g = ac.createGain();
    o.type = type; o.frequency.setValueAtTime(freq, t);
    if (to) o.frequency.exponentialRampToValueAtTime(Math.max(1, to), t + dur);
    const peak = gain * this.volume;
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(Math.max(0.0002, peak), t + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, t + (decay ?? dur));
    o.connect(g); g.connect(ac.destination);
    o.start(t); o.stop(t + (decay ?? dur) + 0.02);
  },
  // a soft noise burst (splash, buzz)
  _noise(dur = 0.18, { gain = 0.35, lp = 1800, hp = 200 } = {}) {
    const ac = this._ac(); if (!ac || !this.enabled) return;
    const t = ac.currentTime, n = Math.floor(ac.sampleRate * dur);
    const buf = ac.createBuffer(1, n, ac.sampleRate), d = buf.getChannelData(0);
    for (let i = 0; i < n; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / n);
    const src = ac.createBufferSource(); src.buffer = buf;
    const lpf = ac.createBiquadFilter(); lpf.type = "lowpass"; lpf.frequency.value = lp;
    const hpf = ac.createBiquadFilter(); hpf.type = "highpass"; hpf.frequency.value = hp;
    const g = ac.createGain(); g.gain.setValueAtTime(gain * this.volume, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    src.connect(hpf); hpf.connect(lpf); lpf.connect(g); g.connect(ac.destination);
    src.start(t); src.stop(t + dur + 0.02);
  },
  // throttle identical sounds so rapid events don't stack into noise
  _throttle(key, ms = 60) { const now = performance.now(); if (now - (this._last[key] || 0) < ms) return false; this._last[key] = now; return true; },

  // ---- the palette ----
  click()   { if (this._throttle("click", 40)) this._voice(420, { type: "triangle", dur: 0.05, gain: 0.18 }); },
  open()    { this._voice(300, { type: "sine", dur: 0.16, gain: 0.22, to: 560 }); },
  close()   { this._voice(520, { type: "sine", dur: 0.14, gain: 0.2, to: 260 }); },
  coin()    { if (!this._throttle("coin", 50)) return; this._voice(1050, { type: "triangle", dur: 0.09, gain: 0.3 }); setTimeout(() => this._voice(1500, { type: "triangle", dur: 0.1, gain: 0.28 }), 55); },
  purchase(){ this._voice(360, { type: "sine", dur: 0.12, gain: 0.32 }); setTimeout(() => this._voice(240, { type: "sine", dur: 0.18, gain: 0.3 }), 70); },
  success() { this._voice(660, { type: "sine", dur: 0.11, gain: 0.3 }); setTimeout(() => this._voice(880, { type: "sine", dur: 0.16, gain: 0.3 }), 90); },
  fail()    { this._voice(240, { type: "triangle", dur: 0.22, gain: 0.3, to: 150 }); },
  levelup() { [523, 659, 784, 1047].forEach((f, i) => setTimeout(() => this._voice(f, { type: "sine", dur: 0.16, gain: 0.28 }), i * 80)); },
  reel()    { if (this._throttle("reel", 45)) this._voice(300, { type: "square", dur: 0.03, gain: 0.12 }); },
  splash()  { this._noise(0.22, { gain: 0.3, lp: 1400, hp: 300 }); this._voice(500, { type: "sine", dur: 0.14, gain: 0.15, to: 900 }); },
  alert()   { this._voice(400, { type: "sawtooth", dur: 0.18, gain: 0.26 }); setTimeout(() => this._voice(330, { type: "sawtooth", dur: 0.22, gain: 0.26 }), 150); },
  pop()     { if (this._throttle("pop", 80)) this._voice(720, { type: "sine", dur: 0.06, gain: 0.16, to: 980 }); },
  chime()   { this._voice(880, { type: "sine", dur: 0.2, gain: 0.24 }); setTimeout(() => this._voice(1320, { type: "sine", dur: 0.26, gain: 0.2 }), 90); },
};

/* Stage 6: treasury-funded town upgrades the Council can buy. Effects are wired into the
   darkness pass (lamps), fare lookups (roads), and hospital billing (clinic). */
const TOWN_UPGRADES = {
  lamps:  { name: "Street Lamps",     emoji: "🏮", cost: 45, blurb: "brighter nights" },
  roads:  { name: "Road Maintenance", emoji: "🛣️", cost: 60, blurb: "bus fares from here cost 1c less" },
  clinic: { name: "Clinic Fund",      emoji: "⚕️", cost: 70, blurb: "hospital bills 25% lighter" },
};

let USER_API_KEY = "";
const setUserApiKey = (k) => { USER_API_KEY = (k || "").trim(); };

// The model every AI call runs on. Change it here to swap models globally.
const CLAUDE_MODEL = "claude-sonnet-4-6";

// Persist the key on its own so it survives reloads and pre-fills the title
// screen — independent of any save file. Stored on this device only.
const API_KEY_STORE = "alderbrook_api_key";
const persistApiKey = (k) => {
  try { k ? localStorage.setItem(API_KEY_STORE, k) : localStorage.removeItem(API_KEY_STORE); }
  catch (e) { /* private mode / no storage — the in-memory key still works this session */ }
};
const loadPersistedApiKey = () => {
  try { return localStorage.getItem(API_KEY_STORE) || ""; } catch (e) { return ""; }
};

async function callClaude(prompt, maxTokens) {
  // Standalone / GitHub Pages build: every AI call is authenticated with the
  // player's own Anthropic key. The CORS-unlock header lets the browser reach
  // the API directly, so no server or proxy is needed.
  if (!USER_API_KEY) {
    throw new Error("No Anthropic API key set — open ⚙️ Settings and paste your key to power the AI features.");
  }
  const headers = {
    "Content-Type": "application/json",
    "x-api-key": USER_API_KEY,
    "anthropic-version": "2023-06-01",
    "anthropic-dangerous-direct-browser-access": "true",
  };
  let res;
  try {
    res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers,
      body: JSON.stringify({ model: CLAUDE_MODEL, max_tokens: maxTokens, messages: [{ role: "user", content: prompt }] }),
    });
  } catch (e) {
    throw new Error("Couldn't reach the Anthropic API (network/CORS). Check your connection and key.");
  }
  if (!res.ok) {
    let detail = `HTTP ${res.status}`;
    try { const err = await res.json(); detail = err?.error?.message || detail; } catch (e) { /* non-JSON body */ }
    if (res.status === 401) detail = "Invalid or missing API key — re-check it in ⚙️ Settings.";
    throw new Error(`Claude API error: ${detail}`);
  }
  const data = await res.json();
  const text = (data.content || []).map(b => b.text || "").join("");
  try {
    return JSON.parse(text.replace(/```json|```/g, "").trim());
  } catch (e) {
    throw new Error("Claude returned a response that couldn't be parsed as JSON.");
  }
}

/* Stage 2.2 — the skill-check adjudicator. The LEANEST call in the game: a
   compact prompt describing an actor, a task, and a pre-computed difficulty
   (0-100, higher = harder), returning only {"pass":bool}. No narration, no
   reaction — just a genuine verdict on whether this ability clears this bar.
   Difficulty is weighted locally (skill/rank/ownership) before it ever gets here. */
/* Stage 3.7 — the shopkeeper's mind. Once (opening) and every revision day, an
   owner reviews their menu: sets a sell price for each item (free to 2× base is
   allowed, but they're nudged to base−1..base+1 — base already turns a profit
   since ingredients cost them nothing) and, on revisions, may swap up to 2 items
   from their candidate pool. Conceptually tiny: prices in, a couple of swaps out.
   Returns { prices: {item:coins}, drop:[item...], add:[item...] }. */
/* Stage 5: ask an owner whether to invest in their register/security. Returns a decision
   string; on any malformed/failed response the caller falls back to a local heuristic. */
async function registerConsider(shopName, ownerName, personality, hasRegister, security, tillCash, pocket) {
  const opts = !hasRegister
    ? `"install" (30c from pocket — unlocks the till + all upgrades) or "wait"`
    : security < 1
      ? `"light" (75c from till — cap 500c, less robbery exposure) or "wait"`
      : security < 2
        ? `"high" (179c from till — minimal robbery exposure, alarm) or "wait"`
        : `"wait" (fully upgraded)`;
  const prompt =
`You are ${ownerName}, who runs ${shopName} in a small town. You are: ${personality}.
Register status: ${hasRegister ? `installed, security=${["none","light","high"][security]}, till holds ${tillCash}c` : "no register yet"}. Your pocket: ${pocket}c.
A register earns a per-sale bonus when full and protects takings from muggers; higher security means less lost to robbery. Money for upgrades comes from the till (except the initial install, from pocket).
Would you invest now? Choose: ${opts}. Return ONLY JSON: {"choice":"install|light|high|wait"}.`;
  const out = await callClaude(prompt, 60);
  const c = out?.choice;
  return ["install", "light", "high", "wait"].includes(c) ? c : null;   // null → caller uses auto heuristic
}

/* Stage F1 — where does the new piece GO? A tiny flavor call: the buyer picks one of
   their home's free furniture slots. Malformed/failed → caller places it at random. */
async function furniturePlaceChoice(buyerName, personality, furnName, slotLabels) {
  const opts = slotLabels.map((l, i) => `${i}: ${l}`).join("; ");
  const prompt =
`${buyerName} (${personality}) just bought a ${furnName} for their one-room cottage and must pick where it goes.
Free spots — ${opts}. Return ONLY JSON: {"slot":<number>}.`;
  const out = await callClaude(prompt, 24);
  const i = Number(out?.slot);
  return Number.isInteger(i) && i >= 0 && i < slotLabels.length ? i : null;
}

/* Stage F4 — selling the shop: the owner names THEIR price. The benchmark is passed in;
   the model may go higher or lower within hard bounds the caller clamps to anyway. */
async function bizQuote(ownerName, personality, bizName, basePrice, recentGross) {
  const prompt =
`You are ${ownerName}, sole owner of ${bizName} in a small-town life-sim. You are: ${personality}.
The player wants to buy your business outright — keys, stock, goodwill, all of it. A fair market benchmark is ${basePrice} coins${recentGross ? ` (recent takings: ~${recentGross}c this period)` : ""}.
Name YOUR asking price in whole coins — anywhere from ${Math.round(basePrice * 0.6)} to ${Math.round(basePrice * 1.8)} depending on how attached you are, how business is going, and your read of the buyer. Add ONE short in-character line to go with it.
Return ONLY JSON: {"price":<number>,"say":"<under 20 words>"}.`;
  const out = await callClaude(prompt, 80);
  return out && typeof out === "object" ? out : null;
}

async function ownerConsider(shopName, ownerName, personality, kind, menu, pool, itemInfo, canSwap, maxSwaps) {
  const opening = menu.length === 0;                     // Stage 3.7: day-1 menu composition
  const lines = menu.map(id => `  ${id}: base ${itemInfo[id].price}c (${itemInfo[id].name})`).join("\n");
  const poolLine = pool.filter(id => !menu.includes(id)).map(id => `${id}(${itemInfo[id].price}c)`).join(", ") || "(nothing new available)";
  const prompt = opening ?
`You are opening ${shopName}, a ${kind} in a small-town life-sim. You are ${ownerName}: ${personality}.
Compose your OPENING MENU: choose up to ${CFG.OWNERECON.menuSize} items to sell, from what you can stock: ${poolLine}. Pick a selection that fits your character and your kind of ${kind} — you needn't take the maximum. Then set a SELL PRICE (whole coins) for each item you chose. You pay nothing for ingredients, so base price already profits; a sensible price is base−1 to base+1, though free to double base is allowed (gouging scares customers off).
Return ONLY compact JSON: {"add":["item",...your chosen menu],"prices":{"item":coins,...for every item you chose},"drop":[]}. No prose.` :
`You run ${shopName}, a ${kind} in a small-town life-sim. You are ${ownerName}: ${personality}.
Set today's SELL PRICE (whole coins) for each item on your menu. You pay nothing for ingredients, so base price already profits; a sensible price is base−1 to base+1. You MAY go as low as free or as high as double base, but gouging annoys customers and scares them off.
Current menu:
${lines}
${canSwap ? `You may also revise the menu: DROP up to ${maxSwaps} items you dislike and ADD the same number from your available stock: ${poolLine}. Anything you add starts at ZERO stock and must be reordered. Swap only if it fits your character/shop; keeping the menu is fine.` : "No menu changes today — just prices."}
Return ONLY compact JSON: {"prices":{"item":coins,...for every current menu item},"drop":[${canSwap ? '"item",...' : ''}],"add":[${canSwap ? '"item",...' : ''}]}. No prose.`;
  const out = await callClaude(prompt, CFG.OWNERECON.apiMaxTokens);
  return out && typeof out === "object" ? out : { prices: {}, drop: [], add: [] };
}

async function skillCheck(actorName, taskDesc, ability, difficulty) {
  const prompt =
`Adjudicate a skill check in a life-sim. Return ONLY {"pass":true} or {"pass":false}.
Actor: ${actorName}. Task: ${taskDesc}. Their ability: ${ability}. Task difficulty: ${difficulty}/100 (higher is harder).
Judge realistically whether they succeed this attempt. A capable actor on a moderate task usually passes; a novice on a hard task usually fails, but nothing is guaranteed either way.`;
  const out = await callClaude(prompt, CFG.SKILLCHECK.maxTokens);
  return out?.pass === true;   // anything malformed reads as a failed attempt (safe default)
}

/* ===== Stage 3.9 — the adversarial interrogation =====
   Two models, a real exchange. The SUSPECT answers a detective's question, told
   secretly whether they're guilty and how much they can hold out (resolve, from
   personality + evidence pressure). A guilty suspect deflects/denies and only
   cracks once pressed past their resolve; an innocent answers honestly and CANNOT
   be talked into a false confession — though a poor detective may still wrongly
   read them as guilty. Returns { say, cracked }. */
async function suspectReply(name, personality, guilty, resolve, evidence, victim, question, history) {
  const hist = history.length ? history.map(h => `${h.who === "det" ? "Detective" : name}: "${h.text}"`).join("\n") : "(this is the first question)";
  const prompt =
`You are ${name} in a small-town life-sim, being interrogated about the murder of ${victim}. You are: ${personality}.
SECRET (never state it outright): you are ${guilty ? "GUILTY — you did it" : "INNOCENT — you had nothing to do with it"}.
${guilty
  ? `You want to avoid conviction. Deflect, deny, stay consistent with anything you've already said. Your composure/resolve is ${resolve}/100 — the harder and sharper the detective's pressure (and the more evidence they cite, currently ${evidence}/3), the more you slip. If the detective genuinely corners you with something you can't explain, you may crack. Only set cracked=true if you actually break and confess.`
  : `You are innocent and answer honestly, though you may be nervous or annoyed. You CANNOT be made to confess to something you didn't do — never set cracked=true.`}
Transcript so far:
${hist}
Detective's question: "${question}"
Reply in character, ONE or two sentences. Return ONLY JSON: {"say":"your reply","cracked":true|false}.`;
  const out = await callClaude(prompt, 220);
  return out && typeof out.say === "string" ? { say: out.say, cracked: out.cracked === true && guilty } : { say: "...I have nothing to say.", cracked: false };
}

/* The DETECTIVE decides the next move: either ask another question (pressing a
   contradiction) or conclude. Their SKILL shapes how sharp they are and whether
   they read the suspect correctly. On the final move they must return a verdict:
   accuse (they believe this person did it) or clear. The sim grades that verdict
   against the truth — a wrong accusation is a real (wrongful) conviction. */
async function detectiveMove(detName, skillDesc, suspectName, evidence, question_no, maxQ, history, mustConclude) {
  const hist = history.map(h => `${h.who === "det" ? detName : suspectName}: "${h.text}"`).join("\n") || "(no exchange yet)";
  const prompt =
`You are ${detName}, a Watch detective in a life-sim, interrogating ${suspectName} about a murder. Your skill: ${skillDesc}. Evidence gathered: ${evidence}/3.
This is question ${question_no} of at most ${maxQ}. ${mustConclude ? "You MUST conclude now — no more questions." : "You may ask ONE more pointed question OR conclude if you're sure."}
A sharper detective asks tighter questions, catches contradictions, and judges guilt more accurately. Weak evidence and a consistent suspect should make you cautious about accusing.
Transcript:
${hist}
Return ONLY JSON. To ask: {"action":"ask","say":"your question"}. To conclude: {"action":"conclude","verdict":"accuse"|"clear","say":"what you say to them"}.`;
  const out = await callClaude(prompt, 220);
  if (!out || (out.action !== "ask" && out.action !== "conclude")) return { action: "conclude", verdict: "clear", say: "That's all for now." };
  if (out.action === "ask" && mustConclude) return { action: "conclude", verdict: out.verdict === "accuse" ? "accuse" : "clear", say: out.say || "We're done here." };
  return out;
}


function relLine(npc, npcsById) {
  const parts = Object.entries(npc.relationships)
    .map(([id, st]) => `${st === "friend" ? "friend of" : st} ${id === "player" ? "the player" : (npcsById[id]?.name || id)}`);
  return parts.length ? parts.join("; ") : "no strong feelings about anyone yet";
}
const invLine = (ent) => {
  const items = Object.entries(ent.inv).filter(([, c]) => c > 0).map(([id, c]) => `${ITEMS[id].name} x${c}`);
  return items.length ? items.join(", ") : "nothing";
};
// Stage 3.7b: a compact "how ready are they for trouble" line for the AI brains — carried food,
// drink, and medicine counts, so the director can nudge the under-provisioned to stock up.
const provisionLine = (ent) => {
  let food = 0, drink = 0, med = 0;
  for (const [id, c] of Object.entries(ent.inv)) {
    if (!(c > 0)) continue;
    if (ITEMS[id]?.eat?.hunger) food += c;
    if (ITEMS[id]?.eat?.thirst) drink += c;
    if (ITEMS[id]?.cat === "med" || id === "medicine") med += c;
  }
  const flag = (food < 2 || drink < 2) ? " ⚠LOW-SUPPLIES" : "";
  return `provisions: ${food} food, ${drink} drink, ${med} med${flag}`;
};

/* chat — the FULL dossier: needs, health, hygiene, wallet, pockets,
   reputation & wanted status on both sides, who's standing nearby,
   active buzz, today's notable events. Everything notable, every call. */
async function askNPC(npc, playerMsg, ctx, npcsById) {
  const history = npc.chatLog.map(m => `${m.who}: ${m.text}`).join("\n");
  const mem = npc.memories.length ? `Important memories: ${npc.memories.join("; ")}.` : "";
  const prompt =
`You are ${npc.name}, ${npc.desc} in the town of ${ctx.townName}. Personality: ${npc.personality}.
Likes: ${npc.likes.join(", ")}. Dislikes: ${npc.dislikes.join(", ")}. Feelings: ${relLine(npc, npcsById)}.
YOUR STATE — hunger ${ctx.hunger}/100, thirst ${ctx.thirst}/100, energy ${ctx.energy}/100, health: ${healthDesc(npc.health)}, hygiene: ${hygieneDesc(npc.hygiene)}. You have ${Math.floor(npc.coins)} coins and carry: ${invLine(npc)}. You are ${fameTier(npc.fame, npc.renown)}${npc.wanted > 0 ? ` and WANTED by the Watch (level ${npc.wanted})` : ""}. Currently: ${npc.activity}.${npc.intent ? ` Today you planned to: ${npc.intent}.` : ""}
${mem}
THE PLAYER — ${ctx.playerTier}${ctx.playerWanted > 0 ? `, currently wanted by the Watch (level ${ctx.playerWanted})` : ""}, looks ${healthDesc(ctx.playerHealth)}, hygiene: ${hygieneDesc(ctx.playerHygiene)}${ctx.playerArmed ? ", visibly carrying a weapon" : ""}.
SCENE — ${ctx.clock}, day ${ctx.day}. Nearby: ${ctx.nearby || "no one else"}.${ctx.buzz ? ` Town buzz: "${ctx.buzz}".` : ""}${ctx.recent ? ` Recently: ${ctx.recent}.` : ""}
${ctx.interview ? `\nJOB INTERVIEW IN PROGRESS — you are interviewing the player for the position of ${ctx.interview.position} at ${ctx.interview.business} (your business). Their training: ${ctx.interview.skills}. Their reputation: ${ctx.playerTier}. Ask pointed, in-character questions about work ethic and skill. After 2-3 exchanges (${ctx.interview.exchanges} so far), when you have enough, include "verdict":"hire" or "verdict":"pass" in your JSON. Weigh their ACTUAL answers along with skill and reputation — a skilled applicant who's rude or evasive still fails; an eager unskilled one with great answers can squeak in. In "remember", record honestly how the interview went.\n` : ""}${history ? `Recent conversation:\n${history}\n` : ""}The player says: "${playerMsg}"

Respond ONLY with JSON, no markdown:
{"reply":"under 35 words, in character","mood":"happy|neutral|grumpy|tired","remember":"null OR a new important memory under 12 words","relationship":"null|warmer|cooler","impression":"null|kind|rude"${ctx.interview ? ',"verdict":"null|hire|pass"' : ""}}
Only set remember for genuinely notable things. Only shift relationship if the player earned it. Set impression only if the player was clearly kind or clearly rude.`;
  return callClaude(prompt, CFG.CHAT_MAX_TOKENS);
}

async function dailyPulse(town, npcs, dayLog, npcsById, playerTier) {
  const roster = npcs.map(n =>
    `- ${n.id} (${n.name}): ${n.personality}. Feels: ${relLine(n, npcsById)}. Has ${Math.floor(n.coins)} coins, ${healthDesc(n.health)}.` +
    `${n.wanted > 0 ? ` WANTED lvl ${n.wanted}.` : ""}${n.memories.length ? ` Memories: ${n.memories.join("; ")}.` : ""}` +
    ` Needs h${Math.round(n.hunger)}/t${Math.round(n.thirst)}/e${Math.round(n.energy)}. ${provisionLine(n)}.`
  ).join("\n");
  const spots = Object.keys(town.spots).join("|");
  const prompt =
`You are the town director for ${town.name}, a cozy life-sim with real stakes. Plan today in SMALL touches.
Residents:
${roster}
The player is ${playerTier}.
${dayLog.length ? `Yesterday: ${dayLog.join(". ")}.` : "Yesterday was quiet."}

Respond ONLY with JSON, no markdown:
{"npcs":{"<id>":{"intent":"their small plan today, under 8 words","mood":"happy|neutral|grumpy|tired","spot":"${spots}|null"}},
"encounters":[{"a":"<id>","b":"<id>","lines":["Name: line","Name: line","Name: line"]}],
"drift":[{"a":"<id>","b":"<id>","change":"warmer|cooler"}]}
Rules: every resident gets an entry. Max 2 encounters between residents with history, lines under 12 words. Max 2 drifts, only if yesterday justifies one. Stay in character.
IMPORTANT — SELF-CARE: anyone marked ⚠LOW-SUPPLIES, or with a need below 30, should have an intent that gets them sorted: buying food/water to carry, stocking up, or heading to eat/drink. A resident keeping a few meals and drinks in their pocket is normal, sensible behavior — lean toward it. Nobody should wander idly while low on supplies or needs.`;
  return callClaude(prompt, CFG.PULSE_MAX_TOKENS);
}

/* Stage 6 — ambient NPC↔NPC chatter. A VERY simplified two-line exchange: speaker says
   something notable (gossip about a third person, a reaction to a recent event, their read on
   the listener), listener gives a short reply. Tiny call, tightly capped. Returns
   { a: "speaker line", b: "listener reply" }. */
async function ambientChat(speaker, listener, context) {
  const prompt =
`Two townsfolk cross paths in a small-town life sim. Write a SHORT, natural exchange between them.
SPEAKER: ${speaker.name} — ${speaker.personality}.
LISTENER: ${listener.name} — ${listener.personality}.
What's on ${speaker.name}'s mind right now: ${context}
${speaker.name} opens with ONE short line (gossip, an observation, a reaction — under 14 words), ${listener.name} replies with ONE short line (under 14 words). Keep it casual and in-character; no narration.
Return ONLY JSON: {"a":"<speaker line>","b":"<listener reply>"}.`;
  const out = await callClaude(prompt, CFG.AMBIENT.chatTokens);
  return (out && typeof out.a === "string" && typeof out.b === "string") ? out : null;
}

/* Stage 6 — a nearby NPC's reply to something the PLAYER said aloud. One short line, in
   character, only if it's relevant to them. Returns { reply: "<line>" } or a skip. */
async function speechReply(npc, playerName, said, context) {
  const prompt =
`In a small-town life sim, ${playerName} says aloud (nearby): "${said}"
You are ${npc.name} — ${npc.personality}. Context you know: ${context}
If this is worth reacting to, reply with ONE short in-character line (under 16 words). If it's not addressed to you or not worth a reply, return an empty reply.
Return ONLY JSON: {"reply":"<your line or empty string>"}.`;
  const out = await callClaude(prompt, CFG.AMBIENT.speechTokens);
  return (out && typeof out.reply === "string") ? out.reply.trim() : null;
}

/* Stage 6 — the weekly Council Call: the mayor reviews one town's ledger and may fund an
   upgrade. One small call; on error the LOCAL fallback buys the cheapest affordable option. */
async function councilCall(mayorPersona, townName, coins, approval, options, recent) {
  const prompt =
`You are ${mayorPersona}, presiding over the weekly Council Call for ${townName}.
Treasury: ${coins} coins. Public approval: ${approval}%. Affordable town upgrades: ${options.map(o => `${o.id} (${o.cost}c — ${o.blurb})`).join("; ") || "none"}.
This week around town: ${recent || "a quiet week"}.
Decide: fund ONE listed upgrade id, or none. Then give a one-line public proclamation (under 22 words, in character).
Return ONLY JSON: {"buy":"<upgrade id or empty string>","say":"<proclamation>"}.`;
  const out = await callClaude(prompt, CFG.COUNCIL.tokens);
  return (out && typeof out.say === "string") ? out : null;
}

/* Stage 7 — the Heist Nudge: Claude PLANS a crime. Given desperate/outlaw candidates and the
   fattest marks (with their storage security), it picks who hits whom, and whether to wait for
   nightfall. Executes through the REAL burglary pipeline (walk, crack, case, interrogation). */
async function heistPlan(perps, marks) {
  const prompt =
`You plan a house burglary in a small-town crime sim. Choose the best pairing.
CANDIDATES (would-be burglars): ${perps.map(p => `${p.id} — ${p.why}, guile ${p.guile}`).join("; ")}.
MARKS (targets): ${marks.map(m => `${m.id} — ~${m.loot}c loot, security: ${m.security}, ${m.away}`).join("; ")}.
Pick ONE perp id and ONE mark id (a plausible pairing — desperate people take risks, professionals take scores). Timing matters: people are HOME at night — hitting a worker's house in the daytime finds it empty, while night jobs risk waking the resident (a witness). Set night accordingly. Give the perp a short muttered line (under 10 words).
Return ONLY JSON: {"perp":"<id>","mark":"<id>","night":true,"say":"<line>"}.`;
  const out = await callClaude(prompt, CFG.HEIST.tokens);
  return (out && out.perp && out.mark) ? out : null;
}

/* Pass 3 — Cole's weekly patrol planning: the senior officer reads the crime picture and
   assigns town routes to the two Junior officers. Good patrol design: cover where crime is
   happening, don't both stand in the same square, and don't leave any town dark for long. */
async function patrolPlan(context, towns, juniorNames) {
  const prompt =
`You are Cole, the senior Watch officer of a four-town region, planning this week's patrol routes for your Junior officer(s): ${juniorNames.join(" and ")}.
CRIME PICTURE: ${context}
Towns: ${towns.join(", ")}.
Good routes cover the hot spots hardest, split coverage so the Juniors aren't in the same town at once, and leave no town unvisited all week. Each route is an ordered list of 2-3 towns to cycle. Add a one-line briefing to the Juniors.
Return ONLY JSON: {"tessa":["<town>","<town>"],"briar":["<town>","<town>"],"brief":"<one line>"}.`;
  const out = await callClaude(prompt, CFG.WATCH_PLAN.tokens);
  return (out && Array.isArray(out.tessa) && Array.isArray(out.briar)) ? out : null;
}

/* Trade offers — the receiving side decides via one tiny call (local value-compare fallback).
   A trade can carry a NOTE ("I'll pay you to fix my fence") that lands in the acceptor's
   memory — and memories feed the pulses, so a paid favor can genuinely be acted on. */
async function tradeConsider(decider, offererName, rel, t) {
  const giveStr = [t.give.coins ? `${t.give.coins} coins` : "", t.give.item ? `${t.give.qty}× ${ITEMS[t.give.item]?.name || t.give.item}` : ""].filter(Boolean).join(" + ") || "nothing";
  const askStr = [t.ask.coins ? `${t.ask.coins} coins` : "", t.ask.item ? `${t.ask.qty}× ${ITEMS[t.ask.item]?.name || t.ask.item}` : ""].filter(Boolean).join(" + ") || "nothing";
  const prompt =
`${decider.name} — ${decider.personality}. ${offererName} (${rel} to you) proposes a trade:
THEY GIVE you: ${giveStr}. THEY ASK from you: ${askStr}.${t.note ? ` They add: "${t.note}"` : ""}
You hold ${Math.floor(decider.coins)} coins. Accept only if it serves you — fair value, a friend's ask, or a favor that suits your character.
Return ONLY JSON: {"accept":true,"say":"<one short in-character line>"}.`;
  const out = await callClaude(prompt, CFG.TRADE.tokens);
  return (out && typeof out.accept === "boolean") ? out : null;
}

/* Trade-note follow-through: once an owner ACCEPTS a paid trade with a note, read the note
   for concrete business tasks they've now agreed to do. Returns a subset of the allowed verbs
   (upgrade / hire / restock). Anything not a real request → []. A keyword scan is the fallback. */
async function favorInterpret(npcName, personality, bizName, note) {
  const prompt =
`${npcName} (${personality}) owns ${bizName} in a small-town life-sim. A townsperson just paid them in a trade and asked: "${note}".
Which concrete business actions did they agree to take? Pick any that apply:
- "upgrade": install or improve the cash register/security, or buy a shop upgrade
- "hire": take on more staff / couriers / transporters
- "restock": order more stock / supplies
If the note isn't really a business request, return an empty list.
Return ONLY JSON: {"tasks":["upgrade"|"hire"|"restock", ...]}.`;
  const out = await callClaude(prompt, 40);
  const tasks = Array.isArray(out?.tasks) ? out.tasks.filter(t => ["upgrade", "hire", "restock"].includes(t)) : null;
  return tasks;   // null → caller runs the keyword fallback
}

async function microNudge(town, npcs, dayLog, npcsById, playerTier) {
  const roster = npcs.map(n =>
    `- ${n.id} (${n.name}): mood ${n.mood}, ${Math.floor(n.coins)} coins, needs h${Math.round(n.hunger)}/t${Math.round(n.thirst)}, ${provisionLine(n)}, carries ${invLine(n)}. Feels: ${relLine(n, npcsById)}.`
  ).join("\n");
  const prompt =
`You direct tiny mid-day moments in ${town.name}, a cozy life-sim. Based on today so far, pick 1-3 SMALL actions.
Residents:
${roster}
The player is ${playerTier}.
Today so far: ${dayLog.join(". ")}.
Item ids: ${Object.keys(ITEMS).join(", ")}. Spots: ${Object.keys(town.spots).join(", ")}.

Respond ONLY with JSON, no markdown:
{"nudges":[{"npc":"<id>","say":"one in-character line under 12 words","do":"goto|buy|gift_coins|gift_item|visit|send_letter|throw_party|trade","spot":"<spot>|null","item":"<itemId>|null","amount":<1-15>|null,"askItem":"<itemId>|null","askAmount":<coins>|null,"target":"<npcId>|player|null"}]}
Actions must fit character, relationships, and what happened today. Gifts stay small.
"trade" proposes a SWAP with target: item/amount = what they GIVE, askItem/askAmount = what they ASK back; say is the pitch and may include a favor ("I'll pay you to watch the shop") — the other side decides.
"send_letter" needs target + say (the letter text). "throw_party" ONLY for someone with 30+ coins — they cater the WHOLE town. Max 3 nudges.
SELF-CARE PRIORITY: if someone is ⚠LOW-SUPPLIES or has a need under 30, prefer a "buy" action (food or a drink to carry) for them over flavor — keeping a pocket buffer of meals and drinks is smart, in-character behavior worth nudging.`;
  return callClaude(prompt, CFG.NUDGE_MAX_TOKENS);
}

/* Incident Call — fired only when NPCs witness a theft or face a robber.
   One small call decides everyone's reaction in character. */
async function incidentCall(kind, npcs, context, npcsById) {
  const roster = npcs.map(n =>
    `- ${n.id} (${n.name}): ${n.personality}. Feels: ${relLine(n, npcsById)}.${n.enforcer ? " A sworn officer of the Watch." : ""}${n.minor ? " A child." : ""} Health: ${healthDesc(n.health)}${bestWeapon(n) ? ", armed" : ""}.`
  ).join("\n");
  const prompt = kind === "crime"
    ? `A theft just happened in a cozy life-sim: ${context}. These residents witnessed it:
${roster}
For EACH witness decide, in character: "arrest" (attempt a citizen's arrest — they must dare to), "ignore" (look away), or "flee" (leave, unsettled).
Respond ONLY with JSON, no markdown: {"choices":{"<id>":"arrest|ignore|flee"}}`
    : kind === "body"
    ? `In a life-sim with real stakes, ${context}. The one who found it:
${roster}
EVERYONE reports a body — the only question is composure. Decide in character: "report" (steady, straight to the Watch) or "panic" (scream, flee the scene, THEN report).
Respond ONLY with JSON, no markdown: {"reaction":"report|panic"}`
    : `In a cozy life-sim, ${context}. The victim:
${roster}
Decide their response in character: "submit" (hand over coins), "run" (try to escape and report it), or "fight" (stand their ground).
Respond ONLY with JSON, no markdown: {"response":"submit|run|fight"}`;
  return callClaude(prompt, CFG.INCIDENT.tokens);
}

/* =====================================================================
   COMPONENT
   ===================================================================== */
export default function Alderbrook() {
  const [screen, setScreen] = useState("device");
  const [isPhone, setIsPhone] = useState(false);
  const [difficulty, setDifficulty] = useState("normal");
  const [saveFound, setSaveFound] = useState(false);
  const [storageOk, setStorageOk] = useState(true);
  const [hud, setHud] = useState(null);
  const [actions, setActions] = useState([]);
  const [chat, setChat] = useState(null);
  const [chatInput, setChatInput] = useState("");
  const [interro, setInterro] = useState(null);   // Stage 3.9: player-interrogation chat panel state
  const [storagePanel, setStoragePanel] = useState(false);   // Stage 4: home cash storage
  const [chestPanel, setChestPanel] = useState(false);       // Stage 4: item chest
  const [managePanel, setManagePanel] = useState(null);      // Stage 5: owner business-management panel {bId}
  const [hallPanel, setHallPanel] = useState(null);          // civic: {town} — ledger, taxes, elections, mayor tools
  const [bizOffer, setBizOffer] = useState(null);            // {bId, price, say} — the owner's asking price on the table
  const [placePanel, setPlacePanel] = useState(null);        // {furnId} — pick a home slot for a new piece
  const regRobArmRef = useRef(null);                         // Stage 5: two-tap confirm for robbing a register
  const printSurfRef = useRef(null);                         // Stage 6: printer minigame drag surface
  const printDragRef = useRef(null);                         // Stage 6: which paper is being dragged
  const [speakOpen, setSpeakOpen] = useState(false);         // Stage 6: player "speak aloud" input
  const [speakText, setSpeakText] = useState("");
  const [castPanel, setCastPanel] = useState(false);         // Stage 6: fishing tier chooser
  const [tradePanel, setTradePanel] = useState(null);        // player→NPC trade composer { npcId, ... }
  const [picker, setPicker] = useState(null);                // frozen-time target picker { kind: gift|talk|trade|threaten|attack }
  const zoomRef = useRef(1);                                 // camera zoom (outdoors only) — a ref: the canvas loop reads it, no re-render
  const [craftPanel, setCraftPanel] = useState(null);        // v7 Stage 5: the crafting minigame { stage, recipeId, ... }
  const [repairPanel, setRepairPanel] = useState(null);      // v7 Stage 5c: the mechanic minigames { bId, st, kind, ... }
  const [zoomHud, setZoomHud] = useState(1);                 // mirror for the HUD buttons
  const [tradeOffer, setTradeOffer] = useState(null);        // NPC→player incoming offer { fromId, give, ask, note }
  const [apiKeyInput, setApiKeyInput] = useState("");         // optional API key for standalone webpage builds
  const lastSpeechRef = useRef(0);                           // Stage 6: throttle on speech replies
  const saveFileInputRef = useRef(null);                     // hidden file input for save-file import
  const [toast, setToast] = useState(null);
  const [transition, setTransition] = useState(null);
  const [folk, setFolk] = useState(null);
  const [minigame, setMinigame] = useState(null);       // office | dish | fish | cook
  const [invOpen, setInvOpen] = useState(false);
  const [shopPanel, setShopPanel] = useState(null);
  const [payPanel, setPayPanel] = useState(null);
  const [payAmount, setPayAmount] = useState("");
  const [cookPanel, setCookPanel] = useState(false);
  const [partyPanel, setPartyPanel] = useState(null);
  const [caseBoard, setCaseBoard] = useState(false);    // recipe picker at a stove
  const [travelPanel, setTravelPanel] = useState(false);// Mo's fare menu
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [threat, setThreat] = useState(null);           // { robberId } — submit/run/fight
  const [combat, setCombat] = useState(null);           // { foeId, log, over, won }
  const [deathScreen, setDeathScreen] = useState(null); // hardcore epitaph
  const [jailScreen, setJailScreen] = useState(null);   // Stage 2.3: life-sentence cell UI (prison break)
  const [, forceUI] = useState(0);                      // nudge re-render after ref-side changes
  const bump = () => forceUI(n => n + 1);

  const canvasRef = useRef(null), wrapRef = useRef(null);
  const worldRef = useRef(null), simRef = useRef(null);
  const keysRef = useRef({});
  const chatRef = useRef(null); chatRef.current = chat;
  const minigameRef = useRef(null); minigameRef.current = minigame;
  const cookPanelRef = useRef(null); cookPanelRef.current = cookPanel || null;
  const transitionRef = useRef(null); transitionRef.current = transition;
  const combatRef = useRef(null); combatRef.current = combat;
  const threatRef = useRef(null); threatRef.current = threat;
  const modalRef = useRef(false);
  modalRef.current = !!(chat || shopPanel || payPanel || invOpen || cookPanel || travelPanel || settingsOpen || threat || combat || deathScreen || jailScreen || partyPanel || caseBoard || folk || speakOpen || castPanel || managePanel || storagePanel || chestPanel || tradePanel || tradeOffer || picker || hallPanel || bizOffer || placePanel);
  const jailRef = useRef(false);
  jailRef.current = !!jailScreen;                        // Stage 3.5: jail time is REAL — the cell must not pause the sim
  const apiBusyRef = useRef(false);
  const saveTimerRef = useRef(0);
  const chatEndRef = useRef(null);

  const showToast = (msg) => { setToast(msg); setTimeout(() => setToast(t => (t === msg ? null : t)), 2800); };
  const diff = () => CFG.DIFF[simRef.current?.settings?.difficulty || "normal"];

  /* ---------- construction ---------- */
  const freshSim = useCallback((difficultyChoice) => {
    const world = buildWorld();
    worldRef.current = world;
    const npcs = NPC_DEFS.map((def, i) => ({
      ...def,
      scene: `t:${def.town}`,
      x: def.home ? bld(def.home).door.x : world.towns[def.town].spots.bench.x,   // Stage 3.5: the homeless start on the bench
      y: def.home ? bld(def.home).door.y : world.towns[def.town].spots.bench.y,
      hunger: 60 + (i * 4) % 30, thirst: 60 + (i * 7) % 30, energy: 80,
      hygiene: 65 + (i * 5) % 30, health: 100, alive: true, wanted: 0,
      legs: [], path: [], goal: null, activity: "starting the day", hidden: false,
      bubble: null, lastGreet: -999, mood: "neutral",
      evicted: false, vagrantWarned: false,             // Stage 3: rent debt + the officer's one free pass
      chatLog: [], memories: [], knownGossip: [],
      relationships: { ...def.rel },
      inv: { ...def.startInv, ...(def.minor ? {} : { bread: 1 }) },   // Stage 2.1: a starting pantry buffer (adults)
      intent: null, directive: null,
      tidy: null, lastTidy: -99, paidMeal: false, lastGiftDay: 0, lastCook: -99,
      report: null,                                     // {thiefId|bodyId} — heading out to report
      dispatch: null,                                   // enforcer assignment {targetId}
      crimePlan: null,                                  // thief NPC's next attempt {bId}
      burglaryPlan: null,                               // Stage 4: pending home burglary {homeId, markId}
      hostingUntil: 0,                                  // Stage 4: absTime until which they stay home to host a visitor
      courierOrder: null,                               // Stage: the delivery a hired postal courier is currently running
      incap: null, dying: null, bedrest: false, jailedUntil: null,
      sick: null,                                       // null | {level:'mild'|'bad'}
      visitPlan: null,                                  // cross-town social trip {targetId, phase}
      workTick: 0, caseWork: null, printUntil: null,    // staff task timer / investigation / Bruno vs printer
      skills: { ...(NPC_SKILL_SEED[def.id] || {}) },    // xp per trade — veterans seed high
      expertise: JSON.parse(JSON.stringify(EXPERTISE_SEED[def.id] || {})),   // Stage 3.7c: signature domains
      furniture: [], stored: 0, chest: {},   // Stage 4
      domainXp: {},                                     // per-domain completions → earns new expertise at EXPERTISE_EARN_AT
      occupation: seedOccupation(def),                  // Stage 2: formal job, title, rank
      patrolIdx: 0, lastPatrol: -99,
    }));
    // veterans seeded with high skill start at the rank they've earned (Priya
    // isn't a fresh Filing Clerk). Owners already sit at the top rung.
    for (const n of npcs) {
      const occ = n.occupation;
      if (!occ.bId && !occ.spot) continue;               // jobless / handled
      if (occ.owner) continue;                            // owners fixed at ownerRank
      const lvl = CFG.SKILL.levels.filter(t => (n.skills?.[occ.track] || 0) >= t).length;
      let rank = 0;
      for (let r = 1; r < CFG.OCCUPATION.promoteAtLevel.length; r++)
        if (lvl >= CFG.OCCUPATION.promoteAtLevel[r]) rank = r;
      occ.rank = rank; occ.title = titleFor(occ.category, rank);
    }
    const mess = {};
    for (const b of BUILDINGS.filter(b => b.enterable)) mess[b.id] = 10 + Math.random() * 20;
    simRef.current = {
      time: CFG.START_HOUR * 60, day: 1,
      player: { scene: "t:alderbrook", x: bld("home_p").door.x, y: bld("home_p").door.y, home: "home_p",   // home was never set — furniture stations checked p.home and always failed
        hunger: 85, thirst: 85, energy: 95, hygiene: 90, health: 100, alive: true,
        coins: CFG.START_COINS, inv: { bread: 1, water: 1 }, fame: 0, renown: 0,
        wanted: 0, bedrest: false, incap: null, dying: null, sick: null, hospitalBill: 0,
        evicted: false, vagrantWarned: false,           // Stage 3
        skills: {}, expertise: {}, domainXp: {}, job: null,   // Stage 3.7c: player earns domain expertise too
        furniture: [], stored: 0, chest: {},   // Stage 4: installed furniture, cash in home storage, chest item map
        occupation: { bId: null, category: null, track: null, rank: 0, title: "Unemployed",
                      owner: false, hiredDay: 1, missed: 0, workedDay: -1, idleSince: 1 } },
      npcs, lastDecide: 0, lastChatter: 0,
      dialogues: [], pulseDay: {}, nudgeDone: {}, ownerPulseDay: -1,
      treasury: { alderbrook: CFG.TREASURY_SEED, mossford: CFG.TREASURY_SEED, stonecross: CFG.TREASURY_SEED, ferndale: CFG.TREASURY_SEED },   // Stage 3: hall-safe escrow
      lastStipendHr: null, lastVagrancySweep: -9999,    // Stage 3: doctor pay + night-beat sweep trackers
      fx: [],                                           // Stage 3.5: transient crime/arrest pulses (unsaved)
      incidents: { day: 1, count: 0 },                  // incident-call counter (for the optional settings limit)
      encounters: [], dayLog: [], buzz: null,
      mail: null, foodOrder: null, task: null, mess,
      graves: [],                                       // {name, day, cause} — empty until it isn't
      bodies: [],                                       // the dead, where they fell, until found & processed
      stock: initStock(),                               // per-building item counts — shelves are REAL now
      menu: {},                                          // Stage 3.7: sim.menu[bId] = { item: sellPrice } — seeded on first tick
      demand: {},                                       // Stage 2.1: {bId: {itemId: recentSales}} — drives mid-day restock
      orders: [],                                       // delivery parcels waiting at the post office
      letters: [], playerMail: [],                      // social mail in transit / your inbox
      cases: [], ethics: [],                            // the Watch's case board + compliance ledger
      party: null, inspectDue: false, carryOrders: [], mailStalledNoted: false,   // Stage: parcels being hauled + postal-service-down flag
      registers: {}, upgrades: {}, dishes: {},   // Stage 5: registers, owned upgrades, per-eatery dirty-dish counts
      ambientHour: -1, ambientCount: 0, forceChatter: null,   // Stage 6: per-hour cap + post-nudge guaranteed exchange
      townUpgrades: { alderbrook: {}, mossford: {}, stonecross: {}, ferndale: {} }, councilDay: -1,   // Stage 6: civic improvements + last Council day
      tradeQueue: [],   // pending NPC↔NPC trade offers awaiting a considered decision
      crime: { ticks: 0, blockedWatch: 0, blockedRoll: 0, blockedCap: 0, attempts: 0, arrests: 0 },   // the crime ledger (diagnosis + future town stats)
      foragedAt: {},    // v7 Stage 3: bush cooldowns (`t:town:x,y` → last foraged day)
      approval: { alderbrook: CFG.APPROVAL.start, mossford: CFG.APPROVAL.start, stonecross: CFG.APPROVAL.start, ferndale: CFG.APPROVAL.start },   // Stage 8
      opening: null, interviewBans: {}, interview: null, // the job market: today's HIRING post + cooldowns
      crimeAlert: null,                                 // player-witnessed theft {thiefId, bId}
      playerReport: null,                               // player's committed citizen arrest
      homePlacements: {},                               // furniture on the floor: {homeId: {"x,y": furnId}}
      election: { nextDay: CFG.ELECTION.firstDay, playerRunning: false, last: null },   // the ballot cycle
      taxRate: CFG.TAX.rate, playerMayor: false,        // the mayor's dials (player-adjustable in office)
      bizQuotes: {},                                    // today's business asking prices {bId: {day, price, say}}
      settings: { difficulty: difficultyChoice || "normal", pulse: true, nudges: 2, incidents: 99, sfx: true, sfxVol: 0.6, apiKey: USER_API_KEY || "" },  // 99 = unlimited; carry any key set on the title screen
    };
  }, []);

  /* ---------- persistence ---------- */
  const serializeSim = () => {
    const sim = simRef.current;
    return {
      v: 6, day: sim.day, time: sim.time, dayLog: sim.dayLog,
      pulseDay: sim.pulseDay, nudgeDone: sim.nudgeDone, mess: sim.mess,
      ownerPulseDay: sim.ownerPulseDay,
      treasury: sim.treasury, lastStipendHr: sim.lastStipendHr,
      graves: sim.graves, settings: sim.settings,
      stock: sim.stock, menu: sim.menu, openQueue: sim.openQueue, orders: sim.orders, letters: sim.letters, playerMail: sim.playerMail,
      demand: sim.demand, lastRestockSweep: sim.lastRestockSweep,
      cases: sim.cases, ethics: sim.ethics, bodies: sim.bodies,
      registers: sim.registers, upgrades: sim.upgrades, dishes: sim.dishes,
      townUpgrades: sim.townUpgrades, councilDay: sim.councilDay, approval: sim.approval, tradeQueue: sim.tradeQueue, foragedAt: sim.foragedAt,
      ownerOverrides: sim.ownerOverrides || {},
      treeChops: sim.treeChops || {}, playerFurniture: sim.player.furniture || [], contracts: sim.contracts || [],
      appliances: sim.appliances || {}, ownsManor: !!sim.ownsManor,
      homePlacements: sim.homePlacements || {}, election: sim.election,
      taxRate: sim.taxRate, playerMayor: !!sim.playerMayor,
      opening: sim.opening, interviewBans: sim.interviewBans,
      player: { ...sim.player, dying: null, jailedUntil: sim.player.jailedUntil === Infinity ? "life" : sim.player.jailedUntil },
      npcs: Object.fromEntries(sim.npcs.map(n => [n.id, {
        hunger: n.hunger, thirst: n.thirst, energy: n.energy, mood: n.mood,
        hygiene: n.hygiene, health: n.health, alive: n.alive, wanted: n.wanted,
        coins: n.coins, inv: n.inv, fame: n.fame, renown: n.renown, sick: n.sick, skills: n.skills,
        expertise: n.expertise, domainXp: n.domainXp,
        furniture: n.furniture, stored: n.stored, chest: n.chest,
        occupation: n.occupation, work: n.work,
        home: n.home, evicted: !!n.evicted, vagrantWarned: !!n.vagrantWarned,
        town: n.town,
        jailedUntil: n.jailedUntil === Infinity ? "life" : n.jailedUntil,
        memories: n.memories, relationships: n.relationships, knownGossip: n.knownGossip,
        grossThisPeriod: n.grossThisPeriod || 0,   // Stage 4: the tax accumulator survives a save
        mayor: !!n.mayor, patrolRoute: n.patrolRoute || null,   // Pass 4: the chair + the beat survive too
        timesJailed: n.timesJailed || 0, spreeUntil: n.spreeUntil || null,   // the criminal career survives too
        favors: n.favors || null,   // paid-favor promises the owner still owes
      }])),
    };
  };
  const saveGame = useCallback(async () => {
    const sim = simRef.current;
    if (!sim || !window.storage) return;
    try {
      await window.storage.set(CFG.SAVE_KEY, JSON.stringify(serializeSim()));
    } catch (e) {
      if (storageOk) { setStorageOk(false); showToast("Saving unavailable here — running session-only."); }
    }
  }, [storageOk]);

  const applySaveData = (data) => {
    const sim = simRef.current;
    sim.day = data.day; sim.time = data.time;
    sim.dayLog = data.dayLog || []; sim.pulseDay = data.pulseDay || {};
    sim.ownerPulseDay = data.ownerPulseDay ?? -1;
    if (data.treasury) sim.treasury = data.treasury;
    sim.lastStipendHr = data.lastStipendHr ?? null;
    sim.nudgeDone = data.nudgeDone || {}; sim.mess = { ...sim.mess, ...data.mess };
    sim.graves = data.graves || []; sim.settings = { ...sim.settings, ...data.settings };
    if (data.stock) sim.stock = data.stock;
    if (data.menu) sim.menu = data.menu;
    if (data.openQueue !== undefined) sim.openQueue = data.openQueue;
    sim.demand = data.demand || {}; sim.lastRestockSweep = data.lastRestockSweep ?? -9999;
    sim.orders = data.orders || []; sim.letters = data.letters || [];
    sim.playerMail = data.playerMail || []; sim.cases = data.cases || [];
    sim.ethics = data.ethics || []; sim.bodies = data.bodies || [];
    sim.registers = data.registers || {}; sim.upgrades = data.upgrades || {}; sim.dishes = data.dishes || {};
    sim.townUpgrades = { alderbrook: {}, mossford: {}, stonecross: {}, ferndale: {}, ...(data.townUpgrades || {}) };
    sim.councilDay = data.councilDay ?? -1;
    sim.approval = { alderbrook: CFG.APPROVAL.start, mossford: CFG.APPROVAL.start, stonecross: CFG.APPROVAL.start, ferndale: CFG.APPROVAL.start, ...(data.approval || {}) };
    sim.tradeQueue = data.tradeQueue || [];
    sim.foragedAt = data.foragedAt || {};
    sim.ownerOverrides = data.ownerOverrides || {};
    for (const [ob, oo] of Object.entries(sim.ownerOverrides)) OWNERS[ob] = oo;   // v7 Stage 5: deeds survive the save
    sim.treeChops = data.treeChops || {};
    sim.playerFurniture = data.playerFurniture || [];
    sim.contracts = data.contracts || [];
    sim.appliances = data.appliances || {};
    sim.ownsManor = !!data.ownsManor;
    sim.homePlacements = data.homePlacements || {};
    sim.election = data.election || { nextDay: Math.max(sim.day + 3, CFG.ELECTION.firstDay), playerRunning: false, last: null };
    sim.taxRate = data.taxRate ?? CFG.TAX.rate;
    sim.playerMayor = !!data.playerMayor;
    sim.bizQuotes = {};
    if (!sim.treasury.ferndale) sim.treasury.ferndale = CFG.TREASURY_SEED;   // pre-Ferndale saves
    sim.opening = data.opening || null; sim.interviewBans = data.interviewBans || {};
    sim.interview = null;
    if (data.settings?.apiKey) { setUserApiKey(data.settings.apiKey); setApiKeyInput(data.settings.apiKey); }   // restore the key
    if (data.settings) { sfx.enabled = data.settings.sfx !== false; sfx.volume = data.settings.sfxVol ?? 0.6; }   // restore sound prefs
    const playerOcc = sim.player.occupation;
    Object.assign(sim.player, data.player,
      { scene: "t:alderbrook", x: bld("home_p").door.x, y: bld("home_p").door.y, incap: null, dying: null, bedrest: false });
    if (!sim.player.occupation) {
      sim.player.occupation = sim.player.job
        ? makeOccupation(sim.player, sim.player.job.bId, { hiredDay: sim.player.job.since || sim.day })
        : playerOcc;
    }
    sim.player.home = "home_p";                          // older saves predate the field (furniture stations need it)
    sim.player.furniture = Array.from(new Set([...(sim.player.furniture || []), ...(sim.playerFurniture || [])]));   // crafted pieces used to live in a SEPARATE list
    sim.playerFurniture = sim.player.furniture;          // legacy alias kept pointed at the real list
    if (sim.player.jailedUntil === "life") sim.player.jailedUntil = Infinity;
    if (sim.player.jailedUntil === Infinity && sim.player.scene?.startsWith("i:")) {
      setJailScreen({ bId: sim.player.scene.slice(2), day: sim.day });
    } else setJailScreen(null);
    for (const n of sim.npcs) {
      const s = data.npcs[n.id]; if (!s) continue;
      const freshOcc = n.occupation, freshWork = n.work;
      Object.assign(n, s, { relationships: { ...n.relationships, ...s.relationships }, inv: { ...s.inv },
        jailedUntil: s.jailedUntil === "life" ? Infinity : s.jailedUntil });
      if (!n.occupation) n.occupation = freshOcc;
      if (!n.work) n.work = freshWork;
      if (!n.knownGossip) n.knownGossip = [];
      if (n.work?.bId && n.work.station) n.work.station = validStation(n.work.bId, n.work.station);
    }
    syncPlacements(sim, worldRef.current);               // stand owned furniture up in its rooms (auto-slot legacy saves)
  };
  const loadGame = useCallback(async () => {
    freshSim();
    try {
      const res = await window.storage.get(CFG.SAVE_KEY);
      applySaveData(JSON.parse(res.value));
    } catch (e) { /* fresh world stands */ }
  }, [freshSim]);

  // Save FILE: download the whole sim as JSON. Works anywhere (artifact or standalone webpage),
  // unlike window.storage which only exists inside the Claude artifact host.
  const exportSave = () => {
    try {
      const blob = new Blob([JSON.stringify(serializeSim(), null, 2)], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url; a.download = `alderbrook-day${simRef.current.day}.json`;
      document.body.appendChild(a); a.click(); a.remove();
      URL.revokeObjectURL(url);
      showToast("💾 Save file downloaded.");
    } catch (e) { showToast("Couldn't export the save here."); }
  };
  // load a save FILE the player uploads
  const importSave = (file) => {
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const data = JSON.parse(reader.result);
        if (!data || !data.player || !data.npcs) { showToast("That doesn't look like an Alderbrook save."); return; }
        freshSim();
        applySaveData(data);
        saveGame();               // mirror into storage if available
        setSettingsOpen(false);
        showToast(`📂 Loaded save — day ${data.day}.`);
        bump();
      } catch (e) { showToast("Couldn't read that save file."); }
    };
    reader.readAsText(file);
  };

  useEffect(() => {
    (async () => {
      try { const r = await window.storage?.get(CFG.SAVE_KEY); if (r?.value) setSaveFound(true); }
      catch (e) { /* no save */ }
    })();
    const savedKey = loadPersistedApiKey();   // pre-fill the title-screen key from this device
    if (savedKey) { setUserApiKey(savedKey); setApiKeyInput(savedKey); }
  }, []);

  const wipeSave = async () => {
    try { await window.storage?.delete(CFG.SAVE_KEY); } catch (e) { /* fine */ }
    setSaveFound(false);
  };

  const start = async (phone, continueSave) => {
    try { const ac = sfx._ac(); if (ac?.state === "suspended") ac.resume(); } catch (e) { /* no audio */ }
    setIsPhone(phone);
    if (continueSave) await loadGame(); else freshSim(difficulty);
    setDeathScreen(null);
    setScreen("game");
  };

  /* =====================================================================
     ECONOMY + REPUTATION (rebalanced: 100-200c is SHOCKING, 1000c mythic)
     ===================================================================== */
  const transferCoins = (sim, from, to, amount) => {
    const n = Math.min(from.coins, Math.max(0, Math.floor(amount)));
    if (n <= 0) return 0;
    from.coins -= n; to.coins = Math.min(9999, to.coins + n);
    return n;
  };
  const giveItem = (from, to, itemId, count = 1) => {
    const n = Math.min(from.inv[itemId] || 0, count);
    if (n <= 0) return 0;
    from.inv[itemId] -= n; to.inv[itemId] = (to.inv[itemId] || 0) + n;
    return n;
  };
  const consumeItem = (ent, itemId) => {
    const it = ITEMS[itemId];
    if (!(ent.inv[itemId] > 0) || (!it.eat && !it.cure && !it.heal)) return false;
    ent.inv[itemId]--;
    // Stage 4: a home DINING TABLE enriches every meal — +5 to each stat it already feeds,
    // and +5 energy always — but only when eaten in the owner's own home.
    const atOwnHome = ent.furniture?.includes("table") && ent.home && ent.scene === `i:${ent.home}`;
    if (it.eat) {
      for (const [k, v] of Object.entries(it.eat)) {
        const bonus = atOwnHome && v > 0 ? CFG.FURN.diningBonus : 0;
        ent[k] = clamp(ent[k] + v + bonus, 0, 100);
      }
      if (atOwnHome && !it.eat.energy) ent.energy = clamp(ent.energy + CFG.FURN.diningBonus, 0, 100);   // +5 energy even if the item gives none
    }
    if (it.cure) ent.sick = null;                       // medicine clears illness
    if (it.heal) ent.health = clamp(ent.health + it.heal, 0, 100);
    return true;
  };
  /* ===== Stage 6 — gossip: notable news that spreads person-to-person through chats ===== */
  // tag one or more NPCs as knowing a piece of news. subjectId = who it's about; bad = reflects poorly on them.
  const seedGossip = (sim, knowers, item) => {
    const g = { id: `g${sim.day}_${Math.floor(sim.time)}_${Math.random().toString(36).slice(2, 6)}`,
      text: item.text, subjectId: item.subjectId || null, bad: !!item.bad, day: sim.day };
    for (const kn of knowers) {
      if (!kn || !kn.knownGossip) continue;
      kn.knownGossip = [...kn.knownGossip.filter(x => x.text !== g.text), g].slice(-CFG.AMBIENT.gossipMax);
    }
  };
  // during a chat, speaker passes ONE fresh item the listener doesn't know. Returns the transferred item or null.
  const spreadGossip = (sim, speaker, listener) => {
    if (!speaker.knownGossip?.length) return null;
    const fresh = speaker.knownGossip.find(g => !listener.knownGossip.some(x => x.text === g.text)
      && g.subjectId !== listener.id);   // don't tell someone gossip about themselves
    if (!fresh) return null;
    listener.knownGossip = [...listener.knownGossip, fresh].slice(-CFG.AMBIENT.gossipMax);
    // the listener now remembers it secondhand
    listener.memories = [...listener.memories, `Heard that ${fresh.text}`].slice(-CFG.MAX_MEMORIES);
    // reputation ripple: a bad rumor sours the listener toward the subject (even unwitnessed)
    if (fresh.bad && fresh.subjectId) {
      const relKey = fresh.subjectId;
      if (listener.id !== relKey && (relKey === "player" ? true : sim.npcs.some(n => n.id === relKey))) {
        const REL = REL_ORDER, cur = REL.indexOf(listener.relationships[relKey] || "neutral");
        listener.relationships[relKey] = REL[clamp(cur - CFG.AMBIENT.gossipRelStep, 0, REL.length - 1)];
      }
    }
    return fresh;
  };
  /* MECHANIC MINIGAME 1 — plumbing: slide each highlighted slider fully left→right, N times
     each; it snaps back to the left when the next rep is up. Overcomplicated Simon says. */
  const SliderGame = ({ reps, sliders, onDone }) => {
    const [rep, setRep] = useState(0);            // total completed slides
    const [v, setV] = useState(0);
    const total = reps * sliders;
    const active = rep % sliders;                 // alternate sliders
    const onSlide = (nv) => {
      setV(nv);
      if (nv >= 100) { sfx.pop(); const nr = rep + 1; setRep(nr); setV(0); if (nr >= total) onDone(); }
    };
    return (
      <div style={{ ...S.chatBody, gap: 14, alignItems: "center" }}>
        <div style={{ fontSize: 12, opacity: 0.7 }}>Flush the lines: slide the lit one all the way right. {rep}/{total}</div>
        {Array.from({ length: sliders }).map((_, i) => (
          <input key={i} type="range" min={0} max={100} value={i === active ? v : 0} disabled={i !== active}
            onChange={e => i === active && onSlide(+e.target.value)}
            style={{ width: 240, accentColor: i === active ? "#c9a84a" : "#555", opacity: i === active ? 1 : 0.4 }} />
        ))}
      </div>
    );
  };
  /* MECHANIC MINIGAME 2 — the oven: press the labeled buttons in the prompted order; after
     each press, route the center RED dot to the LEFT or RIGHT black dot as prompted. */
  const ButtonGame = ({ steps, routing, onDone }) => {
    const [plan] = useState(() => {
      const labels = Array.from({ length: 4 }, () => String.fromCharCode(65 + Math.floor(Math.random() * 26)) + Math.floor(Math.random() * 10));
      const order = [...Array(4).keys()].sort(() => Math.random() - 0.5).slice(0, steps);
      return { labels, order, routes: order.map(() => (Math.random() < 0.5 ? "L" : "R")) };
    });
    const [at, setAt] = useState(0);              // which step
    const [phase, setPhase] = useState("press");  // press → route
    const done = at >= steps;
    const press = (i) => {
      if (phase !== "press" || done) return;
      if (i === plan.order[at]) { sfx.pop(); routing ? setPhase("route") : advance(); }
      else { sfx.alert(); setAt(0); setPhase("press"); }   // wrong button: the sequence resets
    };
    const route = (side) => {
      if (phase !== "route" || done) return;
      if (side === plan.routes[at]) { sfx.pop(); advance(); }
      else { sfx.alert(); setAt(0); setPhase("press"); }
    };
    const advance = () => { const n = at + 1; setAt(n); setPhase("press"); if (n >= steps) onDone(); };
    return (
      <div style={{ ...S.chatBody, gap: 12, alignItems: "center" }}>
        <div style={{ fontSize: 12, opacity: 0.75, textAlign: "center" }}>
          Sequence: {plan.order.map((b, i) => `${plan.labels[b]}${routing ? (plan.routes[i] === "L" ? "◀" : "▶") : ""}`).join(" → ")}
          <br /><b>{done ? "Done." : phase === "press" ? `Press ${plan.labels[plan.order[at]]}` : `Route the red dot ${plan.routes[at] === "L" ? "LEFT ◀" : "RIGHT ▶"}`}</b> · {at}/{steps}
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          {plan.labels.map((lb, i) => (
            <button key={i} onClick={() => press(i)} style={{ width: 54, height: 44, borderRadius: 8, border: "none", fontWeight: 800, background: "#4a4d58", color: "#fff" }}>{lb}</button>
          ))}
        </div>
        {routing && (
          <div style={{ display: "flex", gap: 34, alignItems: "center", opacity: phase === "route" ? 1 : 0.35 }}>
            <button onClick={() => route("L")} style={{ width: 26, height: 26, borderRadius: "50%", border: "none", background: "#181818" }} />
            <div style={{ width: 20, height: 20, borderRadius: "50%", background: "#c94a4a" }} />
            <button onClick={() => route("R")} style={{ width: 26, height: 26, borderRadius: "50%", border: "none", background: "#181818" }} />
          </div>
        )}
      </div>
    );
  };
  /* MECHANIC MINIGAME 3 — the drink machine: a toggle switch + a knob. Spin the knob a full
     turn and it only COUNTS if the switch is set right — and each counted spin re-rolls
     which way the switch must sit. Ten of those. Overcomplicated Simon says, as ordered. */
  const KnobGame = ({ spins, onDone }) => {
    const [count, setCount] = useState(0);
    const [need, setNeed] = useState(Math.random() < 0.5 ? "up" : "down");
    const [sw, setSw] = useState("up");
    const accRef = useRef(0); const lastRef = useRef(null); const knobRef = useRef(null);
    const [ang, setAng] = useState(0);
    const onMove = (e) => {
      if (lastRef.current == null || !knobRef.current) return;
      const r = knobRef.current.getBoundingClientRect();
      const cx = r.left + r.width / 2, cy = r.top + r.height / 2;
      const a = Math.atan2(e.clientY - cy, e.clientX - cx);
      let d = a - lastRef.current;
      if (d > Math.PI) d -= 2 * Math.PI; if (d < -Math.PI) d += 2 * Math.PI;
      accRef.current += d; lastRef.current = a; setAng(g => g + d * 57.3);
      if (Math.abs(accRef.current) >= 2 * Math.PI) {
        accRef.current = 0;
        if (sw === need) { sfx.pop(); const n = count + 1; setCount(n); setNeed(Math.random() < 0.5 ? "up" : "down"); if (n >= spins) onDone(); }
        else sfx.alert();   // a wasted turn — the switch was wrong
      }
    };
    return (
      <div style={{ ...S.chatBody, gap: 12, alignItems: "center" }}>
        <div style={{ fontSize: 12, opacity: 0.75 }}>Switch <b>{need.toUpperCase()}</b>, then a full turn of the knob. {count}/{spins}</div>
        <div style={{ display: "flex", gap: 30, alignItems: "center" }}>
          <button onClick={() => setSw(s => s === "up" ? "down" : "up")}
            style={{ width: 44, height: 76, borderRadius: 10, border: "2px solid #666", background: "#2a2d36", color: "#fff", display: "flex", alignItems: sw === "up" ? "flex-start" : "flex-end", justifyContent: "center", padding: 5 }}>
            <div style={{ width: 26, height: 26, borderRadius: 6, background: sw === need ? "#4a9a5a" : "#c9a84a" }} />
          </button>
          <div ref={knobRef}
            onPointerDown={(e) => { e.currentTarget.setPointerCapture(e.pointerId); const r = e.currentTarget.getBoundingClientRect(); lastRef.current = Math.atan2(e.clientY - (r.top + r.height / 2), e.clientX - (r.left + r.width / 2)); }}
            onPointerMove={onMove}
            onPointerUp={() => { lastRef.current = null; }}
            style={{ width: 96, height: 96, borderRadius: "50%", background: "radial-gradient(circle at 35% 35%, #6a6d78, #3a3d46)", border: "3px solid #222",
              display: "flex", alignItems: "center", justifyContent: "center", touchAction: "none", cursor: "grab", transform: `rotate(${ang}deg)` }}>
            <div style={{ width: 8, height: 30, borderRadius: 4, background: "#c9a84a", marginBottom: 50 }} />
          </div>
        </div>
      </div>
    );
  };

  /* the crafting clamp meter: fills while ALL clamps are held; releasing resets it */
  const HoldMeter = ({ holdT, ms, onDone }) => {
    const [p, setP] = useState(0);
    useEffect(() => {
      if (!holdT) { setP(0); return; }
      let raf;
      const tick = () => {
        const f = Math.min(1, (performance.now() - holdT) / ms);
        setP(f);
        if (f >= 1) onDone(); else raf = requestAnimationFrame(tick);
      };
      raf = requestAnimationFrame(tick);
      return () => cancelAnimationFrame(raf);
    }, [holdT]);
    return (
      <div style={{ height: 10, borderRadius: 5, background: "#2a2d36", overflow: "hidden" }}>
        <div style={{ height: "100%", width: `${p * 100}%`, background: p >= 1 ? "#4a9a5a" : "#c9a84a", transition: "width 0.05s linear" }} />
      </div>
    );
  };

  /* ===== the camera's pointer inputs: wheel to zoom, pinch to zoom ===== */
  useEffect(() => {
    const cv = canvasRef.current; if (!cv) return;
    const onWheel = (e) => {
      if (modalRef.current || !simRef.current?.player.scene.startsWith("t:")) return;
      e.preventDefault();
      nudgeZoom(e.deltaY < 0 ? CFG.ZOOM.step : -CFG.ZOOM.step);
    };
    let pinch0 = null, z0 = 1;
    const gap = (t) => Math.hypot(t[0].clientX - t[1].clientX, t[0].clientY - t[1].clientY);
    const onStart = (e) => { if (e.touches.length === 2) { pinch0 = gap(e.touches); z0 = zoomRef.current; } };
    const onMove = (e) => {
      if (e.touches.length !== 2 || !pinch0) return;
      if (modalRef.current || !simRef.current?.player.scene.startsWith("t:")) return;
      e.preventDefault();
      setZoom(z0 * (gap(e.touches) / pinch0));
    };
    const onEnd = () => { pinch0 = null; };
    cv.addEventListener("wheel", onWheel, { passive: false });
    cv.addEventListener("touchstart", onStart, { passive: true });
    cv.addEventListener("touchmove", onMove, { passive: false });
    cv.addEventListener("touchend", onEnd);
    return () => {
      cv.removeEventListener("wheel", onWheel); cv.removeEventListener("touchstart", onStart);
      cv.removeEventListener("touchmove", onMove); cv.removeEventListener("touchend", onEnd);
    };
  }, []);

  /* ===== trade offers ===== */
  const tradeValue = (t) => (t.coins || 0) + (t.item ? (ITEMS[t.item]?.price || 1) * (t.qty || 1) : 0);
  const canFulfillTrade = (ent, t) => (t.coins || 0) <= ent.coins && (!t.item || (ent.inv[t.item] || 0) >= (t.qty || 1));
  const tradeSummary = (give, ask) => {
    const s = (t) => [t.coins ? `${t.coins}c` : "", t.item ? `${t.qty}× ${ITEMS[t.item]?.name || t.item}` : ""].filter(Boolean).join("+") || "nothing";
    return `${s(give)} for ${s(ask)}`;
  };
  // both parties can be an NPC or the player. The NOTE lands in memory on BOTH sides — the
  // acceptor remembers what they agreed to; the offerer remembers what they asked for.
  const executeTrade = (sim, giver, taker, give, ask, note) => {
    const xfer = (from, to, t) => {
      if (t.coins) { from.coins -= t.coins; to.coins = Math.min(9999, to.coins + t.coins); }
      if (t.item && t.qty) { from.inv[t.item] = (from.inv[t.item] || 0) - t.qty; if (from.inv[t.item] <= 0) delete from.inv[t.item]; to.inv[t.item] = (to.inv[t.item] || 0) + t.qty; }
    };
    xfer(giver, taker, give); xfer(taker, giver, ask);
    const gName = giver.id ? giver.name : "the player", tName = taker.id ? taker.name : "the player";
    const sum = tradeSummary(give, ask);
    if (giver.id) giver.memories = [...giver.memories, `Traded with ${tName}: ${sum}${note ? ` (I asked: "${note}")` : ""}`].slice(-CFG.MAX_MEMORIES);
    if (taker.id) taker.memories = [...taker.memories, `Traded with ${gName}: ${sum}${note ? ` — and agreed: "${note}"` : ""}`].slice(-CFG.MAX_MEMORIES);
    sim.dayLog.push(`${gName} and ${tName} made a trade`);
  };
  /* ===== trade-note follow-through — a paid favor an owner actually DOES ===== */
  // offline reading of the note when the AI's unavailable
  const favorKeywords = (note) => {
    const s = (note || "").toLowerCase(); const tasks = [];
    if (/upgrad|improve|register|security|better|renovat|till/.test(s)) tasks.push("upgrade");
    if (/hire|staff|worker|transporter|courier|deliver|employ|\bhelp\b|another|more people|more hands/.test(s)) tasks.push("hire");
    if (/stock|restock|order|supply|supplies|inventor|shelves/.test(s)) tasks.push("restock");
    return tasks;
  };
  // execute ONE agreed task for a business the NPC owns; returns true if something happened
  const runFavor = (sim, npc, kind, bId) => {
    if (OWNERS[bId] !== npc.id) return false;
    if (kind === "hire") {
      const staff = sim.npcs.filter(n => n.alive && n.occupation?.bId === bId && !n.occupation.owner).length;
      if (staff >= 2) { npc.bubble = { text: "I've got the hands I need, honestly.", until: performance.now() / 1000 + 4 }; return true; }
      const seeker = pickJobSeeker(sim, bId); if (!seeker) return false;   // nobody free today — retry tomorrow
      hireNpc(sim, seeker, bId);
      sim.buzz = { text: `${seeker.name} hired on at ${bld(bId).name} — ${npc.name} was good to their word.`, day: sim.day };
      sim.dayLog.push(`${npc.name} hired ${seeker.name} at ${bld(bId).name} (a favor the player paid for)`);
      npc.bubble = { text: `Done — ${seeker.name} starts on the ${bld(bId).name} floor.`, until: performance.now() / 1000 + 4 };
      return true;
    }
    if (kind === "upgrade") {
      const reg = sim.registers[bId];
      if (!reg) { if (npc.coins >= CFG.REGISTER.unlockCost && buyRegisterTier(sim, bId, 0)) { sim.dayLog.push(`${npc.name} installed a register at ${bld(bId).name} (paid favor)`); npc.bubble = { text: "New till's in. Sharp, eh?", until: performance.now() / 1000 + 4 }; return true; } return false; }
      if (reg.security < 2) { const tier = reg.security + 1, cost = tier === 1 ? CFG.REGISTER.lightCost : CFG.REGISTER.highCost; if (reg.cash >= cost && buyRegisterTier(sim, bId, tier)) { sim.dayLog.push(`${npc.name} upgraded security at ${bld(bId).name} (paid favor)`); npc.bubble = { text: "Locked down tighter now.", until: performance.now() / 1000 + 4 }; return true; } return false; }
      const up = upgradesFor(bId).find(id => !hasUpgrade(sim, bId, id) && reg.cash >= CFG.UPGRADES[id].cost);
      if (up && buyUpgrade(sim, bId, up)) { sim.dayLog.push(`${bld(bId).name} added ${CFG.UPGRADES[up].name} (paid favor)`); npc.bubble = { text: `${CFG.UPGRADES[up].emoji} ${CFG.UPGRADES[up].name} — installed.`, until: performance.now() / 1000 + 4 }; return true; }
      return false;
    }
    if (kind === "restock") {
      if (!SHOP_STOCK[bId]) return false;
      const need = {};
      for (const it of SHOP_STOCK[bId]) { if (KITCHEN[bId]?.includes(it)) continue; if (stockOf(sim, bId, it) <= CFG.STOCK.low && ITEMS[it]) need[it] = CFG.STOCK.orderQty; }
      const inbound = sim.orders.filter(o => o.bId === bId && o.state !== "delivered").flatMap(o => Object.keys(o.items));
      for (const it of inbound) delete need[it];
      if (!Object.keys(need).length) { npc.bubble = { text: "Shelves are full up already.", until: performance.now() / 1000 + 4 }; return true; }
      const goods = Math.ceil(Object.entries(need).reduce((s, [it, q]) => s + ITEMS[it].price * q, 0) * CFG.STOCK.wholesale);
      fineCoins(npc, goods);
      sim.orders.push({ id: `${bId}_favor_${sim.day}_${Math.floor(sim.time)}`, bId, items: need, state: "ready", day: sim.day });
      sim.dayLog.push(`${npc.name} put in a big restock order for ${bld(bId).name} (paid favor)`);
      npc.bubble = { text: "Order's in — mail brings it round.", until: performance.now() / 1000 + 4 };
      return true;
    }
    return false;
  };
  // the player paid + the owner agreed: interpret the note and queue the tasks (try now, retry at dawn)
  const commissionFavor = (sim, npc, note) => {
    const bId = Object.keys(OWNERS).find(b => OWNERS[b] === npc.id && (SHOP_STOCK[b] || KITCHEN[b] || b === "post"));
    if (!bId || !note) return;
    const queue = (tasks) => {
      const uniq = [...new Set(tasks)];
      if (!uniq.length) return;
      npc.favors = npc.favors || [];
      for (const kind of uniq) {
        const done = runFavor(sim, npc, kind, bId);
        if (!done) npc.favors.push({ kind, bId, since: sim.day });   // couldn't yet — retry each dawn for a few days
      }
    };
    if (USER_API_KEY && !apiBusyRef.current) {
      apiBusyRef.current = true;
      favorInterpret(npc.name, npc.personality, bld(bId).name, note)
        .then(tasks => queue(tasks == null ? favorKeywords(note) : tasks))
        .catch(() => queue(favorKeywords(note)))
        .finally(() => { apiBusyRef.current = false; });
    } else queue(favorKeywords(note));
  };
  // local fallback: fair value, softened for friends; never accept what you can't pay
  const localTradeDecide = (decider, offerer, t) => {
    if (!canFulfillTrade(decider, t.ask)) return false;
    const rel = REL_ORDER.indexOf(decider.relationships?.[offerer.id || "player"] || "neutral");
    const softness = rel >= REL_ORDER.indexOf("friend") ? 0.6 : 0.85;
    return tradeValue(t.give) >= tradeValue(t.ask) * softness;
  };
  // NPC↔NPC offers queue here; one considered decision at a time, riding the shared latch
  const processTrades = (sim) => {
    if (!sim.tradeQueue?.length || apiBusyRef.current) return;
    const t = sim.tradeQueue.shift();
    const from = sim.npcs.find(n => n.id === t.fromId && n.alive), to = sim.npcs.find(n => n.id === t.toId && n.alive);
    if (!from || !to) return;
    const finish = (accept, say) => {
      if (accept && canFulfillTrade(from, t.give) && canFulfillTrade(to, t.ask)) { executeTrade(sim, from, to, t.give, t.ask, t.note); sfx.coin(); }
      to.bubble = { text: say || (accept ? "Deal." : "Pass."), until: performance.now() / 1000 + 3.5 };
    };
    apiBusyRef.current = true;
    tradeConsider(to, from.name, to.relationships[from.id] || "neutral", t)
      .then(out => out ? finish(out.accept, out.say) : finish(localTradeDecide(to, from, t), null))
      .catch(() => finish(localTradeDecide(to, from, t), null))
      .finally(() => { apiBusyRef.current = false; });
  };
  const repEvent = (sim, ent, dFame, dRenown, note) => {
    ent.fame = clamp(ent.fame + dFame, -100, 100);
    ent.renown = clamp(ent.renown + dRenown, 0, 100);
    if (note) sim.dayLog = [...sim.dayLog, note].slice(-12);
  };
  /* justice & wholesale can push a balance NEGATIVE — debt. Income climbs
     it back; a debtor can't gift or buy until they're in the black. */
  const fineCoins = (ent, n) => { ent.coins -= n; };
  /* ===== Stage 3 — treasury + civic-medicine helpers ===== */
  // the ONE pipe into a town's hall safe (bills + rent now; taxes/fines in Stage 6)
  const payTreasury = (sim, townId, n) => { sim.treasury[townId] = (sim.treasury[townId] || 0) + n; };
  // the practicing doctor of a facility, if they still live (FACILITY_DOCTOR)
  const facilityDoctor = (sim, bId) => sim.npcs.find(n => n.id === FACILITY_DOCTOR[bId] && n.alive) || null;
  // Pete's rate: 1c per 20 miles out of the Alderbrook depot, 1c minimum
  const shippingCost = (townId) => {
    // Stage 5: the Delivery Truck upgrade at the post stretches each fare chunk (20 → 25 miles per coin)
    const chunk = hasUpgrade(simRef.current, "post", "truck") ? 25 : CFG.SHIPPING.perMileChunk;
    return Math.max(1, Math.ceil((CFG.SHIPPING.miles[townId] || 0) / chunk));
  };
  /* Stage 3.7: the owner-set sell price for an item at a shop — falls back to base
     price wherever no menu exists yet (older saves, un-revised shops, non-owner buildings). */
  const priceOf = (sim, bId, itemId) => {
    const m = sim.menu?.[bId];
    if (m && m[itemId] != null) return m[itemId];
    return ITEMS[itemId].price;
  };
  /* the delivery SURCHARGE on a single item: +1c per OWNERECON.surchargePer coins of
     base value above the threshold. Cheap goods (≤5c) surcharge nothing; it stacks on
     top of the existing flat/cross-town delivery fee. */
  const itemSurcharge = (itemId) => Math.max(0, Math.ceil((ITEMS[itemId].price - CFG.OWNERECON.surchargeAbove) / CFG.OWNERECON.surchargePer));
  /* seed a shop's opening menu: take the front of its candidate pool (stores capped to
     ~2 cooked items), price at base, deal opening stock. Idempotent-safe (only fills gaps). */
  const seedMenu = (sim, bId) => {
    const pool = (SHOP_CANDIDATES[bId] || []).filter(id => !FURNITURE[id]);   // Stage 4: furniture is fixed-catalog, priced separately
    if (!SHOP_CANDIDATES[bId]) return;
    if (pool.length === 0) { sim.menu = sim.menu || {}; sim.menu[bId] = {}; return; }   // pure furniture shop → empty menu
    const isEatery = !!KITCHEN[bId];
    let cookedBudget = isEatery ? 99 : 2;                 // plain stores: at most a couple baked goods
    const chosen = [];
    for (const id of pool) {
      if (chosen.length >= CFG.OWNERECON.menuSize) break;
      if (COOKED_ITEMS.has(id)) { if (cookedBudget <= 0) continue; cookedBudget--; }
      chosen.push(id);
    }
    sim.menu = sim.menu || {};
    sim.menu[bId] = {};
    // Stage 3.7 (corrected): the DEFAULT opening menu (front-of-pool, base price), dealt WITH
    // opening stock — this is the fallback for an owner's opening set, so it mirrors a stocked open.
    for (const id of chosen) { sim.menu[bId][id] = ITEMS[id].price; sim.stock[bId] = sim.stock[bId] || {}; sim.stock[bId][id] = Math.max(stockOf(sim, bId, id), CFG.OWNERECON.firstFill); }
  };
  /* apply an owner's considered decision: clamp prices to [0, 2×base], drop/add up to
     maxSwaps (added items start at ZERO stock), then reprice. Fully local & safe. */
  const applyOwnerDecision = (sim, bId, dec) => {
    const menu = sim.menu[bId] || (sim.menu[bId] = {});
    const pool = SHOP_CANDIDATES[bId] || [];
    let items = Object.keys(menu);
    const opening = items.length === 0;                   // Stage 3.7: composing a menu from scratch on day 1
    // OPENING: adds are unbounded (up to menuSize), no drops needed. REVISION: bounded drop/add swaps.
    const drops = opening ? [] : (dec.drop || []).filter(id => menu[id] != null).slice(0, CFG.OWNERECON.maxSwaps);
    const rawAdds = (dec.add || []).filter(id => pool.includes(id) && menu[id] == null);
    const adds = opening ? rawAdds.slice(0, CFG.OWNERECON.menuSize) : rawAdds.slice(0, drops.length);
    for (const id of drops) delete menu[id];
    for (const id of adds) {
      menu[id] = ITEMS[id].price;
      if (sim.stock[bId]) {
        // Stage 3.7 (corrected): the OPENING menu arrives STOCKED (firstFill); only revision
        // swap-ins start at 0 and must be reordered — the owner just decided to carry them.
        if (opening) sim.stock[bId][id] = Math.max(stockOf(sim, bId, id), CFG.OWNERECON.firstFill);
        else sim.stock[bId][id] = 0;
      }
    }
    // opening safety: if the owner named nothing usable, fall back to the deterministic default
    if (opening && Object.keys(menu).length === 0) { seedMenu(sim, bId); return; }
    items = Object.keys(menu);
    for (const id of items) {
      const base = ITEMS[id].price;
      let px = dec.prices?.[id];
      if (px == null || isNaN(px)) px = base;
      menu[id] = clamp(Math.round(px), Math.floor(base * CFG.OWNERECON.priceMinMult), Math.ceil(base * CFG.OWNERECON.priceMaxMult));
    }
  };
  /* run one owner's biweekly review (or opening set) as a single API call, guarded by
     the shared API-busy latch so it never collides with pulses/incidents. */
  const reviseShop = (sim, bId, canSwap) => {
    if (apiBusyRef.current) return false;
    const ownerId = OWNERS[bId]; if (!ownerId) return false;
    const owner = sim.npcs.find(n => n.id === ownerId && n.alive); if (!owner) return false;
    const opening = !sim.menu?.[bId] || Object.keys(sim.menu[bId]).length === 0;   // Stage 3.7
    const menu = opening ? [] : Object.keys(sim.menu[bId]);   // empty menu → the owner COMPOSES it
    const kind = KITCHEN[bId] ? "eatery" : "shop";
    apiBusyRef.current = true;
    ownerConsider(bld(bId).name, owner.name, owner.personality, kind, menu, SHOP_CANDIDATES[bId] || [], ITEMS, canSwap, CFG.OWNERECON.maxSwaps)
      .then(dec => { sim.menu = sim.menu || {}; sim.menu[bId] = sim.menu[bId] || {}; applyOwnerDecision(sim, bId, dec);
        sim.dayLog = [...sim.dayLog, `${owner.name} ${opening ? "set the opening menu at" : "reworked"} ${bld(bId).name}`].slice(-12); })
      .catch(() => { if (opening) seedMenu(sim, bId); })   // API down at open → deterministic default; at revision → stands
      .finally(() => { apiBusyRef.current = false; });
    return true;
  };
  // Stage 4 hook: home/shop furniture (fridge +2c, fountain +1c weekly) surcharges bills HERE.
  // Deliberately reads zero — the catalog that feeds it doesn't exist until Stage 4.
  const furnitureUpkeep = (bId) => {
    // Stage 4: a resident's home furniture (fridge +2/wk, fountain +1/wk) surcharges THEIR housing bill.
    const sim = simRef.current; if (!sim) return 0;
    const resident = bId === "player_home" ? sim.player : sim.npcs.find(n => n.home === bId);
    if (!resident) return 0;
    return (resident.furniture || []).reduce((s, fid) => s + (FURNITURE[fid]?.upkeep || 0), 0);
  };
  // a solvent friend may step up for a heavy medical bill the patient can't afford; returns the payer or null
  const friendCoversBill = (sim, patientId, bill) => {
    if (Math.random() > CFG.MEDICAL.friendCoverChance) return null;
    return sim.npcs.find(n => n.alive && n.id !== patientId &&
      n.relationships[patientId] === "friend" && n.coins >= bill + 4) || null;
  };
  /* ===== Stage 3.5: when the player sleeps, the town sleeps =====
     Player time-jumps (bed/inn/bench) skip hours the NPCs never lived, so everyone
     used to wake exhausted. Walk the skipped span in 30-min chunks: anyone whose
     sleep window covers a chunk banks that rest and snaps to their sleeping place
     (home door — or the bench, with rough-sleeping rates, if homeless/evicted).
     Overnight workers keep their shift; jailed/bedridden/incap/dying are untouched. */
  const fastForwardNight = (sim, world, fromAbs, toAbs) => {
    for (const npc of sim.npcs) {
      if (!npc.alive || npc.jailedUntil || npc.bedrest || npc.incap || npc.dying) continue;
      const overnight = npc.schedule && npc.schedule[1] > 24;
      let sleptMin = 0;
      for (let t = fromAbs; t < toAbs; t += 30) {
        const hr = (t / 60) % 24;
        const asleep = overnight ? (hr >= 8 && hr < 16) : (hr >= 22 || hr < 6);
        if (asleep) sleptMin += Math.min(30, toAbs - t);
      }
      if (!sleptMin) continue;
      /* NOBODY SLEEPS THROUGH STARVATION. This fast-forward skips the needs AI for the whole
         night, so a sleeper who crosses the critical line would drain to zero and die in
         their sleep — with food in their pack (Dora, Mara, Ash all died exactly this way).
         If they're critical and CAN self-feed, they wake, eat, and go back down. */
      if (npc.hunger < CFG.STARVE.criticalNeed || npc.thirst < CFG.STARVE.criticalNeed) {
        const food = Object.keys(npc.inv || {}).find(i => ITEMS[i]?.eat?.hunger && npc.inv[i] > 0);
        const drink = Object.keys(npc.inv || {}).find(i => ITEMS[i]?.eat?.thirst && npc.inv[i] > 0);
        if (npc.hunger < CFG.STARVE.criticalNeed && food) {
          npc.hunger = clamp(npc.hunger + ITEMS[food].eat.hunger, 0, 100);
          npc.inv[food]--; if (npc.inv[food] <= 0) delete npc.inv[food];
        }
        if (npc.thirst < CFG.STARVE.criticalNeed && drink) {
          npc.thirst = clamp(npc.thirst + (ITEMS[drink].eat.thirst || 0), 0, 100);
          npc.inv[drink]--; if (npc.inv[drink] <= 0) delete npc.inv[drink];
        }
        /* Nothing to consume: they can't sleep it off. Skip the fast-forward entirely so the
           live needs AI (which preempts everything below criticalNeed) runs at dawn with
           their night intact — awake, hungry, and hunting. A rough night, not a grave. */
        if ((npc.hunger < CFG.STARVE.criticalNeed && !food) || (npc.thirst < CFG.STARVE.criticalNeed && !drink)) {
          npc.activity = "up in the night, hungry";
          continue;
        }
      }
      const hrs = sleptMin / 60, rough = !npc.home || npc.evicted;
      npc.energy = clamp(npc.energy + (rough ? 60 : 120) * hrs, 0, 100);
      npc.hygiene = clamp(npc.hygiene + (rough ? -20 : 30) * hrs, 0, 100);
      npc.health = clamp(npc.health + CFG.HEALTH.regenSleep * (rough ? 0.5 : 1) * hrs, 0, 100);
      const spot = rough ? world.towns[npc.town].spots.bench : bld(npc.home).door;
      npc.scene = `t:${npc.town}`; npc.x = spot.x; npc.y = spot.y;
      npc.legs = []; npc.path = []; npc.goal = null;
      npc.activity = rough ? "sleeping on a bench" : "sleeping at home"; npc.hidden = !rough;
    }
  };
  /* one pipe for task economics: revenue mints to the owner, wage moves
     owner → worker. Civic jobs (null owner) mint straight to the worker;
     an owner working solo keeps the whole revenue. Bruno's margin is real. */
  const skillLevel = (ent, track) => CFG.SKILL.levels.filter(t => (ent.skills?.[track] || 0) >= t).length;
  const skillTierName = (ent, track) => SKILL_TIER[skillLevel(ent, track)] || SKILL_TIER[0];
  // the desc string: "Cooking Professional (V)"
  const skillLabel = (ent, track) => `${SKILL_TRACKS[track]} ${skillTierName(ent, track)} (${ROMAN[skillLevel(ent, track)]})`;
  // does this actor hold EXPERTISE in a given domain? (earned into ent.expertise[track] = [domains])
  const hasExpertise = (ent, track, domain) => !!(domain && ent.expertise?.[track]?.includes(domain));
  // How many parcels the player can haul at once, gated by Logistics (stock): Apprentice(III)=2,
  // Professional(V)=3, otherwise 1. Handling parcels well means carrying more of them.
  const parcelCap = (ent) => { const lv = skillLevel(ent, "stock"); const base = lv >= 5 ? 3 : lv >= 3 ? 2 : 1; return base + (hasUpgrade(simRef.current, "post", "carts") ? 1 : 0); };   // Stage 5: walking carts +1
  /* Stage 3.7d: tier-based success. Given the actor, the task's difficulty tier, the relevant
     track, and its domain, return a success probability from the skill-level-vs-task-tier gap.
     Domain expertise counts as +tierExpertiseLevels effective levels. This is the legible model
     that replaces the raw baseDifficulty shave for tiered tasks (cooking, printer, and beyond). */
  // Stage 6: XP for a completed task by category + difficulty tier (floor of base × Fibonacci mult)
  const taskXp = (track, tier) => Math.max(1, Math.floor((CFG.TASKXP.base[track] || 1) * (CFG.TASKXP.fibTier[tier] ?? 1)));
  /* Stage 6: the player-side difficulty knobs for a minigame, from the skill-vs-tier gap.
     Returns a bundle each minigame reads selectively. gap>0 = easier, gap<0 = harder. */
  const taskParams = (ent, track, tier) => {
    const sc = CFG.SKILLCHECK, td = CFG.TASKDIFF;
    const gap = skillLevel(ent, track) - (sc.tierTargetLevel[tier] ?? 5);   // +above / −below the task's comfort level
    // a symmetric goal-width multiplier: wider when skilled, tighter when green
    const goalW = clamp(1 + (gap >= 0 ? gap * td.goalPerGap : gap * td.goalTightPerGap), td.goalMin, td.goalMax);
    return { gap, goalW,
      // convenience flags the minigames use:
      randomGoal: gap < 0,                 // under-skilled → goal in a random spot, not centered
      timeLimit: gap <= -3,                // badly under-skilled → a time limit kicks in
      allowUndo: gap >= 2,                 // comfortably skilled → undo allowed (drinks)
    };
  };
  const tierSuccess = (ent, tier, track, domain = null) => {
    const sc = CFG.SKILLCHECK;
    const eff = skillLevel(ent, track) + (hasExpertise(ent, track, domain) ? sc.tierExpertiseLevels : 0);
    const gap = eff - sc.tierTargetLevel[tier];
    const c = sc.tierBaseChance + (gap >= 0 ? gap * sc.tierPerLevelUp : gap * sc.tierPerLevelDown);
    return clamp(c, sc.tierMin, sc.tierMax);
  };
  const skillMult = (ent, track) => 1 + Math.min(CFG.SKILL.cap, skillLevel(ent, track) * CFG.SKILL.bonusPerLevel);
  /* --- Stage 2: occupation helpers (shared by NPCs and player) --- */
  // the rung an entity has EARNED in its category, capped by promoteAtLevel gates
  const earnedRank = (ent, category, track) => {
    const lvl = skillLevel(ent, track);
    let rank = 0;
    for (let r = 1; r < CFG.OCCUPATION.promoteAtLevel.length; r++)
      if (lvl >= CFG.OCCUPATION.promoteAtLevel[r]) rank = r;
    return rank;
  };
  // build a fresh occupation record when hiring into an employer (player or NPC)
  const makeOccupation = (ent, bId, { owner = false, hiredDay = 1 } = {}) => {
    if (!bId) return { bId: null, category: null, track: null, rank: 0, title: "Unemployed",
                       owner: false, hiredDay, missed: 0, workedDay: -1, idleSince: hiredDay };
    const category = JOB_CATEGORY[bId] || "service";
    const track = JOB_TRACK[bId] || category;
    const rank = owner ? CFG.OCCUPATION.ownerRank : earnedRank(ent, category, track);
    return { bId, category, track, rank, title: titleFor(category, rank),
             owner, hiredDay, missed: 0, workedDay: -1, idleSince: null };
  };
  // the pay multiplier a rank confers — stacks with skillMult in the pay pipe
  const rankMult = (ent) => 1 + (ent.occupation?.rank || 0) * CFG.OCCUPATION.rankRaisePct;
  /* --- Stage 2.2: skill-check plumbing (shared by printer/medical/investigation) --- */
  // compute a task's difficulty for THIS actor: hard baseline, eased by their
  // relevant skill level, their occupation rank, and owning the building in play.
  const checkDifficulty = (ent, track, ownsBuilding = false, domain = null) => {
    const sc = CFG.SKILLCHECK;
    let d = sc.baseDifficulty;
    d -= skillLevel(ent, track) * sc.perSkillLevel;           // raw practice: a LITTLE, everywhere in the trade
    d -= (ent.occupation?.rank || 0) * sc.perRank;
    if (ownsBuilding) d -= sc.ownerEase;
    // Stage 3.7c: domain EXPERTISE is the near-guarantee — but ONLY in that specific domain.
    if (domain && hasExpertise(ent, track, domain)) d -= sc.expertiseEase;
    return clamp(Math.round(d), sc.minDifficulty, 100);
  };
  // grant/track domain expertise from repetition. Returns true the moment it's newly EARNED.
  const trainDomain = (ent, track, domain) => {
    if (!domain) return false;
    ent.domainXp = ent.domainXp || {};
    const key = `${track}:${domain}`;
    ent.domainXp[key] = (ent.domainXp[key] || 0) + 1;
    if (ent.domainXp[key] >= EXPERTISE_EARN_AT && !hasExpertise(ent, track, domain)) {
      ent.expertise = ent.expertise || {};
      ent.expertise[track] = [...(ent.expertise[track] || []), domain];
      return true;
    }
    return false;
  };
  // both brakes in one gate: cooldown since last fail AND daily attempt cap.
  // dailyCap defaults to the shared value; callers can override (prison break differs).
  const canAttempt = (ent, taskKey, absMin, dailyCap = CFG.SKILLCHECK.dailyCap) => {
    const st = ent.checkState?.[taskKey];
    if (!st) return true;
    if (st.day === Math.floor(absMin / 1440) && st.tries >= dailyCap) return false;  // capped today
    if (absMin < (st.cooldownUntil || 0)) return false;                              // still cooling down
    return true;
  };
  // record a FAILED attempt: start the cooldown, tick the daily counter (resets each day).
  // cooldownMin defaults to the shared skill-check cooldown; callers can override (prison break is longer).
  const recordFail = (ent, taskKey, absMin, cooldownMin = CFG.SKILLCHECK.cooldownMin) => {
    if (!ent.checkState) ent.checkState = {};
    const day = Math.floor(absMin / 1440);
    const st = ent.checkState[taskKey];
    const tries = (st && st.day === day) ? st.tries + 1 : 1;
    ent.checkState[taskKey] = { cooldownUntil: absMin + cooldownMin, tries, day };
  };
  // clear a task's check-state on SUCCESS (or when the task ends) so it starts fresh next time
  const clearCheck = (ent, taskKey) => { if (ent.checkState) delete ent.checkState[taskKey]; };
  /* daily promotion review: if an employed entity's skill has crossed a rank
     gate, climb the ladder. Owners are fixed at the top. Returns true on a
     promotion so the caller can toast the player. */
  const reviewOccupation = (ent) => {
    const occ = ent.occupation;
    if (!occ || !occ.track || occ.owner) return false;   // jobless or owner: nothing to climb
    const earned = earnedRank(ent, occ.category, occ.track);
    if (earned > occ.rank) {
      occ.rank = earned; occ.title = titleFor(occ.category, earned);
      return true;
    }
    return false;
  };
  // clear the player's employment in one place — keeps job + occupation in lockstep
  const leaveJob = (p, sim) => {
    p.job = null;
    p.occupation = { bId: null, category: null, track: null, rank: 0, title: "Unemployed",
                     owner: false, hiredDay: sim.day, missed: 0, workedDay: -1, idleSince: sim.day };
  };
  /* is this NPC eligible to seek/hold a job? (adults, not Watch/doctor/owner,
     not jailed/hospitalised — those roles are fixed to their post) */
  const canSeekWork = (n) =>
    n.alive && !n.minor && !n.enforcer && !n.doctor && !n.jailedUntil && !n.bedrest &&
    !n.noWork && !n.outlaw && !n.mayor && n.id !== "odell" && !n.occupation?.owner && !n.occupation?.spot;   // fixed roles (Watch/doctor/mayor) don't job-hunt
  /* choose the best local to fill an opening: unemployed first, then whoever
     has the most relevant skill. Returns null if nobody suitable is free. */
  const pickJobSeeker = (sim, bId) => {
    const track = JOB_TRACK[bId] || "service";
    const pool = sim.npcs.filter(n => canSeekWork(n) && n.occupation?.bId !== bId);
    if (!pool.length) return null;
    // prefer the jobless; among equals, the most skilled in this trade wins
    pool.sort((a, b) => {
      const aJob = a.occupation?.bId ? 1 : 0, bJob = b.occupation?.bId ? 1 : 0;
      if (aJob !== bJob) return aJob - bJob;               // unemployed (0) sort first
      return (b.skills?.[track] || 0) - (a.skills?.[track] || 0);
    });
    return pool[0];
  };
  /* hire an NPC into a post: they leave any old employer and take the new
     occupation at the rank their skill has earned. One path for every NPC hire. */
  /* a station name that ACTUALLY EXISTS in bId's interior. Preference: the one asked
     for, the canonical service point, "staff", then anything on the floor plan.
     (Bug class this kills: a market clerk re-hired to the office carried "shop"
     into a building with no shop — undefined station, dead NPC brain.) */
  const validStation = (bId, preferred) => {
    const st = INTERIOR_DEFS[bId]?.stations || {};
    return [preferred, SHOP_STATION[bId], "staff"].find(s => s && st[s]) || Object.keys(st)[0] || null;
  };
  const hireNpc = (sim, npc, bId) => {
    npc.occupation = makeOccupation(npc, bId, { hiredDay: sim.day });
    npc.work = { bId, station: validStation(bId, npc.work?.station) };   // labour follows the post
    if (!npc.schedule) npc.schedule = bId === "post" ? [8, 17] : [9, 17];   // a hire without hours gets a standard shift
  };
  const isWorkShift = (sim, job) => {
    const hour = (sim.time / 60) % 24;
    return job && CFG.JOBS.days.includes(sim.day % 7) && hour >= job.shift[0] && hour < job.shift[1];
  };
  /* ONE pipe for every paid player task: grants trade xp (with level-up
     toasts), marks shift attendance, applies the employment bonus when this
     business is your job and you're on the clock, and routes pay — owner
     economics when an ECON key exists, plain mint otherwise. The multiplier
     scales the owner's revenue too: training is PRODUCTIVITY, so a level-5
     clerk profits Bruno more, not less. Returns coins actually paid. */
  const completeTask = (sim, track, bId, { econKey = null, basePay = 0, note = null, xp = 1 } = {}) => {
    const p = sim.player;
    const before = skillLevel(p, track);
    p.skills[track] = (p.skills[track] || 0) + xp;   // Stage 6: tier-scaled XP (default 1 for legacy callers)
    const after = skillLevel(p, track);
    sfx.success();
    if (after > before) {
      sfx.levelup();
      showToast(`📈 ${SKILL_TRACKS[track]} — now ${skillTierName(p, track)} (${ROMAN[after]})!`);
      // Stage 3.7c: Expert/Master are real achievements — the town takes note
      if (after >= CFG.SKILL.masterRenownAt) repEvent(sim, p, 4, CFG.SKILL.masterRenown, `the player became a ${SKILL_TRACKS[track]} Master`);
      else if (after >= CFG.SKILL.expertReownAt) repEvent(sim, p, 2, CFG.SKILL.expertRenown, `the player reached ${SKILL_TRACKS[track]} Expert`);
    }
    const employedHere = p.job && p.job.bId === bId && isWorkShift(sim, p.job);
    if (employedHere && p.job.workedDay !== sim.day) {
      p.job.workedDay = sim.day;                        // clocked in — a worked day clears a strike
      p.job.missed = Math.max(0, p.job.missed - 1);
    }
    // on-shift skill bonus; moonlighting elsewhere earns no bonus at all
    const mult = employedHere ? skillMult(p, track) : 1;
    // rank premium applies only when employed here — folded in per pay path below
    const rMult = employedHere ? rankMult(p) : 1;
    let paid = 0;
    // econ path: payWorker applies rank to the wage itself, so pass skill mult only
    if (econKey) { paid = Math.ceil(CFG.ECON[econKey].wage * mult * rMult); payWorker(sim, bId, p, econKey, mult); }
    // basePay path never touches payWorker — apply both bonuses here directly
    else if (basePay) { paid = Math.ceil(basePay * mult * rMult); p.coins += paid; }
    if (note) repEvent(sim, p, 0.3, 0.2, note);
    if (paid > 0) sfx.coin();
    return paid;
  };
  const payWorker = (sim, bId, worker, econKey, mult = 1) => {
    // skill (mult) scales revenue AND wage — training is productivity. Rank is a
    // seniority premium on the WAGE only: a senior clerk costs more, but doesn't
    // magically generate more revenue than an equally-skilled junior.
    const rev = Math.ceil(CFG.ECON[econKey].rev * mult);
    const wage = Math.ceil(CFG.ECON[econKey].wage * mult * rankMult(worker));
    const ownerId = OWNERS[bId];
    const owner = ownerId ? sim.npcs.find(n => n.id === ownerId) : null;
    if (!owner || !owner.alive) { worker.coins = Math.min(9999, worker.coins + (rev || wage)); return; }
    if (owner === worker) { if (rev) ringSale(sim, bId, rev); return; }   // Stage 5: through the till
    ringSale(sim, bId, rev);   // skilled staff lift the take, not just the payroll
    transferCoins(sim, owner, worker, wage);
  };
  /* shelves are finite: every sale, theft, and meal comes out of these */
  const stockOf = (sim, bId, itemId) => sim.stock[bId]?.[itemId] ?? 0;
  const addStock = (sim, bId, itemId, n) => { if (sim.stock[bId]) sim.stock[bId][itemId] = Math.min(30, stockOf(sim, bId, itemId) + n); };
  /* v7 Stage 5c: every appliance USE rolls against wear. One pipe: increments the counter,
     rolls 2% + 1%/prior-use, and flips `broken`. Broken appliances refuse service until a
     mechanic (player with part + minigame, or an NPC at dawn) puts them right. */
  const applianceKey = (bId, st) => `${bId}:${st}`;
  const applianceRec = (sim, bId, st) => (sim.appliances = sim.appliances || {})[applianceKey(bId, st)] ||= { uses: 0, broken: false };
  const applianceBroken = (sim, bId, st) => !!sim.appliances?.[applianceKey(bId, st)]?.broken;
  const useAppliance = (sim, bId, st) => {
    const rec = applianceRec(sim, bId, st);
    if (rec.broken) return false;
    rec.uses++;
    if (Math.random() < CFG.REPAIR.baseChance + CFG.REPAIR.perUse * (rec.uses - 1)) {
      rec.broken = true;
      sim.dayLog.push(`the ${st} at ${bld(bId)?.name || bId} broke down`);
      if (townOfScene(worldRef.current, sim.player.scene) === bld(bId)?.town) { sfx.alert(); showToast(`🔧 The ${st === "wash" ? "bathroom" : st === "drinks" ? "drink machine" : "oven"} at ${bld(bId).name} just BROKE.`); }
      return false;   // this use fails — it died mid-job
    }
    return true;
  };
  const takeStock = (sim, bId, itemId, n = 1) => {
    if (stockOf(sim, bId, itemId) < n) return false;
    sim.stock[bId][itemId] -= n; return true;
  };
  /* wanted stars only ever escalate; convictions carry a fame cost */
  const convictStars = (sim, ent, stars, reason) => {
    if (sim.crime) sim.crime.starsGiven = (sim.crime.starsGiven || 0) + 1;   // crime ledger
    // RECIDIVISM: a repeat offense at or below your current level ESCALATES it one star —
    // career criminals climb the ladder (1★ shoplifter → 2★ warrant → the chase begins)
    if (stars <= ent.wanted && ent.wanted < 5) ent.wanted++;
    else ent.wanted = Math.max(ent.wanted, stars);
    repEvent(sim, ent, -stars * 2, stars, reason);
  };
  /* Stage 3.9: record who convicted whom, of what, and whether they were ACTUALLY
     guilty — so a later capture of the true killer can overturn a wrongful one. */
  const recordConviction = (sim, kase, detectiveId, convictId, actuallyGuilty) => {
    kase.convictedId = convictId;
    kase.detectiveId = detectiveId;
    kase.wrongful = !actuallyGuilty;
    if (convictId !== "player") { const c = sim.npcs.find(n => n.id === convictId); if (c) c.jailedOnDay = sim.day; }
    else sim.player.jailedOnDay = sim.day;
    // Stage 3.9: catching the TRUE killer overturns any earlier WRONGFUL conviction on the same victim
    if (actuallyGuilty) {
      for (const other of sim.cases) {
        if (other !== kase && other.victim === kase.victim && other.wrongful && !other.overturned)
          overturnWrongful(sim, worldRef.current, other);
      }
    }
  };
  /* Stage 3.9: the true killer was caught — overturn any WRONGFUL conviction on this
     crime. Free the innocent, compensate them from the detective's pocket (10c + 4c/
     night jailed), and FIRE the detective if the innocent died inside or served a week+. */
  const overturnWrongful = (sim, world, kase) => {
    if (!kase.wrongful || !kase.convictedId || kase.overturned) return;
    kase.overturned = true;
    const innocent = kase.convictedId === "player" ? sim.player : sim.npcs.find(n => n.id === kase.convictedId);
    const detective = sim.npcs.find(n => n.id === kase.detectiveId);
    const nights = Math.max(0, sim.day - (innocent?.jailedOnDay ?? sim.day));
    const diedInside = innocent && !innocent.alive && innocent.jailedUntil;
    // free them if still held
    if (innocent && innocent.alive && innocent.jailedUntil) {
      innocent.jailedUntil = null; innocent.wanted = 0;
      const home = innocent.home ? bld(innocent.home) : null;
      innocent.scene = home ? `t:${bld(innocent.home).town}` : "t:stonecross";
      innocent.x = home ? home.door.x : bld("hq").door.x; innocent.y = home ? home.door.y : bld("hq").door.y;
      innocent.legs = []; innocent.path = []; innocent.goal = null; innocent.activity = "freed — wrongly convicted";
      if (innocent === sim.player) setJailScreen(null);
    }
    // compensation from the detective
    const comp = CFG.SKILLCHECK.wrongfulBase + CFG.SKILLCHECK.wrongfulPerNight * nights;
    if (detective) {
      detective.coins -= comp;                            // can go into debt — false convictions HURT
      if (innocent && innocent.alive) innocent.coins += comp;
      repEvent(sim, detective, -12, 0, `${detective.name} wrongly convicted ${innocent === sim.player ? "the player" : innocent?.name || "an innocent"}`);
      // FIRED if the innocent died inside, or served a week or more
      if ((diedInside || nights >= CFG.SKILLCHECK.wrongfulFireDays) && detective.job) {
        const boss = OWNERS[detective.job.bId] ? sim.npcs.find(n => n.id === OWNERS[detective.job.bId]) : null;
        detective.job = null; detective.occupation = null;
        repEvent(sim, detective, -20, 0, `${detective.name} was DISMISSED from the Watch for a fatal wrongful conviction`);
        sim.buzz = { text: `${detective.name} dismissed from the Watch — an innocent ${diedInside ? "died" : "rotted"} in the cells.`, day: sim.day };
      }
    }
    sim.dayLog.push(`${innocent === sim.player ? "The player" : innocent?.name || "An innocent"} was cleared of the ${kase.victim} murder${comp ? ` and paid ${comp}c` : ""}`);
    sim.buzz = sim.buzz || { text: `Wrongful conviction overturned in the ${kase.victim} case.`, day: sim.day };
  };
  const openCase = (sim, type, data) => {
    { const ct = townOfScene(worldRef.current, data?.scene || "t:alderbrook"); if (sim.approval?.[ct] != null) sim.approval[ct] = clamp(sim.approval[ct] - CFG.APPROVAL.crimeHit, 0, 100); }   // Stage 8
    sim.cases.push({ id: `c${sim.day}_${sim.cases.length}`, type, day: sim.day, state: "open", evidence: 0, interrogated: {}, ...data });
  };
  /* conviction weight BY CRIME — a cracked till is not a murder (it used to sentence 5★ life for everything) */
  const caseStars = (kase) => kase.type === "murder" || kase.type === "vigilante" ? 5
    : ["burglary", "register_robbery", "safe_robbery"].includes(kase.type) ? 3
    : kase.type === "trespassing" ? 1 : 2;
  /* gift grading — per Blaine: ~100-200 should be shocking, not mythic */
  const gradeGift = (value) => {
    if (value >= 1000) return { fame: 40, renown: 40, legend: true };            // the stuff of songs
    if (value >= 100)  return { fame: 18, renown: 15, buzz: true, townMem: true };// shocking — the town talks & remembers
    if (value >= 50)   return { fame: 8,  renown: 6,  buzz: true };
    if (value >= 10)   return { fame: 3,  renown: 2 };
    return { fame: 0.5, renown: 0.2 };
  };

  const receiveGift = (sim, from, to, { coins = 0, itemId = null }) => {
    let value = 0, what = "";
    if (coins > 0) { const n = transferCoins(sim, from, to, coins); if (!n) return false; value = n; what = `${n} coins`; }
    else if (itemId) { if (!giveItem(from, to, itemId)) return false; value = ITEMS[itemId].price; what = ITEMS[itemId].name; }
    else return false;

    const fromName = from.id ? from.name : "the player";
    const toName = to.id ? to.name : "the player";
    const g = gradeGift(value);
    const grubby = from.hygiene < CFG.HYGIENE.social;   // hard to warm up to someone who reeks

    if (to.id) {
      to.bubble = { text: value >= 100 ? `...I— ${what}?! Are you SERIOUS?!` : value >= 10 ? `${what}! You shouldn't have!` : `Oh! Thanks for the ${what}.`, until: performance.now() / 1000 + 5 };
      const steps = grubby ? 0 : value >= 20 ? 2 : value >= 3 ? 1 : 0;
      const relKey = from.id || "player";
      const cur = REL_ORDER.indexOf(to.relationships[relKey] || "neutral");
      if (steps) to.relationships[relKey] = REL_ORDER[clamp(cur + steps, 0, REL_ORDER.length - 1)];
      if (value >= 10) to.memories = [...to.memories, `${fromName} gave me ${what}`].slice(-CFG.MAX_MEMORIES);
    } else showToast(`${fromName} gives you ${what}!`);

    repEvent(sim, from, g.fame, g.renown, `${fromName} gave ${toName} ${what}`);
    const town = to.id ? to.town : townOfScene(worldRef.current, sim.player.scene);
    if (g.legend || g.townMem) {                        // shocking & mythic tiers echo through town
      sim.buzz = { text: g.legend ? `Did you HEAR?! ${fromName} gave ${toName} ${what}!!` : `${fromName} gave ${toName} ${what}. Can you believe it?`, day: sim.day };
      for (const n of sim.npcs.filter(n => n.alive && n.town === town))
        n.memories = [...n.memories, `${fromName} gave ${toName} ${what}${g.legend ? " — unbelievable" : ""}`].slice(-CFG.MAX_MEMORIES);
      sim.dayLog = [...sim.dayLog, `${g.legend ? "LEGENDARY: " : "SHOCKING: "}${fromName} gave ${toName} ${what}`].slice(-12);
    } else if (g.buzz) sim.buzz = { text: `${fromName} gave ${toName} ${what} — generous!`, day: sim.day };
    return true;
  };

  // record a sale against a shop's recent-demand counter (drives mid-day restock)
  const trackDemand = (sim, bId, itemId, n = 1) => {
    if (!sim.demand[bId]) sim.demand[bId] = {};
    sim.demand[bId][itemId] = (sim.demand[bId][itemId] || 0) + n;
  };
  /* --- Stage 2.1 self-care helpers --- */
  // how many edible items an NPC is currently carrying (any item with an eat.hunger)
  const carriedFood = (npc) =>
    Object.keys(npc.inv).reduce((s, id) => s + (ITEMS[id]?.eat?.hunger && npc.inv[id] > 0 ? npc.inv[id] : 0), 0);
  const carriedDrink = (npc) =>   // Stage 3.7b: anything that restores thirst counts toward the pocket buffer
    Object.keys(npc.inv).reduce((s, id) => s + (ITEMS[id]?.eat?.thirst && npc.inv[id] > 0 ? npc.inv[id] : 0), 0);
  // Stage 3.7b: bad-sickness DoT per tick, graduated by current HP — hits hardest while you're
  // strong and eases as you weaken. Illness alone CAN still kill, just slowly enough to seek help.
  const sickDmg = (hp) => hp > CFG.STARVE.sickTierHi ? CFG.STARVE.sickDmgHi
                        : hp > CFG.STARVE.sickTierMid ? CFG.STARVE.sickDmgMid : CFG.STARVE.sickDmgLo;
  const carriedMed = (npc) =>
    Object.keys(npc.inv).reduce((s, id) => s + (ITEMS[id]?.cat === "med" && npc.inv[id] > 0 ? npc.inv[id] : 0), 0);
  // does this NPC want a stocking trip? (low pantry, off cooldown, solvent, off shift)
  const wantsToStock = (npc, sim, now, inShift) => {
    if (inShift || npc.minor) return false;                    // never skips work; kids don't provision
    if (npc.coins < CFG.SELFCARE.shopCoinFloor) return false;  // can't afford to stock up
    if (now - (npc.lastStockRun ?? -9999) < CFG.SELFCARE.shopCooldownH * 60 / CFG.MINUTES_PER_SEC) return false;
    return carriedFood(npc) <= CFG.SELFCARE.shopWhenBelow || carriedDrink(npc) <= CFG.SELFCARE.shopWhenBelow || carriedMed(npc) < CFG.SELFCARE.pantryMedTarget;
  };
  /* build this NPC's shopping list for a given town: essentials first (food to
     target, one medicine), then up to likesBuffer of their personal "likes" that
     are actually buyable somewhere in town. Returns [{item, bId}] in priority order. */
  const buildShoppingList = (npc, town) => {
    const list = [];
    const wantFood = Math.max(0, CFG.SELFCARE.pantryFoodTarget - carriedFood(npc));
    const wantMed = Math.max(0, CFG.SELFCARE.pantryMedTarget - carriedMed(npc));
    // cheapest available food items in this town, one entry per unit wanted
    if (wantFood > 0) {
      const foods = Object.keys(ITEMS)
        .filter(id => ITEMS[id].eat?.hunger && ITEMS[id].cat === "food" && findShop(id, town))
        .sort((a, b) => ITEMS[a].price - ITEMS[b].price);
      for (let i = 0; i < wantFood && foods.length; i++) list.push({ item: foods[i % foods.length], bId: findShop(foods[i % foods.length], town) });
    }
    // Stage 3.7b: stock DRINKS too — a carried water/milk/tea means thirst never forces a desperate run
    const wantDrink = Math.max(0, CFG.SELFCARE.pantryDrinkTarget - carriedDrink(npc));
    if (wantDrink > 0) {
      const drinks = Object.keys(ITEMS)
        .filter(id => ITEMS[id].eat?.thirst && (ITEMS[id].cat === "drink" || ITEMS[id].eat?.hunger) && findShop(id, town))
        .sort((a, b) => ITEMS[a].price - ITEMS[b].price);
      for (let i = 0; i < wantDrink && drinks.length; i++) list.push({ item: drinks[i % drinks.length], bId: findShop(drinks[i % drinks.length], town) });
    }
    if (wantMed > 0) { const s = findShop("medicine", town); if (s) list.push({ item: "medicine", bId: s }); }
    // a little character: grab buyable "likes" (skip non-item likes like "the fountain")
    let likesGot = 0;
    for (const like of (npc.likes || [])) {
      if (likesGot >= CFG.SELFCARE.likesBuffer) break;
      const id = Object.keys(ITEMS).find(k => ITEMS[k].name.toLowerCase() === String(like).toLowerCase());
      const shop = id && findShop(id, town);
      if (shop && !(npc.inv[id] > 0)) { list.push({ item: id, bId: shop }); likesGot++; }
    }
    return list;
  };
  const npcPurchase = (sim, npc, bId, itemId) => {
    const price = priceOf(sim, bId, itemId);                               // Stage 3.7: owner-set price
    if (npc.coins < price || !takeStock(sim, bId, itemId)) return false;   // empty shelf = no sale
    trackDemand(sim, bId, itemId);                                          // this item is moving — remember it
    const ownerId = OWNERS[bId];
    const owner = ownerId ? sim.npcs.find(n => n.id === ownerId && n.alive) : null;
    if (owner && owner.id !== npc.id) transferCoins(sim, npc, owner, price);   // revenue to the OWNER, staffed or not
    else npc.coins -= price;
    npc.inv[itemId] = (npc.inv[itemId] || 0) + 1;
    return true;
  };

  /* =====================================================================
     HEALTH / HOSPITAL / DEATH
     ===================================================================== */
  const damage = (ent, amount) => { ent.health = clamp(ent.health - amount, 0, 100); return ent.health <= 0; };

  /* incapacitation: lie where you fell; rescue clock starts (loop scans) */
  const incapacitate = (sim, ent) => {
    if (ent.incap || ent.dying) return;
    ent.incap = { since: sim.time + sim.day * 1440, scene: ent.scene, x: ent.x, y: ent.y };
    if (ent.id) { ent.legs = []; ent.path = []; ent.goal = null; ent.activity = "incapacitated"; }
    sim.dayLog = [...sim.dayLog, `${ent.id ? ent.name : "the player"} was found badly hurt`].slice(-12);
  };
  /* lethal force doesn't stop at incapacitation: the DYING clock is short,
     and if it runs out, whoever held the knife committed murder */
  const setDying = (sim, ent, byId) => {
    if (ent.dying) return;
    ent.incap = null;
    ent.dying = { since: sim.time + sim.day * 1440, byId: byId ?? null };
    if (ent.id) { ent.legs = []; ent.path = []; ent.goal = null; ent.activity = "bleeding out"; }
    // Stage 6: collapse-from-exhaustion (no assailant) becomes traveling gossip
    if (!byId) {
      const who = ent.id ? ent.name : "the player";
      const witnesses = sim.npcs.filter(n => n.alive && n.id !== ent.id && n.scene === ent.scene && !n.incap && !n.dying);
      seedGossip(sim, witnesses, { text: `${who} worked themselves unconscious`, subjectId: null, bad: false });
    }
  };
  /* Stage 3.5: tiny world FX — a crime pulse (red), an arrest flash (gold). Transient, unsaved. */
  const pushFx = (sim, scene, x, y, kind) => {
    (sim.fx = sim.fx || []).push({ scene, x, y, kind, born: performance.now() });
    if (sim.fx.length > 24) sim.fx.shift();
  };

  /* carried to Mercy: wake in a ward bed, billed on the way in */
  /* Stage 2.3: find a free holding cell — local lockup first, then overflow toward
     the main lockup. Returns {bId, spot} or null if every cell everywhere is full.
     A lifer with nowhere to go bumps a short-timer (murder outranks a fine). */
  const occupiedCells = (sim, bId) => sim.npcs.filter(n => n.jailedUntil && n.scene === `i:${bId}`).length;
  const assignCell = (sim, world, convictTown, isLifer) => {
    const order = [TOWN_LOCKUP[convictTown], ...LOCKUP_ORDER.filter(b => b !== TOWN_LOCKUP[convictTown])];
    for (const bId of order) {
      const cells = world.interiors[bId]?.cellSpots || [];
      if (occupiedCells(sim, bId) < cells.length) return { bId, spot: cells[occupiedCells(sim, bId)] };
    }
    if (isLifer) {   // no room: a lifer bumps the nearest short-timer to time-served
      for (const bId of order) {
        const shortTimer = sim.npcs.find(n => n.jailedUntil && n.jailedUntil !== Infinity && n.scene === `i:${bId}`);
        if (shortTimer) {
          shortTimer.jailedUntil = null; shortTimer.goal = null;
          return { bId, spot: (world.interiors[bId].cellSpots)[0] };
        }
      }
    }
    return null;   // only if lifers fill every cell — caller falls back to time-skip
  };
  const hospitalize = (sim, world, ent) => {
    const bedIdx = sim.npcs.filter(n => n.bedrest).length % world.interiors.hospital.bedSpots.length;
    const bed = world.interiors.hospital.bedSpots[bedIdx];
    ent.incap = null; ent.bedrest = true;
    ent.scene = "i:hospital"; ent.x = bed.x; ent.y = bed.y;
    ent.health = Math.max(ent.health, 12);
    ent.hunger = Math.max(ent.hunger, CFG.HOSPITAL.admitNeedFloor);   // Stage 3.6: they FEED you — a collapse from
    ent.thirst = Math.max(ent.thirst, CFG.HOSPITAL.admitNeedFloor);   // hunger/thirst can't loop-die in the bed anymore
    ent.thirstAcc = 0; ent.hungerAcc = 0;                             // and the DoT grace resets on intake
    const clinic6 = simRef.current?.townUpgrades?.[bld("hospital").town]?.clinic ? 0.75 : 1;   // Stage 6: Clinic Fund
    const bill = Math.ceil(CFG.HOSPITAL.incapBill * diff().billMult * clinic6);
    { const doc = sim.npcs.find(n => n.id === FACILITY_DOCTOR.hospital && n.alive);   // Pass 4: hard doctoring teaches hard
      if (doc) doc.skills.healthcare = (doc.skills.healthcare || 0) + taskXp("healthcare", 2); }
    if (ent.id) { ent.coins = Math.max(0, ent.coins - bill); ent.legs = []; ent.path = []; ent.goal = null; ent.activity = "recovering at the hospital"; ent.hidden = false; }
    else { sim.player.hospitalBill = bill; showToast(`You wake at Mercy Hospital. Bill: ${bill}c on discharge.`); }
    // Stage 6: condition gossip — someone collapsed and ended up in Mercy Hospital
    const who = ent.id ? ent.name : "the player";
    const witnesses = sim.npcs.filter(n => n.alive && n.id !== ent.id && n.scene === "i:hospital");
    seedGossip(sim, [...witnesses, ...(ent.id ? [ent] : [])], { text: `${who} collapsed and ended up in the hospital`, subjectId: null, bad: false });
  };

  /* Stage 2.2: finish a successful rescue of a DYING victim — hospitalize, pull
     them back from the edge, and if it was an attack, log the survived attempt as
     a 4★ and dispatch the Watch. Shared by the instant path and the skilled check. */
  const completeRescue = (sim, world, ent, byId) => {
    ent.dying = null;
    hospitalize(sim, world, ent);
    ent.health = 5;                                       // barely
    if (ent.id && (ent.wanted || 0) >= 5) {               // patched up enough — and sent straight down for life
      const cTown = townOfScene(world, ent.scene) || "stonecross";
      const cell = assignCell(sim, world, cTown, true);
      if (cell) {
        ent.bedrest = false; ent.incap = null;
        ent.jailedUntil = Infinity; ent.scene = `i:${cell.bId}`; ent.x = cell.spot.x; ent.y = cell.spot.y;
        ent.legs = []; ent.path = []; ent.goal = null; ent.activity = "serving a life sentence";
        sim.dayLog.push(`${ent.name} was patched up at the hospital and sent straight to the cells — for life`);
        seedGossip(sim, sim.npcs.filter(o => o.alive && o.town === cTown).slice(0, 5), { text: `${ent.name} got life — stitched up and sent down the same day`, subjectId: ent.id, bad: true });
      }
    }
    if (byId) {                                           // victim SURVIVED an attack → attempted murder
      const attacker = byId === "player" ? sim.player : sim.npcs.find(n => n.id === byId);
      if (attacker) {
        convictStars(sim, attacker, 4, `${byId === "player" ? "the player" : attacker.name} nearly killed ${ent.id ? ent.name : "the player"}`);
        const e = sim.npcs.find(n => n.alive && n.enforcer && !n.dispatch);
        if (e) e.dispatch = { targetId: byId };
      }
    }
  };
  /* Stage 2.2: a skilled (non-doctor) bystander attempts at-scene stabilization
     of a dying victim via a HARD async skill check. Pass → stabilized (completeRescue).
     Fail → nothing this attempt; the dying clock keeps ticking and they may retry
     after cooldown. Mutex + both-brakes bound the API cost. */
  const rescueStabilize = (sim, world, ent, finder, absMin) => {
    const taskKey = `rescue_${ent.id || "player"}`;
    if (finder.rescuing || apiBusyRef.current || !canAttempt(finder, taskKey, absMin)) return;
    finder.rescuing = true; apiBusyRef.current = true;
    const diffVal = checkDifficulty(finder, "service", false) + 10;   // stabilizing a dying person is extra-hard
    const byId = ent.dying?.byId;
    finder.bubble = { text: `*works to stabilize ${ent.name}*`, until: (sim.time + sim.day * 1440) };
    skillCheck(finder.name, `stabilize a critically wounded, dying person at the scene before they bleed out`,
      `first-aid ability from service skill level ${skillLevel(finder, "service")}, not a trained doctor`, Math.min(100, diffVal))
      .then(pass => {
        if (!ent.dying) return;                           // someone/something already resolved it
        if (pass) {
          clearCheck(finder, taskKey);
          completeRescue(sim, world, ent, byId);
          finder.bubble = { text: `*stabilizes ${ent.name}* — stay with me!`, until: (sim.time + sim.day * 1440) + 4 };
          sim.dayLog = [...sim.dayLog, `${finder.name} stabilized ${ent.name} at the scene`].slice(-12);
        } else {
          recordFail(finder, taskKey, absMin);            // clock keeps ticking; retry after cooldown
          finder.bubble = { text: rand(["*hands shaking* — come ON—", "I'm losing them, someone get the doctor!"]), until: (sim.time + sim.day * 1440) + 4 };
        }
      })
      .catch(() => { recordFail(finder, taskKey, absMin); })
      .finally(() => { finder.rescuing = false; apiBusyRef.current = false; });
  };

  /* the graveyard stops being empty. Murders die QUIETLY — the body lies
     where it fell, and the town only mourns once someone finds it. */
  const killEntity = (sim, ent, cause, killerId = null) => {
    if (ent.id) {
      const hadWitness = [sim.player, ...sim.npcs].some(o => o !== ent && (o.id ? o.alive && !o.incap && !o.dying && !o.hidden : true) && o.scene === ent.scene);
      ent.alive = false; ent.incap = null; ent.dying = null; ent.hidden = true;
      sim.bodies.push({ name: ent.name, npcId: ent.id, scene: ent.scene, x: ent.x, y: ent.y, day: sim.day, cause, killerId, discovered: false,
        victimStars: ent.wanted || 0 });   // the DIRTY VIGILANTE test: what the victim was wanted for, at the moment they died
      { // Stage 8: a death shakes the town — but a five-star outlaw's death barely dents it (relief cuts the grief)
        const dt8 = townOfScene(worldRef.current, ent.scene);
        const hit = (ent.wanted || 0) >= 5 ? 1 : CFG.APPROVAL.deathHit;
        if (sim.approval?.[dt8] != null) sim.approval[dt8] = clamp(sim.approval[dt8] - hit, 0, 100);
      }
      if (hadWitness || !killerId) discoverBody(sim, sim.bodies[sim.bodies.length - 1], null);   // seen or natural: known immediately
    } else {
      /* player death — difficulty decides how much it means */
      const d = diff();
      if (!d.deathEnabled) { hospitalize(sim, worldRef.current, ent); return; }   // easy: always saved
      if (d.revive) {                                    // normal: flatline, revived at cost
        ent.coins = Math.floor(ent.coins / 2);
        repEvent(sim, ent, -8, 3, "the player nearly died");
        hospitalize(sim, worldRef.current, ent);
        ent.hospitalBill = Math.ceil(CFG.HOSPITAL.reviveBill * d.billMult);
        showToast("You flatlined. Dr. Amara pulled you back. It cost you.");
      } else {                                           // hardcore: the grave is yours
        sim.graves.push({ name: "You", day: sim.day, cause, town: townOfScene(worldRef.current, ent.scene) });
        setDeathScreen({ day: sim.day, cause });
        wipeSave();
      }
    }
  };

  /* a body is found: the town mourns, the grave fills, and if there's a
     killer, a murder case opens — solved on the spot if witnesses saw it */
  const discoverBody = (sim, body, finder) => {
    if (body.discovered) return;
    body.discovered = true;
    sim.graves.push({ name: body.name, day: sim.day, cause: body.cause, town: townOfScene(worldRef.current, body.scene) });   // buried where they fell
    sim.buzz = { text: `${body.name}... is gone. ${body.cause}.`, day: sim.day };
    sim.dayLog = [...sim.dayLog, `${body.name}'s body was found (${body.cause})`].slice(-12);
    const town = townOfScene(worldRef.current, body.scene);
    const wasWanted = (body.victimStars || 0) >= 5;
    for (const n of sim.npcs.filter(n => n.alive && n.town === town)) {
      // a dead outlaw isn't mourned the same way — the town is relieved, and unsettled
      n.memories = [...n.memories, wasWanted ? `${body.name} the outlaw is dead. Someone took the law into their hands.` : `We lost ${body.name}. ${body.cause}`].slice(-CFG.MAX_MEMORIES);
      seedGossip(sim, [n], { text: wasWanted ? `${body.name} the outlaw was put down — not arrested, PUT DOWN` : `${body.name} died — ${body.cause}`, subjectId: null, bad: false });
    }
    if (body.killerId) {
      const killer = body.killerId === "player" ? sim.player : sim.npcs.find(n => n.id === body.killerId);
      /* Stage 2.3: WITNESSED or STRONG EVIDENCE both convict at 5★ immediately.
         Strong evidence = the killer is still at the scene carrying a lethal weapon
         (blood on their hands, weapon in hand — no trial needed). Otherwise the
         case opens for real investigation. */
      const witnessed = finder === "witnessed";
      const atScene = killer && killer.scene === body.scene;
      const armed = killer && bestWeapon(killer) && ITEMS[bestWeapon(killer)]?.lethal;
      const strongEvidence = atScene && armed;
      const openAndShut = witnessed || strongEvidence;
      /* DIRTY VIGILANTE: the victim was a five-star outlaw. The town wanted them caught, not
         executed — and you had the choice to carry them in. It's a lesser charge (4★, no life
         sentence) but it IS a charge, and the town's opinion splits: rid of a menace, afraid
         of you. The dilemma is the point. */
      const vigilante = (body.victimStars || 0) >= 5;
      openCase(sim, vigilante ? "vigilante" : "murder", { victim: body.name, scene: body.scene, x: body.x, y: body.y,
        killerId: body.killerId, suspectId: openAndShut ? body.killerId : null, state: openAndShut ? "solved" : "open",
        evidence: strongEvidence ? 3 : 0 });               // caught red-handed = max evidence on the record
      if (openAndShut && killer) {
        const who = body.killerId === "player" ? "the player" : killer.name;
        if (vigilante) {
          convictStars(sim, killer, 4, `${who} left ${body.name}, a five-star outlaw, to die instead of hauling them in`);
          repEvent(sim, killer, 4, 6, `${who} put down ${body.name} the hard way`);   // infamy AND standing: feared, not respected
          if (body.killerId === "player") showToast("🩸 Dirty Vigilante. The town is safer. The town is also afraid of you.");
        } else {
          const why = witnessed ? "was seen committing" : "was caught, weapon in hand, at the scene of";
          convictStars(sim, killer, 5, `${who} ${why} the murder of ${body.name}`);
        }
        const hunter = sim.npcs.find(n => n.alive && n.enforcer && !n.dispatch);
        if (hunter) hunter.dispatch = { targetId: body.killerId };   // the pursuit starts NOW
      }
    }
    const e = sim.npcs.find(n => n.alive && n.enforcer && !n.dispatch);
    if (e) e.dispatch = { bodyScene: body.scene, bodyX: body.x, bodyY: body.y, bodyNpc: body.npcId, targetId: null };
  };

  /* =====================================================================
     CRIME — theft, witnesses, citizen arrest, fines, wanted, jail
     ===================================================================== */
  /* incident-call budget: shared by crime + robbery reactions */
  const incidentBudget = (sim) => {
    if (sim.incidents.day !== sim.day) sim.incidents = { day: sim.day, count: 0 };
    return sim.incidents.count < sim.settings.incidents;   // 99 sentinel = fire whenever the town gets rowdy
  };

  /* local fallback when the budget is spent or the call fails */
  const localWitnessChoice = (npc, thief) => {
    if (npc.enforcer) return "arrest";
    if (npc.minor) return "flee";
    const feeling = npc.relationships[thief.id || "player"] || "neutral";
    if (feeling === "hates" || feeling === "dislikes") return Math.random() < 0.7 ? "arrest" : "ignore";
    if (feeling === "friend" || feeling === "likes") return Math.random() < 0.15 ? "arrest" : "ignore";
    return Math.random() < 0.3 ? "arrest" : "ignore";
  };

  const applyWitnessChoice = (sim, npc, thief, choice, now) => {
    if (choice === "arrest") {
      npc.report = { thiefId: thief.id || "player" };    // brain: leave the building, then report
      npc.bubble = { text: rand(["Hey! I SAW that!", "Put it back. Now.", "The Watch will hear about this."]), until: now + 4 };
      /* a cornered thief may turn on their accuser — armed & desperate only */
      if (thief.id && bestWeapon(thief) && Math.random() < 0.35) resolveFightNPC(sim, thief, npc, now);
    } else if (choice === "flee") {
      npc.bubble = { text: "*hurries out*", until: now + 3 };
      npc.goal = null;                                   // re-decide → they'll wander off
    }
  };

  /* one steal attempt, player or NPC. Keeper COMPLETELY absent = it works;
     keeper anywhere in the building = automatic fine. Witnesses then choose. */
  const stealAttempt = (sim, world, thief, bId, itemId, now) => {
    const isPlayer = !thief.id;
    const keeper = keeperOf(sim, bId);
    const keeperPresent = keeper && keeper.scene === `i:${bId}` && !keeper.activity.includes("sleep");
    const price = ITEMS[itemId].price;

    if (keeperPresent) {                                 // caught red-handed
      const fine = Math.max(5, price * CFG.WANTED.stealFineMult);
      if (thief.coins >= fine) { thief.coins -= fine; }
      else { thief.coins = 0; thief.wanted += 1; }       // can't pay → it goes on the record
      keeper.memories = [...keeper.memories, `${isPlayer ? "The player" : thief.name} tried to steal from me`].slice(-CFG.MAX_MEMORIES);
      seedGossip(sim, [keeper], { text: `${isPlayer ? "the player" : thief.name} tried to steal from ${keeper.name}`, subjectId: isPlayer ? "player" : thief.id, bad: true });
      keeper.relationships[thief.id || "player"] = "dislikes";
      keeper.bubble = { text: `HEY! That's a ${fine}c fine, sticky fingers!`, until: now + 5 };
      repEvent(sim, thief, -4, 2, `${isPlayer ? "the player" : thief.name} got caught stealing at ${bld(bId).name}`);
      if (isPlayer) showToast(`Caught! ${keeper.name} fines you ${fine} coins.`);
      return false;
    }

    if (!takeStock(sim, bId, itemId)) { if (isPlayer) showToast("The shelf is bare — nothing to take."); return false; }
    thief.inv[itemId] = (thief.inv[itemId] || 0) + 1;    // it works... if nobody talks
    pushFx(sim, `i:${bId}`, thief.x, thief.y, "crime");   // Stage 3.5: the moment, marked
    if (isPlayer) showToast(`You pocket the ${ITEMS[itemId].name}. Heart pounding.`);

    const witnesses = sim.npcs.filter(n => n.alive && n !== thief && n.scene === `i:${bId}` && !n.activity.includes("sleep"));
    const playerSaw = !isPlayer && sim.player.scene === `i:${bId}`;
    if (playerSaw) { sim.crimeAlert = { thiefId: thief.id, bId, until: now + 20 }; sfx.alert(); }  // your call: 🚨 or look away

    if (witnesses.length) {
      const byId = Object.fromEntries(sim.npcs.map(n => [n.id, n]));
      const ctx = `${isPlayer ? "the player" : thief.name} stole ${ITEMS[itemId].name} from ${bld(bId).name} while the keeper was out`;
      if (incidentBudget(sim) && !apiBusyRef.current) {
        sim.incidents.count++;
        apiBusyRef.current = true;
        incidentCall("crime", witnesses, ctx, byId).then(out => {
          for (const w of witnesses) applyWitnessChoice(sim, w, thief, out.choices?.[w.id] || localWitnessChoice(w, thief), now);
        }).catch(() => {
          for (const w of witnesses) applyWitnessChoice(sim, w, thief, localWitnessChoice(w, thief), now);
        }).finally(() => { apiBusyRef.current = false; });
      } else for (const w of witnesses) applyWitnessChoice(sim, w, thief, localWitnessChoice(w, thief), now);
    }
    return true;
  };

  /* a committed report lands once the witness steps outside the building.
     Theft reports stack: enough of a record escalates 1★ → 2★ (imprisonable). */
  const fileReport = (sim, reporter, thiefId, crime = "theft", victimName = "a shopkeeper") => {
    const thief = thiefId === "player" ? sim.player : sim.npcs.find(n => n.id === thiefId);
    if (!thief) return;
    // Stage 3.5: a report OPENS a case — no stars yet. Conviction lands when the
    // Watch physically reaches the suspect with the case in hand (dispatch contact).
    const kase = { id: `c${sim.day}_${sim.cases.length}`, type: crime, day: sim.day, state: "open",
                   evidence: 1, interrogated: {}, suspectId: thiefId, victim: victimName };
    sim.cases.push(kase);
    const rName = reporter.id ? reporter.name : "the player";
    sim.dayLog = [...sim.dayLog, `${rName} reported ${thiefId === "player" ? "the player" : thief.name} for ${crime}`].slice(-12);
    if (!reporter.id) { repEvent(sim, reporter, 2, 1); showToast("Report filed. The Watch will pay them a visit."); }
    const enforcer = sim.npcs.find(n => n.alive && n.enforcer && !n.dispatch && !n.activity.includes("sleep"));
    if (enforcer) enforcer.dispatch = { targetId: thiefId, caseId: kase.id };   // questioning — not yet a warrant
  };

  /* enforcer contact, by the ladder: 1★ fine/warning · 2★+ the cells,
     hours by tier · 3★/4★ add fines that go into DEBT · 5★ is LIFE —
     assets seized, and for the player, difficulty decides what's left */
  const resolveEnforcement = (sim, world, enforcer, target, now) => {
    const isPlayer = !target.id;
    pushFx(sim, target.scene, target.x, target.y, "arrest");   // Stage 3.5: justice, visibly served
    const stars = Math.min(5, target.wanted);
    if (stars <= 1) {
      const fine = CFG.WANTED.finePerLevel;
      fineCoins(target, fine); target.wanted = 0;
      enforcer.bubble = { text: `${fine} coins. Consider it a warning.`, until: now + 4 };
      if (isPlayer) showToast(`${enforcer.name} fines you ${fine} coins. Slate's clean — for now.`);
    } else if (stars >= 5) {                             // life. all of it. now an actual sentence.
      target.coins = 0;
      repEvent(sim, target, -20, 10, `${isPlayer ? "the player" : target.name} was convicted of murder`);
      const convictTown = townOfScene(world, target.scene) || "stonecross";
      const cell = assignCell(sim, world, convictTown, true);   // lifers always get a cell (may bump a short-timer)
      if (isPlayer) {
        target.fame = Math.min(target.fame, CFG.PRISON.lifeTriggerFameFloor);
        target.wanted = 0;
        if (cell) {
          // real imprisonment on EVERY difficulty — the prison break is the only way out
          target.jailedUntil = Infinity; target.scene = `i:${cell.bId}`; target.x = cell.spot.x; target.y = cell.spot.y;
          target.legs = []; target.path = []; target.goal = null; target.activity = "serving a life sentence";
          setJailScreen({ bId: cell.bId, day: sim.day });      // opens the cell UI (break-out attempts live here)
          showToast("Convicted of murder. Life in the cells. There is one way out — and it isn't the door.");
        } else {                                               // every cell in every town full: fallback dark-skip
          sim.time += 96 * 60; while (sim.time >= 1440) { sim.time -= 1440; sim.day++; }
          const hqDoor = bld("hq").door; target.scene = "t:stonecross"; target.x = hqDoor.x; target.y = hqDoor.y;
          showToast("Every cell full. Held, then turned loose to make room. Don't come back.");
        }
      } else if (cell) {
        target.scene = `i:${cell.bId}`; target.x = cell.spot.x; target.y = cell.spot.y;
        target.jailedUntil = Infinity;                    // NPC lifer: the cell keeps them
        target.jailedOnDay = sim.day;                     // Stage 3.9: for wrongful-conviction nights-served math
        target.legs = []; target.path = []; target.goal = null; target.activity = "serving life";
        target.wanted = 0;
      }
    } else {                                              // 2★-4★: time, and past 2★, debt
      const hours = CFG.WANTED.jailHours[stars];
      const debt = CFG.WANTED.debtFine[stars] || 0;
      if (debt) fineCoins(target, debt);
      target.wanted = 0;
      repEvent(sim, target, -5, 3, `${isPlayer ? "the player" : target.name} was arrested (${stars}★)`);
      if (isPlayer) {
        // Stage 3.5: you don't skip the sentence — you SIT it, in a real cell, in real time
        const convictTown = townOfScene(world, target.scene) || "stonecross";
        const cell = assignCell(sim, world, convictTown, false);
        if (cell) {
          target.jailedUntil = sim.day * 1440 + sim.time + hours * 60;
          target.scene = `i:${cell.bId}`; target.x = cell.spot.x; target.y = cell.spot.y;
          setJailScreen({ bId: cell.bId, day: sim.day });
          showToast(`Arrested. ${hours} hours in a ${bld(cell.bId).name} cell${debt ? ` and a ${debt}c fine` : ""}. The clock runs.`);
        } else {                                          // every cell everywhere full — the old dark-skip is the relief valve
          sim.time += hours * 60;
          while (sim.time >= 1440) { sim.time -= 1440; sim.day++; }
          const hqDoor = bld("hq").door;
          target.scene = "t:stonecross"; target.x = hqDoor.x; target.y = hqDoor.y;
          showToast(`Arrested — every cell is full, so you're held informally for ${hours} hours${debt ? ` and fined ${debt}c` : ""}.`);
        }
      } else {
        const convictTown = townOfScene(world, target.scene) || "stonecross";
        const cell = assignCell(sim, world, convictTown, false);   // short-timers take any free local cell
        if (cell) {
          target.scene = `i:${cell.bId}`; target.x = cell.spot.x; target.y = cell.spot.y;
          target.jailedUntil = sim.day * 1440 + sim.time + hours * 60;
          target.legs = []; target.path = []; target.goal = null; target.activity = "sitting in a cell";
        } else { target.wanted = 0; }   // no cell free → effectively released (overflow relief valve)
      }
    }
    enforcer.dispatch = null;
  };

  /* Stage 2.3: the prison break. A lifer's only exit — a HARD async skill check
     (stealth via 'service'), eased by skill, made harder by each awake guard in
     the lockup and by difficulty tier. Both brakes (cooldown + daily cap) apply.
     Success → free but a 5★ fugitive, hunted on sight. Failure → caught, cooldown,
     the attempt logged. Guards are fewer at night, so timing matters. */
  const attemptPrisonBreak = () => {
    const sim = simRef.current, world = worldRef.current, p = sim.player;
    if (!jailScreen || p.breaking || apiBusyRef.current) return;
    const absMin = sim.day * 1440 + sim.time;
    if (!canAttempt(p, "prisonbreak", absMin, CFG.PRISON.breakDailyCap)) {
      showToast("You need to lie low a while before trying again."); return;
    }
    const bId = jailScreen.bId;
    const hour = (sim.time / 60) % 24;
    const [nStart, nEnd] = CFG.PRISON.nightEaseHour;
    const isNight = hour >= nStart || hour < nEnd;
    // awake guards physically in this lockup right now raise the difficulty
    const guards = sim.npcs.filter(n => n.alive && n.enforcer && n.scene === `i:${bId}` && !n.jailedUntil).length;
    const tier = sim.settings.difficulty || "normal";
    let d = CFG.PRISON.breakBaseDifficulty;
    d -= skillLevel(p, "service") * CFG.PRISON.breakPerSkillLevel;   // stealth/dexterity eases it
    d += guards * CFG.PRISON.guardPenalty;                            // more eyes, harder
    if (isNight) d -= CFG.PRISON.guardPenalty;                        // the graveyard shift is thin
    d = clamp(Math.round(d * (CFG.PRISON.diffMult[tier] || 1)), CFG.SKILLCHECK.minDifficulty, 100);
    p.breaking = true; apiBusyRef.current = true;
    showToast(guards > 0 ? `${guards} guard${guards > 1 ? "s" : ""} on duty. Risky...` : "The block is quiet. Now or never.");
    skillCheck("the prisoner", `break out of a Watch holding cell${guards ? " past guards on duty" : " while the block is quiet"}`,
      `improvised skill from service level ${skillLevel(p, "service")}, ${isNight ? "working under cover of night" : "in broad daylight"}`, d)
      .then(pass => {
        if (pass) {
          clearCheck(p, "prisonbreak");
          p.jailedUntil = null; p.wanted = CFG.PRISON.escapeeWanted;   // free — and a hunted fugitive
          const door = bld(bId).door;
          p.scene = `t:${bld(bId).town}`; p.x = door.x; p.y = door.y;
          p.activity = "on the run"; setJailScreen(null);
          sim.buzz = { text: "JAILBREAK — a lifer's loose. The Watch is hunting.", day: sim.day };
          showToast("You're OUT. Wanted 5★ — every enforcer will come for you. Run.");
        } else {
          recordFail(p, "prisonbreak", absMin, CFG.PRISON.breakCooldownMin);
          showToast(rand(["A guard rounds the corner — back in the cell.", "The lock holds. Someone heard. Not this time.", "So close. They drag you back."]));
        }
      })
      .catch(() => recordFail(p, "prisonbreak", absMin, CFG.PRISON.breakCooldownMin))
      .finally(() => { p.breaking = false; apiBusyRef.current = false; });
  };

  /* =====================================================================
     ROBBERY + COMBAT
     ===================================================================== */
  /* instant off-screen resolution for NPC-vs-NPC scuffles */
  const resolveFightNPC = (sim, a, b, now) => {
    let hpA = a.health, hpB = b.health;
    while (hpA > 0 && hpB > 0) { hpB -= weaponDmg(a); if (hpB <= 0) break; hpA -= weaponDmg(b); }
    const [winner, loser] = hpA > 0 ? [a, b] : [b, a];
    winner.health = Math.max(1, hpA > 0 ? hpA : hpB); loser.health = 0;
    winner.bubble = { text: "*breathing hard* ...stay down.", until: now + 4 };
    const lethal = ITEMS[bestWeapon(winner) || ""]?.lethal;          // a knife doesn't stop at "down"
    // …but a burglar caught by a CIVILIAN mostly grabs and RUNS — the panic-stab is the
    // exception (40%), not the rule. Criminals and the Watch get no such mercy.
    const civilianLoser = !loser.outlaw && !loser.enforcer;
    if (lethal && (!civilianLoser || Math.random() < 0.4)) setDying(sim, loser, winner.id); else incapacitate(sim, loser);
    if (winner === a) {
      transferCoins(sim, loser, winner, Math.floor(loser.coins * CFG.ROBBERY.take));
      convictStars(sim, winner, lethal ? 4 : 3, `${winner.name} ${lethal ? "gravely wounded" : "beat down"} ${loser.name}`);
    } else {
      repEvent(sim, winner, 3, 2, `${winner.name} fought off ${loser.name}`);    // self-defense reads well
      convictStars(sim, a, 2, `${a.name} attacked ${b.name}`);                   // failed aggression is still attempted harm
    }
    const enforcer = sim.npcs.find(n => n.alive && n.enforcer && !n.dispatch);
    if (enforcer && winner.wanted > 0) enforcer.dispatch = { targetId: winner.id };
  };

  /* NPC victim of a robbery threat: incident call or local temperament */
  const npcRobberyResponse = (sim, victim, robber, now) => {
    pushFx(sim, victim.scene, victim.x, victim.y, "crime");   // Stage 3.5: the moment itself, marked
    const act = (response) => {
      if (response === "fight") { resolveFightNPC(sim, robber, victim, now); return; }
      if (response === "run") {
        victim.bubble = { text: "HELP! WATCH! HELP!", until: now + 4 };
        // Stage 3.5: no psychic Watch — the victim RUNS to report it themselves
        victim.report = { thiefId: robber.id || "player", crime: "robbery", victimName: victim.name };
        victim.goal = null;
        return;
      }
      const took = transferCoins(sim, victim, robber, Math.floor(victim.coins * CFG.ROBBERY.take));
      victim.bubble = { text: `T-take it... ${took} coins. Just go.`, until: now + 4 };
      victim.memories = [...victim.memories, `${robber.id ? robber.name : "The player"} robbed me`].slice(-CFG.MAX_MEMORIES);
      seedGossip(sim, [victim], { text: `${robber.id ? robber.name : "the player"} robbed ${victim.name}`, subjectId: robber.id || "player", bad: true });
      victim.relationships[robber.id || "player"] = "hates";
      // Stage 3.5: a shaken victim usually reports it — or an earshot witness does. Nobody just KNOWS.
      if (Math.random() < 0.75) { victim.report = { thiefId: robber.id || "player", crime: "robbery", victimName: victim.name }; victim.goal = null; }
      else {
        const earwit = sim.npcs.find(n => n.alive && n !== victim && n !== robber && !n.minor && n.scene === victim.scene && dist(n, victim) < 8);
        if (earwit) { earwit.report = { thiefId: robber.id || "player", crime: "robbery", victimName: victim.name }; earwit.goal = null; }
      }
    };
    const byId = Object.fromEntries(sim.npcs.map(n => [n.id, n]));
    const ctx = `${robber.id ? robber.name : "the player"} is threatening ${victim.name} with a ${ITEMS[bestWeapon(robber)]?.name || "raised fist"}, demanding coins`;
    if (incidentBudget(sim) && !apiBusyRef.current) {
      sim.incidents.count++;
      apiBusyRef.current = true;
      incidentCall("robbery", [victim], ctx, byId)
        .then(out => act(["submit", "run", "fight"].includes(out.response) ? out.response : "submit"))
        .catch(() => act(victim.enforcer ? "fight" : victim.minor ? "run" : victim.coins < 8 ? "fight" : "submit"))
        .finally(() => { apiBusyRef.current = false; });
    } else act(victim.enforcer ? "fight" : victim.minor ? "run" : victim.coins < 8 ? "fight" : "submit");
  };

  /* player-facing combat: rounds tick on an interval while the panel is up */
  useEffect(() => {
    if (!combat || combat.over) return;
    const iv = setInterval(() => {
      setCombat(c => {
        if (!c || c.over) return c;
        const sim = simRef.current;
        const p = sim.player, foe = sim.npcs.find(n => n.id === c.foeId);
        const log = [...c.log];
        const pd = weaponDmg(p);
        if (damage(foe, pd)) {                            // foe drops
          const lethal = ITEMS[bestWeapon(p) || ""]?.lethal;
          log.push(lethal ? `You land the finish (${pd}). ${foe.name} collapses — that blade cut DEEP.` : `You land the finish (${pd}). ${foe.name} goes down.`);
          if (lethal) setDying(sim, foe, "player"); else incapacitate(sim, foe);   // knives don't stop at down
          if (c.aggressor === "player") {
            if ((foe.wanted || 0) >= 5) repEvent(sim, p, 8, 6, `the player brought down ${foe.name}, the five-star outlaw`);   // a public service, not a crime
            else {
              transferCoins(sim, foe, p, Math.floor(foe.coins * CFG.ROBBERY.take));
              convictStars(sim, p, lethal ? 4 : 3, `the player ${lethal ? "gravely wounded" : "beat down"} ${foe.name}`);
            }
          } else repEvent(sim, p, 3, 2, `the player fought off ${foe.name}`);
          const enforcer = sim.npcs.find(n => n.alive && n.enforcer && !n.dispatch);
          if (enforcer && p.wanted > 0) enforcer.dispatch = { targetId: "player" };
          return { ...c, log, over: true, won: true };
        }
        log.push(`You hit for ${pd}.`);
        const fd = weaponDmg(foe);
        if (damage(p, fd)) {                              // player drops
          const foeLethal = ITEMS[bestWeapon(foe) || ""]?.lethal;
          log.push(`${foe.name} hits for ${fd}. Everything goes dark.`);
          if (c.aggressor !== "player") transferCoins(sim, p, foe, Math.floor(p.coins * CFG.ROBBERY.take));
          if (foeLethal) setDying(sim, p, foe.id); else incapacitate(sim, p);   // lethal foes leave you DYING
          return { ...c, log, over: true, won: false };
        }
        log.push(`${foe.name} hits for ${fd}.`);
        return { ...c, log: log.slice(-6) };
      });
    }, CFG.COMBAT.roundMs);
    return () => clearInterval(iv);
  }, [combat?.foeId, combat?.over]); // eslint-disable-line

  const tryFlee = () => {
    const p = simRef.current.player;
    if (Math.random() * 100 < CFG.COMBAT.fleeBase + p.energy / 4) { setCombat(null); showToast("You break away and run!"); }
    else { damage(p, weaponDmg(simRef.current.npcs.find(n => n.id === combatRef.current.foeId))); showToast("They catch you as you turn!"); bump(); }
  };

  /* murder, deliberately: attacking someone already down finishes them.
     Witnesses in the scene make it a solved case on the spot; otherwise
     the body lies where it fell and the Watch has a mystery. */
  const finishDowned = (npcId) => {
    const sim = simRef.current;
    const victim = sim.npcs.find(n => n.id === npcId);
    if (!victim || (!victim.incap && !victim.dying)) return;
    victim.health = 0;
    const witnesses = sim.npcs.some(n => n.alive && n !== victim && !n.incap && !n.dying && !n.hidden && n.scene === victim.scene);
    killEntity(sim, victim, "murdered", "player");
    if (witnesses || sim.player.scene === victim.scene && false) { /* killEntity's witness scan handles discovery */ }
    showToast(witnesses ? "It's done. And everyone SAW." : "It's done. Nobody saw... yet.");
    bump();
  };

  /* player threatens an NPC (requires a weapon in your pack) */
  const threatenNPC = (npcId) => {
    const sim = simRef.current;
    const victim = sim.npcs.find(n => n.id === npcId);
    npcRobberyResponse(sim, victim, sim.player, performance.now() / 1000);
    bump();
  };

  /* player's robbery-threat panel choices (an NPC is shaking YOU down) */
  const threatChoice = (choice) => {
    const sim = simRef.current, now = performance.now() / 1000;
    const robber = sim.npcs.find(n => n.id === threat.robberId);
    setThreat(null);
    if (choice === "submit") {
      const took = transferCoins(sim, sim.player, robber, Math.floor(sim.player.coins * CFG.ROBBERY.take));
      showToast(`You hand over ${took} coins. ${robber.name} melts into the shadows. Report it — or don't.`);
      sim.playerRobbedBy = robber.id;                     // Stage 3.5: nobody knows unless someone TELLS the Watch
    } else if (choice === "run") {
      if (Math.random() * 100 < CFG.ROBBERY.escapeBase + sim.player.energy / 2) {
        showToast("You bolt — and make it! Report it at the Watch HQ.");
        sim.playerRobbedBy = robber.id;                  // unlocks "Report robbery" at HQ — the ONLY road to a conviction
      } else {
        const took = transferCoins(sim, sim.player, robber, Math.floor(sim.player.coins * CFG.ROBBERY.take));
        damage(sim.player, randInt([5, 12]));
        showToast(`Caught! You lose ${took} coins and take a hit.`);
        sim.playerRobbedBy = robber.id;                  // Stage 3.5: hurt, robbed — and it's still on YOU to report it
      }
    } else setCombat({ foeId: robber.id, aggressor: robber.id, log: ["You raise your fists."], over: false, won: null });
  };

  /* =====================================================================
     NPC BRAIN — dead → jailed → bedrest → incap → sleep → wash → drink →
     eat → tidy → directive → report-exit → dispatch → work → wander
     ===================================================================== */
  /* priority: dead → jailed → bedrest → dying/incap → sleep → sick(bad) →
     wash → drink → eat → tidy → directive → report-exit → dispatch →
     casework → visit → party pull → work/print → patrol → wander */
  const decideNPC = (npc, sim, world, now) => {
    if (!npc.alive || npc.incap || npc.dying) return;
    const absTime = sim.day * 1440 + sim.time;
    if (npc.jailedUntil) {
      if (absTime >= npc.jailedUntil) { npc.jailedUntil = null; npc.goal = null; }
      else return;                                       // lifers never leave this branch
    }
    if (npc.repairJob) {   // v7: mechanic work is a real errand — walk, kneel, fix, collect
      const rj = npc.repairJob, stn = world.interiors[rj.bId]?.stations?.[rj.st];
      const rec9 = sim.appliances?.[`${rj.bId}:${rj.st}`];
      if (!stn || !rec9?.broken) { npc.repairJob = null; npc.goal = null; }   // fixed by someone else (or gone)
      else if (npc.scene !== `i:${rj.bId}` || dist(npc, stn) > 1.4) {
        npc.goal = { scene: `i:${rj.bId}`, x: stn.x, y: stn.y };
        npc.activity = `heading to a repair job at ${bld(rj.bId).name}`;
        return;
      } else {
        if (!rj.startedAt) rj.startedAt = absTime;
        npc.activity = `fixing the ${rj.st === "wash" ? "bathroom" : rj.st === "drinks" ? "drink machine" : "oven"} at ${bld(rj.bId).name}`;
        if (Math.random() < 0.05) npc.bubble = { text: rand(["*clank*", "Hold still, you.", "There's your problem.", "*tightens something*"]), until: now + 3 };
        if (absTime - rj.startedAt >= CFG.REPAIR.npcMin) {   // the job is DONE — paid on the spot
          const owner9 = sim.npcs.find(n => n.id === rj.ownerId && n.alive);
          if (owner9) transferCoins(sim, owner9, npc, Math.min(rj.fee, owner9.coins));
          npc.energy = clamp(npc.energy - CFG.REPAIR.npcEnergy, 0, 100);
          npc.skills.mechanic = (npc.skills.mechanic || 0) + taskXp("mechanic", 0);
          rec9.broken = false; rec9.uses = 0; delete rec9.waited; delete rec9.partReady; delete rec9.assigned;
          sim.dayLog.push(`${npc.name} spent two hours fixing the ${rj.st} at ${bld(rj.bId).name} (+${rj.fee}c)`);
          npc.bubble = { text: "Good as new. Mind the wet floor.", until: now + 4 };
          npc.repairJob = null; npc.goal = null;
        }
        return;
      }
    }
    if (npc.bedrest) {
      if (npc.health >= CFG.HOSPITAL.dischargeHp) {
        npc.bedrest = false; npc.goal = null;
        const clinic6b = sim.townUpgrades?.[bld("hospital").town]?.clinic ? 0.75 : 1;   // Stage 6: Clinic Fund
        const bill = Math.ceil(CFG.HOSPITAL.incapBill / 2 * clinic6b);    // billed on the way out — debt possible
        const doc = facilityDoctor(sim, "hospital");
        const payer = npc.coins < bill ? friendCoversBill(sim, npc.id, bill) : null;   // Stage 3: heavy bills can be covered
        if (payer) { payer.coins -= bill; sim.dayLog.push(`${payer.name} covered ${npc.name}'s hospital bill`); }
        else fineCoins(npc, bill);
        if (doc && doc !== npc) doc.coins += bill;             // the ward's take is the doctor's living
        else payTreasury(sim, "stonecross", bill);             // no doctor standing? the safe holds it
      } else return;
    }

    /* --- Stage 2: live job market. A jobless, employable local who's been idle
       past seekJobAfterDays will grab a standing opening — but only after the
       player's 15-minute exclusive window has lapsed. This is why dawdling
       across town can cost you the post. --- */
    if (sim.opening && !sim.opening.done && canSeekWork(npc) && !npc.occupation?.bId) {
      const idleDays = sim.day - (npc.occupation?.idleSince ?? sim.day);
      const windowOpen = (sim.time - (sim.opening.postedAt ?? 0)) >= CFG.OCCUPATION.playerHeadstartMin;
      if (idleDays >= CFG.OCCUPATION.seekJobAfterDays && windowOpen &&
          pickJobSeeker(sim, sim.opening.bId) === npc) {   // this NPC is the best-fit seeker
        const bId = sim.opening.bId;
        hireNpc(sim, npc, bId);
        sim.opening.done = true;                            // the post is filled; player missed it
        sim.buzz = { text: `${npc.name} landed the ${npc.occupation.title} job at ${bld(bId).name} before anyone else applied.`, day: sim.day };
      }
    }

    const hour = (sim.time / 60) % 24;
    const hereTown = townOfScene(world, npc.scene);      // needs are served WHERE YOU ARE (visitors eat local)
    const town = world.towns[hereTown];
    const overnight = npc.schedule && npc.schedule[1] > 24;
    const inShift = npc.schedule && (overnight
      ? (hour >= npc.schedule[0] || hour < npc.schedule[1] - 24)
      : (hour >= npc.schedule[0] && hour < npc.schedule[1]));
    const asleepHours = overnight ? (hour >= 8 && hour < 16) : (hour >= 22 || hour < 6);
    const homeDoor = npc.home ? bld(npc.home).door : null;   // Stage 3: the homeless have no door
    const eatery = TOWN_EATERY[hereTown] || "cafe";   // every town feeds its own
    /* an employee whose workplace is in ANOTHER town has to commute. Building-based jobs use the
       building's town; spot jobs (dock/graveyard) are always local. */
    const workTown = (npc.work?.bId && !npc.work.spot) ? (bld(npc.work.bId)?.town || npc.town) : npc.town;
    const commutes = !!npc.work?.bId && workTown !== npc.town;
    // cross-town commuters set out ~90 sim-min before the whistle so they clock in on time, not after
    const commuteLead = commutes ? 1.5 : 0;
    const preShift = commutes && npc.schedule && !overnight && !inShift &&
      hour >= npc.schedule[0] - commuteLead && hour < npc.schedule[0];
    // Watch vehicles ride free; visitors pay fares in moveNPC. A commuter, or an NPC stranded
    // outside their home town (hospital discharge, a rescue hauled cross-town), may travel —
    // otherwise a cross-town hire can never reach the shop and discharged Outlanders pace Stonecross.
    const cross = !!(npc.enforcer) || !!npc.visitPlan || hereTown !== npc.town || commutes;

    let goal, activity, hide = false;
    if ((npc.energy < 22 || asleepHours) && npc.thirst > 20 && npc.hunger > 15 && npc.sick?.level !== "bad") {
      // Stage 3.5: the body WAKES you — parched, starving, or burning up beats tired.
      // Control falls through to the drink/eat/clinic branches below; sleep resumes next decide.
      if (!npc.home || npc.evicted) {                    // Stage 3: no key, no bed — the bench it is
        goal = { scene: `t:${npc.town}`, ...world.towns[npc.town].spots.bench };
        activity = "sleeping on a bench"; hide = false;  // rough sleepers stay visible (that's the point)
      } else { goal = { scene: `t:${npc.town}`, ...homeDoor }; activity = "sleeping at home"; hide = true; }
      if (npc.visitPlan) npc.visitPlan = null;           // trips end at bedtime
      if (npc.hostingUntil) npc.hostingUntil = 0;        // Stage 4: stop hosting at bedtime
      if (npc.courierOrder) { const o = sim.orders.find(x => x.id === npc.courierOrder); if (o) o.claimedBy = null; npc.courierOrder = null; }   // release undelivered parcel
    } else if (npc.thirst < CFG.STARVE.criticalNeed || npc.hunger < CFG.STARVE.criticalNeed) {
      // Stage 3.7b: SURVIVAL PREEMPT — dangerously low beats everything discretionary (evasion,
      // couch, hygiene, mild sickness, wandering). The DoT is real-time; dawdling here is death.
      // First reach for the pocket: a carried drink/food is instant and needs no walk.
      const wantDrink = npc.thirst <= npc.hunger;         // fix the worse need first
      const pick = (kind) => Object.keys(npc.inv).filter(id => npc.inv[id] > 0 && ITEMS[id].eat?.[kind])
        .sort((a, b) => (ITEMS[b].eat[kind] || 0) - (ITEMS[a].eat[kind] || 0))[0];
      const carried = pick(wantDrink ? "thirst" : "hunger") || pick(wantDrink ? "hunger" : "thirst");
      if (carried) { consumeItem(npc, carried); npc.bubble = { text: `*has ${ITEMS[carried].name.toLowerCase()}*`, until: now + 3 }; return; }
      // nothing on hand → head to the nearest source: fountain for thirst, eatery/credit for hunger
      if (npc.thirst < CFG.STARVE.criticalNeed) {
        goal = { scene: `t:${hereTown}`, x: town.drink.x, y: town.drink.y }; activity = `getting a drink at the ${town.drink.label}`;
      } else if (stockOf(sim, eatery, EATERY_MEAL[eatery]) > 0 && world.interiors[eatery].seats.length) {
        goal = { scene: `i:${eatery}`, ...rand(world.interiors[eatery].seats) }; activity = `eating at ${bld(eatery).name}`;
      } else {
        goal = { scene: `t:${hereTown}`, x: town.drink.x, y: town.drink.y }; activity = "desperate for anything to eat";
      }
    } else if (npc.outlaw && (npc.wanted > 0 || sim.cases.some(c => c.state === "open" && c.suspectId === npc.id)) && !npc.layLowUntil) {
      // Stage 3.5: the professional's answer to heat — be somewhere else entirely.
      const away = ["alderbrook", "mossford", "stonecross"].filter(t => t !== npc.town);
      npc.town = rand(away);                             // her "home town" IS wherever she's working this week
      npc.layLowUntil = sim.day * 1440 + sim.time + CFG.OUTLAW.layLowHours * 60;
      goal = { scene: `t:${npc.town}`, ...world.towns[npc.town].spots.bench };
      activity = "slipping out of town";
    } else if (npc.work?.bId && inShift && npc.energy < CFG.COUCH.npcRestAt &&
               npc.thirst > 25 && npc.hunger > 20 &&     // Stage 3.5: a snack run beats a nap — the couch must NEVER outrank survival
               world.interiors[npc.work.bId]?.stations.couch &&
               !sim.npcs.some(n => n !== npc && n.alive && n.scene === `i:${npc.work.bId}` &&
                 dist(n, world.interiors[npc.work.bId].stations.couch) < 0.7)) {
      // Stage 3.5: tired ON SHIFT → the staff couch (one seat), instead of abandoning the post to walk home
      const c = world.interiors[npc.work.bId].stations.couch;
      goal = { scene: `i:${npc.work.bId}`, x: c.x, y: c.y }; activity = "resting on the staff couch";
    } else if (npc.sick?.level === "bad" && npc.inv.medicine > 0) {
      // Stage 3.7b: a bad case with medicine on hand takes it NOW rather than risking the walk —
      // the bad-sick DoT compounds with any hunger/thirst and the clinic trip can come too late.
      npc.inv.medicine -= 1; npc.sick = null; npc.seekClinic = false;
      npc.bubble = { text: "*doses up, rides it out*", until: now + 3 };
      return;
    } else if (npc.sick?.level === "bad") {              // bad cases drag themselves to the LOCAL clinic
      const cl = TOWN_CLINIC[hereTown];
      const st = world.interiors[cl].stations.treat;
      goal = { scene: `i:${cl}`, x: st.x, y: st.y }; activity = "feeling awful, seeking the doctor";
    } else if (npc.sick?.level === "mild" && npc.inv.medicine > 0) {
      // Stage 2.1: the pantry pays off — cure on the spot with carried medicine
      npc.inv.medicine -= 1; npc.sick = null; npc.seekClinic = false;
      npc.bubble = { text: "*takes medicine, shakes it off*", until: now + 3 };
      return;
    } else if (npc.sick?.level === "mild" && !inShift && npc.coins >= CFG.SELFCARE.mildClinicCoinFloor &&
               (npc.seekClinic || Math.random() < CFG.SELFCARE.mildClinicChance)) {
      // Stage 2.1: nip a cough in the bud — off-shift mild cases visit the clinic
      // early instead of waiting to escalate. seekClinic latches so they commit
      // to the trip once decided (decideNPC is throttled, so this fires sparingly).
      npc.seekClinic = true;
      const cl = TOWN_CLINIC[hereTown];
      const st = world.interiors[cl].stations.treat;
      goal = { scene: `i:${cl}`, x: st.x, y: st.y }; activity = "heading to the clinic before it worsens";
    } else if (npc.hygiene < CFG.HYGIENE.npcWashAt) {
      const w = TOWN_WASH[hereTown], st = world.interiors[w.bId].stations[w.st];
      if (applianceBroken(sim, w.bId, w.st)) {   // broken bathroom: the wash is SKIPPED — hygiene grumbles, nobody dies of it
        npc.bubble = { text: "Bathroom's BROKEN again…", until: now + 4 };
      } else { goal = { scene: `i:${w.bId}`, x: st.x, y: st.y }; activity = "washing up"; }
    } else if (npc.thirst < 30) {
      goal = { scene: `t:${hereTown}`, x: town.drink.x, y: town.drink.y }; activity = `getting a drink at the ${town.drink.label}`;
    } else if (npc.hunger < CFG.SELFCARE.hungerBuyThreshold) {
      const foodIds = Object.keys(npc.inv).filter(id => npc.inv[id] > 0 && ITEMS[id].eat?.hunger);
      const foodId = foodIds.sort((a, b) => (ITEMS[b].eat.hunger || 0) - (ITEMS[a].eat.hunger || 0))[0];
      if (foodId) {
        consumeItem(npc, foodId);
        npc.bubble = { text: `*eats ${ITEMS[foodId].name.toLowerCase()}*`, until: now + 3 };
        return;
      }
      if (npc.minor && npc.home) {                       // Stage 3.5: kids don't buy dinner — the family pantry is free
        goal = { scene: `t:${npc.town}`, ...bld(npc.home).door }; activity = "eating at home"; hide = true;
      } else if ((npc.coins >= 3 || npc.hunger < CFG.STARVE.desperateAt) && stockOf(sim, eatery, EATERY_MEAL[eatery]) > 0 && world.interiors[eatery].seats.length) {
        // Stage 3.5: a STARVING adult eats first and owes after — the tab is real fineCoins debt,
        // feeding the same rent/eviction spiral as every other debt. Nobody starves politely.
        const seat = rand(world.interiors[eatery].seats);
        goal = { scene: `i:${eatery}`, ...seat }; activity = `eating at ${bld(eatery).name}`;
      } else {
        // Stage 2.1: eatery's out or full — buy something to carry from a local shop
        // (also seeds a buffer so they're not caught empty next time)
        const buyFood = Object.keys(ITEMS)
          .filter(id => ITEMS[id].eat?.hunger && ITEMS[id].cat === "food" && findShop(id, hereTown) && stockOf(sim, findShop(id, hereTown), id) > 0)
          .sort((a, b) => ITEMS[a].price - ITEMS[b].price)[0];
        const shopB = buyFood && findShop(buyFood, hereTown);
        if (shopB && npc.coins >= priceOf(sim, shopB, buyFood)) {   // Stage 3.7
          const st = world.interiors[shopB].stations[SHOP_STATION[shopB]];
          npc.shopFor = { item: buyFood, bId: shopB };     // completed at the counter in npcAtGoal
          goal = { scene: `i:${shopB}`, x: st.x, y: st.y }; activity = `buying food at ${bld(shopB).name}`;
        } else {
          // Stage 3.6: before grumbling toward starvation, eat ANYTHING carried (fruit, snack, even raw)
          const anyFood = Object.keys(npc.inv).filter(id => npc.inv[id] > 0 && ITEMS[id].eat?.hunger)
            .sort((a, b) => (ITEMS[b].eat.hunger || 0) - (ITEMS[a].eat.hunger || 0))[0];
          if (anyFood) { consumeItem(npc, anyFood); npc.bubble = { text: `*eats ${ITEMS[anyFood].name.toLowerCase()}*`, until: now + 3 }; return; }
          goal = { scene: `t:${hereTown}`, x: town.drink.x, y: town.drink.y }; activity = npc.coins < 3 ? "grumbling about being broke and hungry" : "grumbling that the kitchen is OUT";
        }
      }
    } else if (wantsToStock(npc, sim, now, inShift) && buildShoppingList(npc, hereTown).length) {
      // Stage 2.1: proactive pantry run — off-shift, solvent, low on essentials,
      // AND something's actually buyable here. Balanced priority: below needs,
      // above idle wandering & chores.
      const list = buildShoppingList(npc, hereTown);
      npc.shopList = list;                               // executed item-by-item at the counter
      const first = list[0], st = world.interiors[first.bId].stations[SHOP_STATION[first.bId]];
      goal = { scene: `i:${first.bId}`, x: st.x, y: st.y }; activity = `stocking up at ${bld(first.bId).name}`;
    } else if (npc.tidy) {
      goal = { scene: npc.tidy.scene, x: npc.tidy.x, y: npc.tidy.y }; activity = "tidying up";
    } else if (npc.directive) {
      const d = directiveGoal(npc, sim, world);
      if (d) { goal = d.goal; activity = d.activity; }
      else { npc.directive = null; goal = npc.goal || { scene: `t:${hereTown}`, ...town.spots.plaza }; activity = "out and about"; }
    } else if (npc.report) {
      if (npc.scene.startsWith("t:")) {
        if (npc.report.bodyNpc) { const b = sim.bodies.find(b => b.npcId === npc.report.bodyNpc); if (b) discoverBody(sim, b, npc.id); }
        else fileReport(sim, npc, npc.report.thiefId, npc.report.crime || "theft", npc.report.victimName || "a shopkeeper");
        npc.report = null; goal = { scene: `t:${hereTown}`, ...town.spots.plaza }; activity = "shaken, catching their breath";
      }
      else { const ex = world.interiors[npc.scene.slice(2)].exit; goal = { scene: npc.scene, x: ex.x, y: ex.y }; activity = "hurrying out"; }
    } else if (npc.dispatch) {                           // enforcer duty: a target, or a body
      if (npc.dispatch.bodyScene) {
        goal = { scene: npc.dispatch.bodyScene, x: npc.dispatch.bodyX, y: npc.dispatch.bodyY }; activity = "responding to a report";
      } else {
        const t = npc.dispatch.targetId === "player" ? sim.player : sim.npcs.find(n => n.id === npc.dispatch.targetId);
        if (!t || (t.id && (!t.alive || t.incap || t.dying)) || ((t.wanted || 0) <= 0 && !npc.dispatch.caseId)) { npc.dispatch = null; goal = { scene: `t:${hereTown}`, ...town.spots.plaza }; activity = "patrolling"; }   // Stage 3.5: an open case keeps the pursuit alive
        else { goal = { scene: t.scene, x: Math.round(t.x), y: Math.round(t.y) }; activity = "in pursuit"; }
      }
    } else if (npc.enforcer && npc.caseWork) {           // investigation: scene first, then suspects
      const cw = npc.caseWork, kase = sim.cases.find(c => c.id === cw.caseId);
      if (!kase || kase.state !== "open") { npc.caseWork = null; goal = { scene: `t:${hereTown}`, ...town.spots.plaza }; activity = "patrolling"; }
      else if (cw.stage === "scene") { goal = { scene: kase.scene, x: kase.x, y: kase.y }; activity = "examining the scene"; }
      else {
        const t = cw.targetId === "player" ? sim.player : sim.npcs.find(n => n.id === cw.targetId);
        if (!t || (t.id && !t.alive)) { npc.caseWork = null; goal = { scene: `t:${hereTown}`, ...town.spots.plaza }; activity = "patrolling"; }
        else { goal = { scene: t.scene, x: Math.round(t.x), y: Math.round(t.y) }; activity = "looking to ask some questions"; }
      }
    } else if (npc.crimePlan) {
      const stn = world.interiors[npc.crimePlan.bId].stations[SHOP_STATION[npc.crimePlan.bId]];
      goal = { scene: `i:${npc.crimePlan.bId}`, x: stn.x, y: stn.y }; activity = "browsing, very casually";
    } else if (npc.enforcer && npc.patrolRoute?.towns?.length && hour >= 8 && hour < 20) {
      // Pass 3: a Junior on assigned patrol — walk the route, dwell, move on. Their PRESENCE
      // in a town is the deterrent (the existing enforcer-in-town checks see them).
      const pt = npc.patrolRoute.towns[npc.patrolRoute.idx % npc.patrolRoute.towns.length];
      const spot = world.towns[pt]?.spots?.plaza || { x: 5, y: 5 };
      if (npc.scene === `t:${pt}`) {
        if (!npc.patrolArrived) npc.patrolArrived = sim.time;
        if (sim.time - npc.patrolArrived > CFG.WATCH_PLAN.dwellMin) { npc.patrolRoute.idx++; npc.patrolArrived = null; }
        goal = { scene: `t:${pt}`, x: spot.x, y: spot.y }; activity = "walking the beat";
      } else { goal = { scene: `t:${pt}`, x: spot.x, y: spot.y }; activity = "heading to patrol"; }
    } else if (npc.burglaryPlan && (!npc.burglaryPlan.afterHour || hour >= npc.burglaryPlan.afterHour || hour < 5)) {   // Stage 7: a planned job can wait for dark
      const home = bld(npc.burglaryPlan.homeId), inter = world.interiors[npc.burglaryPlan.homeId];
      const spot = inter?.stations?.table || inter?.stations?.bed || { x: home.door.x, y: home.door.y };
      goal = { scene: `i:${npc.burglaryPlan.homeId}`, x: spot.x, y: spot.y }; activity = "slipping inside a quiet house";
    } else if (sim.party && sim.party.day === sim.day && hour >= CFG.PARTY.hour && hour < CFG.PARTY.endHour && hereTown === sim.party.town) {
      const s = town.spots.plaza;                          // arrived guests join the plaza, not the host's hallway
      let gx = s.x + (sim.npcs.indexOf(npc) % 3) - 1, gy = s.y + (sim.npcs.indexOf(npc) % 2);
      if (!town.walk[gy]?.[gx]) { gx = s.x; gy = s.y; }    // snap blocked spread-spots back to the plaza tile
      goal = { scene: `t:${hereTown}`, x: gx, y: gy };
      activity = "at the party!"; hide = false;
    } else if (sim.opening && !sim.opening.done && OWNERS[sim.opening.bId] === npc.id &&
               sim.day === sim.opening.day && hour >= sim.opening.hour &&
               hour < sim.opening.hour + CFG.JOBS.interviewWindow) {
      /* the boss has an open interview slot at THEIR building right now — be there
         to receive the applicant. Sits above social/wander so they never no-show
         their own interview (was: attendance was incidental, causing missed slots). */
      const bId = sim.opening.bId;
      const st = world.interiors[bId].stations[SHOP_STATION[bId] || npc.work?.station || "staff"];
      goal = { scene: `i:${bId}`, x: st.x, y: st.y }; activity = `waiting to interview at ${bld(bId).name}`;
    } else if (npc.hostingUntil && absTime < npc.hostingUntil && npc.home && !inShift) {
      // Stage 4: a guest is coming over — be home to receive them (unless on shift/emergency)
      const hi = world.interiors[npc.home];
      const spot = hi?.stations?.table || hi?.seats?.[1] || bld(npc.home).door;
      goal = { scene: `i:${npc.home}`, x: spot.x, y: spot.y }; activity = "hosting a visitor at home";
    } else if (npc.visitPlan && (npc.visitPlan.party ? hour >= 15 : hour >= 9) && hour < 19) {
      /* the social trip (budget-gated in dailyTick); party guests leave later
         and stay for the whole thing instead of bailing at 17:00 */
      const vp = npc.visitPlan;
      const t = vp.targetId === "player" ? sim.player : sim.npcs.find(n => n.id === vp.targetId);
      if (!t || (t.id && !t.alive)) { npc.visitPlan = null; goal = { scene: `t:${hereTown}`, ...town.spots.plaza }; activity = "out and about"; }
      else if (vp.phase === "return" || hour >= (vp.party ? CFG.PARTY.endHour : 17)) {
        vp.phase = "return";
        goal = { scene: `t:${npc.town}`, ...homeDoor }; activity = "heading home from a visit";
      } else {
        // Stage 4: a non-party visit is a HANGOUT AT THE HOST'S HOME (homes are enterable now).
        // Head into the host's home interior; the host is nudged home to receive (below).
        if (!vp.party && t.home && BUILDINGS.find(b => b.id === t.home)) {
          const hi = world.interiors[t.home];
          const seat = hi?.seats?.[0] || hi?.stations?.table || bld(t.home).door;
          goal = { scene: `i:${t.home}`, x: seat.x, y: seat.y };
          activity = `visiting ${t.id ? t.name : "the player"} at home`;
          if (t.id && !t.alive === false) t.hostingUntil = absTime + CFG.VISIT.stayMin;   // flag host to stay in
        } else {
          goal = { scene: t.scene, x: Math.round(t.x), y: Math.round(t.y) };
          activity = vp.party ? "heading to the party" : `visiting ${t.id ? t.name : "the player"}`;
        }
      }
    } else if (npc.printing) {                            // Stage 2.2: Bruno vs. the printer — now a skill check, not a timer
      const st = world.interiors.office.stations["desk_" + npc.id] || world.interiors.office.stations.desk_bruno;
      goal = { scene: "i:office", x: st.x, y: st.y }; activity = "wrestling with the printer (loudly)";
    } else if (preShift && npc.work && !npc.work.spot && world.interiors[npc.work.bId]) {
      // the morning commute: a cross-town hire heads for the shop BEFORE the bell so they're
      // on the floor on time. (Same-town workers don't need the lead — inShift covers them.)
      const st = world.interiors[npc.work.bId].stations[npc.work.station] || world.interiors[npc.work.bId].stations[SHOP_STATION[npc.work.bId]] || world.interiors[npc.work.bId].exit;
      goal = { scene: `i:${npc.work.bId}`, x: st.x, y: st.y };
      activity = `heading to work at ${bld(npc.work.bId).name}`;
    } else if (inShift && npc.work) {
      if (OWNERS[npc.work.bId] === npc.id && npc.work.bId === "office" && stockOf(sim, "office", "files") < 3 &&
          !npc.printing && canAttempt(npc, "printer", absTime)) {
        npc.printing = true;                              // heads to the desk; the check fires on arrival (npcAtGoal)
        const st = world.interiors.office.stations.desk_bruno;
        goal = { scene: "i:office", x: st.x, y: st.y }; activity = "wrestling with the printer (loudly)";
      } else if (npc.work.bId === "post") {   // Pete (owner) AND any hired couriers run real deliveries
        // Stage: a hired postal COURIER actually runs deliveries — the whole point of the job.
        if (npc.courierOrder) {
          const o = sim.orders.find(x => x.id === npc.courierOrder && x.state === "ready");
          if (!o) { npc.courierOrder = null; }             // someone else got it / already delivered
          else if (npc.scene === `t:${bld(o.bId).town}` && dist(npc, bld(o.bId).door) < 1.6) {
            fulfillOrder(sim, o, npc);                     // delivered — courier keeps the fee, XP via payWorker below
            npc.skills.stock = (npc.skills.stock || 0) + 1;
            npc.courierOrder = null; npc.bubble = { text: "Delivery! Sign here.", until: now + 3 };
          } else { const d = bld(o.bId).door; goal = { scene: `t:${bld(o.bId).town}`, x: d.x, y: d.y }; activity = `delivering to ${bld(o.bId).name}`; }
        }
        if (!npc.courierOrder) {
          const claim = sim.orders.find(o => o.state === "ready" && !o.claimedBy);
          if (claim) { claim.claimedBy = npc.id; npc.courierOrder = claim.id; const d = bld(claim.bId).door; goal = { scene: `t:${bld(claim.bId).town}`, x: d.x, y: d.y }; activity = `delivering to ${bld(claim.bId).name}`; }
          else { const st = world.interiors.post.stations.mail; goal = { scene: "i:post", x: st.x, y: st.y }; activity = "sorting mail at the post office"; }
        }
      } else if (npc.work.spot) { const s = world.towns[npc.town].spots[npc.work.spot]; goal = { scene: `t:${npc.town}`, ...s }; activity = npc.id === "finn" ? "tending the graveyard" : "fishing off the dock"; }
      else { const st = world.interiors[npc.work.bId].stations[npc.work.station]; goal = { scene: `i:${npc.work.bId}`, x: st.x, y: st.y }; activity = `working at ${bld(npc.work.bId).name}`; }
    } else if (npc.enforcer && inShift) {                 // idle Watch: pick up a case, an inspection, or patrol
      // prefer a case NO colleague is already working — the board gets divided, not dogpiled
      const worked = new Set(sim.npcs.filter(o => o.id !== npc.id && o.alive && o.caseWork).map(o => o.caseWork.caseId));
      const openCase_ = sim.cases.find(c => c.state === "open" && !worked.has(c.id)) || sim.cases.find(c => c.state === "open");
      if (openCase_ && !npc.caseWork) { npc.caseWork = { caseId: openCase_.id, stage: "scene" }; openCase_.lastLook = sim.day; goal = { scene: openCase_.scene, x: openCase_.x, y: openCase_.y }; activity = "examining the scene"; }
      else if (sim.inspectDue) {
        const shops = BUILDINGS.filter(b => SHOP_STOCK[b.id]);
        const shop = rand(shops), st = world.interiors[shop.id].stations[SHOP_STATION[shop.id]];
        npc.inspecting = shop.id;
        goal = { scene: `i:${shop.id}`, x: st.x, y: st.y }; activity = `inspecting ${shop.name}`;
        sim.inspectDue = false;
      } else if (now - npc.lastPatrol > CFG.PATROL.everyH * 3600 / CFG.MINUTES_PER_SEC / 60) {
        const townsList = Object.keys(TOWN_DEFS);
        npc.patrolIdx = (npc.patrolIdx + 1) % townsList.length;
        npc.lastPatrol = now;
        const pt = world.towns[townsList[npc.patrolIdx]];
        goal = { scene: `t:${pt.id}`, ...pt.spots.plaza }; activity = `patrolling ${pt.name}`;
      } else { goal = npc.goal || { scene: `t:${hereTown}`, ...town.spots.plaza }; activity = "patrolling"; }
    } else if (sim.graves.some(g => (g.town || "stonecross") === hereTown) && Math.random() < 0.05 && !npc.minor) {
      goal = { scene: `t:${hereTown}`, ...town.spots.graveyard };   // the towns tend their own dead
      activity = "paying respects at the graveyard";
    } else {
      const names = Object.keys(town.spots);
      const pick = (npc.pulseSpot && Math.random() < 0.5) ? npc.pulseSpot : rand(names);
      const s = town.spots[pick] || town.spots[names[0]];
      goal = (npc.goal && Math.random() < 0.6) ? npc.goal : { scene: `t:${hereTown}`, ...s };
      activity = npc.intent ? `out and about (${npc.intent})` : "relaxing around town";
    }

    if (npc.avoids && !npc.dispatch && npc.hunger > 20 && npc.thirst > 20 && npc.energy > 12 && npc.sick?.level !== "bad") {
      // Stage 3.7b: fleeing an avoided face is a LUXURY — only indulge it when not in survival
      // danger. A starving man doesn't leave the table because he dislikes someone across it.
      const near = sim.npcs.find(o => o.alive && npc.avoids.includes(o.id) && o.scene === npc.scene && dist(o, npc) < 4);
      if (near) { const s = town.spots.graveyard || town.spots.plaza; goal = { scene: `t:${hereTown}`, ...s }; activity = "suddenly remembering somewhere to be"; }
    }

    const enc = sim.encounters.find(e => !e.done && (e.a === npc.id || e.b === npc.id) && Math.abs(hour - e.hour) < 0.6);
    if (enc) { const s = world.towns[npc.town].spots.plaza; goal = { scene: `t:${npc.town}`, x: s.x + (enc.a === npc.id ? 0 : 1), y: s.y }; activity = "meeting someone"; hide = false; }

    if (!npc.goal || npc.goal.scene !== goal.scene || npc.goal.x !== goal.x || npc.goal.y !== goal.y) {
      npc.goal = goal;
      npc.legs = planTravel(world, { scene: npc.scene, x: npc.x, y: npc.y }, goal, { cross });
      npc.path = [];
    }
    npc.activity = activity;
    npc.wantHide = hide;
  };

  const directiveGoal = (npc, sim, world) => {
    const st = npc.directive.steps[0];
    if (!st) return null;
    const town = world.towns[npc.town];
    if (st.type === "goto") {
      const s = town.spots[st.spot]; if (!s) return null;
      return { goal: { scene: `t:${npc.town}`, ...s }, activity: "heading somewhere with purpose" };
    }
    if (st.type === "buy") {
      const shopId = findShop(st.item, npc.town); if (!shopId) return null;
      const stn = world.interiors[shopId].stations[SHOP_STATION[shopId]];
      return { goal: { scene: `i:${shopId}`, x: stn.x, y: stn.y }, activity: `shopping at ${bld(shopId).name}` };
    }
    const target = st.target === "player" ? sim.player : sim.npcs.find(n => n.id === st.target && n.alive);
    if (!target || townOfScene(world, target.scene) !== npc.town) return null;
    return { goal: { scene: target.scene, x: Math.round(target.x), y: Math.round(target.y) },
             activity: st.type === "visit" ? "looking for someone" : "on a generous errand" };
  };

  const npcAtGoal = (npc, sim, world, dtHours, now) => {
    if (!npc.alive || npc.incap || npc.dying || !npc.goal || npc.legs.length > 1 || npc.path.length) return;
    if (Math.round(npc.x) !== npc.goal.x || Math.round(npc.y) !== npc.goal.y) return;
    npc.hidden = npc.wantHide;
    const absTime = sim.day * 1440 + sim.time;

    if (npc.activity.includes("bench")) {              // Stage 3: rough sleeping — half the rest, none of the dignity
      npc.energy = clamp(npc.energy + 60 * dtHours, 0, 100);
      npc.hygiene = clamp(npc.hygiene - 20 * dtHours, 0, 100);
      npc.health = clamp(npc.health + CFG.HEALTH.regenSleep * 0.5 * dtHours, 0, 100);
    } else if (npc.activity.includes("sleep")) {
      npc.energy = clamp(npc.energy + 120 * dtHours, 0, 100);
      npc.hygiene = clamp(npc.hygiene + 30 * dtHours, 0, 100);
      npc.health = clamp(npc.health + CFG.HEALTH.regenSleep * dtHours, 0, 100);
    }
    if (npc.activity === "eating at home") {             // Stage 3.5: the family pantry — free, slow, warm
      npc.hunger = clamp(npc.hunger + 240 * dtHours, 0, 100);
      if (npc.hunger > 85) npc.goal = null;
    }
    if (npc.activity.includes("staff couch")) {          // Stage 3.5: a top-up, not a night's sleep
      npc.energy = clamp(npc.energy + CFG.COUCH.regenPerHr * dtHours, 0, 100);
      if (npc.energy > CFG.COUCH.npcRestUntil) npc.goal = null;
    }
    if (npc.activity.includes("washing")) { npc.hygiene = clamp(npc.hygiene + 300 * dtHours, 0, 100); if (npc.hygiene > 95) npc.goal = null; }
    if (npc.activity.includes("drink")) npc.thirst = clamp(npc.thirst + 240 * dtHours, 0, 100);
    if (npc.activity.includes("eating")) {
      if (!npc.paidMeal) {                               // pay the OWNER; the kitchen loses a plate
        const eatery = npc.scene.slice(2);
        takeStock(sim, eatery, EATERY_MEAL[eatery]);
        soilDish(sim, eatery);   // Stage 5: a served meal = a dirty dish
        const ownerId = OWNERS[eatery];
        const owner = ownerId ? sim.npcs.find(n => n.id === ownerId && n.alive) : null;
        if (owner && owner.id !== npc.id) {
          if (npc.coins >= 3) transferCoins(sim, npc, owner, 3);
          else { fineCoins(npc, 3); owner.coins += 3; }   // Stage 3.5: fed on credit — real debt, and the owner is made whole
        } else npc.coins = Math.max(0, npc.coins - 3);
        npc.paidMeal = true;
      }
      npc.hunger = clamp(npc.hunger + 240 * dtHours, 0, 100);
      if (npc.hunger > 85) npc.paidMeal = false;
    }
    /* Stage 2.1: buying food to carry (hunger fallback) */
    if (npc.activity.includes("buying food") && npc.shopFor) {
      npcPurchase(sim, npc, npc.shopFor.bId, npc.shopFor.item);   // affordability/stock handled inside
      npc.shopFor = null; npc.goal = null;
    }
    /* Stage 2.1: proactive pantry run — buy the whole list, then log the trip */
    if (npc.activity.includes("stocking up") && npc.shopList) {
      for (const entry of npc.shopList) {
        if (npc.coins - priceOf(sim, entry.bId, entry.item) < CFG.SELFCARE.shopCoinFloor) break;   // keep a reserve (Stage 3.7 owner price)
        npcPurchase(sim, npc, entry.bId, entry.item);              // silently skips if a shelf is empty
      }
      npc.shopList = null; npc.lastStockRun = now; npc.goal = null;
      npc.bubble = { text: "*tucks away supplies*", until: now + 3 };
    }
    /* the doctor's desk: sick cases (mild or bad) pay the fee, drain medicine
       stock, get cured. Mild cases treated here never escalate. */
    if (npc.activity.includes("seeking the doctor") || npc.activity.includes("clinic before it worsens")) {
      const facility = npc.scene.slice(2);               // hospital or a walk-in clinic
      if (takeStock(sim, facility, "medicine")) {
        const doc = facilityDoctor(sim, facility);         // Stage 3: whoever practices here earns the visit fee
        if (doc && doc !== npc) transferCoins(sim, npc, doc, CFG.SICK.medFee);
        else { npc.coins = Math.max(0, npc.coins - CFG.SICK.medFee); payTreasury(sim, bld(facility).town, CFG.SICK.medFee); }
        npc.sick = null; npc.seekClinic = false; npc.goal = null;
        // Stage 3.7: care includes fluids and a meal — a patient who arrived running on empty
        // doesn't get cured of a cough only to die of dehydration on the clinic floor.
        npc.hunger = Math.max(npc.hunger, CFG.HOSPITAL.admitNeedFloor);
        npc.thirst = Math.max(npc.thirst, CFG.HOSPITAL.admitNeedFloor);
        npc.thirstAcc = 0; npc.hungerAcc = 0;
        npc.bubble = { text: "*feels human again*", until: now + 3 };
      } else { npc.seekClinic = false; npc.bubble = { text: "Out of medicine?! Of all the days...", until: now + 4 }; }
    }
    /* Bruno's printer purgatory: two hours, then a fat stack of files */
    if (npc.printing) {
      // Stage 3.7c: LOCAL skill roll — the printer is contentless flavor, not worth an API call.
      if (!npc.printChecking && canAttempt(npc, "printer", absTime)) {
        // Stage 3.7c: LOCAL roll, no API — the printer is contentless flavor, not a task worth a call.
        // Paperwork-domain expertise (Bruno has it, Priya has some) makes it near-certain; raw clerical
        // XP alone gives only a modest chance. Bruno's canned lines carry the character, free.
        // Stage 3.7d: the printer is a HARD (tier 2) paperwork task — Bruno (expert) breezes it,
        // a green clerk mostly jams. tierSuccess reads skill level vs the task tier directly.
        if (Math.random() < tierSuccess(npc, 2, "office", "paperwork")) {
          npc.printing = false; clearCheck(npc, "printer");
          addStock(sim, "office", "files", CFG.STOCK.printBatch + (hasUpgrade(sim, "office", "paper") ? 6 : 0));   // Stage 5: extra paper trays
          payWorker(sim, "office", npc, "office_print", skillMult(npc, "office"));
          if (trainDomain(npc, "office", "paperwork")) repEvent(sim, npc, 1, 2, `${npc.name} mastered the office machines`);
          npc.bubble = { text: "PC LOAD LETTER?! ...done. NEVER again.", until: now + 5 };
        } else {
          recordFail(npc, "printer", absTime);
          npc.bubble = { text: rand(["*THUNK* ...paper jam. AGAIN.", "Why. WHY won't it—", "Is it plugged in? It's plugged in."]), until: now + 4 };
          if (!canAttempt(npc, "printer", absTime)) { npc.printing = false; npc.bubble = { text: "Forget it. The files can WAIT.", until: now + 4 }; }
        }
        npc.goal = null;
      }
      return;                                            // printing blocks the rest of the work branch
    }
    if (npc.activity.includes("working") || npc.activity.includes("fishing") || npc.activity.includes("tending")) {
      /* staff complete one abstract task per tick — real coins, owner-funded */
      npc.workTick += dtHours * 60;
      const wBId = npc.work?.bId;
      // Stage 5: sorting cabinets — staff at an upgraded building complete tasks 1.5x faster
      const tickNeed = CFG.ECON.workTickMin / (wBId && hasUpgrade(sim, wBId, "cabinets") ? 1.5 : 1);
      if (npc.workTick >= tickNeed) {
        npc.workTick = 0;
        const bId = wBId;
        if (bId === "office") {
          if (takeStock(sim, "office", "files")) {                                               // no files, no filing
            payWorker(sim, "office", npc, "office_sort", skillMult(npc, "office"));
            npc.skills.office = (npc.skills.office || 0) + 1;                                    // staff train too
          }
        } else if (bId && OWNERS[bId] !== npc.id) {
          const tr = KITCHEN[bId] ? "kitchen" : bId === "post" ? "stock" : "service";
          payWorker(sim, bId, npc, "chef", skillMult(npc, tr));
          const npcBefore = skillLevel(npc, tr);
          npc.skills[tr] = (npc.skills[tr] || 0) + 1;
          const npcAfter = skillLevel(npc, tr);
          if (npcAfter > npcBefore) {   // Stage 3.7c: NPC milestones matter too
            if (npcAfter >= CFG.SKILL.masterRenownAt) repEvent(sim, npc, 4, CFG.SKILL.masterRenown, `${npc.name} became a ${SKILL_TRACKS[tr]} Master`);
            else if (npcAfter >= CFG.SKILL.expertReownAt) repEvent(sim, npc, 2, CFG.SKILL.expertRenown, `${npc.name} reached ${SKILL_TRACKS[tr]} Expert`);
          }
          // train the specific domain this dish belongs to (chef shifts cook the eatery's meal)
          if (tr === "kitchen" && npc.activity) { const dom = TASK_DOMAIN[EATERY_MEAL[bId]] || "savory"; if (trainDomain(npc, "kitchen", dom)) repEvent(sim, npc, 1, 2, `${npc.name} mastered ${DOMAIN_LABEL[dom]}`); }
        } else if (!bId || OWNERS[bId] !== npc.id) npc.coins = Math.min(9999, npc.coins + 2);    // spot-trade takings (Gus's fish, Finn's grounds) — self-employed, not a dole
      }
      const bId = npc.work?.bId;
      if (bId && sim.mess[bId] > CFG.MESS.npcSweepAt && now - npc.lastTidy > CFG.MESS.npcSweepCooldownH * 3600 / CFG.MINUTES_PER_SEC / 60) {
        const f = rand(world.interiors[bId].floors);
        npc.tidy = { scene: `i:${bId}`, x: f.x, y: f.y };
      }
      /* owner-cooks batch their kitchen's meals INTO SHOP STOCK — Marge
         actually makes the food; sales later are her revenue */
      if (npc.cooks?.length && bId && now - npc.lastCook > 3 * 3600 / CFG.MINUTES_PER_SEC / 60) {   // ?.length: an empty cooks list is not a cook
        // Stage 5: a cluttered kitchen (too many dirty dishes) can't plate — wash first.
        if (kitchenStalled(sim, bId)) {
          const cleared = washDishes(sim, bId, hasUpgrade(sim, bId, "soap"));
          npc.lastCook = now - (2 * 3600 / CFG.MINUTES_PER_SEC / 60);   // washing takes a beat, not the full cook cooldown
          npc.bubble = { text: `*scrubs down a stack of dishes*`, until: now + 3 };
        } else {
          const dish = rand(npc.cooks);
          if (stockOf(sim, bId, dish) < CFG.STOCK.maxMeal) {
            const batch = CFG.STOCK.cookBatch + (hasUpgrade(sim, bId, "oven") ? Math.ceil(CFG.STOCK.cookBatch * 0.5) : 0);   // Stage 5: quality oven plates faster
            if (!useAppliance(sim, bId, "stove")) { npc.bubble = { text: "The oven just DIED.", until: performance.now() / 1000 + 4 }; return; }
            addStock(sim, bId, dish, batch);
            npc.lastCook = now - (hasUpgrade(sim, bId, "oven") ? 3600 / CFG.MINUTES_PER_SEC / 60 : 0);   // oven shortens the next cooldown
            npc.bubble = { text: `*plates a fresh batch of ${ITEMS[dish].name.toLowerCase()}*`, until: now + 3 };
          }
        }
      }
    }
    if (npc.activity === "tidying up" && npc.tidy) {
      const bId = npc.tidy.scene.slice(2);
      sim.mess[bId] = Math.max(0, sim.mess[bId] - CFG.MESS.npcSweepAmount);
      npc.tidy = null; npc.lastTidy = now; npc.goal = null;
    }
    /* inspection arrival: the ledger gets a look */
    if (npc.inspecting && npc.scene === `i:${npc.inspecting}`) {
      const bId = npc.inspecting; npc.inspecting = null;
      const owner = OWNERS[bId] ? sim.npcs.find(n => n.id === OWNERS[bId] && n.alive) : null;
      if (sim.mess[bId] > CFG.ETHICS.messLimit) {
        if (owner) fineCoins(owner, CFG.ETHICS.fine);
        sim.ethics.push({ bId, day: sim.day, fine: CFG.ETHICS.fine });
        npc.bubble = { text: `This is a violation. ${CFG.ETHICS.fine} coins.`, until: now + 4 };
        sim.dayLog = [...sim.dayLog, `${bld(bId).name} was fined in an inspection`].slice(-12);
      } else {
        sim.ethics.push({ bId, day: sim.day, fine: 0 });
        npc.bubble = { text: "Clean ledger. Carry on.", until: now + 3 };
      }
      npc.goal = null;
    }
    /* investigation beats: scene → suspects → (maybe) a confession. Stage 2.2:
       each beat is now a genuine async skill check (investigation ability eased
       by rank/evidence), not an RNG roll. Local caps bound the API calls: at most
       invMaxSuspects questioned, each pressed at most invMaxQuestionsPerSuspect times. */
    if (npc.caseWork) {
      const cw = npc.caseWork, kase = sim.cases.find(c => c.id === cw.caseId);
      if (kase && kase.state === "open") {
        if (cw.stage === "scene") {
          // examining the scene is a check: pass → a piece of evidence; fail → retry after cooldown
          const taskKey = `case_${kase.id}_scene`;
          if (!npc.caseChecking && !apiBusyRef.current && canAttempt(npc, taskKey, absTime)) {
            npc.caseChecking = true; apiBusyRef.current = true;
            const diffVal = checkDifficulty(npc, "office", false);   // detective work leans on clerical/analytical skill
            skillCheck(npc.name, "read a crime scene for usable evidence",
              `investigation skill, ${npc.occupation?.title || "officer"}`, diffVal)
              .then(pass => {
                if (pass) {
                  clearCheck(npc, taskKey);
                  kase.evidence = Math.min(3, kase.evidence + 1);
                  const pool = [kase.killerId, ...sim.npcs.filter(n => n.alive && (n.thief || n.wanted > 0)).map(n => n.id)]
                    .filter((id, i, a) => id && a.indexOf(id) === i)
                    .slice(0, CFG.SKILLCHECK.invMaxSuspects);        // cap suspects to bound interrogation calls
                  cw.targetId = rand(pool.length ? pool : [kase.killerId].filter(Boolean));
                  cw.stage = cw.targetId ? "interrogate" : "done";
                  if (!cw.targetId) { kase.state = "cold"; npc.caseWork = null; }
                } else { recordFail(npc, taskKey, absTime); npc.bubble = { text: "Nothing here I can use... yet.", until: now + 4 }; }
              })
              .catch(() => recordFail(npc, taskKey, absTime))
              .finally(() => { npc.caseChecking = false; apiBusyRef.current = false; npc.goal = null; });
          }
        } else if (cw.stage === "interrogate") {
          const t = cw.targetId === "player" ? sim.player : sim.npcs.find(n => n.id === cw.targetId);
          if (t && t.scene === npc.scene && dist(npc, t) < 2.2) {
            /* Stage 3.9: the ADVERSARIAL exchange. A real multi-round interrogation —
               detective asks, suspect answers — surfaced as bubbles when the player is
               present. Player suspects get a chat panel instead (handled elsewhere).
               Ends in the detective's own verdict; a wrong verdict is a wrongful conviction. */
            if (cw.targetId === "player") {
              // hand off to the player-interrogation chat panel (opens once, resolves there)
              if (!sim.interrogation) {
                sim.interrogation = { caseId: kase.id, detId: npc.id, q: 0, history: [], done: false };
                npc.bubble = { text: "Don't go anywhere. A few questions.", until: now + 4 };
              }
              npc.goal = null;   // hold position while the player answers
            } else if ((kase.interrogatedCount || 0) >= CFG.SKILLCHECK.interrogateMaxPerCase) {
              // out of interrogations for this case — it goes cold
              kase.state = "cold"; npc.caseWork = null; npc.goal = null;
              npc.bubble = { text: "Leads dried up. For now.", until: now + 4 };
            } else if (!npc.caseChecking && !apiBusyRef.current && canAttempt(npc, `case_${kase.id}_grill_${cw.targetId}`, absTime)) {
              npc.caseChecking = true; apiBusyRef.current = true;
              const ex = cw.exchange || (cw.exchange = { q: 0, history: [] });   // per-target running transcript
              const isCulprit = cw.targetId === kase.killerId;
              const resolve = clamp(50 + (t.renown || 0) - kase.evidence * 12, 10, 95);   // composure vs pressure
              const skillDesc = `${skillLabel(npc, "office")}${hasExpertise(npc, "office", "sorting") ? ", a sharp reader of people" : ""}`;
              // offset so detective & suspect never share a tile (readable bubbles)
              if (t.id && Math.round(t.x) === Math.round(npc.x) && Math.round(t.y) === Math.round(npc.y)) { npc.x += 1; }
              const mustConclude = ex.q >= CFG.SKILLCHECK.interrogateQuestions - 1;
              detectiveMove(npc.name, skillDesc, t.id ? t.name : "the player", kase.evidence, ex.q + 1, CFG.SKILLCHECK.interrogateQuestions, ex.history, mustConclude)
                .then(async move => {
                  if (move.action === "ask") {
                    npc.bubble = { text: move.say, until: now + 5 };
                    ex.history.push({ who: "det", text: move.say });
                    const reply = await suspectReply(t.name, t.personality || "guarded", isCulprit, resolve, kase.evidence, kase.victim, move.say, ex.history);
                    t.bubble = { text: reply.say, until: now + 5 };
                    ex.history.push({ who: "sus", text: reply.say });
                    ex.q += 1;
                    if (reply.cracked) {   // confessed mid-exchange
                      kase.state = "solved"; kase.suspectId = kase.killerId;
                      recordConviction(sim, kase, npc.id, cw.targetId, true);
                      convictStars(sim, t, caseStars(kase), `${t.name} confessed to the ${kase.type} (${kase.victim})`);
                      npc.dispatch = { targetId: cw.targetId };
                      sim.buzz = { text: `The Watch cracked the ${kase.victim} ${kase.type} case — a confession!`, day: sim.day };
                      npc.caseWork = null;
                    }
                  } else {
                    // detective concludes with a verdict — graded against the TRUTH
                    kase.interrogatedCount = (kase.interrogatedCount || 0) + 1;
                    npc.bubble = { text: move.say, until: now + 5 };
                    ex.history.push({ who: "det", text: move.say });
                    if (move.verdict === "accuse") {
                      kase.state = "solved"; kase.suspectId = cw.targetId;
                      recordConviction(sim, kase, npc.id, cw.targetId, isCulprit);   // isCulprit=false → WRONGFUL
                      convictStars(sim, t, caseStars(kase), `${t.name} was convicted of the ${kase.type} (${kase.victim})`);
                      npc.dispatch = { targetId: cw.targetId };
                      sim.buzz = { text: isCulprit ? `The Watch solved the ${kase.victim} case!` : `${t.name} convicted for the ${kase.victim} ${kase.type}.`, day: sim.day };
                      npc.caseWork = null;
                    } else {
                      // cleared this suspect — back to the scene to consider others
                      cw.exchange = null; cw.stage = "scene";
                      if (isCulprit) { /* the real killer walked free this round — case stays open */ }
                    }
                  }
                })
                .catch(() => recordFail(npc, `case_${kase.id}_grill_${cw.targetId}`, absTime))
                .finally(() => { npc.caseChecking = false; apiBusyRef.current = false; npc.goal = null; });
            }
          }
        }
      } else { npc.caseWork = null; npc.goal = null; }
    }
    /* legacy interrogate tail removed — Stage 3.9 adversarial exchange replaces it */
    /* visit arrival: warm hellos, maybe a small gift, then the timer runs */
    if (npc.visitPlan && npc.visitPlan.phase !== "return") {
      const vp = npc.visitPlan;
      const t = vp.targetId === "player" ? sim.player : sim.npcs.find(n => n.id === vp.targetId);
      if (t && t.scene === npc.scene && dist(npc, t) < 2.2 && !vp.arrived) {
        vp.arrived = true; vp.until = absTime + CFG.VISIT.stayMin;
        if (t.id) sim.dialogues.push({ aId: npc.id, bId: t.id, lines: [`${npc.name}: Surprise! Rode the bus all this way.`, `${t.name}: ${rand(["No way — come here!", "You DIDN'T. Ha!", "Best thing I've seen all week."])}`], idx: 0, nextAt: now });
        else showToast(`${npc.name} came all the way from ${TOWN_DEFS[npc.town].name} to see you!`);
        if (Math.random() < 0.5 && npc.coins > 8) receiveGift(sim, npc, t, { coins: 1 + Math.floor(Math.random() * 3) });
      }
      if (vp.arrived && absTime >= vp.until) vp.phase = "return";
    }
    if (npc.visitPlan?.phase === "return" && npc.scene === `t:${npc.town}`) npc.visitPlan = null;   // home again
    if (npc.crimePlan) {
      stealAttempt(sim, world, npc, npc.crimePlan.bId, npc.crimePlan.itemId, now);
      npc.crimePlan = null; npc.goal = null;
    }
    if (npc.burglaryPlan && npc.scene === `i:${npc.burglaryPlan.homeId}`) {   // Stage 4: inside — break in
      burgle(sim, world, npc, npc.burglaryPlan.homeId, npc.burglaryPlan.markId, now);
      npc.burglaryPlan = null; npc.goal = null;
    }
    if (npc.directive) directiveArrive(npc, sim, world, now);
  };

  const directiveArrive = (npc, sim, world, now) => {
    const d = npc.directive, st = d.steps[0];
    if (!st) { npc.directive = null; return; }
    const say = () => { npc.bubble = { text: d.say, until: now + CFG.BUBBLE_SECONDS }; };
    if (st.type === "goto") { say(); d.steps.shift(); }
    else if (st.type === "buy") {
      if (npcPurchase(sim, npc, findShop(st.item, npc.town), st.item)) {
        sim.dayLog = [...sim.dayLog, `${npc.name} bought ${ITEMS[st.item].name}`].slice(-12);
        if (d.steps.length === 1) say();
      }
      d.steps.shift();
    }
    else {
      const target = st.target === "player" ? sim.player : sim.npcs.find(n => n.id === st.target && n.alive);
      if (!target || target.scene !== npc.scene || dist(npc, target) > 1.8) return;
      if (st.type === "trade") {   // a walked-up trade offer: to the player it's a panel; NPC→NPC queues a considered decision
        const give = { coins: clamp(st.amount || 0, 0, CFG.TRADE.maxCoins), item: st.item && ITEMS[st.item] ? st.item : null, qty: st.item && ITEMS[st.item] ? 1 : 0 };
        const ask = { coins: clamp(st.askAmount || 0, 0, CFG.TRADE.maxCoins), item: st.askItem && ITEMS[st.askItem] ? st.askItem : null, qty: st.askItem && ITEMS[st.askItem] ? 1 : 0 };
        const note = (st.say || "").slice(0, CFG.TRADE.noteMax);
        if ((give.coins || give.item || ask.coins || ask.item) && canFulfillTrade(npc, give)) {
          if (!target.id) { setTradeOffer({ fromId: npc.id, give, ask, note }); sfx.pop(); showToast(`🤝 ${npc.name} has an offer for you.`); }
          else sim.tradeQueue.push({ fromId: npc.id, toId: target.id, give, ask, note });
        }
      }
      else if (st.type === "gift_coins") receiveGift(sim, npc, target, { coins: clamp(st.amount || 2, 1, 15) });
      else if (st.type === "gift_item" && npc.inv[st.item] > 0) receiveGift(sim, npc, target, { itemId: st.item });
      else if (st.type === "visit" && target.id) {
        sim.dialogues.push({ aId: npc.id, bId: target.id, lines: [`${npc.name}: ${d.say}`, `${target.name}: ${rand(["Ha! Good one.", "Is that so?", "You came all this way to say that?"])}`], idx: 0, nextAt: now });
      }
      say(); d.steps.shift();
    }
    if (!d.steps.length) npc.directive = null;
    npc.goal = null;
  };

  const moveNPC = (npc, world, dt) => {
    if (!npc.alive || npc.incap || npc.jailedUntil || npc.bedrest || !npc.legs.length) return;
    const leg = npc.legs[0];
    if (!npc.path.length) {
      if (Math.round(npc.x) === leg.x && Math.round(npc.y) === leg.y) {
        if (leg.tp) {
        const a = leg.scene, b = leg.tp.scene;
        if (a.startsWith("t:") && b.startsWith("t:") && a !== b && !npc.enforcer) {
          const roadsHome = sim.townUpgrades?.[a.slice(2)]?.roads ? 1 : 0;   // Stage 6: maintained roads
          const fare = Math.max(1, (CFG.FARES[a.slice(2)]?.[b.slice(2)]?.c || 0) - roadsHome) || 0;
          fineCoins(npc, fare);
        }
        npc.scene = leg.tp.scene; npc.x = leg.tp.x; npc.y = leg.tp.y;
      }
        npc.legs.shift(); return;
      }
      npc.path = findPath(sceneGrid(world, npc.scene), npc.x, npc.y, leg.x, leg.y);
      if (!npc.path.length) { npc.legs = []; return; }
    }
    const speed = CFG.NPC_SPEED * (npc.dispatch ? 1.5 : 1);       // the Watch hustles
    const t = npc.path[0], d = Math.hypot(t.x - npc.x, t.y - npc.y), step = speed * dt;
    if (d <= step) { npc.x = t.x; npc.y = t.y; npc.path.shift(); }
    else { npc.x += ((t.x - npc.x) / d) * step; npc.y += ((t.y - npc.y) / d) * step; }
    if (npc.hidden) npc.hidden = false;
  };

  /* the thief's opportunism: broke, evening, keeper missing → a plan forms */
  const thiefTick = (sim, world, npc) => {
    if (!npc.thief || npc.crimePlan || npc.directive || npc.wanted >= CFG.WANTED.arrestAt) return;
    if (npc.layLowUntil) return;                          // Stage 3.5: lying low means LOW
    const hour = (sim.time / 60) % 24;
    const onSpree = npc.spreeUntil && sim.day <= npc.spreeUntil;
    if (npc.outlaw) {                                     // Stage 3.5: Sable works a PROFESSIONAL cadence — any hour, night preferred
      sim.crime.ticks++;
      if (npc.coins >= CFG.OUTLAW.heistCoinCap && !onSpree) { sim.crime.blockedCap++; return; }
      const chance = CFG.OUTLAW.heistChance * ((hour >= 21 || hour < 5) ? 2 : 1)
        * (onSpree ? CFG.OUTLAW.spreeBoost : 1) * (npc.coins < 5 ? 1.5 : 1);   // rampage + desperation
      if (Math.random() > chance) { sim.crime.blockedRoll++; return; }
    } else if (npc.coins >= 12 || hour < 16 || hour > 21 || Math.random() > 0.004) return;
    if (!onSpree && Math.random() < CFG.OUTLAW.watchDeter &&
        sim.npcs.some(e => e.alive && e.enforcer && townOfScene(world, e.scene) === npc.town)) { sim.crime.blockedWatch++; return; }
    sim.crime.attempts++;
    // v7 Stage 4: OUTLANDS raiders don't foul their own nest — you don't rob your fence or
    // your cook. They pick a TOWN to raid and retreat past the tree line after. Danger
    // radiates OUT of the frontier; the camp's keepers stay in business.
    const crimeTown = npc.town === "outlands" ? rand(["alderbrook", "mossford", "stonecross", "ferndale"]) : npc.town;
    const shops = BUILDINGS.filter(b => b.town === crimeTown && SHOP_STOCK[b.id]);
    const target = shops.find(b => { const k = keeperOf(sim, b.id); return !k || k.scene !== `i:${b.id}`; });
    /* Stage 4: weigh a HOME BURGLARY against the shop grab. A rich mark with an empty home is
       tempting — the wealthier the target, the likelier a burglar picks the house over the till. */
    const marks = sim.npcs.filter(m => m.alive && m.home && m.id !== npc.id && bld(m.home).town === crimeTown
      && (m.stored > 8 || m.coins > 12)
      && m.scene !== `i:${m.home}`);   // resident is out of the house
    // Stage 7: wealth-WEIGHTED pick — richer marks likelier, but not deterministically the same victim
    let mark = null;
    if (marks.length) {
      const tw = marks.reduce((s, m) => s + m.stored + m.coins, 0);
      let r = Math.random() * tw;
      for (const m of marks) { if ((r -= m.stored + m.coins) <= 0) { mark = m; break; } }
      mark = mark || marks[0];
    }
    const markLoot = mark ? mark.stored + mark.coins : 0;
    // prefer the home when the loot is fat (and a coin-flip lands); else fall back to it only if no shop
    if (mark && (markLoot > 40 ? Math.random() < 0.5 : !target)) { npc.burglaryPlan = { homeId: mark.home, markId: mark.id }; return; }
    if (target) { npc.crimePlan = { bId: target.id, itemId: rand(SHOP_STOCK[target.id]) }; return; }
    if (mark) npc.burglaryPlan = { homeId: mark.home, markId: mark.id };
  };
  /* Stage 4: execute a burglary the thief has walked to. The storage tier gates the crack via
     the same tierSuccess model as cooking/printer. Success skims burglaryYield of the loot;
     if unwitnessed it still opens a case (the emptied store is discovered) → the interrogation
     pipeline can chase it. */
  const burgle = (sim, world, npc, homeId, markId, now) => {
    const mark = sim.npcs.find(n => n.id === markId);
    if (!mark || !mark.alive) return;
    const store = mark.furniture?.includes("safe") ? "safe" : mark.furniture?.includes("piggy") ? "piggy" : "onhand";
    const tier = CFG.FURN.burglarStoreTier[store];                 // 1 Simple / 2 Hard / 3 Extreme
    // witnessed if anyone else is inside the home when it's hit
    const witnessed = sim.npcs.some(w => w.alive && w.id !== npc.id && w.scene === `i:${homeId}`);
    if (Math.random() < tierSuccess(npc, tier, "office", null)) {  // cracking leans on the thief's guile (office/analytical)
      const pool = store === "onhand" ? mark.coins : mark.stored;
      const took = Math.floor(pool * CFG.FURN.burglaryYield);
      if (store === "onhand") mark.coins -= took; else mark.stored -= took;
      npc.coins += took;
      npc.bubble = { text: "*pockets it and slips out*", until: now + 3 };
      // a discovered burglary opens a case even if unwitnessed (empty safe gets noticed)
      openCase(sim, "burglary", { victim: mark.name, scene: `i:${homeId}`, x: bld(homeId).door.x, y: bld(homeId).door.y,
        killerId: npc.id, state: "open", evidence: witnessed ? 1 : 0 });
      sim.dayLog.push(`${mark.name}'s home was burgled${witnessed ? " — someone saw it" : ""}`);
      if (witnessed) convictStars(sim, npc, 2, `${npc.name} was seen burgling a home`);
    } else {
      npc.bubble = { text: rand(["*the lock won't give*", "*too risky — bails*", "*fumbles, curses, flees*"]), until: now + 3 };
    }
  };

  /* =================== API dispatch: pulse + nudges =================== */
  const tryPulse = (sim, world, townId) => {
    if (!sim.settings.pulse || apiBusyRef.current) return;
    if (sim.pulseDay[townId] === sim.day || (sim.time / 60) % 24 < 6) return;
    sim.pulseDay[townId] = sim.day;
    const town = world.towns[townId];
    // skip exempt NPCs (owners + authority) already handled by today's all-town pulse (no double-call)
    const townNpcs = sim.npcs.filter(n => n.alive && n.town === townId && !(exemptPulse(n) && sim.ownerPulseDay === sim.day));
    const byId = Object.fromEntries(sim.npcs.map(n => [n.id, n]));
    const tier = fameTier(sim.player.fame, sim.player.renown);
    if (!townNpcs.length) return;                          // nothing left to pulse here today
    apiBusyRef.current = true;
    dailyPulse(town, townNpcs, sim.dayLog, byId, tier).then(out => {
      for (const n of townNpcs) {
        const plan = out.npcs?.[n.id]; if (!plan) continue;
        n.intent = plan.intent || null; n.mood = plan.mood || n.mood;
        n.pulseSpot = town.spots[plan.spot] ? plan.spot : null;
      }
      (out.encounters || []).slice(0, 2).forEach((e, i) => {
        if (byId[e.a]?.alive && byId[e.b]?.alive) sim.encounters.push({ ...e, hour: 10 + i * 4 + Math.random() * 2, done: false, town: townId });
      });
      for (const d of (out.drift || []).slice(0, 2)) {
        const a = byId[d.a]; if (!a || !byId[d.b]) continue;
        const cur = REL_ORDER.indexOf(a.relationships[d.b] || "neutral");
        a.relationships[d.b] = REL_ORDER[clamp(cur + (d.change === "warmer" ? 1 : -1), 0, REL_ORDER.length - 1)];
      }
      sim.dayLog = [];
    }).catch(() => { /* local brains carry the day */ })
      .finally(() => { apiBusyRef.current = false; });
  };

  /* Stage 2.2 (rule finalized 2.3): ADDITIVE all-town EXEMPT pulse. The daily
     pulse follows the player, but two groups always pulse wherever the player
     is: business owners AND authority figures (Watch + doctors; + mayor flag
     once he has levers). Keyed by ROLE FLAGS, never a name list, so future
     watch/clinic staff inherit the exemption automatically. One lean call
     covering the whole exempt roster; everyone else pulses via their town's
     tryPulse only while the player is home. */
  const exemptPulse = (n) => (n.occupation?.owner && n.occupation?.bId) || n.enforcer || n.doctor;
  const tryOwnerPulse = (sim, world) => {
    if (!sim.settings.pulse || apiBusyRef.current) return;
    if (sim.ownerPulseDay === sim.day || (sim.time / 60) % 24 < 6) return;
    const owners = sim.npcs.filter(n => n.alive && exemptPulse(n));
    if (!owners.length) { sim.ownerPulseDay = sim.day; return; }
    sim.ownerPulseDay = sim.day;
    const byId = Object.fromEntries(sim.npcs.map(n => [n.id, n]));
    const tier = fameTier(sim.player.fame, sim.player.renown);
    // pulse owners against the PLAYER's town context (a neutral shared frame); their
    // own intents/moods still apply to them individually wherever they live.
    const frameTown = world.towns[townOfScene(world, sim.player.scene)] || Object.values(world.towns)[0];
    apiBusyRef.current = true;
    dailyPulse(frameTown, owners, sim.dayLog, byId, tier).then(out => {
      for (const n of owners) {
        const plan = out.npcs?.[n.id]; if (!plan) continue;
        n.intent = plan.intent || null; n.mood = plan.mood || n.mood;
        n.pulseSpot = world.towns[n.town].spots[plan.spot] ? plan.spot : null;   // resolve spot in the owner's OWN town
      }
    }).catch(() => { /* owners fall back to local routines */ })
      .finally(() => { apiBusyRef.current = false; });
  };

  const tryNudge = (sim, world, townId) => {
    if (!sim.settings.pulse || apiBusyRef.current || !sim.dayLog.length) return;
    const hour = (sim.time / 60) % 24;
    const active = CFG.NUDGE_HOURS.slice(0, sim.settings.nudges);
    const nd = sim.nudgeDone[townId]?.day === sim.day ? sim.nudgeDone[townId] : { day: sim.day, slots: CFG.NUDGE_HOURS.map(() => false) };
    const slot = active.findIndex((h, i) => hour >= h && !nd.slots[i]);
    if (slot < 0) return;
    nd.slots[slot] = true; sim.nudgeDone[townId] = nd;
    const town = world.towns[townId];
    const townNpcs = sim.npcs.filter(n => n.alive && n.town === townId);
    const byId = Object.fromEntries(sim.npcs.map(n => [n.id, n]));
    apiBusyRef.current = true;
    microNudge(town, townNpcs, sim.dayLog, byId, fameTier(sim.player.fame, sim.player.renown)).then(out => {
      for (const nd2 of (out.nudges || []).slice(0, 3)) {
        const npc = byId[nd2.npc]; if (!npc?.alive || npc.town !== townId) continue;
        const steps = [];
        if (nd2.do === "goto" && town.spots[nd2.spot]) steps.push({ type: "goto", spot: nd2.spot });
        else if (nd2.do === "buy" && ITEMS[nd2.item] && findShop(nd2.item, townId)) steps.push({ type: "buy", item: nd2.item });
        else if (nd2.do === "gift_coins" && nd2.target) steps.push({ type: "gift_coins", target: nd2.target, amount: nd2.amount });
        else if (nd2.do === "trade" && nd2.target) steps.push({ type: "trade", target: nd2.target, item: nd2.item, amount: nd2.amount, askItem: nd2.askItem, askAmount: nd2.askAmount, say: nd2.say });
        else if (nd2.do === "gift_item" && ITEMS[nd2.item] && nd2.target) {
          if (!(npc.inv[nd2.item] > 0) && findShop(nd2.item, townId)) steps.push({ type: "buy", item: nd2.item });
          steps.push({ type: "gift_item", target: nd2.target, item: nd2.item });
        }
        else if (nd2.do === "visit" && nd2.target) steps.push({ type: "visit", target: nd2.target });
        else if (nd2.do === "send_letter" && nd2.target) { sendLetter(sim, npc.id, nd2.target, String(nd2.say || "Thinking of you.").slice(0, 90)); continue; }
        else if (nd2.do === "throw_party" && npc.coins >= 30) { throwParty(sim, world, npc, rand(PARTY_MENU.dinner), rand(PARTY_MENU.dessert), "cider"); continue; }
        if (steps.length) npc.directive = { steps, say: nd2.say || "..." };
      }
    }).catch(() => { /* skipped nudge, nothing lost */ })
      .finally(() => { apiBusyRef.current = false; sim.forceChatter = townId; });   // Stage 6: a guaranteed exchange rides the nudge
  };

  /* =================== NPC↔NPC chatter =================== */
  /* Stage 6: what (if anything) is worth an AI-driven exchange between a and b right now.
     Pulls from their relationship, recent memories, and the day's events. null = nothing notable
     (skip the call, let the local templated chatter handle routine hums). */
  const ambientContext = (sim, a, b, rumor = null) => {
    const bits = [];
    if (rumor) bits.push(`${a.name} has JUST heard news to share: ${rumor.text}`);   // Stage 6: gossip leads
    const rel = a.relationships[b.id] || b.relationships[a.id];
    if (rel && rel !== "neutral") bits.push(`${a.name} ${rel} ${b.name}`);
    const mem = (a.memories || []).slice(-2);
    if (mem.length) bits.push(`recent on ${a.name}'s mind: ${mem.join("; ")}`);
    // a shared third person both have an opinion about (gossip fuel)
    const third = sim.npcs.find(n => n.alive && n.id !== a.id && n.id !== b.id && a.relationships[n.id] && b.relationships[n.id]);
    if (third) bits.push(`both know ${third.name} (${a.name}: ${a.relationships[third.id]}, ${b.name}: ${b.relationships[third.id]})`);
    // a fresh town event
    const ev = (sim.dayLog || []).slice(-1)[0];
    if (ev && Math.random() < 0.5) bits.push(`around town today: ${ev}`);
    if (!bits.length) return null;                        // nothing notable → don't spend a call
    return bits.join(". ");
  };

  const rollChatter = (sim, world, now) => {
    if (now - sim.lastChatter < CFG.NPC_CHAT_INTERVAL) return;
    sim.lastChatter = now;
    const scene = sim.player.scene;
    const here = sim.npcs.filter(n => n.alive && !n.incap && n.scene === scene && !n.hidden && !n.activity.includes("sleep"));
    for (let i = 0; i < here.length; i++) for (let j = i + 1; j < here.length; j++) {
      const a = here[i], b = here[j];
      if (dist(a, b) > 2.2 || sim.dialogues.some(d => [d.aId, d.bId].includes(a.id) || [d.aId, d.bId].includes(b.id))) continue;
      const enc = sim.encounters.find(e => !e.done && ((e.a === a.id && e.b === b.id) || (e.a === b.id && e.b === a.id)));
      // Stage 6: occasionally, an AI-driven exchange instead of a templated one — when there's
      // something notable between them and we're under the hourly cap. Cheap, serialized, sprinkled.
      const hr = Math.floor(sim.time / 60);
      if (sim.ambientHour !== hr) { sim.ambientHour = hr; sim.ambientCount = 0; }
      // Stage 6: gossip transfers when they talk — speaker passes fresh news to the listener
      const rumor = spreadGossip(sim, a, b);
      const forced = sim.forceChatter && a.town === sim.forceChatter;
      if (!enc && !apiBusyRef.current && sim.ambientCount < CFG.AMBIENT.maxPerHour && (forced || Math.random() < CFG.AMBIENT.chatChance)) {
        if (forced) sim.forceChatter = null;   // consume the one guaranteed exchange
        const ctx = ambientContext(sim, a, b, rumor) || (forced ? `${a.name} and ${b.name} pass the time — small talk about the day around town.` : null);
        if (ctx) {
          sim.ambientCount++; apiBusyRef.current = true;
          ambientChat(a, b, ctx)
            .then(out => {
              if (out) {
                sim.dialogues.push({ aId: a.id, bId: b.id, lines: [`${a.name}: ${out.a}`, `${b.name}: ${out.b}`], idx: 0, nextAt: performance.now() / 1000 });
                sim.dayLog.push(`${a.name} and ${b.name} chatted`);
              }
            })
            .catch(() => {})
            .finally(() => { apiBusyRef.current = false; });
          return;   // this pairing is handled (async)
        }
      }
      let lines;
      if (rumor) {   // Stage 6: a fresh rumor gets aired even in local (non-AI) chatter
        lines = [`${a.name}: Did you hear? ${rumor.text[0].toUpperCase() + rumor.text.slice(1)}.`,
                 `${b.name}: ${rumor.bad ? "...that's not good." : "Huh. Word travels."}`];
      } else if (enc) { lines = enc.lines.slice(0, 4); enc.done = true; sim.dayLog.push(`${a.name} and ${b.name} met up`); }
      else if (Math.random() < 0.5) {
        const st = a.relationships[b.id] || b.relationships[a.id] || "neutral";
        lines = rand(CHATTER[st]).map(l => l
          .replace("{a}", a.name).replace("{b}", b.name)
          .replace("{aLike}", rand(a.likes)).replace("{bDislike}", rand(b.dislikes)));
      } else continue;
      sim.dialogues.push({ aId: a.id, bId: b.id, lines, idx: 0, nextAt: now });
      return;
    }
  };

  const playDialogues = (sim, now) => {
    const activeScenes = new Set();   // Stage 6: one live conversation per scene — no overlapping bubbles
    sim.dialogues = sim.dialogues.filter(d => {
      if (now < d.nextAt) { if (d.idx > 0) activeScenes.add(d.scene); return true; }   // mid-conversation holds its scene
      if (d.idx >= d.lines.length) return false;
      const a = sim.npcs.find(n => n.id === d.aId);
      const scene = d.scene || a?.scene || "?";
      if (d.idx === 0 && activeScenes.has(scene)) return true;   // another convo is playing here — wait our turn
      activeScenes.add(scene); d.scene = scene;
      const line = d.lines[d.idx];
      const name = line.split(":")[0].trim();
      const speaker = sim.npcs.find(n => n.name === name) || sim.npcs.find(n => n.id === (d.idx % 2 === 0 ? d.aId : d.bId));
      if (speaker?.alive) { speaker.bubble = { text: line.slice(line.indexOf(":") + 1).trim(), until: now + 3.2 }; if (speaker.scene === simRef.current.player.scene) sfx.pop(); }
      d.idx++; d.nextAt = now + 2.6;
      return true;
    });
  };

  /* =================== SUPPLY, MAIL & OCCASIONS =================== */
  /* runs once per dawn: overnight mail lands, freight arrives, owners
     inventory their shelves and order what's low (wholesale billed now —
     debt possible — delivery fee billed on arrival), visits get rolled */
  /* Stage 2.1: between dawn reorders, chase demand. Any tracked shop item that's
     both LOW on the shelf and seeing recent sales gets an expedited order through
     the same freight pipe (wholesale billed up front, delivery on arrival). Keeps
     hot products from sitting sold-out all day. Returns count of orders placed. */
  const expediteRestock = (sim) => {
    let placed = 0;
    // Stage 3.6: keep eatery pantries from starving a town — if a meal runs low and no
    // chef is currently cooking it here, civic-restock a few plates (kitchens still cook
    // the premium menu; this is the safety floor for the base meal only).
    for (const [bId, meal] of Object.entries(EATERY_MEAL)) {
      if (stockOf(sim, bId, meal) <= 2 && !sim.npcs.some(n => n.alive && n.work?.bId === bId && n.activity?.includes("plating")))
        if (!useAppliance(sim, bId, "stove")) return;
        addStock(sim, bId, meal, 6);
    }
    // Stage 3.7: visit every shop that has a menu OR recent demand — a brand-new shop with zero
    // sales has no demand entry yet, but still needs its initial fill (handled in the body below).
    const restockShops = new Set([...Object.keys(sim.demand || {}), ...Object.keys(sim.menu || {})]);
    for (const bId of restockShops) {
      const items = sim.demand?.[bId] || {};
      if (!SHOP_STOCK[bId]) continue;
      const ownerId = OWNERS[bId];
      const owner = ownerId ? ownerEnt(sim, bId) : null;    // resolves the player too — their shops restock like anyone's
      if (ownerId && !owner?.alive) continue;               // no owner, no reorder
      const need = {};
      for (const [it, sold] of Object.entries(items)) {
        if (KITCHEN[bId]?.includes(it)) continue;           // kitchens cook their own
        // hot item (recent sales) sitting at/below the demand-low shelf line
        if (sold > 0 && stockOf(sim, bId, it) <= CFG.SELFCARE.demandLow) need[it] = CFG.SELFCARE.demandReorderQty;
      }
      // Stage 3.7: INITIAL FILL — a menu item that's never been stocked has zero sales and would
      // never trip the demand line above, so its shelf would stay empty forever. Bootstrap it: any
      // menu item at 0 stock (non-cooked) gets a first delivery regardless of demand.
      for (const it of Object.keys(sim.menu?.[bId] || {})) {
        if (KITCHEN[bId]?.includes(it)) continue;           // the chef stocks cooked goods
        if (stockOf(sim, bId, it) <= 0 && need[it] == null) need[it] = CFG.SELFCARE.demandReorderQty;
      }
      if (!Object.keys(need).length) continue;
      // don't double-order: skip items already inbound for this shop
      const inbound = sim.orders.filter(o => o.bId === bId && o.state !== "delivered")
        .flatMap(o => Object.keys(o.items));
      for (const it of inbound) delete need[it];
      for (const it of Object.keys(need)) if (!ITEMS[it]) delete need[it];   // Stage 4: never restock furniture/non-items
      if (!Object.keys(need).length) continue;
      const goods = Math.ceil(Object.entries(need).reduce((s, [it, q]) => s + ITEMS[it].price * q, 0) * CFG.STOCK.wholesale);
      if (owner) fineCoins(owner, goods);                   // wholesale billed up front (debt possible)
      sim.orders.push({ id: `${bId}_exp_${sim.day}_${Math.floor(sim.time)}`, bId, items: need, state: "ready", day: sim.day });
      placed++;
    }
    return placed;
  };
  const dailyTick = (sim, world) => {
    // Stage 2.1: recent-demand fades so restock chases CURRENT buying, not history
    for (const bId of Object.keys(sim.demand || {}))
      for (const it of Object.keys(sim.demand[bId])) {
        sim.demand[bId][it] = Math.floor(sim.demand[bId][it] * CFG.SELFCARE.demandDecay);
        if (sim.demand[bId][it] <= 0) delete sim.demand[bId][it];
      }
    for (const L of sim.letters) if (L.state !== "delivered") deliverLetter(sim, L);
    sim.letters = sim.letters.filter(l => sim.day - l.day < 3);
    // Stage: the night truck only runs if the Landwide Postal Service has someone alive to run it.
    // Kill every courier (Pete + hires) and the mail STOPS — shops can't restock, the town starves.
    // Don't shoot the mailman: they're the ones floating everyone's boat.
    const postalStaff = sim.npcs.filter(n => n.alive && n.work?.bId === "post");
    if (postalStaff.length) {
      for (const o of sim.orders) if (o.state === "ready") fulfillOrder(sim, o, null);   // the service catches strays overnight
    } else if (sim.orders.some(o => o.state === "ready") && !sim.mailStalledNoted) {
      sim.mailStalledNoted = true;
      sim.buzz = { text: "No one's left to run the mail — deliveries have STOPPED. Shelves are going bare.", day: sim.day };
      sim.dayLog.push("The Landwide Postal Service has no living staff — the mail has stopped");
    }
    if (postalStaff.length) sim.mailStalledNoted = false;
    sim.orders = sim.orders.filter(o => o.state !== "delivered");
    for (const [bId, ownerId] of Object.entries(OWNERS)) {
      if (!SHOP_STOCK[bId] && bId !== "hospital" && !bId.startsWith("clinic")) continue;
      const owner = ownerId ? ownerEnt(sim, bId) : null;   // resolves the player too — their shops restock like anyone's
      if (ownerId && !owner?.alive) continue;             // a dead owner orders nothing (grim, but true)
      const list = bId === "hospital" ? ["medicine", "bandage"] : bId.startsWith("clinic") ? ["medicine"] : SHOP_STOCK[bId];
      const need = {};
      for (const it of list) {
        if (KITCHEN[bId]?.includes(it)) continue;         // kitchens cook their own
        if (stockOf(sim, bId, it) <= CFG.STOCK.low) {
          // Stage 3.8: cap drink resupply at non-café shops (water & the cafés stay full) so The
          // Grindstone (and Marge's) are the real drink hubs.
          const isCafe = bId === "cafe" || bId === "cafe_s";
          const drinkNerfed = ITEMS[it]?.cat === "drink" && it !== "water" && !isCafe;
          const baseQty = CFG.STOCK.orderQty + (hasUpgrade(sim, bId, "restock") ? Math.ceil(CFG.STOCK.orderQty * 0.5) : 0);   // Stage 5: bulk deal
          need[it] = Math.max(2, baseQty - (drinkNerfed ? CFG.STOCK.drinkNerf : 0));
        }
      }
      for (const it of Object.keys(need)) if (!ITEMS[it]) delete need[it];   // Stage 4: never restock furniture
      if (!Object.keys(need).length) continue;
      const goods = Math.ceil(Object.entries(need).reduce((s, [it, q]) => s + ITEMS[it].price * q, 0) * CFG.STOCK.wholesale);
      if (owner) fineCoins(owner, goods);                 // wholesale billed up front
      sim.orders.push({ id: `${bId}_${sim.day}`, bId, items: need, state: "ready", day: sim.day });
    }
    /* ===== Stage 3: the cost of living ===== */
    // business bills — every BILLS.cycle days, out of the owner's pocket, into the local hall safe.
    // Debt is allowed and MEANT to hurt: an underwater owner already stalls restocking and hiring.
    if (sim.day % CFG.BILLS.cycle === 0) {
      for (const [bId, kind] of Object.entries(CFG.BILLS.kindOf)) {
        const ownerId = OWNERS[bId]; if (!ownerId) continue;               // civic buildings are the treasury's problem
        const owner = sim.npcs.find(n => n.id === ownerId && n.alive); if (!owner) continue;
        /* NO HALL, NO BILLS. sim.approval is the civic registry; the Outlands (and the hills)
           are absent from it by design — no council, no treasury, no services. Billing them
           weekly charged Mara into -1519 coins by day 14 (a void with no hall to receive it).
           Lawless means lawless in BOTH directions. */
        if (sim.approval?.[bld(bId).town] == null) continue;
        const due = CFG.BILLS.kind[kind] + furnitureUpkeep(bId);           // Stage 4: furniture upkeep surcharges the bill
        fineCoins(owner, due); payTreasury(sim, bld(bId).town, due);
        if (owner.coins < 0) sim.dayLog.push(`${owner.name} is underwater on the ${bld(bId).name} bills`);
      }
    }
    // Stage 4: weekly business tax — a cut of the period's gross takings, out of the owner's
    // pocket (debt allowed, same as bills), into the LOCAL hall safe. An owner with several
    // shops pays ONCE on their combined gross; the accumulator resets for the new period.
    if (sim.day % 7 === CFG.TAX.weekday) {
      const taxed = new Set();
      for (const bId of Object.keys(OWNERS)) {
        const ownerId = OWNERS[bId]; if (!ownerId || taxed.has(ownerId)) continue;
        if (sim.approval?.[bld(bId).town] == null) continue;   // no hall, no tax collector (the camp pays nobody)
        const ent = ownerEnt(simRef.current, bId); if (!ent) continue;
        taxed.add(ownerId);
        const gross = ent.grossThisPeriod || 0; if (gross <= 0) continue;
        const due = Math.max(CFG.TAX.min, Math.ceil(gross * (sim.taxRate ?? CFG.TAX.rate)));   // the mayor sets the rate
        fineCoins(ent, due); payTreasury(sim, bld(bId).town, due);
        ent.grossThisPeriod = 0;
        if (ownerId === "player") showToast(`💸 Business tax: ${due}c on ${gross}c of takings.`);
        else sim.dayLog.push(`${ent.name} paid ${due}c business tax`);
      }
    }
    /* THE OUTLANDS TRADE (dawn): four residents selling to each other is not an economy.
       Probed to day 16: Mara reached -9 coins by day 11 and the keepers slid into debt with
       full shelves, because no outside money ever entered the camp. Now the route runs both
       ways — runners come up the trail overnight, buy contraband and hot food, and leave
       coin. Scaled to what's actually on the shelf, so the camp still has to run its shops. */
    if (sim.day > 1) {
      for (const [bId9, kind9] of [["blackmarket_o", "contraband"], ["grill_o", "hot food"]]) {
        const keeper = ownerEnt(sim, bId9);
        if (!keeper?.alive || keeper.jailedUntil) continue;
        const shelf = Object.values(sim.stock?.[bId9] || {}).reduce((s, v) => s + v, 0);
        if (shelf < 3) continue;                                    // empty shelf earns nothing
        const take = CFG.OUTLANDS.tradeBase + Math.floor(Math.random() * CFG.OUTLANDS.tradeVar);
        keeper.coins = Math.min(9999, keeper.coins + take);
        keeper.grossThisPeriod = (keeper.grossThisPeriod || 0) + take;   // real income; the ledger sees it
        for (const it of Object.keys(sim.stock[bId9] || {}))             // the runners take goods away
          if (sim.stock[bId9][it] > 0 && Math.random() < 0.5) sim.stock[bId9][it]--;
        if (Math.random() < 0.35) sim.dayLog.push(`runners came up the trail overnight — ${keeper.name} moved some ${kind9}`);
      }
    }
    // v7 Stage 5c: MECHANIC WORK — any able NPC takes a broken appliance for good profit.
    // Hefty time and energy (they're on it for a couple of hours); the part comes from the
    // workshop's shelf when there is one — otherwise the job waits a day on the order.
    /* v7: repairs are VISIBLE — dawn only ASSIGNS. The fixer collects the part at the
       workshop shelf (reserved here as rec.partReady, so a save/load can't double-bill),
       then WALKS to the appliance and works it for real (the repairJob branch in decideNPC:
       stand at the station ~100 game-min, "fixing the oven at…", then paid on the spot). */
    for (const [key, rec] of Object.entries(sim.appliances || {})) {
      if (!rec.broken || rec.playerJob || rec.assigned) continue;
      const [bId9] = key.split(":"), st9 = key.split(":")[1];
      const ownerId = OWNERS[bId9];
      if (ownerId === "player") continue;                       // your shop, your problem
      const owner = sim.npcs.find(n => n.id === ownerId && n.alive);
      const fee = CFG.REPAIR.fee[st9] || 20;
      if (!owner || owner.coins < fee) continue;                // broke owners live with it
      const fixer = sim.npcs.find(n => n.alive && !n.jailedUntil && !n.incap && !n.dying && !n.repairJob && n.id !== ownerId && !n.enforcer && n.energy > 40 && n.town === bld(bId9)?.town);
      if (!fixer) continue;
      const part = CFG.REPAIR.parts[st9];
      if (!rec.partReady) {
        if (stockOf(sim, "workshop_s", part) > 0) {
          sim.stock.workshop_s[part]--;                         // the workshop sells the part — this is the POINT
          creditOwner(sim, "workshop_s", ITEMS[part].price);
          rec.partReady = true;
        } else if (!rec.waited) { rec.waited = true; sim.dayLog.push(`the ${st9} repair at ${bld(bId9).name} waits on a part from the workshop`); continue; }
        else continue;
      }
      rec.assigned = true;
      fixer.repairJob = { bId: bId9, st: st9, fee, ownerId, startedAt: null };
      sim.dayLog.push(`${fixer.name} took the ${st9} repair job at ${bld(bId9).name}`);
    }
    // the wright's letters: paid-for notes go out the morning a commission is ready
    for (const c of (sim.contracts || [])) {
      if (c.letter && !c.letterSent && sim.day >= c.readyDay) {
        c.letterSent = true;
        const r = CFG.CRAFT.recipes[c.recipeId], thing = r?.furn ? FURNITURE[c.recipeId] : ITEMS[c.recipeId];
        showToast(`📬 A letter from Garrick's Works: your ${thing?.name || c.recipeId} is ready.`);
        sfx.pop();
      }
    }
    // THE CAT-AND-MOUSE CYCLE (dawn): warrants chase stars, the jailed plot escapes,
    // and the released either go straight or come out MEANER.
    for (const n of sim.npcs) {
      if (!n.alive) { n._wasJailed = false; continue; }
      // (a) reform-on-release: detect the jailed→free transition wherever release happens
      if (n._wasJailed && !n.jailedUntil) {
        n.timesJailed = (n.timesJailed || 0) + 1;
        if (n.outlaw && Math.random() < CFG.OUTLAW.reformBase + CFG.OUTLAW.reformPer * (n.timesJailed - 1)) {
          n.outlaw = false; n.wanted = 0;
          n.memories = [...n.memories, "That cell changed me. Never again."].slice(-CFG.MAX_MEMORIES);
          sim.dayLog.push(`${n.name} walked out of the cells swearing to go straight`);
        } else if (n.outlaw) {
          n.spreeUntil = sim.day + 1;   // bitter, and right back to it
          n.memories = [...n.memories, "They caged me. They'll pay for that."].slice(-CFG.MAX_MEMORIES);
          sim.dayLog.push(`${n.name} is back on the street — and doesn't look reformed`);
        }
      }
      // (b) jailbreak: a caged outlaw rolls the dice every dawn
      if (n.jailedUntil && n.outlaw && Math.random() < CFG.OUTLAW.jailbreakChance) {
        const cellB = n.scene?.startsWith("i:") ? bld(n.scene.slice(2)) : null;
        if (cellB?.door) {
          n.jailedUntil = null; n.wanted = Math.min(5, (n.wanted || 0) + 1);
          n.spreeUntil = sim.day + CFG.OUTLAW.spreeDays;
          n.scene = `t:${cellB.town}`; n.x = cellB.door.x; n.y = cellB.door.y;
          n.legs = []; n.path = []; n.goal = null; n.activity = "on the run";
          n.bubble = { text: rand(["Can't hold ME.", "Sloppy locks.", "Tell Cole I said hi."]), until: performance.now() / 1000 + 5 };
          seedGossip(sim, sim.npcs.filter(o => o.alive && o.town === cellB.town).slice(0, 5), { text: `${n.name} BROKE OUT of the ${cellB.name} cells`, subjectId: n.id, bad: true });
          sim.dayLog.push(`${n.name} broke out of the cells — the Watch is furious`);
          sim.crime.jailbreaks = (sim.crime.jailbreaks || 0) + 1;
          if (townOfScene(worldRef.current, sim.player.scene) === cellB.town) { sfx.alert(); showToast(`🚨 ${n.name} has broken out of the cells!`); }
        }
      }
      // (c) warrants: stars ≥ 2 put a hunter on you (the pursuit the ledger was missing)
      if (!n.jailedUntil && (n.wanted || 0) >= 2) {
        const hunter = sim.npcs.find(e => e.alive && e.enforcer && !e.dispatch && e.id !== n.id);
        if (hunter) { hunter.dispatch = { targetId: n.id }; sim.crime.warrants = (sim.crime.warrants || 0) + 1; }
      }
      n._wasJailed = !!n.jailedUntil;
    }
    /* THE MORNING LEDGER REVIEW — the Watch actually reads its case board every day.
       Reported and witnessed crimes all land as cases; each free detective is handed the
       oldest unworked one, and cold cases get fresh eyes every few days (twice, then they
       stay cold for good). No more crimes rotting on the board for in-game weeks. */
    {
      for (const c of sim.cases) {
        if (c.state === "cold" && sim.day - (c.lastLook || c.day) >= 3 && (c.reopens || 0) < 2) {
          c.state = "open"; c.reopens = (c.reopens || 0) + 1; c.lastLook = sim.day;
          delete c.interrogatedCount;                     // fresh eyes get fresh interviews
          sim.dayLog.push(`the Watch reopened the ${c.type} case (${c.victim || "unknown"})`);
        }
      }
      const dets = sim.npcs.filter(n => n.alive && n.enforcer && !n.jailedUntil && !n.incap);
      const workedIds = new Set(dets.map(d => d.caseWork?.caseId).filter(Boolean));
      const board = sim.cases.filter(c => c.state === "open" && !workedIds.has(c.id));
      for (const det of dets) {
        if (det.caseWork || !board.length) continue;
        const c = board.shift();
        det.caseWork = { caseId: c.id, stage: "scene" };
        c.lastLook = sim.day;
        det.bubble = { text: rand(["Case board first. Then coffee.", `The ${c.type} file. Today.`, "Somebody saw something."]), until: performance.now() / 1000 + 5 };
      }
      const stillOpen = sim.cases.filter(c => c.state === "open").length;
      if (stillOpen) sim.dayLog.push(`the Watch reviewed the case board — ${stillOpen} open case${stillOpen === 1 ? "" : "s"}`);
    }
    // Pass 4: a seated mayor — on a fresh file (or after a mayor's death) a plausible
    // candidate takes the chair. More citizens = a deeper bench. Odell is A candidate, not THE mayor.
    if (!sim.playerMayor && !sim.npcs.some(n => n.mayor && n.alive)) {
      const cands = sim.npcs.filter(n => n.alive && n.renown >= 15 && !n.enforcer && !n.doctor && !n.outlaw && !n.thief && !n.minor && n.home && !n.jailedUntil);
      const seat = cands.length ? cands[Math.floor(Math.random() * cands.length)] : sim.npcs.find(n => n.id === "odell" && n.alive);
      if (seat) {
        seat.mayor = true;
        sim.dayLog.push(`${seat.name} was seated as mayor`);
        seedGossip(sim, sim.npcs.filter(n => n.alive && n.town === seat.town).slice(0, 5), { text: `${seat.name} took the mayor's chair`, subjectId: null, bad: false });
      }
    }
    /* ===== ELECTION DAY — every two weeks the valley votes =====
       Candidates: the incumbent, the two most renowned upstanding citizens, and the player
       if they registered at a hall (the incumbent player auto-runs). Every adult votes from
       relationships, reputation, and — for incumbents — how the towns actually feel. */
    sim.election = sim.election || { nextDay: CFG.ELECTION.firstDay, playerRunning: false, last: null };
    if (sim.day >= sim.election.nextDay) {
      const el = sim.election;
      const incumbent = sim.npcs.find(n => n.mayor && n.alive);
      const bench = sim.npcs.filter(n => n.alive && n.renown >= 12 && !n.outlaw && !n.thief && !n.minor && !n.enforcer && n.home && !n.jailedUntil && !n.mayor)
        .sort((a, b) => b.renown - a.renown).slice(0, 2);
      const cands = [...new Set([incumbent, ...bench].filter(Boolean))];
      const playerRuns = (el.playerRunning || sim.playerMayor) && !sim.player.jailedUntil && sim.player.alive !== false;
      const options = [...cands.map(c => c.id), ...(playerRuns ? ["player"] : [])];
      if (options.length) {
        const votes = {};
        const relScore = { hates: -8, dislikes: -4, neutral: 0, likes: 4, friend: 8 };
        for (const v of sim.npcs) {
          if (!v.alive || v.minor) continue;
          let best = null, bestScore = -1e9;
          for (const oid of options) {
            const c = oid === "player" ? sim.player : cands.find(x => x.id === oid);
            let s = Math.random() * 8 + (c.fame || 0) / 4 + (c.renown || 0) / 6;
            s += relScore[v.relationships[oid] || "neutral"] || 0;
            if (oid === "player" ? sim.playerMayor : c.mayor) s += (sim.approval[v.town] ?? 60) / 10 - 6;   // incumbents live and die on approval
            if ((c.wanted || 0) > 0) s -= 10;
            if (s > bestScore) { bestScore = s; best = oid; }
          }
          votes[best] = (votes[best] || 0) + 1;
        }
        const tally = Object.entries(votes).sort((a, b) => b[1] - a[1]);
        const winId = tally[0][0];
        for (const n of sim.npcs) n.mayor = false;
        sim.playerMayor = winId === "player";
        const winNpc = sim.playerMayor ? null : cands.find(c => c.id === winId);
        if (winNpc) winNpc.mayor = true;
        const winnerName = sim.playerMayor ? "the player" : winNpc?.name || "nobody";
        el.last = { day: sim.day, tally: tally.map(([id, v]) => ({ id, name: id === "player" ? "You" : cands.find(c => c.id === id)?.name || id, votes: v })) };
        el.playerRunning = false;
        el.nextDay = sim.day + CFG.ELECTION.everyDays;
        sim.dayLog.push(`ELECTION DAY — ${winnerName} won the mayoralty (${tally[0][1]} votes)`);
        sim.buzz = { text: `Election day! ${winnerName === "the player" ? "The NEWCOMER" : winnerName} takes the mayor's chair.`, day: sim.day };
        seedGossip(sim, sim.npcs.filter(n => n.alive).slice(0, 6), { text: `${winnerName} won the election`, subjectId: null, bad: false });
        if (sim.playerMayor) { repEvent(sim, sim.player, 10, 15, "the player was elected mayor"); sfx.coin(); showToast("🏛️ YOU are the mayor of the valley! Govern from any hall's Mayor's desk."); }
        else showToast(`🗳️ Election day: ${winnerName} won the mayoralty.`);
      } else sim.election.nextDay = sim.day + CFG.ELECTION.everyDays;
    }
    /* the player-mayor draws a small weekly salary from the local safes */
    if (sim.playerMayor && sim.day % 7 === CFG.COUNCIL.weekday) {
      let pay = 0;
      for (const t of Object.keys(sim.treasury)) if ((sim.treasury[t] || 0) >= 1) { sim.treasury[t]--; pay++; }
      if (pay) { sim.player.coins += pay; showToast(`🏛️ Mayor's salary: ${pay}c from the hall safes.`); }
    }
    // Pass 3: weekly patrol assignment — Cole reads the crime picture and routes the Juniors.
    if (sim.day % 7 === CFG.WATCH_PLAN.weekday && sim.day >= 5) {
      try {
      const townIds = Object.keys(sim.approval);
      const caseCount = (t) => sim.cases.filter(c => c.state === "open" && townOfScene(worldRef.current, c.scene || "t:alderbrook") === t).length;
      const ranked = townIds.slice().sort((a, b) => caseCount(b) - caseCount(a));
      const cole = sim.npcs.find(n => n.id === "cole" && n.alive);
      const juniors = { tessa: sim.npcs.find(n => n.id === "tessa" && n.alive), briar: sim.npcs.find(n => n.id === "briar" && n.alive) };
      const applyRoutes = (tR, bR, brief) => {
        if (juniors.tessa && tR?.length) juniors.tessa.patrolRoute = { towns: tR.filter(t => townIds.includes(t)), idx: 0 };
        if (juniors.briar && bR?.length) juniors.briar.patrolRoute = { towns: bR.filter(t => townIds.includes(t)), idx: 0 };
        if (cole && brief) cole.bubble = { text: brief, until: performance.now() / 1000 + 6 };
        sim.dayLog.push("the Watch posted new patrol routes");
      };
      const localRoutes = () => applyRoutes([ranked[0], ranked[2]], [ranked[1], ranked[3]], "Cover the hot spots. Radio if it moves.");
      if (cole && !apiBusyRef.current) {
        const ctx = `open cases by town: ${townIds.map(t => `${t} ${caseCount(t)}`).join(", ")}; lately: ${(sim.dayLog || []).slice(-3).join("; ") || "quiet"}`;
        apiBusyRef.current = true;
        patrolPlan(ctx, townIds, [juniors.tessa && "Tessa", juniors.briar && "Briar"].filter(Boolean))
          .then(out => { if (out) applyRoutes(out.tessa, out.briar, out.brief); else localRoutes(); })
          .catch(() => localRoutes())
          .finally(() => { apiBusyRef.current = false; });
      } else if (juniors.tessa || juniors.briar) localRoutes();
      } catch (e) { console.log("PATROL ERR:", e.message); }
    }
    // Stage 7: the Heist Nudge — every few days, a planned burglary. Perps: outlaws + the
    // truly broke. Marks: the fattest stashes. The plan lands as a normal burglaryPlan, so
    // everything downstream (witnesses, cases, interrogations, gossip) is the real pipeline.
    if (sim.day >= CFG.HEIST.startDay && sim.day % CFG.HEIST.everyDays === 3 && incidentBudget(sim)) {
      const perps = sim.npcs.filter(n => n.alive && !n.jailedUntil && !n.burglaryPlan && !n.enforcer && !n.mayor && !n.minor
        && (n.outlaw || (n.coins < 5 && !n.occupation?.bId)));
      const marks = sim.npcs.filter(m => m.alive && m.home && (m.stored + m.coins) >= CFG.HEIST.minLoot
        && bld(m.home).town !== "outlands")   // nobody plans a job in Cutter's backyard
        .sort((a, b) => (b.stored + b.coins) - (a.stored + a.coins)).slice(0, 4);
      if (perps.length && marks.length) {
        const applyHeist = (perpId, markId, night, say) => {
          const perp = perps.find(n => n.id === perpId), mark = marks.find(m => m.id === markId && m.id !== perpId);
          if (!perp || !mark) return;
          perp.burglaryPlan = { homeId: mark.home, markId: mark.id, afterHour: night ? 21 : undefined };
          if (say) perp.bubble = { text: say, until: performance.now() / 1000 + 4 };
        };
        const localHeist = () => {   // fallback: brokest perp, fattest EMPLOYED mark — an empty daytime house
          // beats a night job on someone asleep at home (that's how residents end up bleeding out)
          const perp = perps.sort((a, b) => a.coins - b.coins)[0];
          const mark = marks.find(m => m.id !== perp.id && m.occupation?.bId) || marks.find(m => m.id !== perp.id);
          if (mark) applyHeist(perp.id, mark.id, !mark.occupation?.bId, "*eyes the place from across the street*");
        };
        if (!apiBusyRef.current) {
          apiBusyRef.current = true;
          heistPlan(
            perps.map(n => ({ id: n.id, why: n.outlaw ? "career thief" : `broke (${n.coins}c), no work`, guile: skillLevel(n, "office") })),
            marks.map(m => ({ id: m.id, loot: m.stored + m.coins, security: m.furniture?.includes("safe") ? "a safe (tough)" : m.furniture?.includes("piggy") ? "a piggy bank" : "cash lying around",
              away: m.occupation?.bId ? "works days (house empty 9-17)" : "often home" })))
            .then(out => { if (out) applyHeist(out.perp, out.mark, out.night !== false, out.say); else localHeist(); })
            .catch(() => localHeist())
            .finally(() => { apiBusyRef.current = false; });
        } else localHeist();
      }
    }
    // Stage 6: weekly WEALTH tax — every adult holding ≥floor pays base + per×⌊coins/bracket⌋.
    // The hoard drain: modest for a working pocket, real for a snowballing one. Poverty-exempt.
    if (sim.day % 7 === CFG.TAX.weekday) {
      const wt = CFG.WEALTH_TAX;
      const wtDue = (c) => wt.base + wt.per * Math.floor(c / wt.bracket);
      for (const n of sim.npcs) {
        if (!n.alive || n.minor || n.coins < wt.floor) continue;
        const due = wtDue(n.coins);
        fineCoins(n, due); payTreasury(sim, bld(n.home || "home_p")?.town || n.town, due);
      }
      if (sim.player.coins >= wt.floor) {
        const due = wtDue(sim.player.coins);
        fineCoins(sim.player, due); payTreasury(sim, "alderbrook", due);
        showToast(`🏛️ Wealth tax: ${due}c.`);
      }
      for (const t of Object.keys(sim.approval)) sim.approval[t] = clamp(sim.approval[t] - CFG.APPROVAL.taxHit, 0, 100);   // Stage 8: nobody thanks the tax man
    }
    // Stage 8: weekly — approval drifts toward the wary baseline, and a furious town RIOTS.
    if (sim.day % 7 === CFG.COUNCIL.weekday && sim.day >= 7) {
      for (const t of Object.keys(sim.approval)) {
        const a = sim.approval[t];
        sim.approval[t] = clamp(a + Math.sign(CFG.APPROVAL.revertTo - a) * Math.min(CFG.APPROVAL.revertStep, Math.abs(CFG.APPROVAL.revertTo - a)), 0, 100);
        if (sim.approval[t] < CFG.APPROVAL.riotBelow) {
          // ---- RIOT: bounded unrest — anger vents, mess spreads, the hall pays cleanup ----
          const locals = sim.npcs.filter(n => n.alive && n.town === t && !n.minor && !n.enforcer).slice(0, 6);
          const angry = locals.sort(() => Math.random() - 0.5).slice(0, 3);
          const now7 = performance.now() / 1000;
          for (const n of angry) n.bubble = { text: rand(["ENOUGH!", "Where does the money GO?!", "Vance OUT!", "We pay and pay and PAY!"]), until: now7 + 6 };
          for (const b of BUILDINGS.filter(b => b.town === t && SHOP_STOCK[b.id]).slice(0, 3))
            sim.mess[b.id] = clamp((sim.mess[b.id] || 0) + CFG.APPROVAL.riotMess, 0, 100);
          sim.treasury[t] = Math.max(0, (sim.treasury[t] || 0) - CFG.APPROVAL.riotCleanup);
          sim.approval[t] = clamp(sim.approval[t] + CFG.APPROVAL.riotVent, 0, 100);
          seedGossip(sim, angry, { text: `a riot broke out in ${t} — the town's had it with the mayor`, subjectId: null, bad: false });
          sim.dayLog.push(`unrest boiled over in ${t} — a riot in the streets`);
          if (townOfScene(worldRef.current, sim.player.scene) === t) { sfx.alert(); showToast("🔥 A RIOT breaks out — angry voices fill the street!"); }
        }
      }
    }
    // Stage 6: the weekly Council Call — rotates through the towns; the mayor may fund an upgrade.
    if (sim.day % 7 === CFG.COUNCIL.weekday && sim.day >= 7 && sim.councilDay !== sim.day) {
      sim.councilDay = sim.day;
      const townId = ["alderbrook", "mossford", "stonecross", "ferndale"][Math.floor(sim.day / 7) % 4];
      const coins = sim.treasury[townId] || 0;
      const owned = sim.townUpgrades[townId] || (sim.townUpgrades[townId] = {});
      const options = Object.entries(TOWN_UPGRADES).filter(([id, u]) => !owned[id] && u.cost <= coins).map(([id, u]) => ({ id, ...u }));
      const applyBuy = (id, say) => {
        const u = TOWN_UPGRADES[id];
        if (u && !owned[id] && (sim.treasury[townId] || 0) >= u.cost) {
          sim.treasury[townId] -= u.cost; owned[id] = true;
          sim.dayLog.push(`the Council funded ${u.name} in ${townId}`);
          sim.approval[townId] = clamp(sim.approval[townId] + CFG.APPROVAL.upgradeBoost, 0, 100);   // Stage 8: visible spending soothes
        } else sim.approval[townId] = clamp(sim.approval[townId] - CFG.APPROVAL.noFundHit, 0, 100);  // Stage 8: all talk, no funding
        const mayor = sim.npcs.find(n => n.mayor && n.alive);
        if (mayor && say) mayor.bubble = { text: say, until: performance.now() / 1000 + 6 };
        if (say) sim.dayLog.push(`Council Call: "${say}"`);
        if (townOfScene(worldRef.current, sim.player.scene) === townId) {
          const bought = u && owned[id];
          showToast(bought ? `📯 Council Call: ${u.emoji} ${u.name} funded!` : "📯 Council Call convened.");
        }
      };
      const localCall = () => {   // fallback: fund the cheapest affordable option, plain announcement
        const pick = options.sort((a, b) => a.cost - b.cost)[0];
        applyBuy(pick?.id, pick ? `We fund ${pick.name}. ${townId[0].toUpperCase() + townId.slice(1)} moves forward.` : "The coffers need another week. Patience, all.");
      };
      const mayor = sim.npcs.find(n => n.mayor && n.alive);
      if (sim.playerMayor) {
        // the chair is YOURS — no auto-spend. Fund upgrades yourself from any Mayor's desk.
        showToast(`📯 Council Call: ${townId[0].toUpperCase() + townId.slice(1)} looks to YOU, mayor. Fund upgrades at a Mayor's desk.`);
        sim.dayLog.push(`Council Call convened in ${townId} — the mayor holds the pen`);
      } else if (mayor && !apiBusyRef.current) {
        apiBusyRef.current = true;
        councilCall(`Mayor ${mayor.name} — ${mayor.personality}`, townId, coins, Math.round(sim.approval?.[townId] ?? 65), options, (sim.dayLog || []).slice(-3).join("; "))
          .then(out => { if (out) applyBuy(options.some(o => o.id === out.buy) ? out.buy : null, out.say); else localCall(); })
          .catch(() => localCall())
          .finally(() => { apiBusyRef.current = false; });
      } else localCall();
    }
    // weekly rent — every housed adult pays their home town's safe. Minors and owner-occupiers
    // (Hollis lives over his own inn) are exempt; the jailed still owe (grim, but landlords gonna landlord).
    if (sim.day % 7 === CFG.RENT.weekday) {
      // Pass 2: roommate-aware rent. Shared homes split the rent; the LEASEHOLDER (first
      // occupant by seniority) may cover a short roommate if they're good enough friends and
      // solvent — otherwise the roommate gets booted to the street.
      const byHome = {};
      for (const n of sim.npcs) {
        if (!n.alive || n.minor || !n.home || n.evicted) continue;
        if (n.occupation?.owner && n.occupation.bId === n.home) continue;
        (byHome[n.home] = byHome[n.home] || []).push(n);
      }
      for (const [homeId, occ] of Object.entries(byHome)) {
        const town = bld(homeId).town;
        if (occ.length === 1) {
          const n = occ[0];
          fineCoins(n, CFG.RENT.amount); payTreasury(sim, town, CFG.RENT.amount);
          if (n.coins <= -CFG.RENT.evictAt) { n.evicted = true; sim.dayLog.push(`${n.name} was evicted for unpaid rent`); }
          continue;
        }
        const lease = occ[0], share = Math.ceil(CFG.RENT.amount / occ.length);
        for (const n of occ.slice(1)) {
          if (n.coins >= share) { fineCoins(n, share); payTreasury(sim, town, share); continue; }
          const relIdx = REL_ORDER.indexOf(lease.relationships[n.id] || "neutral");
          if (relIdx >= REL_ORDER.indexOf("friend") && lease.coins >= CFG.RENT.amount + 2) {
            fineCoins(lease, share); payTreasury(sim, town, share);   // a friend covers, this once
            lease.memories = [...lease.memories, `Covered ${n.name}'s rent again`].slice(-CFG.MAX_MEMORIES);
            n.memories = [...n.memories, `${lease.name} covered my rent. I owe them.`].slice(-CFG.MAX_MEMORIES);
          } else {
            n.home = null;   // booted — the street it is
            n.memories = [...n.memories, `${lease.name} kicked me out over rent`].slice(-CFG.MAX_MEMORIES);
            lease.memories = [...lease.memories, `Had to boot ${n.name} — couldn't keep carrying them`].slice(-CFG.MAX_MEMORIES);
            const li = REL_ORDER.indexOf(n.relationships[lease.id] || "neutral");
            n.relationships[lease.id] = REL_ORDER[clamp(li - 1, 0, REL_ORDER.length - 1)];
            seedGossip(sim, [lease, n], { text: `${lease.name} booted ${n.name} over unpaid rent`, subjectId: null, bad: false });
            sim.dayLog.push(`${n.name} was booted from ${bld(homeId).name} over rent`);
          }
        }
        fineCoins(lease, share); payTreasury(sim, town, share);
        if (lease.coins <= -CFG.RENT.evictAt) { lease.evicted = true; sim.dayLog.push(`${lease.name} was evicted for unpaid rent`); }
      }
      if (!sim.player.evicted) {
        fineCoins(sim.player, CFG.RENT.amount); payTreasury(sim, "alderbrook", CFG.RENT.amount);   // home_p stands in Alderbrook
        showToast(`🏠 Rent day: ${CFG.RENT.amount}c to the town.`);
        if (sim.player.coins <= -CFG.RENT.evictAt) { sim.player.evicted = true; showToast("🔒 Evicted. The locks change until your debts clear."); }
      }
    }
    // climbing back to solvency reopens the door (checked daily) — repayment IS the coin balance
    for (const n of sim.npcs) if (n.evicted && n.coins >= 0) { n.evicted = false; sim.dayLog.push(`${n.name} paid up and moved back home`); }
    if (sim.player.evicted && sim.player.coins >= 0) { sim.player.evicted = false; showToast("🔓 Debts cleared — you're back in your house."); }
    /* ===== Stage 3.7: owner economy — biweekly menu revisions ===== */
    /* (Opening menus are composed on the first frames of play — see the rAF opening-queue drain.) */
    sim.menu = sim.menu || {};
    // Biweekly revisions: one owner/day starting day 7, then every 14 (staggered across the pool).
    const sinceFirst = sim.day - CFG.OWNERECON.reviseDay;
    if (sinceFirst >= 0) {
      const cyclePos = sinceFirst % CFG.OWNERECON.reviseEvery;
      const owned = Object.keys(SHOP_CANDIDATES).filter(b => OWNERS[b]);
      if (cyclePos < owned.length) reviseShop(sim, owned[cyclePos], true);
    }
    rollFriendLetters(sim);
    /* ===== Stage 4: NPCs spend on furniture — the wealth sink ===== */
    for (const n of sim.npcs) {
      if (!n.alive || n.minor || !n.home || n.jailedUntil) continue;
      n.furniture = n.furniture || []; n.stored = n.stored || 0;
      // auto cash-storage: a wealthy NPC banks pocket cash into their best store (safe from muggings)
      const store = n.furniture.includes("safe") ? "safe" : n.furniture.includes("piggy") ? "piggy" : null;
      if (store) { const cap = FURNITURE[store].store, room = cap - n.stored; if (room > 0 && n.coins > 30) { const put = Math.min(n.coins - 20, room); n.stored += put; n.coins -= put; } }
      // buy cash storage when holding beyond the thresholds and lacking it (needs a free slot to stand in)
      const roomAtHome = freeSlotsOf(sim, n.home).length > 0;
      if (roomAtHome && !n.furniture.includes("safe") && n.coins > CFG.FURN.npcSafeAt) { n.coins -= FURNITURE.safe.price; n.furniture.push("safe"); creditOwner(sim, "furn", FURNITURE.safe.price); npcPlaceFurniture(sim, n, "safe"); sim.dayLog.push(`${n.name} bought an indoor safe`); }
      else if (roomAtHome && !n.furniture.includes("piggy") && !n.furniture.includes("safe") && n.coins > CFG.FURN.npcPiggyAt) { n.coins -= FURNITURE.piggy.price; n.furniture.push("piggy"); creditOwner(sim, "furn", FURNITURE.piggy.price); npcPlaceFurniture(sim, n, "piggy"); }
      // a comfort/utility piece when they can afford it with a healthy buffer (AI also picks the spot)
      else if (roomAtHome) {
        const wants = ["table", "fridge", "bedup", "oven", "fountain", "chest", "drinkbar"].filter(f => !n.furniture.includes(f));
        const pick = wants[0];
        if (pick && n.coins > FURNITURE[pick].price + CFG.FURN.npcSpareFloor && Math.random() < 0.15) {
          n.coins -= FURNITURE[pick].price; n.furniture.push(pick); creditOwner(sim, "furn", FURNITURE[pick].price);
          npcPlaceFurniture(sim, n, pick);
          sim.dayLog.push(`${n.name} furnished their home with a ${FURNITURE[pick].name.toLowerCase()}`);
        }
      }
    }
    /* ===== Stage 5: NPC owners invest in registers — AI-considered, auto on error ===== */
    for (const bId of Object.keys(OWNERS)) {
      const ownerId = OWNERS[bId]; if (!ownerId || ownerId === "player") continue;
      const owner = sim.npcs.find(n => n.id === ownerId && n.alive); if (!owner) continue;
      if (!SHOP_STOCK[bId] && !KITCHEN[bId]) continue;    // only real storefronts run tills
      const reg = sim.registers[bId];
      const R = CFG.REGISTER;
      // decide the AUTO choice first (the fallback), based on affordability + spare buffer
      let auto = "wait";
      if (!reg && owner.coins > R.unlockCost + R.npcConsiderFloor) auto = "install";
      else if (reg && reg.security < 1 && reg.cash > R.lightCost + R.npcConsiderFloor) auto = "light";
      else if (reg && reg.security < 2 && reg.cash > R.highCost + R.npcConsiderFloor) auto = "high";
      if (auto === "wait") continue;                       // nothing worth considering today
      if (Math.random() > 0.25) continue;                  // not every owner every day — paces the calls
      // ask the AI (cheap call); on error/malformed, use auto. Fire-and-forget with a guarded apply.
      registerConsider(bld(bId).name, owner.name, owner.personality, !!reg, reg?.security ?? -1, reg?.cash ?? 0, owner.coins)
        .then(choice => {
          const pick = choice || auto;                     // null → auto fallback
          if (pick === "wait") return;
          const tier = pick === "install" ? 0 : pick === "light" ? 1 : 2;
          // re-check affordability at apply time (state may have moved)
          const rNow = sim.registers[bId];
          const cost = tier === 0 ? R.unlockCost : tier === 1 ? R.lightCost : R.highCost;
          const bal = rNow ? rNow.cash : owner.coins;
          if (bal >= cost && buyRegisterTier(sim, bId, tier))
            sim.dayLog.push(`${owner.name} ${pick === "install" ? "installed a register at" : `upgraded security at`} ${bld(bId).name}`);
        })
        .catch(() => {   // AI failed → auto
          const tier = auto === "install" ? 0 : auto === "light" ? 1 : 2;
          buyRegisterTier(sim, bId, tier);
        });
    }
    /* paid-favor follow-through: an owner who agreed to a task but couldn't do it on the spot
       (no job-seeker free, till short) tries again each dawn — for a few days, then lets it go */
    for (const n of sim.npcs) {
      if (!n.alive || !n.favors?.length) continue;
      n.favors = n.favors.filter(f => {
        if (sim.day - f.since > 4) return false;            // the promise goes stale after a few days
        return !runFavor(sim, n, f.kind, f.bId);            // done → drop it
      });
      if (!n.favors.length) delete n.favors;
    }
    /* Stage 5: NPC owners also buy business UPGRADES from a healthy till (local, paced) */
    for (const bId of Object.keys(OWNERS)) {
      const ownerId = OWNERS[bId]; if (!ownerId || ownerId === "player") continue;
      if (!sim.npcs.find(n => n.id === ownerId && n.alive)) continue;
      const reg = sim.registers[bId]; if (!reg) continue;   // register-gated
      if (Math.random() > 0.2) continue;                    // pace it
      const want = upgradesFor(bId).find(id => !hasUpgrade(sim, bId, id) && reg.cash >= CFG.UPGRADES[id].cost + 20);
      if (want && buyUpgrade(sim, bId, want))
        sim.dayLog.push(`${bld(bId).name} added ${CFG.UPGRADES[want].name}`);
    }
    /* who's traveling today? budget threshold + occasional urge + someone worth the fare */
    for (const n of sim.npcs) {
      n.visitPlan = null;                                 // trips (party invites included) don't outlive the day
      if (!n.alive || n.jailedUntil || n.coins < CFG.VISIT.budget || Math.random() > CFG.VISIT.dailyChance) continue;
      /* NO BUS, NO TRIP. CFG.FARES has no routes for the Outlands or the hills — an NPC given a
         visitPlan from there walks out on foot and can't ride home, ending up broke in
         another town, eating at the inn, sleeping on benches. (Probed to day 16: Mara and
         Howl both died this way, "eating at Quiet Lantern Inn" two towns from their shops.)
         Keepers with a business to run don't wander either. */
      if (!Object.keys(CFG.FARES[n.town] || {}).length) continue;
      if (n.work?.bId && OWNERS[n.work.bId] === n.id) continue;   // your shop doesn't run itself
      const far = Object.entries(n.relationships).find(([id, st]) =>
        (st === "friend" || st === "likes") && sim.npcs.some(o => o.id === id && o.alive && o.town !== n.town
          && Object.keys(CFG.FARES[o.town] || {}).length));   // and nobody buses OUT to the camp either
      if (far) n.visitPlan = { targetId: far[0], phase: "go" };
    }
    if (sim.day % CFG.ETHICS.everyDays === 0) sim.inspectDue = true;   // the ledger gets its look

    /* --- the job market: strikes fall at dawn --- */
    const p = sim.player;
    if (p.job) {
      const y = sim.day - 1;
      if (CFG.JOBS.days.includes(y % 7) && p.job.workedDay !== y) {   // scheduled yesterday, never clocked a task
        p.job.missed++;
        const boss = OWNERS[p.job.bId] ? sim.npcs.find(n => n.id === OWNERS[p.job.bId]) : null;
        if (p.job.missed >= CFG.JOBS.maxStrikes) {
          if (boss?.alive) boss.memories = [...boss.memories, "Fired the player — they just stopped showing up"].slice(-CFG.MAX_MEMORIES);
          repEvent(sim, p, -3, 1, `the player was fired from ${bld(p.job.bId).name} for absence`);
          showToast(`You've been let go from ${bld(p.job.bId).name}. Two missed shifts — consistency, remember?`);
          leaveJob(p, sim);
        } else showToast(`⚠️ Missed your shift at ${bld(p.job.bId).name} yesterday — strike ${p.job.missed}/${CFG.JOBS.maxStrikes}. Work a shift to clear it.`);
      }
    }
    /* --- Stage 2: daily promotion review for everyone employed --- */
    if (reviewOccupation(p) && p.job)
      showToast(`📜 Promoted to ${p.occupation.title} at ${bld(p.job.bId).name}!`);
    for (const n of sim.npcs) if (n.alive) reviewOccupation(n);

    /* --- Stage 2: the jobless draw a modest civic dole (a full work-shift's
       worth of stipend hours) so hunting for work doesn't starve them --- */
    const doleHours = CFG.JOBS.shift[1] - CFG.JOBS.shift[0];
    const dole = CFG.OCCUPATION.unemploymentStipendH * doleHours;
    for (const n of sim.npcs)
      if (canSeekWork(n) && !n.occupation?.bId) n.coins = Math.min(9999, n.coins + dole);

    /* yesterday's opening expires. If no player claimed it, a jobless local now
       REALLY takes the post — they gain the occupation, not just a buzz line. */
    if (sim.opening && sim.day > sim.opening.day) {
      if (!sim.opening.done) {
        const bId = sim.opening.bId;
        const filler = pickJobSeeker(sim, bId);            // prefers the unemployed & apt
        if (filler) {
          hireNpc(sim, filler, bId);
          sim.buzz = { text: `${filler.name} took the ${filler.occupation.title} post at ${bld(bId).name}. The listing's gone.`, day: sim.day };
        }
      }
      sim.opening = null;
    }
    /* a fresh HIRING post some mornings — never for the player's own employer.
       postedAt stamps the player's exclusive-window start (Stage 2 headstart). */
    if (!sim.opening && Math.random() < CFG.JOBS.openingChance) {
      const pool = CFG.JOBS.employers.filter(b => b !== p.job?.bId && sim.npcs.find(n => n.id === OWNERS[b])?.alive);
      // Pass 4: Pete runs a DELIVERY SERVICE — until the post has two couriers, its openings jump the queue
      const postStaff = sim.npcs.filter(n => n.alive && n.occupation?.bId === "post" && !n.occupation.owner).length;
      if (postStaff < 2 && pool.includes("post")) pool.push("post", "post");
      if (pool.length) {
        const bId = rand(pool);
        sim.opening = { bId, day: sim.day, hour: CFG.JOBS.interviewHour, done: false, postedAt: sim.time };
        sim.buzz = { text: `${bld(bId).name} is HIRING — interviews today, ${CFG.JOBS.interviewHour}:00 sharp. Dress like you mean it.`, day: sim.day };
      }
    }
  };

  /* parcel lands: shelves fill, owner pays the delivery bill — courier keeps it */
  const fulfillOrder = (sim, order, courier) => {
    for (const [it, q] of Object.entries(order.items)) addStock(sim, order.bId, it, q);
    const owner = ownerEnt(sim, order.bId);              // the player pays their own delivery bills too
    const destTown = bld(order.bId).town;
    const baseFee = destTown !== "alderbrook"
      ? (CFG.FARES.alderbrook[destTown]?.c || 0) + CFG.DELIVERY.feeCrossBase
      : CFG.DELIVERY.feeSame;
    // Stage 3.7: heavier goods cost more to ship — +1c/item per 2c of base value above 5c
    const surcharge = Object.entries(order.items).reduce((s, [it, q]) => s + itemSurcharge(it) * q, 0);
    let fee = baseFee + surcharge;
    if (hasUpgrade(sim, "post", "routes")) fee *= 2;      // Stage 5: extended routes double mail earnings
    if (owner) {
      fineCoins(owner, fee);                              // billed for the delivery, as agreed
      if (courier) courier.coins += fee;                  // and the runner keeps that bill
    } else if (FACILITY_DOCTOR[order.bId]) {              // Stage 3: medicine ships free — Pete's truck doesn't
      const ship = shippingCost(destTown);                // 1c per 20 miles from the Alderbrook depot
      const doc = facilityDoctor(sim, order.bId);
      if (doc) fineCoins(doc, ship);                      // the practicing doctor covers the mileage
      const runner = courier || sim.npcs.find(n => n.id === "pete" && n.alive);
      if (runner) runner.coins += ship;                   // whoever drove keeps the fare
    } else if (courier) courier.coins += fee;             // ownerless non-medical (post): runner still gets paid
    order.state = "delivered";
  };

  /* letters: written free & local, carried by the post (or by you), remembered */
  const sendLetter = (sim, fromId, toId, text) => {
    sim.letters.push({ fromId, toId, text, state: "atPost", day: sim.day });
  };
  const deliverLetter = (sim, L) => {
    if (L.state === "delivered") return;
    L.state = "delivered";
    const from = L.fromId === "player" ? "You" : sim.npcs.find(n => n.id === L.fromId)?.name || "Someone";
    if (L.toId === "player") { sim.playerMail = [...sim.playerMail, L].slice(-12); showToast(`📬 A letter from ${from} arrived.`); return; }
    const to = sim.npcs.find(n => n.id === L.toId);
    if (!to?.alive) return;
    to.memories = [...to.memories, `Got a letter from ${from}: "${L.text}"`].slice(-CFG.MAX_MEMORIES);
    if (Math.random() < 0.5) {                            // a letter can warm a relationship
      const cur = REL_ORDER.indexOf(to.relationships[L.fromId] || "neutral");
      to.relationships[L.fromId] = REL_ORDER[clamp(cur + 1, 0, REL_ORDER.length - 1)];
    }
  };
  const rollFriendLetters = (sim) => {
    for (const n of sim.npcs) {
      if (!n.alive || n.jailedUntil || Math.random() > 0.08) continue;
      const friends = Object.entries(n.relationships).filter(([, st]) => st === "friend" || st === "likes");
      if (!friends.length) continue;
      const [toId] = rand(friends);
      sendLetter(sim, n.id, toId, rand([
        `Thinking of you — come by ${TOWN_DEFS[n.town].name} soon!`,
        `Saw something that reminded me of ${rand(n.likes)}. Miss you.`,
        `All's well here. Don't be a stranger.`,
      ]));
    }
  };

  /* the whole town eats on your coin — and remembers it. Cross-town friends
     get letter invitations AND make the trip. Host doubles dinner & dessert. */
  const throwParty = (sim, world, thrower, dinner, dessert, drink) => {
    const throwerKey = thrower.id || "player";
    const town = thrower.id ? thrower.town : townOfScene(world, sim.player.scene);
    const heads = sim.npcs.filter(n => n.alive && n.town === town).length + 1;
    const cost = Math.max(CFG.PARTY.minCost, Math.ceil(                       // catering never comes cheap
      (ITEMS[dinner].price + ITEMS[dessert].price + ITEMS[drink].price) * heads
      + ITEMS[dinner].price + ITEMS[dessert].price));
    if (thrower.coins < cost) return { ok: false, cost };
    fineCoins(thrower, cost);
    const late = (sim.time / 60) % 24 >= CFG.PARTY.lateCutoffH;               // too late to cater tonight
    sim.party = { throwerId: throwerKey, town, day: late ? sim.day + 1 : sim.day, dinner, dessert, drink, distributed: false };
    sim.buzz = { text: `${thrower.id ? thrower.name : "The player"} is throwing a party at the ${TOWN_DEFS[town].name} plaza ${late ? "TOMORROW night" : "tonight"}!`, day: sim.day };
    sim.dayLog = [...sim.dayLog, `${thrower.id ? thrower.name : "the player"} announced a party (${ITEMS[dinner].name}, ${ITEMS[dessert].name})`].slice(-12);
    for (const n of sim.npcs) {
      if (!n.alive || n.jailedUntil || n.town === town) continue;
      const st = n.relationships[throwerKey];
      if (st === "friend" || st === "likes") {
        sendLetter(sim, throwerKey, n.id, `You're invited! Party at the ${TOWN_DEFS[town].name} plaza tonight!`);
        n.visitPlan = { targetId: throwerKey, phase: "go", party: true };
      }
    }
    return { ok: true, cost };
  };

  /* =================== MAIN LOOP =================== */
  // Stage 6: enforce the temp-set time limit (badly-under-skilled hard cooking).
  useEffect(() => {
    if (minigame?.type !== "cooktemp" || !minigame.setDeadline) return;
    const remain = minigame.setDeadline - Date.now();
    const t = setTimeout(() => {
      const mg = minigameRef.current;
      if (mg?.type === "cooktemp" && mg.setDeadline && Date.now() >= mg.setDeadline) {
        const sim = simRef.current, p = sim.player;
        if (mg.mode !== "chef") p.inv.burnt = (p.inv.burnt || 0) + 1;
        sfx.fail(); showToast("⏱️ Too slow — the oven scorched it. Burnt Mess.");
        setMinigame(null);
      }
    }, Math.max(0, remain) + 30);
    return () => clearTimeout(t);
  }, [minigame?.type, minigame?.setDeadline]);

  useEffect(() => {
    if (screen !== "game") return;
    let raf, last = performance.now(), hudTimer = 0;

    const step = (nowMs) => {
      const sim = simRef.current, world = worldRef.current;
      const dt = Math.min(0.05, (nowMs - last) / 1000);
      last = nowMs;
      const now = nowMs / 1000;
      const paused = (modalRef.current && !jailRef.current) || !!transitionRef.current;   // Stage 3.5: the world runs while you sit

      if (!paused) {
        sim.time += dt * CFG.MINUTES_PER_SEC;
        if (sim.time >= 1440) {
          sim.time -= 1440; sim.day++;
          sim.encounters = sim.encounters.filter(e => !e.done);
          if (sim.buzz && sim.buzz.day < sim.day) sim.buzz = null;
          dailyTick(sim, world);                          // mail lands, freight arrives, shelves reorder
        }
        // Stage 2.1: mid-day demand sweep — hot, low items get expedited freight
        const absNow = sim.day * 1440 + sim.time;
        if (absNow - (sim.lastRestockSweep ?? -9999) >= CFG.SELFCARE.restockCheckH * 60) {
          sim.lastRestockSweep = absNow;
          expediteRestock(sim);
        }
        // Stage 3.7: opening menus. On the first frame of a fresh game (or a pre-3.7 save with no
        // menus), queue every owned shop; drain one per free API lane so all shops get an
        // owner-composed menu within seconds — no day-2 wait, no burst past the single API lane.
        if (sim.openQueue == null) {
          sim.menu = sim.menu || {};
          sim.openQueue = Object.keys(SHOP_CANDIDATES).filter(b => OWNERS[b] && !Object.keys(sim.menu[b] || {}).length);
        }
        if (sim.openQueue.length && !apiBusyRef.current) {
          const bId = sim.openQueue.shift();
          if (!reviseShop(sim, bId, false)) sim.openQueue.unshift(bId);   // lane busy → retry next frame
        }
        // Stage 3: the treasury pays each town's doctor on the stipend hours — IF the local safe can afford it.
        // (Iterates every hour crossed since last frame so sleep time-jumps don't skip paydays; capped for safety.)
        const curHr = Math.floor(absNow / 60);
        if (sim.lastStipendHr == null) sim.lastStipendHr = curHr;
        for (let h = sim.lastStipendHr + 1; h <= curHr && h <= sim.lastStipendHr + 48; h++) {
          if (!CFG.MEDICAL.stipendHours.includes(((h % 24) + 24) % 24)) continue;
          for (const fac of Object.keys(FACILITY_DOCTOR)) {
            const doc = facilityDoctor(sim, fac); if (!doc || doc.jailedUntil) continue;
            const t = bld(fac).town;
            if ((sim.treasury[t] || 0) >= CFG.MEDICAL.stipendAmount) {
              sim.treasury[t] -= CFG.MEDICAL.stipendAmount; doc.coins += CFG.MEDICAL.stipendAmount;
            }
          }
        }
        sim.lastStipendHr = curHr;
        // Stage 3: vagrancy — an awake officer passing a bench-sleeper warns once; every later catch is a 1★
        // through the same convictStars ladder as any other crime. One citation per sleeper per night.
        if (absNow - (sim.lastVagrancySweep ?? -9999) >= 30) {
          sim.lastVagrancySweep = absNow;
          for (const cop of sim.npcs.filter(n => n.alive && n.enforcer && !n.activity.includes("sleep"))) {
            for (const tgt of sim.npcs.filter(n => n.alive && n.activity.includes("bench") && n.scene === cop.scene && dist(n, cop) < 6)) {
              if (tgt.lastVagrancyDay === sim.day) continue;
              tgt.lastVagrancyDay = sim.day;
              if (!tgt.vagrantWarned) { tgt.vagrantWarned = true; sim.dayLog.push(`${cop.name} warned ${tgt.name} off the bench`); }
              else convictStars(sim, tgt, 1, `${tgt.name} was cited for vagrancy`);
            }
          }
        }
        const dtHours = (dt * CFG.MINUTES_PER_SEC) / 60;
        const absTime = sim.day * 1440 + sim.time;
        const p = sim.player;
        window.__abSim = sim;                             // headless-harness test hook — read/poke sim state in boot tests
        // Stage 3.5: a timed sentence ends — the door opens on a world that kept moving
        if (p.jailedUntil && p.jailedUntil !== Infinity && sim.day * 1440 + sim.time >= p.jailedUntil) {
          const cellB = p.scene.startsWith("i:") ? p.scene.slice(2) : "hq";
          p.jailedUntil = null;
          const d = bld(cellB).door;
          p.scene = `t:${bld(cellB).town}`; p.x = d.x; p.y = d.y;
          setJailScreen(null); showToast("Time served. Mind how you go.");
        }
        const playerTown = townOfScene(world, p.scene);
        tryOwnerPulse(sim, world);                        // all-town exempt pulse first: owners + authority (so tryPulse can skip them)
        tryPulse(sim, world, playerTown);
        tryNudge(sim, world, playerTown);

        /* --- player movement (blocked while bedridden or down) --- */
        const k = keysRef.current;
        if (sim.player.sitting && (k.up || k.down || k.left || k.right)) {   // standing early: the partial 12-min stretch is forfeit
          sim.player.sitting = null; showToast("🪑 You stand. Any unfinished stretch doesn't count.");
        }
        let dx = 0, dy = 0;
        if (!p.bedrest && !p.incap && !p.jailedUntil) {   // Stage 3.5: the dying CRAWL (below); the jailed sit
          dx = (k.right ? 1 : 0) - (k.left ? 1 : 0); dy = (k.down ? 1 : 0) - (k.up ? 1 : 0);
          if (dx || dy) {
            const len = Math.hypot(dx, dy), spd = CFG.PLAYER_SPEED * (p.energy < 15 ? 0.5 : 1) * (p.dying ? 0.25 : 1) * dt;   // Stage 3.5: a crawl
            const nx = p.x + (dx / len) * spd, ny = p.y + (dy / len) * spd;
            if (isWalkable(world, p.scene, nx, p.y)) p.x = nx;
            if (isWalkable(world, p.scene, p.x, ny)) p.y = ny;
            if (p.scene.startsWith("i:")) {
              const bId = p.scene.slice(2), inter = world.interiors[bId];
              if (Math.round(p.x) === inter.exit.x && Math.round(p.y) === inter.exit.y &&
                  (!p.dying || sim.settings.difficulty === "easy")) {   // Stage 3.5: dying can't work doors (Easy excepted)
                const b = bld(bId);
                p.scene = `t:${b.town}`; p.x = b.door.x; p.y = b.door.y;
                setMinigame(null); setCookPanel(false);
                if (sim.task) { sim.task = null; showToast("Shift abandoned."); }
                if (sim.playerReport) { fileReport(sim, p, sim.playerReport.thiefId); sim.playerReport = null; }  // stepped out — it's official
                if (sim.crimeAlert?.bId === bId) sim.crimeAlert = null;
              }
            }
          }
        }

        /* --- player needs, hygiene, health --- */
        p.hunger = clamp(p.hunger - CFG.DECAY.hunger * dtHours, 0, 100);
        p.thirst = clamp(p.thirst - CFG.DECAY.thirst * dtHours, 0, 100);
        p.energy = clamp(p.energy - CFG.DECAY.energy * dtHours * (dx || dy ? 1.4 : 1), 0, 100);
        p.hygiene = clamp(p.hygiene - CFG.HYGIENE.decay * dtHours, 0, 100);
        if (p.bedrest) {
          const docIn = sim.npcs.some(n => n.alive && n.doctor && n.scene === "i:hospital");
          p.health = clamp(p.health + (docIn ? CFG.HOSPITAL.bedRegenDoc : CFG.HOSPITAL.bedRegen) * dtHours, 0, 100);
        } else if (!p.incap) p.health = clamp(p.health + CFG.HEALTH.regenAwake * dtHours, 0, 100);
        // Stage 3.5: survival damage — dehydration is fast, starvation slow, bad sickness ticks.
        if (p.jailedUntil) { p.hunger = Math.max(p.hunger, CFG.STARVE.jailNeedFloor); p.thirst = Math.max(p.thirst, CFG.STARVE.jailNeedFloor); }   // the Watch feeds its prisoners
        if (p.thirst <= 0) { p.thirstAcc = (p.thirstAcc || 0) + dt; if (p.thirstAcc > CFG.STARVE.graceThirstSec) p.health = clamp(p.health - CFG.STARVE.thirstDps * dt, 0, 100); } else p.thirstAcc = 0;
        if (p.hunger <= 0) { p.hungerAcc = (p.hungerAcc || 0) + dt; if (p.hungerAcc > CFG.STARVE.graceHungerSec) p.health = clamp(p.health - CFG.STARVE.hungerDps * dt, 0, 100); } else p.hungerAcc = 0;
        if (p.sick?.level === "bad") { p.sickAcc = (p.sickAcc || 0) + dt; if (p.sickAcc >= CFG.STARVE.sickEverySec) { p.sickAcc = 0; p.health = clamp(p.health - sickDmg(p.health), 0, 100); } }
        // the <1 HP floor: ANY cause routes through dying — real time, rescue window, no shortcuts
        if (p.health < 1 && !p.dying && !p.incap && !p.bedrest) { setDying(sim, p, null); showToast("💀 Everything goes grey. You're going down — someone has to FIND you."); }

        /* --- TRESPASS: uninvited lingering in someone else's home ---
           A brief look inside is nothing. Past the grace window, a resident (or their
           closed door) wants you gone; ignore that and it's a 1★ report on the ledger.
           A friendly, awake host is genuine permission — welcome guests linger freely. */
        if (p.scene.startsWith("i:") && !p.jailedUntil && !p.bedrest) {
          const hb = p.scene.slice(2);
          const residents = isHomeId(hb) && hb !== p.home ? sim.npcs.filter(n => n.alive && n.home === hb) : [];
          if (residents.length) {
            const abs9 = sim.day * 1440 + sim.time;
            if (!p.trespass || p.trespass.homeId !== hb) p.trespass = { homeId: hb, since: abs9, warned: false, reported: false };
            const present = residents.filter(n => n.scene === p.scene && !n.incap && !n.dying);
            const awakeHost = present.find(n => !n.activity?.includes("sleep") && !n.activity?.includes("Sleep"));
            const partyHere = sim.party && sim.party.day === sim.day && residents.some(r => r.id === sim.party.throwerId);
            const welcomed = partyHere || (awakeHost && ["likes", "friend"].includes(awakeHost.relationships.player || awakeHost.relationships[p.id] || "neutral"));
            const stayed = abs9 - p.trespass.since;
            const nowS = performance.now() / 1000;
            if (!welcomed && stayed > CFG.TRESPASS.graceMin && !p.trespass.warned) {
              p.trespass.warned = true;
              if (awakeHost) { awakeHost.bubble = { text: rand(["Can I... help you?", "This is my house. Out. Please.", "You should go. Now."]), until: nowS + 5 }; showToast(`🚪 ${awakeHost.name} wants you out of their home.`); }
              else showToast(present.length ? "🚪 They're asleep. You really shouldn't be in here." : "🚪 You're loitering in someone's home. Leave before you're caught.");
            }
            if (!welcomed && stayed > CFG.TRESPASS.reportMin && !p.trespass.reported) {
              p.trespass.reported = true;
              p.wanted = Math.max(p.wanted || 0, 1);
              openCase(sim, "trespassing", { victim: residents[0].name, scene: p.scene, x: Math.round(p.x), y: Math.round(p.y), killerId: "player", evidence: awakeHost ? 2 : 1 });
              if (awakeHost) {
                awakeHost.bubble = { text: "That's IT — I'm reporting this.", until: nowS + 5 };
                const ri9 = REL_ORDER.indexOf(awakeHost.relationships.player || "neutral");
                awakeHost.relationships.player = REL_ORDER[clamp(ri9 - 1, 0, REL_ORDER.length - 1)];
              }
              repEvent(sim, p, -3, 1, "the player was reported for trespassing");
              sim.dayLog.push(`the player was reported for trespassing in ${bld(hb).name}`);
              sfx.alert(); showToast("🚨 Trespassing reported to the Watch. (1★)");
            }
          } else if (p.trespass) p.trespass = null;
        } else if (p.trespass) p.trespass = null;

        if (p.energy <= 0 && !p.incap && !p.bedrest) {   // exhaustion ≠ injury: someone drives you home
          const inPublic = p.scene.startsWith("t:");
          p.scene = "t:alderbrook"; p.x = bld("home_p").door.x; p.y = bld("home_p").door.y;
          p.energy = 60; p.coins = Math.max(0, p.coins - 2);
          p.health = clamp(p.health - 10, 0, 100);        // you don't fall gently
          sim.time += 360; if (sim.time >= 1440) { sim.time -= 1440; sim.day++; }
          repEvent(sim, p, inPublic ? -2 : -0.5, inPublic ? 1.5 : 0, "the player collapsed from exhaustion");
          setMinigame(null); sim.foodOrder = null; sim.task = null;
          showToast("You collapsed. Someone drove you home to Alderbrook (−2 coins).");
        }

        /* --- rescue / death scan: the clock that makes the graveyard real.
               DYING (lethal wounds) runs a much shorter clock, and if it
               expires, the one who held the blade owns a murder. --- */
        for (const ent of [p, ...sim.npcs]) {
          const state = ent.dying || ent.incap;
          if (!state || (ent.id && !ent.alive)) continue;
          const isP = !ent.id, isDying = !!ent.dying;
          if (isP && !diff().deathEnabled) { ent.dying = null; hospitalize(sim, world, ent); continue; }   // easy: instantly found
          const elapsed = absTime - state.since;
          // candidate rescuers present in the scene (conscious, not hidden, not the victim)
          const rescuers = [p, ...sim.npcs].filter(o => o !== ent &&
            (o.id ? o.alive && !o.incap && !o.dying && !o.hidden : !o.incap && !o.dying) &&
            (o.scene === ent.scene ||
              // a DRAGGED victim is crying for help at a doorstep — people inside that town's
              // buildings can hear it (quiet-town streets are empty at midday and midnight)
              (state.dragged && ent.scene.startsWith("t:") && o.scene.startsWith("i:") && bld(o.scene.slice(2))?.town === ent.scene.slice(2))));
          const found = rescuers.length > 0;
          // Nobody walks into a private room: after 20 unfound minutes INSIDE, the wounded
          // drag themselves to the doorstep — where street traffic can actually find them.
          // (Fixes the repeat pattern of burglary-confrontation losers bleeding out unseen.)
          if (!found && ent.scene?.startsWith("i:") && absTime - state.since > 12 && !state.dragged) {
            const db = bld(ent.scene.slice(2));
            if (db?.door) {
              ent.scene = `t:${db.town}`; ent.x = db.door.x; ent.y = db.door.y;
              state.dragged = true;
              sim.dayLog.push(`${ent.id ? ent.name : "you"} dragged ${ent.id ? "themselves" : "yourself"} into the street, badly hurt`);
              continue;
            }
          }
          const windowMin = isDying ? CFG.DYING_WINDOW_MIN : CFG.RESCUE_WINDOW_MIN;
          if (found && elapsed > (isDying ? 4 : 10)) {
            // pick the most capable rescuer present (doctor > highest service skill)
            const finder = rescuers.slice().sort((a, b) =>
              (b.doctor ? 999 : skillLevel(b, "service")) - (a.doctor ? 999 : skillLevel(a, "service")))[0];
            const finderSkilled = finder.doctor || (finder.skills?.service || 0) >= CFG.SKILLCHECK.medMinSkill;
            /* Stage 2.2: only a DYING victim + a SKILLED, non-doctor finder triggers
               an at-scene stabilization skill check. Doctors auto-stabilize; novices
               (and all non-lethal incap cases) use the existing rush-to-care path. */
            if (isDying && finderSkilled && !finder.doctor && !isP) {
              rescueStabilize(sim, world, ent, finder, absTime);   // async check; may burn time on fail
              continue;                                            // don't fall through to instant hospitalize
            }
            // doctor present, novice-but-non-lethal, or player-victim: stabilize now (unchanged behavior)
            if (isDying) { completeRescue(sim, world, ent, ent.dying?.byId); }
            else { ent.incap = null; hospitalize(sim, world, ent); }
          } else if (elapsed > windowMin) {
            killEntity(sim, ent, isDying ? "bled out" : (isP ? "found too late" : "was found too late"), ent.dying?.byId || null);
          }
        }

        /* --- body discovery: nobody walks past a corpse ("OH GOODNESS—") --- */
        for (const body of sim.bodies) {
          if (body.discovered) continue;
          const finder = sim.npcs.find(n => n.alive && !n.incap && !n.dying && !n.hidden && !n.jailedUntil && n.scene === body.scene && dist(n, body) < 4);
          if (finder) {
            finder.bubble = { text: rand(["OH GOODNESS— A BODY?!", "No no no— SOMEONE GET THE WATCH!", "*screams*"]), until: now + 5 };
            if (incidentBudget(sim)) {
              sim.incidents.count++;
              const byId = Object.fromEntries(sim.npcs.map(n => [n.id, n]));
              incidentCall("body", [finder], `${finder.name} just found ${body.name}'s body`, byId).then(out => {
                if (out?.reaction === "panic") finder.report = { bodyNpc: body.npcId };
                else discoverBody(sim, body, finder.id);
              }).catch(() => discoverBody(sim, body, finder.id));
            } else if (finder.minor) finder.report = { bodyNpc: body.npcId };   // kids run for a grown-up
            else discoverBody(sim, body, finder.id);
            break;
          }
        }
        /* processed: the Watch clears the scene on arrival */
        for (const npc of sim.npcs) {
          if (npc.enforcer && npc.alive && npc.dispatch?.bodyScene && npc.scene === npc.dispatch.bodyScene &&
              dist(npc, { x: npc.dispatch.bodyX, y: npc.dispatch.bodyY }) < 2) {
            const bn = npc.dispatch.bodyNpc;
            sim.bodies = sim.bodies.filter(b => b.npcId !== bn);
            npc.bubble = { text: "We'll take it from here. Show some respect.", until: now + 4 };
            npc.dispatch = null; npc.goal = null;
          }
        }

        /* --- sickness: neglect invites it, filth multiplies it; clean and
               well-fed folk essentially never roll it --- */
        for (const ent of [p, ...sim.npcs]) {
          if (ent.id && !ent.alive) continue;
          if (!ent.sick) {
            const lowNeed = Math.min(ent.hunger, ent.thirst, ent.energy) < 20;
            const chance = (CFG.SICK.baseHr + (lowNeed ? CFG.SICK.lowNeedHr : 0)) * (ent.hygiene < 30 ? CFG.SICK.hygieneMult : 1);
            if (Math.random() < chance * dtHours) {
              ent.sick = { level: "mild" };
              if (!ent.id) showToast("You feel a chill coming on... 🤒");
            }
          } else {
            if (ent.sick.level === "mild" && Math.min(ent.hunger, ent.energy) < 20 && Math.random() < 0.04 * dtHours) ent.sick.level = "bad";
            if (ent.sick.level === "bad") ent.health = clamp(ent.health - CFG.SICK.badHealthHr * dtHours, 0, 100);
            if (ent.id && ent.sick.level === "mild" && Math.random() < 0.002) ent.bubble = { text: "*cough cough*", until: now + 2 };
          }
        }

        /* --- party runtime: three hours of the whole town eating on one coin purse --- */
        if (sim.party) {
          const ph = (sim.time / 60) % 24;
          if (sim.party.day === sim.day && ph >= 18.5 && !sim.party.distributed) {
            sim.party.distributed = true;
            const pt = sim.party;
            const thrower = pt.throwerId === "player" ? p : sim.npcs.find(n => n.id === pt.throwerId);
            const attendees = [
              ...sim.npcs.filter(n => n.alive && !n.jailedUntil && townOfScene(world, n.scene) === pt.town),
              ...(townOfScene(world, p.scene) === pt.town ? [p] : []),
            ];
            for (const g of attendees) {
              for (const it of [pt.dinner, pt.dessert, pt.drink]) g.inv[it] = (g.inv[it] || 0) + 1;
              if (g.id) g.bubble = { text: rand(["This is INCREDIBLE!", "Best night in years!", `The ${ITEMS[pt.dinner].name.toLowerCase()}!!`]), until: now + 4 };
            }
            if (thrower) {                                 // the host doubles BOTH dinner and dessert
              thrower.inv[pt.dinner] = (thrower.inv[pt.dinner] || 0) + 1;
              thrower.inv[pt.dessert] = (thrower.inv[pt.dessert] || 0) + 1;
              repEvent(sim, thrower, CFG.PARTY.repFame, CFG.PARTY.repRenown, `${pt.throwerId === "player" ? "the player" : thrower.name} threw a party for the whole town`);
              for (const g of attendees.filter(g => g.id && g.relationships[pt.throwerId] === "friend" && Math.random() < CFG.PARTY.giftChance)) {
                const itemId = Object.keys(g.inv).find(id => g.inv[id] > 0 && !ITEMS[id].dmg);
                if (Math.random() < 0.5 && itemId) receiveGift(sim, g, thrower, { itemId });
                else if (g.coins > 5) receiveGift(sim, g, thrower, { coins: 2 + Math.floor(Math.random() * 3) });
              }
            }
            sim.buzz = { text: "What a party. WHAT a party.", day: sim.day };
          }
          if (sim.party.day < sim.day || (sim.party.day === sim.day && ph >= CFG.PARTY.endHour)) sim.party = null;
        }

        /* --- tidiness --- */
        for (const b of BUILDINGS.filter(b => b.enterable)) {
          const occ = sim.npcs.filter(n => n.alive && n.scene === `i:${b.id}`).length + (p.scene === `i:${b.id}` ? 1 : 0);
          sim.mess[b.id] = clamp(sim.mess[b.id] + (CFG.MESS.ambient + occ * CFG.MESS.perOccupant) * dtHours, 0, 100);
        }

        /* --- NPCs --- */
        sim.lastDecide += dt;
        const decide = sim.lastDecide > 1.5;
        if (decide) sim.lastDecide = 0;
        for (const npc of sim.npcs) {
          if (!npc.alive) continue;
          npc.hunger = clamp(npc.hunger - CFG.DECAY.hunger * CFG.NPC_DECAY_SCALE * dtHours, 0, 100);
          npc.thirst = clamp(npc.thirst - CFG.DECAY.thirst * CFG.NPC_DECAY_SCALE * dtHours, 0, 100);
          npc.energy = clamp(npc.energy - CFG.DECAY.energy * CFG.NPC_DECAY_SCALE * dtHours, 0, 100);
          npc.hygiene = clamp(npc.hygiene - CFG.HYGIENE.decay * CFG.NPC_DECAY_SCALE * dtHours, 0, 100);
          // Stage 3.5: survival damage — same rules as the player, nobody is exempt
          if (npc.jailedUntil) { npc.hunger = Math.max(npc.hunger, CFG.STARVE.jailNeedFloor); npc.thirst = Math.max(npc.thirst, CFG.STARVE.jailNeedFloor); }
          /* WARD SAFETY NET: the hospital feeds its patients too. Without this a bedrest NPC's
             needs run to zero and starvation damage cancels the bed regen — they hover under
             dischargeHp forever (diagnosed: Outlands rescues stuck in the ward for weeks). */
          if (npc.bedrest) { npc.hunger = Math.max(npc.hunger, CFG.STARVE.jailNeedFloor); npc.thirst = Math.max(npc.thirst, CFG.STARVE.jailNeedFloor); }
          /* CUSTODY SAFETY NET: anyone inside a Watch building who ISN'T serving a sentence is
             being held informally (questioning, a stalled pursuit, a cell-full fallback). They
             can't shop, cook, or reach a pump from in there — so the Watch feeds them, and if
             they've been sat there over an hour, they're turned loose. Without this they quietly
             starve in custody (diagnosed: Sable at 0/0 thirst/hunger "getting a drink at the old
             pump" while standing in i:hq). */
          if (!npc.jailedUntil && LOCKUP_ORDER.includes(npc.scene?.slice(2))) {
            npc.hunger = Math.max(npc.hunger, CFG.STARVE.jailNeedFloor);
            npc.thirst = Math.max(npc.thirst, CFG.STARVE.jailNeedFloor);
            npc.heldSince = npc.heldSince || (sim.day * 1440 + sim.time);
            if (sim.day * 1440 + sim.time - npc.heldSince > 60) {
              const hb = bld(npc.scene.slice(2));
              npc.scene = `t:${hb.town}`; npc.x = hb.door.x; npc.y = hb.door.y;
              npc.legs = []; npc.path = []; npc.goal = null; npc.heldSince = null;
              npc.activity = "walking out of the Watch house";
            }
          } else if (npc.heldSince) npc.heldSince = null;
          if (npc.thirst <= 0) { npc.thirstAcc = (npc.thirstAcc || 0) + dt; if (npc.thirstAcc > CFG.STARVE.graceThirstSec) npc.health = clamp(npc.health - CFG.STARVE.thirstDps * dt, 0, 100); } else npc.thirstAcc = 0;
          if (npc.hunger <= 0) { npc.hungerAcc = (npc.hungerAcc || 0) + dt; if (npc.hungerAcc > CFG.STARVE.graceHungerSec) npc.health = clamp(npc.health - CFG.STARVE.hungerDps * dt, 0, 100); } else npc.hungerAcc = 0;
          if (npc.sick?.level === "bad") { npc.sickAcc = (npc.sickAcc || 0) + dt; if (npc.sickAcc >= CFG.STARVE.sickEverySec) { npc.sickAcc = 0; npc.health = clamp(npc.health - sickDmg(npc.health), 0, 100); } }
          if (npc.health < 1 && !npc.dying && !npc.incap) setDying(sim, npc, null);
          if (npc.layLowUntil && sim.day * 1440 + sim.time >= npc.layLowUntil) npc.layLowUntil = null;   // Stage 3.5: heat fades
          // Stage 3.5: the dying crawl — a few desperate feet toward the clinic door. It never opens for them.
          if (npc.dying) {
            if (!npc.dying.crawlTo) {
              const tgt = npc.scene.startsWith("i:") ? world.interiors[npc.scene.slice(2)].exit
                : bld(TOWN_CLINIC[townOfScene(world, npc.scene)] || "hospital").door;
              npc.dying.crawlTo = { x: tgt.x, y: tgt.y };
            }
            const c = npc.dying.crawlTo, ddx = c.x - npc.x, ddy = c.y - npc.y, dd = Math.hypot(ddx, ddy);
            if (dd > 1.1) {                                // stops AT the tile — no transition without legs
              const step = CFG.NPC_SPEED * 0.25 * dt;
              const nx = npc.x + (ddx / dd) * step, ny = npc.y + (ddy / dd) * step;
              if (isWalkable(world, npc.scene, nx, npc.y)) npc.x = nx;
              if (isWalkable(world, npc.scene, npc.x, ny)) npc.y = ny;
            }
          }
          if (npc.bedrest) {
            const docIn = sim.npcs.some(n => n.alive && n.doctor && n.scene === "i:hospital");
            npc.health = clamp(npc.health + (docIn ? CFG.HOSPITAL.bedRegenDoc : CFG.HOSPITAL.bedRegen) * dtHours, 0, 100);
          } else if (!npc.incap) npc.health = clamp(npc.health + CFG.HEALTH.regenAwake * dtHours, 0, 100);

          if (decide) { decideNPC(npc, sim, world, now); thiefTick(sim, world, npc); }
          moveNPC(npc, world, dt);
          npcAtGoal(npc, sim, world, dtHours, now);

          /* enforcer reaches their mark */
          if (npc.enforcer && npc.dispatch) {
            const t = npc.dispatch.targetId === "player" ? p : sim.npcs.find(n => n.id === npc.dispatch.targetId);
            if (t && !t.incap && t.scene === npc.scene && dist(npc, t) < 1.5) {
              // Stage 3.5: conviction happens HERE — an officer, a suspect, a case in hand
              const kase = npc.dispatch.caseId ? sim.cases.find(c => c.id === npc.dispatch.caseId) : null;
              if (kase && kase.state === "open") {
                kase.state = "solved";
                const priors = sim.cases.filter(c => c.suspectId === kase.suspectId && c.state === "solved").length;
                convictStars(sim, t, kase.type === "robbery" ? 2 : (priors >= 3 ? 2 : 1),
                  `${t.id ? t.name : "the player"} was convicted of ${kase.type}`);
              }
              if ((t.wanted || 0) > 0) resolveEnforcement(sim, world, npc, t, now);
              else npc.dispatch = null;                    // questioned; nothing stuck — no conviction, no stars
            }
          }

          /* Dex sizing up the player: night, quiet, your pockets jingling */
          if (npc.thief && !npc.incap && !npc.jailedUntil && npc.scene === p.scene && dist(npc, p) < 2 &&
              p.coins > 15 && ((sim.time / 60) % 24 >= 21 || (sim.time / 60) % 24 < 5) &&
              !sim.npcs.some(e => e.enforcer && e.alive && townOfScene(world, e.scene) === townOfScene(world, p.scene)) &&
              npc.lastRobDay !== sim.day && Math.random() < 0.0015 && !threatRef.current && !combatRef.current) {
            npc.lastRobDay = sim.day;
            setThreat({ robberId: npc.id });
          }

          if (npc.scene === p.scene && !npc.hidden && !npc.incap && !npc.jailedUntil && dist(npc, p) < CFG.GREET_RADIUS &&
              now - npc.lastGreet > CFG.GREET_COOLDOWN && !npc.activity.includes("sleep")) {
            npc.lastGreet = now;
            let line;
            if (p.hygiene < CFG.HYGIENE.social && Math.random() < 0.5) line = rand(["...you smell like the harbor at low tide.", "Bath. Today. Please.", "*discreetly steps upwind*"]);
            else if (sim.buzz && Math.random() < 0.35) line = sim.buzz.text;
            else if (npc.hunger < 25) line = rand(["Could eat a horse right now...", "Is it lunch yet?", "So. Hungry."]);
            else if (npc.energy < 30) line = rand(["*yawn* Long day...", "Running on fumes here.", "Need. Sleep."]);
            else if (npc.intent && Math.random() < 0.4) line = npc.intent;
            else line = rand(npc.greets);
            npc.bubble = { text: line, until: now + CFG.BUBBLE_SECONDS };

            if (npc.relationships.player === "friend" && npc.coins > 8 && npc.lastGiftDay !== sim.day && Math.random() < 0.15) {
              npc.lastGiftDay = sim.day;
              const itemId = Object.keys(npc.inv).find(id => npc.inv[id] > 0 && !ITEMS[id].dmg);   // nobody gifts their baton
              if (itemId && Math.random() < 0.5) receiveGift(sim, npc, p, { itemId });
              else receiveGift(sim, npc, p, { coins: 1 + Math.floor(Math.random() * 2) });
            }
          }
          if (npc.bubble && now > npc.bubble.until) npc.bubble = null;
        }
        if (p.bubble && now > p.bubble.until) p.bubble = null;   // Stage 6: the player's speech bubble expires too

        if (sim.crimeAlert && now > sim.crimeAlert.until) sim.crimeAlert = null;
        rollChatter(sim, world, now);
        { // the easy chair: energy lands only at each FULL 12-min mark; standing early forfeits the partial
          const pp = sim.player;
          if (pp.sitting) {
            const absNow = sim.day * 1440 + sim.time;
            const marks = Math.min(CFG.CHAIR.maxMarks, Math.floor((absNow - pp.sitting.sinceAbs) / CFG.CHAIR.markMin));
            if (marks > pp.sitting.marks) {
              pp.energy = clamp(pp.energy + CFG.CHAIR.perMark * (marks - pp.sitting.marks), 0, 100);
              pp.sitting.marks = marks; sfx.pop();
              showToast(`🪑 +${CFG.CHAIR.perMark} energy (${marks}/${CFG.CHAIR.maxMarks} marks)`);
            }
            if (marks >= CFG.CHAIR.maxMarks) { pp.sitting = null; showToast("🪑 An hour well sat. You feel better."); }
          }
        }
        // v7 Stage 1: DRAWN STEEL makes the street react — nerves, and the Watch's patience
        {
          const pp = sim.player;
          if (pp.unsheathed && !modalRef.current && Math.floor(sim.time / 2) !== sim._steelTick) {
            sim._steelTick = Math.floor(sim.time / 2);   // check every ~2 game-min
            const nearFolk = sim.npcs.filter(n => n.alive && !n.incap && !n.jailedUntil && n.scene === pp.scene && !n.hidden && dist(n, pp) < 3.5 && !n.activity.includes("sleep"));
            const civ = nearFolk.find(n => !n.enforcer && !n.outlaw && Math.random() < 0.25);
            if (civ && !civ.bubble) civ.bubble = { text: rand(["Is that a—?!", "Easy. EASY, friend.", "Put that away, would you?", "*backs off, hands up*"]), until: performance.now() / 1000 + 4 };
            const officer = nearFolk.find(n => n.enforcer);
            if (officer) {
              const absNow = sim.time + sim.day * 1440;
              if (!pp._steelWarned) {
                pp._steelWarned = true; pp.unsheathedAt = absNow;   // the clock starts at the warning
                officer.bubble = { text: rand(["Sheathe it. NOW.", "That comes out again, you come with me.", "Steel away. Last word."]), until: performance.now() / 1000 + 5 };
                sfx.alert(); showToast(`🛡️ ${officer.name}: put the weapon away.`);
              } else if (absNow - (pp.unsheathedAt || 0) > 60) {   // warned an hour ago, still waving it around
                convictStars(sim, pp, 1, "the player kept brandishing steel after a Watch warning");
                pp._steelWarned = false;
                showToast("⭐ Brandishing. The Watch has had enough of the display.");
              }
            }
          }
        }
        // v7 Stage 4: hang around the Outlands and eventually someone sizes you up
        {
          const hr9 = Math.floor(sim.time / 60);
          if (sim.player.scene === "t:outlands" && hr9 !== sim._ambHr && !modalRef.current) {
            sim._ambHr = hr9;
            if (Math.random() < CFG.OUTLANDS.ambushLinger + sim.player.coins / (CFG.OUTLANDS.wealthDiv * 4)) {
              const thug9 = sim.npcs.find(n => n.alive && n.town === "outlands" && !n.jailedUntil && !n.incap && !n.dying && (n.outlaw || !n.home) && n.scene === sim.player.scene);
              if (thug9) { thug9.x = clamp(sim.player.x + 1, 0, 99); thug9.y = sim.player.y; thug9.legs = []; thug9.path = []; thug9.goal = null; thug9.steelUntil = performance.now() / 1000 + 90; sfx.alert(); setThreat({ robberId: thug9.id }); }
            }
          } else if (sim.player.scene !== "t:outlands") sim._ambHr = hr9;
        }
        processTrades(sim);
        playDialogues(sim, now);

        saveTimerRef.current += dt;
        if (saveTimerRef.current > CFG.SAVE_INTERVAL) { saveTimerRef.current = 0; saveGame(); }
      }

      hudTimer += dt;
      if (hudTimer > 0.25) {
        hudTimer = 0;
        const sim2 = simRef.current, p = sim2.player;
        setHud({
          clock: `${pad2(Math.floor(sim2.time / 60))}:${pad2(Math.floor(sim2.time % 60))}`,
          day: sim2.day, coins: Math.floor(p.coins), town: worldRef.current.towns[townOfScene(worldRef.current, p.scene)].name,
          place: p.scene.startsWith("i:") ? bld(p.scene.slice(2)).name : null,
          hunger: Math.round(p.hunger), thirst: Math.round(p.thirst), energy: Math.round(p.energy),
          health: Math.round(p.health), hygiene: Math.round(p.hygiene), wanted: p.wanted, sick: p.sick?.level || null,
          tier: fameTier(p.fame, p.renown),
        });
        setActions(computeActions(sim2, worldRef.current));
      }
      draw(simRef.current, worldRef.current, nowMs);
      raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [screen]); // eslint-disable-line

  const isWalkable = (world, scene, fx, fy) => {
    const { walk, w, h } = sceneGrid(world, scene);
    const r = 0.3;
    for (const [ox, oy] of [[-r, -r], [r, -r], [-r, r], [r, r]]) {
      const tx = Math.round(fx + ox), ty = Math.round(fy + oy);
      if (tx < 0 || ty < 0 || tx >= w || ty >= h || !walk[ty][tx]) return false;
    }
    return true;
  };

  /* =================== CONTEXT ACTIONS =================== */
  const computeActions = (sim, world) => {
    const p = sim.player, out = [];
    const hour = (sim.time / 60) % 24;
    const near = (s, r = 1.6) => dist(p, s) < r;
    const armed = !!bestWeapon(p);

    if (p.dying && sim.settings.difficulty !== "easy") return [];   // no actions while bleeding out (Easy keeps its doors) — someone has to FIND you
    if (p.bedrest) {                                     // hospital gate: doctors keep critical patients down
      if (p.health >= CFG.HEALTH.critical)
        out.push({ id: "discharge", label: `🚪 Check out (pay ${p.hospitalBill}c)` });
      return out;
    }
    if (p.scene.startsWith("t:") && (p.inv.hatchet || 0) > 0) {   // v7 Stage 5: wood, if you brought the hatchet
      const twn = world.towns[p.scene.slice(2)];
      const tr = (twn.trees || []).find(([tx, ty]) => Math.abs(tx - p.x) < 1.6 && Math.abs(ty - p.y) < 1.6);
      if (tr) {
        const key = `${p.scene.slice(2)}:${tr[0]},${tr[1]}`;
        const rec = (sim.treeChops = sim.treeChops || {})[key];
        const used = rec?.day === sim.day ? rec.n : 0;
        if (used < CFG.CRAFT.chopPerTree) out.push({ id: "chopwood", label: `🪓 Chop wood (${CFG.CRAFT.chopPerTree - used} left today)`, chopKey: key });
      }
    }
    { // v7 Stage 5: the hill path — Alderbrook's NE corner up to the manor gate
      const HC = CFG.HILLS;
      if (p.scene === "t:alderbrook" && dist({ x: HC.trailAlder.x, y: HC.trailAlder.y }, p) < 2)
        out.push({ id: "hillpath", label: "⛰️ Take the hill path", dest: "hills" });
      if (p.scene === "t:hills" && dist({ x: HC.trailHills.x, y: HC.trailHills.y }, p) < 2)
        out.push({ id: "hillpath", label: "⛰️ Head back down to Alderbrook", dest: "alderbrook" });
    }
    { // v7 Stage 4: the shady route — a foot trail between Stonecross's SE corner and the camp
      const OC = CFG.OUTLANDS;
      if (p.scene === "t:stonecross" && dist({ x: OC.trailStone.x, y: OC.trailStone.y }, p) < 2)
        out.push({ id: "shadyroute", label: "🌲 Take the shady route", dest: "outlands" });
      if (p.scene === "t:outlands" && dist({ x: OC.trailOut.x, y: OC.trailOut.y }, p) < 2)
        out.push({ id: "shadyroute", label: "🌲 Slip back toward Stonecross", dest: "stonecross" });
    }
    if (p.scene.startsWith("i:")) {   // v7 Stage 5c: a broken appliance is a JOB for whoever holds the part
      const bId9 = p.scene.slice(2);
      for (const [st, part] of Object.entries(CFG.REPAIR.parts)) {
        if (world.interiors[bId9]?.stations?.[st] && applianceBroken(sim, bId9, st)) {
          const have = (p.inv[part] || 0) > 0;
          out.push(have
            ? { id: "repair", label: `🔧 Repair ${st === "wash" ? "bathroom" : st === "drinks" ? "drink machine" : "oven"} (${CFG.REPAIR.fee[st]}c fee)`, repairB: bId9, repairSt: st }
            : { id: "noop", label: `🔧 Broken ${st === "wash" ? "bathroom" : st === "drinks" ? "drink machine" : "oven"} — needs ${ITEMS[part].emoji} ${ITEMS[part].name}` });
        }
      }
    }
    { // the DEED: 500c at the manor door. Inside: the best bed in the valley (owners only).
      if (p.scene === "t:hills" && !sim.ownsManor) {
        const hh = bld("hillhouse");
        if (dist({ x: hh.door.x, y: hh.door.y }, p) < 2) out.push({ id: "buymanor", label: `🔑 Buy Hillcrest Manor (${CFG.HILLS.price}c)` });
      }
      if (p.scene === "i:hillhouse" && sim.ownsManor) {
        const bedSt = world.interiors.hillhouse.stations.bed;
        if (dist(bedSt, p) < 1.6) out.push({ id: "manorsleep", label: "🛏️ Sleep in the big bed" });
      }
    }
    { // v7 Stage 5: crafting — at the workshop bench, or at home beside your own Workbench
      const canHere = p.scene === "i:workshop_s"
        || (p.scene === "i:home_p" && p.furniture.includes("workbench"));
      if (canHere) out.push({ id: "craft", label: "🛠️ Craft…" });
      // the easy chair: real-time rest, 3 energy per full 12-min mark, anyone welcome
      if (p.scene === "i:home_p" && p.furniture.includes("chair") && !p.sitting)
        out.push({ id: "sitchair", label: "🪑 Sit in the easy chair" });
    }
    { // carry the wounded: any dying/downed NPC nearby can be hauled to care (five-stars go on to the cells)
      const downed = sim.npcs.find(n => n.alive && (n.dying || n.incap) && n.scene === p.scene && dist(n, p) < 1.6);
      if (downed) out.push({ id: "carry", label: `🏥 Carry ${downed.name} to hospital`, carry: downed.id });
    }
    if (p.scene.startsWith("t:")) {   // v7 Stage 3: forage a nearby bush (once per bush per day)
      const fTown = worldRef.current.towns[p.scene.slice(2)];
      const bush = fTown && bushSpots(fTown).find(([bx, by]) => dist({ x: bx, y: by }, p) < 1.4);
      if (bush && sim.foragedAt?.[`${p.scene}:${bush[0]},${bush[1]}`] !== sim.day)
        out.push({ id: "forage", label: "🌿 Forage", bush });
    }

    for (const npc of sim.npcs)
      if (npc.alive && !npc.incap && !npc.jailedUntil && npc.scene === p.scene && !npc.hidden && dist(npc, p) < CFG.TALK_RADIUS && !npc.activity.includes("sleep")) {
        // people actions moved to the LEFT STACK + target picker (G/T/H/B/Z) — no more per-NPC button spam
      }

    if (sim.crimeAlert && p.scene === `i:${sim.crimeAlert.bId}` && !sim.playerReport) {
      const thief = sim.npcs.find(n => n.id === sim.crimeAlert.thiefId);
      out.push({ id: "arrest", label: `🚨 Citizen arrest ${thief?.name || "them"}!` });
    }

    /* the dead, and the downed: report — or something darker */
    for (const body of sim.bodies)
      if (!body.discovered && body.scene === p.scene && dist(p, body) < 3)
        out.push({ id: `body_${body.npcId}`, label: `🚨 Report the body (${body.name})`, bodyNpc: body.npcId });
    for (const npc of sim.npcs)
      if (npc.alive && (npc.incap || npc.dying) && npc.scene === p.scene && dist(npc, p) < 1.8 && armed)
        out.push({ id: `finish_${npc.id}`, label: `🔪 Finish ${npc.name}`, finish: npc.id });
    for (const cid of sim.carryOrders || []) {           // Stage: may be hauling several
      const o = sim.orders.find(o => o.id === cid);
      if (o && p.scene === `t:${bld(o.bId).town}` && dist(p, bld(o.bId).door) < 1.8)
        out.push({ id: `drop_${cid}`, label: `📦 Drop parcel at ${bld(o.bId).name}`, drop: cid });
    }

    if (p.scene.startsWith("t:")) {
      const town = world.towns[p.scene.slice(2)];
      for (const b of BUILDINGS.filter(b => b.town === town.id && b.enterable))
        if (near(b.door)) out.push({ id: `enter_${b.id}`, label: `🚪 Enter ${b.name}`, enter: b.id });
      if (near(town.drink, 1.8)) out.push({ id: "drink", label: `💧 Drink (${town.drink.label})` });
      if (near(town.busStop, 1.8)) out.push({ id: "travel", label: "🚌 Mo's Bus — routes & fares" });
      // Stage 3: anyone CAN rough it; only the locked-out or exhausted are offered it
      if (near(town.spots.bench, 1.8) && (p.evicted || p.energy < 50))
        out.push({ id: "sleepbench", label: "🛋️ Sleep on the bench" });
      if (town.id === "mossford" && near(town.spots.dock, 1.8) && !minigameRef.current)
        out.push({ id: "castmenu", label: "🎣 Cast a line", castmenu: true });
      if (sim.mail) for (const letter of sim.mail.letters)
        if (!letter.delivered && bld(letter.bId).town === town.id && near(bld(letter.bId).door))
          out.push({ id: `deliver_${letter.bId}`, label: `📬 Deliver to ${bld(letter.bId).name}`, deliver: letter.bId });
    } else {
      const bId = p.scene.slice(2), inter = world.interiors[bId];
      const at = (name, r = 1.4) => inter.stations[name] && near(inter.stations[name], r);
      const shopStn = SHOP_STATION[bId];

      if (SHOP_STOCK[bId] && at(shopStn)) out.push({ id: "browse", label: `🛒 Browse ${bld(bId).name}`, browse: bId });
      // Stage 5: at your OWN counter → manage the business (registers + upgrades)
      if (at(shopStn) && OWNERS[bId] === "player") out.push({ id: "manage", label: "⚙️ Manage business", manage: bId });
      if (bId === "workshop_s" && at(shopStn)) {
        const ready = (sim.contracts || []).filter(c => sim.day >= c.readyDay);
        for (const c of ready.slice(0, 3)) {
          const r = CFG.CRAFT.recipes[c.recipeId], thing = r.furn ? FURNITURE[c.recipeId] : ITEMS[c.recipeId];
          out.push({ id: "pickup", label: `📦 Pick up: ${thing.emoji} ${thing.name}`, pickup: c.recipeId });
        }
      }
      if (bId === "workshop_s" && at(shopStn) && (p.inv.rock || 0) >= CFG.CRAFT.smelt.rocks
          && (OWNERS[bId] === "player" || sim.npcs.find(n => n.id === OWNERS[bId] && n.alive && n.scene === `i:${bId}`)))
        out.push({ id: "smelt", label: `🔩 Smelt ${CFG.CRAFT.smelt.rocks} rocks → iron bits${OWNERS[bId] === "player" ? "" : ` (${CFG.CRAFT.smelt.fee}c)`}` });
      // v7 Stage 5: every private business has a price — but the OWNER names it (talk first)
      if (at(shopStn) && BUSINESS_PRICE[bId] && OWNERS[bId] && OWNERS[bId] !== "player" && sim.npcs.find(n => n.id === OWNERS[bId] && n.alive))
        out.push({ id: "buybiz", label: `💼 Ask about buying ${bld(bId).name}`, buybiz: bId });
      if (at("mayor") || at("tax")) out.push({ id: "cityledger", label: sim.playerMayor ? "🏛️ Govern (mayor's office)" : "🏛️ Hall — ledger, taxes & elections" });
      // Stage 5: someone else's counter with a stocked register → rob it (confirmation-gated below)
      if (at(shopStn) && OWNERS[bId] && OWNERS[bId] !== "player" && sim.registers[bId]?.cash > 0) {
        const keeper = keeperOf(sim, bId), watched = keeper && keeper.scene === `i:${bId}`;
        out.push({ id: "robreg", label: `${watched ? "⚠️" : "💰"} Rob the register`, robreg: bId });
      }
      if ((at("wash") || at("bath"))) out.push({ id: "wash", label: "🚿 Wash up" });
      const kStn = inter.stations.stove ? "stove" : inter.stations.grill ? "grill" : null;   // Crispy Hen cooks at a grill
      if (kStn && at(kStn) && !minigameRef.current && !sim.foodOrder) {   // an active take-order uses the grill panel instead
        out.push({ id: "cook", label: "🍳 Cook" });
        if (KITCHEN[bId] && OWNERS[bId] && hour >= 8 && hour < 19)
          out.push({ id: "chef", label: `👨‍🍳 Chef shift (+${CFG.ECON.chef.wage}c)`, chefB: bId });
      }
      if (inter.stations.drinks && at("drinks") && !minigameRef.current) {
        out.push({ id: "mixdrinks", label: "🥤 Mix a drink" });   // Stage 3.8: the drink bar
        if (KITCHEN[bId] && OWNERS[bId] && hour >= 8 && hour < 19)
          out.push({ id: "chef", label: `☕ Barista shift (+${CFG.ECON.chef.wage}c)`, chefB: bId });
      }
      if (bId === "home_p" && at("bed")) out.push({ id: "sleep", label: "🛏️ Sleep until morning" });
      // Stage 4: furniture-granted home stations — if you own the piece and you're home, you can use it.
      if (p.home && bId === p.home && !minigameRef.current) {
        if (p.furniture.includes("oven") && !inter.stations.stove) out.push({ id: "cook", label: "🍳 Cook (home oven)" });
        if (p.furniture.includes("drinkbar") && !inter.stations.drinks) out.push({ id: "mixdrinks", label: "🥤 Mix a drink (home bar)" });
        if (p.furniture.includes("fountain")) out.push({ id: "homedrink", label: "⛲ Drink from your fountain" });
        if (bestStore(p)) out.push({ id: "storage", label: `🔒 Home storage (${p.stored}c stored)` });
        if (p.furniture.includes("chest")) out.push({ id: "chest", label: "🧰 Open storage chest" });
      }
      if (bId === "home_p" && !sim.party) out.push({ id: "party", label: "🎉 Throw a house party" });
      if (bId === "inn" && at("rentbed")) out.push({ id: "rentbed", label: `🛏️ Rent a bed (${CFG.INN_BED}c)` });
      if (bId === "hospital" && at("treat") && p.health < 70)
        out.push({ id: "treat", label: `🩺 Treat wounds (${Math.ceil(CFG.HOSPITAL.walkIn * diff().billMult)}c)` });
      if (inter.stations.couch && at("couch") && (p.job?.bId === bId || p.occupation?.bId === bId))
        out.push({ id: "couchrest", label: "🛋️ Rest an hour on the staff couch" });   // Stage 3.5: employees only
      if (bId.startsWith("townhall") && at("safe")) {
        out.push({ id: "safepeek", label: "🔍 Check the town safe" });   // Stage 3: escrow made visible
        const tSafe = bld(bId).town;
        if ((sim.treasury[tSafe] || 0) >= CFG.SAFE_ROB.minLoot)
          out.push({ id: "cracksafe", label: "🥷 Crack the town safe (3★ · Extreme)" });
      }
      /* someone else's home with a cash stash standing in it → the burglar's option */
      if (isHomeId(bId) && bId !== p.home) {
        const residents = sim.npcs.filter(n => n.alive && n.home === bId);
        const loot = residents.reduce((s, n) => s + (n.stored || 0), 0);
        const store = residents.some(n => (n.furniture || []).includes("safe")) ? "safe"
          : residents.some(n => (n.furniture || []).includes("piggy")) ? "piggy" : null;
        if (store && loot > 0)
          out.push({ id: "crackstash", label: `🥷 Crack the ${FURNITURE[store].name.toLowerCase()} (${store === "safe" ? "Extreme" : "Hard"})`, stash: store, stashB: bId });
      }
      if ((bId === "hq" || bId.startsWith("watchpost")) && at("report") && sim.playerRobbedBy)
        out.push({ id: "reportrob", label: "🚨 Report the robbery" });
      if (bId === "home_p" && sim.mess.home_p > 20) out.push({ id: "sweep", label: "🧹 Sweep up" });
      if (bId !== "home_p" && p.inv.broom > 0 && sim.mess[bId] > 20 && !sim.task)
        out.push({ id: "sweep", label: "🧹 Sweep (your broom)" });

      if (sim.task?.bId === bId) {
        const spot = sim.task.spots.find(s => !s.done && near(s, 1.2));
        if (spot) out.push({ id: "taskspot", label: sim.task.kind === "clean" ? "🧽 Scrub here" : "📦 Stock shelf", spot });
        if (sim.task.kind === "restock" && sim.task.spots.every(s => s.done) && at(shopStn))
          out.push({ id: "finishrestock", label: `✅ Finish restocking (+${CFG.PAY.restock}c)` });
      }

      if (bId === "office" && at("desk_you") && hour >= 8 && hour < 18 && !minigameRef.current) {
        if (stockOf(sim, "office", "files") > 0)
          out.push({ id: "filing", label: `🗂️ Filing task (+${CFG.ECON.office_sort.wage}c) · ${stockOf(sim, "office", "files")} files left` });
        if (stockOf(sim, "office", "files") < CFG.STOCK.printAt)
          out.push({ id: "print", label: `🖨️ Print run (+${CFG.ECON.office_print.wage}c) — tedious` });
      }
      if (bId === "fastfood" && hour >= 10 && hour < 20) {
        if (!sim.foodOrder && at("staff")) out.push({ id: "takeorder", label: "📋 Take an order" });
        if (sim.foodOrder?.stage === "serve" && at("staff")) out.push({ id: "serve", label: `🍽️ Serve order (+${CFG.PAY.food}c)` });
      }
      if (EATERY_MEAL[bId] && at("staff") && hour >= 8 && hour < 19 && !minigameRef.current) {
        const pile = sim.dishes?.[bId] || 0;
        out.push({ id: "dish", label: `🍽️ Wash dishes${pile ? ` (${pile} stacked)` : ""} (+${CFG.PAY.dish}c)` });
      }
      if (bId === "post" && at("mail") && hour >= 8 && hour < 18) {
        if (!sim.mail) out.push({ id: "mailroute", label: "📦 Pick up mail route (3 letters)" });
        else out.push({ id: "mailturnin", label: `📮 Turn in route (${sim.mail.letters.filter(l => l.delivered).length}/3 done)` });
        const cap = parcelCap(p), carrying = (sim.carryOrders || []).length;
        if (carrying >= cap && cap > 1) out.push({ id: "parcelfull", label: `📦 Carrying ${carrying}/${cap} parcels`, disabled: true });
        for (const o of sim.orders.filter(o => o.state === "ready" && !o.claimedBy && !(sim.carryOrders || []).includes(o.id)).slice(0, 3)) {
          if (carrying >= cap) break;                      // at capacity — no more pickups until a drop
          const fee = bld(o.bId).town !== "alderbrook" ? (CFG.FARES.alderbrook[bld(o.bId).town]?.c || 0) + CFG.DELIVERY.feeCrossBase : CFG.DELIVERY.feeSame;
          out.push({ id: `haul_${o.id}`, label: `🚚 Take parcel → ${bld(o.bId).name} (+${fee}c)${cap > 1 ? ` [${carrying}/${cap}]` : ""}`, haul: o.id });
        }
      }
      if ((bId === "hq" || bId.startsWith("watchpost")) && at("report")) out.push({ id: "caseboard", label: "📋 Case board & ledgers" });
      if (sim.opening?.bId === bId && !sim.opening.done && sim.day === sim.opening.day &&
          hour >= sim.opening.hour && hour < sim.opening.hour + CFG.JOBS.interviewWindow &&
          (sim.interviewBans[bId] || 0) <= sim.day) {
        const boss = keeperOf(sim, bId);
        if (boss && boss.scene === `i:${bId}`) out.push({ id: "interview", label: `🤝 Interview with ${boss.name}` });
      }
      if ((bId === "hospital" || bId.startsWith("clinic")) && at("treat") && p.sick)
        out.push({ id: "treatsick", label: `💊 Treat illness (${CFG.SICK.medFee}c)` });
      if (bId === "mart" && at(shopStn) && hour >= 9 && hour < 19 && !sim.task)
        out.push({ id: "restock", label: `📦 Restock shift (+${CFG.PAY.restock}c)` });
      if (SHOP_STOCK[bId] && sim.mess[bId] >= 40 && !sim.task && bId !== "home_p")
        out.push({ id: "clean", label: `🧹 Cleaning shift (+${CFG.PAY.clean}c)` });
    }
    return out;
  };

  const spend = (p, n) => { if (p.coins < n) { showToast("Not enough coins."); return false; } p.coins -= n; return true; };
  const taskSpots = (world, bId, n) =>
    [...world.interiors[bId].floors].sort(() => Math.random() - 0.5).slice(0, n).map(f => ({ ...f, done: false }));

  const doAction = (a) => {
    sfx.click();
    const sim = simRef.current, world = worldRef.current, p = sim.player;
    const now = performance.now() / 1000;
    if (a.trade) { setTradePanel({ npcId: a.trade, giveC: 0, giveItem: "", giveQty: 1, askC: 0, askItem: "", askQty: 1, note: "" }); return; }
    if (a.npc) return openChat(a.npc);
    if (a.pay) { setPayPanel({ npcId: a.pay }); setPayAmount(""); return; }
    if (a.threaten) return threatenNPC(a.threaten);
    if (a.finish) return finishDowned(a.finish);
    if (a.bodyNpc) {
      const body = sim.bodies.find(b => b.npcId === a.bodyNpc);
      if (body) { discoverBody(sim, body, "player"); repEvent(sim, p, 1, 1, "the player reported a body"); showToast("The Watch has been notified. You did the right thing."); }
      return;
    }
    if (a.drop) {                                        // Stage: drop one carried parcel at its destination
      const o = sim.orders.find(o => o.id === a.drop);
      if (o) {
        fulfillOrder(sim, o, p);                          // the fee itself pays here
        completeTask(sim, "stock", "post", { note: "the player ran a delivery" });   // xp only
        showToast(`Delivered! Shelves stocked, fee collected.`);
      }
      sim.carryOrders = (sim.carryOrders || []).filter(id => id !== a.drop);
      bump(); return;
    }
    if (a.haul) {
      sim.carryOrders = [...(sim.carryOrders || []), a.haul];
      const o = sim.orders.find(o => o.id === a.haul);
      const cap = parcelCap(p), n = sim.carryOrders.length;
      showToast(`Parcel for ${bld(o.bId).name} in ${TOWN_DEFS[bld(o.bId).town].name}.${cap > 1 ? ` (${n}/${cap} carried)` : ""} Get it to their door.`);
      return;
    }
    if (a.chefB) { setCookPanel({ chef: a.chefB }); return; }
    if (a.browse) return setShopPanel({ bId: a.browse });
    if (a.manage) return setManagePanel({ bId: a.manage });   // Stage 5: owner upgrade panel
    if (a.robreg) {   // Stage 5: rob a register — confirmation-gated, yield shown by security level
      const bId = a.robreg, reg = simRef.current.registers[bId];
      if (!reg || reg.cash <= 0) { showToast("The till's empty."); return; }
      const yieldPct = Math.round((CFG.REGISTER.robYield[reg.security] ?? 0.9) * 100);
      const est = Math.floor(reg.cash * (CFG.REGISTER.robYield[reg.security] ?? 0.9));
      if (regRobArmRef.current?.bId === bId && performance.now() - regRobArmRef.current.at <= 3500) {
        regRobArmRef.current = null;
        const res = robRegister(simRef.current, bId, simRef.current.player);
        if (res) {
          sfx.alert(); showToast(`💰 Grabbed ${res.took}c from the till!${res.alarm ? " 🚨 ALARM!" : ""}`);
          const keeper = keeperOf(simRef.current, bId);
          if (res.alarm || (keeper && keeper.scene === `i:${bId}`)) {   // caught in the act
            convictStars(simRef.current, simRef.current.player, 2, "the player robbed a register");
            if (keeper) keeper.report = { thiefId: "player", crime: "register robbery", victimName: bld(bId).name };
          }
          bump();
        }
      } else {
        regRobArmRef.current = { bId, at: performance.now() };
        showToast(`Rob the ${bld(bId).name} till? ${yieldPct}% security-adjusted → ~${est}c. Tap again to confirm.`);
      }
      return;
    }
    if (a.enter) {
      if (a.enter === "home_p" && sim.player.evicted) { showToast("🔒 The locks are changed. Clear your debts first."); return; }
      const inter = world.interiors[a.enter];
      p.scene = `i:${a.enter}`; p.x = inter.exit.x; p.y = inter.exit.y - 1;
      return;
    }
    if (a.deliver) {
      const letter = sim.mail.letters.find(l => l.bId === a.deliver);
      letter.delivered = true;
      p.energy = clamp(p.energy - CFG.WORK_COST.mail.energy, 0, 100);
      showToast(`Delivered to ${bld(a.deliver).name}.`);
      return;
    }
    switch (a.id) {
      case "travel": setTravelPanel(true); break;
      case "drink": {
        p.thirst = clamp(p.thirst + 60, 0, 100);
        if (!p.sick && Math.random() < CFG.SICK.contam) {   // bottled water never does this to you
          p.sick = { level: "mild" };
          showToast("Cold and clear... and tasting faintly of regret. 🤒");
        } else showToast("Cold and clear.");
        break;
      }
      case "wash": {
        if (!useAppliance(sim, p.scene.slice(2), "wash")) { showToast("🚿 …nothing but a sad gurgle. It's broken."); bump(); break; }
        p.hygiene = 100;
        sim.time += CFG.HYGIENE.washMin;
        showToast("Scrubbed and human again.");
        break;
      }
      case "couchrest": {                                 // Stage 3.5: an hour on the cushions, on the clock
        sim.time += 60; if (sim.time >= 1440) { sim.time -= 1440; sim.day++; }
        p.energy = clamp(p.energy + CFG.COUCH.regenPerHr, 0, 100);
        showToast("An hour on the staff couch. Don't tell the customers.");
        break;
      }
      case "sleepbench": {                                // Stage 3: half the rest of a bed, and it's illegal
        const fromAbs = sim.day * 1440 + sim.time;         // Stage 3.5
        const bench = 7 * 60;
        if (sim.time >= bench) sim.day++;
        sim.time = bench;
        fastForwardNight(sim, worldRef.current, fromAbs, sim.day * 1440 + sim.time);
        p.energy = clamp(p.energy + 50, 0, 100);          // a real bed sets you to 100
        p.hygiene = clamp(p.hygiene - 25, 0, 100);        // and it shows
        p.hunger = clamp(p.hunger - 12, 0, 100); p.thirst = clamp(p.thirst - 12, 0, 100);
        p.health = clamp(p.health + 10, 0, 100);
        // the night beat: any officer in your town may have passed by while you slept
        const copAbout = sim.npcs.some(n => n.alive && n.enforcer && townOfScene(worldRef.current, n.scene) === townOfScene(worldRef.current, p.scene));
        if (copAbout && Math.random() < 0.5) {
          if (!p.vagrantWarned) { p.vagrantWarned = true; showToast(`👮 "Move along. Next time it's a citation."`); }
          else { convictStars(sim, p, 1, "the player was cited for vagrancy"); showToast("👮 Cited for vagrancy."); }
        } else showToast("A stiff night on the bench.");
        saveGame();
        break;
      }
      case "safepeek": {
        const t = bld(p.scene.slice(2)).town;
        showToast(`🔐 The ${t} safe holds ${Math.floor(sim.treasury[t] || 0)}c.`);
        break;
      }
      case "sleep": {
        const fromAbs = sim.day * 1440 + sim.time;         // Stage 3.5: the town rests when you do
        const target = 7 * 60;
        if (sim.time >= target) sim.day++;
        sim.time = target;
        fastForwardNight(sim, worldRef.current, fromAbs, sim.day * 1440 + sim.time);
        p.energy = 100; p.hygiene = clamp(p.hygiene + 50, 0, 100);
        p.hunger = clamp(p.hunger - 12, 0, 100); p.thirst = clamp(p.thirst - 12, 0, 100);
        p.health = clamp(p.health + 25, 0, 100);
        saveGame();
        showToast("A solid night's sleep.");
        break;
      }
      case "rentbed": {
        if (!spend(p, CFG.INN_BED)) break;
        const keeper = keeperOf(sim, "inn");
        if (keeper) keeper.coins = Math.min(9999, keeper.coins + CFG.INN_BED);
        const fromAbs = sim.day * 1440 + sim.time;         // Stage 3.5
        const target = 7 * 60;
        if (sim.time >= target) sim.day++;
        sim.time = target;
        fastForwardNight(sim, worldRef.current, fromAbs, sim.day * 1440 + sim.time);
        p.energy = 100; p.hygiene = 100; p.health = clamp(p.health + 30, 0, 100);
        p.hunger = clamp(p.hunger - 12, 0, 100); p.thirst = clamp(p.thirst - 12, 0, 100);
        saveGame();
        showToast("Fresh linens. Hollis says goodnight twice.");
        break;
      }
      case "treat": {
        const fee = Math.ceil(CFG.HOSPITAL.walkIn * diff().billMult);
        if (!spend(p, fee)) break;
        const wdoc = facilityDoctor(sim, "hospital");
        if (wdoc) wdoc.coins += fee;                      // Stage 3: the fee is the doctor's, not the void's
        p.health = clamp(p.health + CFG.HOSPITAL.walkInHeal, 0, 100);
        showToast(`Dr. Amara patches you up. "Try dodging next time."`);
        break;
      }
      case "discharge": {
        const bill = p.hospitalBill;                       // Stage 3: heavy care pays the doctor; a friend may step in
        const ddoc = facilityDoctor(sim, "hospital");
        const payer = p.coins < bill ? friendCoversBill(sim, "player", bill) : null;
        if (payer) { payer.coins -= bill; if (ddoc) ddoc.coins += bill; showToast(`💛 ${payer.name} quietly covered your ${bill}c bill.`); }
        else { const paid = Math.min(Math.max(0, Math.floor(p.coins)), bill); p.coins -= paid; if (ddoc && paid) ddoc.coins += paid; }   // what you can't pay, Mercy forgives (for now)
        p.bedrest = false; p.hospitalBill = 0;
        showToast("Discharged. Walk it off — gently.");
        break;
      }
      case "reportrob": {
        if (sim.playerRobbedBy) fileReport(sim, p, sim.playerRobbedBy, "robbery", "the player");   // Stage 3.5: same pipe as every report
        sim.playerRobbedBy = null;
        repEvent(sim, p, 1, 1, "the player reported a robbery");
        showToast("Tessa writes it in the tally book. Twice.");
        break;
      }
      case "arrest": {
        sim.playerReport = { thiefId: sim.crimeAlert.thiefId };
        sim.crimeAlert = null;
        showToast("You call it out — now step outside to make it official.");
        break;
      }
      case "sweep": {
        const bId = p.scene.slice(2);
        const amt = bId === "home_p" ? CFG.MESS.playerSweep : CFG.MESS.broomSweep;
        sim.mess[bId] = Math.max(0, sim.mess[bId] - amt);
        p.energy = clamp(p.energy - CFG.WORK_COST.sweep.energy, 0, 100);
        sim.time += CFG.WORK_COST.sweep.min;
        showToast("Swept. Satisfying.");
        break;
      }
      case "cook": setCookPanel(true); break;
      case "mixdrinks": setCookPanel({ drinks: true }); break;   // Stage 3.8: panel filters to drink recipes
      case "homedrink": {   // Stage 4: home fountain — free drink like a town fountain
        const p = simRef.current.player;
        p.thirst = clamp(p.thirst + 40, 0, 100);
        showToast("⛲ Fresh water at home."); bump(); break;
      }
      case "storage": setStoragePanel(true); break;   // Stage 4: deposit/withdraw cash
      case "chest": setChestPanel(true); break;        // Stage 4: item storage
      case "party": setPartyPanel({ dinner: PARTY_MENU.dinner[0], dessert: PARTY_MENU.dessert[0], drink: PARTY_MENU.drink[0] }); break;
      case "caseboard": setCaseBoard(true); break;
      case "interview": {
        const bossN = keeperOf(sim, p.scene.slice(2));
        if (!bossN) break;
        sim.interview = { bId: p.scene.slice(2), npcId: bossN.id };
        openChat(bossN.id);
        break;
      }
      case "dropparcel": break;   // (superseded — handled by early-return a.drop above)
      case "treatsick": {
        const facility = p.scene.slice(2);
        if (!takeStock(sim, facility, "medicine")) { showToast("They're OUT of medicine. Try the mart — or Mercy."); break; }
        if (!spend(p, CFG.SICK.medFee)) { addStock(sim, facility, "medicine", 1); break; }
        if (facility === "hospital") {
          const amara = sim.npcs.find(n => n.id === "amara" && n.alive);
          if (amara) amara.coins = Math.min(9999, amara.coins + CFG.SICK.medFee);
          showToast("Dr. Amara sorts you out. 'Drink BOTTLED water, hm?'");
        } else showToast("The clinic nurse sorts you out. 'Rest. Fluids. BOTTLED ones.'");
        p.sick = null;
        break;
      }
      case "print": startPrint(); break;
      case "filing": {
        if (!takeStock(sim, "office", "files")) { showToast("The cabinet is EMPTY. Someone needs to print."); break; }
        const fk = fileKnobs();
        setMinigame({ type: "office", round: 0, rounds: fk.rounds, cats: fk.cats, target: rand(fk.cats) });
        break;
      }
      case "dish":   setMinigame({ type: "dish", plate: 0, step: 0 }); break;
      case "castmenu": setCastPanel(true); break;
      case "buymanor": {   // the wealth capstone: the house on the hill above your first town
        if (!spend(p, CFG.HILLS.price)) { showToast(`You need ${CFG.HILLS.price}c. The view isn't going anywhere.`); break; }
        sim.ownsManor = true;
        repEvent(sim, p, 12, 8, "the player bought Hillcrest Manor");
        for (const t9 of ["alderbrook", "mossford", "stonecross", "ferndale"])
          seedGossip(sim, sim.npcs.filter(n => n.alive && n.town === t9).slice(0, 3), { text: "someone BOUGHT the house on the hill", subjectId: null, bad: false });
        sim.dayLog.push("the player bought Hillcrest Manor — the house on the hill");
        sfx.coin(); showToast("🔑 Hillcrest Manor is YOURS. The whole valley, out the window.");
        bump(); break;
      }
      case "manorsleep": {   // the best sleep in the game — the manor earns its price nightly
        const fromAbs = sim.day * 1440 + sim.time;
        const target = 7 * 60;
        if (sim.time >= target) sim.day++;
        sim.time = target;
        fastForwardNight(sim, worldRef.current, fromAbs, sim.day * 1440 + sim.time);
        p.energy = 100; p.hygiene = clamp(p.hygiene + 60, 0, 100);
        p.hunger = clamp(p.hunger - 8, 0, 100); p.thirst = clamp(p.thirst - 8, 0, 100);
        p.health = clamp(p.health + 35, 0, 100);   // hill air: better than any bed in the valley
        saveGame();
        showToast("🛏️ You sleep like a landowner. Because you are one.");
        break;
      }
      case "hillpath": {
        const HC = CFG.HILLS, spot = a.dest === "hills" ? HC.trailHills : HC.trailAlder;
        sim.time += HC.walkMin;
        p.scene = `t:${a.dest}`; p.x = spot.x; p.y = spot.y;
        setTransition(a.dest === "hills" ? "The path climbs. The towns shrink behind you…" : "Downhill, with the whole valley in view…");
        setTimeout(() => setTransition(null), 1800);   // the overlay pauses the sim — it MUST clear (was a softlock)
        bump(); break;
      }
      case "noop": break;
      case "repair": setRepairPanel({ bId: a.repairB, st: a.repairSt, stage: "game", kind: a.repairSt === "wash" ? "sliders" : a.repairSt === "drinks" ? "knob" : "buttons" }); break;
      case "pickup": {   // the commission comes home
        const idx = (sim.contracts || []).findIndex(c => c.recipeId === a.pickup && sim.day >= c.readyDay);
        if (idx < 0) break;
        sim.contracts.splice(idx, 1);
        const r = CFG.CRAFT.recipes[a.pickup];
        if (r.furn) { p.furniture.push(a.pickup); sim.playerFurniture = p.furniture; setPlacePanel({ furnId: a.pickup }); showToast(`🪑 ${FURNITURE[a.pickup].name} — delivered home. Pick where it goes.`); }
        else { p.inv[a.pickup] = (p.inv[a.pickup] || 0) + (r.out || 1); showToast(`📦 ${ITEMS[a.pickup].emoji} ${ITEMS[a.pickup].name}${r.out ? ` ×${r.out}` : ""} — nice work, honestly.`); }
        sfx.coin(); bump(); break;
      }
      case "craft": setCraftPanel({ stage: "pick" }); break;
      case "sitchair": {
        p.sitting = { sinceAbs: sim.day * 1440 + sim.time, marks: 0 };
        showToast("🪑 You settle in. (+3 energy per full 12 minutes — leave early and the last stretch is lost.)");
        bump(); break;
      }
      case "smelt": {   // the owner works the little furnace: 3 round rocks in, iron bits out
        const own = OWNERS.workshop_s === "player";
        if ((p.inv.rock || 0) < CFG.CRAFT.smelt.rocks) break;
        if (!own && !spend(p, CFG.CRAFT.smelt.fee)) { showToast(`You need ${CFG.CRAFT.smelt.fee}c for the smelting fee.`); break; }
        if (!own) creditOwner(sim, "workshop_s", CFG.CRAFT.smelt.fee);
        p.inv.rock -= CFG.CRAFT.smelt.rocks; if (p.inv.rock <= 0) delete p.inv.rock;
        p.inv.ore = (p.inv.ore || 0) + 1;
        sim.time += 10; sfx.pop(); showToast("🔩 Three rocks in, one handful of iron bits out.");
        bump(); break;
      }
      case "chopwood": {   // 1-2 pieces; the tree keeps 2 harvests a day TOTAL, across everyone. It survives. Game logic.
        const rec = (sim.treeChops = sim.treeChops || {})[a.chopKey];
        const used = rec?.day === sim.day ? rec.n : 0;
        if (used >= CFG.CRAFT.chopPerTree) { showToast("This tree's given all it has today."); break; }
        sim.treeChops[a.chopKey] = { day: sim.day, n: used + 1 };
        const got = 1 + (Math.random() < 0.5 ? 1 : 0);
        p.inv.wood = (p.inv.wood || 0) + got;
        sim.time += 8; sfx.pop();
        showToast(`🪵 ${got} cut wood. The tree, improbably, is fine.`);
        bump(); break;
      }
      case "buybiz": {   // the handshake now starts with a CONVERSATION — the owner names their price
        const bId = a.buybiz, base = BUSINESS_PRICE[bId];
        const seller = sim.npcs.find(n => n.id === OWNERS[bId] && n.alive);
        if (!seller) { showToast("No one to sell it."); break; }
        sim.bizQuotes = sim.bizQuotes || {};
        const q = sim.bizQuotes[bId];
        if (q && q.day === sim.day) { setBizOffer({ bId, price: q.price, say: q.say }); break; }   // today's number is today's number
        const lo = Math.round(base * 0.6), hi = Math.round(base * 1.8);
        const fallback = () => {
          sim.bizQuotes[bId] = { day: sim.day, price: base, say: `${base} coins, flat. That's the honest number.` };
          setBizOffer({ bId, ...sim.bizQuotes[bId] });
        };
        if (USER_API_KEY && !apiBusyRef.current) {
          apiBusyRef.current = true;
          showToast(`You talk numbers with ${seller.name}…`);
          bizQuote(seller.name, seller.personality, bld(bId).name, base, seller.grossThisPeriod || 0)
            .then(out => {
              const price = clamp(Math.round(Number(out?.price) || base), lo, hi);
              sim.bizQuotes[bId] = { day: sim.day, price, say: (out?.say || "").slice(0, 140) || "That's my number." };
              setBizOffer({ bId, ...sim.bizQuotes[bId] });
            })
            .catch(fallback)
            .finally(() => { apiBusyRef.current = false; });
        } else fallback();
        break;
      }
      case "cracksafe": {   // the town safe: 3★, Extreme-tier — the biggest lock in the valley
        const bId = p.scene.slice(2), t9 = bld(bId).town;
        const absMin9 = sim.day * 1440 + sim.time;
        if (!canAttempt(p, `safe_${t9}`, absMin9, 2)) { showToast("You've drawn enough attention at this safe today. Come back tomorrow."); break; }
        sim.time += 25;
        const witnesses9 = sim.npcs.filter(n => n.alive && !n.incap && !n.jailedUntil && n.scene === p.scene && !n.activity.includes("sleep"));
        if (Math.random() < tierSuccess(p, 3, "service")) {
          const take = Math.max(1, Math.floor((sim.treasury[t9] || 0) * CFG.SAFE_ROB.yield));
          sim.treasury[t9] = Math.max(0, (sim.treasury[t9] || 0) - take);
          p.coins += take; clearCheck(p, `safe_${t9}`);
          openCase(sim, "safe_robbery", { victim: `the ${t9} treasury`, scene: p.scene, x: Math.round(p.x), y: Math.round(p.y), killerId: "player", evidence: witnesses9.length ? 3 : 2 });
          if (sim.approval[t9] != null) sim.approval[t9] = clamp(sim.approval[t9] - 5, 0, 100);
          sim.dayLog.push(`someone cracked the ${t9} town safe overnight`);
          pushFx(sim, p.scene, p.x, p.y, "crime");
          if (witnesses9.length) { convictStars(sim, p, 3, "the player was SEEN robbing the town safe"); sfx.alert(); showToast(`💰 ${take}c — but you were SEEN. (3★)`); }
          else { sfx.coin(); showToast(`💰 ${take}c from the town safe. Walk away calm.`); }
        } else {
          recordFail(p, `safe_${t9}`, absMin9, 120);
          if (witnesses9.length || Math.random() < 0.4) { convictStars(sim, p, 3, "the player was caught cracking the town safe"); sfx.alert(); showToast("🚨 The lock beats you — and the alarm doesn't miss. (3★)"); }
          else showToast("The dial spins, the lock holds. Nothing for it — walk away.");
        }
        bump(); break;
      }
      case "crackstash": {   // burgle a resident's piggy bank / safe — the furniture makes it REAL
        const bId = a.stashB, store9 = a.stash;
        const absMin9 = sim.day * 1440 + sim.time;
        if (!canAttempt(p, `stash_${bId}`, absMin9, 2)) { showToast("You've made enough noise here today."); break; }
        sim.time += 15;
        const residents9 = sim.npcs.filter(n => n.alive && n.home === bId);
        const witnesses9 = sim.npcs.filter(n => n.alive && !n.incap && n.scene === p.scene && !n.activity.includes("sleep"));
        const tier9 = FURNITURE[store9]?.secure === 3 ? 3 : 2;
        if (Math.random() < tierSuccess(p, tier9, "service")) {
          let take = 0;
          for (const r of residents9) { const cut = Math.floor((r.stored || 0) * CFG.FURN.burglaryYield); r.stored = (r.stored || 0) - cut; take += cut; }
          p.coins += take; clearCheck(p, `stash_${bId}`);
          openCase(sim, "burglary", { victim: residents9[0]?.name || "a resident", scene: p.scene, x: Math.round(p.x), y: Math.round(p.y), killerId: "player", evidence: witnesses9.length ? 2 : 1 });
          sim.dayLog.push(`${residents9[0]?.name || "someone"}'s home was burgled`);
          pushFx(sim, p.scene, p.x, p.y, "crime");
          if (witnesses9.length) { convictStars(sim, p, 3, "the player was seen cracking a home stash"); sfx.alert(); showToast(`💰 ${take}c — and a WITNESS. (3★)`); }
          else { sfx.coin(); showToast(take > 0 ? `💰 ${take}c from the ${FURNITURE[store9].name.toLowerCase()}. Nobody saw.` : "Empty. All that risk for cobwebs."); }
        } else {
          recordFail(p, `stash_${bId}`, absMin9, 90);
          if (witnesses9.length) { convictStars(sim, p, 2, "the player was caught tampering with a home stash"); sfx.alert(); showToast("🚨 Caught red-handed! (2★)"); }
          else showToast(`The ${FURNITURE[store9].name.toLowerCase()} holds. Leave before someone comes home.`);
        }
        bump(); break;
      }
      case "shadyroute": {   // v7 Stage 4: 25 minutes through the trees — and maybe company
        const OC = CFG.OUTLANDS;
        const dest = a.dest, spot = dest === "outlands" ? OC.trailOut : OC.trailStone;
        sim.time += OC.walkMin;
        p.scene = `t:${dest}`; p.x = spot.x; p.y = spot.y;
        setTransition(dest === "outlands" ? "You slip past the tree line. The road forgets you…" : "You follow the trail back toward streetlights…");
        setTimeout(() => setTransition(null), 1800);   // the overlay pauses the sim — it MUST clear (was a softlock)
        const heat = OC.ambushTravel + p.coins / OC.wealthDiv;   // fat purses draw eyes
        const thug = sim.npcs.find(n => n.alive && n.town === "outlands" && !n.jailedUntil && !n.incap && !n.dying && (n.outlaw || !n.home));
        if (thug && Math.random() < heat) {
          thug.scene = p.scene; thug.x = clamp(p.x + 1, 0, 99); thug.y = p.y;
          thug.legs = []; thug.path = []; thug.goal = null;
          thug.steelUntil = performance.now() / 1000 + 90;   // v7 Stage 1: the blade comes OUT
          sfx.alert(); setThreat({ robberId: thug.id });   // the classic: "nice coin purse"
        }
        bump(); break;
      }
      case "carry": {   // haul the wounded in: half an hour of your day, renown if they make it
        const downed = sim.npcs.find(n => n.id === a.carry && n.alive); if (!downed) break;
        const wasFive = (downed.wanted || 0) >= 5;
        const bounty = (downed.wanted || 0) >= 3 ? downed.wanted * 12 : 0;   // v7 Stage 5: live delivery pays
        completeRescue(sim, world, downed, downed.dying?.byId || null);
        sim.time += 30;
        repEvent(sim, p, 2, wasFive ? 5 : 2, `the player carried ${downed.name} to the hospital`);
        if (bounty) { p.coins += bounty; sfx.coin(); showToast(`📜 Bounty collected: ${bounty}c for ${downed.name}.`); }
        showToast(wasFive ? `🏥 ${downed.name} patched up — and sent straight down for LIFE.` : `🏥 You haul ${downed.name} to the hospital.`);
        bump(); break;
      }
      case "forage": {   // v7 Stage 3: the bush table — loot shifts up and bites shift down with skill
        const [fx, fy] = a.bush;
        (sim.foragedAt = sim.foragedAt || {})[`${p.scene}:${fx},${fy}`] = sim.day;
        const lv = skillLevel(p, "foraging");
        const before = lv;
        p.skills.foraging = (p.skills.foraging || 0) + taskXp("foraging", 0);
        const r = Math.random();
        const bite = Math.max(0.04, 0.10 - lv * 0.015), snake = Math.max(0.02, 0.05 - lv * 0.008);
        if (r < snake) { p.health = Math.max(1, p.health - 10); sfx.alert(); showToast("🐍 A lil snake gets you! (-10 hp)"); }
        else if (r < snake + bite) { p.health = Math.max(1, p.health - 4); showToast("🐜 Something bites you. (-4 hp)"); }
        else if (r < snake + bite + 0.30) { const q = 1 + (Math.random() < 0.4 ? 1 : 0); p.inv.rock = (p.inv.rock || 0) + q; showToast(`🪨 Found ${q} round rock${q > 1 ? "s" : ""}.`); }
        else if (r < snake + bite + 0.48) { p.inv.fiber = (p.inv.fiber || 0) + 1; showToast("🌾 A tidy grass bundle."); }
        else if (r < snake + bite + 0.62) { p.inv.herb = (p.inv.herb || 0) + 1; showToast("🌿 A wild herb — good for what ails you."); }
        else if (r < snake + bite + 0.70) { const c = 1 + Math.floor(Math.random() * 3); p.coins += c; sfx.coin(); showToast(`🪙 ${c} coin${c > 1 ? "s" : ""} in the roots!`); }
        else if (r < snake + bite + 0.72) { p.inv.ring = (p.inv.ring || 0) + 1; sfx.coin(); showToast("💍 A tarnished ring — someone lost this…"); }
        else showToast("🍃 Nothing but leaves this time.");
        if (skillLevel(p, "foraging") > before) showToast(`📈 ${SKILL_TRACKS.foraging} — now ${skillTierName(p, "foraging")}!`);
        bump(); break;
      }
      case "cityledger": {   // the hall panel: ledger, taxes, elections — and the mayor's own tools
        setHallPanel({ town: townOfScene(world, p.scene) });
        break;
      }
      case "takeorder": {
        const items = Array.from({ length: 2 + Math.floor(Math.random() * 2) }, () => rand(["🍔", "🍟", "🌭", "🥤"]));
        sim.foodOrder = { items, cooked: 0, stage: "cook" };
        showToast(`Order in: ${items.join(" ")} — cook them at the grill, in order.`);
        break;
      }
      case "serve": {
        sim.foodOrder = null;
        const paid = completeTask(sim, "service", "fastfood", { basePay: CFG.PAY.food, note: "the player worked a shift at Crispy Hen" });
        p.energy = clamp(p.energy - CFG.WORK_COST.food.energy, 0, 100);
        sim.time += CFG.WORK_COST.food.min;
        showToast(`Served! +${paid} coins. Rosa nods once. High praise.`);
        break;
      }
      case "mailroute": {
        const town = townOfScene(world, p.scene);
        const targets = BUILDINGS.filter(b => b.town === town && b.id !== "post" && b.id !== "home_p");
        const picks = [...targets].sort(() => Math.random() - 0.5).slice(0, 3);
        sim.mail = { letters: picks.map(b => ({ bId: b.id, delivered: false })) };
        showToast(`Route: ${picks.map(b => b.name).join(", ")}. Walk it.`);
        break;
      }
      case "mailturnin": {
        const done = sim.mail.letters.filter(l => l.delivered).length;
        const town = townOfScene(world, p.scene);
        let social = 0;
        for (const L of sim.letters) {                    // the route carries REAL mail too
          const destTown = L.toId === "player" ? "alderbrook" : sim.npcs.find(n => n.id === L.toId)?.town;
          if (L.state === "atPost" && destTown === town) { deliverLetter(sim, L); social++; }
        }
        const pay = (done * CFG.PAY.mailPer + (done === 3 ? CFG.PAY.mailBonus : 0) + social) * (hasUpgrade(sim, "post", "routes") ? 2 : 1);   // Stage 5: extended routes
        if (done || social) completeTask(sim, "stock", "post", { basePay: pay, note: "the player ran a mail route" });
        sim.mail = null;
        showToast(done || social ? `Route turned in. +${pay} coins.${done === 3 ? " Full route bonus!" : ""}${social ? ` (${social} letters!)` : ""}` : "Pete squints. You delivered... nothing.");
        break;
      }
      case "restock": { sim.task = { kind: "restock", bId: "mart", spots: taskSpots(world, "mart", 3) }; showToast("Three shelves need stock — they're marked."); break; }
      case "clean": {
        const bId = p.scene.slice(2);
        sim.task = { kind: "clean", bId, spots: taskSpots(world, bId, 3) };
        showToast("Three grimy spots — they're marked.");
        break;
      }
      case "taskspot": {
        a.spot.done = true;
        p.energy = clamp(p.energy - (sim.task.kind === "clean" ? CFG.WORK_COST.clean.energy : CFG.WORK_COST.restock.energy) / 2, 0, 100);
        if (sim.task.kind === "clean" && sim.task.spots.every(s => s.done)) {
          sim.mess[sim.task.bId] = Math.max(0, sim.mess[sim.task.bId] - 45);
          const paid = completeTask(sim, "service", sim.task.bId, { basePay: CFG.PAY.clean, note: `the player cleaned ${bld(sim.task.bId).name}` });
          sim.task = null;
          showToast(`Spotless. +${paid} coins.`);
        }
        break;
      }
      case "finishrestock": {
        const paid = completeTask(sim, "stock", "mart", { basePay: CFG.PAY.restock, note: "the player restocked Bigway Mart" });
        p.energy = clamp(p.energy - CFG.WORK_COST.restock.energy, 0, 100);
        sim.task = null;
        showToast(`Shelves immaculate. Opal approves. +${paid} coins.`);
        break;
      }
      default: break;
    }
  };

  /* ---- shop panel: buy, sell (SELLABLE), and steal (keeper-dependent) ---- */
  const buyItem = (bId, itemId) => {
    const sim = simRef.current, p = sim.player;
    if (stockOf(sim, bId, itemId) <= 0) { showToast("Sold out. Deliveries come through the post office."); return; }
    const px = priceOf(sim, bId, itemId) * (bId === "blackmarket_o" ? CFG.OUTLANDS.marketMult : 1);   // Stage 3.7 owner price; the Exchange charges double — that's the no-questions fee
    if (!spend(p, px)) return;
    takeStock(sim, bId, itemId);
    trackDemand(sim, bId, itemId);                                          // player buys count toward demand too
    const owner = OWNERS[bId] ? sim.npcs.find(n => n.id === OWNERS[bId] && n.alive) : null;
    ringSale(sim, bId, px);   // Stage 5: revenue flows through the register (bonus + capacity), else to pocket
    p.inv[itemId] = (p.inv[itemId] || 0) + 1;
    showToast(`Bought ${ITEMS[itemId].name}.`);
    bump();
  };
  /* ===== furniture placement plumbing =====
     Placement is per HOME: sim.homePlacements[homeId] maps "x,y" slot keys to furniture ids.
     A placed piece blocks its tile (slots are curated so nothing can ever wall a room off). */
  const placementsOf = (sim, homeId) => ((sim.homePlacements = sim.homePlacements || {})[homeId] ||= {});
  const freeSlotsOf = (sim, homeId) => {
    const used = placementsOf(sim, homeId);
    return homeSlots(homeId).filter(s => !used[`${s.x},${s.y}`]);
  };
  const placeFurniture = (sim, world, homeId, slot, furnId) => {
    placementsOf(sim, homeId)[`${slot.x},${slot.y}`] = furnId;
    const inter = world?.interiors?.[homeId];
    if (inter?.walk?.[slot.y]) inter.walk[slot.y][slot.x] = false;   // something real stands there now
  };
  /* reapply saved placements to the walk grids, then stand up any owned-but-unplaced
     pieces (legacy saves, mid-session NPC buys that skipped the AI call) in free slots */
  const syncPlacements = (sim, world) => {
    sim.homePlacements = sim.homePlacements || {};
    for (const [homeId, slots] of Object.entries(sim.homePlacements)) {
      const inter = world.interiors[homeId]; if (!inter) continue;
      for (const key of Object.keys(slots)) { const [x, y] = key.split(",").map(Number); if (inter.walk?.[y]) inter.walk[y][x] = false; }
    }
    const byHome = {};
    const addAll = (homeId, list) => { if (homeId && list?.length) (byHome[homeId] = byHome[homeId] || []).push(...list); };
    addAll(sim.player.home || "home_p", sim.player.furniture);
    for (const n of sim.npcs) if (n.alive) addAll(n.home, n.furniture || []);
    for (const [homeId, owned] of Object.entries(byHome)) {
      const counts = {};
      for (const f of Object.values(placementsOf(sim, homeId))) counts[f] = (counts[f] || 0) + 1;
      for (const f of owned) {
        if (counts[f] > 0) { counts[f]--; continue; }     // this one's already standing
        const free = freeSlotsOf(sim, homeId);
        if (!free.length) break;
        placeFurniture(sim, world, homeId, free[Math.floor(Math.random() * free.length)], f);
      }
    }
  };
  /* an NPC picks its own spot — tiny AI call with an instant random fallback */
  const npcPlaceFurniture = (sim, npc, furnId) => {
    if (!npc.home) return;
    const free = freeSlotsOf(sim, npc.home);
    if (!free.length) return;
    const fallback = free[Math.floor(Math.random() * free.length)];
    if (USER_API_KEY) {
      furniturePlaceChoice(npc.name, npc.personality, FURNITURE[furnId].name, free.map(s => s.label))
        .then(i => placeFurniture(sim, worldRef.current, npc.home, free[i] ?? fallback, furnId))
        .catch(() => placeFurniture(sim, worldRef.current, npc.home, fallback, furnId));
    } else placeFurniture(sim, worldRef.current, npc.home, fallback, furnId);
  };
  /* Stage 4: buy a furniture installation (not inventory — it lives in the home). Delivery
     is baked into the price. Owning duplicates of a storage/station piece is pointless, so block it. */
  const buyFurniture = (bId, furnId) => {
    const sim = simRef.current, p = sim.player, f = FURNITURE[furnId];
    if (!f) return;
    if (p.furniture.includes(furnId)) { showToast(`You already own a ${f.name}.`); return; }
    if (!freeSlotsOf(sim, p.home || "home_p").length) { showToast("No free spot at home — your house is full."); return; }
    if (!spend(p, f.price)) { showToast("Can't afford that."); return; }
    const owner = ownerEnt(sim, bId);
    if (owner) { owner.coins = Math.min(9999, owner.coins + f.price); owner.grossThisPeriod = (owner.grossThisPeriod || 0) + f.price; }
    p.furniture.push(furnId);
    sim.playerFurniture = p.furniture;                    // keep the legacy alias honest
    setPlacePanel({ furnId });                            // you choose where it stands
    showToast(`${f.emoji} ${f.name} delivered — pick where it goes.`);
    bump();
  };
  /* Stage 4: home cash storage. Deposit/withdraw between pocket and the most secure store owned. */
  const bestStore = (ent) => ent.furniture.includes("safe") ? "safe" : ent.furniture.includes("piggy") ? "piggy" : null;
  const storeCap = (ent) => { const s = bestStore(ent); return s ? FURNITURE[s].store : 0; };
  // Stage 4: resolve a business owner as an entity — an NPC, or the PLAYER if they own it.
  // (Player-owned shops previously never accumulated gross, silently dodging the tax.)
  const ownerEnt = (sim, bId) => {
    const id = OWNERS[bId]; if (!id) return null;
    if (id === "player") return sim.player;
    return sim.npcs.find(n => n.id === id && n.alive) || null;
  };
  const creditOwner = (sim, bId, amt) => { const o = ownerEnt(sim, bId); if (o) { o.coins = Math.min(9999, o.coins + amt); o.grossThisPeriod = (o.grossThisPeriod || 0) + amt; } };   // Stage 4: gross accumulator feeds the weekly tax
  /* ===== Stage 5: registers ===== */
  const regOf = (sim, bId) => sim.registers[bId] || null;
  const regCap = (reg) => reg && reg.security >= 1 ? CFG.REGISTER.capUpgraded : CFG.REGISTER.capBase;
  // ring up a sale: the transaction bonus (fuller till = more profit) plus the sale itself flow into the
  // register up to capacity; any overflow spills to the owner's pocket. No register → straight to pocket.
  const ringSale = (sim, bId, amt) => {
    const owner = ownerEnt(sim, bId);   // Stage 4: player-owned shops accumulate gross too
    const reg = regOf(sim, bId);
    let gross = amt;
    if (reg) {
      const bonus = reg.cash >= 200 ? CFG.REGISTER.bonusAt200 : reg.cash >= 50 ? CFG.REGISTER.bonusAt50 : 0;
      gross += bonus;                                     // the "why you want a register" profit
      const cap = regCap(reg), room = cap - reg.cash, intoReg = Math.max(0, Math.min(gross, room));
      reg.cash += intoReg;
      const overflow = gross - intoReg;
      if (owner && overflow > 0) owner.coins = Math.min(9999, owner.coins + overflow);   // till full → owner banks the rest
    } else if (owner) {
      owner.coins = Math.min(9999, owner.coins + gross);
    }
    if (owner) owner.grossThisPeriod = (owner.grossThisPeriod || 0) + gross;   // Stage 6 tax reads gross
  };
  // buy / upgrade a register — cost comes from the register's own cash if it exists, else the owner's pocket.
  const buyRegisterTier = (sim, bId, tier) => {   // tier: 0 unlock, 1 light, 2 high
    const owner = ownerEnt(sim, bId);   // resolves the PLAYER too (npc-only lookup made the first register unbuyable for player owners)
    const cost = tier === 0 ? CFG.REGISTER.unlockCost : tier === 1 ? CFG.REGISTER.lightCost : CFG.REGISTER.highCost;
    let reg = regOf(sim, bId);
    const payFrom = reg ? reg : owner;                    // unlock pays from pocket; upgrades pay from the till
    const bal = reg ? reg.cash : (owner ? owner.coins : 0);
    if (bal < cost) return false;
    if (reg) reg.cash -= cost; else if (owner) owner.coins -= cost;
    if (!reg) { sim.registers[bId] = { level: 1, cash: 0, security: 0 }; }
    else { reg.security = tier; }                          // light=1, high=2
    return true;
  };
  /* ===== the owner's desk: the player runs their shop like any NPC owner would ===== */
  const playerSetPrice = (sim, bId, itemId, delta) => {
    const menu = (sim.menu[bId] = sim.menu[bId] || {});
    const base = ITEMS[itemId].price;
    menu[itemId] = clamp((menu[itemId] ?? base) + delta, 0, base * 2);   // same bounds the AI owners get
    bump();
  };
  const playerMenuAdd = (sim, bId, itemId) => {
    const menu = (sim.menu[bId] = sim.menu[bId] || {});
    if (Object.keys(menu).length >= CFG.OWNERECON.menuSize) { showToast(`The menu holds ${CFG.OWNERECON.menuSize} items — drop one first.`); return; }
    menu[itemId] = ITEMS[itemId].price;
    showToast(`${ITEMS[itemId].emoji} ${ITEMS[itemId].name} added to the menu (starts at 0 stock — order or cook it).`);
    bump();
  };
  const playerMenuDrop = (sim, bId, itemId) => { if (sim.menu[bId]) { delete sim.menu[bId][itemId]; bump(); } };
  const playerOrderStock = (sim, bId, itemId) => {
    const qty = CFG.SELFCARE.demandReorderQty;
    const cost = Math.ceil(ITEMS[itemId].price * qty * CFG.STOCK.wholesale);
    if (!spend(sim.player, cost)) return;
    sim.orders.push({ id: `${bId}_p_${sim.day}_${Math.floor(sim.time)}_${itemId}`, bId, items: { [itemId]: qty }, state: "ready", day: sim.day });
    sfx.coin(); showToast(`📦 Ordered ${qty}× ${ITEMS[itemId].name} (${cost}c wholesale) — arrives with the mail.`);
    bump();
  };
  const playerHire = (sim, bId) => {
    const npc = pickJobSeeker(sim, bId);
    if (!npc) { showToast("No one's looking for work right now — try again tomorrow."); return; }
    hireNpc(sim, npc, bId);
    sim.buzz = { text: `${npc.name} hired on at ${bld(bId).name}.`, day: sim.day };
    sim.dayLog.push(`the player hired ${npc.name} at ${bld(bId).name}`);
    showToast(`🤝 ${npc.name} joins ${bld(bId).name} as ${npc.occupation.title}.`);
    bump();
  };
  /* the handshake itself — coins to the owner at THEIR price, keys to you */
  const acceptBizOffer = (offer) => {
    const sim = simRef.current, p = sim.player, bId = offer.bId;
    const seller = sim.npcs.find(n => n.id === OWNERS[bId] && n.alive);
    if (!seller || !spend(p, offer.price)) { setBizOffer(null); return; }
    seller.coins = Math.min(9999, seller.coins + offer.price);
    seller.memories = [...seller.memories, `Sold ${bld(bId).name} to the player for ${offer.price}c. Retirement money at last.`].slice(-CFG.MAX_MEMORIES);
    if (seller.occupation?.bId === bId) seller.occupation = null;   // a rich retiree — may seek new work
    OWNERS[bId] = "player";
    (sim.ownerOverrides = sim.ownerOverrides || {})[bId] = "player";
    repEvent(sim, p, 6, 4, `the player bought ${bld(bId).name}`);
    seedGossip(sim, sim.npcs.filter(n => n.alive && n.town === bld(bId).town).slice(0, 5), { text: `the newcomer BOUGHT ${bld(bId).name} off ${seller.name} for ${offer.price}c`, subjectId: null, bad: false });
    sim.dayLog.push(`the player bought ${bld(bId).name} from ${seller.name} for ${offer.price}c`);
    sfx.coin(); showToast(`💼 ${bld(bId).name} is YOURS. (Manage it at the counter.)`);
    setBizOffer(null); bump();
  };
  // Stage 5: does a business own an upgrade? upgrades[bId] is a plain map { upgradeId: true }
  const hasUpgrade = (sim, bId, upId) => !!(sim.upgrades[bId] && sim.upgrades[bId][upId]);
  const buyUpgrade = (sim, bId, upId) => {
    const up = CFG.UPGRADES[upId]; if (!up) return false;
    const reg = sim.registers[bId]; if (!reg) return false;          // register-gated
    if (hasUpgrade(sim, bId, upId)) return false;
    if (reg.cash < up.cost) return false;                            // paid from the till
    reg.cash -= up.cost;
    sim.upgrades[bId] = sim.upgrades[bId] || {}; sim.upgrades[bId][upId] = true;
    return true;
  };
  // which upgrades apply to a given building (by type)
  const upgradesFor = (bId) => {
    const isEatery = !!EATERY_MEAL[bId] || !!KITCHEN[bId];
    const isShop = !!SHOP_STOCK[bId];
    return Object.entries(CFG.UPGRADES).filter(([id, u]) =>
      u.for.includes(bId) ||
      (u.for.includes("eatery") && isEatery) ||
      (u.for.includes("shop") && isShop && !isEatery) ||
      (u.for.includes("office") && bId === "office")
    ).map(([id]) => id);
  };
  // Stage 5: dirty-dish bookkeeping
  const soilDish = (sim, bId) => { if (EATERY_MEAL[bId]) sim.dishes[bId] = (sim.dishes[bId] || 0) + CFG.DISHES.perMeal; };
  const kitchenStalled = (sim, bId) => (sim.dishes[bId] || 0) >= CFG.DISHES.stallAt;   // too cluttered to plate
  const washDishes = (sim, bId, soap) => {
    const clear = Math.ceil(CFG.DISHES.washBase * (soap ? CFG.DISHES.soapMult : 1));
    sim.dishes[bId] = Math.max(0, (sim.dishes[bId] || 0) - clear);
    return clear;
  };
  // rob a register: yield scales with security. Returns {took, alarm} or null if no register/empty.
  const robRegister = (sim, bId, robber) => {
    const reg = regOf(sim, bId); if (!reg || reg.cash <= 0) return null;
    const yield_ = CFG.REGISTER.robYield[reg.security] ?? 0.9;
    const took = Math.floor(reg.cash * yield_);
    reg.cash -= took;
    if (robber) robber.coins += took;
    const alarm = reg.security >= 2 && Math.random() < CFG.REGISTER.highAlarmChance;
    // an emptied till is discovered even if unwitnessed → opens a case (feeds interrogation)
    openCase(sim, "register_robbery", { victim: bld(bId).name, scene: `i:${bId}`, x: bld(bId).door.x, y: bld(bId).door.y,
      killerId: robber?.id || "player", state: "open", evidence: alarm ? 1 : 0 });
    return { took, alarm };
  };
  const depositCash = (amt) => {
    const p = simRef.current.player, cap = storeCap(p);
    const room = cap - p.stored, put = Math.max(0, Math.min(amt, p.coins, room));
    if (put <= 0) { showToast(cap === 0 ? "No home safe to store cash." : "Storage is full."); return; }
    p.coins -= put; p.stored += put; showToast(`Stored ${put}c safely at home.`); bump();
  };
  const withdrawCash = (amt) => {
    const p = simRef.current.player, take = Math.max(0, Math.min(amt, p.stored));
    if (take <= 0) return;
    p.stored -= take; p.coins += take; showToast(`Withdrew ${take}c.`); bump();
  };
  /* Stage 4: move an item between pocket and chest. Slot use = 1 + floor(n/5) per item type;
     block a store that would exceed the chest's slot cap. */
  const chestMove = (itemId, toChest) => {
    const p = simRef.current.player;
    p.chest = p.chest || {};
    if (toChest) {
      if (!(p.inv[itemId] > 0)) return;
      const slots = Object.entries(p.chest).reduce((s, [id, n]) => s + (n > 0 ? 1 + Math.floor((id === itemId ? n + 1 : n) / 5) : 0), 0);
      const willAddSlot = !p.chest[itemId] || ((p.chest[itemId] + 1) % 5 === 1);
      const projected = Object.entries(p.chest).reduce((s, [id, n]) => s + (n > 0 ? 1 + Math.floor(n / 5) : 0), 0) + (p.chest[itemId] ? (Math.floor((p.chest[itemId] + 1) / 5) - Math.floor(p.chest[itemId] / 5)) : 1);
      if (projected > FURNITURE.chest.slots) { showToast("Chest is full."); return; }
      p.inv[itemId]--; p.chest[itemId] = (p.chest[itemId] || 0) + 1;
    } else {
      if (!(p.chest[itemId] > 0)) return;
      p.chest[itemId]--; p.inv[itemId] = (p.inv[itemId] || 0) + 1;
    }
    bump();
  };
  const sellItem = (bId, itemId) => {
    const sim = simRef.current, p = sim.player;
    if (!(p.inv[itemId] > 0)) return;
    p.inv[itemId]--;
    p.coins += SELLABLE[itemId];
    const keeper = keeperOf(sim, bId);
    if (keeper) keeper.coins = Math.max(0, keeper.coins - SELLABLE[itemId]);
    showToast(`Sold ${ITEMS[itemId].name}. +${SELLABLE[itemId]} coins.`);
    bump();
  };
  const stealArmRef = useRef(null);                       // Stage 3.5: { bId, itemId, at } — the two-tap window
  const stealItem = (bId, itemId) => {
    const sim = simRef.current, nowMs = performance.now();
    const arm = stealArmRef.current;
    // Stage 3.5 two-tap confirm: first tap arms it. 1s charge (a fat finger can't
    // double-fire), then live until 3s after arming — after that it disarms itself.
    if (!arm || arm.bId !== bId || arm.itemId !== itemId || nowMs - arm.at > 3000) {
      stealArmRef.current = { bId, itemId, at: nowMs };
      showToast("⚠️ Tap again to steal — 3-second window.");
      bump(); return;
    }
    if (nowMs - arm.at < 1000) { bump(); return; }        // still charging
    stealArmRef.current = null;
    stealAttempt(sim, worldRef.current, sim.player, bId, itemId, performance.now() / 1000);
    bump();
  };

  const payCoins = (npcId, amount) => {
    const sim = simRef.current;
    const npc = sim.npcs.find(n => n.id === npcId);
    const n = Math.floor(Number(amount));
    if (!n || n <= 0) return showToast("Enter a real amount.");
    if (sim.player.coins < n) return showToast("You don't have that much.");
    receiveGift(sim, sim.player, npc, { coins: n });
    setPayPanel(null);
  };
  const giftItem = (npcId, itemId) => {
    const sim = simRef.current;
    const npc = sim.npcs.find(n => n.id === npcId);
    if (receiveGift(sim, sim.player, npc, { itemId })) setPayPanel(null);
  };
  const useItem = (itemId) => {
    const p = simRef.current.player, it = ITEMS[itemId];
    if (itemId === "goodie_crate") {   // Stage 6: open for 3 random items
      if (!(p.inv.goodie_crate > 0)) return;
      p.inv.goodie_crate -= 1; if (p.inv.goodie_crate <= 0) delete p.inv.goodie_crate;
      const pool = Object.keys(ITEMS).filter(id => ITEMS[id].price > 0 && ITEMS[id].cat !== "misc" && id !== "sludge" && id !== "burnt");
      const got = [];
      for (let i = 0; i < 3; i++) { const g = rand(pool); p.inv[g] = (p.inv[g] || 0) + 1; got.push(ITEMS[g].emoji); }
      sfx.chime(); showToast(`🎲 Crate opened: ${got.join(" ")}!`); bump(); return;
    }
    if (consumeItem(p, itemId)) {
      const msg = it.heal ? "patched up." : it.cure ? "feeling better already." : "that hit the spot.";
      if (itemId === "mystery_stew") {   // v7 Stage 4: Howl's special — don't ask
        if (Math.random() < CFG.OUTLANDS.stewRisk) { p.health = Math.max(1, p.health - CFG.OUTLANDS.stewHit); sfx.alert(); showToast("🍲 …you don't want to know what was in it. (-12 hp)"); }
        else { p.health = Math.min(100, p.health + CFG.OUTLANDS.stewHeal); showToast("🍲 Unreasonably good. Suspiciously good."); }
      }
      if (it.heal || it.cure) {   // Pass 4: field medicine teaches — a bandage or a dose is practice
        const before = skillLevel(p, "healthcare");
        p.skills.healthcare = (p.skills.healthcare || 0) + taskXp("healthcare", 0);
        if (skillLevel(p, "healthcare") > before) showToast(`📈 ${SKILL_TRACKS.healthcare} — now ${skillTierName(p, "healthcare")}!`);
      }
      showToast(`${it.emoji} ${it.name} — ${msg}`); bump();
    }
  };

  /* v7 Stage 5b: THE COMMISSION. Garrick quotes a job in his own voice — the API plans the
   price nudge, the timeline, and the line he says. If the call fails (no key, network),
   the local quote stands: material value + labor by tier, days by tier. Same numbers the
   API is anchored to, so offline isn't a discount or a gouge — just quieter. */
async function commissionCall(ownerName, personality, itemName, tier, baseCost, baseDays, playerRep) {
  const prompt =
`You are ${ownerName}, ${personality} — a workshop owner in a life-sim quoting a commission.
Job: make "${itemName}" (${tier} difficulty). Baseline: ${baseCost} coins, ${baseDays} day(s). Customer reputation: ${playerRep}.
Adjust price at most ±20% and days by at most +1 (good rep can shave a coin; rush jobs cost). Respond ONLY with JSON:
{"price": <int>, "days": <int>, "line": "<one short in-character sentence quoting the job>"}`;
  return callClaude(prompt, 120);
}

/* THE OFFLINE INTERROGATION. No API? The duel still happens — as dice. The detective's
     office skill and evidence set the bar; your TACTIC each round is the play. Suspicion
     climbs or falls; ≥70 when the questions run out means charges. Guilt matters: telling
     the truth when you're innocent is strong, and lying when they hold evidence is fragile. */
  const offlineQuestion = (det, kase, q) => {
    const lines = [
      [`Walk me through your evening. Slowly.`, `Where were you when it happened?`, `Start at the beginning. I have time.`],
      [`That's not quite what I heard. Care to try again?`, `Someone puts you near the scene. Comment?`, `Your story has a gap in it. Fill it.`],
      [`Last chance to explain this properly.`, `I'm about to make a decision. Help me make the right one.`, `Anything else, before I write this up?`],
    ];
    return rand(lines[Math.min(q, lines.length - 1)]);
  };
  const offlineTactic = (tacticId, guilty) => {
    const sim = simRef.current, iv = interro;
    const det = sim.npcs.find(n => n.id === iv.detId);
    const t = CFG.INTERRO_OFFLINE.tactics[tacticId];
    const C = CFG.INTERRO_OFFLINE;
    const detSkill = skillLevel(det, "office");
    // the roll: your nerve (d100) vs their nose (skill + evidence). Guilt shakes the hand.
    const detEdge = C.edgeBase + detSkill * C.detSkillW + (iv.evidence || 0) * C.evidW;
    let swing;
    if (tacticId === "truth") swing = guilty ? C.truthSwing : -C.truthSwing;   // confession, or the ring of truth
    else {
      const nerve = Math.random() * 100 - (guilty ? C.guiltPenalty : 0);       // the lie holds together, or it doesn't
      swing = nerve > detEdge ? t.reward : t.risk;
    }
    const hist = [...iv.history, { who: "sus", text: t.label.replace(/^\S+\s/, "") }];
    const susp = clamp((iv.susp ?? CFG.INTERRO_OFFLINE.base) + swing, 0, 100);
    const nextQ = iv.q + 1;
    const done = nextQ > CFG.SKILLCHECK.interrogateQuestions;
    if (done) {
      const accuse = susp >= 70;
      setInterro({ ...iv, history: [...hist, { who: "det", text: accuse ? rand(["That's enough. You're coming with me.", "I've heard what I need."]) : rand(["...Fine. You're free to go.", "I don't like it. But I've got nothing."]) }],
        susp, q: nextQ, concluded: true, verdict: accuse ? "accuse" : "clear", busy: false });
    } else {
      const react = swing > 8 ? rand(["*writes something down*", "*leans in*", "Hm."]) : swing < -8 ? rand(["*sits back*", "...I see.", "*frowns at the file*"]) : "*says nothing*";
      setInterro({ ...iv, history: [...hist, { who: "det", text: `${react} ${offlineQuestion(det, null, nextQ)}` }], susp, q: nextQ, busy: false });
    }
  };

  /* Stage 3.9: player-side interrogation. When a detective targets the player, sim.interrogation
     is set; this opens a capped chat where the detective asks up to 3 questions and then decides.
     The detective is the AI (detectiveMove); the player types answers (the "suspect" side). */
  useEffect(() => {
    const iv = simRef.current?.interrogation;
    if (iv && !interro) {
      const sim = simRef.current;
      const det = sim.npcs.find(n => n.id === iv.detId);
      const kase = sim.cases.find(c => c.id === iv.caseId);
      if (!det || !kase) { sim.interrogation = null; return; }
      setInterro({ caseId: iv.caseId, detId: iv.detId, detName: det.name, history: [], q: 0, busy: true, done: false, verdict: null });
      // fire the detective's opening question
      const skillDesc = skillLabel(det, "office");
      detectiveMove(det.name, skillDesc, "the player", kase.evidence, 1, CFG.SKILLCHECK.interrogateQuestions, [], false)
        .then(move => setInterro(s => s && { ...s, busy: false, history: [{ who: "det", text: move.say }], q: 1, concluded: move.action === "conclude", verdict: move.action === "conclude" ? move.verdict : null }))
        .catch(() => {   // no API (or it failed): the interrogation becomes a dice duel, not a freebie
          const det2 = simRef.current.npcs.find(n => n.id === iv.detId);
          setInterro(s => s && { ...s, offline: true, busy: false, susp: CFG.INTERRO_OFFLINE.base + (kase.evidence || 0) * CFG.INTERRO_OFFLINE.perEvidence,
            evidence: kase.evidence || 0, history: [{ who: "det", text: offlineQuestion(det2, kase, 0) }], q: 1 });
        });
    }
  }, [simRef.current?.interrogation, interro]);

  const answerInterrogation = () => {
    const ans = chatInput.trim(); if (!ans || !interro || interro.busy || interro.concluded) return;
    setChatInput("");
    const sim = simRef.current;
    const det = sim.npcs.find(n => n.id === interro.detId);
    const kase = sim.cases.find(c => c.id === interro.caseId);
    if (!det || !kase) { setInterro(null); sim.interrogation = null; return; }
    const hist = [...interro.history, { who: "sus", text: ans }];
    setInterro(s => ({ ...s, history: hist, busy: true }));
    const mustConclude = interro.q >= CFG.SKILLCHECK.interrogateQuestions;
    const skillDesc = skillLabel(det, "office");
    const toOffline = () => setInterro(s => s && { ...s, offline: true, busy: false,
      susp: CFG.INTERRO_OFFLINE.base + (kase.evidence || 0) * CFG.INTERRO_OFFLINE.perEvidence, evidence: kase.evidence || 0,
      history: [...hist, { who: "det", text: offlineQuestion(det, kase, s.q) }] });
    detectiveMove(det.name, skillDesc, "the player", kase.evidence, interro.q + 1, CFG.SKILLCHECK.interrogateQuestions, hist, mustConclude)
      .then(move => {
        const h2 = [...hist, { who: "det", text: move.say }];
        if (move.action === "conclude") {
          setInterro(s => ({ ...s, history: h2, busy: false, concluded: true, verdict: move.verdict }));
        } else {
          setInterro(s => ({ ...s, history: h2, busy: false, q: s.q + 1 }));
        }
      })
      .catch(() => setInterro(s => ({ ...s, busy: false, concluded: true, verdict: "clear" })));
  };

  // resolve the player interrogation once the detective concludes
  const closeInterrogation = () => {
    const sim = simRef.current;
    const kase = sim.cases.find(c => c.id === interro.caseId);
    const isCulprit = kase && kase.killerId === "player";
    if (kase && interro.verdict === "accuse") {
      kase.state = "solved"; kase.suspectId = "player";
      recordConviction(sim, kase, interro.detId, "player", isCulprit);   // wrong if player isn't the killer
      convictStars(sim, sim.player, 5, "the player was convicted of murder");
    } else if (kase) {
      kase.interrogatedCount = (kase.interrogatedCount || 0) + 1;   // cleared — counts against the case cap
    }
    const det = sim.npcs.find(n => n.id === interro.detId);
    if (det) det.caseWork = null;
    sim.interrogation = null; setInterro(null);
  };

  /* ---- minigames ---- */
  // Stage 6: filing difficulty by clerical skill (Entry tier 0). Comfortably skilled → fewer
  // loops and fewer bins to decide between (6 loops/3 colors → 4 loops/2 colors).
  const FILE_TIER = 0;
  const fileKnobs = () => {
    const pr = taskParams(simRef.current.player, "office", FILE_TIER);
    const rounds = clamp(CFG.OFFICE_ROUNDS - (pr.gap >= 2 ? 2 : 0) + (pr.gap <= -2 ? 1 : 0), 4, 7);
    const cats = pr.gap >= 2 ? ["red", "blue"] : ["red", "green", "blue"];   // skilled → two bins only
    return { rounds, cats };
  };
  const fileBin = (color) => {
    const mg = minigameRef.current;
    if (!mg || mg.type !== "office") return;
    const sim = simRef.current, p = sim.player;
    if (color !== mg.target) { showToast("Wrong bin. Bruno pretends not to see."); return; }
    const round = mg.round + 1;
    if (round >= mg.rounds) {
      setMinigame(null);
      const paid = completeTask(sim, "office", "office", { econKey: "office_sort", note: "the player filed paperwork at Brightleaf Co.", xp: taskXp("office", FILE_TIER) });
      p.energy = clamp(p.energy - CFG.WORK_COST.office.energy, 0, 100);
      sim.time += CFG.WORK_COST.office.min;
      showToast(`Filing done. +${paid} coins. Bruno took credit anyway.`);
    } else setMinigame({ type: "office", round, rounds: mg.rounds, cats: mg.cats, target: rand(mg.cats) });
  };

  /* Stage 6 — the PRINTER minigame (player-side, dexterity not chance):
     drag the paper icons into the blue tray, sweep the bar right then back; each return-sweep
     scatters papers + moves the tray. Difficulty scales with clerical skill vs the Hard tier:
     green clerks face more papers, a smaller tray, an extra round; a Professional gets fewer
     papers, a bigger tray, and one less round. */
  const PRINT_TIER = 2;   // printing is a Hard clerical task
  const printKnobs = () => {
    const pr = taskParams(simRef.current.player, "office", PRINT_TIER);
    // papers 5 baseline: +1 when badly under-skilled, −1 (min 3) when comfortably skilled
    const papers = clamp(5 - (pr.gap >= 2 ? 1 : 0) + (pr.gap <= -2 ? 1 : 0), 3, 6);
    const rounds = clamp(3 - (pr.gap >= 3 ? 1 : 0) + (pr.gap <= -3 ? 1 : 0), 2, 4);   // Professional: one less repeat
    // tray half-extents (drop tolerance): base 9×11, widened/tightened by goalW
    const trayX = clamp(9 * pr.goalW, 6, 16), trayY = clamp(11 * pr.goalW, 8, 18);
    return { papers, rounds, trayX, trayY };
  };
  // scatter N papers to random spots (percent coords), tray to a fresh spot
  const printScatter = (n) => {
    const papers = Array.from({ length: n }, () => ({
      x: 8 + Math.random() * 60, y: 45 + Math.random() * 45, in: false,
    }));
    const tray = { x: 20 + Math.random() * 55, y: 8 + Math.random() * 18 };
    return { papers, tray };
  };
  const startPrint = () => {
    const k = printKnobs();
    const s = printScatter(k.papers);
    setMinigame({ type: "print", round: 0, rounds: k.rounds, trayX: k.trayX, trayY: k.trayY,
      papers: s.papers, tray: s.tray, bar: 0, barPhase: "out" });   // barPhase: out = sweep right, back = sweep left
  };
  // drop-test a dragged paper against the tray (tolerance from the knobs)
  const printDropPaper = (idx, x, y) => setMinigame(mg => {
    if (!mg || mg.type !== "print") return mg;
    const dx = Math.abs(x - mg.tray.x), dy = Math.abs(y - mg.tray.y);
    const papers = mg.papers.map((p, i) => i === idx ? { ...p, x, y, in: dx < mg.trayX && dy < mg.trayY } : p);
    return { ...mg, papers };
  });
  // the bar sweep: bar goes 0→100 (out) then 100→0 (back). Completing "back" with all stacked = round done.
  const printSetBar = (v) => setMinigame(mg => {
    if (!mg || mg.type !== "print") return mg;
    const allIn = mg.papers.every(p => p.in);
    if (mg.barPhase === "out") {
      if (!allIn) return mg;                              // can't sweep until the stack is complete
      if (v >= 99) return { ...mg, bar: 100, barPhase: "back" };
      return { ...mg, bar: v };
    } else {                                             // sweeping back
      if (v <= 1) {                                       // returned → this round prints; scatter + advance
        const round = mg.round + 1;
        if (round >= mg.rounds) { finishPrint(); return null; }
        const s = printScatter(mg.papers.length);
        return { type: "print", round, rounds: mg.rounds, trayX: mg.trayX, trayY: mg.trayY, papers: s.papers, tray: s.tray, bar: 0, barPhase: "out" };
      }
      return { ...mg, bar: v };
    }
  });
  const finishPrint = () => {
    const sim = simRef.current, p = sim.player;
    addStock(sim, "office", "files", CFG.STOCK.printBatch + (hasUpgrade(sim, "office", "paper") ? 6 : 0));
    const paid = completeTask(sim, "office", "office", { econKey: "office_print", note: "the player ran a clean print job", xp: taskXp("office", PRINT_TIER) });
    p.energy = clamp(p.energy - 12, 0, 100);
    sim.time += 40;
    showToast(`+${CFG.STOCK.printBatch + (hasUpgrade(sim, "office", "paper") ? 6 : 0)} files printed. +${paid} coins.`);
  };
  // ---- pointer plumbing for the printer drag surface ----
  const pctFromEvent = (e) => {
    const r = printSurfRef.current?.getBoundingClientRect();
    if (!r) return { x: 50, y: 50 };
    return { x: clamp(((e.clientX - r.left) / r.width) * 100, 0, 100), y: clamp(((e.clientY - r.top) / r.height) * 100, 0, 100) };
  };
  const printPointerDown = (e, idx) => {
    e.preventDefault(); printDragRef.current = { idx };
    const move = ev => { const { x, y } = pctFromEvent(ev); printDropPaper(idx, x, y); };
    const up = () => { printDragRef.current = null; window.removeEventListener("pointermove", move); window.removeEventListener("pointerup", up); };
    window.addEventListener("pointermove", move); window.addEventListener("pointerup", up);
  };
  const printBarDown = (e) => {
    e.preventDefault();
    const move = ev => { const { x } = pctFromEvent(ev); printSetBar(x); };
    const up = () => { window.removeEventListener("pointermove", move); window.removeEventListener("pointerup", up); };
    window.addEventListener("pointermove", move); window.addEventListener("pointerup", up);
  };

  const DISH_SEQ = ["Scrub", "Rinse", "Dry"];
  const dishStep = (label) => {
    const mg = minigameRef.current;
    if (!mg || mg.type !== "dish") return;
    const sim = simRef.current, p = sim.player;
    if (label !== DISH_SEQ[mg.step]) { showToast("Order matters: scrub, rinse, dry."); setMinigame({ ...mg, step: 0 }); return; }
    if (mg.step + 1 < DISH_SEQ.length) { setMinigame({ ...mg, step: mg.step + 1 }); return; }
    const plate = mg.plate + 1;
    if (plate >= CFG.DISH_PLATES) {
      setMinigame(null);
      const bId = p.scene.slice(2);
      const cleared = washDishes(sim, bId, hasUpgrade(sim, bId, "soap"));   // Stage 5: soap clears more
      const paid = completeTask(sim, "service", bId, { basePay: CFG.PAY.dish, note: "the player washed dishes" });
      p.energy = clamp(p.energy - CFG.WORK_COST.dish.energy, 0, 100);
      sim.time += CFG.WORK_COST.dish.min;
      showToast(`Dishes done — cleared ${cleared} plates. +${paid} coins.`);
    } else setMinigame({ type: "dish", plate, step: 0 });
  };

  /* ===== Stage 6 — FISHING (Entry / Simple / Hard) =====
     Entry & Simple: the peak-timing hook (Simple = tighter hook range, like Simple cooking).
     Hard: two axes — hook timing AND a slow tension bar (white/yellow/red) you must respect.
     Loot is a weighted table; rarer catches get likelier the higher your fishing skill. */
  /* ===== Stage 6 (rev) — FISHING: catch-driven difficulty =====
     Each CATCH has a rarity + its own fight difficulty. Depths are skill-GATED and set how
     rare a catch you can hook; you roll from everything at/below that ceiling (skill nudges
     toward the rare tail). The catch is predetermined per cast, and IT decides how hard the
     minigame is — a rare fish fights harder (tighter hook, meaner tension). */
  const FISH_CATCH = [   // ordered common → rare; gate = min fishing level to ever hook it
    { id: "boot",         give: { coins: 1 },                 rarity: 0, diff: 0, gate: 0 },   // junk
    { id: "fish",         give: { fish: 1 },                  rarity: 1, diff: 0, gate: 0 },
    { id: "coin_pouch",   give: { coins: 6, maybe: "water" }, rarity: 2, diff: 1, gate: 1 },
    { id: "tropical_fish",give: { tropical_fish: 1 },         rarity: 3, diff: 2, gate: 3 },
    { id: "goodie_crate", give: { goodie_crate: 1 },          rarity: 4, diff: 2, gate: 5 },
  ];
  // depths: label, min fishing level to fish here, and the rarity CEILING they can pull
  const FISH_DEPTH = [
    { key: "shallows", label: "Shallows",   emoji: "🐟", gate: 0, ceil: 1, blurb: "calm water — a common catch" },
    { key: "channel",  label: "The Channel",emoji: "🎣", gate: 1, ceil: 2, blurb: "faster water — coins, maybe a bottle" },
    { key: "deep",     label: "Deep Water", emoji: "🌊", gate: 3, ceil: 4, blurb: "the good stuff fights back" },
  ];
  const fishingLevel = () => skillLevel(simRef.current.player, "fishing");
  // roll a catch: everything at/below the depth ceiling AND within the player's gate, skill-weighted to the rare tail
  const rollCatch = (sim, ceil) => {
    const lv = skillLevel(sim.player, "fishing");
    const pool = FISH_CATCH.filter(c => c.rarity <= ceil && lv >= c.gate);
    if (!pool.length) return FISH_CATCH[1];               // fallback: a plain fish
    // weight: base falls off for rarer, but skill lifts the rare tail back up
    const weighted = pool.map(c => ({ c, w: Math.max(1, (ceil - c.rarity + 1) * 6 + (c.rarity * lv)) }));
    const total = weighted.reduce((s, x) => s + x.w, 0);
    let r = Math.random() * total;
    for (const x of weighted) { if ((r -= x.w) <= 0) return x.c; }
    return pool[0];
  };
  const startFish = (depthKey) => {
    setCastPanel(false);
    const sim = simRef.current, p = sim.player;
    const depth = FISH_DEPTH.find(d => d.key === depthKey);
    if (fishingLevel() < depth.gate) { showToast(`🎣 ${depth.label} needs more fishing skill first.`); return; }
    const catch_ = rollCatch(sim, depth.ceil);            // predetermined THIS cast
    const pr = taskParams(p, "fishing", catch_.diff);     // difficulty tier = the CATCH's fight
    // hook range tightens with the catch's difficulty, widens with skill
    const zone = clamp([0.20, 0.15, 0.11][catch_.diff] * pr.goalW, 0.06, 0.42);
    if (catch_.diff < 2) { setMinigame({ type: "fish", catch: catch_, start: Date.now(), zone }); return; }
    // hard fight → the tension mini-game; leniency still scales with skill
    const redMax = pr.gap >= 2 ? 2 : 1;
    const yellowMax = clamp(3 + (pr.gap >= 1 ? pr.gap : 0), 3, 5);
    setMinigame({ type: "fishhard", catch: catch_, start: Date.now(), zone, redHits: 0, yellowHits: 0, redMax, yellowMax });
  };
  const grantCatch = (sim, catch_) => {
    const p = sim.player, give = catch_.give;
    if (give.coins) p.coins += give.coins;
    for (const k of Object.keys(give)) { if (k === "coins" || k === "maybe") continue; p.inv[k] = (p.inv[k] || 0) + give[k]; }
    if (give.maybe && Math.random() < 0.5) p.inv[give.maybe] = (p.inv[give.maybe] || 0) + 1;
    const parts = [];
    if (give.coins) parts.push(`+${give.coins}c`);
    for (const k of Object.keys(give)) if (!["coins", "maybe"].includes(k)) parts.push(`${ITEMS[k].emoji} ${ITEMS[k].name}`);
    return parts.join(", ");
  };
  const FISH_TIER = 0;
  const fishHook = () => {
    const mg = minigameRef.current;
    if (!mg || (mg.type !== "fish" && mg.type !== "fishhard")) return;
    sfx.reel();
    const sim = simRef.current, p = sim.player;
    const period = mg.type === "fishhard" ? CFG.FISH_PERIOD_MS : CFG.FISH_PERIOD_MS;
    const t = ((Date.now() - mg.start) % period) / period;
    const pos = t < 0.5 ? t * 2 : 2 - t * 2;
    const catch_ = mg.catch;   // predetermined this cast
    // HARD: check tension first — pulling in red/too-much-yellow snaps the line
    if (mg.type === "fishhard") {
      const tnow = ((Date.now() - mg.start) % CFG.FISH_TENSION_MS) / CFG.FISH_TENSION_MS;
      const tension = tnow < 0.5 ? tnow * 2 : 2 - tnow * 2;   // 0..1 slow oscillator
      const band = tension > 0.8 ? "red" : tension > 0.5 ? "yellow" : "white";
      if (band === "red") {
        const redHits = mg.redHits + 1;
        if (redHits >= mg.redMax) { setMinigame(null); sfx.fail(); showToast("🎣💥 Too much tension — the line SNAPPED."); return; }
        setMinigame({ ...mg, redHits }); showToast("⚠️ Careful — tension's in the red!"); return;
      }
      if (band === "yellow") {
        const yellowHits = mg.yellowHits + 1;
        if (yellowHits >= mg.yellowMax) { setMinigame(null); sfx.fail(); showToast("🎣💥 Line snapped — too many hard pulls."); return; }
        // fall through to the hook check, but record the yellow pull
        if (Math.abs(pos - 0.5) > mg.zone) { setMinigame({ ...mg, yellowHits }); showToast("Missed the hook — and straining the line."); return; }
        // hooked in yellow — lands it
      } else {   // white — a clean pull; buys back a yellow allowance
        if (Math.abs(pos - 0.5) > mg.zone) { setMinigame({ ...mg, yellowHits: Math.max(0, mg.yellowHits - 1) }); showToast("Eased the line — but missed the hook."); return; }
      }
    } else {
      // Entry / Simple: just the hook window
      if (Math.abs(pos - 0.5) > mg.zone) { setMinigame(null); p.energy = clamp(p.energy - CFG.WORK_COST.fish.energy, 0, 100); sim.time += CFG.WORK_COST.fish.min; showToast(pos < 0.5 ? "Too early — it slipped off." : "Too late — gone."); return; }
    }
    // SUCCESS
    setMinigame(null);
    p.energy = clamp(p.energy - CFG.WORK_COST.fish.energy, 0, 100);
    sim.time += CFG.WORK_COST.fish.min;
    sfx.splash(); const got = grantCatch(sim, catch_);
    completeTask(sim, "fishing", null, { xp: taskXp("fishing", catch_.diff) });
    showToast(`🎣 Landed it! ${got}. Gus nods slowly.`);
  };

  /* cooking: pick a recipe (ingredients consumed up front — the work is
     the value), then hit the heat window or plate a Burnt Mess */
  /* ===== Stage 6 — DRINK minigames (player-side; fail → Sludge) =====
     Easy: 3 vertical sliders, pull exactly the 2 required down (not the third), then Pour.
     Hard: 4 sliders pull the 3 required, then a tap-and-hold fill you must release at the line. */
  const drinkDeliver = (recipeId, chefB, success) => {
    const sim = simRef.current, p = sim.player;
    const made = success ? recipeId : "sludge";
    const r = RECIPES[recipeId], tier = r.tier ?? (r.hard ? 2 : 1);
    const xp = success ? taskXp("kitchen", tier) : 1;    // Stage 6: tier XP on success, token XP on a botch
    if (chefB) {
      addStock(sim, chefB, made, success ? 2 : 1);
      const paid = completeTask(sim, "kitchen", chefB, { econKey: "chef", xp });
      showToast(success ? `${ITEMS[made].name} served at ${bld(chefB).name}. +${paid}c.` : `🫗 Botched it — served Sludge. +${paid}c.`);
    } else {
      p.inv[made] = (p.inv[made] || 0) + 1;
      completeTask(sim, "kitchen", p.scene.slice(2), { xp });
      if (success) { const dom = TASK_DOMAIN[recipeId] || null; if (trainDomain(p, "kitchen", dom)) showToast(`🌟 You've mastered ${DOMAIN_LABEL[dom]} drinks!`); showToast(`${ITEMS[made].emoji} ${ITEMS[made].name} — perfectly mixed.`); }
      else { sfx.fail(); showToast("🫗 That's... Sludge. Barely a drink."); }
    }
    setMinigame(null);
  };
  const DRINK_FILL_TARGET = 78;
  const startDrink = (recipeId, chefB) => {
    const r = RECIPES[recipeId];
    const tier = r.tier ?? (r.hard ? 2 : 1);              // drink difficulty tier
    const pr = taskParams(simRef.current.player, "kitchen", tier);
    const hard = tier >= 2;
    // lever count: hard base 4, easy base 3 — comfortably skilled shed one lever (min: easy 2, hard 3)
    let n = hard ? 4 : 3;
    if (pr.gap >= 2) n -= 1;
    const needCount = Math.max(2, n - 1);                 // one lever stays UP
    // choose which sliders must be pulled
    const idxs = Array.from({ length: n }, (_, i) => i);
    for (let i = idxs.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [idxs[i], idxs[j]] = [idxs[j], idxs[i]]; }
    const required = idxs.slice(0, needCount).sort((a, b) => a - b);
    // hard + badly under-skilled → the slider set must be done TWICE; fill band scales with goalW
    const passes = (hard && pr.gap <= -2) ? 2 : 1;
    const fillBand = clamp(8 * pr.goalW, 4, 16);          // wider when skilled, precise when green
    setMinigame({ type: "drink", recipe: recipeId, mode: chefB ? "chef" : null, bId: chefB, hard, tier,
      phase: "sliders", n, required, pulled: Array(n).fill(false), fill: 0, holding: false,
      allowUndo: pr.allowUndo, passes, pass: 1, fillBand });
  };
  // drag a slider DOWN — commit-only unless the player is skilled enough to allow undo
  const drinkPull = (i) => setMinigame(mg => {
    if (!mg || mg.type !== "drink" || mg.phase !== "sliders") return mg;
    const pulled = mg.pulled.slice();
    pulled[i] = mg.allowUndo ? !pulled[i] : true;         // skilled → toggle; else one-way commit
    return { ...mg, pulled };
  });
  // Pour → verify the pulled set exactly equals the required set
  const drinkPour = () => {
    const mg = minigameRef.current; if (!mg || mg.type !== "drink" || mg.phase !== "sliders") return;
    const ok = mg.pulled.every((v, i) => v === mg.required.includes(i));
    if (!ok) return drinkDeliver(mg.recipe, mg.bId, false);        // wrong sliders → Sludge
    if (mg.pass < mg.passes) {                                     // Stage 6: under-skilled hard drink → another slider pass
      const idxs = Array.from({ length: mg.n }, (_, i) => i);
      for (let i = idxs.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [idxs[i], idxs[j]] = [idxs[j], idxs[i]]; }
      const required = idxs.slice(0, mg.required.length).sort((a, b) => a - b);
      return setMinigame({ ...mg, pass: mg.pass + 1, required, pulled: Array(mg.n).fill(false) });
    }
    if (mg.hard) setMinigame({ ...mg, phase: "fill", fill: 0, holding: false });   // part 2: the fill
    else drinkDeliver(mg.recipe, mg.bId, true);
  };
  // hold-fill (hard part 2): fill rises while held; release inside the target band = success
  const drinkHoldStart = () => {
    const mg = minigameRef.current; if (!mg || mg.type !== "drink" || mg.phase !== "fill") return;
    setMinigame(m => ({ ...m, holding: true }));
    const tick = () => {
      const cur = minigameRef.current;
      if (!cur || cur.type !== "drink" || cur.phase !== "fill" || !cur.holding) return;
      if (cur.fill >= 100) { drinkDeliver(cur.recipe, cur.bId, false); return; }   // overflowed → Sludge
      setMinigame(m => (m && m.holding ? { ...m, fill: Math.min(100, m.fill + 2.2) } : m));
      requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  };
  const drinkHoldEnd = () => {
    const mg = minigameRef.current; if (!mg || mg.type !== "drink" || mg.phase !== "fill" || !mg.holding) return;
    const ok = Math.abs(mg.fill - DRINK_FILL_TARGET) <= (mg.fillBand ?? 8);
    drinkDeliver(mg.recipe, mg.bId, ok);
  };

  // the camera's one entry point — every input path (keys, wheel, pinch, buttons) lands here
  const setZoom = (v) => {
    const nz = clamp(Math.round(v * 100) / 100, CFG.ZOOM.min, CFG.ZOOM.max);
    zoomRef.current = nz; setZoomHud(nz);
  };
  const nudgeZoom = (d) => setZoom(zoomRef.current + d);

  /* ===== the left action stack: one button per VERB, a frozen-time picker for WHO =====
     Talk/Gift/Trade always; Threaten + Attack only with steel drawn (p.unsheathed). */
  const nearbyPeople = (kind) => {
    const sim = simRef.current, p = sim.player;
    // v7 Stage 2: a loaded ranged weapon EXTENDS the threaten/attack radius to its range
    const bw = bestWeapon(p);
    const rr = bw && ITEMS[bw].range && (p.inv[ITEMS[bw].ammo] || 0) > 0;
    const rad = (kind === "threaten" || kind === "attack") && rr ? ITEMS[bw].range : CFG.TALK_RADIUS;
    return sim.npcs.filter(n => n.alive && !n.incap && !n.jailedUntil && n.scene === p.scene && !n.hidden
      && dist(n, p) < rad && !n.activity.includes("sleep")
      && ((kind !== "threaten" && kind !== "attack") || !n.enforcer));   // the Watch doesn't get menaced (yet)
  };
  const toggleSheathe = () => {
    const p = simRef.current.player;
    if (!bestWeapon(p)) { showToast("Nothing to draw."); return; }
    p.unsheathed = !p.unsheathed;
    p.unsheathedAt = p.unsheathed ? simRef.current.time + simRef.current.day * 1440 : null; p._steelWarned = false;
    sfx.pop(); showToast(p.unsheathed ? "🗡 Steel drawn." : "Weapon sheathed.");
  };
  const openPicker = (kind) => {
    if ((kind === "threaten" || kind === "attack") && !simRef.current.player.unsheathed) return;
    if (!nearbyPeople(kind).length) { showToast("No one close enough."); return; }
    setPicker({ kind });
  };
  const pickTarget = (npcId) => {
    const kind = picker?.kind; setPicker(null);
    if (!kind || !npcId) return;
    if (kind === "talk") return openChat(npcId);
    if (kind === "gift") { setPayPanel({ npcId }); setPayAmount(""); return; }
    if (kind === "trade") { setTradePanel({ npcId, giveC: 0, giveItem: "", giveQty: 1, askC: 0, askItem: "", askQty: 1, note: "" }); return; }
    if (kind === "threaten") { const tN = simRef.current.npcs.find(n => n.id === npcId); if (tN) tN.steelUntil = performance.now() / 1000 + 60; return threatenNPC(npcId); }
    if (kind === "attack") {   // drawn steel skips the talk: straight to blows — the justice pipeline judges as usual
      const sim = simRef.current, p = sim.player;
      const foe = sim.npcs.find(n => n.id === npcId && n.alive); if (!foe) return;
      const wid = bestWeapon(p), w = wid ? ITEMS[wid] : null;
      { // being attacked is an INCIDENT: every witness reacts (API with local fallback, budget-gated)
        const witnesses = sim.npcs.filter(n => n.alive && !n.incap && !n.jailedUntil && n.id !== npcId && !n.hidden && n.scene === p.scene && !n.activity.includes("sleep"));
        if (witnesses.length && incidentBudget(sim) && !apiBusyRef.current) {
          const byId = Object.fromEntries(sim.npcs.map(n => [n.id, n]));
          const ctx = `the player just attacked ${foe.name} in the open`;
          sim.incidents.count++;
          apiBusyRef.current = true;
          incidentCall("crime", witnesses, ctx, byId).then(out => {
            for (const ww of witnesses) applyWitnessChoice(sim, ww, sim.player, out.choices?.[ww.id] || localWitnessChoice(ww, sim.player), performance.now() / 1000);
          }).catch(() => {
            for (const ww of witnesses) applyWitnessChoice(sim, ww, sim.player, localWitnessChoice(ww, sim.player), performance.now() / 1000);
          }).finally(() => { apiBusyRef.current = false; });
        }
      }
      if (w?.range && (p.inv[w.ammo] || 0) > 0) {   // v7 Stage 2: the OPENING SHOT — spend ammo, strike from range
        p.inv[w.ammo]--; if (p.inv[w.ammo] <= 0) delete p.inv[w.ammo];
        const dmg = randInt(w.dmg);
        foe.health = Math.max(0, foe.health - dmg);
        if (foe.health <= 5) {   // dropped at range — same justice as a won fight, minus the looting
          if (w.lethal) setDying(sim, foe, "player"); else incapacitate(sim, foe);
          if ((foe.wanted || 0) >= 5) {   // a FIVE-STAR takedown is a public service — haul them in for the reward
            repEvent(sim, p, 8, 6, `the player brought down ${foe.name}, the five-star outlaw`);
            showToast(`${w.emoji} ${foe.name} goes down (${dmg}). Get them to a hospital — the cells are waiting.`);
          } else {
            convictStars(sim, p, w.lethal ? 4 : 3, `the player shot ${foe.name} down`);
            const enf = sim.npcs.find(n => n.alive && n.enforcer && !n.dispatch);
            if (enf && p.wanted > 0) enf.dispatch = { targetId: "player" };
            showToast(`${w.emoji} ${foe.name} goes down (${dmg}).`);
          }
        } else {
          setCombat({ foeId: npcId, aggressor: "player", log: [`Your ${ITEMS[w.ammo].name.toLowerCase()} strikes from range (${dmg}). ${foe.name} closes in!`], over: false, won: null });
        }
        return;
      }
      setCombat({ foeId: npcId, aggressor: "player", log: ["You strike first."], over: false, won: null });
    }
  };

  // Player→NPC trade: compose, then the NPC considers (API, local fallback) and answers in a bubble.
  const doOfferTrade = () => {
    const tp = tradePanel; if (!tp) return;
    const sim = simRef.current, p = sim.player;
    const npc = sim.npcs.find(n => n.id === tp.npcId && n.alive); if (!npc) { setTradePanel(null); return; }
    const give = { coins: clamp(Number(tp.giveC) || 0, 0, CFG.TRADE.maxCoins), item: tp.giveItem || null, qty: tp.giveItem ? clamp(Number(tp.giveQty) || 1, 1, 20) : 0 };
    const ask = { coins: clamp(Number(tp.askC) || 0, 0, CFG.TRADE.maxCoins), item: tp.askItem || null, qty: tp.askItem ? clamp(Number(tp.askQty) || 1, 1, 20) : 0 };
    const note = (tp.note || "").trim().slice(0, CFG.TRADE.noteMax);
    if (!give.coins && !give.item && !ask.coins && !ask.item) { showToast("Offer something — or ask for something."); return; }
    if (!canFulfillTrade(p, give)) { showToast("You can't cover that offer."); return; }
    setTradePanel(null);
    const t = { give, ask, note };
    const finish = (accept, say) => {
      if (accept && canFulfillTrade(npc, ask)) {
        executeTrade(sim, p, npc, give, ask, note); sfx.coin(); showToast(`🤝 ${npc.name}: deal!`);
        // the note isn't just flavor: if they own a business and the note reads as a task, they DO it
        if (note && Object.keys(OWNERS).some(b => OWNERS[b] === npc.id)) commissionFavor(sim, npc, note);
      }
      else showToast(`${npc.name} ${accept ? "can't actually cover it." : "declines."}`);
      npc.bubble = { text: say || (accept ? "Deal." : "Not this time."), until: performance.now() / 1000 + 3.5 };
    };
    if (apiBusyRef.current) { finish(localTradeDecide(npc, p, t), null); return; }
    apiBusyRef.current = true;
    tradeConsider(npc, "the player", npc.relationships.player || "neutral", t)
      .then(out => out ? finish(out.accept, out.say) : finish(localTradeDecide(npc, p, t), null))
      .catch(() => finish(localTradeDecide(npc, p, t), null))
      .finally(() => { apiBusyRef.current = false; });
  };
  // NPC→player: accept or wave off an incoming offer
  const answerOffer = (yes) => {
    const off = tradeOffer; if (!off) return;
    const sim = simRef.current, p = sim.player;
    const npc = sim.npcs.find(n => n.id === off.fromId && n.alive);
    setTradeOffer(null);
    if (!npc) return;
    if (yes) {
      if (!canFulfillTrade(npc, off.give)) { showToast(`${npc.name} can't cover it anymore.`); return; }
      if (!canFulfillTrade(p, off.ask)) { showToast("You can't cover their ask."); return; }
      executeTrade(sim, npc, p, off.give, off.ask, off.note); sfx.coin();
      showToast(`🤝 Deal with ${npc.name}!`);
    } else npc.bubble = { text: "Fair enough.", until: performance.now() / 1000 + 3 };
  };

  // Stage 6: the player speaks aloud — shows a bubble; a nearby NPC may reply if it's relevant.
  const doSpeak = (text) => {
    const said = (text || "").trim();
    if (!said) return;
    const sim = simRef.current, p = sim.player, now = performance.now() / 1000;
    p.bubble = { text: said, until: now + 4 }; sfx.pop();
    setSpeakOpen(false); setSpeakText("");
    // find the nearest NPC in earshot who could plausibly react
    if (performance.now() - lastSpeechRef.current < CFG.AMBIENT.speechCooldownMs || apiBusyRef.current) return;
    const near = sim.npcs
      .filter(n => n.alive && !n.incap && n.scene === p.scene && !n.activity.includes("sleep") && dist(n, p) <= CFG.AMBIENT.speechReplyTiles)
      .sort((a, b) => dist(a, p) - dist(b, p))[0];
    if (!near) return;
    lastSpeechRef.current = performance.now(); apiBusyRef.current = true;
    const rel = near.relationships[p.id || "player"] || "neutral";
    const ctx = `You feel ${rel} toward the player. Recently: ${(near.memories || []).slice(-1)[0] || "nothing notable"}.`;
    speechReply(near, "the player", said, ctx)
      .then(reply => { if (reply) near.bubble = { text: reply, until: performance.now() / 1000 + 4.5 }; })
      .catch(() => {})
      .finally(() => { apiBusyRef.current = false; });
  };

  const startCook = (recipeId) => {
    const sim = simRef.current, p = sim.player;
    const chefB = cookPanelRef.current?.chef || null;    // chef shifts: house supplies the ingredients
    const r = RECIPES[recipeId];
    if (!chefB) {
      for (const [ing, n] of Object.entries(r.needs)) if ((p.inv[ing] || 0) < n) return showToast(`Missing ${ITEMS[ing].name}.`);
      for (const [ing, n] of Object.entries(r.needs)) p.inv[ing] -= n;
    }
    setCookPanel(false);
    const r2 = RECIPES[recipeId];
    if (r2.drink) {   // Stage 6: drinks get their own slider minigames (easy = 3 sliders, hard = 4 + hold-fill)
      startDrink(recipeId, chefB);
    } else if (r2.temp != null) {   // Stage 3.6: HARD food recipe — set the oven knob before the timing game
      const tier = r2.tier ?? 2;
      const pr = taskParams(p, "kitchen", tier);
      // badly under-skilled → a 4s countdown to set the EXACT temp; tolerance tightens when green, loosens when skilled
      const tempTol = clamp(COOK_TEMP_TOL * pr.goalW, 8, 40);
      const setDeadline = pr.timeLimit ? Date.now() + 4000 : null;
      // timing goal: centered + wide when skilled, small + random-spot when under-skilled
      const goalCenter = pr.randomGoal ? 0.22 + Math.random() * 0.56 : 0.5;
      setMinigame({ type: "cooktemp", recipe: recipeId, knob: 250, mode: chefB ? "chef" : null, bId: chefB,
        tier, tempTol, setDeadline, goalCenter, goalW: pr.goalW });
    } else {
      setMinigame({ type: "cook", recipe: recipeId, start: Date.now(), mode: chefB ? "chef" : null, bId: chefB });
    }
  };
  /* Stage 3.6: knob locked in → begin the timing game (carries recipe/mode/bId through) */
  const cookTempLock = () => {
    setMinigame(mg => {
      if (!mg || mg.type !== "cooktemp") return mg;
      const want = RECIPES[mg.recipe].temp;
      if (Math.abs(mg.knob - want) > (mg.tempTol ?? COOK_TEMP_TOL)) { showToast(`🌡️ Not quite — aim closer to ${want}°F.`); return mg; }
      return { type: "cook", recipe: mg.recipe, start: Date.now(), mode: mg.mode, bId: mg.bId, hard: true,
        tier: mg.tier, goalCenter: mg.goalCenter ?? 0.5, goalW: mg.goalW ?? 1 };
    });
  };
  const cookStop = () => {
    const mg = minigameRef.current;
    if (!mg || mg.type !== "cook") return;
    const sim = simRef.current, p = sim.player;
    const t = ((Date.now() - mg.start) % CFG.COOK_PERIOD_MS) / CFG.COOK_PERIOD_MS;
    const pos = t < 0.5 ? t * 2 : 2 - t * 2;
    setMinigame(null);
    p.energy = clamp(p.energy - CFG.WORK_COST.cook.energy, 0, 100);
    sim.time += CFG.WORK_COST.cook.min;
    // Stage 5/6: oven upgrade + player skill both widen the timing window; goal may be off-center when green
    let zone = CFG.COOK_ZONE * (mg.goalW ?? 1);
    if (mg.mode === "chef" && mg.bId) {
      if (mg.bId === "cafe_s" && hasUpgrade(sim, "cafe_s", "drinkbar")) zone *= 1.6;
      else if (hasUpgrade(sim, mg.bId, "oven")) zone *= 1.6;
    }
    const center = mg.goalCenter ?? 0.5;
    if (Math.abs(pos - center) <= zone) {
      const yield_ = RECIPES[mg.recipe].out || 1;         // Stage 3.6: dough/cookies plate multiples
      /* Stage 3.6: HARD recipes demand a genuine cook skill check (like the printer).
         Fail = you nail the timing but botch the technique → a Burnt Mess. */
      const plate = () => {
        const cookXp = taskXp("kitchen", mg.tier ?? (mg.hard ? 2 : 1));
        if (mg.mode === "chef") {
          addStock(sim, mg.bId, mg.recipe, yield_ * 2);
          const paid = completeTask(sim, "kitchen", mg.bId, { econKey: "chef", xp: cookXp });
          showToast(`${yield_ * 2} × ${ITEMS[mg.recipe].name} plated for ${bld(mg.bId).name}. +${paid}c.`);
        } else {
          p.inv[mg.recipe] = (p.inv[mg.recipe] || 0) + yield_;
          completeTask(sim, "kitchen", p.scene.slice(2), { xp: cookXp });
          showToast(`${ITEMS[mg.recipe].emoji} ${ITEMS[mg.recipe].name}${yield_ > 1 ? ` ×${yield_}` : ""} — chef's kiss.`);
        }
      };
      if (mg.hard) {                                     // Stage 3.7d: hard recipe done right.
        // Player has NO technique roll — nailing the temp + timing IS success. (Real player-side
        // difficulty comes later via actual mechanics, not chance.) Domain still trains for expertise.
        const domain = TASK_DOMAIN[mg.recipe] || null;
        plate();
        if (trainDomain(p, "kitchen", domain)) showToast(`🌟 You've mastered ${DOMAIN_LABEL[domain]} cooking!`);
      } else plate();
    } else {
      if (mg.mode !== "chef") p.inv.burnt = (p.inv.burnt || 0) + 1;
      if (Math.random() < CFG.SICK.burn) {               // grease doesn't forgive
        const bad = Math.random() < CFG.SICK.burnBad;
        damage(p, bad ? 18 : 8);
        showToast(bad ? "🔥 Burnt it — and yourself, BADLY. Get that looked at." : "🔥 Burnt it, and your hand too. Ow.");
      } else showToast("🔥 Burnt it. Still... technically food.");
    }
  };

  const cookItemGrill = (item) => {
    const sim = simRef.current, order = sim.foodOrder;
    if (!order || order.stage !== "cook") return;
    if (item !== order.items[order.cooked]) { showToast("Wrong item — check the order."); return; }
    order.cooked++;
    if (order.cooked >= order.items.length) {
      order.stage = "serve";
      completeTask(sim, "kitchen", "fastfood", {});      // the grill teaches too (xp only; serve pays)
      showToast("All cooked — serve it at the counter.");
    }
    bump();   // refresh the panel (was setting a bogus minigame that hid it)
  };

  /* =================== TRAVEL (Mo's fare menu) =================== */
  const rideBus = (dest) => {
    const sim = simRef.current, world = worldRef.current, p = sim.player;
    const from = townOfScene(world, p.scene);
    const fare = CFG.FARES[from][dest];
    // Stage 5: own a truck-upgraded business → drive yourself for ceil(Δmiles/25)c instead of the bus fare
    const hasTruck = Object.keys(OWNERS).some(b => OWNERS[b] === "player" && hasUpgrade(sim, b, "truck"));
    const driveC = Math.max(1, Math.ceil(Math.abs((CFG.SHIPPING.miles[from] || 0) - (CFG.SHIPPING.miles[dest] || 0)) / 25));
    const busC = Math.max(1, fare.c - (sim.townUpgrades?.[from]?.roads ? 1 : 0));   // Stage 6: maintained roads
    const cost = hasTruck ? Math.min(driveC, busC) : busC;
    if (!spend(p, cost)) return;
    setTravelPanel(false);
    setTransition(hasTruck ? `You drive the truck to ${world.towns[dest].name}… (${fare.min} min)` : `Mo drives you to ${world.towns[dest].name}… (${fare.min} min)`);
    setTimeout(() => {
      const stop = world.towns[dest].busStop;
      p.scene = `t:${dest}`; p.x = stop.x; p.y = stop.y - 1;
      sim.time += fare.min;
      sim.dayLog = [...sim.dayLog, `the player rode the bus to ${world.towns[dest].name}`].slice(-12);
      setTransition(null);
      saveGame();
    }, 1800);
  };

  /* =================== CHAT =================== */
  const openChat = (npcId) => {
    const npc = simRef.current.npcs.find(n => n.id === npcId);
    setChat({ npcId, name: npc.name, color: npc.color, busy: false,
      msgs: npc.chatLog.length ? [...npc.chatLog] : [{ who: npc.name, text: rand(npc.greets) }] });
    setChatInput("");
  };

  const sendChat = async () => {
    const msg = chatInput.trim();
    if (!msg || apiBusyRef.current || !chat) return;
    const sim = simRef.current, world = worldRef.current;
    const npc = sim.npcs.find(n => n.id === chat.npcId);
    const byId = Object.fromEntries(sim.npcs.map(n => [n.id, n]));

    apiBusyRef.current = true;
    setChatInput("");
    setChat(c => ({ ...c, busy: true, msgs: [...c.msgs, { who: "You", text: msg }] }));

    const p = sim.player;
    const nearby = sim.npcs.filter(n => n.alive && n.id !== npc.id && n.scene === npc.scene && !n.hidden && dist(n, npc) < 4).map(n => n.name).join(", ");
    const ctx = {
      clock: `${pad2(Math.floor(sim.time / 60))}:${pad2(Math.floor(sim.time % 60))}`, day: sim.day,
      townName: world.towns[npc.town].name,
      hunger: Math.round(npc.hunger), thirst: Math.round(npc.thirst), energy: Math.round(npc.energy),
      playerTier: fameTier(p.fame, p.renown), playerWanted: p.wanted,
      playerHealth: p.health, playerHygiene: p.hygiene, playerArmed: !!bestWeapon(p),
      nearby, buzz: sim.buzz?.text || null, recent: sim.dayLog.slice(-3).join("; ") || null,
      interview: sim.interview?.npcId === npc.id ? {
        business: bld(sim.interview.bId).name,
        position: titleFor(JOB_CATEGORY[sim.interview.bId] || "service",   // the rung they'd start at
          (() => { const tr = JOB_TRACK[sim.interview.bId] || "service";
            const lvl = skillLevel(p, tr); let r = 0;
            for (let i = 1; i < CFG.OCCUPATION.promoteAtLevel.length; i++)
              if (lvl >= CFG.OCCUPATION.promoteAtLevel[i]) r = i; return r; })()),
        skills: Object.entries(SKILL_TRACKS).map(([tr, lbl]) => `${lbl} ${skillTierName(p, tr)} (${ROMAN[skillLevel(p, tr)]})`).join(", "),
        exchanges: npc.chatLog.filter(m => m.who === "You").length,
      } : null,
    };

    let out;
    for (let attempt = 0; attempt < 2 && !out; attempt++) {
      try { out = await askNPC(npc, msg, ctx, byId); } catch (e) { /* one retry */ }
    }
    const reply = out?.reply || `*${npc.name} seems distracted and doesn't quite catch that.*`;

    if (out) {
      npc.mood = out.mood || npc.mood;
      if (out.remember && out.remember !== "null") {
        npc.memories = [...npc.memories, out.remember].slice(-CFG.MAX_MEMORIES);
        sim.dayLog = [...sim.dayLog, `the player talked with ${npc.name} (${out.remember})`].slice(-12);
      }
      if (out.relationship === "warmer" && p.hygiene >= CFG.HYGIENE.social) {   // hard to befriend the harbor smell
        const cur = REL_ORDER.indexOf(npc.relationships.player || "neutral");
        npc.relationships.player = REL_ORDER[clamp(cur + 1, 0, REL_ORDER.length - 1)];
      } else if (out.relationship === "cooler") {
        const cur = REL_ORDER.indexOf(npc.relationships.player || "neutral");
        npc.relationships.player = REL_ORDER[clamp(cur - 1, 0, REL_ORDER.length - 1)];
      }
      if (out.impression === "kind") repEvent(sim, p, 0.5, 0.2);
      if (out.impression === "rude") repEvent(sim, p, -1, 0.3, `the player was rude to ${npc.name}`);
      /* the interviewer decides — verdicts land mid-conversation */
      if (out.verdict && out.verdict !== "null" && sim.interview?.npcId === npc.id) {
        const bId = sim.interview.bId;
        if (sim.opening?.bId === bId) sim.opening.done = true;
        if (out.verdict === "hire") {
          if (p.job) {                                    // hiring auto-resigns the old post
            const old = OWNERS[p.job.bId] ? sim.npcs.find(n => n.id === OWNERS[p.job.bId]) : null;
            if (old?.alive) old.memories = [...old.memories, "The player quit on me to work elsewhere"].slice(-CFG.MAX_MEMORIES);
          }
          p.job = { bId, shift: [...CFG.JOBS.shift], missed: 0, workedDay: null, since: sim.day };
          p.occupation = makeOccupation(p, bId, { hiredDay: sim.day });   // formal title, earned rank
          repEvent(sim, p, 2, 2, `the player was hired at ${bld(bId).name}`);
          showToast(`🎉 HIRED at ${bld(bId).name} as ${p.occupation.title}! Weekday shifts ${CFG.JOBS.shift[0]}:00–${CFG.JOBS.shift[1]}:00. On-shift tasks pay your skill + rank bonus.`);
        } else {
          sim.interviewBans[bId] = sim.day + CFG.JOBS.banDays;
          showToast(`Not this time. Reapply at ${bld(bId).name} in ${CFG.JOBS.banDays} days.`);
        }
        sim.interview = null;
      }
    }
    npc.chatLog = [...npc.chatLog, { who: "You", text: msg }, { who: npc.name, text: reply }].slice(-CFG.CHAT_MEMORY);
    npc.bubble = null;
    apiBusyRef.current = false;
    setChat(c => c ? { ...c, busy: false, msgs: [...c.msgs, { who: npc.name, text: reply }] } : c);
  };

  useEffect(() => { chatEndRef.current?.scrollIntoView({ behavior: "smooth" }); }, [chat]);

  /* =================== INPUT =================== */
  useEffect(() => {
    const map = { w: "up", arrowup: "up", s: "down", arrowdown: "down", a: "left", arrowleft: "left", d: "right", arrowright: "right" };
    const bins = { 1: "red", 2: "green", 3: "blue" };
    const dn = (e) => {
      if (modalRef.current) return;
      if (minigameRef.current?.type === "office") { const cats = minigameRef.current.cats || ["red", "green", "blue"]; const c = cats[Number(e.key) - 1]; if (c) { fileBin(c); return; } }
      // Stage 3.6: Computer players get the spacebar as the timing button (phone taps the on-screen button)
      if (!modalRef.current) {   // camera: +/- zoom (repeat is welcome here — hold to glide)
        if (e.key === "+" || e.key === "=") { nudgeZoom(CFG.ZOOM.step); return; }
        if (e.key === "-" || e.key === "_") { nudgeZoom(-CFG.ZOOM.step); return; }
      }
      if (!modalRef.current && !e.repeat) {   // left-stack verbs: G gift, T talk, H trade, B threaten, Z attack
        const k = e.key.toLowerCase();
        if (k === "g") { openPicker("gift"); return; }
        if (k === "t") { openPicker("talk"); return; }
        if (k === "h") { openPicker("trade"); return; }
        if (k === "b") { openPicker("threaten"); return; }
        if (k === "z") { openPicker("attack"); return; }
      }
      if (e.key === " " || e.code === "Space") {
        const mt = minigameRef.current?.type;
        if (mt === "fish" || mt === "fishhard") { e.preventDefault(); fishHook(); return; }
        if (mt === "cook") { e.preventDefault(); cookStop(); return; }
        if (mt === "cooktemp") { e.preventDefault(); cookTempLock(); return; }
      }
      const k = map[e.key.toLowerCase()];
      if (k) { keysRef.current[k] = true; e.preventDefault(); }
    };
    const up = (e) => { const k = map[e.key.toLowerCase()]; if (k) keysRef.current[k] = false; };
    window.addEventListener("keydown", dn); window.addEventListener("keyup", up);
    return () => { window.removeEventListener("keydown", dn); window.removeEventListener("keyup", up); };
  }); // eslint-disable-line

  const padHold = (dir) => ({
    onTouchStart: (e) => { e.preventDefault(); keysRef.current[dir] = true; },
    onTouchEnd:   (e) => { e.preventDefault(); keysRef.current[dir] = false; },
    onMouseDown:  () => { keysRef.current[dir] = true; },
    onMouseUp:    () => { keysRef.current[dir] = false; },
    onMouseLeave: () => { keysRef.current[dir] = false; },
  });

  const openFolk = () => {
    const sim = simRef.current, world = worldRef.current;
    const town = townOfScene(world, sim.player.scene);
    const byId = Object.fromEntries(sim.npcs.map(n => [n.id, n]));
    setFolk(sim.npcs.filter(n => n.town === town).map(n => ({
      id: n.id, home: n.home,                             // Stage 3: the kick-out button needs to know who bunks where
      name: n.name, color: n.color, mood: n.mood, alive: n.alive,
      activity: n.alive ? (n.jailedUntil === Infinity ? "serving a life sentence in the cells" : n.activity) : "resting in the graveyard", intent: n.intent,
      sick: n.sick?.level || null,
      coins: Math.floor(n.coins), inv: invLine(n), tier: fameTier(n.fame, n.renown),
      health: healthDesc(n.health), wanted: n.wanted,
      toYou: n.relationships.player || "neutral",
      memories: [...n.memories], likes: n.likes, dislikes: n.dislikes,
      rels: Object.entries(n.relationships).filter(([id]) => id !== "player")
        .map(([id, st]) => `${st} ${byId[id]?.name || id}`),
    })));
  };

  /* Stage 3: show a housemate the curb (looking at you, Dex — six robberies). One-way:
     they lose the room, take a relationship hit, remember it, and hit the bench loop. */
  const kickOut = (npcId) => {
    const sim = simRef.current;
    const npc = sim.npcs.find(n => n.id === npcId); if (!npc) return;
    npc.home = null;
    const cur = REL_ORDER.indexOf(npc.relationships.player || "neutral");
    npc.relationships.player = REL_ORDER[clamp(cur - 1, 0, REL_ORDER.length - 1)];
    npc.memories = [...npc.memories, "Got kicked out of the spare room"].slice(-CFG.MAX_MEMORIES);
    showToast(`🥾 ${npc.name} is out on the street.`);
    setFolk(null);
  };

  /* =================== RENDER (canvas) =================== */
  const draw = (sim, world, nowMs) => {
    const canvas = canvasRef.current, wrap = wrapRef.current;
    if (!canvas || !wrap || !sim) return;
    const dpr = window.devicePixelRatio || 1;
    const cw = wrap.clientWidth, ch = wrap.clientHeight;
    if (canvas.width !== cw * dpr) { canvas.width = cw * dpr; canvas.height = ch * dpr; }
    const ctx = canvas.getContext("2d");
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.fillStyle = "#151a22"; ctx.fillRect(0, 0, cw, ch);

    const scene = sim.player.scene;
    const { w: gw, h: gh } = sceneGrid(world, scene);
    /* THE CAMERA. zoom 1 = the whole map fits (exactly as it always has). Zoom past 1 and
       the view follows the player, clamped so it never pans past the map's edges. Interiors
       are single rooms — they stay fit-to-screen. Everything downstream reads px/py, so the
       entire renderer inherits this for free. */
    const outdoor = scene.startsWith("t:");
    const z = outdoor ? clamp(zoomRef.current, CFG.ZOOM.min, CFG.ZOOM.max) : 1;
    const fit = Math.min(cw / (gw * CFG.TILE), ch / (gh * CFG.TILE));
    const scale = fit * z;
    const T = CFG.TILE * scale;
    const mapW = gw * T, mapH = gh * T;
    // centre when the map is smaller than the viewport; otherwise follow the player, clamped
    const ox = mapW <= cw ? (cw - mapW) / 2 : clamp(cw / 2 - (sim.player.x + 0.5) * T, cw - mapW, 0);
    const oy = mapH <= ch ? (ch - mapH) / 2 : clamp(ch / 2 - (sim.player.y + 0.5) * T, ch - mapH, 0);
    const px = (x) => ox + x * T, py = (y) => oy + y * T;
    const hour = (sim.time / 60) % 24;
    const night = hour < 6 || hour >= 19;

    if (scene.startsWith("t:")) drawTown(ctx, sim, world.towns[scene.slice(2)], T, px, py, nowMs, night);
    else drawInterior(ctx, sim, world.interiors[scene.slice(2)], T, px, py, nowMs);

    /* the dead lie where they fell, grey, until the Watch clears the scene */
    for (const body of sim.bodies.filter(b => b.scene === scene)) {
      const bx = px(body.x) + T / 2, by = py(body.y) + T / 2;
      ctx.fillStyle = "#8a8a86";
      ctx.beginPath(); ctx.ellipse(bx, by + T * 0.2, T * 0.42, T * 0.2, 0, 0, 7); ctx.fill();
      ctx.fillStyle = "#c9c2b4";
      ctx.beginPath(); ctx.arc(bx - T * 0.35, by + T * 0.18, T * 0.14, 0, 7); ctx.fill();
      ctx.fillStyle = "rgba(255,255,255,0.75)";
      ctx.font = `600 ${Math.max(8, T * 0.26)}px system-ui`; ctx.textAlign = "center";
      ctx.fillText(body.name, bx, by + T * 0.62);
    }
    const ents = [
      ...sim.npcs.filter(n => n.alive && n.scene === scene && !n.hidden).map(n => ({ ...n, kind: "npc", ref: n })),
      { ...sim.player, kind: "player", name: "You", color: "#2e6fe0", ref: sim.player },
    ].sort((a, b) => a.y - b.y);
    for (const e of ents) drawEntity(ctx, e, T, px, py);
    // Stage 3.5: transient FX — crime pulses expand red, arrests flash gold with a rising ⚖️
    sim.fx = (sim.fx || []).filter(f => nowMs - f.born < 2000);
    for (const f of sim.fx) {
      if (f.scene !== sim.player.scene) continue;
      const t01 = (nowMs - f.born) / 2000, cx = px(f.x) + T / 2, cy = py(f.y) + T / 2;
      ctx.globalAlpha = 1 - t01;
      ctx.lineWidth = 3;
      if (f.kind === "crime") {
        ctx.strokeStyle = "#d94a4a";
        ctx.beginPath(); ctx.arc(cx, cy, T * (0.4 + t01 * 1.6), 0, Math.PI * 2); ctx.stroke();
      } else {
        ctx.strokeStyle = "#e6c04a";
        ctx.beginPath(); ctx.arc(cx, cy, T * (0.4 + t01 * 1.2), 0, Math.PI * 2); ctx.stroke();
        ctx.font = `${Math.floor(T * 0.8)}px sans-serif`; ctx.textAlign = "center";
        ctx.fillText("⚖️", cx, cy - T * (0.3 + t01));
      }
      ctx.globalAlpha = 1;
    }
    for (const e of ents) {
      if (e.ref.dying) drawBubble(ctx, "🩸 DYING — get help!", px(e.x) + T / 2, py(e.y) - T * 0.15, T, cw);
      else if (e.ref.incap) drawBubble(ctx, "✚ needs help!", px(e.x) + T / 2, py(e.y) - T * 0.15, T, cw);
      else if (e.ref.bubble) drawBubble(ctx, e.ref.bubble.text, px(e.x) + T / 2, py(e.y) - T * 0.15, T, cw);   // NPCs and the player
    }

    const lampT = townOfScene(worldRef.current, scene);
    const lampMult = simRef.current?.townUpgrades?.[lampT]?.lamps ? 0.5 : 1;   // Stage 6: street lamps brighten the night
    const darkness = clamp(Math.cos(((hour - 13) / 24) * Math.PI * 2) * 0.5 + 0.5, 0, 1) * (scene.startsWith("t:") ? 0.45 : 0.18) * lampMult;
    if (darkness > 0.02) { ctx.fillStyle = `rgba(12,16,42,${darkness})`; ctx.fillRect(0, 0, cw, ch); }
  };

  const drawTown = (ctx, sim, town, T, px, py, nowMs, night) => {
    /* the Watch vehicle: parked wherever the officers are — the whole town
       reads it, for safety or for opportunity */
    const world = worldRef.current;
    const watchHere = sim.npcs.some(n => n.alive && n.enforcer && townOfScene(world, n.scene) === town.id);
    for (let y = 0; y < town.h; y++) for (let x = 0; x < town.w; x++) {
      const t = town.grid[y][x];
      ctx.fillStyle =
        t === "r" ? ((x + y) % 2 ? "#b3a284" : "#a8987c") :
        t === "p" ? ((x + y) % 2 ? "#6fae57" : "#66a350") :
        t === "g" ? ((x + y) % 2 ? "#7a8a72" : "#71816a") :   // graveyard grass — muted, respectful
        t === "w" ? "#4a90c2" : ((x + y) % 2 ? "#7cb45b" : "#74ab54");
      ctx.fillRect(px(x), py(y), T + 0.6, T + 0.6);
      if (t === "w") {
        ctx.fillStyle = `rgba(255,255,255,${0.15 + 0.1 * Math.sin(nowMs / 300 + x + y)})`;
        ctx.fillRect(px(x) + T * 0.2, py(y) + T * 0.2, T * 0.6, T * 0.6);
      }
    }
    /* headstones — one per grave, filled row by row. Empty until it isn't. */
    if (town.grave) {
      sim.graves.filter(g => (g.town || "stonecross") === town.id).forEach((g, i) => {   // only THIS town's dead
        const gx = town.grave.x + 1 + (i * 2) % (town.grave.w - 1);
        const gy = town.grave.y + 1 + Math.floor((i * 2) / (town.grave.w - 1)) * 2;
        if (gy >= town.grave.y + town.grave.h) return;
        ctx.fillStyle = "#9a9a92";
        ctx.fillRect(px(gx) + T * 0.28, py(gy) + T * 0.2, T * 0.44, T * 0.55);
        ctx.fillStyle = "#6e6e66";
        ctx.fillRect(px(gx) + T * 0.28, py(gy) + T * 0.2, T * 0.44, T * 0.12);
        ctx.fillStyle = "rgba(255,255,255,0.8)";
        ctx.font = `600 ${Math.max(7, T * 0.22)}px system-ui`; ctx.textAlign = "center";
        ctx.fillText(g.name, px(gx) + T / 2, py(gy) + T * 1.05);
      });
    }
    for (const [bx2, by2] of bushSpots(town)) {   // v7 Stage 3: forage bushes, low and light
      ctx.fillStyle = "#5b8a3f";
      ctx.beginPath(); ctx.arc(px(bx2) + T / 2, py(by2) + T / 2 + T * 0.12, T * 0.28, 0, 7); ctx.fill();
    }
    for (const [tx, ty] of town.trees) {
      ctx.fillStyle = "#3f6b33";
      ctx.beginPath(); ctx.arc(px(tx) + T / 2, py(ty) + T / 2, T * 0.42, 0, 7); ctx.fill();
    }
    ctx.fillStyle = "#e8c84a";
    ctx.fillRect(px(town.busStop.x) + T * 0.35, py(town.busStop.y) + T * 0.1, T * 0.3, T * 0.5);
    ctx.fillStyle = "#2a2620"; ctx.font = `700 ${T * 0.32}px system-ui`; ctx.textAlign = "center";
    ctx.fillText("🚌", px(town.busStop.x) + T / 2, py(town.busStop.y) + T * 0.45);
    if (watchHere) {
      ctx.fillText("🚓", px(town.busStop.x + 1) + T / 2, py(town.busStop.y) + T * 0.45);
      ctx.fillStyle = "rgba(255,255,255,0.85)"; ctx.font = `600 ${Math.max(8, T * 0.24)}px system-ui`;
      ctx.fillText("the Watch is in town", px(town.busStop.x + 1) + T / 2, py(town.busStop.y) - 3);
      ctx.fillStyle = "#2a2620"; ctx.font = `700 ${T * 0.32}px system-ui`;
    }
    ctx.fillText("💧", px(town.drink.x) + T / 2, py(town.drink.y) + T * 0.6);
    if (town.id === "mossford") ctx.fillText("🎣", px(town.spots.dock.x) + T / 2, py(town.spots.dock.y) + T * 0.6);

    for (const b of BUILDINGS.filter(b => b.town === town.id)) {
      ctx.fillStyle = b.color; ctx.fillRect(px(b.x), py(b.y), b.w * T, b.h * T);
      ctx.fillStyle = b.roof;  ctx.fillRect(px(b.x), py(b.y), b.w * T, T * 0.5);
      ctx.fillStyle = night ? "#ffd97a" : "rgba(20,25,35,0.55)";
      for (let wx = 0; wx < b.w; wx++)
        ctx.fillRect(px(b.x + wx) + T * 0.3, py(b.y) + T * 0.75, T * 0.4, T * 0.35);
      ctx.fillStyle = b.enterable ? "rgba(90,60,35,0.95)" : "rgba(60,40,25,0.9)";
      ctx.fillRect(px(b.door.x) + T * 0.3, py(b.door.y - 1) + T * 0.45, T * 0.4, T * 0.55);
      ctx.fillStyle = "rgba(255,255,255,0.92)";
      ctx.font = `600 ${Math.max(9, T * 0.3)}px system-ui`; ctx.textAlign = "center";
      ctx.fillText(b.name, px(b.x) + (b.w * T) / 2, py(b.y) - 4);
    }
  };

  const drawInterior = (ctx, sim, inter, T, px, py, nowMs) => {
    const colors = { "#": inter.wall, ".": inter.floor, D: "#b09468", K: "#9c7a4a", T: "#7a6a55", G: "#555c66", M: "#8a7a5e", B: "#a86a7a", W: "#8ab0c0", L: "#3a4048" };   // L = cell bars (Stage 2.3)
    for (let y = 0; y < inter.h; y++) for (let x = 0; x < inter.w; x++) {
      const ch = inter.rows[y][x];
      ctx.fillStyle = colors[ch] || inter.floor;
      ctx.fillRect(px(x), py(y), T + 0.6, T + 0.6);
      if (ch === ".") { ctx.fillStyle = "rgba(0,0,0,0.04)"; if ((x + y) % 2) ctx.fillRect(px(x), py(y), T, T); }
    }
    const mess = sim.mess[inter.id] || 0;
    const specks = Math.floor(mess / 12);
    ctx.fillStyle = "rgba(90,70,40,0.45)";
    for (let i = 0; i < specks; i++) {
      const f = inter.floors[(i * 7919) % inter.floors.length];
      const jx = ((i * 2654435761) % 60) / 100 + 0.2, jy = ((i * 40503) % 60) / 100 + 0.2;
      ctx.beginPath(); ctx.arc(px(f.x + jx), py(f.y + jy), T * 0.07, 0, 7); ctx.fill();
    }
    if (sim.task?.bId === inter.id) {
      const pulse = 0.35 + 0.25 * Math.sin(nowMs / 250);
      for (const s of sim.task.spots.filter(s => !s.done)) {
        ctx.strokeStyle = `rgba(255,220,120,${pulse})`; ctx.lineWidth = 3;
        ctx.strokeRect(px(s.x) + 3, py(s.y) + 3, T - 6, T - 6);
      }
    }
    for (const st of Object.values(inter.stations)) {
      if (!st.label) continue;
      ctx.fillStyle = "rgba(255,220,120,0.28)";
      ctx.fillRect(px(st.x) + T * 0.1, py(st.y) + T * 0.1, T * 0.8, T * 0.8);
      ctx.fillStyle = "rgba(255,255,255,0.85)";
      ctx.font = `600 ${Math.max(8, T * 0.26)}px system-ui`; ctx.textAlign = "center";
      ctx.fillText(st.label, px(st.x) + T / 2, py(st.y) - 3);
    }
    /* placed furniture — every home renders its residents' pieces where they stand */
    const placed = sim.homePlacements?.[inter.id];
    if (placed) for (const [key, fid] of Object.entries(placed)) {
      const [fx, fy] = key.split(",").map(Number);
      drawFurnitureArt(ctx, fid, px(fx), py(fy), T);
    }
    /* the till sits ON the counter once bought — its look upgrades with security */
    const reg = sim.registers?.[inter.id];
    const regStn = reg && inter.stations[SHOP_STATION[inter.id]];
    if (reg && regStn) drawRegisterArt(ctx, px(regStn.x), py(regStn.y) - T * 0.55, T, reg.security);
    ctx.fillStyle = "rgba(255,255,255,0.75)";
    ctx.font = `700 ${Math.max(9, T * 0.3)}px system-ui`; ctx.textAlign = "center";
    ctx.fillText("⬇ exit", px(inter.exit.x) + T / 2, py(inter.exit.y) + T * 0.6);
  };

  /* one painter for everyone; the incapacitated lie flat where they fell */
  const drawEntity = (ctx, e, T, px, py) => {
    const cx = px(e.x) + T / 2, cy = py(e.y) + T / 2;
    if (e.ref.incap || e.ref.dying) {
      ctx.fillStyle = e.color;
      ctx.beginPath(); ctx.ellipse(cx, cy + T * 0.2, T * 0.42, T * 0.2, 0, 0, 7); ctx.fill();
      ctx.fillStyle = "#f5deb8";
      ctx.beginPath(); ctx.arc(cx - T * 0.35, cy + T * 0.18, T * 0.14, 0, 7); ctx.fill();
      return;
    }
    ctx.fillStyle = "rgba(0,0,0,0.25)";
    ctx.beginPath(); ctx.ellipse(cx, cy + T * 0.32, T * 0.3, T * 0.12, 0, 0, 7); ctx.fill();
    ctx.fillStyle = e.color;
    ctx.beginPath(); ctx.arc(cx, cy, T * (e.kind === "player" ? 0.36 : 0.34), 0, 7); ctx.fill();
    // v7 Stage 1: steel SHOWS — the player's drawn weapon, or an NPC mid-confrontation
    const steel = e.kind === "player" ? (e.ref.unsheathed && bestWeapon(e.ref))
      : (e.ref.steelUntil > performance.now() / 1000 && (bestWeapon(e.ref) || "knife"));
    if (steel) { ctx.font = `${Math.floor(T * 0.5)}px sans-serif`; ctx.fillText(ITEMS[steel]?.emoji || "🗡", cx + T * 0.28, cy - T * 0.05); }
    ctx.fillStyle = "#f5deb8";
    ctx.beginPath(); ctx.arc(cx, cy - T * 0.12, T * 0.16, 0, 7); ctx.fill();
    if (e.kind === "player") { ctx.fillStyle = "#173a78"; ctx.fillRect(cx - T * 0.2, cy - T * 0.34, T * 0.4, T * 0.12); }
    if (e.ref.wanted > 0) { ctx.fillStyle = "#e0a832"; ctx.font = `700 ${T * 0.3}px system-ui`; ctx.textAlign = "center"; ctx.fillText("★".repeat(Math.min(5, e.ref.wanted)), cx, cy - T * 0.42); }
    ctx.fillStyle = "rgba(255,255,255,0.9)";
    ctx.font = `${e.kind === "player" ? 700 : 600} ${Math.max(8, T * 0.28)}px system-ui`;
    ctx.textAlign = "center";
    ctx.fillText(e.name, cx, cy + T * 0.62);
  };

  const drawBubble = (ctx, text, cx, cy, T, cw) => {
    ctx.font = `500 ${Math.max(9, T * 0.3)}px system-ui`;
    const w = ctx.measureText(text).width + 14, h = T * 0.62;
    const x = clamp(cx - w / 2, 4, cw - w - 4), y = cy - h;
    ctx.fillStyle = "rgba(255,252,244,0.96)";
    ctx.beginPath(); ctx.roundRect(x, y, w, h, 8); ctx.fill();
    ctx.fillStyle = "#2a2620"; ctx.textAlign = "center";
    ctx.fillText(text, x + w / 2, y + h * 0.68);
  };

  /* =================== SCREENS =================== */
  if (screen === "device") {
    return (
      <div style={S.deviceWrap}>
        <div style={S.deviceCard}>
          <div style={{ fontSize: 44 }}>🏘️</div>
          <h1 style={S.title}>ALDERBROOK</h1>
          <p style={S.sub}>Three towns. Twenty-two souls. Real money, real grudges,<br />a hospital with your name on a clipboard, and one empty graveyard.</p>
          <div style={{ display: "flex", gap: 6, justifyContent: "center", margin: "10px 0 4px" }}>
            {Object.entries(CFG.DIFF).map(([k, d]) => (
              <button key={k} style={{ ...S.diffBtn, ...(difficulty === k ? S.diffBtnOn : {}) }} onClick={() => setDifficulty(k)}>{d.label}</button>
            ))}
          </div>
          <p style={{ ...S.sub, opacity: 0.6, fontSize: 12 }}>
            {difficulty === "easy" ? "Someone always finds you. Bills are kind." :
             difficulty === "normal" ? "Death can be survived — at a price." :
             "The graveyard takes hardcore players personally. Save is wiped."}
          </p>
          <div style={{ textAlign: "left", background: "#f1e9d6", border: "1px solid #e0d4b8", borderRadius: 12, padding: "10px 12px", margin: "6px 0 2px" }}>
            <div style={{ fontWeight: 700, fontSize: 13, marginBottom: 4 }}>
              🔑 Anthropic API key {USER_API_KEY
                ? <span style={{ color: "#3f7d4a", fontWeight: 600 }}>· AI ready</span>
                : <span style={{ opacity: 0.55, fontWeight: 400 }}>· AI off until set</span>}
            </div>
            <div style={{ fontSize: 11, opacity: 0.65, marginBottom: 6, lineHeight: 1.35 }}>
              Set your key before starting — building a new town makes AI calls right away. Sent only to Anthropic, stored on this device.
            </div>
            <div style={{ display: "flex", gap: 6 }}>
              <input type="password" value={apiKeyInput} onChange={e => setApiKeyInput(e.target.value)}
                placeholder="sk-ant-…"
                style={{ flex: 1, minWidth: 0, padding: "7px 9px", borderRadius: 8, border: "1px solid #cdbf9f", background: "#fff", fontSize: 13, color: "#2a2620", boxSizing: "border-box" }} />
              <button style={{ ...S.diffBtn, whiteSpace: "nowrap" }}
                onClick={() => { const k = apiKeyInput.trim(); setApiKeyInput(k); setUserApiKey(k); persistApiKey(k); if (simRef.current) simRef.current.settings.apiKey = k; bump(); }}>
                {USER_API_KEY ? "Update" : "Set key"}
              </button>
              {apiKeyInput && (
                <button style={{ ...S.diffBtn, background: "#8a5a5a", color: "#fff", whiteSpace: "nowrap" }}
                  onClick={() => { setApiKeyInput(""); setUserApiKey(""); persistApiKey(""); if (simRef.current) simRef.current.settings.apiKey = ""; bump(); }}>
                  Clear
                </button>
              )}
            </div>
          </div>
          <div style={{ display: "flex", gap: 14, marginTop: 8 }}>
            <button style={S.deviceBtn} onClick={() => start(true, false)}>📱<br />Phone</button>
            <button style={S.deviceBtn} onClick={() => start(false, false)}>🖥️<br />Computer</button>
          </div>
          {saveFound && (
            <>
              <div style={{ display: "flex", gap: 10, marginTop: 12 }}>
                <button style={{ ...S.deviceBtn, padding: "10px", fontSize: 14 }} onClick={() => start(true, true)}>📱 Continue</button>
                <button style={{ ...S.deviceBtn, padding: "10px", fontSize: 14 }} onClick={() => start(false, true)}>🖥️ Continue</button>
              </div>
              <button style={S.wipeBtn} onClick={wipeSave}>🗑 Wipe save</button>
            </>
          )}
        </div>
      </div>
    );
  }

  const barColor = (v) => (v > 50 ? "#5fb85f" : v > 25 ? "#e0a832" : "#d94f3d");
  const fs = isPhone ? 15 : 13;
  const sim = simRef.current;
  const grillOrder = sim?.foodOrder;
  const player = sim?.player;
  const playerTownId = sim && worldRef.current ? townOfScene(worldRef.current, player.scene) : "alderbrook";
  // True when any panel, minigame, or modal is open — used to hide the walking
  // controls (D-pad + contextual action buttons) so they don't overlap the HUD.
  const overlayUp = !!(minigame || chat || interro || folk || picker || tradePanel || tradeOffer ||
    shopPanel || payPanel || managePanel || storagePanel || chestPanel || craftPanel || repairPanel ||
    partyPanel || cookPanel || castPanel || caseBoard || travelPanel || invOpen || speakOpen ||
    settingsOpen || threat || combat || deathScreen || jailScreen);

  return (
    <div style={{ ...S.gameWrap, fontSize: fs }}>
      <style>{`@keyframes fishslide { 0% { left: 0; } 50% { left: calc(100% - 16px); } 100% { left: 0; } }`}</style>

      <div style={S.topBar}>
        <div style={S.clockChip}>{hud?.place || hud?.town || "…"} · D{hud?.day ?? 1} {hud?.clock ?? ""}</div>
        <div style={{ display: "flex", gap: 6, flex: 1, maxWidth: 460 }}>
          {["hunger", "thirst", "energy", "health"].map(n => (
            <div key={n} style={S.barOuter}>
              <div style={{ ...S.barInner, width: `${hud?.[n] ?? 100}%`, background: n === "health" ? "#d95a5a" : barColor(hud?.[n] ?? 100) }} />
              <span style={S.barLabel}>{{ hunger: "🍞", thirst: "💧", energy: "⚡", health: "❤️" }[n]} {hud?.[n] ?? "–"}</span>
            </div>
          ))}
        </div>
        <div style={S.clockChip}>🧼 {hud?.hygiene ?? "–"}</div>
        {hud?.sick && <div style={{ ...S.clockChip, color: "#7fae5f" }}>🤒 {hud.sick}</div>}
        {hud?.wanted > 0 && <div style={{ ...S.clockChip, color: "#e0a832" }}>{"★".repeat(Math.min(5, hud.wanted))}</div>}
        <div style={S.clockChip}>🪙 {hud?.coins ?? 0}</div>
        <button style={S.iconBtn} onClick={() => setInvOpen(true)}>🎒</button>
        <button style={S.iconBtn} onClick={() => { setSpeakText(""); setSpeakOpen(true); }}>💬</button>
        <button style={S.iconBtn} onClick={openFolk}>👥</button>
        <button style={S.iconBtn} onClick={() => setSettingsOpen(true)}>⚙️</button>
      </div>

      <div ref={wrapRef} style={S.canvasWrap}>
        <canvas ref={canvasRef} style={{ width: "100%", height: "100%", display: "block", touchAction: "none" }} />
        {toast && <div style={S.toast}>{toast}</div>}
        {transition && <div style={S.transition}>{transition}</div>}

        {minigame?.type === "office" && (
          <div style={S.gamePanel}>
            <div style={{ fontWeight: 700, marginBottom: 6 }}>
              🗂️ File the <span style={{ color: { red: "#d94f3d", green: "#5fb85f", blue: "#4a6fd1" }[minigame.target] }}>{minigame.target.toUpperCase()}</span> folder ({minigame.round + 1}/{minigame.rounds})
            </div>
            <div style={{ display: "flex", gap: 8 }}>
              {minigame.cats.map((c, i) => (
                <button key={c} style={{ ...S.binBtn, background: { red: "#d94f3d", green: "#5fb85f", blue: "#4a6fd1" }[c] }}
                  onClick={() => fileBin(c)}>{isPhone ? "" : `${i + 1} `}{c}</button>
              ))}
            </div>
          </div>
        )}

        {minigame?.type === "dish" && (
          <div style={S.gamePanel}>
            <div style={{ fontWeight: 700, marginBottom: 6 }}>
              🍽️ Plate {minigame.plate + 1}/{CFG.DISH_PLATES} — {DISH_SEQ.map((s, i) =>
                <span key={s} style={{ opacity: i < minigame.step ? 0.35 : i === minigame.step ? 1 : 0.6, fontWeight: i === minigame.step ? 800 : 500, marginRight: 6 }}>{s}</span>)}
            </div>
            <div style={{ display: "flex", gap: 8 }}>
              {DISH_SEQ.map(s => <button key={s} style={S.binBtn} onClick={() => dishStep(s)}>{s}</button>)}
            </div>
          </div>
        )}

        {minigame?.type === "fish" && (
          <div style={S.gamePanel}>
            <div style={{ fontWeight: 700, marginBottom: 8 }}>🎣 Hook it in the middle…</div>
            <div style={S.fishTrack}>
              <div style={{ ...S.fishZone, left: `${50 - (minigame.zone ?? CFG.FISH_ZONE) * 100}%`, width: `${(minigame.zone ?? CFG.FISH_ZONE) * 200}%` }} />
              <div style={{ ...S.fishMarker, animation: `fishslide ${CFG.FISH_PERIOD_MS}ms linear infinite` }} />
            </div>
            <button style={{ ...S.binBtn, marginTop: 10, background: "#2e6fe0", width: "100%" }} onClick={fishHook}>HOOK!{!isPhone ? " (Space)" : ""}</button>
          </div>
        )}

        {minigame?.type === "fishhard" && (
          <div style={S.gamePanel}>
            <div style={{ fontWeight: 700, marginBottom: 8 }}>🎣 Big one! Reel on the hook — but watch the tension</div>
            {/* tension bar: white (safe) → yellow (risky) → red (snaps). Marker oscillates SLOWLY. */}
            <div style={{ fontSize: 12, opacity: 0.7, marginBottom: 3 }}>Line tension {minigame.redMax > 1 ? "(sturdy line)" : ""}</div>
            <div style={{ position: "relative", height: 22, borderRadius: 11, overflow: "hidden", marginBottom: 10, display: "flex" }}>
              <div style={{ width: "50%", background: "#e8e8e0" }} />
              <div style={{ width: "30%", background: "#e8d060" }} />
              <div style={{ width: "20%", background: "#d85a4a" }} />
              <div style={{ position: "absolute", top: -2, width: 4, height: 26, background: "#222", borderRadius: 2, animation: `fishslide ${CFG.FISH_TENSION_MS}ms linear infinite` }} />
            </div>
            <div style={{ fontSize: 11, opacity: 0.6, marginBottom: 8 }}>
              Yellow pulls: {minigame.yellowHits}/{minigame.yellowMax} · a WHITE pull eases the line back
            </div>
            {/* hook bar (faster) */}
            <div style={S.fishTrack}>
              <div style={{ ...S.fishZone, left: `${50 - minigame.zone * 100}%`, width: `${minigame.zone * 200}%` }} />
              <div style={{ ...S.fishMarker, animation: `fishslide ${CFG.FISH_PERIOD_MS}ms linear infinite` }} />
            </div>
            <button style={{ ...S.binBtn, marginTop: 10, background: "#2e6fe0", width: "100%" }} onClick={fishHook}>REEL!{!isPhone ? " (Space)" : ""}</button>
          </div>
        )}

        {minigame?.type === "cooktemp" && (() => {
          // Stage 3.6.1: a real oven dial. 150-500°F mapped across a 270° arc (gap at bottom).
          // Drag anywhere on the knob to point it; the tip aims where your pointer is.
          const TMIN = 150, TMAX = 500, ARC = 270, START = 135;   // START = degrees CW from +x axis to the low end
          const want = RECIPES[minigame.recipe].temp;
          const tempToAngle = (t) => START + ((t - TMIN) / (TMAX - TMIN)) * ARC;   // screen degrees, CW
          const angleToTemp = (deg) => {
            let a = ((deg - START) % 360 + 360) % 360;            // 0..360 from the low end
            if (a > ARC + (360 - ARC) / 2) a = 0;                 // snap the dead-zone below min to the ends
            else if (a > ARC) a = ARC;
            return Math.round((TMIN + (a / ARC) * (TMAX - TMIN)) / 5) * 5;   // 5°F steps
          };
          const R = 78, CX = 100, CY = 100;
          const pointFor = (deg, rad) => [CX + rad * Math.cos(deg * Math.PI / 180), CY + rad * Math.sin(deg * Math.PI / 180)];
          const setFromPointer = (clientX, clientY, svg) => {
            // Map the screen pointer into viewBox space, then measure the angle from the DIAL's
            // true center (CX,CY) — NOT the element's geometric middle. The SVG may be scaled by
            // CSS, so convert with the viewBox/rect ratio or the dial drifts from the pointer.
            const r = svg.getBoundingClientRect();
            const vbW = 200, vbH = 185;                          // must match the viewBox below
            const vx = (clientX - r.left) * (vbW / r.width);     // pointer in viewBox units
            const vy = (clientY - r.top) * (vbH / r.height);
            const deg = Math.atan2(vy - CY, vx - CX) * 180 / Math.PI;
            setMinigame(mg => mg && mg.type === "cooktemp" ? { ...mg, knob: angleToTemp(deg) } : mg);
          };
          const onDown = (e) => {
            const svg = e.currentTarget; svg.setPointerCapture?.(e.pointerId);
            const move = (ev) => setFromPointer(ev.clientX, ev.clientY, svg);
            move(e);
            const up = () => { window.removeEventListener("pointermove", move); window.removeEventListener("pointerup", up); };
            window.addEventListener("pointermove", move); window.addEventListener("pointerup", up);
          };
          const knobAngle = tempToAngle(minigame.knob);
          const [tipX, tipY] = pointFor(knobAngle, R - 14);
          const tol = minigame.tempTol ?? COOK_TEMP_TOL;
          const onTarget = Math.abs(minigame.knob - want) <= tol;
          // notch marks every 50°F
          const notches = [];
          for (let t = TMIN; t <= TMAX; t += 50) {
            const a = tempToAngle(t), [x1, y1] = pointFor(a, R), [x2, y2] = pointFor(a, R - 9), [lx, ly] = pointFor(a, R - 22);
            notches.push(
              <g key={t}>
                <line x1={x1} y1={y1} x2={x2} y2={y2} stroke={t === want ? "#c0483a" : "#8a7f6a"} strokeWidth={t === want ? 3 : 1.5} />
                <text x={lx} y={ly + 3} fontSize="9" fill={t === want ? "#c0483a" : "#8a7f6a"} textAnchor="middle" fontWeight={t === want ? 700 : 400}>{t}</text>
              </g>
            );
          }
          // the target zone as an arc band
          const [az1x, az1y] = pointFor(tempToAngle(Math.max(TMIN, want - tol)), R);
          const [az2x, az2y] = pointFor(tempToAngle(Math.min(TMAX, want + tol)), R);
          return (
            <div style={S.gamePanel}>
              <div style={{ fontWeight: 700, marginBottom: 4 }}>🌡️ {RECIPES[minigame.recipe].label}</div>
              <div style={{ fontSize: 12, opacity: 0.7, marginBottom: 6 }}>drag the dial to <b>{want}°F</b></div>
              {minigame.setDeadline && <div style={{ fontSize: 12, fontWeight: 700, color: "#c0483a", marginBottom: 4 }}>⏱️ Set it FAST — the oven's already hot!</div>}
              <svg width="200" height="185" viewBox="0 0 200 185" style={{ touchAction: "none", cursor: "grab" }}
                   onPointerDown={onDown}>
                {/* dial face */}
                <circle cx={CX} cy={CY} r={R} fill="#f3ede0" stroke="#cbbfa6" strokeWidth="2" />
                {/* target band */}
                <path d={`M ${az1x} ${az1y} A ${R} ${R} 0 0 1 ${az2x} ${az2y}`} fill="none" stroke="#7fae6f" strokeWidth="5" strokeLinecap="round" opacity="0.85" />
                {notches}
                {/* knob body */}
                <circle cx={CX} cy={CY} r={R - 30} fill={onTarget ? "#5fae5f" : "#c96f4a"} stroke="#00000022" strokeWidth="2" />
                {/* pointer */}
                <line x1={CX} y1={CY} x2={tipX} y2={tipY} stroke="#fff" strokeWidth="5" strokeLinecap="round" />
                <circle cx={tipX} cy={tipY} r="5" fill="#fff" />
                {/* readout */}
                <text x={CX} y={CY + 5} fontSize="18" fontWeight="800" fill="#fff" textAnchor="middle">{minigame.knob}°</text>
              </svg>
              <button style={{ ...S.binBtn, background: onTarget ? "#5fae5f" : "#c96f4a", width: "100%", marginTop: 2 }} onClick={cookTempLock}>
                {onTarget ? "✓ " : ""}SET &amp; START{!isPhone ? " (or Space)" : ""}
              </button>
            </div>
          );
        })()}

        {minigame?.type === "cook" && (
          <div style={S.gamePanel}>
            <div style={{ fontWeight: 700, marginBottom: 8 }}>🍳 {RECIPES[minigame.recipe].label}{minigame.hard ? " (hard — nail it AND the technique)" : ""} — pull it at the peak!</div>
            <div style={S.fishTrack}>
              <div style={{ ...S.fishZone, left: "35%", width: "30%", background: "rgba(224,168,50,0.6)" }} />
              <div style={{ ...S.fishMarker, background: "#e07a3a", animation: `fishslide ${CFG.COOK_PERIOD_MS}ms linear infinite` }} />
            </div>
            <button style={{ ...S.binBtn, marginTop: 10, background: "#c96f4a", width: "100%" }} onClick={cookStop}>PLATE IT!{!isPhone ? " (Space)" : ""}</button>
          </div>
        )}

        {minigame?.type === "drink" && (
          <div style={S.gamePanel}>
            {minigame.phase === "sliders" ? (
              <>
                <div style={{ fontWeight: 700, marginBottom: 8 }}>
                  🥤 Pull ONLY sliders: {minigame.required.map(i => i + 1).join(" & ")} — then Pour
                  {minigame.passes > 1 ? ` · pass ${minigame.pass}/${minigame.passes}` : ""}
                </div>
                <div style={{ display: "flex", gap: 14, justifyContent: "center", alignItems: "flex-start" }}>
                  {Array.from({ length: minigame.n }, (_, i) => (
                    <div key={i} style={{ textAlign: "center" }}>
                      <div
                        onPointerDown={e => { e.preventDefault(); drinkPull(i); }}
                        style={{ position: "relative", width: 34, height: 120, background: "#d8d2c4", borderRadius: 17, cursor: (minigame.pulled[i] && !minigame.allowUndo) ? "default" : "grab", overflow: "hidden" }}>
                        <div style={{ position: "absolute", left: 3, right: 3, height: 30, borderRadius: 15,
                          background: minigame.pulled[i] ? "#5a7d9a" : "#8a94a0",
                          top: minigame.pulled[i] ? 87 : 3, transition: "top 0.15s" }} />
                      </div>
                      <div style={{ fontSize: 13, fontWeight: 700, marginTop: 3, opacity: 0.7 }}>{i + 1}</div>
                    </div>
                  ))}
                </div>
                <button style={{ ...S.binBtn, marginTop: 12, width: "100%", background: "#3a6ea5", color: "#fff" }} onClick={drinkPour}>Pour</button>
                <div style={{ fontSize: 12, opacity: 0.55, marginTop: 4, textAlign: "center" }}>{minigame.allowUndo ? "Tap a slider to toggle it. Pour when you're set." : "Drag a slider down to pull it. No going back — pour when set."}</div>
              </>
            ) : (
              <>
                <div style={{ fontWeight: 700, marginBottom: 8 }}>🥤 Hold to fill — release at the line</div>
                <div style={{ position: "relative", width: 80, height: 160, margin: "0 auto", background: "#e4ddcc", borderRadius: 8, overflow: "hidden", border: "2px solid #b8ae98" }}>
                  <div style={{ position: "absolute", left: 0, right: 0, bottom: `${DRINK_FILL_TARGET - minigame.fillBand}%`, height: `${minigame.fillBand * 2}%`, background: "rgba(90,160,90,0.25)", borderTop: "2px dashed #5a9a5a", borderBottom: "2px dashed #5a9a5a" }} />
                  <div style={{ position: "absolute", left: 0, right: 0, bottom: 0, height: `${minigame.fill}%`, background: "#6a9ac0", transition: "height 0.05s linear" }} />
                  <div style={{ position: "absolute", left: 0, right: 0, bottom: `${minigame.fill}%`, height: 3, background: "#1e4a6a", boxShadow: "0 0 5px rgba(30,74,106,0.9)" }} />
                  <div style={{ position: "absolute", top: 4, right: 6, fontSize: 12, fontWeight: 800, color: "#1e4a6a" }}>{Math.round(minigame.fill)}%</div>
                </div>
                <button
                  onPointerDown={e => { e.preventDefault(); drinkHoldStart(); }}
                  onPointerUp={e => { e.preventDefault(); drinkHoldEnd(); }}
                  onPointerLeave={() => { if (minigameRef.current?.holding) drinkHoldEnd(); }}
                  style={{ ...S.binBtn, marginTop: 12, width: "100%", background: minigame.holding ? "#5a9a5a" : "#3a6ea5", color: "#fff", userSelect: "none", touchAction: "none" }}>
                  {minigame.holding ? "…filling — release at the line!" : "Hold to fill"}
                </button>
              </>
            )}
          </div>
        )}

        {minigame?.type === "print" && (
          <div style={S.gamePanel}>
            <div style={{ fontWeight: 700, marginBottom: 6 }}>
              🖨️ Print run {minigame.round + 1}/{minigame.rounds} — {minigame.barPhase === "out"
                ? (minigame.papers.every(p => p.in) ? "now sweep the bar →" : "stack all 5 sheets in the tray")
                : "← sweep the bar back"}
            </div>
            {/* the drag surface: papers (draggable) + blue tray + bottom sweep bar */}
            <div
              ref={printSurfRef}
              style={{ position: "relative", width: "100%", height: 260, background: "#e9e4d8", borderRadius: 10, overflow: "hidden", touchAction: "none", userSelect: "none" }}
            >
              {/* blue tray — sized to just fit one sheet */}
              <div style={{ position: "absolute", left: `calc(${minigame.tray.x}% - 20px)`, top: `calc(${minigame.tray.y}% - 24px)`,
                width: 40, height: 48, border: "3px solid #3a6ea5", borderRadius: 4, background: "rgba(58,110,165,0.12)", boxSizing: "border-box" }} />
              {/* papers */}
              {minigame.papers.map((pp, i) => (
                <div key={i}
                  onPointerDown={e => printPointerDown(e, i)}
                  style={{ position: "absolute", left: `calc(${pp.x}% - 16px)`, top: `calc(${pp.y}% - 20px)`,
                    width: 32, height: 40, cursor: "grab", fontSize: 30, lineHeight: "40px", textAlign: "center",
                    filter: pp.in ? "drop-shadow(0 0 3px #3a6ea5)" : "none", zIndex: printDragRef.current?.idx === i ? 20 : 5 }}>📄</div>
              ))}
              {/* bottom sweep bar track */}
              <div style={{ position: "absolute", left: 12, right: 12, bottom: 10, height: 26 }}>
                <div style={{ position: "absolute", inset: 0, background: "#cfc8ba", borderRadius: 13 }} />
                <div
                  onPointerDown={printBarDown}
                  style={{ position: "absolute", top: 0, left: `${minigame.bar}%`, transform: "translateX(-50%)",
                    width: 44, height: 26, background: minigame.papers.every(p => p.in) ? "#3a6ea5" : "#9aa0a8",
                    borderRadius: 13, cursor: "grab", boxShadow: "0 1px 3px rgba(0,0,0,0.3)" }} />
              </div>
            </div>
            <div style={{ fontSize: 12, opacity: 0.6, marginTop: 4, textAlign: "center" }}>
              Stack the sheets, drag the bar fully across, then all the way back. 3 clean passes.
            </div>
          </div>
        )}

        {grillOrder?.stage === "cook" && !minigame && (
          <div style={S.gamePanel}>
            <div style={{ fontWeight: 700, marginBottom: 6 }}>
              🔥 Cook in order: {grillOrder.items.map((it, i) =>
                <span key={i} style={{ opacity: i < grillOrder.cooked ? 0.35 : 1, marginRight: 4 }}>{it}</span>)}
              <span style={{ opacity: 0.6, fontWeight: 400 }}> (stand at the grill)</span>
            </div>
            <div style={{ display: "flex", gap: 8 }}>
              {["🍔", "🍟", "🌭", "🥤"].map(it => (
                <button key={it} style={S.binBtn} onClick={() => cookItemGrill(it)}>{it}</button>
              ))}
            </div>
          </div>
        )}

        {/* Any full-screen panel / minigame / modal is up → hide the walking controls
            so they don't overlap the HUD or sit uselessly behind a dialog. */}
        {!overlayUp && (
          <div style={{ ...S.actionCol, right: isPhone ? 10 : 16, bottom: isPhone ? 16 : 16, left: isPhone ? 190 : "auto" }}>
            {actions.map(a => (
              <button key={a.id} style={{ ...S.actionBtn, fontSize: fs }} onClick={() => doAction(a)}>{a.label}</button>
            ))}
          </div>
        )}

        {isPhone && !overlayUp && (
          <div style={S.dpad}>
            <div /><button style={S.padBtn} {...padHold("up")}>▲</button><div />
            <button style={S.padBtn} {...padHold("left")}>◀</button><div style={{ width: 54, height: 54 }} /><button style={S.padBtn} {...padHold("right")}>▶</button>
            <div /><button style={S.padBtn} {...padHold("down")}>▼</button><div />
          </div>
        )}
        {!isPhone && <div style={S.hint}>WASD/arrows · G gift · T talk · H trade · draw steel to B threaten / Z attack · counters, stoves, docks & beds all have actions</div>}
      </div>

      {/* ⚙️ settings — difficulty + AI budget */}
      {settingsOpen && sim && (
        <div style={S.chatOverlay} onClick={() => setSettingsOpen(false)}>
          <div style={{ ...S.chatPanel, maxWidth: 440 }} onClick={e => e.stopPropagation()}>
            <div style={{ ...S.chatHeader, background: "#3a4358" }}>
              <span style={{ fontWeight: 700 }}>Settings</span>
              <button style={S.closeBtn} onClick={() => setSettingsOpen(false)}>✕</button>
            </div>
            <div style={S.chatBody}>
              <div style={S.folkCard}>
                <div style={{ fontWeight: 700, marginBottom: 6 }}>🔊 Sound</div>
                <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
                  <button style={{ ...S.smallBtn, flex: 1, ...(sim.settings.sfx !== false ? S.diffBtnOn : {}) }}
                    onClick={() => { const on = sim.settings.sfx === false; sim.settings.sfx = on; sfx.enabled = on; if (on) sfx.chime(); bump(); saveGame(); }}>
                    {sim.settings.sfx !== false ? "🔊 On" : "🔇 Off"}
                  </button>
                  <input type="range" min="0" max="100" value={Math.round((sim.settings.sfxVol ?? 0.6) * 100)}
                    onChange={e => { const v = Number(e.target.value) / 100; sim.settings.sfxVol = v; sfx.volume = v; bump(); }}
                    onMouseUp={() => { sfx.click(); saveGame(); }} onTouchEnd={() => { sfx.click(); saveGame(); }}
                    style={{ flex: 2 }} />
                </div>
              </div>
              <div style={S.folkCard}>
                <div style={{ fontWeight: 700, marginBottom: 6 }}>🔑 Anthropic API key <span style={{ fontWeight: 400, opacity: 0.6 }}>(required for AI)</span></div>
                <div style={{ fontSize: fs - 2, opacity: 0.7, marginBottom: 6 }}>
                  Paste your own Anthropic API key to power the AI features (NPC minds, pulses, chat). It's sent straight from your browser to Anthropic — never to any other server — and is stored on this device only when you save. Get one at console.anthropic.com. The town still runs without a key; the AI just stays quiet.
                </div>
                <input type="password" value={apiKeyInput} onChange={e => setApiKeyInput(e.target.value)}
                  placeholder="sk-ant-… (stored on this device only if you save)"
                  style={{ width: "100%", padding: "8px 10px", borderRadius: 8, border: "1px solid #ccc", fontSize: 14, boxSizing: "border-box" }} />
                <div style={{ display: "flex", gap: 6, marginTop: 8 }}>
                  <button style={{ ...S.smallBtn, flex: 1 }} onClick={() => { const k = apiKeyInput.trim(); setApiKeyInput(k); setUserApiKey(k); sim.settings.apiKey = k; persistApiKey(k); showToast(k ? "🔑 API key set." : "Key cleared — AI paused."); bump(); saveGame(); }}>Apply key</button>
                  {apiKeyInput && <button style={{ ...S.smallBtn, background: "#8a5a5a" }} onClick={() => { setApiKeyInput(""); setUserApiKey(""); sim.settings.apiKey = ""; persistApiKey(""); showToast("Key cleared."); bump(); saveGame(); }}>Clear</button>}
                </div>
              </div>
              <div style={S.folkCard}>
                <div style={{ fontWeight: 700, marginBottom: 6 }}>💾 Save file</div>
                <div style={{ fontSize: fs - 2, opacity: 0.7, marginBottom: 6 }}>
                  Download your progress as a file, or load one — works even outside Claude (webpage builds).
                </div>
                <div style={{ display: "flex", gap: 6 }}>
                  <button style={{ ...S.smallBtn, flex: 1 }} onClick={exportSave}>⬇️ Export</button>
                  <button style={{ ...S.smallBtn, flex: 1 }} onClick={() => saveFileInputRef.current?.click()}>📂 Import</button>
                </div>
                <input ref={saveFileInputRef} type="file" accept="application/json,.json" style={{ display: "none" }}
                  onChange={e => { importSave(e.target.files?.[0]); e.target.value = ""; }} />
              </div>
              <div style={S.folkCard}>
                <div style={{ fontWeight: 700, marginBottom: 6 }}>💀 Difficulty (death & bills)</div>
                <div style={{ display: "flex", gap: 6 }}>
                  {Object.entries(CFG.DIFF).map(([k, d]) => (
                    <button key={k} style={{ ...S.diffBtn, ...(sim.settings.difficulty === k ? S.diffBtnOn : {}) }}
                      onClick={() => { sim.settings.difficulty = k; bump(); saveGame(); }}>{d.label}</button>
                  ))}
                </div>
                <div style={{ fontSize: fs - 2, opacity: 0.65, marginTop: 6 }}>
                  Easy: always rescued, half bills. Normal: death revives at heavy cost. Hardcore: death is death — save wiped.
                </div>
              </div>
              <div style={S.folkCard}>
                <div style={{ fontWeight: 700, marginBottom: 6 }}>🤖 AI budget (per town, per day)</div>
                <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
                  <span style={{ flex: 1 }}>Daily Pulse + Nudges</span>
                  <button style={{ ...S.diffBtn, ...(sim.settings.pulse ? S.diffBtnOn : {}) }} onClick={() => { sim.settings.pulse = !sim.settings.pulse; bump(); saveGame(); }}>{sim.settings.pulse ? "On" : "Off"}</button>
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
                  <span style={{ flex: 1 }}>Nudges per day</span>
                  {[0, 1, 2].map(n => (
                    <button key={n} style={{ ...S.diffBtn, ...(sim.settings.nudges === n ? S.diffBtnOn : {}) }} onClick={() => { sim.settings.nudges = n; bump(); saveGame(); }}>{n}</button>
                  ))}
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <span style={{ flex: 1 }}>Incident calls</span>
                  {[["Off", 0], ["2/day", 2], ["Unlimited", 99]].map(([lbl, n]) => (
                    <button key={lbl} style={{ ...S.diffBtn, ...(sim.settings.incidents === n ? S.diffBtnOn : {}) }} onClick={() => { sim.settings.incidents = n; bump(); saveGame(); }}>{lbl}</button>
                  ))}
                </div>
                <div style={{ fontSize: fs - 2, opacity: 0.65, marginTop: 6 }}>
                  Incident calls fire only when someone witnesses a crime or faces a robbery — event-driven, so a rowdy day can exceed the usual rhythm.
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* 🚌 Mo's fare menu */}
      {travelPanel && sim && (
        <div style={S.chatOverlay} onClick={() => setTravelPanel(false)}>
          <div style={{ ...S.chatPanel, maxWidth: 420 }} onClick={e => e.stopPropagation()}>
            <div style={{ ...S.chatHeader, background: "#9c752a" }}>
              <span style={{ fontWeight: 700 }}>🚌 Mo's Bus · from {worldRef.current.towns[playerTownId].name}</span>
              <button style={S.closeBtn} onClick={() => setTravelPanel(false)}>✕</button>
            </div>
            <div style={S.chatBody}>
              <div style={{ ...S.folkCard, fontStyle: "italic", opacity: 0.8 }}>Mo leans out the window. "Where to? Fare's by the mile, friend."</div>
              {Object.entries(CFG.FARES[playerTownId]).map(([dest, fare]) => {
                const hasTruck = Object.keys(OWNERS).some(b => OWNERS[b] === "player" && hasUpgrade(simRef.current, b, "truck"));
                const driveC = Math.max(1, Math.ceil(Math.abs((CFG.SHIPPING.miles[playerTownId] || 0) - (CFG.SHIPPING.miles[dest] || 0)) / 25));
                const busC = Math.max(1, fare.c - (simRef.current?.townUpgrades?.[playerTownId]?.roads ? 1 : 0));
                const cost = hasTruck ? Math.min(driveC, busC) : busC;
                return (
                  <div key={dest} style={{ ...S.folkCard, display: "flex", alignItems: "center", gap: 10 }}>
                    <span style={{ flex: 1 }}><b>{worldRef.current.towns[dest].name}</b> · {fare.min} min {hasTruck ? "drive 🚚" : "ride"}</span>
                    <button style={{ ...S.smallBtn, opacity: player.coins >= cost ? 1 : 0.4 }} onClick={() => rideBus(dest)}>{cost}c</button>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {/* 🍳 recipe picker */}
      {cookPanel && player && (
        <div style={S.chatOverlay} onClick={() => setCookPanel(false)}>
          <div style={{ ...S.chatPanel, maxWidth: 440 }} onClick={e => e.stopPropagation()}>
            <div style={{ ...S.chatHeader, background: "#c96f4a" }}>
              <span style={{ fontWeight: 700 }}>🍳 The Stove</span>
              <button style={S.closeBtn} onClick={() => setCookPanel(false)}>✕</button>
            </div>
            <div style={S.chatBody}>
              {Object.entries(RECIPES).filter(([id, r]) => {
                // Stage 3.8: split by station — the drink bar mixes drinks, the stove cooks food.
                if (cookPanel?.chef) return KITCHEN[cookPanel.chef]?.includes(id);
                if (cookPanel?.drinks) return !!r.drink;    // drink station: only drinks
                return !r.drink;                            // stove: only food (drinks excluded)
              }).map(([id, r]) => {
                const can = cookPanel?.chef ? true : Object.entries(r.needs).every(([ing, n]) => (player.inv[ing] || 0) >= n);
                return (
                  <div key={id} style={{ ...S.folkCard, display: "flex", alignItems: "center", gap: 10, opacity: can ? 1 : 0.55 }}>
                    <span style={{ fontSize: 22 }}>{ITEMS[id].emoji}</span>
                    <span style={{ flex: 1 }}>
                      <b>{r.label}</b>
                      <div style={{ fontSize: fs - 2, opacity: 0.7 }}>
                        needs {Object.entries(r.needs).map(([ing, n]) => `${ITEMS[ing].emoji}×${n}`).join(" ")}{r.temp != null ? ` · 🌡️${r.temp}°` : ""}{r.out > 1 ? ` · makes ${r.out}` : ""} → worth {ITEMS[id].price}c
                        {r.hard && <span style={{ opacity: 0.7 }}>{"  "}· {TASK_TIER_NAME[r.tier ?? 2]}</span>}
                      </div>
                    </span>
                    <button style={{ ...S.smallBtn, opacity: can ? 1 : 0.4 }} onClick={() => can && startCook(id)}>Cook</button>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {/* 🔪 robbery threat — your move */}
      {threat && sim && (() => {
        const robber = sim.npcs.find(n => n.id === threat.robberId);
        return (
          <div style={S.chatOverlay}>
            <div style={{ ...S.chatPanel, maxWidth: 420 }}>
              <div style={{ ...S.chatHeader, background: "#8a3a3a" }}>
                <span style={{ fontWeight: 700 }}>🔪 {robber.name} steps out of the dark…</span>
              </div>
              <div style={S.chatBody}>
                <div style={{ ...S.folkCard, fontStyle: "italic" }}>"Coins. Now. And we both forget this happened."</div>
                <button style={{ ...S.binBtn, width: "100%" }} onClick={() => threatChoice("submit")}>😨 Hand over the coins</button>
                <button style={{ ...S.binBtn, width: "100%", background: "#2e6fe0" }} onClick={() => threatChoice("run")}>🏃 Run for it</button>
                <button style={{ ...S.binBtn, width: "100%", background: "#8a3a3a" }} onClick={() => threatChoice("fight")}>🥊 Fight back</button>
              </div>
            </div>
          </div>
        );
      })()}

      {/* 🥊 combat */}
      {combat && sim && (() => {
        const foe = sim.npcs.find(n => n.id === combat.foeId);
        return (
          <div style={S.chatOverlay}>
            <div style={{ ...S.chatPanel, maxWidth: 440 }}>
              <div style={{ ...S.chatHeader, background: "#8a3a3a" }}>
                <span style={{ fontWeight: 700 }}>🥊 vs {foe.name}</span>
              </div>
              <div style={S.chatBody}>
                {[["You", player.health], [foe.name, foe.health]].map(([nm, hp]) => (
                  <div key={nm} style={S.barOuter}>
                    <div style={{ ...S.barInner, width: `${Math.max(0, hp)}%`, background: "#d95a5a" }} />
                    <span style={S.barLabel}>{nm}: {Math.max(0, Math.round(hp))}</span>
                  </div>
                ))}
                <div style={{ ...S.folkCard, fontFamily: "monospace", fontSize: fs - 1, whiteSpace: "pre-wrap" }}>
                  {combat.log.join("\n")}
                </div>
                {combat.over
                  ? <button style={{ ...S.binBtn, width: "100%", background: "#2e6fe0" }} onClick={() => setCombat(null)}>{combat.won ? "Walk away" : "..."}</button>
                  : <button style={{ ...S.binBtn, width: "100%" }} onClick={tryFlee}>🏃 Try to flee</button>}
              </div>
            </div>
          </div>
        );
      })()}

      {/* 💀 hardcore epitaph */}
      {deathScreen && (
        <div style={{ ...S.chatOverlay, background: "rgba(5,6,10,0.95)" }}>
          <div style={{ ...S.chatPanel, maxWidth: 420, textAlign: "center", padding: 24 }}>
            <div style={{ fontSize: 44 }}>🪦</div>
            <h2 style={{ color: "#2a2620", margin: "8px 0" }}>Here lies You</h2>
            <p style={{ color: "#5a5245" }}>Day {deathScreen.day} — {deathScreen.cause}.<br />Stonecross finally has a resident.</p>
            <button style={{ ...S.binBtn, background: "#2e6fe0", marginTop: 10 }} onClick={() => setScreen("device")}>Begin again</button>
          </div>
        </div>
      )}

      {/* ⛓️ life sentence — the cell, and the one way out (Stage 2.3) */}
      {managePanel && player && (() => {
        const bId = managePanel.bId, reg = simRef.current.registers[bId];
        const R = CFG.REGISTER;
        return (
          <div style={S.chatOverlay} onClick={() => setManagePanel(null)}>
            <div style={{ ...S.chatPanel, maxWidth: 420, height: "76%" }} onClick={e => e.stopPropagation()}>
              <div style={{ ...S.chatHeader, background: "#4a5a3a" }}>
                <span style={{ fontWeight: 700 }}>⚙️ {bld(bId).name}</span>
                <button style={S.closeBtn} onClick={() => setManagePanel(null)}>✕</button>
              </div>
              <div style={S.chatBody}>
                {/* ---- Register ---- */}
                <div style={{ fontWeight: 700, opacity: 0.75 }}>💵 Cash Register</div>
                {!reg ? (
                  <div style={{ ...S.folkCard }}>
                    <div style={{ fontSize: fs - 1, marginBottom: 6 }}>No register yet. A till holds your takings (safe from muggings), pays a per-sale bonus when it's full, and unlocks every other upgrade. Cap 100c until you add security.</div>
                    <button style={{ ...S.binBtn, background: player.coins >= R.unlockCost ? "#5a8a4a" : "#888", width: "100%" }}
                      disabled={player.coins < R.unlockCost}
                      onClick={() => { if (buyRegisterTier(simRef.current, bId, 0)) { sfx.purchase(); showToast("🧾 Register installed!"); bump(); setManagePanel({ bId }); } }}>
                      Install register — {R.unlockCost}c (from pocket)
                    </button>
                  </div>
                ) : (
                  <div style={{ ...S.folkCard }}>
                    <div style={{ fontSize: fs - 1 }}>
                      Security: <b>{["None", "Light", "High"][reg.security]}</b> · Till: <b>{reg.cash}c</b> / {regCap(reg)}c cap<br />
                      <span style={{ opacity: 0.7 }}>Per-sale bonus: {reg.cash >= 200 ? "+2c" : reg.cash >= 50 ? "+1c" : "none (fill to 50c)"}. Robbery exposure: {Math.round((R.robYield[reg.security]) * 100)}% of till.</span>
                    </div>
                    <div style={{ display: "flex", gap: 6, marginTop: 8 }}>
                      {reg.security < 1 && <button style={{ ...S.smallBtn, flex: 1, opacity: reg.cash >= R.lightCost ? 1 : 0.4 }} disabled={reg.cash < R.lightCost}
                        onClick={() => { if (buyRegisterTier(simRef.current, bId, 1)) { showToast("🔐 Light security — cap 500c, robbery yield 60%."); bump(); setManagePanel({ bId }); } }}>Light security · {R.lightCost}c</button>}
                      {reg.security < 2 && <button style={{ ...S.smallBtn, flex: 1, opacity: reg.cash >= R.highCost ? 1 : 0.4 }} disabled={reg.cash < R.highCost}
                        onClick={() => { if (buyRegisterTier(simRef.current, bId, 2)) { showToast("🛡️ High security — robbery yield 30%, alarm risk for thieves."); bump(); setManagePanel({ bId }); } }}>High security · {R.highCost}c</button>}
                    </div>
                    <div style={{ fontSize: fs - 3, opacity: 0.6, marginTop: 4 }}>Upgrades are paid from the till's cash.</div>
                    <button style={{ ...S.smallBtn, marginTop: 8, background: "#7a6a4a", width: "100%" }}
                      onClick={() => { const take = reg.cash; reg.cash = 0; player.coins += take; showToast(`Banked ${take}c from the till.`); bump(); setManagePanel({ bId }); }}>
                      Bank the till → pocket ({reg.cash}c)
                    </button>
                  </div>
                )}
                {reg && (() => {
                  const ups = upgradesFor(bId);
                  if (!ups.length) return null;
                  return (
                    <>
                      <div style={{ fontWeight: 700, opacity: 0.75, marginTop: 12 }}>🔧 Business Upgrades <span style={{ fontWeight: 400, opacity: 0.6 }}>(paid from the till)</span></div>
                      {ups.map(upId => {
                        const u = CFG.UPGRADES[upId], owned = hasUpgrade(simRef.current, bId, upId);
                        return (
                          <div key={upId} style={{ ...S.folkCard, display: "flex", alignItems: "center", gap: 8, opacity: owned ? 0.55 : 1 }}>
                            <span style={{ fontSize: 20 }}>{u.emoji}</span>
                            <span style={{ flex: 1 }}><b>{u.name}</b> · {u.cost}c<span style={{ fontSize: fs - 3, opacity: 0.6 }}> · {u.effect}</span></span>
                            {owned ? <span style={{ fontSize: fs - 2, opacity: 0.6 }}>owned</span>
                              : <button style={{ ...S.smallBtn, opacity: reg.cash >= u.cost ? 1 : 0.4 }} disabled={reg.cash < u.cost}
                                  onClick={() => { if (buyUpgrade(simRef.current, bId, upId)) { sfx.purchase(); showToast(`${u.emoji} ${u.name} installed!`); bump(); setManagePanel({ bId }); } else showToast("Not enough in the till."); }}>Buy</button>}
                          </div>
                        );
                      })}
                    </>
                  );
                })()}
                {/* ---- Menu & prices — the owner's pen, same bounds the AI owners get ---- */}
                {SHOP_CANDIDATES[bId] && (() => {
                  const sim2 = simRef.current;
                  const menu = sim2.menu?.[bId] || {};
                  const pool = (SHOP_CANDIDATES[bId] || []).filter(id => ITEMS[id] && !FURNITURE[id] && menu[id] == null);
                  return (
                    <>
                      <div style={{ fontWeight: 700, opacity: 0.75, marginTop: 12 }}>📋 Menu & Prices <span style={{ fontWeight: 400, opacity: 0.6 }}>({Object.keys(menu).length}/{CFG.OWNERECON.menuSize})</span></div>
                      {Object.keys(menu).filter(id => ITEMS[id]).map(id => {
                        const st = stockOf(sim2, bId, id), cooked = KITCHEN[bId]?.includes(id);
                        const orderCost = Math.ceil(ITEMS[id].price * CFG.SELFCARE.demandReorderQty * CFG.STOCK.wholesale);
                        return (
                          <div key={id} style={{ ...S.folkCard, display: "flex", alignItems: "center", gap: 6 }}>
                            <span style={{ fontSize: 18 }}>{ITEMS[id].emoji}</span>
                            <span style={{ flex: 1, fontSize: fs - 1 }}><b>{ITEMS[id].name}</b><span style={{ opacity: 0.6, fontSize: fs - 3 }}> · base {ITEMS[id].price}c · {st} in stock</span></span>
                            <button style={S.smallBtn} onClick={() => playerSetPrice(sim2, bId, id, -1)}>−</button>
                            <b style={{ minWidth: 28, textAlign: "center" }}>{menu[id] ?? ITEMS[id].price}c</b>
                            <button style={S.smallBtn} onClick={() => playerSetPrice(sim2, bId, id, 1)}>+</button>
                            {!cooked && st <= CFG.STOCK.low && <button style={{ ...S.smallBtn, background: "#5a7a9a" }} title={`order ${CFG.SELFCARE.demandReorderQty} at wholesale`} onClick={() => playerOrderStock(sim2, bId, id)}>📦 {orderCost}c</button>}
                            {cooked && st <= CFG.STOCK.low && <span style={{ fontSize: fs - 3, opacity: 0.6 }}>cook it</span>}
                            <button style={{ ...S.smallBtn, background: "#8a5a5a" }} onClick={() => playerMenuDrop(sim2, bId, id)}>✕</button>
                          </div>
                        );
                      })}
                      {pool.length > 0 && Object.keys(menu).length < CFG.OWNERECON.menuSize && (
                        <div style={{ ...S.folkCard }}>
                          <div style={{ fontSize: fs - 2, opacity: 0.7, marginBottom: 4 }}>Add to menu:</div>
                          <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
                            {pool.map(id => (
                              <button key={id} style={{ ...S.smallBtn }} title={`${ITEMS[id].name} · base ${ITEMS[id].price}c`} onClick={() => playerMenuAdd(sim2, bId, id)}>{ITEMS[id].emoji} {ITEMS[id].name}</button>
                            ))}
                          </div>
                        </div>
                      )}
                    </>
                  );
                })()}
                {/* ---- Staffing — hire like any owner does ---- */}
                {(() => {
                  const sim2 = simRef.current;
                  const staff = sim2.npcs.filter(n => n.alive && n.occupation?.bId === bId && !n.occupation.owner);
                  return (
                    <>
                      <div style={{ fontWeight: 700, opacity: 0.75, marginTop: 12 }}>🤝 Staff</div>
                      {staff.length === 0 && <div style={{ ...S.folkCard, opacity: 0.7, fontSize: fs - 1 }}>Nobody on the payroll — it's all you.</div>}
                      {staff.map(n => (
                        <div key={n.id} style={{ ...S.folkCard, display: "flex", alignItems: "center", gap: 8 }}>
                          <span style={{ width: 12, height: 12, borderRadius: 6, background: n.color, display: "inline-block" }} />
                          <span style={{ flex: 1 }}><b>{n.name}</b> · {n.occupation.title}</span>
                          <span style={{ fontSize: fs - 3, opacity: 0.6 }}>works {CFG.JOBS.shift[0]}:00–{CFG.JOBS.shift[1]}:00</span>
                        </div>
                      ))}
                      {staff.length < 2 && (
                        <button style={{ ...S.smallBtn, width: "100%", background: "#4a6a5a" }} onClick={() => playerHire(sim2, bId)}>
                          🤝 Hire help (best available job-seeker)
                        </button>
                      )}
                    </>
                  );
                })()}
              </div>
            </div>
          </div>
        );
      })()}

      {/* 🪑 furniture placement — tap a highlighted slot on the little floor plan */}
      {placePanel && player && (() => {
        const sim2 = simRef.current, homeId = player.home || "home_p";
        const def = INTERIOR_DEFS[homeId];
        const placed = sim2.homePlacements?.[homeId] || {};
        const free = freeSlotsOf(sim2, homeId);
        const f = FURNITURE[placePanel.furnId];
        const glyphEmoji = { B: "🛏️", G: "🍳", W: "🚿", D: "🚪" };
        const doPlace = (slot) => {
          placeFurniture(sim2, worldRef.current, homeId, slot, placePanel.furnId);
          setPlacePanel(null); sfx.pop(); showToast(`${f.emoji} ${f.name} — placed ${slot.label}.`); saveGame(); bump();
        };
        return (
          <div style={S.chatOverlay}>
            <div style={{ ...S.chatPanel, maxWidth: 420, padding: 16 }} onClick={e => e.stopPropagation()}>
              <div style={{ ...S.chatHeader, background: "#735536" }}>
                <span style={{ fontWeight: 700 }}>{f?.emoji} Place your {f?.name}</span>
              </div>
              <div style={{ ...S.chatBody, gap: 10, alignItems: "center" }}>
                {free.length === 0 ? (
                  <>
                    <div style={{ fontSize: fs, opacity: 0.8 }}>No free spot right now — it waits in the hall closet and will stand when a spot opens.</div>
                    <button style={{ ...S.binBtn, background: "#7a6a4a" }} onClick={() => setPlacePanel(null)}>Fine</button>
                  </>
                ) : (
                  <>
                    <div style={{ fontSize: fs - 1, opacity: 0.75 }}>Tap a green tile. The door, the beds and the walking lanes stay clear — house rules.</div>
                    <div style={{ display: "grid", gridTemplateColumns: `repeat(${def.rows[0].length}, 26px)`, gap: 2 }}>
                      {def.rows.flatMap((row, y) => [...row].map((ch, x) => {
                        const key = `${x},${y}`;
                        const slot = free.find(s => s.x === x && s.y === y);
                        const here = placed[key];
                        return (
                          <div key={key} onClick={() => slot && doPlace(slot)}
                            title={slot?.label || ""}
                            style={{ width: 26, height: 26, borderRadius: 4, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 15,
                              cursor: slot ? "pointer" : "default",
                              background: ch === "#" ? "#4a4436" : here ? "#d8c9a8" : slot ? "#8fae76" : "#e8dfc9",
                              boxShadow: slot ? "inset 0 0 0 2px #5a7a3a" : "none" }}>
                            {here ? FURNITURE[here]?.emoji : slot ? "＋" : glyphEmoji[ch] || ""}
                          </div>
                        );
                      }))}
                    </div>
                    <button style={{ ...S.smallBtn, background: "#7a6a4a" }} onClick={() => doPlace(free[Math.floor(Math.random() * free.length)])}>Let the movers pick</button>
                  </>
                )}
              </div>
            </div>
          </div>
        );
      })()}

      {/* 💼 the owner's asking price, on the table */}
      {bizOffer && player && (() => {
        const sim2 = simRef.current, seller = sim2.npcs.find(n => n.id === OWNERS[bizOffer.bId]);
        return (
          <div style={S.chatOverlay} onClick={() => setBizOffer(null)}>
            <div style={{ ...S.chatPanel, maxWidth: 400, padding: 18 }} onClick={e => e.stopPropagation()}>
              <div style={{ ...S.chatHeader, background: "#4a5a3a" }}>
                <span style={{ fontWeight: 700 }}>💼 {bld(bizOffer.bId).name}</span>
                <button style={S.closeBtn} onClick={() => setBizOffer(null)}>✕</button>
              </div>
              <div style={{ ...S.chatBody, gap: 10 }}>
                <div style={{ ...S.folkCard, fontStyle: "italic" }}>"{bizOffer.say}"</div>
                <div style={{ textAlign: "center", fontSize: 17, fontWeight: 700 }}>
                  {seller?.name} asks {bizOffer.price}c
                  <span style={{ fontSize: fs - 2, fontWeight: 400, opacity: 0.6 }}> · market benchmark {BUSINESS_PRICE[bizOffer.bId]}c</span>
                </div>
                <div style={{ display: "flex", gap: 8 }}>
                  <button style={{ ...S.binBtn, flex: 1, background: player.coins >= bizOffer.price ? "#5a8a4a" : "#888" }} disabled={player.coins < bizOffer.price}
                    onClick={() => acceptBizOffer(bizOffer)}>🤝 Shake on it — {bizOffer.price}c</button>
                  <button style={{ ...S.binBtn, flex: 1, background: "#7a6a4a" }} onClick={() => setBizOffer(null)}>Walk away</button>
                </div>
                <div style={{ fontSize: fs - 2, opacity: 0.6, textAlign: "center" }}>Their number can change tomorrow.</div>
              </div>
            </div>
          </div>
        );
      })()}

      {/* 🏛️ the hall: ledger, taxes, elections — and the mayor's own tools */}
      {hallPanel && player && (() => {
        const sim2 = simRef.current, t = hallPanel.town;
        const mayorNpc = sim2.npcs.find(n => n.mayor && n.alive);
        const mayorName = sim2.playerMayor ? "YOU" : mayorNpc ? `${mayorNpc.name} (${TOWN_DEFS[mayorNpc.town]?.name || mayorNpc.town})` : "(the chair sits empty)";
        const el = sim2.election || { nextDay: sim2.day + 1, playerRunning: false, last: null };
        const rate = Math.round((sim2.taxRate ?? CFG.TAX.rate) * 100);
        const wt = CFG.WEALTH_TAX;
        const ups = Object.keys(sim2.townUpgrades?.[t] || {}).map(id => `${TOWN_UPGRADES[id]?.emoji} ${TOWN_UPGRADES[id]?.name}`).join(", ") || "none yet";
        const bench = sim2.npcs.filter(n => n.alive && n.renown >= 12 && !n.outlaw && !n.thief && !n.minor && !n.enforcer && n.home && !n.jailedUntil && !n.mayor)
          .sort((a, b) => b.renown - a.renown).slice(0, 2);
        const setRate = (d) => {
          const nr = clamp((sim2.taxRate ?? CFG.TAX.rate) + d, 0.05, 0.30);
          if (Math.abs(nr - (sim2.taxRate ?? CFG.TAX.rate)) < 0.001) return;
          sim2.taxRate = Math.round(nr * 100) / 100;
          for (const tw of Object.keys(sim2.approval)) sim2.approval[tw] = clamp(sim2.approval[tw] + (d > 0 ? -2 : 1), 0, 100);
          showToast(d > 0 ? `📈 Business tax raised to ${Math.round(sim2.taxRate * 100)}%. Nobody claps.` : `📉 Business tax cut to ${Math.round(sim2.taxRate * 100)}%. The shopkeepers notice.`);
          sim2.dayLog.push(`the mayor set the business tax to ${Math.round(sim2.taxRate * 100)}%`);
          bump();
        };
        const fund = (id) => {
          const u = TOWN_UPGRADES[id], owned = (sim2.townUpgrades[t] = sim2.townUpgrades[t] || {});
          if (!u || owned[id] || (sim2.treasury[t] || 0) < u.cost) return;
          sim2.treasury[t] -= u.cost; owned[id] = true;
          sim2.approval[t] = clamp((sim2.approval[t] ?? 65) + CFG.APPROVAL.upgradeBoost, 0, 100);
          sim2.dayLog.push(`Mayor's office funded ${u.name} in ${t}`);
          sim2.buzz = { text: `The mayor funded ${u.name} in ${TOWN_DEFS[t]?.name || t}!`, day: sim2.day };
          sfx.coin(); showToast(`📯 ${u.emoji} ${u.name} funded from the ${t} safe.`);
          bump();
        };
        return (
          <div style={S.chatOverlay} onClick={() => setHallPanel(null)}>
            <div style={{ ...S.chatPanel, maxWidth: 460, height: "80%" }} onClick={e => e.stopPropagation()}>
              <div style={{ ...S.chatHeader, background: "#8a7a42" }}>
                <span style={{ fontWeight: 700 }}>🏛️ {TOWN_DEFS[t]?.name || t} Hall</span>
                <button style={S.closeBtn} onClick={() => setHallPanel(null)}>✕</button>
              </div>
              <div style={S.chatBody}>
                <div style={{ ...S.folkCard }}>
                  <div style={{ fontWeight: 700, marginBottom: 4 }}>🎖️ Mayor: {mayorName}</div>
                  <div style={{ fontSize: fs - 1 }}>
                    Approval here: <b>{Math.round(sim2.approval?.[t] ?? 65)}%</b> · Treasury: <b>{sim2.treasury[t] || 0}c</b><br />
                    <span style={{ opacity: 0.7 }}>Town upgrades: {ups}</span>
                  </div>
                </div>
                <div style={{ ...S.folkCard }}>
                  <div style={{ fontWeight: 700, marginBottom: 4 }}>💸 The tax code (live rates)</div>
                  <div style={{ fontSize: fs - 1, lineHeight: 1.5 }}>
                    · Business tax: <b>{rate}%</b> of gross takings, weekly (min {CFG.TAX.min}c) — into the local safe<br />
                    · Wealth tax: adults holding ≥{wt.floor}c pay {wt.base}c + {wt.per}c per {wt.bracket}c held, weekly<br />
                    · Rent: {CFG.RENT.amount}c weekly · Business bills every {CFG.BILLS.cycle} days
                  </div>
                </div>
                <div style={{ ...S.folkCard }}>
                  <div style={{ fontWeight: 700, marginBottom: 4 }}>🗳️ Elections</div>
                  <div style={{ fontSize: fs - 1, lineHeight: 1.5 }}>
                    Next election: <b>day {el.nextDay}</b> ({Math.max(0, el.nextDay - sim2.day)} day{el.nextDay - sim2.day === 1 ? "" : "s"} away)<br />
                    Likely challengers: {bench.map(n => n.name).join(", ") || "nobody of note"}<br />
                    {el.playerRunning && <b>You are on the ballot. 🎗️</b>}
                    {sim2.playerMayor && <b>You hold the chair — you're on the ballot automatically.</b>}
                  </div>
                  {el.last && (
                    <div style={{ fontSize: fs - 2, opacity: 0.75, marginTop: 4 }}>
                      Last result (day {el.last.day}): {el.last.tally.map(r => `${r.name} ${r.votes}`).join(" · ")}
                    </div>
                  )}
                  {!el.playerRunning && !sim2.playerMayor && (
                    <button style={{ ...S.smallBtn, marginTop: 6, background: "#4a6a5a", width: "100%" }}
                      onClick={() => { if (!spend(player, CFG.ELECTION.regFee)) return; el.playerRunning = true; sim2.dayLog.push("the player registered to run for mayor"); sim2.buzz = { text: "The NEWCOMER is running for mayor. Genuinely anyone's race now.", day: sim2.day }; showToast("🎗️ You're on the ballot. Make friends — they vote."); bump(); }}>
                      🎗️ Run for mayor ({CFG.ELECTION.regFee}c registration)
                    </button>
                  )}
                </div>
                {sim2.playerMayor && (
                  <>
                    <div style={{ fontWeight: 700, opacity: 0.75, marginTop: 6 }}>🖋️ The Mayor's Pen</div>
                    <div style={{ ...S.folkCard }}>
                      <div style={{ fontWeight: 700, marginBottom: 4 }}>Business tax rate</div>
                      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                        <button style={S.smallBtn} onClick={() => setRate(-0.01)}>−1%</button>
                        <b style={{ fontSize: 16 }}>{rate}%</b>
                        <button style={S.smallBtn} onClick={() => setRate(0.01)}>+1%</button>
                        <span style={{ fontSize: fs - 3, opacity: 0.6 }}>raising it costs approval; cutting it buys a little</span>
                      </div>
                    </div>
                    <div style={{ ...S.folkCard }}>
                      <div style={{ fontWeight: 700, marginBottom: 4 }}>Fund {TOWN_DEFS[t]?.name || t} upgrades <span style={{ fontWeight: 400, opacity: 0.6 }}>(from this hall's safe: {sim2.treasury[t] || 0}c)</span></div>
                      {Object.entries(TOWN_UPGRADES).map(([id, u]) => {
                        const owned = !!sim2.townUpgrades?.[t]?.[id];
                        return (
                          <div key={id} style={{ display: "flex", alignItems: "center", gap: 8, opacity: owned ? 0.5 : 1, marginBottom: 4 }}>
                            <span style={{ flex: 1, fontSize: fs - 1 }}>{u.emoji} <b>{u.name}</b> · {u.cost}c <span style={{ opacity: 0.6 }}>· {u.blurb}</span></span>
                            {owned ? <span style={{ fontSize: fs - 2, opacity: 0.6 }}>done</span>
                              : <button style={{ ...S.smallBtn, opacity: (sim2.treasury[t] || 0) >= u.cost ? 1 : 0.4 }} disabled={(sim2.treasury[t] || 0) < u.cost} onClick={() => fund(id)}>Fund</button>}
                          </div>
                        );
                      })}
                      <div style={{ fontSize: fs - 3, opacity: 0.6 }}>Visit each town's hall to spend that town's safe.</div>
                    </div>
                  </>
                )}
              </div>
            </div>
          </div>
        );
      })()}

      {storagePanel && player && (() => {
        const cap = storeCap(player), store = bestStore(player);
        return (
          <div style={S.chatOverlay} onClick={() => setStoragePanel(false)}>
            <div style={{ ...S.chatPanel, maxWidth: 380, padding: 20 }} onClick={e => e.stopPropagation()}>
              <div style={{ ...S.chatHeader, background: "#3a4a5a" }}>
                <span style={{ fontWeight: 700 }}>{FURNITURE[store]?.emoji} {FURNITURE[store]?.name} · {player.stored}/{cap}c</span>
                <button style={S.closeBtn} onClick={() => setStoragePanel(false)}>✕</button>
              </div>
              <div style={{ ...S.chatBody, gap: 10 }}>
                <div style={{ fontSize: 13, opacity: 0.7 }}>Pocket: 🪙 {Math.floor(player.coins)}c · Stored: 🔒 {player.stored}c (safe from muggings; a burglar must crack it)</div>
                <div style={{ display: "flex", gap: 6 }}>
                  {[5, 20, "all"].map(a => (
                    <button key={"d" + a} style={{ ...S.binBtn, flex: 1 }} onClick={() => depositCash(a === "all" ? player.coins : a)}>Store {a}</button>
                  ))}
                </div>
                <div style={{ display: "flex", gap: 6 }}>
                  {[5, 20, "all"].map(a => (
                    <button key={"w" + a} style={{ ...S.binBtn, flex: 1, background: "#7a6a4a" }} onClick={() => withdrawCash(a === "all" ? player.stored : a)}>Take {a}</button>
                  ))}
                </div>
              </div>
            </div>
          </div>
        );
      })()}

      {chestPanel && player && (() => {
        const slotsUsed = Object.entries(player.chest || {}).reduce((s, [, n]) => s + (1 + Math.floor(n / 5)), 0);
        const cap = FURNITURE.chest.slots;
        const carried = Object.keys(player.inv).filter(id => player.inv[id] > 0 && !FURNITURE[id]);
        return (
          <div style={S.chatOverlay} onClick={() => setChestPanel(false)}>
            <div style={{ ...S.chatPanel, maxWidth: 400, height: "72%" }} onClick={e => e.stopPropagation()}>
              <div style={{ ...S.chatHeader, background: "#6a5a3a" }}>
                <span style={{ fontWeight: 700 }}>🧰 Storage Chest · {slotsUsed}/{cap} slots</span>
                <button style={S.closeBtn} onClick={() => setChestPanel(false)}>✕</button>
              </div>
              <div style={S.chatBody}>
                <div style={{ fontWeight: 700, opacity: 0.7 }}>In the chest:</div>
                {Object.entries(player.chest || {}).filter(([, n]) => n > 0).map(([id, n]) => (
                  <div key={id} style={{ ...S.folkCard, display: "flex", alignItems: "center", gap: 8 }}>
                    <span style={{ fontSize: 20 }}>{ITEMS[id]?.emoji}</span>
                    <span style={{ flex: 1 }}><b>{ITEMS[id]?.name}</b> ×{n}</span>
                    <button style={S.smallBtn} onClick={() => chestMove(id, false)}>Take</button>
                  </div>
                ))}
                <div style={{ fontWeight: 700, opacity: 0.7, marginTop: 6 }}>Carrying:</div>
                {carried.map(id => (
                  <div key={id} style={{ ...S.folkCard, display: "flex", alignItems: "center", gap: 8, background: "#f0eade" }}>
                    <span style={{ fontSize: 20 }}>{ITEMS[id]?.emoji}</span>
                    <span style={{ flex: 1 }}><b>{ITEMS[id]?.name}</b> ×{player.inv[id]}</span>
                    <button style={{ ...S.smallBtn, opacity: slotsUsed < cap ? 1 : 0.4 }} onClick={() => chestMove(id, true)}>Store</button>
                  </div>
                ))}
              </div>
            </div>
          </div>
        );
      })()}

      {interro && (
        <div style={{ ...S.chatOverlay, background: "rgba(8,8,12,0.92)" }}>
          <div style={{ ...S.chatPanel, maxWidth: 460, padding: 20 }}>
            <div style={{ ...S.chatHeader, background: "#3a2f38" }}>
              <span style={{ fontWeight: 700 }}>🔎 Interrogation — Detective {interro.detName}</span>
            </div>
            <div style={{ ...S.chatBody, gap: 8, minHeight: 180 }}>
              {interro.history.map((h, i) => (
                <div key={i} style={{ ...S.folkCard, alignSelf: h.who === "det" ? "flex-start" : "flex-end",
                  background: h.who === "det" ? "#2a2f38" : "#4a4030", color: "#e8e0d0", maxWidth: "85%" }}>
                  <b style={{ opacity: 0.7 }}>{h.who === "det" ? interro.detName : "You"}:</b> {h.text}
                </div>
              ))}
              {interro.busy && <div style={{ fontStyle: "italic", opacity: 0.6 }}>…</div>}
              {interro.concluded && (
                <div style={{ ...S.folkCard, fontWeight: 700, textAlign: "center",
                  background: interro.verdict === "accuse" ? "#7a3a3a" : "#3a5a3a", color: "#fff" }}>
                  {interro.verdict === "accuse" ? "You've been charged with the murder." : "The detective is satisfied — you're cleared."}
                </div>
              )}
            </div>
            {!interro.concluded && interro.offline ? (
              <div style={{ display: "flex", flexDirection: "column", gap: 5, marginTop: 6 }}>
                <div style={{ fontSize: 11, opacity: 0.65, color: "#2a2620", textAlign: "center" }}>
                  Question {Math.min(interro.q, CFG.SKILLCHECK.interrogateQuestions)} of {CFG.SKILLCHECK.interrogateQuestions} · they look {interro.susp >= 70 ? "certain" : interro.susp >= 50 ? "unconvinced" : "doubtful"}
                </div>
                {Object.entries(CFG.INTERRO_OFFLINE.tactics).map(([id, t]) => (
                  <button key={id} onClick={() => offlineTactic(id, !!simRef.current.cases.find(c => c.id === interro.caseId && c.killerId === "player"))}
                    style={{ padding: "8px 10px", borderRadius: 8, border: "none", background: "#2a2f38", color: "#e8e0d0", fontSize: 13, textAlign: "left", fontWeight: 600 }}>
                    {t.label}<span style={{ opacity: 0.5, fontWeight: 400 }}> — {t.blurb}</span>
                  </button>
                ))}
              </div>
            ) : !interro.concluded ? (
              <div style={S.chatInputRow}>
                <input style={{ ...S.chatInput, fontSize: Math.max(16, fs) }} value={chatInput}
                  placeholder={interro.busy ? "…" : "Answer the detective…"} disabled={interro.busy}
                  onChange={e => setChatInput(e.target.value)}
                  onKeyDown={e => { if (e.key === "Enter") answerInterrogation(); }} />
                <button style={{ ...S.sendBtn, opacity: interro.busy || !chatInput.trim() ? 0.5 : 1 }}
                  onClick={answerInterrogation} disabled={interro.busy || !chatInput.trim()}>Answer</button>
              </div>
            ) : (
              <button style={{ ...S.binBtn, width: "100%", background: "#c96f4a", marginTop: 6 }} onClick={closeInterrogation}>
                {interro.verdict === "accuse" ? "Accept the verdict" : "Go"}
              </button>
            )}
          </div>
        </div>
      )}

      {jailScreen && sim && (() => {
        const hour = (sim.time / 60) % 24;
        const [nStart, nEnd] = CFG.PRISON.nightEaseHour;
        const isNight = hour >= nStart || hour < nEnd;
        const guards = sim.npcs.filter(n => n.alive && n.enforcer && n.scene === `i:${jailScreen.bId}` && !n.jailedUntil).length;
        const absMin = sim.day * 1440 + sim.time;
        const onCooldown = !canAttempt(player, "prisonbreak", absMin, CFG.PRISON.breakDailyCap);
        const triesLeft = Math.max(0, CFG.PRISON.breakDailyCap - (player.checkState?.prisonbreak?.day === Math.floor(absMin / 1440) ? player.checkState.prisonbreak.tries : 0));
        return (
          <div style={{ ...S.chatOverlay, background: "rgba(8,8,12,0.94)" }}>
            <div style={{ ...S.chatPanel, maxWidth: 440, padding: 22 }}>
              <div style={{ ...S.chatHeader, background: "#2a2f38" }}>
                <span style={{ fontWeight: 700 }}>⛓️ {bld(jailScreen.bId).name} — {player.jailedUntil === Infinity ? "Holding Cell · LIFE" : `Holding Cell · ${Math.max(0, Math.ceil(((player.jailedUntil || 0) - absMin) / 60))}h left`}</span>
              </div>
              <div style={{ ...S.chatBody, gap: 10 }}>
                <div style={{ ...S.folkCard, fontStyle: "italic" }}>
                  Convicted of murder. Life in these cells. The door is locked, the ledger closed — but a locked door is only as good as the lock.
                </div>
                <div style={{ fontSize: 13, color: "#5a5245", lineHeight: 1.6 }}>
                  🕯️ {isNight ? "It's night — the block is thin." : "Broad daylight — guards are alert."}<br />
                  👮 Guards on duty here: <b>{guards}</b>{guards === 0 ? " (your best chance)" : ""}<br />
                  🎯 Break attempts left today: <b>{triesLeft}</b>
                </div>
                <button
                  style={{ ...S.binBtn, width: "100%", background: onCooldown || triesLeft <= 0 ? "#8a8578" : "#8a3a3a", cursor: onCooldown || triesLeft <= 0 ? "not-allowed" : "pointer" }}
                  disabled={onCooldown || triesLeft <= 0 || player.breaking}
                  onClick={attemptPrisonBreak}>
                  {player.breaking ? "⏳ Working the lock…" : onCooldown ? "🕒 Lie low (cooling down)" : triesLeft <= 0 ? "😮‍💨 Too hot today — wait for tomorrow" : "🔓 Attempt to break out"}
                </button>
                <div style={{ fontSize: 11, color: "#8a8578", textAlign: "center" }}>
                  Success frees you as a hunted 5★ fugitive. Failure means they drag you back.
                </div>
              </div>
            </div>
          </div>
        );
      })()}

      {/* camera controls — outdoors only, where there's a map bigger than the window */}
      {simRef.current?.player.scene.startsWith("t:") && (
        <div style={{ position: "absolute", right: 10, bottom: 120, display: "flex", flexDirection: "column", gap: 6, zIndex: 30 }}>
          <button onClick={() => nudgeZoom(CFG.ZOOM.step)} disabled={zoomHud >= CFG.ZOOM.max}
            style={{ width: 38, height: 38, borderRadius: 10, border: "none", background: "rgba(30,34,44,0.88)", color: "#fff", fontSize: 20, fontWeight: 700, opacity: zoomHud >= CFG.ZOOM.max ? 0.35 : 1 }}>+</button>
          <button onClick={() => nudgeZoom(-CFG.ZOOM.step)} disabled={zoomHud <= CFG.ZOOM.min}
            style={{ width: 38, height: 38, borderRadius: 10, border: "none", background: "rgba(30,34,44,0.88)", color: "#fff", fontSize: 20, fontWeight: 700, opacity: zoomHud <= CFG.ZOOM.min ? 0.35 : 1 }}>−</button>
          {zoomHud > 1 && <div style={{ textAlign: "center", fontSize: 11, color: "#fff", opacity: 0.65 }}>{zoomHud.toFixed(2)}×</div>}
        </div>
      )}

      {/* the LEFT ACTION STACK — one button per verb; picker chooses who */}
      {(() => {
        const p = simRef.current?.player; if (!p) return null;
        const anyone = nearbyPeople("talk").length > 0;
        const armedNow = !!bestWeapon(p);
        if (!anyone && !armedNow) return null;
        const btn = (label, on, show = true, hot = "") => show ? (
          <button key={label} onClick={on} style={{ padding: "10px 12px", borderRadius: 10, border: "none", background: "rgba(30,34,44,0.88)", color: "#fff", fontSize: 14, fontWeight: 700, textAlign: "left", boxShadow: "0 2px 6px rgba(0,0,0,0.35)" }}>
            {label}{hot && !isPhone ? <span style={{ opacity: 0.55, fontWeight: 400 }}> ({hot})</span> : null}
          </button>
        ) : null;
        return (
          <div style={{ position: "absolute", left: 10, bottom: 120, display: "flex", flexDirection: "column", gap: 6, zIndex: 30 }}>
            {btn(p.unsheathed ? "🗡 Sheathe" : "🗡 Draw", toggleSheathe, armedNow)}
            {btn("🎁 Gift", () => openPicker("gift"), anyone, "G")}
            {btn("💬 Talk", () => openPicker("talk"), anyone, "T")}
            {btn("🤝 Trade", () => openPicker("trade"), anyone, "H")}
            {btn("😠 Threaten", () => openPicker("threaten"), anyone && p.unsheathed, "B")}
            {btn("⚔ Attack", () => openPicker("attack"), anyone && p.unsheathed && isPhone)}
          </div>
        );
      })()}

      {/* frozen-time target picker */}
      {picker && (
        <div style={S.chatOverlay} onClick={() => setPicker(null)}>
          <div style={{ ...S.chatPanel, maxWidth: 380 }} onClick={e => e.stopPropagation()}>
            <div style={{ ...S.chatHeader, background: "#3a4a5a" }}>
              <span style={{ fontWeight: 700 }}>
                {picker.kind === "gift" ? "🎁 Gift who?" : picker.kind === "talk" ? "💬 Talk to who?" : picker.kind === "trade" ? "🤝 Trade with who?" : picker.kind === "threaten" ? "😠 Threaten who?" : "⚔ Attack who?"}
              </span>
              <button style={S.closeBtn} onClick={() => setPicker(null)}>✕</button>
            </div>
            <div style={{ padding: 10, display: "flex", flexDirection: "column", gap: 6 }}>
              {nearbyPeople(picker.kind).map(n => (
                <button key={n.id} onClick={() => pickTarget(n.id)}
                  style={{ padding: "10px 12px", borderRadius: 8, border: "none", background: "#eef1f5", fontSize: 15, textAlign: "left", fontWeight: 600 }}>
                  <span style={{ color: n.color }}>●</span> {n.name} <span style={{ opacity: 0.5, fontWeight: 400 }}>— {n.activity}</span>
                </button>
              ))}
              <button onClick={() => setPicker(null)} style={{ padding: "10px 12px", borderRadius: 8, border: "none", background: "#d8d8d8", fontSize: 15, fontWeight: 700 }}>Cancel</button>
            </div>
          </div>
        </div>
      )}

      {/* 🤝 trade composer (player → NPC) */}
      {tradePanel && (() => {
        const tNpc = simRef.current?.npcs.find(n => n.id === tradePanel.npcId);
        const inv = Object.entries(simRef.current?.player.inv || {}).filter(([, q]) => q > 0);
        const catalog = Object.keys(ITEMS).filter(id => ITEMS[id].price > 0);
        const upd = (k, v) => setTradePanel({ ...tradePanel, [k]: v });
        const numIn = { width: 64, padding: "6px 8px", borderRadius: 6, border: "1px solid #ccc", fontSize: 14 };
        const selIn = { flex: 1, padding: "6px 8px", borderRadius: 6, border: "1px solid #ccc", fontSize: 14 };
        return (
          <div style={S.chatOverlay} onClick={() => setTradePanel(null)}>
            <div style={{ ...S.chatPanel, maxWidth: 440 }} onClick={e => e.stopPropagation()}>
              <div style={{ ...S.chatHeader, background: "#5a6a3a" }}>
                <span style={{ fontWeight: 700 }}>🤝 Offer a trade — {tNpc?.name || "?"}</span>
                <button style={S.closeBtn} onClick={() => setTradePanel(null)}>✕</button>
              </div>
              <div style={{ padding: 12, display: "flex", flexDirection: "column", gap: 8 }}>
                <div style={S.folkCard}>
                  <div style={{ fontWeight: 700, marginBottom: 6 }}>You give</div>
                  <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
                    <input type="number" min="0" max={CFG.TRADE.maxCoins} value={tradePanel.giveC} onChange={e => upd("giveC", e.target.value)} style={numIn} /> 🪙
                    <select value={tradePanel.giveItem} onChange={e => upd("giveItem", e.target.value)} style={selIn}>
                      <option value="">— no item —</option>
                      {inv.map(([id, q]) => <option key={id} value={id}>{ITEMS[id]?.emoji} {ITEMS[id]?.name} (×{q})</option>)}
                    </select>
                    {tradePanel.giveItem && <input type="number" min="1" max="20" value={tradePanel.giveQty} onChange={e => upd("giveQty", e.target.value)} style={numIn} />}
                  </div>
                </div>
                <div style={S.folkCard}>
                  <div style={{ fontWeight: 700, marginBottom: 6 }}>You ask</div>
                  <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
                    <input type="number" min="0" max={CFG.TRADE.maxCoins} value={tradePanel.askC} onChange={e => upd("askC", e.target.value)} style={numIn} /> 🪙
                    <select value={tradePanel.askItem} onChange={e => upd("askItem", e.target.value)} style={selIn}>
                      <option value="">— no item —</option>
                      {catalog.map(id => <option key={id} value={id}>{ITEMS[id]?.emoji} {ITEMS[id]?.name}</option>)}
                    </select>
                    {tradePanel.askItem && <input type="number" min="1" max="20" value={tradePanel.askQty} onChange={e => upd("askQty", e.target.value)} style={numIn} />}
                  </div>
                </div>
                {(() => {
                  const ownsBiz = tNpc && Object.keys(OWNERS).some(b => OWNERS[b] === tNpc.id && (SHOP_STOCK[b] || KITCHEN[b] || b === "post"));
                  return (
                    <>
                      <input value={tradePanel.note} maxLength={CFG.TRADE.noteMax} onChange={e => upd("note", e.target.value)}
                        placeholder={ownsBiz ? `e.g. "upgrade the shop and hire more help"` : `Optional: "I'll pay you to…" (they'll remember it)`}
                        style={{ width: "100%", padding: "8px 10px", borderRadius: 8, border: "1px solid #ccc", fontSize: 14, boxSizing: "border-box" }} />
                      {ownsBiz && <div style={{ fontSize: fs - 3, opacity: 0.6, marginTop: -2 }}>💡 {tNpc.name} owns a business — pay them and ask them to upgrade it, hire staff, or restock, and they'll actually do it.</div>}
                    </>
                  );
                })()}
                <button style={{ ...S.binBtn, background: "#3a6ea5", color: "#fff" }} onClick={doOfferTrade}>Make the offer</button>
              </div>
            </div>
          </div>
        );
      })()}

      {/* 🤝 incoming offer (NPC → player) */}
      {tradeOffer && (() => {
        const oNpc = simRef.current?.npcs.find(n => n.id === tradeOffer.fromId);
        return (
          <div style={S.chatOverlay}>
            <div style={{ ...S.chatPanel, maxWidth: 420 }} onClick={e => e.stopPropagation()}>
              <div style={{ ...S.chatHeader, background: "#5a6a3a" }}>
                <span style={{ fontWeight: 700 }}>🤝 {oNpc?.name || "Someone"} has an offer</span>
              </div>
              <div style={{ padding: 14 }}>
                <div style={S.folkCard}>
                  They give: <b>{tradeSummary(tradeOffer.give, { }) === "nothing for nothing" ? "nothing" : tradeSummary(tradeOffer.give, {}).replace(" for nothing", "")}</b><br />
                  They ask: <b>{tradeSummary(tradeOffer.ask, {}).replace(" for nothing", "")}</b>
                </div>
                {tradeOffer.note && <div style={{ fontStyle: "italic", opacity: 0.8, margin: "8px 0" }}>"{tradeOffer.note}"</div>}
                <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
                  <button style={{ ...S.binBtn, flex: 1, background: "#3a7d44", color: "#fff" }} onClick={() => answerOffer(true)}>Accept</button>
                  <button style={{ ...S.binBtn, flex: 1, background: "#8a5a5a", color: "#fff" }} onClick={() => answerOffer(false)}>Decline</button>
                </div>
              </div>
            </div>
          </div>
        );
      })()}

      {/* 🎣 cast chooser (Stage 6) */}
      {castPanel && (
        <div style={S.chatOverlay} onClick={() => setCastPanel(false)}>
          <div style={{ ...S.chatPanel, maxWidth: 420 }} onClick={e => e.stopPropagation()}>
            <div style={{ ...S.chatHeader, background: "#2e5a6a" }}>
              <span style={{ fontWeight: 700 }}>🎣 Cast a line</span>
              <button style={S.closeBtn} onClick={() => setCastPanel(false)}>✕</button>
            </div>
            <div style={{ padding: 14, display: "flex", flexDirection: "column", gap: 8 }}>
              {FISH_DEPTH.map(d => {
                const locked = fishingLevel() < d.gate;
                return (
                  <button key={d.key} disabled={locked}
                    style={{ ...S.binBtn, textAlign: "left", opacity: locked ? 0.45 : 1, cursor: locked ? "not-allowed" : "pointer" }}
                    onClick={() => !locked && startFish(d.key)}>
                    {d.emoji} <b>{d.label}</b> — {locked ? `🔒 needs fishing lvl ${d.gate}` : d.blurb}
                  </button>
                );
              })}
              <div style={{ fontSize: 12, opacity: 0.55 }}>What you hook is luck — and a rare catch fights harder.</div>
            </div>
          </div>
        </div>
      )}

      {/* 💬 speak aloud (Stage 6) */}
      {speakOpen && (
        <div style={S.chatOverlay} onClick={() => setSpeakOpen(false)}>
          <div style={{ ...S.chatPanel, maxWidth: 420 }} onClick={e => e.stopPropagation()}>
            <div style={{ ...S.chatHeader, background: "#3a5a6a" }}>
              <span style={{ fontWeight: 700 }}>💬 Say something aloud</span>
              <button style={S.closeBtn} onClick={() => setSpeakOpen(false)}>✕</button>
            </div>
            <div style={{ padding: 14 }}>
              <input autoFocus value={speakText} onChange={e => setSpeakText(e.target.value)}
                onKeyDown={e => { if (e.key === "Enter") doSpeak(speakText); }}
                placeholder="Speak your mind — anyone nearby might hear…" maxLength={140}
                style={{ width: "100%", padding: "10px 12px", borderRadius: 8, border: "1px solid #ccc", fontSize: 15, boxSizing: "border-box" }} />
              <button style={{ ...S.binBtn, marginTop: 10, width: "100%", background: "#3a6ea5", color: "#fff" }} onClick={() => doSpeak(speakText)}>Speak</button>
              <div style={{ fontSize: 12, opacity: 0.55, marginTop: 6 }}>A nearby townsperson may reply if it's relevant to them.</div>
            </div>
          </div>
        </div>
      )}

      {/* 🎒 inventory */}
      {invOpen && player && (
        <div style={S.chatOverlay} onClick={() => setInvOpen(false)}>
          <div style={{ ...S.chatPanel, maxWidth: 460 }} onClick={e => e.stopPropagation()}>
            <div style={{ ...S.chatHeader, background: "#3a4358" }}>
              <span style={{ fontWeight: 700 }}>Your Pack · 🪙 {Math.floor(player.coins)}</span>
              <button style={S.closeBtn} onClick={() => setInvOpen(false)}>✕</button>
            </div>
            <div style={S.chatBody}>
              <div style={{ ...S.folkCard, fontStyle: "italic", opacity: 0.85 }}>
                You are {fameTier(player.fame, player.renown)} — {healthDesc(player.health)}, {hygieneDesc(player.hygiene)}.
                {player.wanted > 0 && <span style={{ color: "#a05252" }}> Wanted: {"★".repeat(Math.min(5, player.wanted))}</span>}
              </div>
              <div style={S.folkCard}>
                <div style={{ fontWeight: 700 }}>
                  💼 {player.job ? `${player.occupation.title} · ${bld(player.job.bId).name} — weekdays ${player.job.shift[0]}:00–${player.job.shift[1]}:00` : "Freelancer — no contract"}
                </div>
                {player.job && (
                  <div style={{ fontSize: fs - 2, opacity: 0.75, marginTop: 2 }}>
                    Rank {ROMAN[player.occupation.rank + 1]} · Strikes {player.job.missed}/{CFG.JOBS.maxStrikes} · on-shift pay +10%/skill level (max +50%) and +{Math.round(CFG.OCCUPATION.rankRaisePct * 100)}%/rank
                  </div>
                )}
                <div style={{ fontSize: fs - 2, marginTop: 5 }}>
                  <span style={{ opacity: 0.6 }}>Training:</span>{" "}
                  {Object.entries(SKILL_TRACKS)
                    .map(([tr, lbl]) => { const xp = player.skills[tr] || 0; return xp ? `${lbl} ${skillTierName(player, tr)} (${ROMAN[skillLevel(player, tr)]}, ${xp}xp)` : null; })
                    .filter(Boolean).join(" · ") || "none yet — every task teaches its trade"}
                </div>
                {player.expertise && Object.values(player.expertise).some(a => a?.length) && (
                  <div style={{ fontSize: fs - 2, marginTop: 3 }}>
                    <span style={{ opacity: 0.6 }}>Specialties:</span>{" "}
                    {Object.values(player.expertise).flat().map(d => DOMAIN_LABEL[d] || d).join(" · ")}
                  </div>
                )}
                {player.job && (
                  <button style={{ ...S.smallBtn, marginTop: 8, background: "#a05252" }}
                    onClick={() => {
                      const boss = OWNERS[player.job.bId] ? simRef.current.npcs.find(n => n.id === OWNERS[player.job.bId]) : null;
                      if (boss?.alive) boss.memories = [...boss.memories, "The player resigned — on good terms, at least"].slice(-CFG.MAX_MEMORIES);
                      leaveJob(simRef.current.player, simRef.current);
                      bump(); showToast("You resigned. Freelance life it is.");
                    }}>Resign</button>
                )}
              </div>
              {Object.entries(player.inv).filter(([, c]) => c > 0).length === 0 &&
                <div style={{ ...S.folkCard, opacity: 0.7 }}>Empty. The mart in Mossford stocks nearly everything.</div>}
              {Object.entries(player.inv).filter(([, c]) => c > 0).map(([id, c]) => (
                <div key={id} style={{ ...S.folkCard, display: "flex", alignItems: "center", gap: 10 }}>
                  <span style={{ fontSize: 22 }}>{ITEMS[id].emoji}</span>
                  <span style={{ flex: 1 }}><b>{ITEMS[id].name}</b> ×{c}</span>
                  {(ITEMS[id].eat || ITEMS[id].heal || ITEMS[id].cure || ITEMS[id].use) && <button style={S.smallBtn} onClick={() => useItem(id)}>{ITEMS[id].use === "goodie" ? "Open" : "Use"}</button>}
                  {ITEMS[id].dmg && <span style={{ fontSize: fs - 2, opacity: 0.6 }}>dmg {ITEMS[id].dmg[0]}–{ITEMS[id].dmg[1]}</span>}
                  {id === "broom" && <span style={{ fontSize: fs - 2, opacity: 0.6 }}>sweep anywhere</span>}
                </div>
              ))}
              {simRef.current?.playerMail.length > 0 && (
                <>
                  <div style={{ fontWeight: 700, opacity: 0.7 }}>📬 Your letters</div>
                  {simRef.current.playerMail.slice(-5).map((L, i) => (
                    <div key={i} style={{ ...S.folkCard, background: "#fdf8ec" }}>
                      <b>{L.fromId === "player" ? "You" : simRef.current.npcs.find(n => n.id === L.fromId)?.name || "Someone"}</b>
                      <span style={{ opacity: 0.6, fontSize: fs - 3 }}> · day {L.day}</span>
                      <div style={{ fontStyle: "italic", marginTop: 2 }}>"{L.text}"</div>
                    </div>
                  ))}
                </>
              )}
              <div style={{ fontSize: fs - 2, opacity: 0.6, textAlign: "center" }}>Gifting happens in person — walk up to someone and tap 🎁.</div>
            </div>
          </div>
        </div>
      )}

      {/* 🛒 shop — buy, sell, and (if you dare) steal */}
      {shopPanel && player && (() => {
        const keeper = keeperOf(sim, shopPanel.bId);
        const keeperIn = keeper && keeper.scene === `i:${shopPanel.bId}`;
        return (
          <div style={S.chatOverlay} onClick={() => setShopPanel(null)}>
            <div style={{ ...S.chatPanel, maxWidth: 470, height: "78%" }} onClick={e => e.stopPropagation()}>
              <div style={{ ...S.chatHeader, background: bld(shopPanel.bId).color }}>
                <span style={{ fontWeight: 700 }}>{bld(shopPanel.bId).name}{simRef.current.opening?.bId === shopPanel.bId && !simRef.current.opening.done ? " · 📋 HIRING" : ""} · 🪙 {Math.floor(player.coins)} {keeperIn ? `· ${keeper.name} is watching` : "· nobody's minding the till…"}</span>
                <button style={S.closeBtn} onClick={() => setShopPanel(null)}>✕</button>
              </div>
              <div style={S.chatBody}>
                {(simRef.current.menu?.[shopPanel.bId] ? Object.keys(simRef.current.menu[shopPanel.bId]) : SHOP_STOCK[shopPanel.bId]).filter(id => ITEMS[id]).map(id => {   // Stage 3.7: live menu; Stage 4: skip furniture (rendered below)
                  const n = simRef.current.stock[shopPanel.bId]?.[id] ?? 0;
                  return (
                    <div key={id} style={{ ...S.folkCard, display: "flex", alignItems: "center", gap: 8, opacity: n > 0 ? 1 : 0.45 }}>
                      <span style={{ fontSize: 22 }}>{ITEMS[id].emoji}</span>
                      <span style={{ flex: 1 }}><b>{ITEMS[id].name}</b> · {priceOf(simRef.current, shopPanel.bId, id)}c
                        <span style={{ fontSize: fs - 3, opacity: 0.6 }}> · {n > 0 ? `${n} in stock` : "SOLD OUT — delivery pending"}</span>
                      </span>
                      <button style={{ ...S.smallBtn, opacity: n > 0 && player.coins >= ITEMS[id].price ? 1 : 0.4 }} onClick={() => buyItem(shopPanel.bId, id)}>Buy</button>
                      {n > 0 && <button style={{ ...S.smallBtn, background: keeperIn ? "#a05252" : "#556070" }} title={keeperIn ? "The keeper is RIGHT THERE" : "Nobody's watching…"}
                        onClick={() => stealItem(shopPanel.bId, id)}>{stealArmRef.current?.itemId === id && stealArmRef.current?.bId === shopPanel.bId && performance.now() - stealArmRef.current.at <= 3000 ? "❗ CONFIRM" : keeperIn ? "⚠️ Steal" : "🕵️ Steal"}</button>}
                    </div>
                  );
                })}
                {/* Stage 4: furniture storefront — installations delivered to your home */}
                {(SHOP_CANDIDATES[shopPanel.bId] || []).filter(id => FURNITURE[id]).length > 0 && (
                  <>
                    <div style={{ fontWeight: 700, opacity: 0.7, marginTop: 6 }}>🏠 Furniture (delivered home):</div>
                    {(SHOP_CANDIDATES[shopPanel.bId] || []).filter(id => FURNITURE[id]).map(id => {
                      const f = FURNITURE[id], owned = player.furniture.includes(id);
                      const desc = f.store ? `holds ${f.store}c` : f.slots ? `${f.slots} storage slots` : f.dining ? "+5 to home meals" : f.grants ? `home ${f.grants}` : f.restEase ? "restful sleep" : f.upkeep ? `+${f.upkeep}c/wk` : "";
                      return (
                        <div key={id} style={{ ...S.folkCard, display: "flex", alignItems: "center", gap: 8, background: "#f3eee6", opacity: owned ? 0.5 : 1 }}>
                          <span style={{ fontSize: 22 }}>{f.emoji}</span>
                          <span style={{ flex: 1 }}><b>{f.name}</b> · {f.price}c<span style={{ fontSize: fs - 3, opacity: 0.6 }}> · {desc}{f.upkeep && !f.store ? "" : ""}</span></span>
                          {owned ? <span style={{ fontSize: fs - 2, opacity: 0.6 }}>owned</span>
                            : <button style={{ ...S.smallBtn, opacity: player.coins >= f.price ? 1 : 0.4 }} onClick={() => buyFurniture(shopPanel.bId, id)}>Buy</button>}
                        </div>
                      );
                    })}
                  </>
                )}
                {FOOD_BUYERS.includes(shopPanel.bId) && Object.keys(SELLABLE).some(id => player.inv[id] > 0) && (
                  <>
                    <div style={{ fontWeight: 700, opacity: 0.7, marginTop: 4 }}>They'll buy:</div>
                    {Object.keys(SELLABLE).filter(id => player.inv[id] > 0).map(id => (
                      <div key={id} style={{ ...S.folkCard, display: "flex", alignItems: "center", gap: 8, background: "#eef6ee" }}>
                        <span style={{ fontSize: 22 }}>{ITEMS[id].emoji}</span>
                        <span style={{ flex: 1 }}><b>{ITEMS[id].name}</b> ×{player.inv[id]} · sells {SELLABLE[id]}c</span>
                        <button style={S.smallBtn} onClick={() => sellItem(shopPanel.bId, id)}>Sell one</button>
                      </div>
                    ))}
                  </>
                )}
              </div>
            </div>
          </div>
        );
      })()}

      {/* 🎁 pay/gift */}
      {payPanel && player && (() => {
        const npc = sim.npcs.find(n => n.id === payPanel.npcId);
        return (
          <div style={S.chatOverlay} onClick={() => setPayPanel(null)}>
            <div style={{ ...S.chatPanel, maxWidth: 460 }} onClick={e => e.stopPropagation()}>
              <div style={{ ...S.chatHeader, background: npc.color }}>
                <span style={{ fontWeight: 700 }}>Pay or gift {npc.name} · you have 🪙 {Math.floor(player.coins)}</span>
                <button style={S.closeBtn} onClick={() => setPayPanel(null)}>✕</button>
              </div>
              <div style={S.chatBody}>
                <div style={{ ...S.folkCard }}>
                  <div style={{ fontWeight: 700, marginBottom: 6 }}>🪙 Coins</div>
                  <div style={{ display: "flex", gap: 6, flexWrap: "wrap", alignItems: "center" }}>
                    {[1, 5, 10].map(n => <button key={n} style={S.smallBtn} onClick={() => payCoins(npc.id, n)}>{n}c</button>)}
                    <input style={{ ...S.chatInput, width: 90, fontSize: Math.max(16, fs) }} type="number" min="1" placeholder="custom"
                      value={payAmount} onChange={e => setPayAmount(e.target.value)} />
                    <button style={S.smallBtn} onClick={() => payCoins(npc.id, payAmount)}>Give</button>
                  </div>
                </div>
                <div style={{ ...S.folkCard }}>
                  <div style={{ fontWeight: 700, marginBottom: 6 }}>🎁 From your pack</div>
                  {Object.entries(player.inv).filter(([, c]) => c > 0).length === 0 && <div style={{ opacity: 0.6 }}>Nothing to give.</div>}
                  <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                    {Object.entries(player.inv).filter(([, c]) => c > 0).map(([id, c]) => (
                      <button key={id} style={S.smallBtn} onClick={() => giftItem(npc.id, id)}>{ITEMS[id].emoji} {ITEMS[id].name} ×{c}</button>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          </div>
        );
      })()}

      {/* 👥 townsfolk */}
      {folk && (
        <div style={S.chatOverlay} onClick={() => setFolk(null)}>
          <div style={{ ...S.chatPanel, height: "82%", maxWidth: 560 }} onClick={e => e.stopPropagation()}>
            <div style={{ ...S.chatHeader, background: "#3a4358" }}>
              <span style={{ fontWeight: 700 }}>Townsfolk</span>
              <button style={S.closeBtn} onClick={() => setFolk(null)}>✕</button>
            </div>
            <div style={S.chatBody}>
              {folk.map(f => (
                <div key={f.name} style={{ ...S.folkCard, opacity: f.alive ? 1 : 0.55 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <span style={{ width: 14, height: 14, borderRadius: 7, background: f.color, display: "inline-block" }} />
                    <b>{f.name}</b>{!f.alive && " 🪦"}
                    <span style={{ opacity: 0.6, fontSize: fs - 2 }}>{f.mood} · 🪙 {f.coins} · {f.toYou === "neutral" ? "no opinion of you yet" : `${f.toYou} you`}{f.wanted > 0 && <span style={{ color: "#a05252" }}> · wanted {"★".repeat(Math.min(3, f.wanted))}</span>}</span>
                  </div>
                  <div style={{ fontSize: fs - 2, opacity: 0.8, marginTop: 4 }}>{f.intent ? `Today: ${f.intent}` : f.activity} · {f.tier} · {f.health}{f.sick && <span style={{ color: "#7a9a5f" }}> · 🤒 {f.sick}</span>}</div>
                  <div style={{ fontSize: fs - 2, marginTop: 4 }}>
                    <span style={{ opacity: 0.6 }}>Carries</span> {f.inv} · <span style={{ opacity: 0.6 }}>Likes</span> {f.likes.join(", ")} · <span style={{ opacity: 0.6 }}>Dislikes</span> {f.dislikes.join(", ")}
                  </div>
                  {f.rels.length > 0 && <div style={{ fontSize: fs - 2, marginTop: 3 }}><span style={{ opacity: 0.6 }}>Feels:</span> {f.rels.join(" · ")}</div>}
                  {f.alive && f.home === "home_p" && (
                    <button style={{ ...S.closeBtn, marginTop: 6, fontSize: fs - 2 }} onClick={() => kickOut(f.id)}>🥾 Kick out of your spare room</button>
                  )}
                  {f.memories.length > 0 && (
                    <div style={{ fontSize: fs - 2, marginTop: 3 }}>
                      <span style={{ opacity: 0.6 }}>Remembers:</span> {f.memories.join(" · ")}
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* 🎉 party planner: pick the menu, see the damage, feed the town */}
      {partyPanel && player && (() => {
        const town = townOfScene(worldRef.current, player.scene);
        const heads = simRef.current.npcs.filter(n => n.alive && n.town === town).length + 1;
        const cost = Math.max(CFG.PARTY.minCost, Math.ceil(
          (ITEMS[partyPanel.dinner].price + ITEMS[partyPanel.dessert].price + ITEMS[partyPanel.drink].price) * heads
          + ITEMS[partyPanel.dinner].price + ITEMS[partyPanel.dessert].price));
        const Row = ({ kind, opts }) => (
          <div style={{ ...S.folkCard }}>
            <div style={{ fontWeight: 700, marginBottom: 6, textTransform: "capitalize" }}>{kind}</div>
            <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
              {opts.map(id => (
                <button key={id} style={{ ...S.diffBtn, ...(partyPanel[kind] === id ? S.diffBtnOn : {}) }}
                  onClick={() => setPartyPanel(pp => ({ ...pp, [kind]: id }))}>{ITEMS[id].emoji} {ITEMS[id].name}</button>
              ))}
            </div>
          </div>
        );
        return (
          <div style={S.chatOverlay} onClick={() => setPartyPanel(null)}>
            <div style={{ ...S.chatPanel, maxWidth: 460 }} onClick={e => e.stopPropagation()}>
              <div style={{ ...S.chatHeader, background: "#9c5a8a" }}>
                <span style={{ fontWeight: 700 }}>🎉 House party · {heads} mouths + your doubles</span>
                <button style={S.closeBtn} onClick={() => setPartyPanel(null)}>✕</button>
              </div>
              <div style={S.chatBody}>
                <Row kind="dinner" opts={PARTY_MENU.dinner} />
                <Row kind="dessert" opts={PARTY_MENU.dessert} />
                <Row kind="drink" opts={PARTY_MENU.drink} />
                <div style={{ ...S.folkCard, fontStyle: "italic", opacity: 0.8 }}>
                  Everyone in town gets dinner, dessert & a drink at the plaza tonight (6–9 PM); after 8 PM it books for tomorrow.
                  You get seconds of dinner AND dessert. Friends across town lines get invitations by post — and friends bring gifts.
                </div>
                <button style={{ ...S.binBtn, width: "100%", background: player.coins >= cost ? "#9c5a8a" : "#777" }}
                  onClick={() => {
                    const res = throwParty(simRef.current, worldRef.current, player, partyPanel.dinner, partyPanel.dessert, partyPanel.drink);
                    if (res.ok) { setPartyPanel(null); showToast(`Party's ON! (−${res.cost} coins)`); }
                    else showToast(`Catering runs ${res.cost}c — you're short.`);
                  }}>Throw it! ({cost}c)</button>
              </div>
            </div>
          </div>
        );
      })()}

      {/* 📋 the Watch's case board + compliance ledger */}
      {repairPanel && sim && (() => {
        const rp = repairPanel;
        const eased = skillLevel(player, "mechanic") >= 2;   // practiced hands get the simpler variant
        const finishRepair = () => {
          const sim2 = simRef.current, p2 = sim2.player;
          const part = CFG.REPAIR.parts[rp.st], fee = CFG.REPAIR.fee[rp.st];
          p2.inv[part]--; if (p2.inv[part] <= 0) delete p2.inv[part];
          const rec = applianceRec(sim2, rp.bId, rp.st);
          rec.broken = false; rec.uses = 0; delete rec.waited;
          const ownerId = OWNERS[rp.bId];
          const owner = ownerId && ownerId !== "player" ? sim2.npcs.find(n => n.id === ownerId && n.alive) : null;
          if (owner) transferCoins(sim2, owner, p2, Math.min(fee, owner.coins));
          else if (ownerId !== "player") p2.coins += fee;   // civic building: the town pays
          sim2.time += CFG.REPAIR.playerMin;                 // the rest of those hours WAS the minigame
          const before = skillLevel(p2, "mechanic");
          p2.skills.mechanic = (p2.skills.mechanic || 0) + taskXp("mechanic", 0);
          if (skillLevel(p2, "mechanic") > before) showToast(`📈 ${SKILL_TRACKS.mechanic} — now ${skillTierName(p2, "mechanic")}!`);
          sfx.coin(); showToast(`🔧 Fixed. ${ownerId === "player" ? "Your place runs again." : `+${fee}c — good, honest mechanic work.`}`);
          setRepairPanel(null); bump();
        };
        const title = rp.st === "wash" ? "Bathroom plumbing" : rp.st === "drinks" ? "Drink machine" : "Oven";
        return (
        <div style={S.chatOverlay}>
          <div style={{ ...S.chatPanel, maxWidth: 420, padding: 18 }} onClick={e => e.stopPropagation()}>
            <div style={{ ...S.chatHeader, background: "#3a4a5a" }}>
              <span style={{ fontWeight: 700 }}>🔧 {title}{eased ? " (practiced)" : ""}</span>
              <button style={S.closeBtn} onClick={() => setRepairPanel(null)}>✕</button>
            </div>
            {rp.kind === "sliders" && <SliderGame reps={eased ? 3 : 5} sliders={eased ? 1 : 2} onDone={finishRepair} />}
            {rp.kind === "buttons" && <ButtonGame steps={eased ? 2 : 4} routing={!eased} onDone={finishRepair} />}
            {rp.kind === "knob" && <KnobGame spins={eased ? 5 : 10} onDone={finishRepair} />}
          </div>
        </div>
        );
      })()}

      {craftPanel && sim && (() => {
        const cp = craftPanel, R = CFG.CRAFT.recipes;
        const inv = player.inv || {};
        const hasTools = (r) => r.tools.every(t => (inv[t] || 0) > 0);
        const hasMats = (r) => Object.entries(r.mats).every(([m, n]) => (inv[m] || 0) >= n);
        const tierOf = (r) => r.tier;
        const AREAS = { easy: ["wood"], medium: ["wood", "screw"], hard: ["wood", "screw", "fitting"] };
        const AREA_META = { wood: { label: "Wood", emoji: "🪵" }, screw: { label: "Screws", emoji: "🔩" }, fitting: { label: "Fittings", emoji: "⚙️" } };
        const start = (rid) => {   // EVERY tier opens on the balance scale — graded by tier
          const r = R[rid], tier = tierOf(r), B = CFG.CRAFT.balance[tier];
          const mk = () => { const min = B.minLo + Math.floor(Math.random() * (B.minHi - B.minLo + 1)), max = B.maxLo + Math.floor(Math.random() * (B.maxHi - B.maxLo + 1)); return { min, max, v: min + Math.floor(Math.random() * (max - min + 1)) }; };
          setCraftPanel({ stage: "balance", recipeId: rid, tier, tol: B.tol, showMax: B.showMax, L: mk(), Rr: mk() });
        };
        const beginAssembly = (rid, tier) => {
          const areas = tier === "easy" ? ["wood", "screw"] : AREAS[tier];   // easy still SHOWS two areas — either accepts the one chip
          const chips = tier === "easy" ? [Math.random() < 0.5 ? "wood" : "screw"] : AREAS[tier];
          setCraftPanel({ stage: "assembly", recipeId: rid, tier, areas, chips: chips.map(c => ({ kind: c, placed: false })), screws: tier === "easy" ? 1 : tier === "medium" ? 2 : 3, done: {}, holding: null });
        };
        const quoteBase = (r) => Object.entries(r.mats).reduce((s, [m, n]) => s + (ITEMS[m]?.price || 2) * n, 0) + CFG.CRAFT.labor[r.tier];
        const commission = (rid) => {   // Garrick plans it — API voice, local math
          const r = R[rid], sim2 = simRef.current;
          const owner = sim2.npcs.find(n => n.id === OWNERS.workshop_s && n.alive);
          if (!owner) { showToast("No one's taking commissions."); return; }
          const base = quoteBase(r), baseDays = CFG.CRAFT.daysByTier[r.tier];
          const thing = r.furn ? FURNITURE[rid] : ITEMS[rid];
          setCraftPanel({ stage: "quote", recipeId: rid, busy: true });
          commissionCall(owner.name, owner.personality, thing.name, r.tier, base, baseDays, `fame ${sim2.player.fame || 0}`)
            .then(q => setCraftPanel(s => s && { ...s, busy: false, price: clamp(Math.round(q.price || base), Math.ceil(base * 0.8), Math.ceil(base * 1.2)), days: clamp(Math.round(q.days || baseDays), 1, baseDays + 1), line: (q.line || "").slice(0, 140) }))
            .catch(() => setCraftPanel(s => s && { ...s, busy: false, price: base, days: baseDays, line: `${thing.name}, ${r.tier} work. ${base} coins, ready in ${baseDays} day${baseDays > 1 ? "s" : ""}.` }));
        };
        const placeOrder = (withLetter) => {
          const sim2 = simRef.current, p2 = sim2.player;
          const total = cp.price + (withLetter ? CFG.CRAFT.letterFee : 0);
          if (!spend(p2, total)) { showToast(`You need ${total}c.`); return; }
          creditOwner(sim2, "workshop_s", total);
          (sim2.contracts = sim2.contracts || []).push({ recipeId: cp.recipeId, readyDay: sim2.day + cp.days, letter: withLetter, letterSent: false });
          sfx.coin(); showToast(`📜 Ordered. Ready day ${sim2.day + cp.days}${withLetter ? " — a letter will find you" : ""}.`);
          setCraftPanel(null); bump();
        };
        const finish = () => {
          const r = R[cp.recipeId];
          const sim2 = simRef.current, p2 = sim2.player;
          for (const [m, n] of Object.entries(r.mats)) { p2.inv[m] -= n; if (p2.inv[m] <= 0) delete p2.inv[m]; }
          if (r.furn) {
            p2.furniture.push(cp.recipeId); sim2.playerFurniture = p2.furniture;
            setPlacePanel({ furnId: cp.recipeId });
            showToast(`🪑 You built a ${FURNITURE[cp.recipeId]?.name || cp.recipeId}! Pick where it stands.`);
          } else {
            p2.inv[cp.recipeId] = (p2.inv[cp.recipeId] || 0) + 1;
            showToast(`🛠️ ${ITEMS[cp.recipeId].emoji} ${ITEMS[cp.recipeId].name} — made by hand.`);
          }
          const before = skillLevel(p2, "crafting");
          p2.skills.crafting = (p2.skills.crafting || 0) + taskXp("crafting", 0);
          if (skillLevel(p2, "crafting") > before) showToast(`📈 ${SKILL_TRACKS.crafting} — now ${skillTierName(p2, "crafting")}!`);
          sfx.coin(); setCraftPanel(null); bump();
        };
        return (
        <div style={S.chatOverlay}>
          <div style={{ ...S.chatPanel, maxWidth: 440, padding: 18 }} onClick={e => e.stopPropagation()}>
            <div style={{ ...S.chatHeader, background: "#5a4a32" }}>
              <span style={{ fontWeight: 700 }}>🛠️ {cp.stage === "pick" ? "Workbench" : R[cp.recipeId] ? `Crafting: ${(R[cp.recipeId].furn ? FURNITURE[cp.recipeId] : ITEMS[cp.recipeId])?.name}` : "Workbench"}</span>
              <button style={S.closeBtn} onClick={() => setCraftPanel(null)}>✕</button>
            </div>
            {cp.stage === "pick" && (
              <div style={{ ...S.chatBody, gap: 6 }}>
                {Object.entries(R).map(([rid, r]) => {
                  const ok = hasTools(r) && hasMats(r);
                  const atShop = player.scene === "i:workshop_s";
                  const thing = r.furn ? FURNITURE[rid] : ITEMS[rid];
                  return (
                    <div key={rid} style={{ ...S.folkCard, textAlign: "left" }}>
                      <b>{thing.emoji} {thing.name}</b> <span style={{ opacity: 0.6, fontSize: 12 }}>({r.tier}{r.out ? ` · makes ${r.out}` : ""})</span>
                      <div style={{ fontSize: 12, opacity: 0.75 }}>
                        needs: {Object.entries(r.mats).map(([m, n]) => `${n}× ${ITEMS[m].name}`).join(", ")} · tools: {r.tools.map(t => ITEMS[t].emoji).join(" ")}
                      </div>
                      <div style={{ display: "flex", gap: 6, marginTop: 5 }}>
                        <button disabled={!ok} onClick={() => start(rid)}
                          style={{ flex: 1, padding: "5px 8px", borderRadius: 7, border: "none", background: ok ? "#5a7a4a" : "#444", color: "#fff", fontSize: 12, opacity: ok ? 1 : 0.5 }}>🛠️ Make it</button>
                        {atShop && OWNERS.workshop_s !== "player" && (
                          <button onClick={() => commission(rid)}
                            style={{ flex: 1, padding: "5px 8px", borderRadius: 7, border: "none", background: "#5a4a7a", color: "#fff", fontSize: 12 }}>📜 Commission (~{quoteBase(r)}c)</button>
                        )}
                      </div>
                    </div>
                  );
                })}
                <div style={{ fontSize: 11, opacity: 0.55 }}>Make it yourself (tools + materials), or pay the wright and come back. Every job opens on the balance scale — graded by difficulty.</div>
              </div>
            )}
            {cp.stage === "quote" && (
              <div style={{ ...S.chatBody, gap: 10 }}>
                {cp.busy ? <div style={{ fontStyle: "italic", opacity: 0.6 }}>Garrick chalks some figures…</div> : (
                  <>
                    <div style={{ ...S.folkCard, fontStyle: "italic" }}>"{cp.line}"</div>
                    <div style={{ fontSize: 13 }}><b>{cp.price}c</b> · ready in <b>{cp.days} day{cp.days > 1 ? "s" : ""}</b> · pickup at the counter</div>
                    <button onClick={() => placeOrder(false)} style={{ ...S.binBtn, width: "100%", background: "#5a7a4a" }}>Pay {cp.price}c</button>
                    <button onClick={() => placeOrder(true)} style={{ ...S.binBtn, width: "100%", background: "#5a4a7a" }}>Pay {cp.price + CFG.CRAFT.letterFee}c — send a letter when it's ready</button>
                  </>
                )}
              </div>
            )}
            {cp.stage === "balance" && (() => {
              const diff = cp.L.v - cp.Rr.v, deg = clamp(diff * 2.2, -45, 45), even = Math.abs(diff) <= cp.tol;
              return (
                <div style={{ ...S.chatBody, alignItems: "center", gap: 14 }}>
                  <div style={{ fontSize: 12, opacity: 0.7 }}>Balance the scale — match the two weights exactly.</div>
                  <div style={{ height: 8, width: 200, background: even ? "#4a9a5a" : "#c9a84a", borderRadius: 4, transform: `rotate(${deg}deg)`, transition: "transform 0.15s, background 0.2s" }} />
                  <div style={{ display: "flex", gap: 40, alignItems: "center" }}>
                    {[["L", cp.L], ["Rr", cp.Rr]].map(([side, sl]) => (
                      <div key={side} style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 6 }}>
                        <b style={{ fontSize: 18 }}>{sl.v}</b>
                        <input type="range" min={sl.min} max={sl.max} value={sl.v}
                          onChange={e => setCraftPanel(s => ({ ...s, [side]: { ...s[side], v: +e.target.value } }))}
                          style={{ writingMode: "vertical-lr", direction: "rtl", height: 130, accentColor: "#c9a84a" }} />
                        <span style={{ fontSize: 10, opacity: 0.5 }}>{sl.min}–{cp.showMax ? sl.max : "?"}</span>
                      </div>
                    ))}
                  </div>
                  <button disabled={!even} onClick={() => beginAssembly(cp.recipeId, cp.tier)}
                    style={{ ...S.binBtn, width: "100%", background: even ? "#4a9a5a" : "#666", opacity: even ? 1 : 0.5 }}>
                    {even ? "Balanced — to the bench" : "Not level yet…"}
                  </button>
                  {cp.tol > 0 && <div style={{ fontSize: 10, opacity: 0.45 }}>close enough counts (±{cp.tol})</div>}
                </div>
              );
            })()}
            {cp.stage === "assembly" && (() => {
              const allPlaced = cp.chips.every(c => c.placed);
              return (
                <div style={{ ...S.chatBody, gap: 12 }}>
                  {!allPlaced && <div style={{ fontSize: 12, opacity: 0.7 }}>Tap a part, then tap where it goes.</div>}
                  <div style={{ display: "flex", gap: 8, justifyContent: "center" }}>
                    {cp.areas.map(ar => {
                      const need = cp.chips.find(c => !c.placed && (cp.chips.length === 1 || c.kind === ar));
                      return (
                        <div key={ar} onClick={() => { if (cp.sel != null) { const chip = cp.chips[cp.sel]; if (cp.chips.length === 1 || chip.kind === ar) { chip.placed = true; setCraftPanel(s => ({ ...s, sel: null, chips: [...s.chips] })); sfx.pop(); } } }}
                          style={{ width: 92, height: 72, borderRadius: 10, border: `2px dashed ${need && cp.sel != null ? "#c9a84a" : "#777"}`,
                            display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center",
                            background: cp.chips.find(c => c.placed && c.kind === ar) ? "#3a4a3a" : "#2a2d36", color: "#ddd" }}>
                          <span style={{ fontSize: 22 }}>{AREA_META[ar].emoji}</span>
                          <span style={{ fontSize: 11 }}>{AREA_META[ar].label} area</span>
                        </div>
                      );
                    })}
                  </div>
                  {!allPlaced && (
                    <div style={{ display: "flex", gap: 8, justifyContent: "center" }}>
                      {cp.chips.map((c, i) => !c.placed && (
                        <button key={i} onClick={() => setCraftPanel(s => ({ ...s, sel: i }))}
                          style={{ fontSize: 24, padding: "8px 14px", borderRadius: 10, border: cp.sel === i ? "3px solid #c9a84a" : "1px solid #555", background: "#3a3d46" }}>
                          {AREA_META[c.kind].emoji}
                        </button>
                      ))}
                    </div>
                  )}
                  {allPlaced && (
                    <>
                      <div style={{ fontSize: 12, opacity: 0.7, textAlign: "center" }}>
                        Screw {Math.min(Object.values(cp.done).filter(Boolean).length + 1, cp.screws)} of {cp.screws} — hold it for 1 second. One at a time, like real work.
                      </div>
                      <div style={{ display: "flex", gap: 10, justifyContent: "center" }}>
                        {Array.from({ length: cp.screws }).map((_, i) => (
                          <button key={i} disabled={cp.done[i]}
                            onPointerDown={() => !cp.done[i] && setCraftPanel(s => ({ ...s, holding: { i, t: performance.now() } }))}
                            onPointerUp={() => setCraftPanel(s => ({ ...s, holding: null }))}
                            onPointerLeave={() => setCraftPanel(s => ({ ...s, holding: null }))}
                            style={{ width: 60, height: 60, borderRadius: "50%", border: "none", fontSize: 24,
                              background: cp.done[i] ? "#4a9a5a" : cp.holding?.i === i ? "#c9a84a" : "#4a4d58", color: "#fff", touchAction: "none" }}>
                            {cp.done[i] ? "✓" : "🔩"}
                          </button>
                        ))}
                      </div>
                      <HoldMeter holdT={cp.holding?.t || null} ms={CFG.CRAFT.holdMs}
                        onDone={() => setCraftPanel(s => {
                          const done = { ...s.done, [s.holding.i]: true };
                          if (Object.values(done).filter(Boolean).length >= s.screws) { setTimeout(finish, 60); }
                          return { ...s, done, holding: null };
                        })} />
                    </>
                  )}
                </div>
              );
            })()}
          </div>
        </div>
        );
      })()}

      {caseBoard && sim && (
        <div style={S.chatOverlay} onClick={() => setCaseBoard(false)}>
          <div style={{ ...S.chatPanel, maxWidth: 500, height: "78%" }} onClick={e => e.stopPropagation()}>
            <div style={{ ...S.chatHeader, background: "#5a5f78" }}>
              <span style={{ fontWeight: 700 }}>📋 Watch HQ · cases & ledgers</span>
              <button style={S.closeBtn} onClick={() => setCaseBoard(false)}>✕</button>
            </div>
            <div style={S.chatBody}>
              {(() => {   // v7 Stage 5: the WANTED board — bring them in ALIVE (carry to hospital) for the bounty
                const marks = sim.npcs.filter(n => n.alive && !n.jailedUntil && (n.wanted || 0) >= 3).sort((a, b) => b.wanted - a.wanted);
                return marks.length ? (
                  <div style={{ ...S.folkCard, borderLeft: "4px solid #a08a2a", background: "#faf6e8" }}>
                    <b>📜 WANTED — bounties paid on live delivery to a hospital</b>
                    {marks.map(m => <div key={m.id} style={{ marginTop: 4 }}>{"★".repeat(m.wanted)} <b>{m.name}</b> — last seen {m.town} · <b>{m.wanted * 12}c</b></div>)}
                  </div>
                ) : null;
              })()}
              {sim.cases.length === 0 && <div style={{ ...S.folkCard, opacity: 0.7 }}>No cases on record. Three quiet towns... so far.</div>}
              {[...sim.cases].reverse().slice(0, 12).map(c => {
                const who = c.suspectId === "player" ? "You" : sim.npcs.find(n => n.id === c.suspectId)?.name;
                return (
                  <div key={c.id} style={{ ...S.folkCard, borderLeft: `4px solid ${c.type === "murder" ? "#8a3a3a" : c.type === "vigilante" ? "#6a4a8a" : c.type === "robbery" ? "#a0763a" : "#5a7a9a"}` }}>
                    <b style={{ textTransform: "uppercase" }}>{c.type}</b> · day {c.day} · {c.state === "open" ? "🔍 OPEN" : c.state === "cold" ? "🧊 cold" : "✅ solved"}
                    <div style={{ fontSize: fs - 2, opacity: 0.8 }}>
                      victim: {c.victim || "—"}{c.state !== "open" && who ? ` · culprit: ${who}` : c.state === "open" ? ` · evidence: ${"▪".repeat(c.evidence) || "none"}` : ""}
                    </div>
                  </div>
                );
              })}
              <div style={{ fontWeight: 700, opacity: 0.7, marginTop: 4 }}>Business compliance</div>
              {sim.ethics.length === 0 && <div style={{ ...S.folkCard, opacity: 0.7 }}>No inspections on file yet.</div>}
              {[...sim.ethics].reverse().slice(0, 8).map((e, i) => (
                <div key={i} style={{ ...S.folkCard }}>
                  {bld(e.bId).name} · day {e.day} · {e.fine ? <span style={{ color: "#a05252" }}>fined {e.fine}c 🧾</span> : "clean ✅"}
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* 💬 chat */}
      {chat && (
        <div style={S.chatOverlay}>
          <div style={{ ...S.chatPanel, height: isPhone ? "78%" : 480 }}>
            <div style={{ ...S.chatHeader, background: chat.color }}>
              <span style={{ fontWeight: 700 }}>{chat.name}{simRef.current?.interview?.npcId === chat.npcId ? " · 🤝 interview" : ""}</span>
              <button style={S.closeBtn} onClick={() => { if (simRef.current?.interview) { simRef.current.interviewBans[simRef.current.interview.bId] = simRef.current.day + 1; simRef.current.interview = null; showToast("You walked out mid-interview. Bold."); } setChat(null); }}>✕</button>
            </div>
            <div style={S.chatBody}>
              {chat.msgs.map((m, i) => (
                <div key={i} style={{ ...S.msg, ...(m.who === "You" ? S.msgYou : S.msgThem) }}>
                  <div style={{ fontSize: fs - 3, opacity: 0.6, marginBottom: 2 }}>{m.who}</div>
                  {m.text}
                </div>
              ))}
              {chat.busy && <div style={{ ...S.msg, ...S.msgThem, opacity: 0.6 }}>{chat.name} is thinking…</div>}
              <div ref={chatEndRef} />
            </div>
            <div style={S.chatInputRow}>
              <input
                style={{ ...S.chatInput, fontSize: Math.max(16, fs) }}
                value={chatInput} placeholder={`Say something to ${chat.name}…`}
                onChange={e => setChatInput(e.target.value)}
                onKeyDown={e => { if (e.key === "Enter") sendChat(); }}
                disabled={chat.busy}
              />
              <button style={{ ...S.sendBtn, opacity: chat.busy || !chatInput.trim() ? 0.5 : 1 }}
                onClick={sendChat} disabled={chat.busy || !chatInput.trim()}>Send</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

/* ===== styles ===== */
const S = {
  deviceWrap: { position: "fixed", inset: 0, background: "linear-gradient(180deg,#1b2a3a 0%,#2c4a3e 100%)", display: "flex", alignItems: "center", justifyContent: "center", fontFamily: "system-ui, sans-serif" },
  deviceCard: { background: "#fbf6ea", borderRadius: 20, padding: "30px 28px", textAlign: "center", maxWidth: 400, boxShadow: "0 20px 60px rgba(0,0,0,0.45)" , color: "#2a2620" },
  title: { margin: "8px 0 4px", letterSpacing: 6, fontSize: 26, color: "#2a2620" },
  sub: { color: "#5a5245", lineHeight: 1.45, fontSize: 14, margin: "6px 0" },
  deviceBtn: { flex: 1, padding: "18px 10px", fontSize: 17, lineHeight: 1.6, borderRadius: 14, border: "2px solid #d8cdb6", background: "#fff", cursor: "pointer", fontFamily: "inherit" , color: "#2a2620" },
  wipeBtn: { marginTop: 10, padding: "7px 14px", fontSize: 13, borderRadius: 10, border: "none", background: "transparent", color: "#a05252", cursor: "pointer", fontFamily: "inherit", textDecoration: "underline" },
  diffBtn: { padding: "7px 14px", fontSize: 13, borderRadius: 10, border: "2px solid #d8cdb6", background: "#fff", color: "#5a5245", cursor: "pointer", fontFamily: "inherit", fontWeight: 700 },
  diffBtnOn: { background: "#2e6fe0", borderColor: "#2e6fe0", color: "#fff" },

  gameWrap: { position: "fixed", inset: 0, display: "flex", flexDirection: "column", background: "#151a22", fontFamily: "system-ui, sans-serif", color: "#fff", overflow: "hidden" },
  topBar: { display: "flex", alignItems: "center", gap: 6, padding: "8px 10px", background: "rgba(20,24,32,0.95)", zIndex: 5, flexWrap: "wrap" },
  clockChip: { background: "#2a3242", borderRadius: 8, padding: "5px 10px", fontWeight: 600, whiteSpace: "nowrap" },
  iconBtn: { background: "#2a3242", borderRadius: 8, padding: "5px 12px", fontWeight: 600, border: "none", color: "#fff", cursor: "pointer", fontFamily: "inherit", fontSize: 15 },
  barOuter: { position: "relative", flex: 1, height: 24, background: "#2a3242", borderRadius: 7, overflow: "hidden", minWidth: 58 },
  barInner: { position: "absolute", inset: 0, transition: "width 0.3s" },
  barLabel: { position: "relative", display: "flex", alignItems: "center", justifyContent: "center", height: "100%", fontSize: 11, fontWeight: 700, textShadow: "0 1px 2px rgba(0,0,0,0.6)" },

  canvasWrap: { position: "relative", flex: 1, minHeight: 0 },
  hint: { position: "absolute", bottom: 8, left: "50%", transform: "translateX(-50%)", fontSize: 12, opacity: 0.55, whiteSpace: "nowrap" },
  toast: { position: "absolute", top: 12, left: "50%", transform: "translateX(-50%)", background: "rgba(251,246,234,0.97)", color: "#2a2620", padding: "9px 16px", borderRadius: 10, fontWeight: 600, maxWidth: "86%", textAlign: "center", boxShadow: "0 6px 20px rgba(0,0,0,0.4)", zIndex: 7 },
  transition: { position: "absolute", inset: 0, background: "rgba(15,18,26,0.92)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 20, fontWeight: 700, zIndex: 8 },

  gamePanel: { position: "absolute", left: "50%", transform: "translateX(-50%)", bottom: 14, background: "rgba(251,246,234,0.97)", color: "#2a2620", padding: "12px 16px", borderRadius: 14, boxShadow: "0 6px 24px rgba(0,0,0,0.4)", zIndex: 6, textAlign: "center", minWidth: 250 },
  binBtn: { padding: "12px 18px", borderRadius: 10, border: "none", color: "#fff", fontWeight: 700, cursor: "pointer", fontSize: 16, fontFamily: "inherit", background: "#3a4358" },
  smallBtn: { padding: "7px 12px", borderRadius: 9, border: "none", color: "#fff", fontWeight: 700, cursor: "pointer", fontSize: 13, fontFamily: "inherit", background: "#3a4358" },

  fishTrack: { position: "relative", height: 26, background: "#2a3242", borderRadius: 8, overflow: "hidden" },
  fishZone: { position: "absolute", left: "33%", width: "34%", top: 0, bottom: 0, background: "rgba(95,184,95,0.55)" },
  fishMarker: { position: "absolute", top: 3, width: 16, height: 20, borderRadius: 5, background: "#ffd97a", boxShadow: "0 0 8px rgba(255,217,122,0.8)" , color: "#2a2620" },

  actionCol: { position: "absolute", display: "flex", flexDirection: "column", gap: 8, alignItems: "flex-end", zIndex: 5, maxHeight: "55%", overflowY: "auto" },
  actionBtn: { padding: "12px 16px", borderRadius: 12, border: "none", background: "rgba(251,246,234,0.97)", color: "#2a2620", fontWeight: 700, cursor: "pointer", boxShadow: "0 4px 14px rgba(0,0,0,0.35)", fontFamily: "inherit" },

  dpad: { position: "absolute", left: 12, bottom: 14, display: "grid", gridTemplateColumns: "54px 54px 54px", gridTemplateRows: "54px 54px 54px", gap: 4, zIndex: 5 },
  padBtn: { borderRadius: 12, border: "none", background: "rgba(251,246,234,0.85)", color: "#2a2620", fontSize: 20, fontWeight: 700, touchAction: "none", userSelect: "none", WebkitUserSelect: "none", cursor: "pointer" },

  chatOverlay: { position: "fixed", inset: 0, background: "rgba(10,12,18,0.6)", display: "flex", alignItems: "flex-end", justifyContent: "center", zIndex: 20, padding: 10 },
  chatPanel: { width: "100%", maxWidth: 520, background: "#fbf6ea", borderRadius: 18, display: "flex", flexDirection: "column", overflow: "hidden", boxShadow: "0 -10px 40px rgba(0,0,0,0.5)", maxHeight: "86%" , color: "#2a2620" },
  chatHeader: { display: "flex", justifyContent: "space-between", alignItems: "center", padding: "12px 16px", color: "#fff" },
  closeBtn: { border: "none", background: "rgba(255,255,255,0.25)", color: "#fff", borderRadius: 8, width: 32, height: 32, fontSize: 16, cursor: "pointer" },
  chatBody: { flex: 1, overflowY: "auto", padding: 14, display: "flex", flexDirection: "column", gap: 10 },
  folkCard: { background: "#fff", borderRadius: 12, padding: "10px 12px", color: "#2a2620", boxShadow: "0 1px 4px rgba(0,0,0,0.08)" },
  msg: { maxWidth: "82%", padding: "9px 13px", borderRadius: 14, lineHeight: 1.4, color: "#2a2620" },
  msgYou: { alignSelf: "flex-end", background: "#d7e6ff", borderBottomRightRadius: 4 },
  msgThem: { alignSelf: "flex-start", background: "#fff", borderBottomLeftRadius: 4, boxShadow: "0 1px 4px rgba(0,0,0,0.08)" , color: "#2a2620" },
  chatInputRow: { display: "flex", gap: 8, padding: 12, borderTop: "1px solid #e5dcc8" },
  chatInput: { flex: 1, padding: "11px 14px", borderRadius: 12, border: "2px solid #d8cdb6", outline: "none", fontFamily: "inherit", background: "#fff", color: "#2a2620" },
  sendBtn: { padding: "0 20px", borderRadius: 12, border: "none", background: "#2e6fe0", color: "#fff", fontWeight: 700, cursor: "pointer", fontFamily: "inherit" },
};
