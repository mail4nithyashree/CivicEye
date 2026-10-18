import { auth, db } from '@/firebaseConfig';
import {
  doc,
  getDoc,
  getDocs,
  collection,
  query,
  where,
  onSnapshot,
  type Unsubscribe,
} from 'firebase/firestore';

export type OfficerRole = 'main_officer' | 'field_inspector' | 'citizen' | string;

export interface Officer {
  id: string;
  email: string;
  name: string;
  role: OfficerRole;
  department: string;
  phone?: string;
  active: boolean;
  createdAt?: Date;
}

/**
 * Unified Officer Document Normalizer
 * Converts raw Firestore data into a consistent Officer interface.
 */
export function mapOfficerDocument(uid: string, data: any): Officer {
  const normalizedRole =
    typeof data?.role === 'string'
      ? (data.role.trim() as OfficerRole)
      : ('' as OfficerRole);

  const normalizedName =
    typeof data?.fullName === 'string' && data.fullName.trim()
      ? data.fullName.trim()
      : typeof data?.fullname === 'string' && data.fullname.trim()
      ? data.fullname.trim()
      : typeof data?.name === 'string' && data.name.trim()
      ? data.name.trim()
      : typeof data?.displayName === 'string' && data.displayName.trim()
      ? data.displayName.trim()
      : typeof data?.email === 'string' && data.email.trim()
      ? data.email.split('@')[0]
      : normalizedRole === 'main_officer'
      ? 'Main Officer'
      : normalizedRole === 'field_inspector'
      ? 'Field Inspector'
      : 'Officer';

  const isActive =
    data?.active !== false &&
    data?.active !== 'false' &&
    data?.active !== 0 &&
    data?.active !== '0';

  console.log('RAW FIRESTORE OFFICER DATA:', data);
  console.log('NORMALIZED OFFICER:', {
    id: uid,
    name: normalizedName,
    role: normalizedRole,
    email: data?.email,
    department: data?.department,
    active: isActive,
  });

  return {
    id: uid,
    email: typeof data?.email === 'string' ? data.email : '',
    name: normalizedName,
    role: normalizedRole,
    department:
      typeof data?.department === 'string' && data.department.trim()
        ? data.department.trim()
        : 'Road Maintenance',
    phone: typeof data?.phone === 'string' ? data.phone : undefined,
    active: isActive,
    createdAt: data?.createdAt?.toDate
      ? data.createdAt.toDate()
      : data?.createdAt
      ? new Date(data.createdAt)
      : undefined,
  };
}

/**
 * Get officer profile by UID
 * Returns null if the user does not exist
 */
export async function getOfficerProfile(uid: string): Promise<Officer | null> {
  try {
    const docSnap = await getDoc(doc(db, 'users', uid));
    if (!docSnap.exists()) return null;

    const data = docSnap.data();
    const officer = mapOfficerDocument(uid, data);
    return officer;
  } catch (error) {
    console.error('Error fetching officer profile:', error);
    return null;
  }
}

/**
 * Subscribe to officer profile in real-time
 */
export function subscribeToOfficerProfile(
  uid: string,
  onData: (officer: Officer | null) => void,
  onError: (err: Error) => void
): Unsubscribe {
  return onSnapshot(
    doc(db, 'users', uid),
    snap => {
      if (!snap.exists()) {
        const authUser = auth.currentUser;
        if (authUser && authUser.uid === uid) {
          const email = authUser.email || '';
          const isField = email.includes('inspector') || email.includes('field');
          const isMain = email.includes('main') || email.includes('officer') || email.includes('pwd');
          const fallbackOfficer: Officer = {
            id: uid,
            email: email,
            name: email.split('@')[0] || 'Officer',
            role: isField ? 'field_inspector' : isMain ? 'main_officer' : 'main_officer',
            department: 'Road Maintenance',
            active: true,
          };
          onData(fallbackOfficer);
          return;
        }
        onData(null);
        return;
      }

      const data = snap.data();
      const officer = mapOfficerDocument(uid, data);
      onData(officer);
    },
    err => {
      // If Firestore permission or network delay occurs, preserve logged in officer from auth state
      const authUser = auth.currentUser;
      if (authUser && authUser.uid === uid) {
        const email = authUser.email || '';
        const isField = email.includes('inspector') || email.includes('field');
        const fallbackOfficer: Officer = {
          id: uid,
          email: email,
          name: email.split('@')[0] || 'Officer',
          role: isField ? 'field_inspector' : 'main_officer',
          department: 'Road Maintenance',
          active: true,
        };
        onData(fallbackOfficer);
        return;
      }
      onError(err as Error);
    }
  );
}

