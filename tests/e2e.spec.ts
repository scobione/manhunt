/**
 * AUTOMATED TEST ONLY: every identity, friend account and GPS sample in this file
 * is synthetic. Test auth requires separate opt-in guards in BOTH frontend and
 * backend. These fixtures never run on a production deployment.
 */
import { randomUUID } from 'node:crypto';
import { test, expect, type Browser, type BrowserContext, type Page } from '@playwright/test';
import { io, type Socket } from 'socket.io-client';
import { area, booleanWithin, circle } from '@turf/turf';
import { DEFAULT_SETTINGS, type Command, type LobbyView, type Mode, type Profile, type Settings } from '../shared/types';

const TEST_GPS = { latitude: 52.52, longitude: 13.405, accuracy: 8 };
const APP = 'http://127.0.0.1:5173';
const API = 'http://127.0.0.1:3001';
type Actor = {
  id: string;
  username: string;
  token: string;
  context: BrowserContext;
  page: Page;
  socket: Socket;
};

async function ack<T>(socket: Socket, event: string, data: unknown = {}): Promise<T> {
  return new Promise((resolve, reject) => {
    socket.timeout(10_000).emit(event, data, (timeout: Error | null, result: { ok: boolean; data?: T; error?: string }) => {
      if (timeout) return reject(timeout);
      if (!result?.ok) return reject(new Error(result?.error || 'Missing acknowledgement'));
      resolve(result.data as T);
    });
  });
}

async function actor(browser: Browser, username: string, mobile = false): Promise<Actor> {
  const id = randomUUID();
  username = `${username}_${id.slice(0, 4)}`;
  const token = `test:${id}:${username}`;
  const context = await browser.newContext({
    baseURL: APP,
    viewport: mobile ? { width: 390, height: 844 } : { width: 1440, height: 1000 },
    isMobile: mobile,
    hasTouch: mobile,
    // Explicitly synthetic GPS; never supplied to a live game.
    geolocation: TEST_GPS,
    permissions: ['geolocation'],
  });
  await context.addInitScript((value) => sessionStorage.setItem('manhunt:test-token', value), token);
  const page = await context.newPage();
  await page.goto('/');
  const socket = io(API, { auth: { token }, transports: ['websocket'], reconnection: false });
  await new Promise<void>((resolve, reject) => {
    socket.once('connect', () => resolve());
    socket.once('connect_error', reject);
  });
  await expect.poll(async () => {
    const response = await page.request.get(`${API}/api/profile`, { headers: { Authorization: `Bearer ${token}` } });
    return response.status();
  }).toBe(200);
  await expect(page.locator('.connection')).toHaveText('VERBUNDEN');
  return { id, username, token, context, page, socket };
}

async function dispose(...players: Actor[]) {
  for (const player of players) {
    player.socket.disconnect();
    await player.context.close();
  }
}

async function command(player: Actor, value: Command): Promise<LobbyView> {
  return ack(player.socket, 'lobby:command', { command: value });
}

async function view(player: Actor): Promise<LobbyView> {
  return ack(player.socket, 'lobby:sync');
}

async function profile(player: Actor): Promise<Profile> {
  const response = await player.page.request.get(`${API}/api/profile`, { headers: { Authorization: `Bearer ${player.token}` } });
  expect(response.ok()).toBeTruthy();
  return response.json();
}

async function prepareMatch(host: Actor, others: Actor[], mode: Mode = 'normal', overrides: Partial<Settings> = {}) {
  await host.page.goto('/create');
  await host.page.getByRole('button', { name: 'Lobby erstellen', exact: true }).click();
  await expect.poll(async () => (await view(host))?.code).toMatch(/^[A-Z0-9]{6}$/);
  const lobby = await view(host);
  for (const guest of others) {
    await guest.page.goto(`/join?code=${lobby.code}`);
    await expect(guest.page.getByLabel('Lobby-Code', { exact: true })).toHaveValue(lobby.code);
    await guest.page.getByRole('button', { name: 'Lobby beitreten', exact: true }).click();
    await expect.poll(async () => (await view(guest))?.code).toBe(lobby.code);
  }
  // Test setup uses the same authenticated, validated Socket.IO commands as the
  // visible settings editor; no database writes or test-only game endpoints.
  await command(host, {
    type: 'settings',
    settings: { ...DEFAULT_SETTINGS, mode, preparationSeconds: 0, headStartSeconds: 0, pinIntervalSeconds: 10, randomRoles: false, infectionDelaySeconds: 0, ...overrides },
  });
  await command(host, {
    type: 'zone',
    zone: { name: 'AUTOMATED TEST ZONE', confirmed: true, excluded: [], feature: circle([TEST_GPS.longitude, TEST_GPS.latitude], 0.6) },
  });
  await command(host, { type: 'assign', playerId: host.id, role: 'hunter', team: 'A' });
  for (const guest of others) await command(host, { type: 'assign', playerId: guest.id, role: 'hider', team: 'B' });
  for (const player of [host, ...others]) {
    await player.page.goto('/lobby');
    await expect(player.page.locator('.connection')).toHaveText('VERBUNDEN');
    await player.page.getByRole('button', { name: 'Bereit', exact: true }).click();
    await expect.poll(async () => (await view(player)).self.ready).toBe(true);
  }
  await host.page.getByRole('button', { name: 'Match starten', exact: true }).click();
  await expect.poll(async () => (await view(host)).status).toBe('active');
  return lobby.code;
}

