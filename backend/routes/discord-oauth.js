const express = require('express');
const crypto = require('crypto');
const fetch = global.fetch || ((...a) => import('node-fetch').then(({default:f}) => f(...a)));

const router = express.Router();

// GET /api/discord/oauth/start
router.get('/api/discord/oauth/start', (req, res) => {
  const { state, purpose } = req.query;
  if (!state) return res.status(400).send('Missing state');

  const DISCORD_CLIENT_ID = process.env.DISCORD_CLIENT_ID;
  const DISCORD_REDIRECT_URI = process.env.DISCORD_REDIRECT_URI; // e.g. https://surfari.io/api/discord/oauth/callback
  const scopes = ['identify'];

  const url = new URL('https://discord.com/oauth2/authorize');
  url.searchParams.set('client_id', DISCORD_CLIENT_ID);
  url.searchParams.set('redirect_uri', DISCORD_REDIRECT_URI);
  url.searchParams.set('response_type', 'code');
  url.searchParams.set('scope', scopes.join(' '));
  url.searchParams.set('state', state);
  if (purpose) url.searchParams.set('prompt', 'consent');

  res.redirect(url.toString());
});

// GET /api/discord/oauth/callback
router.get('/api/discord/oauth/callback', async (req, res) => {
  try {
    const { code, state } = req.query;
    if (!code || !state) return res.status(400).send('Missing code/state');

    // 1) Exchange code
    const tokenResp = await fetch('https://discord.com/api/oauth2/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id: process.env.DISCORD_CLIENT_ID,
        client_secret: process.env.DISCORD_CLIENT_SECRET,
        grant_type: 'authorization_code',
        code,
        redirect_uri: process.env.DISCORD_REDIRECT_URI,
      }),
    });
    const tokenJson = await tokenResp.json();
    if (!tokenResp.ok) return res.status(400).json(tokenJson);

    // (Optional) read Discord user
    const meResp = await fetch('https://discord.com/api/users/@me', {
      headers: { Authorization: `${tokenJson.token_type} ${tokenJson.access_token}` },
    });
    const me = await meResp.json();
    if (!me?.id) return res.status(400).json({ error: 'discord user fetch failed' });

    // 2) Get Roblox identity from your session/auth (adjust to your app)
    const robloxId = req.session?.robloxId;
    const username = req.session?.robloxUsername;
    const displayName = req.session?.robloxDisplayName || username;
    if (!robloxId || !username) {
      // bounce user to your Roblox login while preserving state
      const returnTo = encodeURIComponent(`/api/discord/oauth/callback?code=${encodeURIComponent(code)}&state=${encodeURIComponent(state)}`);
      return res.redirect(`/login?returnTo=${returnTo}`);
    }

    // 3) Fetch Surfari group role
    const SURFARI_GROUP_ID = Number(process.env.SURFARI_GROUP_ID);
    const rolesResp = await fetch(`https://groups.roblox.com/v2/users/${robloxId}/groups/roles`);
    const rolesData = await rolesResp.json();
    const surfari = rolesData?.data?.find(g => g?.group?.id === SURFARI_GROUP_ID);
    const roles = surfari ? [{
      groupId: SURFARI_GROUP_ID,
      roleId: surfari.role?.id,
      roleName: surfari.role?.name,
    }] : [];

    // 4) POST to your bot
    const body = JSON.stringify({ state, robloxId, username, displayName, roles });
    const sig = process.env.SURFARI_WEBHOOK_SECRET
      ? crypto.createHmac('sha256', process.env.SURFARI_WEBHOOK_SECRET).update(body).digest('base64')
      : undefined;

    const r = await fetch(`${process.env.BOT_WEBHOOK_URL}/api/discord/verify`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(sig ? { 'x-surfari-signature': sig } : {}),
      },
      body,
    });
    const json = await r.json();
    if (!r.ok) return res.status(400).json(json);

    return res.redirect('/verified'); // show success page
  } catch (e) {
    console.error('discord oauth callback error', e);
    return res.status(500).send('Internal error');
  }
});

module.exports = router;