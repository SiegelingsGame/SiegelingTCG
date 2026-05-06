'use strict';

const admin = require('firebase-admin');
const { FieldValue, getFirestore } = require('firebase-admin/firestore');
const bcrypt = require('bcryptjs');
const express = require('express');
const { onRequest } = require('firebase-functions/v2/https');
const { buildMetadata } = require('./editorMetadata');

admin.initializeApp();

const FIRESTORE_DATABASE_ID = process.env.FIRESTORE_DATABASE_ID || 'siegedb';
const db = getFirestore(FIRESTORE_DATABASE_ID);
const app = express();

app.use(express.json({ limit: '4mb' }));

const DOCS = {
  cards: { collection: 'appConfig', document: 'cardOverrides', field: 'cards' },
  decks: { collection: 'appConfig', document: 'presetDecks', field: 'decks' },
  trainers: { collection: 'appConfig', document: 'trainerCards', field: 'trainers' },
  liveElements: { collection: 'appConfig', document: 'liveElements', field: 'elements' },
  publishSignal: { collection: 'appConfig', document: 'livePublishState' }
};

const AUTH = {
  adminsCollection: 'cardEditorAdmins',
  sessionsCollection: 'cardEditorSessions',
  sessionTtlDays: 30
};

app.get('/api/cards/editor', async (req, res) => {
  try {
    const [cardsSnapshot, decksSnapshot, trainersSnapshot, liveSnapshot] = await Promise.all([
      loadCardsSnapshot(),
      loadSimpleSnapshot(DOCS.decks),
      loadSimpleSnapshot(DOCS.trainers),
      loadSimpleSnapshot(DOCS.liveElements)
    ]);
    const auth = await describeAuth(readEditorToken(req));
    const updatedMeta = latestUpdateMeta([cardsSnapshot, decksSnapshot, trainersSnapshot, liveSnapshot]);
    res.json({
      data: {
        cards: safeArray(cardsSnapshot.data.cards),
        moves: safeArray(cardsSnapshot.data.moves),
        decks: safeArray(decksSnapshot.data.decks),
        trainers: safeArray(trainersSnapshot.data.trainers),
        liveElements: {
          elements: safeArray(liveSnapshot.data.elements)
        }
      },
      filePath: buildFilePath(),
      canSaveToProjectFile: false,
      source: 'FIRESTORE',
      liveEditingEnabled: true,
      updatedBy: updatedMeta.updatedBy,
      updatedAt: updatedMeta.updatedAt,
      firestoreAvailable: true,
      firestoreError: '',
      auth,
      metadata: buildMetadata(safeArray(trainersSnapshot.data.trainers))
    });
  } catch (error) {
    res.status(500).json({ error: error.message || 'Unable to load editor state.' });
  }
});

app.post('/api/cards/editor', async (req, res) => {
  try {
    const identity = await requireEditor(readEditorToken(req));
    const currentCards = await loadCardsSnapshot();
    const currentDecks = await loadSimpleSnapshot(DOCS.decks);
    const currentTrainers = await loadSimpleSnapshot(DOCS.trainers);
    const currentLive = await loadSimpleSnapshot(DOCS.liveElements);

    const nextCards = resolveCardsPayload(req.body, currentCards.data);
    const nextDecks = resolveSimplePayload(req.body?.decks, currentDecks.data.decks, 'decks');
    const nextTrainers = resolveSimplePayload(req.body?.trainers, currentTrainers.data.trainers, 'trainers');
    const nextLiveElements = resolveLiveElementsPayload(req.body?.liveElements, currentLive.data.elements);

    await saveEditorBundle({
      cards: {
        cards: nextCards.cards,
        moves: nextCards.moves,
      },
      decks: {
        decks: nextDecks,
      },
      trainers: {
        trainers: nextTrainers,
      },
      liveElements: {
        elements: nextLiveElements,
      }
    }, identity.email);

    const updatedAt = new Date().toISOString();
    res.json({
      data: {
        cards: nextCards.cards,
        moves: nextCards.moves,
        decks: nextDecks,
        trainers: nextTrainers,
        liveElements: {
          elements: nextLiveElements
        }
      },
      filePath: buildFilePath(),
      canSaveToProjectFile: false,
      source: 'FIRESTORE',
      liveEditingEnabled: true,
      updatedBy: identity.email,
      updatedAt,
      firestoreAvailable: true,
      firestoreError: '',
      auth: await describeAuth(readEditorToken(req)),
      metadata: buildMetadata(nextTrainers)
    });
  } catch (error) {
    const status = error.statusCode || (String(error.message || '').includes('Sign in') ? 400 : 500);
    res.status(status).json({ error: error.message || 'Unable to save editor state.' });
  }
});

