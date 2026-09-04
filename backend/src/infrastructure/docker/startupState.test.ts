import {
  getStartupState,
  hostForwardingResolved,
  imagesPlanned,
  imageReady,
  imageStarted,
  resetStartupState,
  rootlessDetected,
  startupBegan,
  startupFailed,
  startupFinished,
} from './startupState';

describe('startupState', () => {
  beforeEach(() => resetStartupState());

  it('starts pending with nothing known', () => {
    expect(getStartupState()).toEqual({
      status: 'pending',
      rootless: null,
      hostForwarding: { status: 'pending' },
      images: { total: 0, ready: 0, current: null },
      error: null,
    });
  });

  it('tracks the image being processed and the count of ready ones', () => {
    startupBegan();
    imagesPlanned(3);
    imageStarted('Ubuntu', 'checking');
    expect(getStartupState().images).toEqual({ total: 3, ready: 0, current: { label: 'Ubuntu', action: 'checking' } });

    imageReady();
    imageStarted('Redis', 'pulling');
    expect(getStartupState().images).toEqual({ total: 3, ready: 1, current: { label: 'Redis', action: 'pulling' } });

    imageStarted('Redis', 'building');
    expect(getStartupState().images.current).toEqual({ label: 'Redis', action: 'building' });
  });

  it('clears the current image once the routine finishes', () => {
    startupBegan();
    imagesPlanned(1);
    imageStarted('Ubuntu', 'pulling');
    startupFinished();
    expect(getStartupState()).toMatchObject({ status: 'ready', images: { current: null } });
  });

  it('records rootless and the host forwarding outcome with its reason', () => {
    rootlessDetected(true);
    hostForwardingResolved('unsupported');
    expect(getStartupState()).toMatchObject({ rootless: true, hostForwarding: { status: 'unsupported', reason: 'rootless' } });

    hostForwardingResolved('failed');
    expect(getStartupState().hostForwarding).toEqual({ status: 'failed', reason: 'error' });

    hostForwardingResolved('applied');
    expect(getStartupState().hostForwarding).toEqual({ status: 'applied' });
  });

  it('keeps the failure message, whether an Error or not', () => {
    startupBegan();
    startupFailed(new Error('pull access denied'));
    expect(getStartupState()).toMatchObject({ status: 'failed', error: 'pull access denied' });

    startupFailed('plain string');
    expect(getStartupState().error).toBe('plain string');
  });

  it('starts a fresh state on every begin', () => {
    startupBegan();
    imagesPlanned(2);
    imageReady();
    startupFailed(new Error('boom'));

    startupBegan();
    expect(getStartupState()).toMatchObject({ status: 'running', images: { total: 0, ready: 0 }, error: null });
  });

  it('hands out snapshots, not the live object', () => {
    startupBegan();
    imagesPlanned(1);
    imageStarted('Ubuntu', 'pulling');
    const snapshot = getStartupState();
    imageReady();
    expect(snapshot.images).toEqual({ total: 1, ready: 0, current: { label: 'Ubuntu', action: 'pulling' } });
  });
});
