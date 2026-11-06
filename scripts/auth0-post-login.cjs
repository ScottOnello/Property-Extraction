// Deploy as an Auth0 Post Login Action and attach to the Login flow.
// Set this Action's PROPERTY_APP_CLIENT_ID secret to the web application's client ID.
exports.onExecutePostLogin = async (event, api) => {
  if (!event.secrets.PROPERTY_APP_CLIENT_ID) {
    api.access.deny("Property app authentication policy is not configured.");
    return;
  }
  if (event.client.client_id !== event.secrets.PROPERTY_APP_CLIENT_ID) return;
  if (event.user.email_verified !== true || event.user.email?.toLowerCase() !== "scott@anchorinvest.co") {
    api.access.deny("This application is private.");
    return;
  }
  // Enable only the Authenticator OTP factor in this dedicated tenant.
  api.multifactor.enable("any", { allowRememberBrowser: false });
};