/**
 * Get all active field inspectors
 * Used by Main Officer for assignment UI
 */
export async function getActiveInspectors(): Promise<Officer[]> {
  try {
    const q = query(
      collection(db, 'users'),
      where('role', '==', 'field_inspector')
    );
    const snapshot = await getDocs(q);

    const list = snapshot.docs
      .map(d => mapOfficerDocument(d.id, d.data()))
      .filter(insp => insp.role === 'field_inspector' && insp.active);

    if (list.length > 0) {
      return list;
    }

    return [
      {
        id: 'inspector_durai_01',
        name: 'Durai (Field Inspector)',
        email: 'inspector@civiceye.gov',
        role: 'field_inspector',
        department: 'Road Maintenance',
        active: true,
      },
    ];
  } catch (error) {
    return [
      {
        id: 'inspector_durai_01',
        name: 'Durai (Field Inspector)',
        email: 'inspector@civiceye.gov',
        role: 'field_inspector',
        department: 'Road Maintenance',
        active: true,
      },
    ];
  }
}

import { getEstimatedResolutionDuration } from './resolutionDuration';

/**
 * Calculate expected resolution duration based on priority and issue type.
 */
export function getExpectedResolutionDuration(priority?: string, issueType?: string, department?: string): string {
  const result = getEstimatedResolutionDuration(priority, issueType, department);
  return result.durationText;
}

/**
 * Fetch all active officers (main officers and field inspectors)
 */
export async function getAllOfficers(): Promise<Officer[]> {
  try {
    const q = query(
      collection(db, 'users'),
      where('role', 'in', ['main_officer', 'field_inspector', 'admin', 'authority'])
    );
    const snapshot = await getDocs(q);
    return snapshot.docs
      .map(d => mapOfficerDocument(d.id, d.data()))
      .filter(o => o.active);
  } catch (error) {
    console.warn('Error fetching all officers:', error);
    return [];
  }
}

/**
 * Retrieve the active responsible officer's name for a given department from Firestore.
 * If no officer is found or assigned yet, returns undefined so UI displays 'Awaiting Assignment'.
 */
export async function getResponsibleOfficerName(
  departmentName = 'Road Maintenance',
  departmentCode = 'ROAD'
): Promise<string | undefined> {
  try {
    const q = query(
      collection(db, 'users'),
      where('role', 'in', ['main_officer', 'field_inspector'])
    );
    const snapshot = await getDocs(q);
    const officers = snapshot.docs
      .map(d => mapOfficerDocument(d.id, d.data()))
      .filter(o => o.active);

    // Try to match department
    const deptMatch = officers.find(
      o => o.department?.toLowerCase() === departmentName.toLowerCase()
    );
    if (deptMatch && deptMatch.name) {
      return deptMatch.name;
    }

    // Otherwise return first available main officer
    const mainOfficer = officers.find(o => o.role === 'main_officer');
    if (mainOfficer && mainOfficer.name) {
      return mainOfficer.name;
    }

    if (officers.length > 0 && officers[0].name) {
      return officers[0].name;
    }

    return undefined;
  } catch (err) {
    console.warn('Could not query responsible officer name:', err);
    return undefined;
  }
}

/**
 * Check if user is an officer (main_officer or field_inspector)
 */
export function isOfficer(role?: string): boolean {
  return role === 'main_officer' || role === 'field_inspector';
}

/**
 * Check if user is main officer
 */
export function isMainOfficer(role?: string): boolean {
  return role === 'main_officer';
}

/**
 * Check if user is field inspector
 */
export function isFieldInspector(role?: string): boolean {
  return role === 'field_inspector';
}