app.post('/api/cards/editor/auth/bootstrap', async (req, res) => {
  try {
    const response = await bootstrapEditor(req.body?.email, req.body?.password, req.body?.displayName);
    res.json({
      token: response.token,
      auth: response.auth,
      firestoreAvailable: true,
      firestoreError: ''
    });
  } catch (error) {
    res.status(error.statusCode || 500).json({ error: error.message || 'Unable to create the dashboard admin account.' });
  }
});

app.post('/api/cards/editor/auth/login', async (req, res) => {
  try {
    const response = await loginEditor(req.body?.email, req.body?.password);
    res.json({
      token: response.token,
      auth: response.auth,
      firestoreAvailable: true,
      firestoreError: ''
    });
  } catch (error) {
    res.status(error.statusCode || 500).json({ error: error.message || 'Unable to log in to the dashboard.' });
  }
});

app.post('/api/cards/editor/auth/logout', async (req, res) => {
  try {
    const token = readEditorToken(req);
    if (token) {
      await sessionRef(token).delete();
    }
    res.json({
      ok: true,
      auth: {
        available: true,
        bootstrappable: !(await hasAnyAdmin()),
        authenticated: false,
        canEdit: false,
        email: null,
        displayName: null
      }
    });
  } catch (error) {
    res.status(error.statusCode || 500).json({ error: error.message || 'Unable to end that dashboard session.' });
  }
});

const api = onRequest({ region: 'us-central1' }, app);
exports.api = api;
exports.app = app;

async function loadCardsSnapshot() {
  const snapshot = await docRef(DOCS.cards).get();
  const data = snapshot.data() || {};
  return {
    data: {
      cards: safeArray(data.cards),
      moves: safeArray(data.moves)
    },
    updatedBy: stringOrEmpty(data.updatedBy),
    updatedAt: timestampToIso(data.updatedAt, snapshot)
  };
}

async function loadSimpleSnapshot(config) {
  const snapshot = await docRef(config).get();
  const data = snapshot.data() || {};
  return {
    data: {
      [config.field]: safeArray(data[config.field])
    },
    updatedBy: stringOrEmpty(data.updatedBy),
    updatedAt: timestampToIso(data.updatedAt, snapshot)
  };
}

function resolveCardsPayload(body, currentData) {
  const cards = Array.isArray(body?.cards) ? body.cards : safeArray(currentData.cards);
  if (!Array.isArray(cards)) {
    throw badRequest("The JSON must contain a top-level 'cards' array.");
  }
  const submittedMoves = body && Object.prototype.hasOwnProperty.call(body, 'moves') ? body.moves : undefined;
  const currentMoves = safeArray(currentData.moves);
  let moves = Array.isArray(submittedMoves) ? submittedMoves : currentMoves;
  if (Array.isArray(submittedMoves) && submittedMoves.length === 0 && currentMoves.length > 0) {
    moves = currentMoves;
  }
  return { cards, moves: safeArray(moves) };
}

