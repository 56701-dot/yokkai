/* ============================================================
   FIT QUEST — LIQUID GLASS iOS (GAMING VIBE) SCRIPT
   ============================================================ */

/* ============================================================
   1. AMBIENT BACKGROUND — CSS handles most, JS can add mouse parallax
   ============================================================ */
const AmbientBackground = (() => {
  function init() {
    const bg = document.querySelector('.ambient-background');
    if (!bg) return;

    // Very subtle mouse parallax for the ambient background
    document.addEventListener('mousemove', (e) => {
      const moveX = (e.clientX - window.innerWidth / 2) * -0.01;
      const moveY = (e.clientY - window.innerHeight / 2) * -0.01;
      bg.style.transform = `translate(${moveX}px, ${moveY}px)`;
    }, { passive: true });
  }
  return { init };
})();


/* ============================================================
   2. SOFT RIPPLE EFFECT
   ============================================================ */
const RippleEffect = (() => {
  function init() {
    document.addEventListener('click', (e) => {
      const btn = e.target.closest('.btn, .btn-buy, .tab, .story-card, .story-stage, .story-back, .story-current-button, .raid-primary, .raid-secondary, .raid-challenge');
      if (!btn) return;

      const ripple = document.createElement('span');
      ripple.classList.add('ripple');
      const rect = btn.getBoundingClientRect();
      const size = Math.max(rect.width, rect.height) * 2;

      // Ensure position is relative on the button for clipping
      if (getComputedStyle(btn).position === 'static') {
        btn.style.position = 'relative';
        btn.style.overflow = 'hidden';
      }

      ripple.style.position = 'absolute';
      ripple.style.borderRadius = '50%';
      ripple.style.background = 'rgba(255, 255, 255, 0.15)';
      ripple.style.width = ripple.style.height = size + 'px';
      ripple.style.left = (e.clientX - rect.left - size / 2) + 'px';
      ripple.style.top = (e.clientY - rect.top - size / 2) + 'px';
      ripple.style.transform = 'scale(0)';
      ripple.style.pointerEvents = 'none';
      ripple.style.transition = 'transform 0.5s ease-out, opacity 0.8s ease-out';

      btn.appendChild(ripple);

      // Trigger animation
      requestAnimationFrame(() => {
        ripple.style.transform = 'scale(2)';
        ripple.style.opacity = '0';
      });

      ripple.addEventListener('transitionend', () => ripple.remove());
    });
  }

  return { init };
})();


/* ============================================================
   3. SOFT 3D CARD TILT (Glassmorphism Depth)
   ============================================================ */
const CardTilt = (() => {
  function init() {
    document.addEventListener('mousemove', (e) => {
      const cards = document.querySelectorAll('.glass-card, .item-card, .quest-card, .equip-stage');
      cards.forEach(card => {
        const rect = card.getBoundingClientRect();
        const centerX = rect.left + rect.width / 2;
        const centerY = rect.top + rect.height / 2;
        const deltaX = (e.clientX - centerX) / rect.width;
        const deltaY = (e.clientY - centerY) / rect.height;
        const distance = Math.sqrt(deltaX * deltaX + deltaY * deltaY);

        if (distance < 1.5) {
          const tiltX = deltaY * -3; // softer tilt (3deg max)
          const tiltY = deltaX * 3;
          card.style.transform = `perspective(800px) rotateX(${tiltX}deg) rotateY(${tiltY}deg) translateY(-8px)`;
        }
      });
    }, { passive: true });

    document.addEventListener('mouseleave', () => {
      document.querySelectorAll('.glass-card, .item-card, .quest-card, .equip-stage').forEach(card => card.style.transform = '');
    }, { passive: true });

    document.addEventListener('mousemove', resetDistantCards, { passive: true });
  }

  let resetTimer;
  function resetDistantCards(e) {
    clearTimeout(resetTimer);
    resetTimer = setTimeout(() => {
      document.querySelectorAll('.glass-card, .item-card, .quest-card, .equip-stage').forEach(card => {
        const rect = card.getBoundingClientRect();
        const centerX = rect.left + rect.width / 2;
        const centerY = rect.top + rect.height / 2;
        const deltaX = (e.clientX - centerX) / rect.width;
        const deltaY = (e.clientY - centerY) / rect.height;
        const distance = Math.sqrt(deltaX * deltaX + deltaY * deltaY);
        if (distance >= 1.5) {
          card.style.transform = '';
        }
      });
    }, 100);
  }

  return { init };
})();


/* ============================================================
   4. LOADING SCREEN & PAGE TRANSITIONS
   ============================================================ */
const Transitions = (() => {
  function initLoading() {
    const loader = document.getElementById('loading-screen');
    if (!loader) return;
    setTimeout(() => {
      loader.classList.add('hidden');
      loader.addEventListener('transitionend', () => loader.remove(), { once: true });
    }, 800);
  }

  function flash(callback) {
    const overlay = document.getElementById('page-transition');
    if (!overlay) { callback(); return; }
    overlay.classList.add('active');
    setTimeout(() => {
      callback();
      setTimeout(() => overlay.classList.remove('active'), 150);
    }, 150);
  }

  return { initLoading, flash };
})();


/* ============================================================
   5. GAME LOGIC
   ============================================================ */

function playGame() {
  Transitions.flash(() => {
    document.getElementById('login-screen').classList.remove('active');
    document.getElementById('app-screen').classList.add('active');
    showToast("SYSTEM ONLINE. WELCOME.");
  });
}

function logout() {
  Transitions.flash(() => {
    document.getElementById('app-screen').classList.remove('active');
    document.getElementById('login-screen').classList.add('active');
    showToast("LOGGED OUT SECURELY.");
  });
}

const STARTER_PLAYER = {
  coins: 0,
  level: 1,
  xp: 0,
  statPoints: 0,
  hp: 100,
  maxHp: 100,
  attack: 10,
  defense: 5
};

const STORY_LEVEL_COUNT = 100;
const STORY_WORLD_SIZE = 20;
const STORY_STAGE_GAP = 112;
const STORY_MAP_PADDING = 120;
const svgIcon = (paths, viewBox = "0 0 24 24") => `<svg viewBox="${viewBox}" aria-hidden="true">${paths}</svg>`;
const storyIcons = {
  seedling: svgIcon(`<path d="M12 21V10"></path><path d="M12 11C7 11 5 8 5 4c4 0 7 2 7 7z"></path><path d="M12 13c5 0 7-3 7-7-4 0-7 2-7 7z"></path>`),
  tree: svgIcon(`<path d="M12 22v-6"></path><path d="M7 16h10l-2.6-3.4h2.1L12 4 7.5 12.6h2.1z"></path>`),
  waves: svgIcon(`<path d="M3 8c2.2 1.6 4.4 1.6 6.6 0s4.4-1.6 6.6 0c1.3.9 2.6 1.3 3.8 1.2"></path><path d="M3 14c2.2 1.6 4.4 1.6 6.6 0s4.4-1.6 6.6 0c1.3.9 2.6 1.3 3.8 1.2"></path>`),
  cloud: svgIcon(`<path d="M6 18h11a4 4 0 0 0 .4-8 6 6 0 0 0-11.1 1.7A3.2 3.2 0 0 0 6 18z"></path>`),
  sun: svgIcon(`<circle cx="12" cy="12" r="4"></circle><path d="M12 2v3M12 19v3M4.9 4.9 7 7M17 17l2.1 2.1M2 12h3M19 12h3M4.9 19.1 7 17M17 7l2.1-2.1"></path>`),
  snow: svgIcon(`<path d="M12 2v20M4.2 6.5l15.6 11M19.8 6.5 4.2 17.5"></path><path d="m9 4 3 3 3-3M9 20l3-3 3 3"></path>`),
  flame: svgIcon(`<path d="M12 22c4 0 7-2.8 7-6.8 0-3.1-1.7-5.4-4.4-7.7-.6 2.3-1.7 3.5-3 4.3.2-3.2-1.2-5.7-4.2-8.1.2 4.1-2.4 6.3-2.4 10.9C5 18.8 8 22 12 22z"></path>`),
  sparkle: svgIcon(`<path d="M12 2l1.6 6.4L20 10l-6.4 1.6L12 18l-1.6-6.4L4 10l6.4-1.6z"></path><path d="M19 16l.8 2.2L22 19l-2.2.8L19 22l-.8-2.2L16 19l2.2-.8z"></path>`),
  rocket: svgIcon(`<path d="M14 4c2.7-1.3 5.1-1.1 6-1-0.1.9-.3 3.3-1.6 6L12 15l-3-3z"></path><path d="M9 12H5l-2 5 5-2v-3"></path><path d="M12 15v4l-5 2 2-5h3"></path><circle cx="15.5" cy="7.5" r="1.5"></circle>`),
  crown: svgIcon(`<path d="M3 8l4.5 4L12 5l4.5 7L21 8l-2 11H5z"></path>`),
  gem: svgIcon(`<path d="M6 3h12l4 6-10 12L2 9z"></path><path d="M2 9h20M8 3l-2 6 6 12 6-12-2-6"></path>`),
  castle: svgIcon(`<path d="M4 21V9h4V5h3v4h2V5h3v4h4v12z"></path><path d="M9 21v-5a3 3 0 0 1 6 0v5M4 13h16"></path>`),
  bolt: svgIcon(`<path d="M13 2 4 14h7l-1 8 10-13h-7z"></path>`),
  moon: svgIcon(`<path d="M20 15.5A8.2 8.2 0 0 1 8.5 4a7 7 0 1 0 11.5 11.5z"></path>`),
  anchor: svgIcon(`<circle cx="12" cy="5" r="2"></circle><path d="M12 7v14M5 12H3c0 5 4 9 9 9s9-4 9-9h-2M8 12h8"></path>`),
  mountain: svgIcon(`<path d="m3 20 7-12 4 7 2-3 5 8z"></path><path d="m10 8 2 4 2-1"></path>`),
  star: svgIcon(`<path d="m12 3 2.7 5.5 6.1.9-4.4 4.3 1 6.1L12 17l-5.4 2.8 1-6.1-4.4-4.3 6.1-.9z"></path>`),
  atom: svgIcon(`<circle cx="12" cy="12" r="1.6"></circle><ellipse cx="12" cy="12" rx="9" ry="3.4"></ellipse><ellipse cx="12" cy="12" rx="9" ry="3.4" transform="rotate(60 12 12)"></ellipse><ellipse cx="12" cy="12" rx="9" ry="3.4" transform="rotate(120 12 12)"></ellipse>`),
  wind: svgIcon(`<path d="M3 8h12a3 3 0 1 0-3-3"></path><path d="M3 13h16a3 3 0 1 1-3 3"></path><path d="M3 18h8"></path>`),
  trophy: svgIcon(`<path d="M8 4h8v4a4 4 0 0 1-8 0z"></path><path d="M8 6H4a4 4 0 0 0 4 4M16 6h4a4 4 0 0 1-4 4M12 12v5M8 21h8M10 17h4"></path>`),
  diamond: svgIcon(`<path d="M12 3l3 6-3 12L9 9z"></path><path d="M3 9h18L15 3H9z"></path>`),
  repeat: svgIcon(`<path d="M17 2l4 4-4 4"></path><path d="M3 11V9a3 3 0 0 1 3-3h15"></path><path d="M7 22l-4-4 4-4"></path><path d="M21 13v2a3 3 0 0 1-3 3H3"></path>`),
  rotateBack: svgIcon(`<path d="M3 7v6h6"></path><path d="M21 17a9 9 0 0 0-15-6.7L3 13"></path>`),
  coin: svgIcon(`<circle cx="12" cy="12" r="8"></circle><path d="M12 7v10M14.4 9.2c-.6-.6-1.4-.9-2.4-.9-1.4 0-2.4.7-2.4 1.8 0 2.8 4.8 1.3 4.8 3.7 0 1.1-1 1.9-2.6 1.9-1 0-1.9-.3-2.6-1"></path>`)
};
const STORY_CHAPTERS = [
  { name: "ทุ่งเริ่มต้น", icon: storyIcons.seedling, from: "#7ab2ff", via: "#9eceff", to: "#eaf3ff", primary: "#134ECD", accent: "#2b71ff" },
  { name: "ป่าใหญ่", icon: storyIcons.tree, from: "#22c55e", via: "#86efac", to: "#ecfdf5", primary: "#15803d", accent: "#22c55e" },
  { name: "ทะเลคราม", icon: storyIcons.waves, from: "#0ea5e9", via: "#7dd3fc", to: "#ecfeff", primary: "#0369a1", accent: "#0ea5e9" },
  { name: "เมืองท้องฟ้า", icon: storyIcons.cloud, from: "#a78bfa", via: "#c4b5fd", to: "#f5f3ff", primary: "#6d28d9", accent: "#8b5cf6" },
  { name: "ทะเลทราย", icon: storyIcons.sun, from: "#f59e0b", via: "#fcd34d", to: "#fffbeb", primary: "#b45309", accent: "#f59e0b" },
  { name: "ภูเขาน้ำแข็ง", icon: storyIcons.snow, from: "#06b6d4", via: "#a5f3fc", to: "#f0f9ff", primary: "#155e75", accent: "#06b6d4" },
  { name: "ภูเขาไฟ", icon: storyIcons.flame, from: "#ef4444", via: "#fca5a5", to: "#fef2f2", primary: "#991b1b", accent: "#ef4444" },
  { name: "ป่าเวทมนตร์", icon: storyIcons.sparkle, from: "#ec4899", via: "#f9a8d4", to: "#fdf2f8", primary: "#9d174d", accent: "#ec4899" },
  { name: "อวกาศ", icon: storyIcons.rocket, from: "#312e81", via: "#6366f1", to: "#e0e7ff", primary: "#1e1b4b", accent: "#6366f1" },
  { name: "ดินแดนทอง", icon: storyIcons.crown, from: "#d97706", via: "#fbbf24", to: "#fef3c7", primary: "#78350f", accent: "#d97706" },
  { name: "ถ้ำคริสตัล", icon: storyIcons.gem, from: "#0d9488", via: "#5eead4", to: "#f0fdfa", primary: "#115e59", accent: "#14b8a6" },
  { name: "ปราสาทลอยฟ้า", icon: storyIcons.castle, from: "#a855f7", via: "#d8b4fe", to: "#faf5ff", primary: "#6b21a8", accent: "#a855f7" },
  { name: "หุบเขาสายฟ้า", icon: storyIcons.bolt, from: "#eab308", via: "#fde047", to: "#fefce8", primary: "#854d0e", accent: "#eab308" },
  { name: "ดินแดนเงา", icon: storyIcons.moon, from: "#475569", via: "#94a3b8", to: "#f1f5f9", primary: "#1e293b", accent: "#475569" },
  { name: "มหานทีลึก", icon: storyIcons.anchor, from: "#0e7490", via: "#22d3ee", to: "#ecfeff", primary: "#164e63", accent: "#06b6d4" },
  { name: "ยอดเขาเมฆา", icon: storyIcons.mountain, from: "#64748b", via: "#cbd5e1", to: "#f8fafc", primary: "#334155", accent: "#64748b" },
  { name: "สวนดวงดาว", icon: storyIcons.star, from: "#6366f1", via: "#a5b4fc", to: "#eef2ff", primary: "#3730a3", accent: "#6366f1" },
  { name: "มิติพิศวง", icon: storyIcons.atom, from: "#d946ef", via: "#f0abfc", to: "#fdf4ff", primary: "#86198f", accent: "#d946ef" },
  { name: "พายุทราย", icon: storyIcons.wind, from: "#ca8a04", via: "#fde68a", to: "#fffbeb", primary: "#713f12", accent: "#ca8a04" },
  { name: "หอเกียรติยศ", icon: storyIcons.trophy, from: "#f59e0b", via: "#fcd34d", to: "#fffbeb", primary: "#92400e", accent: "#f59e0b" }
];

