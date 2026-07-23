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
      const btn = e.target.closest('.btn, .btn-buy, .nav, .tab');
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
      const cards = document.querySelectorAll('.glass-card, .item-card, .quest-card');
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
          card.style.transform = `perspective(800px) rotateX(${tiltX}deg) rotateY(${tiltY}deg) translateY(-2px)`;
        }
      });
    }, { passive: true });

    document.addEventListener('mouseleave', () => {
      document.querySelectorAll('.glass-card, .item-card, .quest-card').forEach(card => card.style.transform = '');
    }, { passive: true });

    document.addEventListener('mousemove', resetDistantCards, { passive: true });
  }

  let resetTimer;
  function resetDistantCards(e) {
    clearTimeout(resetTimer);
    resetTimer = setTimeout(() => {
      document.querySelectorAll('.glass-card, .item-card, .quest-card').forEach(card => {
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

const state = { coins: 9999, activeShop: "All", owned: {}, equipped: {}, selectedInv: null };

function setTheme(theme) {
  const nextTheme = theme === "light" ? "light" : "dark";
  document.body.dataset.theme = nextTheme;
  localStorage.setItem("fitQuestTheme", nextTheme);
  document.querySelector('meta[name="theme-color"]')?.setAttribute("content", nextTheme === "light" ? "#edf3f7" : "#000000");
  document.querySelectorAll("[data-theme-choice]").forEach(btn => {
    const active = btn.dataset.themeChoice === nextTheme;
    btn.classList.toggle("active", active);
    btn.setAttribute("aria-pressed", String(active));
  });
}

function initTheme() {
  setTheme(localStorage.getItem("fitQuestTheme") || "dark");
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
  { id: 4, name: "Flash Shoes",  type: "Shoes",  category: "Shoes",  stat: "+12 SPD",  price: 650,  icon: icons.shoes },
  { id: 5, name: "Power Gloves", type: "Gloves", category: "Gloves", stat: "+8 GRIP",  price: 420,  icon: icons.gloves }
];

const starterInventory = [
  { id: 101, name: "Wood Sword",    type: "Weapon", icon: icons.sword },
  { id: 102, name: "Trainee Armor", type: "Armor",  icon: icons.armor }
];

const quests = [
  { id: "pushup", title: "Push-up Starter", tag: "MAIN QUEST", reward: "+220 EXP", steps: [["Warm-up", "5 นาที"], ["Push-up", "20 นาที"]] },
  { id: "squat",  title: "50 Squats",       tag: "SIDE QUEST", reward: "+120 EXP", steps: [["Squat", "50 ครั้ง"], ["Rest", "3 นาที"]] }
];

const coinCount = document.getElementById("coinCount");
const toast = document.getElementById("toast");

function showToast(message) {
  toast.textContent = message;
  toast.classList.add("show");
  clearTimeout(showToast.timer);
  showToast.timer = setTimeout(() => toast.classList.remove("show"), 2500);
}

function updateCoins() { coinCount.textContent = state.coins.toLocaleString(); }

function setView(view) {
  document.querySelectorAll(".view").forEach(el => {
    el.classList.toggle("active", el.id === `view-${view}`);
  });
  document.querySelectorAll(".nav").forEach(btn => btn.classList.toggle("active", btn.dataset.view === view));
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
        <span class="price">💰 ${item.price}</span>
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

function renderQuests() {
  document.getElementById("questList").innerHTML = quests.map(quest => `
    <article class="quest-card">
      <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:12px;">
        <div>
          <span class="badge">${quest.tag}</span>
          <h2 style="margin:6px 0 0 0;">${quest.title}</h2>
        </div>
        <span class="badge exp">${quest.reward}</span>
      </div>
      <div>
        ${quest.steps.map(step => `<div class="step"><strong>${step[0]}</strong><span>${step[1]}</span></div>`).join("")}
      </div>
      <button class="btn btn-primary" data-quest="${quest.id}">START MISSION</button>
    </article>
  `).join("");
}

// ── Event Listeners ──
document.querySelector(".bottom-nav").addEventListener("click", event => {
  const btn = event.target.closest(".nav");
  if (btn) setView(btn.dataset.view);
});

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
  btn.textContent = "IN PROGRESS...";
  btn.disabled = true;
  setTimeout(() => {
    btn.textContent = "MISSION CLEARED";
    state.coins += 100;
    updateCoins();
    showToast("REWARD +100 COINS");
  }, 1000);
});

document.querySelector(".theme-toggle").addEventListener("click", event => {
  const btn = event.target.closest("[data-theme-choice]");
  if (btn) setTheme(btn.dataset.themeChoice);
});

document.querySelectorAll(".ios-switch").forEach(btn => {
  btn.addEventListener("click", () => btn.classList.toggle("on"));
});

// ── Boot ──
document.addEventListener('DOMContentLoaded', () => {
  initTheme();
  Transitions.initLoading();
  AmbientBackground.init();
  RippleEffect.init();
  CardTilt.init();

  updateCoins();
  renderShop();
  renderInventory();
  renderQuests();
});

// Fallback
if (document.readyState !== 'loading') {
  initTheme();
  Transitions.initLoading();
  AmbientBackground.init();
  RippleEffect.init();
  CardTilt.init();
  updateCoins();
  renderShop();
  renderInventory();
  renderQuests();
}