test('public app renders on mobile and explicitly marks isolated test authentication', async ({ browser }) => {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
  const page = await context.newPage();
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.goto('/');
  await expect(page.getByRole('heading', { name:'Raus aus dem Alltag.',exact:true })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1)).toBeTruthy();
  await page.goto('/login');
  await expect(page.getByRole('button', { name: /Google/i })).toBeVisible();
  await expect(page.getByTestId('test-login')).toBeVisible();
  await page.screenshot({ path: 'test-results/mobile-login.png', fullPage: true });
  expect(errors).toEqual([]);
  await context.close();
});

test('REST rejects unauthenticated profile access and two browsers keep independent profiles', async ({ browser, request }) => {
  const unauthorized = await request.get(`${API}/api/profile`);
  expect(unauthorized.status()).toBe(401);
  const alice = await actor(browser, 'E2E_Alice');
  const bob = await actor(browser, 'E2E_Bob');
  try {
    const [a, b] = await Promise.all([profile(alice), profile(bob)]);
    expect(a.id).not.toBe(b.id);
    expect(a.friend_code).not.toBe(b.friend_code);
    await alice.page.goto('/profile');
    await expect(alice.page.getByText(alice.username, { exact: true }).first()).toBeVisible();
    await bob.page.goto('/profile');
    await expect(bob.page.getByText(bob.username, { exact: true }).first()).toBeVisible();
    const changed = await alice.page.request.patch(`${API}/api/profile`, {
      headers: { Authorization: `Bearer ${alice.token}` },
      data: { username: 'E2E_Alice_Edit', show_online: false },
    });
    expect(changed.ok()).toBeTruthy();
    await alice.page.reload();
    await expect(alice.page.getByText('E2E_Alice_Edit', { exact: true }).first()).toBeVisible();
    expect((await profile(bob)).username).toBe(bob.username);
  } finally { await dispose(alice, bob); }
});

test('two real browsers create, join and start a match; private locations and permissions hold', async ({ browser }) => {
  const host = await actor(browser, 'E2E_Hunter');
  const guest = await actor(browser, 'E2E_Hider');
  try {
    await prepareMatch(host, [guest]);
    expect((await view(host)).self.role).toBe('hunter');
    expect((await view(guest)).self.role).toBe('hider');
    await expect(command(guest, { type: 'settings', settings: DEFAULT_SETTINGS })).rejects.toThrow();
    await expect(command(guest, { type: 'capture', targetId: host.id })).rejects.toThrow();
    await command(guest, { type: 'location', location: { ...TEST_GPS, timestamp: Date.now() } });
    const hunterView = await view(host);
    const other = hunterView.players.find(player => player.id === guest.id)!;
    expect(other).not.toHaveProperty('location');
    expect(other).not.toHaveProperty('captureCode');
    expect(hunterView.pins).toHaveLength(0);
    await expect.poll(async () => {
      await command(guest, { type: 'location', location: { ...TEST_GPS, timestamp: Date.now() }, publish: true });
      return (await view(host)).pins.length;
    }, { timeout: 15_000, intervals: [1000] }).toBe(1);
    await host.page.screenshot({ path: 'test-results/normal-match.png', fullPage: true });
    await guest.page.reload();
    await expect.poll(async () => (await view(guest)).self.id).toBe(guest.id);
    await host.page.getByLabel('Hider auswählen').selectOption(guest.id);
    await host.page.getByRole('button',{name:'Fang anfragen',exact:true}).click();
    await guest.page.getByRole('button',{name:'Fang bestätigen',exact:true}).click();
    await expect(host.page.getByRole('heading',{name:'Die Jagd ist vorbei.',exact:true})).toBeVisible();
    await expect(guest.page.getByRole('heading',{name:'Die Jagd ist vorbei.',exact:true})).toBeVisible();
    await guest.page.reload();
    await expect(guest.page.getByRole('heading',{name:'Die Jagd ist vorbei.',exact:true})).toBeVisible();
    await guest.page.getByRole('button',{name:'Zur Übersicht',exact:true}).click();
    await expect(guest.page).toHaveURL(APP+'/');
  } finally { await dispose(host, guest); }
});