function resolveSimplePayload(submitted, fallback, fieldName) {
  const value = Array.isArray(submitted) ? submitted : safeArray(fallback);
  if (!Array.isArray(value)) {
    throw badRequest(`The JSON must contain a top-level '${fieldName}' array.`);
  }
  return value;
}

function resolveLiveElementsPayload(submittedLiveElements, fallbackElements) {
  if (submittedLiveElements && Array.isArray(submittedLiveElements.elements)) {
    return submittedLiveElements.elements;
  }
  return safeArray(fallbackElements);
}

function latestUpdateMeta(snapshots) {
  const sorted = snapshots
    .map((snapshot) => ({
      updatedBy: snapshot.updatedBy || '',
      updatedAt: snapshot.updatedAt || ''
    }))
    .sort((left, right) => String(right.updatedAt).localeCompare(String(left.updatedAt)));
  return sorted[0] || { updatedBy: '', updatedAt: '' };
}

function buildFilePath() {
  return 'Cards: appConfig/cardOverrides | Decks: appConfig/presetDecks | SiegeKnights: appConfig/trainerCards | Live elements: appConfig/liveElements';
}

function docRef(config) {
  return db.collection(config.collection).doc(config.document);
}

function saveDocument(config, payload) {
  return docRef(config).set(payload, { merge: false });
}

async function saveEditorBundle(nextState, updatedByEmail) {
  const batch = db.batch();
  const now = FieldValue.serverTimestamp();
  const updatedBy = normalizeUpdatedBy(updatedByEmail);

  batch.set(docRef(DOCS.cards), {
    cards: safeArray(nextState.cards?.cards),
    moves: safeArray(nextState.cards?.moves),
    updatedBy,
    updatedAt: now
  }, { merge: false });

  batch.set(docRef(DOCS.decks), {
    decks: safeArray(nextState.decks?.decks),
    updatedBy,
    updatedAt: now
  }, { merge: false });

  batch.set(docRef(DOCS.trainers), {
    trainers: safeArray(nextState.trainers?.trainers),
    updatedBy,
    updatedAt: now
  }, { merge: false });

  batch.set(docRef(DOCS.liveElements), {
    elements: safeArray(nextState.liveElements?.elements),
    updatedBy,
    updatedAt: now
  }, { merge: false });

  batch.set(docRef(DOCS.publishSignal), {
    version: FieldValue.increment(1),
    updatedBy,
    updatedAt: now
  }, { merge: true });

  await batch.commit();
}

function readEditorToken(req) {
  return String(req.get('X-Card-Editor-Token') || '').trim();
}

async function describeAuth(token) {
  const bootstrappable = !(await hasAnyAdmin());
  const identity = await resolveIdentity(token);
  return {
    available: true,
    bootstrappable,
    authenticated: Boolean(identity),
    canEdit: Boolean(identity),
    email: identity ? identity.email : null,
    displayName: identity ? identity.displayName : null
  };
}

async function bootstrapEditor(email, password, displayName) {
  const normalizedEmail = normalizeEmail(email);
  validatePassword(password);
  const normalizedDisplayName = normalizeDisplayName(displayName, normalizedEmail);

  await db.runTransaction(async (transaction) => {
    const adminProbe = await transaction.get(db.collection(AUTH.adminsCollection).limit(1));
    if (!adminProbe.empty) {
      throw badRequest('The dashboard already has an admin account. Use login instead.');
    }
    const existing = await transaction.get(adminRef(normalizedEmail));
    if (existing.exists) {
      throw badRequest('That editor account already exists.');
    }
    transaction.create(adminRef(normalizedEmail), {
      email: normalizedEmail,
      displayName: normalizedDisplayName,
      passwordHash: await bcrypt.hash(password, 10),
      createdAt: new Date().toISOString()
    });
  });

  return createSession(normalizedEmail, normalizedDisplayName);
}