const STAT_UPGRADE_STEPS = {
  maxHp: 10,
  attack: 1,
  defense: 1
};

const state = {
  coins: STARTER_PLAYER.coins,
  level: STARTER_PLAYER.level,
  xp: STARTER_PLAYER.xp,
  statPoints: STARTER_PLAYER.statPoints,
  hp: STARTER_PLAYER.hp,
  maxHp: STARTER_PLAYER.maxHp,
  attack: STARTER_PLAYER.attack,
  defense: STARTER_PLAYER.defense,
  activeShop: "All",
  owned: {},
  equipped: {},
  selectedInv: null
};
state.raidFloor = 1;
state.activeRaidChallenge = "reaction_reach";

function setTheme(theme) {
  const nextTheme = theme === "light" ? "light" : "dark";
  document.body.dataset.theme = nextTheme;
  localStorage.setItem("fitQuestTheme", nextTheme);
  applyGlassTransparency();
  document.querySelector('meta[name="theme-color"]')?.setAttribute("content", nextTheme === "light" ? "#f5f5f7" : "#000000");
  document.querySelectorAll("[data-theme-choice]").forEach(btn => {
    const active = btn.dataset.themeChoice === nextTheme;
    btn.classList.toggle("active", active);
    btn.setAttribute("aria-pressed", String(active));
  });
}

function initTheme() {
  setTheme(localStorage.getItem("fitQuestTheme") || "light");
}

function setGlassTransparency(value) {
  const percentage = Math.min(90, Math.max(35, Number(value) || 58));
  const alpha = percentage / 100;
  const hoverAlpha = Math.min(0.96, alpha + 0.18);
  const panelAlpha = Math.min(0.96, alpha + 0.12);
  const controlAlpha = Math.min(0.94, alpha + 0.06);
  document.body.style.setProperty("--glass-alpha", alpha.toFixed(2));
  document.body.style.setProperty("--glass-hover-alpha", hoverAlpha.toFixed(2));
  document.body.style.setProperty("--glass-panel-alpha", panelAlpha.toFixed(2));
  document.body.style.setProperty("--glass-control-alpha", controlAlpha.toFixed(2));
  localStorage.setItem("fitQuestGlassTransparency", String(percentage));

  const slider = document.getElementById("glassTransparency");
  const valueLabel = document.getElementById("glassTransparencyValue");
  if (slider) slider.value = String(percentage);
  if (valueLabel) valueLabel.textContent = `${percentage}%`;
}

function applyGlassTransparency() {
  setGlassTransparency(localStorage.getItem("fitQuestGlassTransparency") || 58);
}

// Minimal frosted white/silver SVG Icons
const icons = {
  sword: `<svg viewBox="0 0 80 80"><g transform="rotate(-35 40 40)"><path d="M38 8h4l4 36-6 10-6-10z" fill="rgba(255,255,255,0.9)"/><rect x="26" y="49" width="28" height="6" rx="3" fill="rgba(255,255,255,0.6)"/><rect x="36" y="55" width="8" height="16" rx="4" fill="rgba(255,255,255,0.4)"/></g></svg>`,
  potion: `<svg viewBox="0 0 80 80"><rect x="33" y="12" width="14" height="10" rx="3" fill="rgba(255,255,255,0.5)"/><path d="M25 33c0-9 30-9 30 0 8 15 2 34-15 34S17 48 25 33z" fill="rgba(255,255,255,0.9)"/></svg>`,
  armor: `<svg viewBox="0 0 80 80"><path d="M16 28l13-12h22l13 12-6 37c-11 7-25 7-36 0z" fill="rgba(255,255,255,0.85)"/></svg>`,
  shoes: `<svg viewBox="0 0 80 80"><path d="M16 23h18l2 30H15c-5 0-7-7-2-10l8-5z" fill="rgba(255,255,255,0.85)"/></svg>`,
  gloves: `<svg viewBox="0 0 80 80"><path d="M21 43c-8-18 2-30 10-22l5 19 3-26c7-4 11 1 9 9l-2 18 7-15c8-1 10 5 6 12L49 61c-10 7-25 0-28-18z" fill="rgba(255,255,255,0.85)"/></svg>`
};

const items = [
  { id: 1, name: "Ice Sword",    type: "Weapon", category: "Sword",  stat: "+10% ATK", price: 500,  icon: icons.sword },
  { id: 2, name: "HP Potion",    type: "Boost",  category: "Boost",  stat: "+100 HP",  price: 125,  icon: icons.potion },
  { id: 3, name: "Aqua Armor",   type: "Armor",  category: "Armor",  stat: "+16 DEF",  price: 820,  icon: icons.armor },
  { id: 4, name: "Flash Shoes",  type: "Shoes",  category: "Shoes",  stat: "+6 DEF",   price: 650,  icon: icons.shoes },
  { id: 5, name: "Power Gloves", type: "Gloves", category: "Gloves", stat: "+8 GRIP",  price: 420,  icon: icons.gloves }
];

const starterInventory = [
  { id: 101, name: "Wood Sword",    type: "Weapon", icon: icons.sword },
  { id: 102, name: "Trainee Armor", type: "Armor",  icon: icons.armor }
];

let quests = [];

