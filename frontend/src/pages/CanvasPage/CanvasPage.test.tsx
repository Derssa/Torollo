import '../../i18n';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, createEvent, waitFor, within, act } from '@testing-library/react';
import CanvasPage from './CanvasPage';

// Drag geometry, security-rule creation and rule->edge derivation cannot be
// driven through jsdom (no layout engine, no measurable React Flow handles).
// They are unit-tested directly in utils/canvasGeometry.test.ts,
// utils/securityRules.test.ts and utils/networkConfigOps.test.ts.

function jsonResponse(ok: boolean, body: unknown) {
  return Promise.resolve({ ok, json: () => Promise.resolve(body) } as Response);
}

function subnetFixture(overrides: Record<string, unknown> = {}) {
  return {
    id: 'subnet-1',
    name: 'Public Subnet-1',
    type: 'public',
    vpcId: 'root-vpc',
    position: { x: 0, y: 0 },
    width: 680,
    height: 260,
    columns: 2,
    rows: 1,
    routes: [],
    ...overrides,
  };
}

/** Bodies of every POST to /network-config, oldest first. */
function networkConfigPosts(fetchMock: ReturnType<typeof vi.fn>) {
  return fetchMock.mock.calls
    .filter(c => (c[0] as string).includes('/network-config') && (c[1] as RequestInit | undefined)?.method === 'POST')
    .map(c => JSON.parse((c[1] as RequestInit).body as string).networkConfig);
}

/** React Flow wraps each node in an element carrying data-id={node.id}. */
function nodeEl(container: HTMLElement, id: string) {
  return container.querySelector(`.react-flow__node[data-id="${id}"]`) as HTMLElement;
}

/**
 * jsdom has no DragEvent, so fireEvent's option bag silently drops
 * clientX/clientY — they must be defined onto a hand-built event for
 * screenToFlowPosition to receive real coordinates.
 */
function dropOnCanvas(canvas: Element, type: string, clientX: number, clientY: number) {
  const dataTransfer = { getData: () => type, dropEffect: '' } as unknown as DataTransfer;
  fireEvent.dragOver(canvas, { dataTransfer });
  const dropEvent = createEvent.drop(canvas);
  Object.defineProperties(dropEvent, {
    clientX: { value: clientX },
    clientY: { value: clientY },
    dataTransfer: { value: dataTransfer },
  });
  fireEvent(canvas, dropEvent);
}

const validVpcConfig = {
  name: 'Main Network',
  cidr: '10.0.0.0/16',
  dnsEnabled: true,
  igwEnabled: true,
  description: 'Project-wide Virtual Private Cloud',
};

function buildFetchMock({ containers = [] as unknown[], networkConfig }: { containers?: unknown[]; networkConfig: unknown }) {
  return vi.fn((url: string, init?: RequestInit) => {
    const method = init?.method || 'GET';
    if (url.includes('/network-config')) {
      if (method === 'POST') return jsonResponse(true, {});
      return jsonResponse(true, networkConfig);
    }
    if (url.includes('/explorer')) return jsonResponse(true, []);
    if (url.includes('/rename')) return jsonResponse(true, {});
    if (method === 'DELETE') return jsonResponse(true, {});
    if (method === 'POST') return jsonResponse(true, {});
    // GET containers list — return a fresh array each time, like res.json()
    // on a real response, so stateful mutations of `containers` in a test are
    // seen as a new state by React instead of bailing out on the same ref.
    return jsonResponse(true, [...containers]);
  });
}

async function renderCanvasPage(fetchMock: ReturnType<typeof vi.fn>, props: Partial<Parameters<typeof CanvasPage>[0]> = {}) {
  vi.stubGlobal('fetch', fetchMock);
  const view = render(
    <CanvasPage
      projectId="p1"
      projectName="Test Project"
      initialLearning={props.initialLearning}
      onLearningIntentConsumed={props.onLearningIntentConsumed}
      onBackToProjects={props.onBackToProjects || vi.fn()}
      onTerminalOpen={props.onTerminalOpen || vi.fn()}
    />
  );
  // Flush the mount effect's two fetches (containers + network-config).
  await act(async () => {
    await Promise.resolve();
    await Promise.resolve();
  });
  return view;
}

