// ===========================================================
// ANMELDUNG (MSAL / Microsoft-Login)
// ===========================================================
// Nutzt die MSAL.js-Bibliothek (wird in index.html per CDN geladen),
// um den Nutzer mit seinem Microsoft-Konto anzumelden und ein
// Zugriffstoken für Microsoft Graph (OneDrive) zu erhalten.

const msalInstance = new msal.PublicClientApplication(MSAL_CONFIG);

let activeAccount = null;

/** Beim App-Start: prüfen, ob schon eine Anmeldung im Cache liegt. */
async function initAuth() {
  await msalInstance.initialize();

  // Falls wir gerade von einem Login-Redirect zurückkommen
  const response = await msalInstance.handleRedirectPromise();
  if (response) {
    activeAccount = response.account;
  } else {
    const accounts = msalInstance.getAllAccounts();
    if (accounts.length > 0) {
      activeAccount = accounts[0];
    }
  }
  return activeAccount;
}

/** Login-Vorgang starten (leitet auf die Microsoft-Anmeldeseite weiter). */
function login() {
  msalInstance.loginRedirect({ scopes: APP_CONFIG.scopes });
}

/** Abmelden. */
function logout() {
  msalInstance.logoutRedirect();
}

/**
 * Gültiges Zugriffstoken für Microsoft Graph besorgen.
 * Nutzt zuerst den (schnellen) Cache; falls das nicht klappt,
 * wird ein neuer interaktiver Login ausgelöst.
 */
async function getAccessToken() {
  if (!activeAccount) {
    throw new Error("Nicht angemeldet.");
  }
  try {
    const result = await msalInstance.acquireTokenSilent({
      scopes: APP_CONFIG.scopes,
      account: activeAccount,
    });
    return result.accessToken;
  } catch (err) {
    // Stiller Tokenbezug fehlgeschlagen -> interaktiv nachfragen
    const result = await msalInstance.acquireTokenRedirect({
      scopes: APP_CONFIG.scopes,
    });
    return result.accessToken;
  }
}

function isLoggedIn() {
  return !!activeAccount;
}

function getAccountName() {
  return activeAccount ? activeAccount.username : null;
}