quests = [
  { id: "slime_patrol_jumping_jack", title: "Slime Patrol", tag: "EASY MONSTER", reward: "+20 EXP", steps: [["Jumping Jack", "45 sec"], ["Camera", "Front"]], exerciseType: "jumping_jack", targetReps: 0, targetSeconds: 45, difficultyLabel: "Easy", cameraAngle: "Front", impactLevel: "Medium", spaceRequired: "Small", baseXp: 20, monsterClass: "slime" },
  { id: "bat_chase_high_knee", title: "Bat Chase", tag: "EASY MONSTER", reward: "+20 EXP", steps: [["High Knee", "40 sec"], ["Camera", "Front"]], exerciseType: "high_knee", targetReps: 0, targetSeconds: 40, difficultyLabel: "Easy", cameraAngle: "Front", impactLevel: "Low", spaceRequired: "Small", baseXp: 20, monsterClass: "bat" },
  { id: "swift_rat_butt_kick", title: "Swift Rat", tag: "EASY MONSTER", reward: "+20 EXP", steps: [["Butt Kick", "40 sec"], ["Camera", "Side"]], exerciseType: "butt_kick", targetReps: 0, targetSeconds: 40, difficultyLabel: "Easy", cameraAngle: "Side", impactLevel: "Medium", spaceRequired: "Small", baseXp: 20, monsterClass: "rat" },
  { id: "cave_crawler_mountain_climber", title: "Cave Crawler", tag: "NORMAL MONSTER", reward: "+25 EXP", steps: [["Mountain Climber", "30 sec"], ["Camera", "Side 45"]], exerciseType: "mountain_climber", targetReps: 0, targetSeconds: 30, difficultyLabel: "Normal", cameraAngle: "Side 45", impactLevel: "Medium", spaceRequired: "Mat", baseXp: 25, monsterClass: "crawler" },
  { id: "frost_imp_skater_jump", title: "Frost Imp", tag: "NORMAL MONSTER", reward: "+25 EXP", steps: [["Skater Jump", "12 reps"], ["Camera", "Front"]], exerciseType: "skater_jump", targetReps: 12, targetSeconds: 0, difficultyLabel: "Normal", cameraAngle: "Front", impactLevel: "Medium", spaceRequired: "Wide", baseXp: 25, monsterClass: "imp" },
  { id: "stone_slime_squat", title: "Stone Slime", tag: "NORMAL MONSTER", reward: "+25 EXP", steps: [["Squat", "12 reps"], ["Camera", "Side"]], exerciseType: "squat", targetReps: 12, targetSeconds: 0, difficultyLabel: "Normal", cameraAngle: "Side", impactLevel: "Low", spaceRequired: "Small", baseXp: 25, monsterClass: "stone" },
  { id: "shell_bug_plank", title: "Shell Bug", tag: "NORMAL MONSTER", reward: "+25 EXP", steps: [["Plank", "30 sec"], ["Camera", "Side"]], exerciseType: "plank", targetReps: 0, targetSeconds: 30, difficultyLabel: "Normal", cameraAngle: "Side", impactLevel: "Low", spaceRequired: "Mat", baseXp: 25, monsterClass: "bug" },
  { id: "moss_turtle_glute_bridge", title: "Moss Turtle", tag: "NORMAL MONSTER", reward: "+25 EXP", steps: [["Glute Bridge", "12 reps"], ["Camera", "Side"]], exerciseType: "glute_bridge", targetReps: 12, targetSeconds: 0, difficultyLabel: "Normal", cameraAngle: "Side", impactLevel: "Low", spaceRequired: "Mat", baseXp: 25, monsterClass: "turtle" }
];

const MONSTER_QUEST_IDS = new Set(quests.map((quest) => quest.id));
const MONSTER_QUEST_FALLBACK = quests.map((quest) => ({
  ...quest,
  steps: quest.steps.map((step) => [...step])
}));

const RAID_CHALLENGES = [
  { id: "reaction_reach", title: "Reaction Reach", tag: "AGI RAID", exerciseType: "reaction_reach", targetReps: 12, targetSeconds: 0, reward: "+AGI", cameraAngle: "Front", steps: [["Reach targets", "12 hits"], ["Pattern", "4 corners"]] },
  { id: "star_jump_reach", title: "Star Jump Reach", tag: "AGI RAID", exerciseType: "star_jump_reach", targetReps: 10, targetSeconds: 0, reward: "+AGI", cameraAngle: "Front", steps: [["Star reach", "10 hits"], ["Check", "Wrist + ankle"]] },
  { id: "cross_body_reach", title: "Cross Body Reach", tag: "CORE RAID", exerciseType: "cross_body_reach", targetReps: 10, targetSeconds: 0, reward: "+CORE", cameraAngle: "Front", steps: [["Cross reaches", "10 hits"], ["Rule", "Opposite hand"]] },
  { id: "high_low_reach", title: "High-Low Reach", tag: "MOBILITY RAID", exerciseType: "high_low_reach", targetReps: 12, targetSeconds: 0, reward: "+MOVE", cameraAngle: "Front", steps: [["High-low targets", "12 hits"], ["Range", "Overhead to knee"]] },
  { id: "punch_target", title: "Punch Target", tag: "ATK RAID", exerciseType: "punch_target", targetReps: 12, targetSeconds: 0, reward: "+ATK", cameraAngle: "Front", steps: [["Fast punches", "12 hits"], ["Check", "Wrist speed"]] }
];

function cloneMonsterQuests() {
  return MONSTER_QUEST_FALLBACK.map((quest) => ({
    ...quest,
    steps: quest.steps.map((step) => [...step])
  }));
}

