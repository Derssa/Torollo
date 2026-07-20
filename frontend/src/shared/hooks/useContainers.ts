import { useState, useCallback, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { API_BASE } from '../types';
import type { ContainerData } from '../types';
import type { NotificationData } from './useToast';
import { readErrorMessage } from '../utils/readErrorMessage';

interface UseContainersOptions {
  projectId: string;
  onNotify?: (notification: NotificationData) => void;
}

/**
 * Custom hook that encapsulates all container CRUD operations
 * against the backend API, scoped to a specific project.
 */
export function useContainers({ projectId, onNotify }: UseContainersOptions) {
  const { t } = useTranslation();
  const [containers, setContainers] = useState<ContainerData[]>([]);
  const [loading, setLoading] = useState(false);
  const [creating, setCreating] = useState(false);
  // Last failed operation per container id, so nodes can show why they are not running.
  const [opErrors, setOpErrors] = useState<Record<string, string>>({});
  const [dockerUnavailable, setDockerUnavailable] = useState(false);
  const failedPolls = useRef(0);

  const baseUrl = `${API_BASE}/api/projects/${projectId}/containers`;

  const setOpError = useCallback((id: string, message: string) => {
    setOpErrors(prev => ({ ...prev, [id]: message }));
  }, []);

  const clearOpError = useCallback((id: string) => {
    setOpErrors(prev => {
      if (!(id in prev)) return prev;
      const rest = { ...prev };
      delete rest[id];
      return rest;
    });
  }, []);

  const fetchContainers = useCallback(async () => {
    // The banner only appears after two consecutive failed polls, so a single
    // hiccup (e.g. backend restart) does not flash "Docker unreachable".
    const registerFailedPoll = () => {
      failedPolls.current += 1;
      if (failedPolls.current >= 2) setDockerUnavailable(true);
    };
    try {
      setLoading(true);
      const res = await fetch(baseUrl);
      const data = await res.json();
      if (Array.isArray(data)) {
        setContainers(data);
        failedPolls.current = 0;
        setDockerUnavailable(false);
      } else if (data?.code === 'DOCKER_UNAVAILABLE') {
        registerFailedPoll();
      }
    } catch (err) {
      console.error('Failed to fetch containers:', err);
      registerFailedPoll();
    } finally {
      setLoading(false);
    }
  }, [baseUrl]);

  const createContainer = useCallback(async (name: string, type: string = 'ubuntu', subnetId?: string) => {
    try {
      setCreating(true);
      const res = await fetch(baseUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, type, subnetId }),
      });
      if (res.ok) {
        onNotify?.({ type: 'success', message: t('toasts.nodeCreated', { name }) });
        fetchContainers();
      } else {
        const message = await readErrorMessage(res, t('toasts.nodeCreateFailed', { name }));
        onNotify?.({ type: 'error', message });
      }
    } catch (err) {
      console.error(err);
      onNotify?.({ type: 'error', message: t('toasts.nodeCreateError') });
    } finally {
      setCreating(false);
    }
  }, [baseUrl, fetchContainers, onNotify, t]);

  const startContainer = useCallback(async (id: string) => {
    try {
      const res = await fetch(`${baseUrl}/${id}/start`, { method: 'POST' });
      if (res.ok) {
        clearOpError(id);
        fetchContainers();
      } else {
        const message = await readErrorMessage(res, t('toasts.containerStartFailed'));
        setOpError(id, message);
        onNotify?.({ type: 'error', message });
      }
    } catch (err) {
      console.error(err);
      onNotify?.({ type: 'error', message: t('toasts.containerStartUnreachable') });
    }
  }, [baseUrl, fetchContainers, onNotify, setOpError, clearOpError, t]);

  const stopContainer = useCallback(async (id: string) => {
    try {
      const res = await fetch(`${baseUrl}/${id}/stop`, { method: 'POST' });
      if (res.ok) {
        clearOpError(id);
        fetchContainers();
      } else {
        const message = await readErrorMessage(res, t('toasts.containerStopFailed'));
        setOpError(id, message);
        onNotify?.({ type: 'error', message });
      }
    } catch (err) {
      console.error(err);
      onNotify?.({ type: 'error', message: t('toasts.containerStopUnreachable') });
    }
  }, [baseUrl, fetchContainers, onNotify, setOpError, clearOpError, t]);

  const deleteContainer = useCallback(async (id: string) => {
    try {
      const res = await fetch(`${baseUrl}/${id}`, { method: 'DELETE' });
      if (res.ok) {
        setContainers(prev => prev.filter(c => c.id !== id));
        clearOpError(id);
        onNotify?.({ type: 'success', message: t('toasts.containerDeleted') });
        fetchContainers();
        return true;
      }
      const message = await readErrorMessage(res, t('toasts.containerDeleteFailed'));
      setOpError(id, message);
      onNotify?.({ type: 'error', message });
    } catch (err) {
      console.error(err);
      onNotify?.({ type: 'error', message: t('toasts.containerDeleteUnreachable') });
    }
    return false;
  }, [baseUrl, fetchContainers, onNotify, setOpError, clearOpError, t]);

  return {
    containers,
    loading,
    creating,
    opErrors,
    dockerUnavailable,
    fetchContainers,
    createContainer,
    startContainer,
    stopContainer,
    deleteContainer,
  };
}