describe('CanvasPage', () => {
  beforeEach(() => {
    localStorage.clear();
    // React Flow computes viewport/fitView and hit-testing off the pane element's
    // real layout, which jsdom always reports as a zero-sized rect. Give it a
    // plausible size so screenToFlowPosition produces usable coordinates.
    Element.prototype.getBoundingClientRect = vi.fn(() => ({
      width: 1000, height: 800, top: 0, left: 0, right: 1000, bottom: 800, x: 0, y: 0, toJSON: () => {},
    }));
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });

  it('opens the learning panel on mount when an arrival intent is given, and consumes it once', async () => {
    const fetchMock = buildFetchMock({ containers: [], networkConfig: { vpcConfig: validVpcConfig, subnets: [], nodeSubnetMap: {}, nodeSecurityGroups: {}, nodeIpMap: {} } });
    const onLearningIntentConsumed = vi.fn();
    await renderCanvasPage(fetchMock, { initialLearning: {}, onLearningIntentConsumed });

    // Topbar button + panel header both say "Learning": 2 means the panel is open.
    expect(screen.getAllByText('Learning')).toHaveLength(2);
    expect(onLearningIntentConsumed).toHaveBeenCalledTimes(1);
  });

  it('keeps the learning panel closed without an arrival intent', async () => {
    const fetchMock = buildFetchMock({ containers: [], networkConfig: { vpcConfig: validVpcConfig, subnets: [], nodeSubnetMap: {}, nodeSecurityGroups: {}, nodeIpMap: {} } });
    await renderCanvasPage(fetchMock);

    // The topbar button is labeled via topbar.learning; the panel header ("Learning")
    // must not be there. Both resolve to the same string, so count occurrences.
    expect(screen.getAllByText('Learning')).toHaveLength(1);
  });

  it('fetches containers and network config on mount and renders the project header', async () => {
    const fetchMock = buildFetchMock({ containers: [], networkConfig: { vpcConfig: validVpcConfig, subnets: [], nodeSubnetMap: {}, nodeSecurityGroups: {}, nodeIpMap: {} } });
    await renderCanvasPage(fetchMock);

    expect(screen.getByText('Project:')).toBeInTheDocument();
    expect(screen.getAllByText('Test Project').length).toBeGreaterThan(0);

    const calledUrls = fetchMock.mock.calls.map(c => c[0] as string);
    expect(calledUrls.some(u => u.endsWith('/api/projects/p1/containers'))).toBe(true);
    expect(calledUrls.some(u => u.endsWith('/api/projects/p1/network-config'))).toBe(true);
  });

  it('renders a fetched container as a node on the canvas', async () => {
    const networkConfig = {
      vpcConfig: validVpcConfig,
      subnets: [{ id: 'subnet-1', name: 'Public Subnet-1', type: 'public', vpcId: 'root-vpc', position: { x: 0, y: 0 }, width: 680, height: 260, columns: 2, rows: 1, routes: [] }],
      nodeSubnetMap: { c1: 'subnet-1' },
      nodeSecurityGroups: {},
      nodeIpMap: { c1: '10.0.1.2' },
    };
    const fetchMock = buildFetchMock({
      containers: [{ id: 'c1', name: 'web-1', state: 'running', status: 'running', type: 'ubuntu' }],
      networkConfig,
    });
    await renderCanvasPage(fetchMock);

    await waitFor(() => expect(screen.getByText('web-1')).toBeInTheDocument());
  });

  it('opens the Postgres inspector modal when clicking a running postgres node, and closes it', async () => {
    const networkConfig = {
      vpcConfig: validVpcConfig,
      subnets: [{ id: 'subnet-1', name: 'Public Subnet-1', type: 'public', vpcId: 'root-vpc', position: { x: 0, y: 0 }, width: 680, height: 260, columns: 2, rows: 1, routes: [] }],
      nodeSubnetMap: { c1: 'subnet-1' },
      nodeSecurityGroups: {},
      nodeIpMap: { c1: '10.0.1.2' },
    };
    const fetchMock = buildFetchMock({
      containers: [{ id: 'c1', name: 'db-1', state: 'running', status: 'running', type: 'postgres' }],
      networkConfig,
    });
    await renderCanvasPage(fetchMock);

    await waitFor(() => expect(screen.getByText('db-1')).toBeInTheDocument());
    fireEvent.click(screen.getByTitle('Inspect Database Explorer / Shell'));
    await act(async () => {
      await Promise.resolve();
    });

    const detailsTabButton = screen.getByRole('button', { name: /Details & Config/i });
    expect(detailsTabButton).toBeInTheDocument();

    // Close via the modal's header close (X) button, which sits alongside the tab
    // buttons but has no accessible name of its own — locate it by DOM position.
    const header = detailsTabButton.closest('div')!.parentElement!;
    const headerButtons = within(header as HTMLElement).getAllByRole('button');
    fireEvent.click(headerButtons[headerButtons.length - 1]);

    expect(screen.queryByRole('button', { name: /Details & Config/i })).not.toBeInTheDocument();
  });

  it('shows an error and never opens the create-node modal when dropping outside any subnet', async () => {
    const networkConfig = { vpcConfig: validVpcConfig, subnets: [], nodeSubnetMap: {}, nodeSecurityGroups: {}, nodeIpMap: {} };
    const fetchMock = buildFetchMock({ containers: [], networkConfig });
    const { container } = await renderCanvasPage(fetchMock);

    const canvas = container.querySelector('.react-flow')!;
    dropOnCanvas(canvas, 'ubuntu', 100, 100);

    await waitFor(() => expect(screen.getByText('Nodes must reside within a subnet.')).toBeInTheDocument());
    expect(screen.queryByText('Give your new container a descriptive name.')).not.toBeInTheDocument();
  });

  it('shows the delete confirmation for a node, only deletes on confirm, and drops its saved layout position', async () => {
    localStorage.setItem('akal-lab-graph-layout-p1', JSON.stringify({ c1: { x: 60, y: 60 } }));
    const networkConfig = {
      vpcConfig: validVpcConfig,
      subnets: [{ id: 'subnet-1', name: 'Public Subnet-1', type: 'public', vpcId: 'root-vpc', position: { x: 0, y: 0 }, width: 680, height: 260, columns: 2, rows: 1, routes: [] }],
      nodeSubnetMap: { c1: 'subnet-1' },
      nodeSecurityGroups: {},
      nodeIpMap: { c1: '10.0.1.2' },
    };
    const containers = [{ id: 'c1', name: 'web-1', state: 'running', status: 'running', type: 'ubuntu' }];
    const fetchMock = buildFetchMock({ containers, networkConfig });
    // Stateful mock: after a successful delete, subsequent container fetches
    // must no longer return the node, like the real backend would.
    const base = fetchMock.getMockImplementation()!;
    fetchMock.mockImplementation((url: string, init?: RequestInit) => {
      if (init?.method === 'DELETE') containers.length = 0;
      return base(url, init);
    });
    await renderCanvasPage(fetchMock);

    await waitFor(() => expect(screen.getByText('web-1')).toBeInTheDocument());
    fireEvent.click(screen.getByTitle('Delete Node'));

    expect(screen.getByText('Delete Container')).toBeInTheDocument();
    expect(screen.getByText('This will permanently stop and remove this container. This action cannot be undone.')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(fetchMock.mock.calls.some(c => (c[1] as RequestInit | undefined)?.method === 'DELETE')).toBe(false);
    expect(screen.queryByText('Delete Container')).not.toBeInTheDocument();

    fireEvent.click(screen.getByTitle('Delete Node'));
    fireEvent.click(screen.getByRole('button', { name: 'Delete' }));

    await waitFor(() => expect(fetchMock.mock.calls.some(c => (c[1] as RequestInit | undefined)?.method === 'DELETE')).toBe(true));
    await waitFor(() => {
      const layout = JSON.parse(localStorage.getItem('akal-lab-graph-layout-p1')!);
      expect(layout['c1']).toBeUndefined();
    });
  });

  it('renames a stopped node via PATCH and keeps its saved layout position under the container id', async () => {
    const networkConfig = {
      vpcConfig: validVpcConfig,
      subnets: [subnetFixture()],
      nodeSubnetMap: { c1: 'subnet-1' },
      nodeSecurityGroups: {},
      nodeIpMap: { c1: '10.0.1.2' },
    };
    const containers = [{ id: 'c1', name: 'web-1', state: 'stopped', status: 'stopped', type: 'ubuntu' }];
    const fetchMock = buildFetchMock({ containers, networkConfig });
    // Make the mock stateful: after a successful rename, subsequent container
    // fetches must return the new name, like the real backend would.
    const base = fetchMock.getMockImplementation()!;
    fetchMock.mockImplementation((url: string, init?: RequestInit) => {
      if (url.includes('/rename')) {
        containers[0] = { ...containers[0], name: JSON.parse(init!.body as string).newName };
      }
      return base(url, init);
    });
    const { container } = await renderCanvasPage(fetchMock);

    await waitFor(() => expect(screen.getByText('web-1')).toBeInTheDocument());
    fireEvent.click(within(nodeEl(container, 'c1')).getByText((_, el) => el?.getAttribute('data-tooltip') === 'Rename node', { selector: 'button' }));

    const input = screen.getByPlaceholderText('e.g. api-gateway') as HTMLInputElement;
    expect(input.value).toBe('web-1');
    fireEvent.change(input, { target: { value: 'web-2' } });
    fireEvent.click(screen.getByRole('button', { name: 'Rename' }));

    await waitFor(() => expect(screen.getByText('Node renamed to "web-2"')).toBeInTheDocument());
    const patchCall = fetchMock.mock.calls.find(c => (c[1] as RequestInit | undefined)?.method === 'PATCH')!;
    expect(patchCall[0]).toContain('/api/projects/p1/containers/c1/rename');
    expect(JSON.parse((patchCall[1] as RequestInit).body as string)).toEqual({ newName: 'web-2' });

    await waitFor(() => {
      const layout = JSON.parse(localStorage.getItem('akal-lab-graph-layout-p1')!);
      expect(layout['c1']).toBeDefined();
      expect(layout['web-1']).toBeUndefined();
      expect(layout['web-2']).toBeUndefined();
    });
  });

  it('blocks renaming to the same name (warning) or an existing name (error) without calling the API', async () => {
    const networkConfig = {
      vpcConfig: validVpcConfig,
      subnets: [subnetFixture()],
      nodeSubnetMap: { c1: 'subnet-1', c2: 'subnet-1' },
      nodeSecurityGroups: {},
      nodeIpMap: { c1: '10.0.1.2', c2: '10.0.1.3' },
    };
    const fetchMock = buildFetchMock({
      containers: [
        { id: 'c1', name: 'web-1', state: 'stopped', status: 'stopped', type: 'ubuntu' },
        { id: 'c2', name: 'web-2', state: 'stopped', status: 'stopped', type: 'ubuntu' },
      ],
      networkConfig,
    });
    const { container } = await renderCanvasPage(fetchMock);
    await waitFor(() => expect(screen.getByText('web-1')).toBeInTheDocument());

    const openRename = () =>
      fireEvent.click(nodeEl(container, 'c1').querySelector('[data-tooltip="Rename node"]')!);

    // Same name: warns and closes the modal.
    openRename();
    fireEvent.click(screen.getByRole('button', { name: 'Rename' }));
    await waitFor(() => expect(screen.getByText('The node is already named "web-1".')).toBeInTheDocument());
    expect(screen.queryByText('Rename Node')).not.toBeInTheDocument();

    // Duplicate name: errors and keeps the modal open.
    openRename();
    fireEvent.change(screen.getByPlaceholderText('e.g. api-gateway'), { target: { value: 'web-2' } });
    fireEvent.click(screen.getByRole('button', { name: 'Rename' }));
    await waitFor(() => expect(screen.getByText('A node named "web-2" already exists in this project.')).toBeInTheDocument());
    expect(screen.getByText('Rename Node')).toBeInTheDocument();

    expect(fetchMock.mock.calls.some(c => (c[1] as RequestInit | undefined)?.method === 'PATCH')).toBe(false);
  });

  it('surfaces the server error message when the rename request fails', async () => {
    const networkConfig = {
      vpcConfig: validVpcConfig,
      subnets: [subnetFixture()],
      nodeSubnetMap: { c1: 'subnet-1' },
      nodeSecurityGroups: {},
      nodeIpMap: { c1: '10.0.1.2' },
    };
    const fetchMock = buildFetchMock({
      containers: [{ id: 'c1', name: 'web-1', state: 'stopped', status: 'stopped', type: 'ubuntu' }],
      networkConfig,
    });
    const base = fetchMock.getMockImplementation()!;
    fetchMock.mockImplementation((url: string, init?: RequestInit) => {
      if (url.includes('/rename')) return jsonResponse(false, { error: 'Container is locked by the runtime' });
      return base(url, init);
    });
    const { container } = await renderCanvasPage(fetchMock);
    await waitFor(() => expect(screen.getByText('web-1')).toBeInTheDocument());

    fireEvent.click(nodeEl(container, 'c1').querySelector('[data-tooltip="Rename node"]')!);
    fireEvent.change(screen.getByPlaceholderText('e.g. api-gateway'), { target: { value: 'web-9' } });
    fireEvent.click(screen.getByRole('button', { name: 'Rename' }));

    await waitFor(() => expect(screen.getByText('Container is locked by the runtime')).toBeInTheDocument());
  });

  it('surfaces the server error and flags the node when starting a container fails', async () => {
    const networkConfig = {
      vpcConfig: validVpcConfig,
      subnets: [subnetFixture()],
      nodeSubnetMap: { c1: 'subnet-1' },
      nodeSecurityGroups: {},
      nodeIpMap: { c1: '10.0.1.2' },
    };
    const fetchMock = buildFetchMock({
      containers: [{ id: 'c1', name: 'web-1', state: 'stopped', status: 'stopped', type: 'ubuntu' }],
      networkConfig,
    });
    const base = fetchMock.getMockImplementation()!;
    const portError = 'A port this container needs is already taken on your machine. Stop the application using it, then try again.';
    fetchMock.mockImplementation((url: string, init?: RequestInit) => {
      if (url.includes('/start')) return jsonResponse(false, { error: portError, code: 'PORT_IN_USE' });
      return base(url, init);
    });
    const { container } = await renderCanvasPage(fetchMock);
    await waitFor(() => expect(screen.getByText('web-1')).toBeInTheDocument());

    fireEvent.click(within(nodeEl(container, 'c1')).getByTitle('Start Node'));

    // The reason appears both as a toast and as a persistent badge on the node.
    await waitFor(() => expect(screen.getAllByText(portError).length).toBeGreaterThan(0));
    await waitFor(() => expect(within(nodeEl(container, 'c1')).getByText('Error')).toBeInTheDocument());
    expect(within(nodeEl(container, 'c1')).getByText(portError)).toBeInTheDocument();
  });

  it('deleting a node cascades cleanup of its subnet mapping, security groups, rules targeting it, and IP', async () => {
    const networkConfig = {
      vpcConfig: validVpcConfig,
      subnets: [subnetFixture()],
      nodeSubnetMap: { c1: 'subnet-1', c2: 'subnet-1' },
      nodeSecurityGroups: {
        c1: [{ id: 'r0', type: 'inbound', action: 'DENY', protocol: 'ALL', port: 'ALL', source: '0.0.0.0/0' }],
        c2: [
          { id: 'r1', type: 'inbound', action: 'ALLOW', protocol: 'TCP', port: '5432', source: 'c1' },
          { id: 'r2', type: 'outbound', action: 'ALLOW', protocol: 'ALL', port: 'ALL', source: '0.0.0.0/0' },
        ],
      },
      nodeIpMap: { c1: '10.0.1.2', c2: '10.0.1.3' },
    };
    const containers = [
      { id: 'c1', name: 'web-1', state: 'running', status: 'running', type: 'ubuntu' },
      { id: 'c2', name: 'db-1', state: 'running', status: 'running', type: 'postgres' },
    ];
    const fetchMock = buildFetchMock({ containers, networkConfig });
    // Stateful delete: refetches after the DELETE must no longer return c1.
    const base = fetchMock.getMockImplementation()!;
    fetchMock.mockImplementation((url: string, init?: RequestInit) => {
      if (init?.method === 'DELETE') {
        const id = (url as string).split('/').pop();
        containers.splice(containers.findIndex(c => c.id === id), 1);
      }
      return base(url, init);
    });
    const { container } = await renderCanvasPage(fetchMock);
    await waitFor(() => expect(screen.getByText('web-1')).toBeInTheDocument());

    fireEvent.click(within(nodeEl(container, 'c1')).getByTitle('Delete Node'));
    fireEvent.click(screen.getByRole('button', { name: 'Delete' }));

    await waitFor(() => expect(networkConfigPosts(fetchMock).length).toBeGreaterThan(0));
    const posted = networkConfigPosts(fetchMock).at(-1);
    expect(posted.nodeSubnetMap).toEqual({ c2: 'subnet-1' });
    expect(posted.nodeSecurityGroups.c1).toBeUndefined();
    expect(posted.nodeSecurityGroups.c2).toEqual([
      { id: 'r2', type: 'outbound', action: 'ALLOW', protocol: 'ALL', port: 'ALL', source: '0.0.0.0/0' },
    ]);
    expect(posted.nodeIpMap).toEqual({ c2: '10.0.1.3' });
    expect(JSON.parse(localStorage.getItem('akal-lab-network-config-p1')!)).toEqual(posted);
  });

  it('blocks deleting a subnet that still contains nodes', async () => {
    const networkConfig = {
      vpcConfig: validVpcConfig,
      subnets: [subnetFixture()],
      nodeSubnetMap: { c1: 'subnet-1' },
      nodeSecurityGroups: {},
      nodeIpMap: { c1: '10.0.1.2' },
    };
    const fetchMock = buildFetchMock({
      containers: [{ id: 'c1', name: 'web-1', state: 'running', status: 'running', type: 'ubuntu' }],
      networkConfig,
    });
    await renderCanvasPage(fetchMock);
    await waitFor(() => expect(screen.getByText('web-1')).toBeInTheDocument());

    fireEvent.click(screen.getByTitle('Delete Subnet'));

    await waitFor(() => expect(screen.getByText('Cannot delete subnet: Move or delete all nodes inside the subnet first.')).toBeInTheDocument());
    expect(networkConfigPosts(fetchMock)).toHaveLength(0);
    expect(screen.getByText('Public Subnet-1')).toBeInTheDocument();
  });

  it('deletes an empty subnet and removes it from the persisted network config', async () => {
    const networkConfig = { vpcConfig: validVpcConfig, subnets: [subnetFixture()], nodeSubnetMap: {}, nodeSecurityGroups: {}, nodeIpMap: {} };
    const fetchMock = buildFetchMock({ containers: [], networkConfig });
    await renderCanvasPage(fetchMock);
    await waitFor(() => expect(screen.getByText('Public Subnet-1')).toBeInTheDocument());

    fireEvent.click(screen.getByTitle('Delete Subnet'));

    await waitFor(() => expect(networkConfigPosts(fetchMock).length).toBeGreaterThan(0));
    const posted = networkConfigPosts(fetchMock).at(-1);
    expect(posted.subnets).toEqual([]);
    expect(JSON.parse(localStorage.getItem('akal-lab-network-config-p1')!).subnets).toEqual([]);
    await waitFor(() => expect(screen.queryByText('Public Subnet-1')).not.toBeInTheDocument());
  });

  it('growing a subnet grid recomputes its columns, width and height in the persisted config', async () => {
    const networkConfig = { vpcConfig: validVpcConfig, subnets: [subnetFixture()], nodeSubnetMap: {}, nodeSecurityGroups: {}, nodeIpMap: {} };
    const fetchMock = buildFetchMock({ containers: [], networkConfig });
    await renderCanvasPage(fetchMock);
    await waitFor(() => expect(screen.getByText('Public Subnet-1')).toBeInTheDocument());

    fireEvent.click(screen.getByTitle('Increase Columns'));

    await waitFor(() => expect(networkConfigPosts(fetchMock).length).toBeGreaterThan(0));
    const posted = networkConfigPosts(fetchMock).at(-1);
    expect(posted.subnets[0]).toMatchObject({ columns: 3, rows: 1, width: 3 * 340, height: 70 + 1 * 190 });
  });

  it('blocks shrinking a subnet grid over an occupied cell, naming the blocking node', async () => {
    localStorage.setItem('akal-lab-graph-layout-p1', JSON.stringify({
      c1: { x: 60 + 2 * 340, y: 60 },
    }));
    const networkConfig = {
      vpcConfig: validVpcConfig,
      subnets: [subnetFixture({ columns: 3, width: 1020 })],
      nodeSubnetMap: { c1: 'subnet-1' },
      nodeSecurityGroups: {},
      nodeIpMap: { c1: '10.0.1.2' },
    };
    const fetchMock = buildFetchMock({
      containers: [{ id: 'c1', name: 'web-1', state: 'running', status: 'running', type: 'ubuntu' }],
      networkConfig,
    });
    await renderCanvasPage(fetchMock);
    await waitFor(() => expect(screen.getByText('web-1')).toBeInTheDocument());

    fireEvent.click(screen.getByTitle('Reduce Columns'));

    await waitFor(() => expect(screen.getByText(`Cannot shrink grid. You should remove the node with name 'web-1' to be able to reduce the size`)).toBeInTheDocument());
    expect(networkConfigPosts(fetchMock)).toHaveLength(0);
  });

  it('shows only the highest-priority audit message: errors win over warnings', async () => {
    const networkConfig = {
      vpcConfig: validVpcConfig,
      subnets: [subnetFixture()],
      // "ghost" maps to a subnet that does not exist (error); "db-1" is a data
      // store sitting in a public subnet (warning).
      nodeSubnetMap: { c1: 'subnet-1', c2: 'subnet-missing' },
      nodeSecurityGroups: {},
      nodeIpMap: { c1: '10.0.1.2' },
    };
    const fetchMock = buildFetchMock({
      containers: [
        { id: 'c1', name: 'db-1', state: 'running', status: 'running', type: 'postgres' },
        { id: 'c2', name: 'ghost', state: 'running', status: 'running', type: 'ubuntu' },
      ],
      networkConfig,
    });
    await renderCanvasPage(fetchMock);
    await waitFor(() => expect(screen.getByText('db-1')).toBeInTheDocument());

    // Any config-mutating action re-runs the audit; growing the grid is the simplest.
    fireEvent.click(screen.getByTitle('Increase Columns'));

    await waitFor(() => expect(screen.getByText('Node "ghost" is assigned to a subnet that does not exist.')).toBeInTheDocument());
    expect(screen.queryByText(/is in a public subnet/)).not.toBeInTheDocument();
  });

  it('polls the containers endpoint every 4 seconds', async () => {
    vi.useFakeTimers();
    const networkConfig = { vpcConfig: validVpcConfig, subnets: [], nodeSubnetMap: {}, nodeSecurityGroups: {}, nodeIpMap: {} };
    const fetchMock = buildFetchMock({ containers: [], networkConfig });
    await renderCanvasPage(fetchMock);

    const containerFetches = () =>
      fetchMock.mock.calls.filter(c => (c[0] as string).endsWith('/api/projects/p1/containers') && !(c[1] as RequestInit | undefined)?.method).length;
    expect(containerFetches()).toBe(1);

    await act(async () => {
      await vi.advanceTimersByTimeAsync(4000);
    });
    expect(containerFetches()).toBe(2);

    await act(async () => {
      await vi.advanceTimersByTimeAsync(4000);
    });
    expect(containerFetches()).toBe(3);
  });

  it('dropping a service inside a subnet opens the create modal, which blocks duplicate names', async () => {
    const networkConfig = {
      vpcConfig: validVpcConfig,
      subnets: [subnetFixture()],
      nodeSubnetMap: { c1: 'subnet-1' },
      nodeSecurityGroups: {},
      nodeIpMap: { c1: '10.0.1.2' },
    };
    const fetchMock = buildFetchMock({
      containers: [{ id: 'c1', name: 'web-1', state: 'running', status: 'running', type: 'ubuntu' }],
      networkConfig,
    });
    const { container } = await renderCanvasPage(fetchMock);
    await waitFor(() => expect(screen.getByText('web-1')).toBeInTheDocument());

    const canvas = container.querySelector('.react-flow')!;
    // The subnet occupies flow coordinates (0,0)-(680,260); with jsdom's identity
    // viewport a drop at client (200,100) lands inside it.
    dropOnCanvas(canvas, 'ubuntu', 200, 100);

    expect(screen.getByText('Create Ubuntu Node')).toBeInTheDocument();

    fireEvent.change(screen.getByPlaceholderText('e.g. server-1'), { target: { value: 'web-1' } });
    fireEvent.click(screen.getByRole('button', { name: 'Create Node' }));

    await waitFor(() => expect(screen.getByText('A node named "web-1" already exists in this project.')).toBeInTheDocument());
    expect(fetchMock.mock.calls.some(c => (c[0] as string).endsWith('/containers') && (c[1] as RequestInit | undefined)?.method === 'POST')).toBe(false);
  });

  it('mounts the learning panel from the topbar button and unmounts it on close, touching /api/learning only while open', async () => {
    const fetchMock = buildFetchMock({ containers: [], networkConfig: { vpcConfig: validVpcConfig, subnets: [], nodeSubnetMap: {}, nodeSecurityGroups: {}, nodeIpMap: {} } });
    await renderCanvasPage(fetchMock);

    // Closed panel = strictly unchanged canvas: not mounted, zero learning fetches.
    expect(screen.queryByTitle('Close panel')).not.toBeInTheDocument();
    expect(fetchMock.mock.calls.some(c => (c[0] as string).includes('/api/learning'))).toBe(false);

    fireEvent.click(screen.getByRole('button', { name: /Learning/ }));
    expect(screen.getByTitle('Close panel')).toBeInTheDocument();
    await waitFor(() =>
      expect(fetchMock.mock.calls.some(c => (c[0] as string).includes('/api/learning/roadmaps'))).toBe(true)
    );

    fireEvent.click(screen.getByTitle('Close panel'));
    expect(screen.queryByTitle('Close panel')).not.toBeInTheDocument();
  });
});