const PoseTrainer = (() => {
  const landmarkIndex = {
    leftShoulder: 11,
    rightShoulder: 12,
    leftElbow: 13,
    rightElbow: 14,
    leftWrist: 15,
    rightWrist: 16,
    leftHip: 23,
    rightHip: 24,
    leftKnee: 25,
    rightKnee: 26,
    leftAnkle: 27,
    rightAnkle: 28
  };

  const skeletonConnections = [
    [0, 1], [1, 2], [2, 3], [3, 7], [0, 4], [4, 5], [5, 6], [6, 8], [9, 10],
    [11, 12], [11, 13], [13, 15], [15, 17], [15, 19], [15, 21],
    [12, 14], [14, 16], [16, 18], [16, 20], [16, 22], [11, 23], [12, 24],
    [23, 24], [23, 25], [25, 27], [27, 29], [29, 31], [24, 26], [26, 28],
    [28, 30], [30, 32]
  ];

  const session = {
    active: false,
    quest: null,
    sessionId: null,
    pose: null,
    camera: null,
    reps: 0,
    formSamples: [],
    repArmed: false,
    startedAt: 0,
    lastSide: null,
    centerBaseline: null,
    target: null,
    targetIndex: 0,
    previousWrists: null,
    previousWristTime: 0
  };

  function elements() {
    return {
      trainer: document.getElementById("poseTrainer"),
      video: document.getElementById("poseVideo"),
      canvas: document.getElementById("poseCanvas"),
      title: document.getElementById("poseQuestTitle"),
      repCount: document.getElementById("poseRepCount"),
      formScore: document.getElementById("poseFormScore"),
      targetCount: document.getElementById("poseTargetCount"),
      feedback: document.getElementById("poseFeedback"),
      finish: document.getElementById("poseFinishButton")
    };
  }

  function angle(a, b, c) {
    const ab = { x: a.x - b.x, y: a.y - b.y };
    const cb = { x: c.x - b.x, y: c.y - b.y };
    const dot = ab.x * cb.x + ab.y * cb.y;
    const mag = Math.hypot(ab.x, ab.y) * Math.hypot(cb.x, cb.y);
    if (!mag) return 180;
    return Math.acos(Math.min(1, Math.max(-1, dot / mag))) * 180 / Math.PI;
  }

  function visible(landmarks, names) {
    return names.every((name) => (landmarks[landmarkIndex[name]]?.visibility ?? 0) > 0.55);
  }

  function average(values) {
    if (!values.length) return 0;
    return values.reduce((sum, value) => sum + value, 0) / values.length;
  }

  function classifyQuest(quest) {
    if (quest?.exerciseType) return quest.exerciseType;
    const text = `${quest?.id || ""} ${quest?.title || ""}`.toLowerCase();
    if (text.includes("push")) return "pushup";
    if (text.includes("high") || text.includes("knee")) return "high_knee";
    if (text.includes("mountain") || text.includes("climber")) return "mountain_climber";
    if (text.includes("skater")) return "skater_jump";
    if (text.includes("butt")) return "butt_kick";
    if (text.includes("bridge")) return "glute_bridge";
    if (text.includes("reaction")) return "reaction_reach";
    if (text.includes("star")) return "star_jump_reach";
    if (text.includes("cross")) return "cross_body_reach";
    if (text.includes("high-low") || text.includes("high_low")) return "high_low_reach";
    if (text.includes("punch")) return "punch_target";
    if (text.includes("jump")) return "jumping_jack";
    if (text.includes("plank")) return "plank";
    return "squat";
  }

  function setFeedback(message, state = "warn") {
    const { feedback } = elements();
    if (!feedback) return;
    feedback.textContent = message;
    feedback.dataset.state = state;
  }

  function updateHud() {
    const { repCount, formScore, targetCount } = elements();
    const score = Math.round(average(session.formSamples));
    if (repCount) repCount.textContent = session.reps.toLocaleString();
    if (formScore) formScore.textContent = session.formSamples.length ? String(score) : "--";
    if (targetCount) targetCount.textContent = String(session.quest?.targetReps || session.quest?.targetSeconds || 0);
  }

  function evaluateSquat(landmarks) {
    if (!visible(landmarks, ["leftHip", "leftKnee", "leftAnkle", "rightHip", "rightKnee", "rightAnkle"])) {
      setFeedback("ถอยให้เห็นสะโพก เข่า และข้อเท้าทั้งตัว");
      return;
    }

    const leftKnee = angle(landmarks[23], landmarks[25], landmarks[27]);
    const rightKnee = angle(landmarks[24], landmarks[26], landmarks[28]);
    const kneeAngle = Math.min(leftKnee, rightKnee);
    const form = kneeAngle < 95 ? 92 : kneeAngle < 125 ? 76 : 68;
    session.formSamples.push(form);

    if (kneeAngle < 95 && !session.repArmed) {
      session.repArmed = true;
      setFeedback("ดีมาก ดันตัวขึ้นให้สุด", "good");
    } else if (kneeAngle > 158 && session.repArmed) {
      session.reps += 1;
      session.repArmed = false;
      setFeedback("นับ 1 rep แล้ว", "good");
    } else if (kneeAngle > 130) {
      setFeedback("ย่อลงอีกนิด ให้เข่าเข้าใกล้ 90°");
    }
  }

  function evaluatePushup(landmarks) {
    if (!visible(landmarks, ["leftShoulder", "leftElbow", "leftWrist", "rightShoulder", "rightElbow", "rightWrist"])) {
      setFeedback("จัดกล้องให้เห็นไหล่ ศอก และข้อมือ");
      return;
    }

    const leftElbow = angle(landmarks[11], landmarks[13], landmarks[15]);
    const rightElbow = angle(landmarks[12], landmarks[14], landmarks[16]);
    const elbowAngle = Math.min(leftElbow, rightElbow);
    const form = elbowAngle < 95 ? 90 : elbowAngle < 130 ? 76 : 68;
    session.formSamples.push(form);

    if (elbowAngle < 95 && !session.repArmed) {
      session.repArmed = true;
      setFeedback("ลงดีแล้ว ดันตัวขึ้น", "good");
    } else if (elbowAngle > 155 && session.repArmed) {
      session.reps += 1;
      session.repArmed = false;
      setFeedback("Push-up rep complete", "good");
    } else if (elbowAngle > 130) {
      setFeedback("งอศอกลงอีกนิด");
    }
  }

  function evaluateJumpingJack(landmarks) {
    if (!visible(landmarks, ["leftWrist", "rightWrist", "leftAnkle", "rightAnkle", "leftHip", "rightHip"])) {
      setFeedback("ถอยให้เห็นมือและเท้าทั้งสองข้าง");
      return;
    }

    const wristsHigh = landmarks[15].y < landmarks[11].y && landmarks[16].y < landmarks[12].y;
    const ankleGap = Math.abs(landmarks[27].x - landmarks[28].x);
    const hipGap = Math.abs(landmarks[23].x - landmarks[24].x);
    const open = wristsHigh && ankleGap > hipGap * 1.65;
    session.formSamples.push(open ? 88 : 72);

    if (open && !session.repArmed) {
      session.repArmed = true;
      setFeedback("เปิดแขนขาดีแล้ว กลับมายืนชิด", "good");
    } else if (!open && session.repArmed) {
      session.reps += 1;
      session.repArmed = false;
      setFeedback("Jumping jack rep complete", "good");
    }
  }

  function evaluateHighKnee(landmarks) {
    if (!visible(landmarks, ["leftHip", "rightHip", "leftKnee", "rightKnee"])) {
      setFeedback("Align your hips and knees in frame.");
      return;
    }

    const leftLifted = landmarks[25].y < landmarks[23].y + 0.04;
    const rightLifted = landmarks[26].y < landmarks[24].y + 0.04;
    const activeSide = leftLifted ? "left" : rightLifted ? "right" : null;
    session.formSamples.push(activeSide ? 88 : 72);

    if (activeSide && !session.repArmed) {
      session.repArmed = true;
      session.lastSide = activeSide;
      setFeedback("Knee drive detected. Switch sides.", "good");
    } else if (!activeSide && session.repArmed) {
      session.reps += 1;
      session.repArmed = false;
      setFeedback("High knee rep complete", "good");
    }
  }

  function evaluateSkaterJump(landmarks) {
    if (!visible(landmarks, ["leftHip", "rightHip", "leftAnkle", "rightAnkle"])) {
      setFeedback("Step back so the camera sees hips and ankles.");
      return;
    }

    const center = (landmarks[23].x + landmarks[24].x) / 2;
    if (session.centerBaseline === null) session.centerBaseline = center;
    const offset = center - session.centerBaseline;
    const side = offset > 0.06 ? "right" : offset < -0.06 ? "left" : null;
    const ankleGap = Math.abs(landmarks[27].x - landmarks[28].x);
    const hipGap = Math.abs(landmarks[23].x - landmarks[24].x);
    const good = Boolean(side) && ankleGap > hipGap * 1.15;
    session.formSamples.push(good ? 88 : 70);

    if (good && side !== session.lastSide) {
      session.reps += 1;
      session.lastSide = side;
      setFeedback(`Skater jump ${side}`, "good");
    } else if (!side) {
      setFeedback("Push farther left or right.");
    }
  }

  function evaluateButtKick(landmarks) {
    if (!visible(landmarks, ["leftHip", "rightHip", "leftKnee", "rightKnee", "leftAnkle", "rightAnkle"])) {
      setFeedback("Use a side angle with hips, knees, and ankles visible.");
      return;
    }

    const leftKnee = angle(landmarks[23], landmarks[25], landmarks[27]);
    const rightKnee = angle(landmarks[24], landmarks[26], landmarks[28]);
    const activeSide = leftKnee < 80 ? "left" : rightKnee < 80 ? "right" : null;
    session.formSamples.push(activeSide ? 87 : 70);

    if (activeSide && !session.repArmed) {
      session.repArmed = true;
      session.lastSide = activeSide;
      setFeedback("Heel kick detected. Return and switch.", "good");
    } else if (!activeSide && session.repArmed) {
      session.reps += 1;
      session.repArmed = false;
      setFeedback("Butt kick rep complete", "good");
    }
  }

  function evaluateMountainClimber(landmarks) {
    if (!visible(landmarks, ["leftShoulder", "rightShoulder", "leftHip", "rightHip", "leftKnee", "rightKnee", "leftAnkle", "rightAnkle"])) {
      setFeedback("Use a side 45 camera angle and keep the full body visible.");
      return;
    }

    const bodyLine = Math.max(
      angle(landmarks[11], landmarks[23], landmarks[27]),
      angle(landmarks[12], landmarks[24], landmarks[28])
    );
    const leftDrive = Math.abs(landmarks[25].x - landmarks[11].x) < Math.abs(landmarks[27].x - landmarks[11].x) * 0.7;
    const rightDrive = Math.abs(landmarks[26].x - landmarks[12].x) < Math.abs(landmarks[28].x - landmarks[12].x) * 0.7;
    const activeSide = leftDrive ? "left" : rightDrive ? "right" : null;
    const good = bodyLine > 145 && Boolean(activeSide);
    session.formSamples.push(good ? 86 : bodyLine > 135 ? 74 : 62);

    if (good && !session.repArmed) {
      session.repArmed = true;
      session.lastSide = activeSide;
      setFeedback("Knee drive while holding plank.", "good");
    } else if (!activeSide && session.repArmed) {
      session.reps += 1;
      session.repArmed = false;
      setFeedback("Mountain climber rep complete", "good");
    }
  }

  function evaluatePlank(landmarks) {
    if (!visible(landmarks, ["leftShoulder", "leftHip", "leftAnkle", "rightShoulder", "rightHip", "rightAnkle"])) {
      setFeedback("จัดกล้องให้เห็นไหล่ สะโพก และข้อเท้า");
      return;
    }

    const leftBody = angle(landmarks[11], landmarks[23], landmarks[27]);
    const rightBody = angle(landmarks[12], landmarks[24], landmarks[28]);
    const bodyAngle = Math.max(leftBody, rightBody);
    const good = bodyAngle > 160;
    session.formSamples.push(good ? 92 : 62);
    if (good) {
      const elapsed = Math.floor((Date.now() - session.startedAt) / 1000);
      session.reps = elapsed;
      setFeedback("ลำตัวตรงดี ค้างไว้", "good");
    } else {
      setFeedback("ยกสะโพก/จัดลำตัวให้ตรงขึ้น");
    }
  }

  function evaluateGluteBridge(landmarks) {
    if (!visible(landmarks, ["leftShoulder", "leftHip", "leftKnee", "rightShoulder", "rightHip", "rightKnee"])) {
      setFeedback("Use a side angle with shoulders, hips, and knees visible.");
      return;
    }

    const leftBridge = angle(landmarks[11], landmarks[23], landmarks[25]);
    const rightBridge = angle(landmarks[12], landmarks[24], landmarks[26]);
    const bridgeAngle = Math.max(leftBridge, rightBridge);
    const lifted = bridgeAngle > 155;
    session.formSamples.push(lifted ? 90 : bridgeAngle > 135 ? 76 : 64);

    if (lifted && !session.repArmed) {
      session.repArmed = true;
      setFeedback("Bridge top locked. Lower with control.", "good");
    } else if (!lifted && session.repArmed) {
      session.reps += 1;
      session.repArmed = false;
      setFeedback("Glute bridge rep complete", "good");
    } else if (!lifted) {
      setFeedback("Lift hips until shoulders-hips-knees align.");
    }
  }

  function distanceToTarget(point, target) {
    if (!point || !target) return Infinity;
    return Math.hypot(point.x - target.x, point.y - target.y);
  }

  function nextRaidTarget(type) {
    const cornerTargets = [
      { x: 0.18, y: 0.22, label: "top left", side: "left" },
      { x: 0.82, y: 0.22, label: "top right", side: "right" },
      { x: 0.18, y: 0.72, label: "low left", side: "left" },
      { x: 0.82, y: 0.72, label: "low right", side: "right" }
    ];
    const highLowTargets = [
      { x: 0.5, y: 0.16, label: "high", side: "center" },
      { x: 0.5, y: 0.76, label: "low", side: "center" }
    ];
    const punchTargets = [
      { x: 0.35, y: 0.42, label: "left punch", side: "left" },
      { x: 0.65, y: 0.42, label: "right punch", side: "right" },
      { x: 0.5, y: 0.34, label: "center punch", side: "center" }
    ];
    const list = type === "high_low_reach" ? highLowTargets : type === "punch_target" ? punchTargets : cornerTargets;
    const target = list[session.targetIndex % list.length];
    session.targetIndex += 1;
    session.target = { ...target, createdAt: Date.now() };
  }

  function ensureRaidTarget(type) {
    if (!session.target) nextRaidTarget(type);
  }

  function addRaidHit(message) {
    session.reps += 1;
    session.target = null;
    setFeedback(message, "good");
  }

  function evaluateRaidReach(landmarks, type) {
    if (!visible(landmarks, ["leftWrist", "rightWrist", "leftShoulder", "rightShoulder"])) {
      setFeedback("Step back so both wrists and shoulders are visible.");
      return;
    }

    ensureRaidTarget(type);
    const leftWrist = landmarks[15];
    const rightWrist = landmarks[16];
    const target = session.target;
    let hit = false;
    let form = 72;

    if (type === "reaction_reach") {
      hit = Math.min(distanceToTarget(leftWrist, target), distanceToTarget(rightWrist, target)) < 0.095;
      form = hit ? 92 : 76;
    } else if (type === "star_jump_reach") {
      const wristsHigh = leftWrist.y < landmarks[11].y && rightWrist.y < landmarks[12].y;
      const ankleGap = visible(landmarks, ["leftAnkle", "rightAnkle", "leftHip", "rightHip"])
        ? Math.abs(landmarks[27].x - landmarks[28].x)
        : 0;
      const hipGap = visible(landmarks, ["leftHip", "rightHip"])
        ? Math.abs(landmarks[23].x - landmarks[24].x)
        : 1;
      hit = wristsHigh && ankleGap > hipGap * 1.45 && Math.min(distanceToTarget(leftWrist, target), distanceToTarget(rightWrist, target)) < 0.13;
      form = hit ? 90 : wristsHigh ? 78 : 66;
    } else if (type === "cross_body_reach") {
      const targetWrist = target.side === "left" ? rightWrist : leftWrist;
      hit = distanceToTarget(targetWrist, target) < 0.11;
      form = hit ? 90 : 72;
    } else if (type === "high_low_reach") {
      hit = Math.min(distanceToTarget(leftWrist, target), distanceToTarget(rightWrist, target)) < 0.11;
      form = hit ? 90 : 72;
    }

    session.formSamples.push(form);
    if (hit && !session.repArmed) {
      session.repArmed = true;
      addRaidHit(`${target.label} hit`);
    } else if (!hit) {
      session.repArmed = false;
      setFeedback(`Reach the ${target.label} target.`);
    }
  }

  function evaluatePunchTarget(landmarks) {
    if (!visible(landmarks, ["leftWrist", "rightWrist", "leftShoulder", "rightShoulder"])) {
      setFeedback("Keep both fists and shoulders in frame.");
      return;
    }

    ensureRaidTarget("punch_target");
    const now = Date.now();
    const wrists = { left: landmarks[15], right: landmarks[16] };
    const target = session.target;
    const dt = Math.max(0.016, (now - (session.previousWristTime || now)) / 1000);
    const leftSpeed = session.previousWrists ? Math.hypot(wrists.left.x - session.previousWrists.left.x, wrists.left.y - session.previousWrists.left.y) / dt : 0;
    const rightSpeed = session.previousWrists ? Math.hypot(wrists.right.x - session.previousWrists.right.x, wrists.right.y - session.previousWrists.right.y) / dt : 0;
    const nearLeft = distanceToTarget(wrists.left, target) < 0.12;
    const nearRight = distanceToTarget(wrists.right, target) < 0.12;
    const hit = (nearLeft && leftSpeed > 0.8) || (nearRight && rightSpeed > 0.8);

    session.previousWrists = { left: { ...wrists.left }, right: { ...wrists.right } };
    session.previousWristTime = now;
    session.formSamples.push(hit ? 92 : Math.max(leftSpeed, rightSpeed) > 0.45 ? 78 : 68);

    if (hit && !session.repArmed) {
      session.repArmed = true;
      addRaidHit(`${target.label} landed`);
    } else if (!hit) {
      session.repArmed = false;
      setFeedback(`Punch through the ${target.label} target.`);
    }
  }

  function evaluateLandmarks(landmarks) {
    const type = classifyQuest(session.quest);
    if (type === "pushup") evaluatePushup(landmarks);
    else if (type === "jumping_jack") evaluateJumpingJack(landmarks);
    else if (type === "high_knee") evaluateHighKnee(landmarks);
    else if (type === "mountain_climber") evaluateMountainClimber(landmarks);
    else if (type === "skater_jump") evaluateSkaterJump(landmarks);
    else if (type === "butt_kick") evaluateButtKick(landmarks);
    else if (type === "plank") evaluatePlank(landmarks);
    else if (type === "glute_bridge") evaluateGluteBridge(landmarks);
    else if (["reaction_reach", "star_jump_reach", "cross_body_reach", "high_low_reach"].includes(type)) evaluateRaidReach(landmarks, type);
    else if (type === "punch_target") evaluatePunchTarget(landmarks);
    else evaluateSquat(landmarks);
    if (session.formSamples.length > 120) session.formSamples.shift();
    updateHud();
  }

  function drawSkeletonFallback(ctx, landmarks) {
    ctx.save();
    ctx.lineWidth = 4;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.strokeStyle = "#7dd3fc";
    ctx.beginPath();
    skeletonConnections.forEach(([fromIndex, toIndex]) => {
      const from = landmarks[fromIndex];
      const to = landmarks[toIndex];
      if (!from || !to || (from.visibility ?? 0) < 0.35 || (to.visibility ?? 0) < 0.35) return;
      ctx.moveTo(from.x * ctx.canvas.width, from.y * ctx.canvas.height);
      ctx.lineTo(to.x * ctx.canvas.width, to.y * ctx.canvas.height);
    });
    ctx.stroke();

    ctx.fillStyle = "#ffffff";
    landmarks.forEach((point) => {
      if (!point || (point.visibility ?? 0) < 0.35) return;
      ctx.beginPath();
      ctx.arc(point.x * ctx.canvas.width, point.y * ctx.canvas.height, 5, 0, Math.PI * 2);
      ctx.fill();
    });
    ctx.restore();
  }

  function drawResults(results) {
    const { canvas, video } = elements();
    if (!canvas || !video) return;
    const ctx = canvas.getContext("2d");
    const width = video.videoWidth || 720;
    const height = video.videoHeight || 1280;
    if (canvas.width !== width || canvas.height !== height) {
      canvas.width = width;
      canvas.height = height;
    }

    ctx.save();
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(results.image, 0, 0, canvas.width, canvas.height);
    if (results.poseLandmarks) {
      if (window.drawConnectors && window.drawLandmarks && window.POSE_CONNECTIONS) {
        window.drawConnectors(ctx, results.poseLandmarks, window.POSE_CONNECTIONS, { color: "#7dd3fc", lineWidth: 4 });
        window.drawLandmarks(ctx, results.poseLandmarks, { color: "#ffffff", lineWidth: 2 });
      } else {
        drawSkeletonFallback(ctx, results.poseLandmarks);
      }
    }
    drawRaidTarget(ctx, canvas.width, canvas.height);
    ctx.restore();
  }

  function drawRaidTarget(ctx, width, height) {
    if (!session.target) return;
    const x = session.target.x * width;
    const y = session.target.y * height;
    const pulse = 1 + Math.sin(Date.now() / 120) * 0.08;
    const radius = Math.max(34, Math.min(width, height) * 0.055) * pulse;

    ctx.save();
    ctx.beginPath();
    ctx.arc(x, y, radius, 0, Math.PI * 2);
    ctx.fillStyle = "rgba(0, 122, 255, 0.28)";
    ctx.fill();
    ctx.lineWidth = 5;
    ctx.strokeStyle = "rgba(255, 255, 255, 0.92)";
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(x, y, radius * 0.42, 0, Math.PI * 2);
    ctx.fillStyle = "rgba(255, 255, 255, 0.86)";
    ctx.fill();
    ctx.fillStyle = "rgba(5, 7, 11, 0.92)";
    ctx.font = "700 18px Inter, system-ui, sans-serif";
    ctx.textAlign = "center";
    ctx.fillText(String(session.reps + 1), x, y + 6);
    ctx.restore();
  }

  async function ensurePose() {
    if (!window.Pose || !window.Camera) {
      throw new Error("MediaPipe is still loading.");
    }
    if (session.pose) return session.pose;

    session.pose = new window.Pose({
      locateFile: (file) => `https://cdn.jsdelivr.net/npm/@mediapipe/pose/${file}`
    });
    session.pose.setOptions({
      modelComplexity: 1,
      smoothLandmarks: true,
      enableSegmentation: false,
      minDetectionConfidence: 0.55,
      minTrackingConfidence: 0.55
    });
    session.pose.onResults((results) => {
      if (!session.active) return;
      drawResults(results);
      if (results.poseLandmarks) evaluateLandmarks(results.poseLandmarks);
      else setFeedback("ไม่พบร่างกาย ลองถอยห่างจากกล้อง");
    });

    return session.pose;
  }

  async function start(quest) {
    const { trainer, video, title } = elements();
    if (!trainer || !video) return null;

    session.active = true;
    session.quest = quest;
    session.sessionId = null;
    session.reps = 0;
    session.formSamples = [];
    session.repArmed = false;
    session.startedAt = Date.now();
    session.lastSide = null;
    session.centerBaseline = null;
    session.target = null;
    session.targetIndex = 0;
    session.previousWrists = null;
    session.previousWristTime = 0;
    if (title) title.textContent = quest?.title || "Quest";
    trainer.classList.add("active");
    trainer.setAttribute("aria-hidden", "false");
    updateHud();
    setFeedback("Loading BlazePose...");

    const authClient = window.fitQuestAuth?.client;
    if (authClient && window.fitQuestAuth?.currentUserId && quest?.id) {
      const { data, error } = await authClient.rpc("start_quest_session", { target_quest_id: quest.id });
      if (error) setFeedback(error.message || "Session will run locally.");
      else session.sessionId = data;
    }

    try {
      const pose = await ensurePose();
      session.camera = new window.Camera(video, {
        onFrame: async () => {
          if (session.active) await pose.send({ image: video });
        },
        width: 720,
        height: 1280
      });
      await session.camera.start();
      setFeedback("Align your full body in frame.", "good");
    } catch (error) {
      setFeedback(error.message || "Camera failed to start.");
    }

    return session.sessionId;
  }

  async function finish() {
    const authClient = window.fitQuestAuth?.client;
    const elapsed = Math.max(1, Math.floor((Date.now() - session.startedAt) / 1000));
    const formScore = Math.round(average(session.formSamples)) || null;
    const sessionId = session.sessionId;
    const quest = session.quest;
    const reps = session.reps;

    stopCamera();

    if (authClient && sessionId) {
      const { data, error } = await authClient.rpc("complete_quest_session", {
        target_session_id: sessionId,
        reps_done_value: reps,
        valid_reps_value: reps,
        duration_seconds_value: elapsed,
        form_score_value: formScore
      });

      if (error) {
        showToast(error.message || "QUEST SAVE FAILED.");
        return;
      }

      const reward = Array.isArray(data) ? data[0] : data;
      if (reward) {
        state.coins = reward.profile_coins;
        state.level = reward.profile_level;
        state.xp = reward.profile_xp;
        state.statPoints = reward.profile_stat_points;
        updateCoins();
        updateLevelDisplay(state.level, state.xp);
      }
      await loadAdjustedQuests();
    } else {
      state.xp += Number(quest?.baseXp || 0);
      updateLevelDisplay(state.level, state.xp);
    }

    showToast(`${quest?.title || "QUEST"} COMPLETE.`);
  }

  function stopCamera() {
    const { trainer, video } = elements();
    session.active = false;
    if (session.camera) {
      session.camera.stop();
      session.camera = null;
    }
    if (video?.srcObject) {
      video.srcObject.getTracks().forEach((track) => track.stop());
      video.srcObject = null;
    }
    trainer?.classList.remove("active");
    trainer?.setAttribute("aria-hidden", "true");
  }

  return { start, finish, stopCamera };
})();