async function loginEditor(email, password) {
  const normalizedEmail = normalizeEmail(email);
  const snapshot = await adminRef(normalizedEmail).get();
  if (!snapshot.exists) {
    throw badRequest('That dashboard admin account was not found.');
  }
  const data = snapshot.data() || {};
  const matches = await bcrypt.compare(String(password || ''), String(data.passwordHash || ''));
  if (!matches) {
    throw badRequest('Email or password is incorrect.');
  }
  return createSession(normalizedEmail, stringOrEmpty(data.displayName) || normalizedEmail);
}

async function createSession(email, displayName) {
  const token = db.collection('_').doc().id.replace(/-/g, '');
  const expiresAt = new Date(Date.now() + AUTH.sessionTtlDays * 24 * 60 * 60 * 1000);
  await sessionRef(token).set({
    email,
    displayName,
    createdAt: new Date().toISOString(),
    expiresAt: expiresAt.toISOString()
  });
  return {
    token,
    auth: {
      available: true,
      bootstrappable: !(await hasAnyAdmin()),
      authenticated: true,
      canEdit: true,
      email,
      displayName
    }
  };
}

async function requireEditor(token) {
  const identity = await resolveIdentity(token);
  if (!identity) {
    throw badRequest('Sign in to publish live card data.');
  }
  return identity;
}

async function resolveIdentity(token) {
  if (!token) {
    return null;
  }
  const snapshot = await sessionRef(token).get();
  if (!snapshot.exists) {
    return null;
  }
  const data = snapshot.data() || {};
  const expiresAt = data.expiresAt ? new Date(data.expiresAt) : null;
  if (!expiresAt || Number.isNaN(expiresAt.getTime()) || expiresAt.getTime() < Date.now()) {
    await sessionRef(token).delete().catch(() => {});
    return null;
  }
  const email = stringOrEmpty(data.email);
  if (!email) {
    return null;
  }
  return {
    email,
    displayName: stringOrEmpty(data.displayName) || email
  };
}

async function hasAnyAdmin() {
  const snapshot = await db.collection(AUTH.adminsCollection).limit(1).get();
  return !snapshot.empty;
}

function adminRef(email) {
  return db.collection(AUTH.adminsCollection).doc(email);
}

function sessionRef(token) {
  return db.collection(AUTH.sessionsCollection).doc(token);
}

function normalizeEmail(email) {
  const normalized = String(email || '').trim().toLowerCase();
  if (!normalized.includes('@') || normalized.startsWith('@') || normalized.endsWith('@')) {
    throw badRequest('Enter a valid email address.');
  }
  if (normalized.length > 190) {
    throw badRequest('That email is too long.');
  }
  return normalized;
}

function validatePassword(password) {
  const value = String(password || '');
  if (value.length < 8) {
    throw badRequest('Editor passwords must be at least 8 characters.');
  }
  if (value.length > 72) {
    throw badRequest('Editor passwords must be 72 characters or fewer.');
  }
}

function normalizeDisplayName(displayName, email) {
  let candidate = String(displayName || '').trim();
  if (!candidate) {
    candidate = email.slice(0, email.indexOf('@'));
  }
  if (candidate.length > 30) {
    candidate = candidate.slice(0, 30);
  }
  return candidate;
}

function safeArray(value) {
  return Array.isArray(value) ? value : [];
}

function stringOrEmpty(value) {
  return typeof value === 'string' ? value : '';
}

function normalizeUpdatedBy(value) {
  const normalized = String(value || '').trim().toLowerCase();
  return normalized || 'unknown';
}

function timestampToIso(value, snapshot) {
  if (value && typeof value.toDate === 'function') {
    return value.toDate().toISOString();
  }
  if (snapshot?.updateTime && typeof snapshot.updateTime.toDate === 'function') {
    return snapshot.updateTime.toDate().toISOString();
  }
  return '';
}

function badRequest(message) {
  const error = new Error(message);
  error.statusCode = 400;
  return error;
}
