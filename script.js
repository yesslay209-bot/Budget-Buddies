(function () {
  "use strict";

  const STORAGE_KEY = "pocket-bloom-state-v1";
  const MAX_TRANSACTION_AMOUNT = 10000;
  const MAX_GOAL_AMOUNT = 100000;
  const CARE_WINDOW_DAYS = 7;
  const CARE_WARNING_DAYS = 3;
  const currency = new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
  const shortDate = new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric" });
  const fullDate = new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", year: "numeric" });
  const longDate = new Intl.DateTimeFormat("en-US", { weekday: "long", month: "long", day: "numeric" });

  const $ = (selector) => document.querySelector(selector);
  const $$ = (selector) => Array.from(document.querySelectorAll(selector));

  let entryType = "in";
  let toastTimer;
  let recoveredOversizedData = false;
  let state = loadState();

  function localDateToISO(date) {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, "0");
    const day = String(date.getDate()).padStart(2, "0");
    return `${year}-${month}-${day}`;
  }

  function todayISO() {
    return localDateToISO(new Date());
  }

  function dateFromISO(value) {
    const parts = String(value).split("-").map(Number);
    if (parts.length !== 3 || parts.some((part) => !Number.isFinite(part))) return new Date(NaN);
    return new Date(parts[0], parts[1] - 1, parts[2]);
  }

  function offsetDateISO(days) {
    const date = new Date();
    date.setHours(12, 0, 0, 0);
    date.setDate(date.getDate() + days);
    return localDateToISO(date);
  }

  function createId() {
    if (window.crypto && typeof window.crypto.randomUUID === "function") return window.crypto.randomUUID();
    return `${Date.now()}-${Math.random().toString(16).slice(2)}`;
  }

  function createDefaultState() {
    return {
      goal: {
        name: "Pokémon booster box",
        target: 60,
        deadline: offsetDateISO(28),
        createdAt: todayISO(),
      },
      transactions: [
        { id: createId(), name: "Chores", amount: 10, date: offsetDateISO(-28) },
        { id: createId(), name: "Chores", amount: 10, date: offsetDateISO(-21) },
        { id: createId(), name: "Slushie", amount: -4.5, date: offsetDateISO(-18) },
        { id: createId(), name: "Chores", amount: 10, date: offsetDateISO(-14) },
        { id: createId(), name: "Robux", amount: -3, date: offsetDateISO(-9) },
        { id: createId(), name: "Chores", amount: 10, date: offsetDateISO(-7) },
        { id: createId(), name: "Chores", amount: 10, date: offsetDateISO(-1) },
      ],
    };
  }

  function normalizeState(value) {
    const fallback = createDefaultState();
    if (!value || typeof value !== "object") return fallback;

    const rawGoal = value.goal && typeof value.goal === "object" ? value.goal : {};
    const target = Number(rawGoal.target);
    const transactionDates = Array.isArray(value.transactions)
      ? value.transactions
          .map((transaction) => (transaction && typeof transaction.date === "string" ? transaction.date : ""))
          .filter((date) => date && !Number.isNaN(dateFromISO(date).getTime()))
          .sort()
      : [];
    const goal = {
      name: typeof rawGoal.name === "string" && rawGoal.name.trim() ? rawGoal.name.trim() : fallback.goal.name,
      target: Number.isFinite(target) && target > 0 && target <= MAX_GOAL_AMOUNT ? target : fallback.goal.target,
      deadline: typeof rawGoal.deadline === "string" && !Number.isNaN(dateFromISO(rawGoal.deadline).getTime()) ? rawGoal.deadline : fallback.goal.deadline,
      createdAt: typeof rawGoal.createdAt === "string" && !Number.isNaN(dateFromISO(rawGoal.createdAt).getTime()) ? rawGoal.createdAt : (transactionDates[0] || fallback.goal.createdAt),
    };

    const transactions = Array.isArray(value.transactions)
      ? value.transactions
          .map((transaction) => ({
            id: typeof transaction.id === "string" ? transaction.id : createId(),
            name: typeof transaction.name === "string" ? transaction.name.trim() : "",
            amount: Number(transaction.amount),
            date: typeof transaction.date === "string" ? transaction.date : todayISO(),
          }))
          .filter((transaction) => transaction.name && Number.isFinite(transaction.amount) && transaction.amount !== 0 && Math.abs(transaction.amount) <= MAX_TRANSACTION_AMOUNT && !Number.isNaN(dateFromISO(transaction.date).getTime()))
      : fallback.transactions;

    return { goal, transactions };
  }

  function loadState() {
    try {
      const saved = window.localStorage.getItem(STORAGE_KEY);
      if (saved) {
        const parsed = JSON.parse(saved);
        const rawGoal = parsed && parsed.goal && typeof parsed.goal === "object" ? parsed.goal : {};
        const rawTransactions = parsed && Array.isArray(parsed.transactions) ? parsed.transactions : [];
        const oversizedGoal = Number.isFinite(Number(rawGoal.target)) && Number(rawGoal.target) > MAX_GOAL_AMOUNT;
        const oversizedTransaction = rawTransactions.some((transaction) => {
          const amount = Number(transaction && transaction.amount);
          return Number.isFinite(amount) && Math.abs(amount) > MAX_TRANSACTION_AMOUNT;
        });

        if (oversizedGoal || oversizedTransaction) {
          const recoveredState = createDefaultState();
          window.localStorage.setItem(STORAGE_KEY, JSON.stringify(recoveredState));
          recoveredOversizedData = true;
          return recoveredState;
        }

        const normalizedState = normalizeState(parsed);
        window.localStorage.setItem(STORAGE_KEY, JSON.stringify(normalizedState));
        return normalizedState;
      }
      const initialState = createDefaultState();
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(initialState));
      return initialState;
    } catch (error) {
      return createDefaultState();
    }
  }

  function saveState() {
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    } catch (error) {
      showToast("This browser could not save the latest change.");
    }
  }

  function setText(selector, value) {
    const element = $(selector);
    if (element) element.textContent = value;
  }

  function formatMoney(amount) {
    return currency.format(Math.abs(Number(amount) || 0));
  }

  function formatBalance(amount) {
    return currency.format(Number(amount) || 0);
  }

  function formatSignedMoney(amount) {
    return `${amount >= 0 ? "+" : "-"}${formatMoney(amount)}`;
  }

  function formatActivityDate(value) {
    const date = dateFromISO(value);
    if (Number.isNaN(date.getTime())) return "Unknown date";
    const today = dateFromISO(todayISO());
    const difference = Math.round((today - date) / 86400000);
    if (difference === 0) return "Today";
    if (difference === 1) return "Yesterday";
    return shortDate.format(date);
  }

  function formatGoalDate(value) {
    const date = dateFromISO(value);
    return Number.isNaN(date.getTime()) ? "Not set" : fullDate.format(date);
  }

  function daysUntil(value) {
    const deadline = dateFromISO(value);
    const today = dateFromISO(todayISO());
    if (Number.isNaN(deadline.getTime())) return null;
    return Math.round((deadline - today) / 86400000);
  }

  function getSavingCare() {
    const moneyInDates = state.transactions
      .filter((transaction) => transaction.amount > 0)
      .map((transaction) => transaction.date)
      .filter((date) => !Number.isNaN(dateFromISO(date).getTime()))
      .sort();
    const lastMoneyIn = moneyInDates[moneyInDates.length - 1] || state.goal.createdAt || todayISO();
    const elapsed = Math.round((dateFromISO(todayISO()) - dateFromISO(lastMoneyIn)) / 86400000);
    const daysSinceSaving = Math.max(0, Number.isFinite(elapsed) ? elapsed : 0);

    return {
      daysSinceSaving,
      daysUntilLoss: CARE_WINDOW_DAYS - daysSinceSaving,
      warning: daysSinceSaving >= CARE_WINDOW_DAYS - CARE_WARNING_DAYS && daysSinceSaving < CARE_WINDOW_DAYS,
      lost: daysSinceSaving >= CARE_WINDOW_DAYS,
    };
  }

  function escapeHTML(value) {
    return String(value).replace(/[&<>'"]/g, (character) => ({
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      "'": "&#39;",
      '"': "&quot;",
    }[character]));
  }

  function getTotals() {
    const saved = state.transactions.reduce((total, transaction) => total + transaction.amount, 0);
    const monthKey = todayISO().slice(0, 7);
    const monthTransactions = state.transactions.filter((transaction) => transaction.date.slice(0, 7) === monthKey);
    const monthIn = monthTransactions.reduce((total, transaction) => total + (transaction.amount > 0 ? transaction.amount : 0), 0);
    const monthOut = monthTransactions.reduce((total, transaction) => total + (transaction.amount < 0 ? Math.abs(transaction.amount) : 0), 0);
    return { saved, monthIn, monthOut };
  }

  function getStage(progress) {
    if (progress >= 1) return 4;
    if (progress >= 0.76) return 3;
    if (progress >= 0.46) return 2;
    if (progress >= 0.13) return 1;
    return 0;
  }

  function renderCareAlert(care, goalReached) {
    const alert = $("#care-alert");
    const shouldShow = !goalReached && (care.warning || care.lost);
    alert.hidden = !shouldShow;
    alert.classList.toggle("warning", shouldShow && !care.lost);
    alert.classList.toggle("loss", shouldShow && care.lost);

    if (!shouldShow) return;

    if (care.lost) {
      setText("#care-alert-title", "A leaf has fallen.");
      setText("#care-alert-copy", "Your buddy missed a saving week. Add money in to help it perk back up.");
      setText("#care-countdown", "Needs care");
      return;
    }

    const days = care.daysUntilLoss;
    setText("#care-alert-title", "Your buddy needs a little water.");
    setText("#care-alert-copy", `Save something in the next ${days} ${days === 1 ? "day" : "days"} or one leaf will fall.`);
    setText("#care-countdown", `${days} ${days === 1 ? "day" : "days"}`);
  }

  function renderGoal() {
    const { goal } = state;
    const { saved } = getTotals();
    const progress = goal.target > 0 ? saved / goal.target : 0;
    const percent = Math.max(0, Math.round(progress * 100));
    const boundedPercent = Math.min(100, Math.max(0, percent));
    const remaining = Math.max(0, goal.target - saved);
    const days = daysUntil(goal.deadline);
    const scene = $("#companion-scene");
    const stage = getStage(progress);
    const care = getSavingCare();
    const goalReached = progress >= 1;
    const stageCopy = [
      { label: "Seedling", title: "Your little buddy is waiting.", copy: "Every saved dollar gives it a little more room to grow." },
      { label: "Sprout", title: "A tiny buddy is peeking out.", copy: "Your first little wins are already making a difference." },
      { label: "Growing", title: "Your buddy is stretching up.", copy: "Keep going. Those small choices are adding up beautifully." },
      { label: "Blooming", title: "Your buddy is almost blooming.", copy: "Just a few more thoughtful choices and you will see the bloom." },
      { label: "Full bloom", title: "Your buddy made it grow!", copy: "Your goal is ready. Time to celebrate the thing you saved for." },
    ][stage];

    setText("#goal-name", goal.name);
    setText("#goal-saved", formatBalance(saved));
    setText("#goal-target", formatMoney(goal.target));
    setText("#goal-percent", `${boundedPercent}% grown`);
    setText("#goal-remaining", progress >= 1 ? "Goal reached" : `${formatMoney(remaining)} to go`);
    setText("#goal-date", formatGoalDate(goal.deadline));
    setText("#companion-progress", `${boundedPercent}%`);
    setText("#stage-label", stageCopy.label);
    setText("#companion-title", care.lost && !goalReached ? "Your buddy needs a little care." : stageCopy.title);
    setText("#companion-copy", care.lost && !goalReached ? "One leaf fell while it waited for your next saving win." : stageCopy.copy);
    $("#progress-fill").style.width = `${boundedPercent}%`;
    $("#progress-fill").setAttribute("aria-valuenow", String(boundedPercent));
    $("#progress-fill").setAttribute("aria-valuemax", "100");
    $("#progress-fill").setAttribute("role", "progressbar");

    scene.classList.remove("stage-0", "stage-1", "stage-2", "stage-3", "stage-4");
    scene.classList.add(`stage-${stage}`);
    scene.classList.toggle("needs-care", care.lost && !goalReached);
    scene.setAttribute("aria-label", `${stageCopy.label} savings companion, ${boundedPercent}% toward ${goal.name}${care.lost && !goalReached ? ", needs care" : ""}`);
    renderCareAlert(care, goalReached);

    const status = $("#goal-status");
    status.classList.remove("complete", "overdue");
    if (progress >= 1) {
      status.classList.add("complete");
      setText("#goal-status-text", "Goal reached");
      setText("#goal-days", "Ready!");
    } else if (days !== null && days < 0) {
      status.classList.add("overdue");
      setText("#goal-status-text", "Past due");
      setText("#goal-days", "Past due");
    } else {
      setText("#goal-status-text", "On track");
      setText("#goal-days", days === 0 ? "Due today" : `${days} ${days === 1 ? "day" : "days"}`);
    }
  }

  function renderStats() {
    const { saved, monthIn, monthOut } = getTotals();
    setText("#stat-saved", formatBalance(saved));
    setText("#stat-month-in", formatMoney(monthIn));
    setText("#stat-month-out", formatMoney(monthOut));
    setText("#nav-count", String(state.transactions.length));
  }

  function renderActivity() {
    const list = $("#activity-list");
    const empty = $("#activity-empty");
    const sorted = [...state.transactions].sort((a, b) => {
      const dateDifference = dateFromISO(b.date) - dateFromISO(a.date);
      return dateDifference || state.transactions.indexOf(b) - state.transactions.indexOf(a);
    });

    setText("#activity-count", `${state.transactions.length} ${state.transactions.length === 1 ? "entry" : "entries"}`);
    if (!sorted.length) {
      list.innerHTML = "";
      empty.hidden = false;
      return;
    }

    empty.hidden = true;
    list.innerHTML = sorted.map((transaction) => {
      const isIn = transaction.amount > 0;
      const typeClass = isIn ? "money-in" : "money-out";
      const icon = isIn ? "icon-arrow-in" : "icon-arrow-out";
      return `<div class="activity-row">
        <span class="activity-icon ${typeClass}"><svg class="icon"><use href="#${icon}"></use></svg></span>
        <span class="activity-details"><strong>${escapeHTML(transaction.name)}</strong><span>${isIn ? "Money in" : "Money out"} / ${escapeHTML(formatActivityDate(transaction.date))}</span></span>
        <span class="activity-amount ${typeClass}">${escapeHTML(formatSignedMoney(transaction.amount))}</span>
        <button class="delete-entry" type="button" data-delete-id="${escapeHTML(transaction.id)}" aria-label="Delete ${escapeHTML(transaction.name)} entry"><svg class="icon"><use href="#icon-trash"></use></svg></button>
      </div>`;
    }).join("");
  }

  function render() {
    renderGoal();
    renderStats();
    renderActivity();
    setText("#topbar-date", longDate.format(new Date()));
  }

  function showToast(message) {
    const toast = $("#toast");
    setText("#toast-message", message);
    toast.hidden = false;
    window.clearTimeout(toastTimer);
    toastTimer = window.setTimeout(() => {
      toast.hidden = true;
    }, 2800);
  }

  function setEntryType(type) {
    entryType = type;
    $$('[data-entry-type]').forEach((button) => {
      const active = button.dataset.entryType === type;
      button.classList.toggle("active", active);
      button.setAttribute("aria-pressed", String(active));
    });
    setText("#entry-submit-label", type === "in" ? "Add money in" : "Add money out");
  }

  function openGoalModal() {
    $("#goal-name-input").value = state.goal.name;
    $("#goal-amount-input").value = state.goal.target;
    $("#goal-deadline-input").value = state.goal.deadline;
    $("#goal-error").textContent = "";
    $("#goal-modal").hidden = false;
    document.body.classList.add("modal-open");
    window.setTimeout(() => $("#goal-name-input").focus(), 0);
  }

  function closeGoalModal() {
    $("#goal-modal").hidden = true;
    document.body.classList.remove("modal-open");
  }

  function openSidebar() {
    $("#sidebar").classList.add("is-open");
    $("#sidebar-overlay").hidden = false;
    $("#menu-toggle").setAttribute("aria-expanded", "true");
  }

  function closeSidebar() {
    $("#sidebar").classList.remove("is-open");
    $("#sidebar-overlay").hidden = true;
    $("#menu-toggle").setAttribute("aria-expanded", "false");
  }

  function setEntryError(message) {
    $("#entry-error").textContent = message;
  }

  function setGoalError(message) {
    $("#goal-error").textContent = message;
  }

  $("#entry-date").value = todayISO();
  render();
  if (recoveredOversizedData) {
    showToast("We reset oversized test data to the example budget.");
  }

  $$('[data-entry-type]').forEach((button) => {
    button.addEventListener("click", () => setEntryType(button.dataset.entryType));
  });

  $("#entry-form").addEventListener("submit", (event) => {
    event.preventDefault();
    const name = $("#entry-name").value.trim();
    const amount = Number($("#entry-amount").value);
    const date = $("#entry-date").value;

    if (!name) {
      setEntryError("Give this entry a name so you can find it later.");
      $("#entry-name").focus();
      return;
    }
    if (!Number.isFinite(amount) || amount <= 0) {
      setEntryError("Enter an amount greater than $0.");
      $("#entry-amount").focus();
      return;
    }
    if (amount > MAX_TRANSACTION_AMOUNT) {
      setEntryError("Keep each entry under $10,000 so your trail stays tidy.");
      $("#entry-amount").focus();
      return;
    }
    if (!date || Number.isNaN(dateFromISO(date).getTime())) {
      setEntryError("Choose a date for this entry.");
      $("#entry-date").focus();
      return;
    }

    const addedType = entryType;
    state.transactions.push({ id: createId(), name, amount: addedType === "in" ? amount : -amount, date });
    saveState();
    render();
    event.target.reset();
    $("#entry-date").value = todayISO();
    setEntryError("");
    setEntryType("in");
    showToast(addedType === "in" ? "Money in added to your trail." : "Money out added to your trail.");
  });

  $("#goal-form").addEventListener("submit", (event) => {
    event.preventDefault();
    const name = $("#goal-name-input").value.trim();
    const target = Number($("#goal-amount-input").value);
    const deadline = $("#goal-deadline-input").value;

    if (!name) {
      setGoalError("Give your goal a name.");
      $("#goal-name-input").focus();
      return;
    }
    if (!Number.isFinite(target) || target <= 0) {
      setGoalError("Enter a target amount greater than $0.");
      $("#goal-amount-input").focus();
      return;
    }
    if (target > MAX_GOAL_AMOUNT) {
      setGoalError("Keep your goal under $100,000 for now.");
      $("#goal-amount-input").focus();
      return;
    }
    if (!deadline || Number.isNaN(dateFromISO(deadline).getTime())) {
      setGoalError("Choose a target date.");
      $("#goal-deadline-input").focus();
      return;
    }

    state.goal = { name, target, deadline, createdAt: todayISO() };
    saveState();
    render();
    closeGoalModal();
    showToast("Your savings goal has a fresh shape.");
  });

  document.addEventListener("click", (event) => {
    if (event.target.closest("[data-reset-data]")) {
      if (!window.confirm("Reset this device to the example budget? Your current local entries will be removed.")) return;
      state = createDefaultState();
      saveState();
      $("#entry-form").reset();
      $("#entry-date").value = todayISO();
      setEntryType("in");
      setEntryError("");
      render();
      showToast("Your example budget is fresh again.");
      return;
    }

    if (event.target.closest("[data-open-goal]")) {
      openGoalModal();
      closeSidebar();
      return;
    }

    if (event.target.closest("[data-close-modal]") || event.target === $("#goal-modal")) {
      closeGoalModal();
      return;
    }

    const deleteButton = event.target.closest("[data-delete-id]");
    if (deleteButton) {
      const entryId = deleteButton.dataset.deleteId;
      state.transactions = state.transactions.filter((transaction) => transaction.id !== entryId);
      saveState();
      render();
      showToast("Entry removed from your trail.");
    }
  });

  $("#menu-toggle").addEventListener("click", () => {
    if ($("#sidebar").classList.contains("is-open")) closeSidebar();
    else openSidebar();
  });
  $("#sidebar-close").addEventListener("click", closeSidebar);
  $("#sidebar-overlay").addEventListener("click", closeSidebar);

  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape") {
      if (!$("#goal-modal").hidden) closeGoalModal();
      if ($("#sidebar").classList.contains("is-open")) closeSidebar();
    }
  });
})();