let storyLaunchTimer = null;
let storyReadyTimer = null;

const coinCount = document.getElementById("coinCount");
const toast = document.getElementById("toast");

function showToast(message) {
  toast.textContent = message;
  toast.classList.add("show");
  clearTimeout(showToast.timer);
  showToast.timer = setTimeout(() => toast.classList.remove("show"), 2500);
}

function updateCoins() {
  coinCount.textContent = state.coins.toLocaleString();
  renderStatusStats();
}

function xpRequiredForLevel(level) {
  return 100 + Math.max(0, level - 1) * 20;
}

function updateLevelDisplay(level = STARTER_PLAYER.level, xp = STARTER_PLAYER.xp) {
  const currentLevel = Math.min(STORY_LEVEL_COUNT, Math.max(1, Number(level) || STARTER_PLAYER.level));
  state.level = currentLevel;
  const xpRequired = xpRequiredForLevel(currentLevel);
  const levelChip = document.querySelector(".level-chip");
  const levelText = document.querySelector(".level-text");
  const levelFill = document.querySelector(".level-fill");
  const xpTodayValue = document.querySelector(".stats .stat:nth-child(2) strong");
  const xpTodayMeter = document.querySelector(".stats .stat:nth-child(2) .meter span");
  const progress = Math.min(100, Math.max(0, (xp / xpRequired) * 100));

  if (levelChip) levelChip.textContent = `LV. ${currentLevel}`;
  if (levelText) levelText.textContent = `${xp} / ${xpRequired} XP`;
  if (levelFill) levelFill.style.width = `${progress}%`;
  if (xpTodayValue) xpTodayValue.textContent = xp;
  if (xpTodayMeter) xpTodayMeter.style.width = `${progress}%`;
  updateStoryCardCurrentLevel(currentLevel);
  renderStatusStats();
}

function renderStatusStats() {
  const statusGrid = document.getElementById("statusGrid");
  if (!statusGrid) return;

  const values = {
    maxHp: state.maxHp,
    attack: state.attack,
    defense: state.defense
  };
  const pointsBadge = document.getElementById("statPointsBadge");
  if (pointsBadge) pointsBadge.textContent = `POINTS ${Number(state.statPoints || 0).toLocaleString()}`;

  Object.entries(values).forEach(([stat, value]) => {
    const row = statusGrid.querySelector(`[data-stat-row="${stat}"]`);
    const valueEl = row?.querySelector(".status-value");
    const button = row?.querySelector(".status-upgrade");
    if (valueEl) valueEl.textContent = Number(value || 0).toLocaleString();
    if (button) button.disabled = state.statPoints < 1;
  });
}

