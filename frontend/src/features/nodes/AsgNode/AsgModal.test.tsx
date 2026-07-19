import '../../../i18n';
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import AsgModal from './AsgModal';
import { mockFetchResponses } from '../../../test-utils/mockFetchSequence';
import type { ContainerData } from '../../../shared/types';

const template: ContainerData = { id: 'tpl-1', name: 'web-1', state: 'running', status: 'Up', type: 'ubuntu' };
const instance: ContainerData = {
  id: 'inst-1',
  name: 'asg-asg-1-instance-abcd',
  state: 'running',
  status: 'Up',
  type: 'ubuntu',
  asgId: 'asg-1',
  isAsgInstance: true,
};

const config = {
  subnets: [{ id: 's1', name: 'subnet-1', type: 'public' }],
  asgs: {
    'asg-1': { desiredCapacity: 2, minCapacity: 1, maxCapacity: 4, parentId: 'tpl-1', subnetIds: ['s1'] },
  },
};

function renderModal(overrides: { containers?: ContainerData[]; onSaveConfig?: () => Promise<void> } = {}) {
  const onSaveConfig = vi.fn(overrides.onSaveConfig ?? (() => Promise.resolve()));
  const onRefreshContainers = vi.fn().mockResolvedValue(undefined);
  render(
    <AsgModal
      asgId="asg-1"
      nodeName="my-asg"
      projectId="p1"
      config={config}
      containers={overrides.containers ?? [template, instance]}
      onClose={vi.fn()}
      onSaveConfig={onSaveConfig}
      onRefreshContainers={onRefreshContainers}
    />
  );
  return { onSaveConfig, onRefreshContainers };
}

/** The Save button only shows when the config changed: bump Desired Instances via its stepper. */
function bumpDesiredCapacity() {
  const plusButtons = screen.getAllByRole('button', { name: '+' });
  fireEvent.click(plusButtons[plusButtons.length - 1]);
}

describe('AsgModal error surfacing', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('shows the backend error message when the scale request is rejected', async () => {
    mockFetchResponses([
      { ok: false, json: { error: 'Desired capacity must be between 0 and 10.', code: 'INVALID_CAPACITY' } },
    ]);
    renderModal();

    bumpDesiredCapacity();
    fireEvent.click(screen.getByRole('button', { name: /Save Changes/i }));

    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent('Desired capacity must be between 0 and 10.');
  });

  it('shows no error and refreshes containers when the scale request succeeds', async () => {
    mockFetchResponses([{ ok: true, json: [] }]);
    const { onSaveConfig, onRefreshContainers } = renderModal();

    bumpDesiredCapacity();
    fireEvent.click(screen.getByRole('button', { name: /Save Changes/i }));

    await waitFor(() => expect(onRefreshContainers).toHaveBeenCalled());
    expect(onSaveConfig).toHaveBeenCalled();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('clears the previous error when a retry succeeds', async () => {
    mockFetchResponses([
      { ok: false, json: { error: 'Desired capacity must be between 0 and 10.', code: 'INVALID_CAPACITY' } },
      { ok: true, json: [] },
    ]);
    renderModal();

    bumpDesiredCapacity();
    fireEvent.click(screen.getByRole('button', { name: /Save Changes/i }));
    await screen.findByRole('alert');

    fireEvent.click(screen.getByRole('button', { name: /Save Changes/i }));

    await waitFor(() => expect(screen.queryByRole('alert')).not.toBeInTheDocument());
  });

  it('shows the backend error message when stopping the ASG fails', async () => {
    mockFetchResponses([{ ok: false, json: { error: 'Project configuration not found' } }]);
    renderModal();

    fireEvent.click(screen.getByRole('button', { name: /^Stop$/i }));

    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent('Project configuration not found');
  });

  it('falls back to a generic message when the error response has no JSON body', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({ ok: false, json: () => Promise.reject(new Error('no body')) } as unknown as Response)
    );
    renderModal();

    bumpDesiredCapacity();
    fireEvent.click(screen.getByRole('button', { name: /Save Changes/i }));

    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent('The request failed. Please try again.');
  });

  it('shows the config-save rejection message when onSaveConfig fails', async () => {
    mockFetchResponses([]);
    renderModal({
      onSaveConfig: () =>
        Promise.reject(new Error('ASG "asg-1": maxCapacity must be a whole number between 1 and 10.')),
    });

    bumpDesiredCapacity();
    fireEvent.click(screen.getByRole('button', { name: /Save Changes/i }));

    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent('maxCapacity must be a whole number between 1 and 10.');
  });

  it('shows the backend error message when the deploy request is rejected', async () => {
    mockFetchResponses([
      { ok: false, json: { error: 'Desired capacity must be between 1 and 10.', code: 'INVALID_CAPACITY' } },
    ]);
    renderModal({ containers: [template] });

    fireEvent.click(screen.getByRole('button', { name: /Save & Deploy/i }));

    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent('Desired capacity must be between 1 and 10.');
  });
});
