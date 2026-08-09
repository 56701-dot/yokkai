(function () {
  const config = window.FITQUEST_SUPABASE || {};
  const supabaseUrl = config.url || config.projectUrl || "";
  const supabaseKey = config.anonKey || config.publishableKey || "";
  const redirectTo = config.redirectTo || window.location.href.split("#")[0];
  const isConfigured =
    supabaseUrl &&
    supabaseKey &&
    !supabaseUrl.includes("YOUR_SUPABASE") &&
    !supabaseKey.includes("YOUR_SUPABASE");

  const authState = {
    client: null,
    busy: false,
    currentUserId: null,
    mode: "login",
    resetStep: "request",
    resetIdentifier: "",
    passwordRecovery: false,
  };

  window.fitQuestAuth = {
    client: null,
    currentUserId: null,
  };

  function getAuthElements() {
    return {
      identifier: document.getElementById("username-input"),
      signupUsername: document.getElementById("signup-username-input"),
      password: document.getElementById("password-input"),
      confirmPassword: document.getElementById("confirm-password-input"),
      resetIdentifier: document.getElementById("reset-identifier-input"),
      resetCode: document.getElementById("reset-code-input"),
      resetPassword: document.getElementById("reset-password-input"),
      loginButton: document.getElementById("login-btn"),
      registerButton: document.getElementById("register-btn"),
      forgotButton: document.getElementById("forgot-password-btn"),
      resetRequestButton: document.getElementById("reset-request-btn"),
      resetConfirmButton: document.getElementById("reset-confirm-btn"),
      backLoginButton: document.getElementById("back-login-btn"),
      inputGroup: document.querySelector("#login-screen .input-group"),
      modeButtons: document.querySelectorAll(".auth-mode[data-auth-mode]"),
      googleButton:
        document.getElementById("google-login-btn") ||
        Array.from(document.querySelectorAll("#login-screen .btn-glass")).find((button) =>
          button.textContent.trim().toLowerCase().includes("google")
        ),
    };
  }

  function isValidEmail(value) {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim());
  }

  function normalizePhone(value) {
    return value.trim().replace(/[\s-]/g, "");
  }

  function isValidPhone(value) {
    return /^\+[1-9]\d{7,14}$/.test(normalizePhone(value));
  }

  function normalizeUsername(value) {
    return value.trim().toLowerCase();
  }

  function isValidUsername(value) {
    return /^[a-z0-9_]{3,24}$/.test(normalizeUsername(value));
  }

  function displayNameFromUser(user) {
    return (
      user?.user_metadata?.username ||
      user?.user_metadata?.display_name ||
      user?.user_metadata?.full_name ||
      user?.email?.split("@")[0] ||
      "Player"
    );
  }

  function showAuthMessage(message, type = "info") {
    let feedback = document.getElementById("auth-feedback");
    const { inputGroup } = getAuthElements();

    if (!feedback && inputGroup) {
      feedback = document.createElement("p");
      feedback.id = "auth-feedback";
      feedback.className = "auth-feedback";
      feedback.setAttribute("aria-live", "polite");
      inputGroup.insertAdjacentElement("afterend", feedback);
    }

    if (!feedback) return;
    feedback.textContent = message;
    feedback.dataset.type = type;
  }

  function setAuthBusy(isBusy) {
    authState.busy = isBusy;
    const { loginButton, registerButton, googleButton, forgotButton, resetRequestButton, resetConfirmButton, backLoginButton } =
      getAuthElements();

    [loginButton, registerButton, googleButton, forgotButton, resetRequestButton, resetConfirmButton, backLoginButton].forEach((button) => {
      if (button) button.disabled = isBusy;
    });

    if (loginButton) loginButton.textContent = isBusy && authState.mode === "login" ? "Signing in..." : "Continue";
    if (registerButton) {
      registerButton.textContent = isBusy && authState.mode === "register" ? "Creating..." : "Create account";
    }
    if (resetRequestButton) {
      resetRequestButton.textContent = isBusy && authState.mode === "reset" ? "Sending..." : "Send reset link";
    }
    if (resetConfirmButton) {
      resetConfirmButton.textContent = isBusy && authState.mode === "reset" ? "Updating..." : "Update password";
    }
  }

  function updatePlayerName(user) {
    const name = displayNameFromUser(user);
    const roleLabel = user?.user_metadata?.role === "admin" ? "ADMIN" : name.toUpperCase();
    const hello = document.querySelector(".top-meta .hello");
    const profileNames = document.querySelectorAll(".profile-card h2, #profileSheetTitle");

    if (hello) hello.textContent = `WELCOME, ${roleLabel}`;
    profileNames.forEach((profileName) => {
      profileName.textContent = name;
    });
  }

  async function loadProfile(user) {
    if (!authState.client || !user?.id) return;

    const { data, error } = await authState.client
      .from("profiles")
      .select("display_name, username, role, coins, level, xp, stat_points, hp, max_hp, attack, defense")
      .eq("id", user.id)
      .maybeSingle();

    if (error || !data) return;

    updatePlayerName({
      ...user,
      user_metadata: {
        ...user.user_metadata,
        display_name: data.display_name,
        username: data.username,
        role: data.role,
      },
    });

    if (typeof state !== "undefined") {
      state.coins = data.coins;
      state.level = data.level;
      state.xp = data.xp;
      state.statPoints = data.stat_points;
      state.hp = data.hp;
      state.maxHp = data.max_hp;
      state.attack = data.attack;
      state.defense = data.defense;
      updateCoins();
    }

    if (typeof updateLevelDisplay === "function") {
      updateLevelDisplay(data.level, data.xp);
    }

    if (typeof renderStatusStats === "function") {
      renderStatusStats();
    }

    document.querySelectorAll(".profile-card .sub, .profile-panel-head .sub").forEach((profileClass) => {
      profileClass.textContent = data.role === "admin" ? `Level ${data.level} - Admin` : `Level ${data.level} - Warrior`;
    });
  }

  function showApp(user) {
    authState.currentUserId = user?.id || null;
    window.fitQuestAuth.currentUserId = authState.currentUserId;
    updatePlayerName(user);
    loadProfile(user);
    if (typeof loadAdjustedQuests === "function") {
      loadAdjustedQuests();
    }

    Transitions.flash(() => {
      document.getElementById("login-screen")?.classList.remove("active");
      document.getElementById("app-screen")?.classList.add("active");
      showToast("SYSTEM ONLINE. WELCOME.");
    });
  }

  function showLogin(message) {
    authState.currentUserId = null;
    window.fitQuestAuth.currentUserId = null;

    Transitions.flash(() => {
      document.getElementById("app-screen")?.classList.remove("active");
      document.getElementById("login-screen")?.classList.add("active");
      if (message) showAuthMessage(message);
    });
  }

  function requireConfiguredSupabase() {
    if (isConfigured && authState.client) return true;
    showAuthMessage("Add your Supabase URL and anon key in js/supabase-config.js first.", "error");
    return false;
  }

  function readAuthFields() {
    const { identifier, signupUsername, password, confirmPassword, resetIdentifier, resetCode, resetPassword } = getAuthElements();
    return {
      identifier: (identifier?.value || "").trim(),
      signupUsername: (signupUsername?.value || "").trim(),
      password: password?.value || "",
      confirmPassword: confirmPassword?.value || "",
      resetIdentifier: (resetIdentifier?.value || "").trim(),
      resetCode: (resetCode?.value || "").trim(),
      resetPassword: resetPassword?.value || "",
    };
  }

  function validateIdentifierPassword(identifier, password) {
    if (!isValidEmail(identifier) && !isValidUsername(identifier)) {
      showAuthMessage("Use a valid email or username. Username: 3-24 letters, numbers, or underscore.", "error");
      return false;
    }

    if (password.length < 6) {
      showAuthMessage("Password must be at least 6 characters.", "error");
      return false;
    }

    return true;
  }

  function validateSignup(email, username, password, confirmPassword) {
    if (!isValidEmail(email)) {
      showAuthMessage("Please enter a valid email address to create an account.", "error");
      return false;
    }

    if (!isValidUsername(username)) {
      showAuthMessage("Choose a username with 3-24 lowercase letters, numbers, or underscore.", "error");
      return false;
    }

    if (password.length < 6) {
      showAuthMessage("Password must be at least 6 characters.", "error");
      return false;
    }

    if (password !== confirmPassword) {
      showAuthMessage("Passwords do not match.", "error");
      return false;
    }

    return true;
  }

  async function resolveEmail(identifier) {
    if (isValidEmail(identifier)) return identifier;

    const { data, error } = await authState.client.rpc("resolve_login_email", {
      login_identifier: normalizeUsername(identifier),
    });

    if (error || !data) {
      throw new Error("Username not found.");
    }

    return data;
  }

  async function isUsernameAvailable(username) {
    const { data, error } = await authState.client.rpc("is_username_available", {
      candidate_username: normalizeUsername(username),
    });

    if (error) throw new Error(error.message);
    return Boolean(data);
  }

  async function signInWithPassword(event) {
    event?.preventDefault();
    event?.stopImmediatePropagation();
    if (authState.busy || !requireConfiguredSupabase()) return;

    const { identifier, password } = readAuthFields();
    if (!validateIdentifierPassword(identifier, password)) return;

    setAuthBusy(true);
    let email = "";
    try {
      email = await resolveEmail(identifier);
    } catch (error) {
      setAuthBusy(false);
      showAuthMessage(error.message, "error");
      return;
    }

    const { data, error } = await authState.client.auth.signInWithPassword({ email, password });
    setAuthBusy(false);

    if (error) {
      showAuthMessage(error.message, "error");
      return;
    }

    showAuthMessage("");
    showApp(data.user);
  }

  async function signUp(event) {
    event?.preventDefault();
    event?.stopImmediatePropagation();
    if (authState.busy || !requireConfiguredSupabase()) return;

    const { identifier, signupUsername, password, confirmPassword } = readAuthFields();
    if (!validateSignup(identifier, signupUsername, password, confirmPassword)) return;

    const email = identifier;
    const username = normalizeUsername(signupUsername);

    setAuthBusy(true);
    let usernameAvailable = false;
    try {
      usernameAvailable = await isUsernameAvailable(username);
    } catch (error) {
      setAuthBusy(false);
      showAuthMessage(error.message, "error");
      return;
    }

    if (!usernameAvailable) {
      setAuthBusy(false);
      showAuthMessage("This username is already taken.", "error");
      return;
    }

    const { data, error } = await authState.client.auth.signUp({
      email,
      password,
      options: {
        emailRedirectTo: redirectTo,
        data: { display_name: username, username },
      },
    });
    setAuthBusy(false);

    if (error) {
      showAuthMessage(error.message, "error");
      return;
    }

    if (data.session) {
      showApp(data.user);
      return;
    }

    showAuthMessage("Account created. Check your email to confirm before logging in.", "success");
  }

  async function signInWithGoogle(event) {
    event?.preventDefault();
    event?.stopImmediatePropagation();
    if (authState.busy || !requireConfiguredSupabase()) return;

    setAuthBusy(true);
    const { error } = await authState.client.auth.signInWithOAuth({
      provider: "google",
      options: {
        redirectTo,
        queryParams: {
          access_type: "offline",
          prompt: "consent",
        },
      },
    });
    setAuthBusy(false);

    if (error) showAuthMessage(error.message, "error");
  }

  async function requestPasswordReset(event) {
    event?.preventDefault();
    event?.stopImmediatePropagation();
    if (authState.busy || !requireConfiguredSupabase()) return;

    const { resetIdentifier } = readAuthFields();
    const identifier = resetIdentifier.trim();

    if (!isValidEmail(identifier) && !isValidPhone(identifier)) {
      showAuthMessage("Enter a valid email or phone number in international format, e.g. +66812345678.", "error");
      return;
    }

    setAuthBusy(true);

    if (isValidEmail(identifier)) {
      const { error } = await authState.client.auth.resetPasswordForEmail(identifier, {
        redirectTo,
      });
      setAuthBusy(false);

      if (error) {
        showAuthMessage(error.message, "error");
        return;
      }

      showAuthMessage("Password reset link sent. Check your email, then open the link to set a new password.", "success");
      return;
    }

    const phone = normalizePhone(identifier);
    const { error } = await authState.client.auth.signInWithOtp({ phone });
    setAuthBusy(false);

    if (error) {
      showAuthMessage(error.message, "error");
      return;
    }

    authState.resetIdentifier = phone;
    setResetStep("phone");
    showAuthMessage("SMS code sent. Enter the code and your new password.", "success");
  }

  async function confirmPasswordReset(event) {
    event?.preventDefault();
    event?.stopImmediatePropagation();
    if (authState.busy || !requireConfiguredSupabase()) return;

    const { resetCode, resetPassword } = readAuthFields();

    if (authState.resetStep === "phone") {
      if (!authState.resetIdentifier || resetCode.length < 4) {
        showAuthMessage("Enter the SMS code sent to your phone.", "error");
        return;
      }
    }

    if (resetPassword.length < 6) {
      showAuthMessage("New password must be at least 6 characters.", "error");
      return;
    }

    setAuthBusy(true);

    if (authState.resetStep === "phone") {
      const { error: otpError } = await authState.client.auth.verifyOtp({
        phone: authState.resetIdentifier,
        token: resetCode,
        type: "sms",
      });

      if (otpError) {
        setAuthBusy(false);
        showAuthMessage(otpError.message, "error");
        return;
      }
    }

    const { error } = await authState.client.auth.updateUser({ password: resetPassword });

    if (error) {
      setAuthBusy(false);
      showAuthMessage(error.message, "error");
      return;
    }

    await authState.client.auth.signOut();
    setAuthBusy(false);
    authState.passwordRecovery = false;
    setAuthMode("login");
    showAuthMessage("Password updated. Please log in with your new password.", "success");
  }

  async function signOut(event) {
    event?.preventDefault?.();

    if (!authState.client) {
      showLogin("Signed out.");
      return;
    }

    await authState.client.auth.signOut();
    showLogin("Signed out.");
    showToast("LOGGED OUT SECURELY.");
  }

  async function restoreSession() {
    if (!isConfigured || !authState.client) {
      showAuthMessage("Ready for Supabase. Add your URL and anon key in js/supabase-config.js.", "info");
      return;
    }

    const { data, error } = await authState.client.auth.getSession();
    if (error) {
      showAuthMessage(error.message, "error");
      return;
    }

    if (data.session?.user && !authState.passwordRecovery) showApp(data.session.user);
  }

  function setResetStep(step) {
    authState.resetStep = step === "phone" || step === "email-update" ? step : "request";
    const { inputGroup } = getAuthElements();
    if (inputGroup) inputGroup.dataset.authResetStep = authState.resetStep;
  }

  function setAuthMode(mode) {
    authState.mode = mode === "register" ? "register" : mode === "reset" ? "reset" : "login";
    const {
      inputGroup,
      identifier,
      password,
      confirmPassword,
      resetIdentifier,
      resetCode,
      resetPassword,
      modeButtons,
    } = getAuthElements();

    if (inputGroup) inputGroup.dataset.authMode = authState.mode;

    modeButtons.forEach((button) => {
      const active = button.dataset.authMode === authState.mode;
      button.classList.toggle("active", active);
      button.setAttribute("aria-selected", String(active));
    });

    if (identifier) {
      identifier.placeholder = authState.mode === "register" ? "Email" : "Email or username";
      identifier.setAttribute("aria-label", authState.mode === "register" ? "Email" : "Email or username");
      identifier.setAttribute("autocomplete", authState.mode === "register" ? "email" : "username");
    }

    if (password) password.setAttribute("autocomplete", authState.mode === "register" ? "new-password" : "current-password");
    if (confirmPassword && authState.mode === "register") confirmPassword.value = "";
    if (authState.mode === "reset") {
      if (resetIdentifier && !authState.resetIdentifier) resetIdentifier.value = identifier?.value || "";
      if (resetCode) resetCode.value = "";
      if (resetPassword) resetPassword.value = "";
      setResetStep(authState.passwordRecovery ? "email-update" : "request");
    } else {
      authState.passwordRecovery = false;
      authState.resetIdentifier = "";
      setResetStep("request");
    }
    showAuthMessage("");
  }

  function enhanceLoginUi() {
    const { inputGroup, identifier, signupUsername, password, loginButton, registerButton, resetRequestButton, resetConfirmButton, googleButton } =
      getAuthElements();
    if (!inputGroup) return;

    if (identifier) {
      identifier.type = "text";
    }

    if (password) {
      password.placeholder = "Password";
      password.setAttribute("autocomplete", "current-password");
    }

    if (loginButton) {
      loginButton.textContent = "Continue";
      loginButton.type = "button";
      loginButton.removeAttribute("onclick");
    }

    if (registerButton) {
      registerButton.type = "button";
      registerButton.textContent = "Create account";
    }

    if (resetRequestButton) resetRequestButton.type = "button";
    if (resetConfirmButton) resetConfirmButton.type = "button";

    if (signupUsername) signupUsername.type = "text";

    if (googleButton) {
      googleButton.id = "google-login-btn";
      googleButton.type = "button";
      googleButton.removeAttribute("onclick");
    }

    setAuthMode(authState.mode);
  }

  function bindEvents() {
    const {
      loginButton,
      registerButton,
      forgotButton,
      resetRequestButton,
      resetConfirmButton,
      backLoginButton,
      identifier,
      signupUsername,
      password,
      confirmPassword,
      resetIdentifier,
      resetCode,
      resetPassword,
      googleButton,
      modeButtons,
    } = getAuthElements();

    loginButton?.addEventListener("click", signInWithPassword, true);
    registerButton?.addEventListener("click", signUp, true);
    forgotButton?.addEventListener("click", () => setAuthMode("reset"), true);
    resetRequestButton?.addEventListener("click", requestPasswordReset, true);
    resetConfirmButton?.addEventListener("click", confirmPasswordReset, true);
    backLoginButton?.addEventListener("click", () => setAuthMode("login"), true);
    googleButton?.addEventListener("click", signInWithGoogle, true);
    modeButtons.forEach((button) => {
      button.addEventListener("click", () => setAuthMode(button.dataset.authMode));
    });

    [identifier, signupUsername, password, confirmPassword, resetIdentifier, resetCode, resetPassword].forEach((input) => {
      input?.addEventListener("keydown", (event) => {
        if (event.key === "Enter") {
          if (authState.mode === "register") signUp(event);
          else if (authState.mode === "reset" && authState.resetStep === "request") requestPasswordReset(event);
          else if (authState.mode === "reset") confirmPasswordReset(event);
          else signInWithPassword(event);
        }
      });
    });

    window.playGame = signInWithPassword;
    window.logout = signOut;
  }

  function initSupabaseAuth() {
    if (isConfigured && window.supabase?.createClient) {
      authState.client = window.supabase.createClient(supabaseUrl, supabaseKey, {
        auth: {
          detectSessionInUrl: true,
          persistSession: true,
          autoRefreshToken: true,
        },
      });
      window.fitQuestAuth.client = authState.client;

      authState.client.auth.onAuthStateChange((event, session) => {
        if (event === "PASSWORD_RECOVERY") {
          authState.passwordRecovery = true;
          authState.resetIdentifier = "";
          setAuthMode("reset");
          showLogin("Enter a new password to finish recovery.");
          return;
        }

        if (authState.mode === "reset") return;

        if (session?.user && session.user.id !== authState.currentUserId) {
          showApp(session.user);
        }
      });
    }

    enhanceLoginUi();
    bindEvents();
    restoreSession();
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", initSupabaseAuth);
  } else {
    initSupabaseAuth();
  }
})();
