import { getFirebaseApp } from "./config";
import {
  SUBMISSIONS_COLLECTION,
  LOCATION_DATASETS,
  buildFirestoreDocId,
  buildSubmissionFindingId,
  slugifySpeciesId
} from "./speciesCollectionFirestore";

/**
 * Сохраняет пользовательскую находку в Firestore (коллекция user_submissions).
 * ID документа: userpoints__{finding_id}.
 */
export async function submitUserFinding(payload) {
  const [{ getFirestore, doc, collection, setDoc, serverTimestamp }, app] =
    await Promise.all([import("firebase/firestore"), getFirebaseApp()]);

  const db = getFirestore(app);
  const findingId = buildSubmissionFindingId(payload.name_latin);
  const speciesId = slugifySpeciesId(payload.name_latin);
  const docId = buildFirestoreDocId(LOCATION_DATASETS.USERPOINTS, findingId);

  await setDoc(doc(db, SUBMISSIONS_COLLECTION, docId), {
    ...payload,
    finding_id: findingId,
    species_id: speciesId,
    source: "flora35-test",
    submittedAt: serverTimestamp()
  });

  return { id: docId, finding_id: findingId };
}