test('server registers zombie infection before acknowledgement in three browser sessions', async ({ browser }) => {
  const host = await actor(browser, 'E2E_ZHunter');
  const victim = await actor(browser, 'E2E_ZVictim');
  const survivor = await actor(browser, 'E2E_ZSurvivor');
  try {
    await prepareMatch(host, [victim, survivor], 'zombie');
    await host.page.getByLabel('Hider auswählen').selectOption(victim.id);
    await host.page.getByRole('button',{name:'Fang anfragen',exact:true}).click();
    const pending = (await view(victim)).captures.find(capture => capture.targetId === victim.id)!;
    expect(pending).toBeTruthy();
    await victim.page.getByRole('button',{name:'Fang bestätigen',exact:true}).click();
    await expect.poll(async () => (await view(victim)).self.role).toBe('zombie');
    await expect.poll(async () => (await view(survivor)).players.find(player => player.id === victim.id)?.role).toBe('zombie');
    await victim.page.getByLabel('Infektion bestätigen',{exact:true}).focus();
    await victim.page.getByLabel('Infektion bestätigen',{exact:true}).press('End');
    await expect(victim.page.getByRole('heading',{name:'DU WURDEST INFIZIERT.',exact:true})).toHaveCount(0);
    expect((await view(victim)).self.role).toBe('zombie');
    await command(victim, { type: 'capture', targetId: survivor.id });
    const second = (await view(survivor)).captures.find(capture => capture.targetId === survivor.id)!;
    await command(survivor, { type: 'confirm_capture', captureId: second.id, accept: true });
    await expect.poll(async () => (await view(host)).status).toBe('finished');
    expect((await view(host)).result?.winner).toBeTruthy();
  } finally { await dispose(host, victim, survivor); }
});

test('apocalypse shrinks safely and uncertain GPS never blindly eliminates a browser player', async ({ browser }) => {
  const host = await actor(browser, 'E2E_ApoHunter');
  const guest = await actor(browser, 'E2E_ApoHider', true);
  try {
    await prepareMatch(host, [guest], 'apocalypse', {
      phases: [{ afterSeconds: 0, scale: 1 }, { afterSeconds: 3, scale: 0.5 }],
      outsideGraceSeconds: 15,
      gpsToleranceSeconds: 10,
    });
    const initial = (await view(host)).zone!.feature;
    await expect.poll(async () => area((await view(host)).activeZone!), { timeout: 10_000 }).toBeLessThan(area(initial) * 0.3);
    expect(booleanWithin((await view(host)).activeZone!, initial)).toBeTruthy();
    // The first outside fix is synthetic and deliberately >300 m from the center.
    const outside = { ...TEST_GPS, longitude: TEST_GPS.longitude + 0.01, timestamp: Date.now() };
    await command(guest, { type: 'location', location: outside });
    expect((await view(guest)).self.outsideSince).toBeDefined();
    await expect(command(guest, { type: 'location', location: { ...outside, accuracy: 500, timestamp: Date.now() + 1 } })).rejects.toThrow();
    await expect.poll(async () => (await view(guest)).self.outsideSince, { timeout: 20_000 }).toBeUndefined();
    expect((await view(guest)).self.eliminated).toBe(false);
    await command(guest, { type: 'pause' });
    expect((await view(host)).status).toBe('paused');
    await expect(command(guest, { type: 'resume' })).rejects.toThrow();
    await command(host, { type: 'resume' });
    expect((await view(guest)).status).toBe('active');
    await guest.page.screenshot({ path: 'test-results/apocalypse-mobile.png', fullPage: true });
  } finally { await dispose(host, guest); }
});

