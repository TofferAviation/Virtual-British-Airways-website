
# British Airways Virtual website

## Production login-session recovery

If pilots are redirected back to login or see an invalid-session message immediately after a domain or deployment change:

1. Confirm the Render service has both the root domain and `www` domain verified with certificates issued.
2. Keep `BAV_PILOT_SESSION_SECRET` and `BAV_STAFF_SESSION_SECRET` stable. Do not rotate either value as part of ordinary recovery, because doing so invalidates every current login session.
3. Set `BAV_PUBLIC_SITE_URL` to the live canonical HTTPS domain. The current production value is `https://virtualairline.co.uk`.
4. Confirm `pilotSessionCookieDomain` accepts the live root domain and its `www` hostname. The session-cookie version must be increased when correcting a domain-scope issue so browsers receive a fresh cookie and earlier variants are cleared at the next sign-in.
5. After the deployment is live, ask affected pilots to sign in again in a private window or after clearing cookies for the live domain.

The current recovery was released in commit `90ccb14` (`fix: scope pilot sessions to live domain`). It creates `bav_pilot_session_v6`, clears prior cookie variants during sign-in, and safely shares the session between `virtualairline.co.uk` and `www.virtualairline.co.uk`.