async function upgradeStat(stat) {
  if (!Object.prototype.hasOwnProperty.call(STAT_UPGRADE_STEPS, stat)) return;
  if (state.statPoints < 1) {
    showToast("NO STAT POINTS.");
    return;
  }

  const remoteStat = stat === "maxHp" ? "max_hp" : stat;
  const authClient = window.fitQuestAuth?.client;
  const isSignedIn = Boolean(window.fitQuestAuth?.currentUserId);

  if (authClient && isSignedIn) {
    const { data, error } = await authClient.rpc("upgrade_player_stat", {
      target_stat: remoteStat,
    });

    if (error) {
      showToast(error.message || "UPGRADE FAILED.");
      return;
    }

    const profile = Array.isArray(data) ? data[0] : data;
    if (profile) {
      state.coins = profile.profile_coins;
      state.statPoints = profile.profile_stat_points;
      state.hp = profile.profile_hp;
      state.maxHp = profile.profile_max_hp;
      state.attack = profile.profile_attack;
      state.defense = profile.profile_defense;
    }
  } else {
    state.statPoints -= 1;
    state[stat] += STAT_UPGRADE_STEPS[stat];
    if (stat === "maxHp") state.hp = Math.min(state.maxHp, state.hp + STAT_UPGRADE_STEPS.maxHp);
  }

  updateCoins();
  renderStatusStats();
  showToast(`${stat === "maxHp" ? "HP" : stat.toUpperCase()} UPGRADED.`);
}

function openProfileSheet() {
  const sheet = document.getElementById("profileSheet");
  if (!sheet) return;
  renderStatusStats();
  sheet.classList.add("open");
  sheet.setAttribute("aria-hidden", "false");
}

function closeProfileSheet() {
  const sheet = document.getElementById("profileSheet");
  if (!sheet) return;
  sheet.classList.remove("open");
  sheet.setAttribute("aria-hidden", "true");
}

function getCurrentStoryLevel() {
  return Math.min(STORY_LEVEL_COUNT, Math.max(1, Number(state.level) || STARTER_PLAYER.level));
}

function updateStoryCardCurrentLevel(level = getCurrentStoryLevel()) {
  const currentLevel = Math.min(STORY_LEVEL_COUNT, Math.max(1, Number(level) || STARTER_PLAYER.level));
  const cardLevel = document.getElementById("storyCardCurrentLevel");
  const storyCard = document.getElementById("openStoryMap");

  if (cardLevel) {
    cardLevel.textContent = String(currentLevel);
    cardLevel.setAttribute("font-size", currentLevel >= 100 ? "10" : currentLevel >= 10 ? "12" : "14");
  }
  if (storyCard) storyCard.setAttribute("aria-label", `เข้าสู่โหมดเนื้อเรื่อง ด่านปัจจุบัน ${currentLevel}`);
}

function getStoryChapter(level) {
  const chapterIndex = Math.min(STORY_CHAPTERS.length - 1, Math.floor((Math.max(1, level) - 1) / STORY_WORLD_SIZE));
  return { ...STORY_CHAPTERS[chapterIndex], number: chapterIndex + 1 };
}

function getStoryWorldCount() {
  return Math.ceil(STORY_LEVEL_COUNT / STORY_WORLD_SIZE);
}

function getStoryWorldStage(level) {
  return ((Math.max(1, level) - 1) % STORY_WORLD_SIZE) + 1;
}

function classifyStoryLevel(level) {
  if (level <= 0) return "normal";
  const worldStage = getStoryWorldStage(level);
  if (worldStage === STORY_WORLD_SIZE) return "boss";
  if (worldStage === 10) return "mini-boss";
  if (level % 7 === 0) return "reverse";
  if (level % 5 === 0) return "haste";
  if (level % 3 === 0) return "echo";
  return "normal";
}

function storyLevelIcon(kind, level) {
  if (kind === "boss") return storyIcons.crown;
  if (kind === "mini-boss") return storyIcons.diamond;
  if (kind === "haste") return storyIcons.bolt;
  if (kind === "echo") return storyIcons.repeat;
  if (kind === "reverse") return storyIcons.rotateBack;
  return String(level);
}

function storyLockedIcon(kind) {
  if (kind === "boss") return `<span aria-hidden="true">${storyIcons.crown}</span>`;
  if (kind === "mini-boss") return `<span aria-hidden="true">${storyIcons.diamond}</span>`;
  return `<svg viewBox="0 0 24 24"><path d="M7 10V8a5 5 0 0 1 10 0v2"></path><rect x="5" y="10" width="14" height="10" rx="2"></rect></svg>`;
}

function levelsUntilNextStoryWorld(level) {
  return STORY_WORLD_SIZE - getStoryWorldStage(level);
}

function getStoryStagePoints() {
  const height = STORY_MAP_PADDING * 2 + (STORY_LEVEL_COUNT - 1) * STORY_STAGE_GAP;
  const routePattern = [120, 176, 188, 144, 82, 54, 84, 150, 188, 132];
  return Array.from({ length: STORY_LEVEL_COUNT }, (_, index) => {
    const level = index + 1;
    const patternIndex = index % routePattern.length;
    const routeCycle = Math.floor(index / routePattern.length);
    const drift = Math.sin(routeCycle * 0.95) * 13 + Math.cos(routeCycle * 0.43) * 7;
    const handTune = patternIndex === 0 ? 0 : Math.sin(index * 1.17) * 5;
    const gapVariation = Math.sin(index * 0.23) * 7 + (patternIndex === 0 ? 0 : Math.cos(index * 0.41) * 4);
    const y = height - STORY_MAP_PADDING - index * STORY_STAGE_GAP + gapVariation;
    const x = routePattern[patternIndex] + drift + handTune;
    return { level, x: Math.round(x), y: Math.round(y) };
  });
}

function buildSmoothStoryPath(points) {
  if (!points.length) return "";
  if (points.length === 1) return `M ${points[0].x} ${points[0].y}`;

  const commands = [`M ${points[0].x} ${points[0].y}`];
  for (let index = 0; index < points.length - 1; index += 1) {
    const previous = points[Math.max(0, index - 1)];
    const current = points[index];
    const next = points[index + 1];
    const afterNext = points[Math.min(points.length - 1, index + 2)];
    const tension = 0.42 + (index % 5) * 0.025;
    const controlOne = {
      x: current.x + (next.x - previous.x) * tension / 6,
      y: current.y + (next.y - previous.y) * tension / 6
    };
    const controlTwo = {
      x: next.x - (afterNext.x - current.x) * tension / 6,
      y: next.y - (afterNext.y - current.y) * tension / 6
    };

    commands.push(`C ${controlOne.x.toFixed(1)} ${controlOne.y.toFixed(1)}, ${controlTwo.x.toFixed(1)} ${controlTwo.y.toFixed(1)}, ${next.x} ${next.y}`);
  }

  return commands.join(" ");
}

function renderStoryMap() {
  const roadMap = document.getElementById("storyRoadMap");
  const storyMap = document.getElementById("storyMap");
  const roadSvg = document.getElementById("storyRoadSvg");
  const roadShadow = document.getElementById("storyRoadShadow");
  const roadLine = document.getElementById("storyRoadLine");
  const roadCenter = document.getElementById("storyRoadCenter");
  const stageLayer = document.getElementById("storyStageLayer");
  const avatar = document.getElementById("storyAvatar");
  const progressText = document.getElementById("storyProgressText");
  if (!roadMap || !roadSvg || !roadShadow || !roadLine || !roadCenter || !stageLayer) return;

  const currentLevel = getCurrentStoryLevel();
  const currentWorld = getStoryChapter(currentLevel);
  const height = STORY_MAP_PADDING * 2 + (STORY_LEVEL_COUNT - 1) * STORY_STAGE_GAP;
  const points = getStoryStagePoints();
  const storyPath = buildSmoothStoryPath(points);
  const worldIcon = document.getElementById("storyWorldIcon");
  const worldTitle = document.getElementById("storyWorldTitle");

  roadMap.style.setProperty("--story-map-height", `${height}px`);
  if (storyMap) storyMap.style.setProperty("--story-map-height", `${height}px`);
  if (storyMap) {
    storyMap.style.setProperty("--story-from", currentWorld.from);
    storyMap.style.setProperty("--story-via", currentWorld.via);
    storyMap.style.setProperty("--story-to", currentWorld.to);
    storyMap.style.setProperty("--story-primary", currentWorld.primary);
    storyMap.style.setProperty("--story-accent", currentWorld.accent);
  }
  roadSvg.setAttribute("viewBox", `0 0 240 ${height}`);
  roadShadow.setAttribute("d", storyPath);
  roadLine.setAttribute("d", storyPath);
  roadCenter.setAttribute("d", storyPath);
  roadShadow.setAttribute("pathLength", "1");
  roadLine.setAttribute("pathLength", "1");
  roadCenter.setAttribute("pathLength", "1");
  if (worldIcon) worldIcon.innerHTML = currentWorld.icon;
  if (worldTitle) worldTitle.textContent = currentWorld.name;
  if (progressText) {
    const remaining = currentLevel >= STORY_LEVEL_COUNT ? 0 : levelsUntilNextStoryWorld(currentLevel);
    const unlockCopy = remaining > 0 ? `อีก ${remaining} ด่านปลดล็อกโลกใหม่` : "ด่านสุดท้ายของโลก";
    progressText.textContent = `โลกที่ ${currentWorld.number}/${getStoryWorldCount()} · ${unlockCopy}`;
  }

  stageLayer.innerHTML = points.map(point => {
    const isCurrent = point.level === currentLevel;
    const isUnlocked = point.level <= currentLevel;
    const kind = classifyStoryLevel(point.level);
    const isWorldGate = point.level % STORY_WORLD_SIZE === 0;
    const stageClass = [
      "story-stage",
      `stage-${kind}`,
      isCurrent ? "stage-current" : "",
      isUnlocked && !isCurrent ? "stage-cleared" : "",
      !isUnlocked ? "stage-locked" : "",
      isWorldGate ? "stage-world-gate" : ""
    ].filter(Boolean).join(" ");
    const label = isUnlocked ? `<span>${storyLevelIcon(kind, point.level)}</span>` : storyLockedIcon(kind);
    const disabled = isUnlocked ? "" : " disabled";
    const aria = isUnlocked ? `ด่าน ${point.level}` : `ด่าน ${point.level} ยังล็อก`;

    const stageOrder = Math.min(18, Math.abs(point.level - currentLevel));
    const stageDelay = (0.18 + stageOrder * 0.028).toFixed(3);

    return `<button class="${stageClass}" type="button" data-story-level="${point.level}" style="left:${point.x}px; top:${point.y}px; --stage-delay:${stageDelay}s;" aria-label="${aria}"${disabled}>${label}</button>`;
  }).join("");

  const currentPoint = points[currentLevel - 1];
  if (avatar && currentPoint) {
    avatar.style.left = `${Math.max(22, currentPoint.x - 84)}px`;
    avatar.style.top = `${currentPoint.y + 38}px`;
  }

  updateStoryCurrentButtonVisibility();
}

function scrollToCurrentStoryLevel(behavior = "smooth") {
  const content = document.querySelector(".content");
  const currentStage = document.querySelector(".stage-current");
  if (!content || !currentStage) return;

  const targetTop = currentStage.offsetTop - content.clientHeight * 0.58;
  content.scrollTo({ top: Math.max(0, targetTop), behavior });
  requestAnimationFrame(updateStoryCurrentButtonVisibility);
}

function updateStoryCurrentButtonVisibility() {
  const storyMap = document.getElementById("storyMap");
  const content = document.querySelector(".content");
  const currentStage = document.querySelector(".stage-current");
  const currentButton = document.querySelector(".story-current-button");
  if (!storyMap || !content || !currentStage || !currentButton || storyMap.hidden) return;

  const contentRect = content.getBoundingClientRect();
  const stageRect = currentStage.getBoundingClientRect();
  const stageCenter = stageRect.top + stageRect.height / 2;
  const visibleTop = contentRect.top + 84;
  const visibleBottom = contentRect.bottom - 132;
  const hasScrolledPastCurrent = stageCenter > visibleBottom;

  currentButton.classList.toggle("is-visible", hasScrolledPastCurrent);
}

