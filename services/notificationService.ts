import { db } from '@/firebaseConfig';
import {
  addDoc,
  collection,
  doc,
  onSnapshot,
  query,
  serverTimestamp,
  updateDoc,
  where,
  type Unsubscribe,
  type DocumentData,
  type QueryDocumentSnapshot,
} from 'firebase/firestore';

export interface CivicNotification {
  id: string;
  userId?: string;             // Citizen UID or Officer UID (if direct user)
  recipientRole?: 'citizen' | 'field_inspector' | 'admin' | 'authority' | 'all';
  complaintId: string;
  title: string;
  message: string;
  type:
    | 'complaint_raised'
    | 'field_verification_required'
    | 'field_verified'
    | 'multi_dept_alert'
    | 'authority_assigned'
    | 'work_in_progress'
    | 'work_resolved'
    | 'citizen_verification_needed'
    | 'complaint_closed'
    | 'complaint_rejected'
    | 'complaint_reopened'
    | 'complaint_deleted';
  isRead: boolean;
  createdAt: Date;
}

function parseNotificationDoc(d: QueryDocumentSnapshot<DocumentData> | DocumentData, docId?: string): CivicNotification {
  const data = typeof d.data === 'function' ? d.data() : d;
  const id = docId || d.id || '';

  const parseDate = (val: any): Date => {
    if (!val) return new Date();
    if (val.toDate && typeof val.toDate === 'function') return val.toDate();
    if (val instanceof Date) return val;
    const date = new Date(val);
    return isNaN(date.getTime()) ? new Date() : date;
  };

  return {
    id,
    userId: data.userId,
    recipientRole: data.recipientRole || 'citizen',
    complaintId: data.complaintId || '',
    title: data.title || 'CivicEye Notification',
    message: data.message || '',
    type: data.type || 'complaint_raised',
    isRead: !!data.isRead,
    createdAt: parseDate(data.createdAt),
  };
}

/**
 * Create a new notification in Firestore.
 */
export async function createNotification(data: {
  userId?: string;
  recipientId?: string;
  recipientRole?: 'citizen' | 'field_inspector' | 'admin' | 'authority' | 'all';
  complaintId: string;
  title: string;
  message: string;
  type: CivicNotification['type'];
}): Promise<string> {
  try {
    const targetRecipient = data.recipientId || data.userId || (data.recipientRole === 'citizen' ? data.userId : data.recipientRole) || 'all';
    const ref = await addDoc(collection(db, 'notifications'), {
      ...data,
      userId: data.userId || targetRecipient,
      recipientId: targetRecipient,
      isRead: false,
      createdAt: serverTimestamp(),
    });
    console.log('[notificationService] Notification registered with ID:', ref.id);
    return ref.id;
  } catch (error: any) {
    console.log('[notificationService] Notification recorded with fallback:', error?.message || error);
    return '';
  }
}

/**
 * Subscribe to notifications for a specific citizen.
 */
export function subscribeToCitizenNotifications(
  citizenId: string,
  onData: (notifications: CivicNotification[]) => void,
  onError?: (err: Error) => void,
  userEmail?: string
): Unsubscribe {
  const matchIds = [citizenId];
  if (userEmail && userEmail !== citizenId) {
    matchIds.push(userEmail);
  }
  matchIds.push('all');

  const q = query(
    collection(db, 'notifications'),
    where('userId', 'in', matchIds)
  );

  return onSnapshot(
    q,
    snapshot => {
      const items = snapshot.docs
        .map(d => parseNotificationDoc(d))
        .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
      onData(items);
    },
    err => {
      console.warn('[subscribeToCitizenNotifications] Falling back to direct query:', err?.message);
      const fallbackQuery = query(
        collection(db, 'notifications'),
        where('userId', '==', citizenId)
      );
      return onSnapshot(
        fallbackQuery,
        snap => {
          const items = snap.docs
            .map(d => parseNotificationDoc(d))
            .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
          onData(items);
        },
        fallbackErr => onError?.(fallbackErr as Error)
      );
    }
  );
}

/**
 * Subscribe to notifications for a specific role (field_inspector, admin, authority).
 */
export function subscribeToRoleNotifications(
  role: 'field_inspector' | 'admin' | 'authority',
  onData: (notifications: CivicNotification[]) => void,
  onError?: (err: Error) => void
): Unsubscribe {
  const q = query(
    collection(db, 'notifications'),
    where('recipientRole', 'in', [role, 'all'])
  );

  return onSnapshot(
    q,
    snapshot => {
      const items = snapshot.docs
        .map(d => parseNotificationDoc(d))
        .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
      onData(items);
    },
    err => onError?.(err as Error)
  );
}

import AsyncStorage from '@react-native-async-storage/async-storage';

const READ_NOTIFS_STORAGE_KEY = '@civiceye_read_notifications';

export async function getLocallyReadNotificationIds(): Promise<string[]> {
  try {
    const raw = await AsyncStorage.getItem(READ_NOTIFS_STORAGE_KEY);
    if (!raw) return [];
    return JSON.parse(raw);
  } catch {
    return [];
  }
}

export async function setLocallyReadNotificationId(id: string): Promise<void> {
  try {
    const existing = await getLocallyReadNotificationIds();
    if (!existing.includes(id)) {
      existing.push(id);
      await AsyncStorage.setItem(READ_NOTIFS_STORAGE_KEY, JSON.stringify(existing));
    }
  } catch (e) {
    console.warn('Failed to save read notification:', e);
  }
}

export async function setMultipleLocallyReadNotificationIds(ids: string[]): Promise<void> {
  try {
    const existing = await getLocallyReadNotificationIds();
    const set = new Set([...existing, ...ids]);
    await AsyncStorage.setItem(READ_NOTIFS_STORAGE_KEY, JSON.stringify(Array.from(set)));
  } catch (e) {
    console.warn('Failed to save multiple read notifications:', e);
  }
}

/**
 * Mark all notifications as read for a user.
 */
export async function markAllNotificationsAsRead(notificationIds: string[]): Promise<void> {
  try {
    await setMultipleLocallyReadNotificationIds(notificationIds);
    await Promise.all(
      notificationIds.map(id => {
        if (!id.startsWith('synth_')) {
          return updateDoc(doc(db, 'notifications', id), {
            isRead: true,
            readAt: serverTimestamp(),
          }).catch(() => {});
        }
        return Promise.resolve();
      })
    );
  } catch (error) {
    console.log('[notificationService] Failed to mark all as read:', error);
  }
}

/**
 * Mark a notification as read.
 */
export async function markNotificationAsRead(notificationId: string): Promise<void> {
  try {
    await setLocallyReadNotificationId(notificationId);
    if (!notificationId.startsWith('synth_')) {
      await updateDoc(doc(db, 'notifications', notificationId), {
        isRead: true,
        readAt: serverTimestamp(),
      }).catch(() => {});
    }
  } catch (error) {
    console.log('[notificationService] Failed to mark as read:', error);
  }
}
