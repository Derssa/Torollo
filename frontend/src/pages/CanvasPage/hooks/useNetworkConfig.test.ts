import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';
import { useNetworkConfig } from './useNetworkConfig';
import type { NetworkConfig } from '../../../shared/types/network';

function jsonResponse(ok: boolean, body: unknown): Response {
  return { ok, json: () => Promise.resolve(body) } as Response;
}

const baseArgs = {
  projectId: 'project-1',
  containers: [],
  showNotification: vi.fn(),
};

function emptyConfig(): NetworkConfig {
  return {
    vpcConfig: {
      name: 'Main Network',
      cidr: '10.0.0.0/16',
      dnsEnabled: true,
      igwEnabled: true,
      description: 'Project-wide Virtual Private Cloud',
    },
    subnets: [],
    nodeSubnetMap: {},
    nodeSecurityGroups: {},
    nodeIpMap: {},
  } as NetworkConfig;
}

describe('useNetworkConfig — inter-subnet health', () => {
  let fetchMock: ReturnType<typeof vi.fn>;

  /** Routes fetch calls by URL: health GETs get `health`, config POSTs get `saved`. */
  function routeFetch(health: unknown, saved: unknown = emptyConfig()) {
    fetchMock.mockImplementation((url: string) => {
      if (String(url).includes('/network-health')) {
        return Promise.resolve(jsonResponse(true, health));
      }
      return Promise.resolve(jsonResponse(true, saved));
    });
  }

  beforeEach(() => {
    fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    localStorage.clear();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('reports a blocked host after the mount-time health check', async () => {
    routeFetch({ interSubnet: 'blocked' });

    const { result } = renderHook(() => useNetworkConfig(baseArgs));

    await waitFor(() => expect(result.current.interSubnetBlocked).toBe(true));
    expect(fetchMock).toHaveBeenCalledWith(expect.stringContaining('/api/projects/project-1/network-health'));
  });

  it('stays quiet for ok and unknown verdicts', async () => {
    routeFetch({ interSubnet: 'ok' });

    const { result } = renderHook(() => useNetworkConfig(baseArgs));

    await waitFor(() =>
      expect(fetchMock).toHaveBeenCalledWith(expect.stringContaining('/network-health'))
    );
    expect(result.current.interSubnetBlocked).toBe(false);
  });

  it('stays quiet when the health endpoint is unreachable', async () => {
    fetchMock.mockRejectedValue(new Error('network down'));

    const { result } = renderHook(() => useNetworkConfig(baseArgs));

    await waitFor(() => expect(fetchMock).toHaveBeenCalled());
    expect(result.current.interSubnetBlocked).toBe(false);
  });

  it('refreshes the verdict after a config save', async () => {
    let health: { interSubnet: string } = { interSubnet: 'ok' };
    fetchMock.mockImplementation((url: string) => {
      if (String(url).includes('/network-health')) {
        return Promise.resolve(jsonResponse(true, health));
      }
      return Promise.resolve(jsonResponse(true, emptyConfig()));
    });

    const { result } = renderHook(() => useNetworkConfig(baseArgs));
    await waitFor(() => expect(result.current.interSubnetBlocked).toBe(false));

    // The save's enforcement run found the host blocked.
    health = { interSubnet: 'blocked' };
    await act(async () => {
      await result.current.saveNetworkConfig(emptyConfig());
    });

    await waitFor(() => expect(result.current.interSubnetBlocked).toBe(true));
  });
});