function getRaidThreat(floor = state.raidFloor) {
  if (floor >= 100) return { label: "Mythic", copy: "ภัยคุกคามระดับตำนาน · รางวัลสูงมาก", bonus: 3.5 };
  if (floor >= 50) return { label: "High", copy: "ภัยคุกคามระดับสูง · รางวัลเพิ่มมาก", bonus: 2.4 };
  if (floor >= 20) return { label: "Medium", copy: "ภัยคุกคามระดับกลาง · รางวัลเพิ่มขึ้น", bonus: 1.7 };
  return { label: "Low", copy: "ภัยคุกคามระดับเริ่มต้น · รางวัลพื้นฐาน", bonus: 1 };
}

function renderInfiniteRaid() {
  const floor = Math.max(1, Number(state.raidFloor) || 1);
  const threat = getRaidThreat(floor);
  const floorText = document.getElementById("raidFloorText");
  const currentFloor = document.getElementById("raidCurrentFloor");
  const rewardBonus = document.getElementById("raidRewardBonus");
  const threatText = document.getElementById("raidThreatText");
  const threatLevel = document.getElementById("raidThreatLevel");

  if (floorText) floorText.textContent = `ชั้นที่ ${floor}`;
  if (currentFloor) currentFloor.textContent = floor.toLocaleString();
  if (rewardBonus) rewardBonus.textContent = `x${threat.bonus.toFixed(1)}`;
  if (threatText) threatText.textContent = threat.copy;
  if (threatLevel) threatLevel.textContent = threat.label;
  renderRaidChallenges();
}

function renderRaidChallenges() {
  const list = document.getElementById("raidChallengeList");
  if (!list) return;
  list.innerHTML = RAID_CHALLENGES.map((challenge) => {
    const active = challenge.id === state.activeRaidChallenge;
    return `
      <button class="raid-challenge${active ? " active" : ""}" type="button" data-raid-challenge="${challenge.id}" aria-pressed="${active}">
        <span class="raid-challenge-tag">${challenge.tag}</span>
        <strong>${challenge.title}</strong>
        <small>${challenge.steps[0][0]} · ${challenge.steps[0][1]}</small>
        <span class="raid-challenge-meta">${challenge.cameraAngle} · ${challenge.reward}</span>
      </button>
    `;
  }).join("");
}

function setView(view) {
  if (view !== "play") {
    clearTimeout(storyLaunchTimer);
    clearTimeout(storyReadyTimer);
    document.body.classList.remove("story-map-open");
    document.body.classList.remove("raid-mode-open");
    document.body.classList.remove("story-launching");
    showStoryHome();
  }

  document.querySelectorAll(".view").forEach(el => {
    el.classList.toggle("active", el.id === `view-${view}`);
  });
  document.querySelectorAll(".nav").forEach(btn => {
    const active = btn.dataset.view === view;
    btn.classList.toggle("active", active);
    if (active) btn.setAttribute("aria-current", "page");
    else btn.removeAttribute("aria-current");
  });
  document.querySelector(".content")?.scrollTo({ top: 0, behavior: "smooth" });
}

function setStoryLaunchOrigin(trigger) {
  const appScreen = document.getElementById("app-screen");
  const rect = trigger?.getBoundingClientRect?.();
  const screenRect = appScreen?.getBoundingClientRect?.();
  if (!appScreen || !rect || !screenRect) return;

  const originX = ((rect.left + rect.width * 0.78 - screenRect.left) / screenRect.width) * 100;
  const originY = ((rect.top + rect.height * 0.5 - screenRect.top) / screenRect.height) * 100;
  appScreen.style.setProperty("--story-launch-x", `${Math.round(originX)}%`);
  appScreen.style.setProperty("--story-launch-y", `${Math.round(originY)}%`);
}

function showStoryMap(event) {
  const storyHome = document.getElementById("storyHome");
  const storyMap = document.getElementById("storyMap");
  const raidScreen = document.getElementById("raidScreen");
  const trigger = event?.currentTarget || document.getElementById("openStoryMap");
  if (!storyHome || !storyMap) return;

  clearTimeout(storyLaunchTimer);
  clearTimeout(storyReadyTimer);
  setStoryLaunchOrigin(trigger);
  trigger?.classList.add("is-launching");
  document.body.classList.add("story-launching");

  storyLaunchTimer = setTimeout(() => {
    renderStoryMap();
    document.body.classList.add("story-map-open");
    document.body.classList.remove("raid-mode-open");
    storyHome.hidden = true;
    if (raidScreen) raidScreen.hidden = true;
    storyMap.hidden = false;
    storyMap.classList.remove("is-ready");
    storyMap.classList.add("is-entering");

    requestAnimationFrame(() => {
      scrollToCurrentStoryLevel("auto");
      requestAnimationFrame(() => {
        storyMap.classList.add("is-ready");
        updateStoryCurrentButtonVisibility();
      });
    });

    storyReadyTimer = setTimeout(() => {
      storyMap.classList.remove("is-entering");
      document.body.classList.remove("story-launching");
      trigger?.classList.remove("is-launching");
    }, 920);
  }, 310);
}

function showStoryHome() {
  const storyHome = document.getElementById("storyHome");
  const storyMap = document.getElementById("storyMap");
  const raidScreen = document.getElementById("raidScreen");
  if (!storyHome || !storyMap) return;

  clearTimeout(storyLaunchTimer);
  clearTimeout(storyReadyTimer);
  storyMap.hidden = true;
  if (raidScreen) raidScreen.hidden = true;
  storyHome.hidden = false;
  document.body.classList.remove("story-map-open");
  document.body.classList.remove("raid-mode-open");
  document.body.classList.remove("story-launching");
  storyMap.classList.remove("is-entering", "is-ready");
  raidScreen?.classList.remove("is-entering");
  document.getElementById("openStoryMap")?.classList.remove("is-launching");
  document.getElementById("openInfiniteRaid")?.classList.remove("is-launching");
  updateStoryCurrentButtonVisibility();
  document.querySelector(".content")?.scrollTo({ top: 0, behavior: "smooth" });
}

function showInfiniteRaid(event) {
  const storyHome = document.getElementById("storyHome");
  const storyMap = document.getElementById("storyMap");
  const raidScreen = document.getElementById("raidScreen");
  const trigger = event?.currentTarget || document.getElementById("openInfiniteRaid");
  if (!storyHome || !raidScreen) return;

  clearTimeout(storyLaunchTimer);
  clearTimeout(storyReadyTimer);
  setStoryLaunchOrigin(trigger);
  trigger?.classList.add("is-launching");
  document.body.classList.add("story-launching");

  storyLaunchTimer = setTimeout(() => {
    renderInfiniteRaid();
    document.body.classList.remove("story-map-open");
    document.body.classList.add("raid-mode-open");
    storyHome.hidden = true;
    if (storyMap) storyMap.hidden = true;
    raidScreen.hidden = false;
    raidScreen.classList.add("is-entering");
    document.querySelector(".content")?.scrollTo({ top: 0, behavior: "auto" });

    storyReadyTimer = setTimeout(() => {
      raidScreen.classList.remove("is-entering");
      document.body.classList.remove("story-launching");
      trigger?.classList.remove("is-launching");
    }, 720);
  }, 260);
}

function startRaidRun() {
  const challenge = RAID_CHALLENGES.find((entry) => entry.id === state.activeRaidChallenge) || RAID_CHALLENGES[0];
  PoseTrainer.start({
    ...challenge,
    title: `${challenge.title} · Floor ${state.raidFloor}`,
    baseXp: 0,
    difficultyLabel: getRaidThreat().label,
    impactLevel: "Movement",
    spaceRequired: "Camera"
  });
  showToast(`${challenge.title.toUpperCase()} READY.`);
}

function advanceRaidFloor() {
  state.raidFloor = Math.max(1, Number(state.raidFloor) || 1) + 1;
  renderInfiniteRaid();
  showToast(`CLEARED FLOOR ${state.raidFloor - 1}. NEXT FLOOR ${state.raidFloor}.`);
}

function renderShopTabs() {
  const cats = ["All", "Sword", "Armor", "Shoes", "Gloves", "Boost"];
  document.getElementById("shopTabs").innerHTML = cats.map(cat =>
    `<button class="tab ${state.activeShop === cat ? "active" : ""}" data-cat="${cat}">${cat}</button>`
  ).join("");
}

function renderShop() {
  renderShopTabs();
  const list = state.activeShop === "All" ? items : items.filter(item => item.category === state.activeShop);
  document.getElementById("shopGrid").innerHTML = list.map(item => `
    <article class="item-card">
      <div class="item-art">${item.icon}</div>
      <div class="item-name">${item.name}</div>
      <div class="item-stat">${item.stat}</div>
      <div class="item-foot">
        <span class="price">${storyIcons.coin} ${item.price}</span>
        <button class="btn-buy" data-buy="${item.id}" ${state.coins < item.price ? "disabled" : ""}>
          ${state.owned[item.id] ? `BUY (${state.owned[item.id]})` : "BUY"}
        </button>
      </div>
    </article>
  `).join("");
}

function buyItem(id) {
  const item = items.find(entry => entry.id === id);
  if (!item || state.coins < item.price) return;
  state.coins -= item.price;
  state.owned[id] = (state.owned[id] || 0) + 1;
  updateCoins();
  renderShop();
  renderInventory();
  showToast(`PURCHASED: ${item.name}`);
}

function allInventory() {
  const bought = Object.entries(state.owned).flatMap(([id, count]) => {
    const item = items.find(entry => entry.id === Number(id));
    if (!item || item.type === "Boost") return [];
    return Array.from({ length: count }, (_, index) => ({ ...item, invId: `${id}-${index}` }));
  });
  return [...starterInventory.map(item => ({ ...item, invId: `starter-${item.id}` })), ...bought];
}

function renderInventory() {
  const inventory = allInventory();
  const cells = Array.from({ length: 16 }, (_, index) => inventory[index] || null);
  document.getElementById("inventoryGrid").innerHTML = cells.map((item) => {
    if (!item) return `<button class="inv-cell empty" aria-label="Empty slot"></button>`;
    const selected = state.selectedInv === item.invId ? " selected" : "";
    return `<button class="inv-cell${selected}" data-inv="${item.invId}" aria-label="${item.name}">${item.icon}</button>`;
  }).join("");
}

function equipItem(invId) {
  const item = allInventory().find(entry => entry.invId === invId);
  if (!item) return;
  state.selectedInv = invId;
  state.equipped[item.type] = item.name;
  document.querySelectorAll(".slot").forEach(slot => {
    const type = slot.dataset.slot;
    const name = state.equipped[type];
    slot.classList.toggle("equipped", Boolean(name));
    slot.querySelector("span").textContent = name || "ว่าง";
  });
  renderInventory();
  showToast(`EQUIPPED: ${item.name}`);
}

function renderMonsterOrb(quest) {
  if (quest.id === "slime_patrol_jumping_jack" || (quest.monsterClass === "slime" && /slime patrol/i.test(quest.title || ""))) {
    return '<img class="monster-orb-image" src="assets/slime-patrol.png" alt="" />';
  }

  return `<span>${quest.title.split(" ").map((word) => word[0]).join("").slice(0, 2)}</span>`;
}

