import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  limit as firestoreLimit,
  orderBy as firestoreOrderBy,
  query,
  setDoc,
  updateDoc,
  where
} from 'firebase/firestore';
import { db, firebaseConfigured } from '../config/firebase.js';
import { createError, uuid } from '../utils/helpers.js';

function ensureDb() {
  if (!firebaseConfigured || !db) {
    throw createError(503, 'Firestore is not configured', 'FIREBASE_NOT_CONFIGURED');
  }
  return db;
}

export function collectionRef(collectionName) {
  return collection(ensureDb(), collectionName);
}

export function documentRef(collectionName, id) {
  return doc(ensureDb(), collectionName, id);
}

export async function getDocument(collectionName, id) {
  const snapshot = await getDoc(documentRef(collectionName, id));
  if (!snapshot.exists()) {
    return null;
  }

  return {
    id: snapshot.id,
    ...snapshot.data()
  };
}

export async function addDocument(collectionName, data) {
  if (data && data.id) {
    await setDoc(documentRef(collectionName, data.id), data, { merge: false });
    return getDocument(collectionName, data.id);
  }

  const id = uuid();
  const ref = await addDoc(collectionRef(collectionName), {
    ...data,
    id
  });
  return getDocument(collectionName, ref.id);
}

export async function setDocument(collectionName, id, data, merge = true) {
  await setDoc(documentRef(collectionName, id), data, { merge });
  return getDocument(collectionName, id);
}

export async function updateDocument(collectionName, id, data) {
  await updateDoc(documentRef(collectionName, id), data);
  return getDocument(collectionName, id);
}

export async function deleteDocument(collectionName, id) {
  await deleteDoc(documentRef(collectionName, id));
  return true;
}

export async function queryDocuments(collectionName, filters = [], options = {}) {
  const constraints = [];
  for (const [field, operator, value] of filters) {
    constraints.push(where(field, operator, value));
  }

  if (options.orderBy) {
    constraints.push(firestoreOrderBy(options.orderBy.field, options.orderBy.direction || 'asc'));
  }

  if (options.limit) {
    constraints.push(firestoreLimit(options.limit));
  }

  const targetQuery = constraints.length > 0 ? query(collectionRef(collectionName), ...constraints) : collectionRef(collectionName);
  const snapshot = await getDocs(targetQuery);
  return snapshot.docs.map((entry) => ({
    id: entry.id,
    ...entry.data()
  }));
}
