/** Shared type definitions for the Akal Systems Lab frontend */

export interface ContainerData {
  id: string;
  name: string;
  state: string;
  status: string;
  type?: 'ubuntu' | 'postgres' | 'mysql' | 'sql' | 'nosql' | 'redis' | 'nat' | 'loadbalancer' | 'autoscalinggroup' | 'rabbitmq';
  port?: string;
  ip?: string;
  image?: string;
  asgId?: string;
  isAsgInstance?: boolean;
}


export interface Project {
  id: string;
  name: string;
  createdAt: string;
}

export interface ProjectInfo {
  id: string;
  name: string;
}

export interface TerminalInfo {
  id: string;
  name: string;
}

/**
 * Intent carried from the landing page into the canvas: open the learning
 * panel, optionally directly on one roadmap. Session-only, never persisted —
 * a reload must not replay it.
 */
export interface LearningIntent {
  roadmap?: { id: string; language: string };
}

/** API base URL for the backend */
export const API_BASE = import.meta.env.DEV
  ? 'http://localhost:23233'
  : `http://${window.location.hostname}:${(window as any).TOROLLO_BACKEND_PORT || 23233}`;