function renderQuests() {
  document.getElementById("questList").innerHTML = quests.map(quest => `
    <article class="quest-card" data-difficulty="${(quest.difficultyLabel || "quest").toLowerCase()}">
      <div class="monster-pick">
        <div class="monster-orb ${quest.monsterClass || "monster"}" aria-hidden="true">
          ${renderMonsterOrb(quest)}
        </div>
        <div class="monster-info">
          <span class="badge">${quest.tag}</span>
          <h2>${quest.title}</h2>
        </div>
        <span class="badge exp">${quest.reward}</span>
      </div>
      <div class="quest-meta">
        <span>${quest.difficultyLabel || "Monster"}</span>
        <span>${quest.cameraAngle || "Camera"}</span>
        <span>${quest.impactLevel || "Impact"}</span>
        <span>${quest.spaceRequired || "Space"}</span>
      </div>
      ${quest.ddaCopy ? `<p class="sub" style="margin:0 0 10px 0;">${quest.ddaCopy}</p>` : ""}
      <div class="monster-objective">
        ${quest.steps.map(step => `<div class="step"><strong>${step[0]}</strong><span>${step[1]}</span></div>`).join("")}
      </div>
      <button class="btn btn-primary" data-quest="${quest.id}">HUNT MONSTER</button>
    </article>
  `).join("");
}

function formatQuestDuration(seconds) {
  if (!seconds) return "";
  const minutes = Math.round(seconds / 60);
  return minutes >= 1 ? `${minutes} นาที` : `${seconds} วินาที`;
}

function formatExerciseName(value) {
  return String(value || "exercise")
    .split("_")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function formatDifficultyLabel(questType, difficulty) {
  const label = String(questType || "").toLowerCase();
  if (["easy", "normal", "hard"].includes(label)) {
    return label.charAt(0).toUpperCase() + label.slice(1);
  }
  if (Number(difficulty) >= 3) return "Hard";
  if (Number(difficulty) >= 2) return "Normal";
  return "Easy";
}

function getMonsterClass(quest) {
  const text = `${quest?.id || ""} ${quest?.title || ""} ${quest?.monster_name || ""}`.toLowerCase();
  if (text.includes("bat")) return "bat";
  if (text.includes("rat")) return "rat";
  if (text.includes("crawler")) return "crawler";
  if (text.includes("imp")) return "imp";
  if (text.includes("stone")) return "stone";
  if (text.includes("bug")) return "bug";
  if (text.includes("turtle")) return "turtle";
  if (text.includes("slime")) return "slime";
  return "monster";
}

function formatQuestDuration(seconds) {
  if (!seconds) return "";
  const value = Number(seconds) || 0;
  if (value < 60) return `${value} sec`;
  const minutes = Math.round(value / 60);
  return `${minutes} min`;
}

function mapRemoteQuest(quest) {
  const steps = [];
  if (quest.warmup_seconds) steps.push(["Warm-up", formatQuestDuration(quest.warmup_seconds)]);
  if (quest.adjusted_target_reps) steps.push([quest.exercise_type, `${quest.adjusted_target_reps} ครั้ง`]);
  if (quest.adjusted_target_seconds) steps.push([quest.exercise_type, formatQuestDuration(quest.adjusted_target_seconds)]);
  if (quest.cooldown_seconds) steps.push(["Cool-down", formatQuestDuration(quest.cooldown_seconds)]);

  const adjustment = Number(quest.adjustment_percent || 0);
  const sign = adjustment > 0 ? "+" : "";
  const ddaCopy = quest.based_on_sessions >= 3
    ? `DDA ${sign}${adjustment}% จาก 3 ครั้งล่าสุด`
    : `DDA เริ่มปรับหลังครบ 3 session (${quest.based_on_sessions}/3)`;

  return {
    id: quest.id,
    title: quest.title,
    tag: `${quest.quest_type || "quest"}`.toUpperCase() + " QUEST",
    reward: `+${quest.base_xp} EXP`,
    steps,
    targetReps: quest.adjusted_target_reps || 0,
    targetSeconds: quest.adjusted_target_seconds || 0,
    ddaCopy,
  };
}

function mapRemoteQuest(quest) {
  const steps = [];
  const exerciseName = formatExerciseName(quest.exercise_type);
  if (quest.warmup_seconds) steps.push(["Warm-up", formatQuestDuration(quest.warmup_seconds)]);
  if (quest.adjusted_target_reps) steps.push([exerciseName, `${quest.adjusted_target_reps} reps`]);
  if (quest.adjusted_target_seconds) steps.push([exerciseName, formatQuestDuration(quest.adjusted_target_seconds)]);
  if (quest.camera_angle) steps.push(["Camera", quest.camera_angle]);
  if (quest.cooldown_seconds) steps.push(["Cool-down", formatQuestDuration(quest.cooldown_seconds)]);

  const adjustment = Number(quest.adjustment_percent || 0);
  const sign = adjustment > 0 ? "+" : "";
  const ddaCopy = quest.based_on_sessions >= 3
    ? `DDA ${sign}${adjustment}% from recent ${exerciseName} sessions`
    : `DDA starts after 3 ${exerciseName} sessions (${quest.based_on_sessions}/3)`;

  return {
    id: quest.id,
    title: quest.monster_name || quest.title,
    tag: `${quest.quest_type || "monster"}`.toUpperCase() + " MONSTER",
    reward: `+${quest.base_xp} EXP`,
    steps,
    exerciseType: quest.exercise_type,
    targetReps: quest.adjusted_target_reps || 0,
    targetSeconds: quest.adjusted_target_seconds || 0,
    difficultyLabel: formatDifficultyLabel(quest.quest_type, quest.difficulty),
    cameraAngle: quest.camera_angle,
    impactLevel: quest.impact_level,
    spaceRequired: quest.space_required,
    baseXp: quest.base_xp,
    monsterClass: getMonsterClass(quest),
    ddaCopy,
  };
}

async function loadAdjustedQuests() {
  const authClient = window.fitQuestAuth?.client;
  const isSignedIn = Boolean(window.fitQuestAuth?.currentUserId);
  if (!authClient || !isSignedIn) {
    quests = cloneMonsterQuests();
    renderQuests();
    return;
  }

  const { data, error } = await authClient.rpc("get_adjusted_quests");
  if (error || !data) {
    quests = cloneMonsterQuests();
    renderQuests();
    return;
  }

  const remoteQuests = data.map(mapRemoteQuest);
  const hasMonsterQuestData = remoteQuests.some((quest) => MONSTER_QUEST_IDS.has(quest.id));
  quests = hasMonsterQuestData ? remoteQuests.filter((quest) => MONSTER_QUEST_IDS.has(quest.id)) : cloneMonsterQuests();
  renderQuests();
}

// ── Event Listeners ──
document.querySelector(".bottom-nav").addEventListener("click", event => {
  const btn = event.target.closest(".nav");
  if (btn) setView(btn.dataset.view);
});

document.getElementById("openStoryMap")?.addEventListener("click", showStoryMap);
document.getElementById("backStoryHome")?.addEventListener("click", showStoryHome);
document.getElementById("openInfiniteRaid")?.addEventListener("click", showInfiniteRaid);
document.getElementById("backRaidHome")?.addEventListener("click", showStoryHome);
document.getElementById("startRaidRun")?.addEventListener("click", startRaidRun);
document.getElementById("raidNextFloor")?.addEventListener("click", advanceRaidFloor);
document.getElementById("raidChallengeList")?.addEventListener("click", event => {
  const button = event.target.closest("[data-raid-challenge]");
  if (!button) return;
  state.activeRaidChallenge = button.dataset.raidChallenge;
  renderRaidChallenges();
});
document.querySelector(".story-current-button")?.addEventListener("click", () => {
  scrollToCurrentStoryLevel();
  showToast(`STORY STAGE ${getCurrentStoryLevel()} READY.`);
});

document.getElementById("storyStageLayer")?.addEventListener("click", event => {
  const stage = event.target.closest("[data-story-level]");
  if (!stage || stage.disabled) return;
  showToast(`STORY STAGE ${stage.dataset.storyLevel} READY.`);
});

document.querySelector(".content")?.addEventListener("scroll", () => {
  requestAnimationFrame(updateStoryCurrentButtonVisibility);
}, { passive: true });

document.getElementById("shopTabs").addEventListener("click", event => {
  const btn = event.target.closest(".tab");
  if (btn) {
    state.activeShop = btn.dataset.cat;
    renderShop();
    document.querySelector(`.tab[data-cat="${state.activeShop}"]`)?.scrollIntoView({
      behavior: "smooth",
      inline: "center",
      block: "nearest"
    });
  }
});

document.getElementById("shopGrid").addEventListener("click", event => {
  const btn = event.target.closest("[data-buy]");
  if (btn) buyItem(Number(btn.dataset.buy));
});

document.getElementById("inventoryGrid").addEventListener("click", event => {
  const cell = event.target.closest("[data-inv]");
  if (cell) equipItem(cell.dataset.inv);
});

document.getElementById("questList").addEventListener("click", event => {
  const btn = event.target.closest("[data-quest]");
  if (!btn) return;
  const quest = quests.find(entry => entry.id === btn.dataset.quest);
  if (quest) PoseTrainer.start(quest);
});

document.getElementById("poseCloseButton")?.addEventListener("click", PoseTrainer.stopCamera);
document.getElementById("poseFinishButton")?.addEventListener("click", PoseTrainer.finish);

document.querySelector(".theme-toggle").addEventListener("click", event => {
  const btn = event.target.closest("[data-theme-choice]");
  if (btn) setTheme(btn.dataset.themeChoice);
});

document.getElementById("glassTransparency")?.addEventListener("input", event => {
  setGlassTransparency(event.target.value);
});

document.getElementById("statusGrid")?.addEventListener("click", event => {
  const btn = event.target.closest("[data-upgrade-stat]");
  if (btn) upgradeStat(btn.dataset.upgradeStat);
});

document.getElementById("profileTrigger")?.addEventListener("click", openProfileSheet);
document.getElementById("settingsProfileButton")?.addEventListener("click", openProfileSheet);
document.getElementById("profileSheetClose")?.addEventListener("click", closeProfileSheet);
document.getElementById("profileCloseButton")?.addEventListener("click", closeProfileSheet);
document.addEventListener("keydown", event => {
  if (event.key === "Escape") closeProfileSheet();
});

document.querySelectorAll(".ios-switch").forEach(btn => {
  btn.addEventListener("click", () => btn.classList.toggle("on"));
});

// ── Boot ──
document.addEventListener('DOMContentLoaded', () => {
  initTheme();
  Transitions.initLoading();
  RippleEffect.init();
  CardTilt.init();

  updateCoins();
  updateLevelDisplay();
  renderStatusStats();
  renderStoryMap();
  renderInfiniteRaid();
  renderShop();
  renderInventory();
  renderQuests();
});

// Fallback
if (document.readyState !== 'loading') {
  initTheme();
  Transitions.initLoading();
  RippleEffect.init();
  CardTilt.init();
  updateCoins();
  updateLevelDisplay();
  renderStatusStats();
  renderStoryMap();
  renderInfiniteRaid();
  renderShop();
  renderInventory();
  renderQuests();
}