test('friends, invitations and blocking synchronize across separate browser sessions', async ({ browser }) => {
  const alice = await actor(browser, 'E2E_FriendA');
  const bob = await actor(browser, 'E2E_FriendB');
  const headers = (player: Actor) => ({ Authorization: `Bearer ${player.token}` });
  const social = async (player: Actor) => (await player.page.request.get(`${API}/api/social`, { headers: headers(player) })).json();
  try {
    const b = await profile(bob);
    const request = await alice.page.request.post(`${API}/api/friends/request`, { headers: headers(alice), data: { code: b.friend_code } });
    expect(request.ok()).toBeTruthy();
    const incoming = (await social(bob)).requests.find((r: { direction: string }) => r.direction === 'incoming');
    expect(incoming).toBeTruthy();
    const strangerAccept = await alice.page.request.post(`${API}/api/friends/respond`, { headers: headers(alice), data: { requestId: incoming.id, accept: true } });
    expect(strangerAccept.ok()).toBeFalsy();
    const accept = await bob.page.request.post(`${API}/api/friends/respond`, { headers: headers(bob), data: { requestId: incoming.id, accept: true } });
    expect(accept.ok()).toBeTruthy();
    await alice.page.goto('/friends');
    await bob.page.goto('/friends');
    await expect(alice.page.getByText(bob.username, { exact: true }).first()).toBeVisible();
    await expect(bob.page.getByText(alice.username, { exact: true }).first()).toBeVisible();
    const lobby = await ack<LobbyView>(alice.socket, 'lobby:create', {});
    const invite = await alice.page.request.post(`${API}/api/invites`, { headers: headers(alice), data: { friendId: bob.id, code: lobby.code } });
    expect(invite.ok()).toBeTruthy();
    await expect.poll(async () => (await social(bob)).notifications.some((notice: { type: string; data: { code?: string } }) => notice.type === 'lobby_invite' && notice.data.code === lobby.code)).toBe(true);
    const block = await bob.page.request.post(`${API}/api/blocks/${alice.id}`, { headers: headers(bob), data: {} });
    expect(block.ok()).toBeTruthy();
    expect((await social(alice)).friends).toHaveLength(0);
    expect((await social(bob)).blocked.some((friend: Profile) => friend.id === alice.id)).toBe(true);
    const blockedInvite = await alice.page.request.post(`${API}/api/invites`, { headers: headers(alice), data: { friendId: bob.id, code: lobby.code } });
    expect(blockedInvite.ok()).toBeFalsy();
    await expect(ack(bob.socket, 'lobby:join', { code: lobby.code })).rejects.toThrow();
  } finally { await dispose(alice, bob); }
});

test('mobile app shows offline state and browser reconnect synchronizes the active lobby', async ({ browser }) => {
  const host = await actor(browser, 'E2E_ReconnectA');
  const guest = await actor(browser, 'E2E_ReconnectB', true);
  try {
    await prepareMatch(host, [guest]);
    const lobbyId = (await view(guest)).id;
    // Disconnect the auxiliary assertion socket too, to exercise actual user presence.
    guest.socket.disconnect();
    await guest.context.setOffline(true);
    await expect(guest.page.getByRole('status').filter({ hasText: 'Du bist offline' })).toBeVisible();
    await guest.context.setOffline(false);
    await expect(guest.page.locator('.connection')).toHaveText('VERBUNDEN', { timeout: 20_000 });
    guest.socket.connect();
    await expect.poll(() => guest.socket.connected).toBe(true);
    await expect.poll(async () => (await view(guest)).id).toBe(lobbyId);
    expect((await view(guest)).self.id).toBe(guest.id);
    expect(await guest.page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1)).toBeTruthy();
  } finally { await dispose(host, guest); }
});


test('browser GPS starts only after consent and stopping sharing pauses the match',async({browser})=>{
 const host=await actor(browser,'E2E_GpsHunter');const guest=await actor(browser,'E2E_GpsHider',true);
 try{
  await prepareMatch(host,[guest]);
  expect((await view(guest)).self.location).toBeUndefined();
  await expect(guest.page.getByRole('button',{name:'GPS aktivieren',exact:true})).toBeDisabled();
  await guest.page.getByRole('checkbox',{name:/Ich teile meinen Standort/}).check();
  await guest.page.getByRole('button',{name:'GPS aktivieren',exact:true}).click();
  await expect.poll(async()=>(await view(guest)).self.location?.latitude).toBe(TEST_GPS.latitude);
  await expect(guest.page.getByText('FREIGABE AKTIV',{exact:true})).toBeVisible();
  await guest.page.getByRole('button',{name:'Standortfreigabe beenden',exact:true}).click();
  await expect.poll(async()=>(await view(host)).status).toBe('paused');
  await expect(guest.page.getByText('FREIGABE AKTIV',{exact:true})).toHaveCount(0);
 }finally{await dispose(host,guest);}
});
