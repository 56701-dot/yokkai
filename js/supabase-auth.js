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
  };

  function getAuthElements() {
    return {
      identifier: document.getElementById("username-input"),
      signupUsername: document.getElementById("signup-username-input"),
      password: document.getElementById("password-input"),
      loginButton: document.getElementById("login-btn"),
      inputGroup: document.querySelector("#login-screen .input-group"),
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
    const { loginButton, googleButton } = getAuthElements();
    const registerButton = document.getElementById("register-btn");

    [loginButton, registerButton, googleButton].forEach((button) => {
      if (button) button.disabled = isBusy;
    });

    if (loginButton) loginButton.textContent = isBusy ? "CONNECTING..." : "LOGIN";
  }

  function updatePlayerName(user) {
    const name = displayNameFromUser(user);
    const roleLabel = user?.user_metadata?.role === "admin" ? "ADMIN" : name.toUpperCase();
    const hello = document.querySelector(".top-meta .hello");
    const profileName = document.querySelector(".profile-card h2");

    if (hello) hello.textContent = `WELCOME, ${roleLabel}`;
    if (profileName) profileName.textContent = name;
  }

  async function loadProfile(user) {
    if (!authState.client || !user?.id) return;

    const { data, error } = await authState.client
      .from("profiles")
      .select("display_name, username, role, coins, level, xp")
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
      updateCoins();
    }

    const levelChip = document.querySelector(".level-chip");
    const levelText = document.querySelector(".level-text");
    const profileClass = document.querySelector(".profile-card .sub");
    if (levelChip) levelChip.textContent = `LV. ${data.level}`;
    if (levelText) levelText.textContent = `${data.xp} / 1080 XP`;
    if (profileClass) {
      profileClass.textContent = data.role === "admin" ? `Level ${data.level} - Admin` : `Level ${data.level} - Warrior`;
    }
  }

  function showApp(user) {
    authState.currentUserId = user?.id || null;
    updatePlayerName(user);
    loadProfile(user);

    Transitions.flash(() => {
      document.getElementById("login-screen")?.classList.remove("active");
      document.getElementById("app-screen")?.classList.add("active");
      showToast("SYSTEM ONLINE. WELCOME.");
    });
  }

  function showLogin(message) {
    authState.currentUserId = null;

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
    const { identifier, signupUsername, password } = getAuthElements();
    return {
      identifier: (identifier?.value || "").trim(),
      signupUsername: (signupUsername?.value || "").trim(),
      password: password?.value || "",
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

  function validateSignup(email, username, password) {
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

    const { identifier, signupUsername, password } = readAuthFields();
    if (!validateSignup(identifier, signupUsername, password)) return;

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

    if (data.session?.user) showApp(data.session.user);
  }

  function enhanceLoginUi() {
    const { inputGroup, identifier, password, loginButton, googleButton } = getAuthElements();
    if (!inputGroup) return;

    if (identifier) {
      identifier.type = "text";
      identifier.placeholder = "Email or username";
      identifier.setAttribute("aria-label", "Email or username");
      identifier.setAttribute("autocomplete", "username");
    }

    let signupUsername = document.getElementById("signup-username-input");
    if (!signupUsername && password) {
      signupUsername = document.createElement("input");
      signupUsername.className = "input-glass";
      signupUsername.id = "signup-username-input";
      signupUsername.placeholder = "Username (for signup)";
      signupUsername.type = "text";
      signupUsername.setAttribute("aria-label", "Username for signup");
      signupUsername.setAttribute("autocomplete", "username");
      password.insertAdjacentElement("beforebegin", signupUsername);
    }

    if (password) {
      password.placeholder = "Password";
      password.setAttribute("autocomplete", "current-password");
    }

    if (loginButton) {
      loginButton.textContent = "LOGIN";
      loginButton.type = "button";
      loginButton.removeAttribute("onclick");
    }

    let registerButton = document.getElementById("register-btn");
    if (!registerButton) {
      registerButton = document.createElement("button");
      registerButton.className = "btn btn-glass";
      registerButton.id = "register-btn";
      registerButton.type = "button";
      registerButton.textContent = "CREATE ACCOUNT";
      inputGroup.insertAdjacentElement("afterend", registerButton);
    }

    if (googleButton) {
      googleButton.id = "google-login-btn";
      googleButton.type = "button";
      googleButton.removeAttribute("onclick");
    }
  }

  function bindEvents() {
    const { loginButton, identifier, signupUsername, password, googleButton } = getAuthElements();
    const registerButton = document.getElementById("register-btn");

    loginButton?.addEventListener("click", signInWithPassword, true);
    registerButton?.addEventListener("click", signUp, true);
    googleButton?.addEventListener("click", signInWithGoogle, true);

    [identifier, signupUsername, password].forEach((input) => {
      input?.addEventListener("keydown", (event) => {
        if (event.key === "Enter") signInWithPassword(event);
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

      authState.client.auth.onAuthStateChange((_event, session) => {
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
